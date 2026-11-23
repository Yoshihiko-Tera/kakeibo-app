import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Copy,
  CreditCard,
  FileSpreadsheet,
  ImagePlus,
  Link2,
  Loader2,
  PenLine,
  PieChart,
  Receipt,
  RefreshCw,
  Settings,
  Smartphone,
  Sparkles,
  Trash2,
  User,
  UserPlus,
  Wallet,
} from "lucide-react";
import {
  AnalyzeResponse,
  DEFAULT_MEMBERS,
  EXPENSE_CATEGORIES,
  HouseholdScope,
  INCOME_CATEGORIES,
  MeResponse,
  ParsedTransaction,
  Payer,
  PaymentMethod,
  SaveTransactionsResponse,
  SourceHint,
  SummaryResponse,
  TransactionType,
  UserProfile,
} from "../shared/types";
import { TransactionCard } from "./components/TransactionCard";
import {
  apiFetch,
  buildShareLink,
  clearStoredGasConfig,
  getStoredGasConfig,
  importGasConfigFromUrl,
  saveStoredGasConfig,
} from "./utils/api";
import { compressImageToBase64, getTodayLocalISO } from "./utils/image";

type Tab = "scan" | "manual" | "summary" | "settings";

const HINT_OPTIONS: {
  value: SourceHint;
  label: string;
  icon: typeof Sparkles;
}[] = [
  { value: "auto", label: "自動判別", icon: Sparkles },
  { value: "receipt", label: "レシート", icon: Receipt },
  { value: "credit_card", label: "クレカ明細", icon: CreditCard },
  { value: "paypay", label: "PayPay", icon: Smartphone },
  { value: "income", label: "給与・収入", icon: Wallet },
];

