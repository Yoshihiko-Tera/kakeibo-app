import {
  ALL_CATEGORIES,
  AnalyzeRequest,
  InputSource,
  ParsedTransaction,
  PaymentMethod,
  Payer,
  SourceHint,
  TransactionType,
} from "../shared/types";

interface GeminiRawItem {
  date: string;
  type: TransactionType;
  category: string;
  title: string;
  amount: number;
  paymentMethod: PaymentMethod;
  source: InputSource;
  memo?: string;
}

interface GeminiResponsePayload {
  items: GeminiRawItem[];
  note?: string;
}

const HINT_INSTRUCTIONS: Record<SourceHint, string> = {
  auto: "画像の種類（レシート、クレジットカード明細、PayPay履歴、給与明細・振込通知など）を自動判別して抽出してください。",
  receipt:
    "これはレシートまたは領収書の写真です。原則として1会計につき1件の支出として合計金額（税込）を抽出してください。支払方法が印字されていれば反映してください。",
  credit_card:
    "これはクレジットカードの利用明細画面のスクリーンショットです。画面に写っているすべての利用明細を1行ずつ配列で抽出してください。支払方法は「クレカ」、入力元は「クレカ明細」にしてください。",
  paypay:
    "これはPayPayの取引履歴画面のスクリーンショットです。画面に写っている支払い・送金・チャージ等の明細を1行ずつ抽出してください。チャージやポイント還元など実質的な支出でないものは除外するかメモに明記してください。支払方法は「PayPay」、入力元は「PayPay」にしてください。",
  income:
    "これは給与明細、賞与明細、または銀行振込・収入通知の画像です。収入として記録すべき金額（給与明細の場合は総支給ではなく「差引支給額／手取り額」を優先）を抽出し、収支は「収入」、入力元は「給与・収入明細」にしてください。",
};

export function buildDedupeKey(date: string, amount: number, title: string): string {
  const normalizedTitle = title
    .normalize("NFKC")
    .replace(/[\s　・\-_/.,()（）【】\[\]]+/g, "")
    .toLowerCase()
    .slice(0, 8);
  return `${date}_${Math.round(amount)}_${normalizedTitle}`;
}

export async function analyzeImageWithGemini(
  apiKey: string,
  req: AnalyzeRequest,
): Promise<{ items: ParsedTransaction[]; note?: string }> {
  const categoriesList = ALL_CATEGORIES.join("、");
  const prompt = `あなたは日本の夫婦向け家計簿アプリのAIアシスタントです。
添付された画像から収支データを読み取り、JSONで返してください。

【基準日】
今日は ${req.today} です。
明細に「年」が書かれていない場合（例: 11/23）は、基準日を元に正しい年（YYYY-MM-DD）を補完してください（基準日より未来にならないよう年跨ぎに注意）。

【入力ヒント】
${HINT_INSTRUCTIONS[req.hint]}

【抽出ルール】
1. 金額(amount)は必ず正の整数（円）にしてください。
2. 収支(type)は「支出」または「収入」のいずれかにしてください。
3. カテゴリ(category)は次の中から最も適切なものを1つ選んでください: ${categoriesList}
4. 店名・内容(title)は分かりやすく簡潔に（20文字以内目安）記載してください。半角カナは全角に直してください。
5. 支払方法(paymentMethod)は「クレカ」「PayPay」「現金」「銀行振込」「電子マネー」「その他」から選んでください。
6. 入力元(source)は「レシート」「クレカ明細」「PayPay」「給与・収入明細」「手入力」から選んでください。
7. 画像が不鮮明で読めない項目や注意点があれば note に簡潔に書いてください。`;

  const responseSchema = {
    type: "OBJECT",
    properties: {
      items: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            date: { type: "STRING", description: "YYYY-MM-DD形式の日付" },
            type: { type: "STRING", enum: ["支出", "収入"] },
            category: { type: "STRING" },
            title: { type: "STRING" },
            amount: { type: "INTEGER" },
            paymentMethod: {
              type: "STRING",
              enum: ["クレカ", "PayPay", "現金", "銀行振込", "電子マネー", "その他"],
            },
            source: {
              type: "STRING",
              enum: ["レシート", "クレカ明細", "PayPay", "給与・収入明細", "手入力"],
            },
            memo: { type: "STRING" },
          },
          required: ["date", "type", "category", "title", "amount", "paymentMethod", "source"],
        },
      },
      note: { type: "STRING" },
    },
    required: ["items"],
  };

  const models = [
    "gemini-4-hydrogen",
    "gemini-3.8-flash",
    "gemini-4-argon",
  ];

  const requestBody = JSON.stringify({
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: req.mimeType,
              data: req.imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0.1,
    },
  });

  interface GeminiApiResponse {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  }

  let data: GeminiApiResponse | null = null;
  let lastError = "";

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
          signal: AbortSignal.timeout(20000),
        });
      } catch (fetchErr) {
        lastError = `通信タイムアウトまたはネットワークエラー (${model})`;
        break;
      }

      if (res.ok) {
        data = (await res.json()) as GeminiApiResponse;
        break;
      }

      const errText = await res.text();
      lastError = `Gemini APIエラー (${model} / ${res.status}): ${errText}`;

      // 404（モデル非対応）は次のモデルへ即フォールバック
      if (res.status === 404) {
        break;
      }
      // 503/429（混雑）は1回だけ1.5秒待ってリトライ、ダメなら次のモデルへ
      if ((res.status === 503 || res.status === 429) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      if (res.status === 503 || res.status === 429) {
        break;
      }
      // 400/401/403 などの設定・入力エラーは即終了
      throw new Error(lastError);
    }

    if (data) break;
  }

  if (!data) {
    throw new Error(lastError || "すべてのGeminiモデルで解析に失敗しました。");
  }

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error("Gemini APIから解析結果を取得できませんでした。");
  }

  const parsed = JSON.parse(rawText) as GeminiResponsePayload;
  const payer: Payer = req.defaultPayer || "夫";

  const items: ParsedTransaction[] = (parsed.items ?? []).map((item, idx) => {
    const cleanDate = /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : req.today;
    const cleanAmount = Math.max(0, Math.round(Number(item.amount) || 0));
    const cleanTitle = (item.title || "不明").trim();

    return {
      id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      selected: true,
      date: cleanDate,
      type: item.type === "収入" ? "収入" : "支出",
      category: item.category || (item.type === "収入" ? "その他収入" : "その他"),
      title: cleanTitle,
      amount: cleanAmount,
      paymentMethod: item.paymentMethod || "その他",
      source: item.source || "レシート",
      payer,
      scope: "共通費",
      memo: item.memo || "",
      dedupeKey: buildDedupeKey(cleanDate, cleanAmount, cleanTitle),
    };
  });

  return { items, note: parsed.note };
}