export function App() {
  const [tab, setTab] = useState<Tab>("scan");
  const [members, setMembers] = useState<string[]>([...DEFAULT_MEMBERS]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [activePayer, setActivePayer] = useState<Payer>("夫");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState<boolean>(true);
  const [gasConfigured, setGasConfigured] = useState<boolean>(true);

  // スキャン関連
  const [hint, setHint] = useState<SourceHint>("auto");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStatus, setAnalyzeStatus] = useState<string>("");
  const [items, setItems] = useState<ParsedTransaction[]>([]);
  const [aiNotes, setAiNotes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // 手入力フォーム
  const [manualType, setManualType] = useState<TransactionType>("支出");
  const [manualDate, setManualDate] = useState(getTodayLocalISO());
  const [manualCategory, setManualCategory] = useState<string>("食費");
  const [manualTitle, setManualTitle] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualPayment, setManualPayment] = useState<PaymentMethod>("現金");
  const [manualScope, setManualScope] = useState<HouseholdScope>("共通費");
  const [manualMemo, setManualMemo] = useState("");

  // サマリー
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // GAS設定フォーム
  const [gasUrlInput, setGasUrlInput] = useState("");
  const [gasSecretInput, setGasSecretInput] = useState("");

  // ユーザー設定フォーム
  const [settingEmail, setSettingEmail] = useState("");
  const [settingName, setSettingName] = useState("");
  const [savingUser, setSavingUser] = useState(false);

  const loadMe = async () => {
    try {
      const cachedRaw = localStorage.getItem("kakeibo_me_cache");
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as MeResponse;
        setMembers(cached.members);
        setUsers(cached.users);
        setActivePayer(cached.displayName);
        setUserEmail(cached.email);
        setIsRegistered(cached.isRegistered);
        setGasConfigured(cached.gasConfigured);
      }
    } catch {
      // ignore cache parse error
    }

    try {
      const res = await apiFetch("/api/me");
      const data = (await res.json()) as MeResponse;
      setMembers(data.members);
      setUsers(data.users);
      setActivePayer(data.displayName);
      setUserEmail(data.email);
      setIsRegistered(data.isRegistered);
      setGasConfigured(data.gasConfigured);
      if (data.email && !settingEmail) {
        setSettingEmail(data.email);
      }
      try {
        localStorage.setItem("kakeibo_me_cache", JSON.stringify(data));
      } catch {
        // ignore quota error
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const imported = importGasConfigFromUrl();
    const stored = getStoredGasConfig();
    setGasUrlInput(stored.gasUrl);
    setGasSecretInput(stored.gasSecret);
    if (imported) {
      setFeedback({
        type: "success",
        text: "共有リンクからスプレッドシート接続設定を読み込みました！",
      });
    }
    void loadMe();
  }, []);

  const fetchSummary = async () => {
    setLoadingSummary(true);
    try {
      const res = await apiFetch("/api/summary");
      const data = (await res.json()) as SummaryResponse & { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error || "集計の取得に失敗しました");
      }
      setSummary(data);
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "集計の取得に失敗しました",
      });
    } finally {
      setLoadingSummary(false);
    }
  };

  useEffect(() => {
    if (tab === "summary" && !summary) {
      void fetchSummary();
    }
  }, [tab, summary]);

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    setAnalyzing(true);
    setFeedback(null);
    setAiNotes([]);

    const newItems: ParsedTransaction[] = [];
    const notes: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setAnalyzeStatus(
          files.length > 1
            ? `画像を解析中... (${i + 1} / ${files.length}枚目)`
            : "AIが画像を読み取っています...",
        );

        const { base64, mimeType } = await compressImageToBase64(file);
        const res = await apiFetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: base64,
            mimeType,
            hint,
            today: getTodayLocalISO(),
            defaultPayer: activePayer,
          }),
        });

        const data = (await res.json()) as AnalyzeResponse & { error?: string };
        if (!res.ok || data.error) {
          throw new Error(data.error || "画像の解析に失敗しました");
        }

        newItems.push(...data.items);
        if (data.note) notes.push(data.note);
      }

      if (newItems.length === 0) {
        setFeedback({
          type: "error",
          text: "明細を読み取れませんでした。別の画像や明るい写真でお試しください。",
        });
      } else {
        setItems((prev) => [...prev, ...newItems]);
        setAiNotes(notes);
      }
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "解析エラーが発生しました",
      });
    } finally {
      setAnalyzing(false);
      setAnalyzeStatus("");
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  const duplicateKeysInBatch = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      if (!item.selected) continue;
      counts.set(item.dedupeKey, (counts.get(item.dedupeKey) ?? 0) + 1);
    }
    const dups = new Set<string>();
    for (const [k, count] of counts) {
      if (count > 1) dups.add(k);
    }
    return dups;
  }, [items]);

  const selectedItems = useMemo(
    () => items.filter((item) => item.selected),
    [items],
  );

  const handleUpdateItem = (id: string, patch: Partial<ParsedTransaction>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, ...patch };
        const normTitle = updated.title
          .normalize("NFKC")
          .replace(/[\s　・\-_/.,()（）【】\[\]]+/g, "")
          .toLowerCase()
          .slice(0, 8);
        updated.dedupeKey = `${updated.date}_${Math.round(updated.amount)}_${normTitle}`;
        return updated;
      }),
    );
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSaveSelected = async () => {
    if (selectedItems.length === 0) return;
    setSaving(true);
    setFeedback(null);

    try {
      const payload = selectedItems.map(({ id: _id, selected: _s, ...rest }) => rest);
      const res = await apiFetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload }),
      });

      const data = (await res.json()) as SaveTransactionsResponse & {
        error?: string;
      };
      if (!res.ok || data.error) {
        throw new Error(data.error || "保存に失敗しました");
      }

      setFeedback({
        type: "success",
        text: data.message,
      });
      setItems((prev) => prev.filter((item) => !item.selected));
      setSummary(null);
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "保存中にエラーが発生しました",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Math.max(0, Math.round(Number(manualAmount) || 0));
    if (!manualTitle.trim() || amountNum <= 0) {
      setFeedback({
        type: "error",
        text: "内容と金額（1円以上）を入力してください。",
      });
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const normTitle = manualTitle
        .trim()
        .normalize("NFKC")
        .replace(/[\s　・\-_/.,()（）【】\[\]]+/g, "")
        .toLowerCase()
        .slice(0, 8);

      const res = await apiFetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              date: manualDate,
              type: manualType,
              category: manualCategory,
              title: manualTitle.trim(),
              amount: amountNum,
              paymentMethod: manualPayment,
              source: "手入力",
              payer: activePayer,
              scope: manualScope,
              memo: manualMemo.trim(),
              dedupeKey: `${manualDate}_${amountNum}_${normTitle}`,
            },
          ],
        }),
      });

      const data = (await res.json()) as SaveTransactionsResponse & {
        error?: string;
      };
      if (!res.ok || data.error) {
        throw new Error(data.error || "登録に失敗しました");
      }

      setFeedback({ type: "success", text: data.message });
      setManualTitle("");
      setManualAmount("");
      setManualMemo("");
      setSummary(null);
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "登録中にエラーが発生しました",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGasConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = gasUrlInput.trim();
    if (
      trimmedUrl &&
      !trimmedUrl.startsWith("https://script.google.com/macros/s/")
    ) {
      setFeedback({
        type: "error",
        text: "GAS URL は https://script.google.com/macros/s/ から始まるURLを入力してください。",
      });
      return;
    }
    saveStoredGasConfig(trimmedUrl, gasSecretInput.trim());
    setSummary(null);
    await loadMe();
    setFeedback({
      type: "success",
      text: "スプレッドシート接続設定をこのブラウザに保存しました。",
    });
  };

  const handleClearGasConfig = async () => {
    clearStoredGasConfig();
    setGasUrlInput("");
    setGasSecretInput("");
    setSummary(null);
    await loadMe();
    setFeedback({
      type: "success",
      text: "ブラウザに保存された GAS 設定をクリアしました。",
    });
  };

  const handleCopyShareLink = async () => {
    if (!gasUrlInput.trim()) return;
    const link = buildShareLink(gasUrlInput, gasSecretInput);
    try {
      await navigator.clipboard.writeText(link);
      setFeedback({
        type: "success",
        text: "家族・他端末向けの共有リンクをコピーしました！このリンクを開くだけで同じスプレッドシートに接続できます。",
      });
    } catch {
      setFeedback({
        type: "error",
        text: "クリップボードへのコピーに失敗しました。",
      });
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingEmail.trim() || !settingName.trim()) return;
    setSavingUser(true);
    setFeedback(null);

    try {
      const res = await apiFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: settingEmail.trim(),
          name: settingName.trim(),
        }),
      });
      const data = (await res.json()) as {
        users?: UserProfile[];
        members?: string[];
        message?: string;
        error?: string;
      };
      if (!res.ok || data.error) {
        throw new Error(data.error || "ユーザー保存に失敗しました");
      }
      if (data.users) setUsers(data.users);
      if (data.members) setMembers(data.members);
      if (
        userEmail &&
        settingEmail.trim().toLowerCase() === userEmail.toLowerCase()
      ) {
        setActivePayer(settingName.trim());
        setIsRegistered(true);
      }
      setFeedback({
        type: "success",
        text: data.message || "ユーザー設定を保存しました。",
      });
      setSettingEmail(userEmail ?? "");
      setSettingName("");
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "保存エラー",
      });
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeleteUser = async (email: string) => {
    setSavingUser(true);
    setFeedback(null);
    try {
      const res = await apiFetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as {
        users?: UserProfile[];
        members?: string[];
        message?: string;
        error?: string;
      };
      if (!res.ok || data.error) {
        throw new Error(data.error || "削除に失敗しました");
      }
      if (data.users) setUsers(data.users);
      if (data.members) setMembers(data.members);
      setFeedback({
        type: "success",
        text: data.message || "削除しました。",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "削除エラー",
      });
    } finally {
      setSavingUser(false);
    }
  };

  const cyclePayer = () => {
    if (members.length === 0) return;
    const idx = members.indexOf(activePayer);
    const next = members[(idx + 1) % members.length];
    setActivePayer(next);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* ヘッダー */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-white shadow-xs">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight text-slate-900">
                おうち家計簿
              </h1>
              <p className="text-[11px] text-slate-500">
                {userEmail ? userEmail : "Googleアカウント連携"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={cyclePayer}
            title="タップでデフォルトの支払者を切り替え"
            className="flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800 active:scale-95"
          >
            <User className="h-3.5 w-3.5" />
            担当: {activePayer}
          </button>
        </div>

        {/* タブ */}
        <div className="mx-auto grid max-w-2xl grid-cols-4 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setTab("scan")}
            className={`flex items-center justify-center gap-1 py-2.5 text-xs font-bold transition ${
              tab === "scan"
                ? "border-b-2 border-teal-700 text-teal-700"
                : "text-slate-500"
            }`}
          >
            <Camera className="h-4 w-4" />
            撮る・読む
          </button>
          <button
            type="button"
            onClick={() => setTab("manual")}
            className={`flex items-center justify-center gap-1 py-2.5 text-xs font-bold transition ${
              tab === "manual"
                ? "border-b-2 border-teal-700 text-teal-700"
                : "text-slate-500"
            }`}
          >
            <PenLine className="h-4 w-4" />
            手入力
          </button>
          <button
            type="button"
            onClick={() => setTab("summary")}
            className={`flex items-center justify-center gap-1 py-2.5 text-xs font-bold transition ${
              tab === "summary"
                ? "border-b-2 border-teal-700 text-teal-700"
                : "text-slate-500"
            }`}
          >
            <PieChart className="h-4 w-4" />
            集計
          </button>
          <button
            type="button"
            onClick={() => setTab("settings")}
            className={`flex items-center justify-center gap-1 py-2.5 text-xs font-bold transition ${
              tab === "settings"
                ? "border-b-2 border-teal-700 text-teal-700"
                : "text-slate-500"
            }`}
          >
            <Settings className="h-4 w-4" />
            設定
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-4">
        {/* 初回ログイン案内 */}
        {userEmail && !isRegistered && tab !== "settings" && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-3.5 text-xs text-teal-900">
            <span>
              <strong>{userEmail}</strong> はまだ表示名が未登録です。
            </span>
            <button
              type="button"
              onClick={() => setTab("settings")}
              className="shrink-0 rounded-xl bg-teal-700 px-3 py-1.5 font-bold text-white"
            >
              設定する
            </button>
          </div>
        )}

        {/* GAS未設定案内 */}
        {!gasConfigured && tab !== "settings" && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
            <span>保存先のスプレッドシート（GAS URL）が未設定です。</span>
            <button
              type="button"
              onClick={() => setTab("settings")}
              className="shrink-0 rounded-xl bg-amber-600 px-3 py-1.5 font-bold text-white"
            >
              接続設定へ
            </button>
          </div>
        )}

        {/* 通知バナー */}
        {feedback && (
          <div
            className={`mb-4 flex items-start gap-2 rounded-2xl border p-3.5 text-sm font-medium ${
              feedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {feedback.type === "success" && (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* タブ1: 撮る・読む */}
        {tab === "scan" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <p className="mb-2.5 text-xs font-bold text-slate-600">
                1. 読み取るものの種類（迷ったら「自動判別」）
              </p>
              <div className="flex flex-wrap gap-2">
                {HINT_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = hint === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setHint(opt.value)}
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                        active
                          ? "bg-teal-700 text-white shadow-xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <p className="mb-2.5 mt-4 text-xs font-bold text-slate-600">
                2. 写真・スクショを選ぶ
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={analyzing}
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-teal-300 bg-teal-50/70 py-5 text-teal-800 transition active:scale-98 disabled:opacity-50"
                >
                  <Camera className="h-7 w-7" />
                  <span className="text-xs font-bold">カメラで撮る</span>
                </button>
                <button
                  type="button"
                  disabled={analyzing}
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 py-5 text-slate-700 transition active:scale-98 disabled:opacity-50"
                >
                  <ImagePlus className="h-7 w-7" />
                  <span className="text-xs font-bold">
                    スクショ・画像（複数可）
                  </span>
                </button>
              </div>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => void handleFilesSelected(e.target.files)}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => void handleFilesSelected(e.target.files)}
              />

              {analyzing && (
                <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-teal-50 py-3 text-sm font-bold text-teal-800">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {analyzeStatus}
                </div>
              )}
            </div>

            {aiNotes.length > 0 && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
                <p className="font-bold">AIからのメモ:</p>
                {aiNotes.map((n, i) => (
                  <p key={i} className="mt-1">
                    {n}
                  </p>
                ))}
              </div>
            )}

            {items.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-bold text-slate-700">
                    読み取り結果（{selectedItems.length} / {items.length}件 選択中）
                  </h2>
                  <button
                    type="button"
                    onClick={() => setItems([])}
                    className="text-xs font-medium text-slate-500 hover:text-rose-600"
                  >
                    すべてクリア
                  </button>
                </div>

                {items.map((item) => (
                  <TransactionCard
                    key={item.id}
                    item={item}
                    members={members}
                    isDuplicateInBatch={
                      item.selected && duplicateKeysInBatch.has(item.dedupeKey)
                    }
                    onChange={handleUpdateItem}
                    onRemove={handleRemoveItem}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* タブ2: 手入力 */}
        {tab === "manual" && (
          <form
            onSubmit={(e) => void handleManualSubmit(e)}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"
          >
            <div className="flex rounded-xl bg-slate-100 p-1">
              {(["支出", "収入"] as TransactionType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setManualType(t);
                    setManualCategory(t === "収入" ? "給与" : "食費");
                  }}
                  className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                    manualType === t
                      ? t === "収入"
                        ? "bg-emerald-600 text-white"
                        : "bg-rose-600 text-white"
                      : "text-slate-600"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">
                  日付
                </label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">
                  金額（円）
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="1000"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-right text-sm font-bold"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">
                内容・店名
              </label>
              <input
                type="text"
                placeholder="例: 自販機コーヒー、スーパー〇〇"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">
                  カテゴリ
                </label>
                <select
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs"
                >
                  {(manualType === "収入"
                    ? INCOME_CATEGORIES
                    : EXPENSE_CATEGORIES
                  ).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">
                  支払方法
                </label>
                <select
                  value={manualPayment}
                  onChange={(e) =>
                    setManualPayment(e.target.value as PaymentMethod)
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs"
                >
                  {(
                    [
                      "現金",
                      "PayPay",
                      "クレカ",
                      "銀行振込",
                      "電子マネー",
                      "その他",
                    ] as PaymentMethod[]
                  ).map((pm) => (
                    <option key={pm} value={pm}>
                      {pm}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">
                  区分
                </label>
                <select
                  value={manualScope}
                  onChange={(e) =>
                    setManualScope(e.target.value as HouseholdScope)
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs"
                >
                  {(["共通費", "立替", "個人"] as HouseholdScope[]).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">
                メモ（任意）
              </label>
              <input
                type="text"
                value={manualMemo}
                onChange={(e) => setManualMemo(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 py-3.5 text-sm font-bold text-white shadow-sm transition active:scale-98 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              スプレッドシートに記録（担当: {activePayer}）
            </button>
          </form>
        )}

        {/* タブ3: 今月の集計 */}
        {tab === "summary" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-700">
                {summary?.month ?? "今月"}のサマリー
              </h2>
              <button
                type="button"
                onClick={() => void fetchSummary()}
                disabled={loadingSummary}
                className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loadingSummary ? "animate-spin" : ""}`}
                />
                更新
              </button>
            </div>

            {summary && !summary.configured && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                スプレッドシート（GAS URL）が未設定です。「設定」タブから自分の GAS Webアプリ URL を登録してください。
              </div>
            )}

            {summary && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                    <p className="text-xs font-medium text-slate-500">
                      今月の支出
                    </p>
                    <p className="mt-1 text-xl font-bold text-rose-600">
                      ¥{summary.totalExpense.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                    <p className="text-xs font-medium text-slate-500">
                      今月の収入
                    </p>
                    <p className="mt-1 text-xl font-bold text-emerald-600">
                      ¥{summary.totalIncome.toLocaleString()}
                    </p>
                  </div>
                </div>

                {Object.keys(summary.byPayer).length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                    <h3 className="mb-2.5 text-xs font-bold text-slate-600">
                      メンバー別の支出
                    </h3>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                      {Object.entries(summary.byPayer).map(([payer, total]) => (
                        <div
                          key={payer}
                          className="rounded-xl bg-slate-50 px-3 py-2.5"
                        >
                          <p className="text-[11px] font-medium text-slate-500">
                            {payer}
                          </p>
                          <p className="mt-0.5 text-sm font-bold text-slate-800">
                            ¥{total.toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                  <h3 className="mb-3 text-xs font-bold text-slate-600">
                    直近の登録
                  </h3>
                  {summary.recentItems.length === 0 ? (
                    <p className="text-xs text-slate-400">
                      まだ今月のデータがありません。
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {summary.recentItems.map((row, idx) => (
                        <li
                          key={idx}
                          className="flex items-center justify-between py-2.5 text-xs"
                        >
                          <div>
                            <p className="font-bold text-slate-800">
                              {row.title}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {row.date} ・ {row.category} ・ {row.payer}
                            </p>
                          </div>
                          <span
                            className={`font-bold ${
                              row.type === "収入"
                                ? "text-emerald-600"
                                : "text-slate-900"
                            }`}
                          >
                            {row.type === "収入" ? "+" : ""}¥
                            {row.amount.toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* タブ4: 設定 */}
        {tab === "settings" && (
          <div className="space-y-4">
            {/* GAS接続設定 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="mb-1 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-teal-700" />
                <h2 className="text-sm font-bold text-slate-800">
                  保存先スプレッドシート（GAS）設定
                </h2>
              </div>
              <p className="mb-4 text-xs text-slate-500">
                ご自身の Google スプレッドシートにデプロイした GAS Webアプリ URL を登録すると、そのスプレッドシートへ保存・集計されます（設定はこのブラウザに保存されます）。
              </p>

              <form
                onSubmit={(e) => void handleSaveGasConfig(e)}
                className="space-y-3"
              >
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">
                    GAS Webアプリ URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://script.google.com/macros/s/.../exec"
                    value={gasUrlInput}
                    onChange={(e) => setGasUrlInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">
                    合言葉（GAS_SECRET）
                  </label>
                  <input
                    type="password"
                    placeholder="GASのスクリプトプロパティに設定した文字列"
                    value={gasSecretInput}
                    onChange={(e) => setGasSecretInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="submit"
                    className="flex-1 rounded-2xl bg-teal-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs active:scale-98"
                  >
                    設定を保存して接続
                  </button>
                  {gasUrlInput && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleCopyShareLink()}
                        className="flex items-center gap-1 rounded-2xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-xs font-bold text-teal-800"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        共有リンク
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleClearGasConfig()}
                        className="rounded-2xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-500"
                      >
                        クリア
                      </button>
                    </>
                  )}
                </div>
              </form>
            </div>

            {/* ユーザー設定 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <h2 className="mb-1 text-sm font-bold text-slate-800">
                Googleアカウントと表示名の紐づけ
              </h2>
              <p className="mb-4 text-xs text-slate-500">
                Cloudflare Access で Googleログインしたメールアドレスと、家計簿上の表示名（例：パパ、ママ、太郎など）をスプレッドシートの「ユーザー」シートに保存します。
              </p>

              <form
                onSubmit={(e) => void handleSaveUser(e)}
                className="space-y-3"
              >
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">
                    Googleメールアドレス
                  </label>
                  <input
                    type="email"
                    placeholder="example@gmail.com"
                    value={settingEmail}
                    onChange={(e) => setSettingEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">
                    表示名（支払/受取者名）
                  </label>
                  <input
                    type="text"
                    placeholder="例: パパ / ママ / 太郎"
                    value={settingName}
                    onChange={(e) => setSettingName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingUser || !gasConfigured}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 py-3 text-sm font-bold text-white shadow-sm transition active:scale-98 disabled:opacity-50"
                >
                  {savingUser ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  登録・更新する
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <h3 className="mb-3 text-xs font-bold text-slate-600">
                登録済みの家族メンバー（{users.length}人）
              </h3>
              {users.length === 0 ? (
                <p className="text-xs text-slate-400">
                  まだメンバーが登録されていません（未登録時は「{DEFAULT_MEMBERS.join("・")}」が表示されます）。
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <li
                      key={u.email}
                      className="flex items-center justify-between py-2.5 text-xs"
                    >
                      <div>
                        <p className="font-bold text-slate-800">{u.name}</p>
                        <p className="text-[11px] text-slate-500">{u.email}</p>
                      </div>
                      <button
                        type="button"
                        disabled={savingUser}
                        onClick={() => void handleDeleteUser(u.email)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                        aria-label="削除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </main>

      {/* 下部固定バー（読み取り結果があるとき） */}
      {tab === "scan" && items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto max-w-2xl">
            <button
              type="button"
              disabled={saving || selectedItems.length === 0}
              onClick={() => void handleSaveSelected()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 py-3.5 text-sm font-bold text-white shadow-md transition active:scale-98 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              {selectedItems.length}件をスプレッドシートに保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;
