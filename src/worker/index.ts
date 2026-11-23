import { Hono, Context } from "hono";
import {
  AnalyzeRequest,
  DEFAULT_MEMBERS,
  MeResponse,
  SaveTransactionsRequest,
  SaveTransactionsResponse,
  SummaryResponse,
  UserProfile,
} from "../shared/types";
import { analyzeImageWithGemini, buildDedupeKey } from "./gemini";

interface Bindings {
  ASSETS: Fetcher;
  GEMINI_API_KEY: string;
  GAS_WEBHOOK_URL?: string;
  GAS_SECRET?: string;
}

const app = new Hono<{ Bindings: Bindings }>();

function resolveGasConfig(c: Context<{ Bindings: Bindings }>): {
  url: string | null;
  secret: string;
  error?: string;
} {
  const customUrl = c.req.header("X-Gas-Webhook-Url")?.trim();
  const customSecret = c.req.header("X-Gas-Secret")?.trim() ?? "";

  if (customUrl) {
    if (!customUrl.startsWith("https://script.google.com/macros/s/")) {
      return {
        url: null,
        secret: "",
        error:
          "GAS URL は https://script.google.com/macros/s/ から始まる正しいウェブアプリURLを指定してください。",
      };
    }
    return { url: customUrl, secret: customSecret };
  }

  if (c.env.GAS_WEBHOOK_URL) {
    return {
      url: c.env.GAS_WEBHOOK_URL,
      secret: c.env.GAS_SECRET ?? "",
    };
  }

  return { url: null, secret: "" };
}

async function callGas<T>(
  gasUrl: string,
  gasSecret: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(gasUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: gasSecret,
      ...payload,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GAS連携エラー (${res.status}): ${text}`);
  }
  const data = (await res.json()) as T & { error?: string };
  if (data.error) {
    throw new Error(data.error);
  }
  return data;
}

function buildMembersList(users: UserProfile[]): string[] {
  if (users.length === 0) {
    return [...DEFAULT_MEMBERS];
  }
  const names = Array.from(new Set(users.map((u) => u.name)));
  if (!names.includes("共通")) {
    names.push("共通");
  }
  return names;
}

app.get("/api/health", (c) => {
  return c.json({ ok: true });
});

app.get("/api/me", async (c) => {
  const email =
    c.req.header("Cf-Access-Authenticated-User-Email") ??
    c.req.header("X-Dev-Email") ??
    null;

  const gas = resolveGasConfig(c);
  const gasConfigured = Boolean(gas.url);
  let users: UserProfile[] = [];

  if (gas.url) {
    try {
      const data = await callGas<{ users: UserProfile[] }>(gas.url, gas.secret, {
        action: "get_users",
      });
      users = data.users ?? [];
    } catch {
      users = [];
    }
  }

  const normalizedEmail = email ? email.trim().toLowerCase() : null;
  const matched = normalizedEmail
    ? users.find((u) => u.email.toLowerCase() === normalizedEmail)
    : undefined;

  const members = buildMembersList(users);
  const response: MeResponse = {
    email: normalizedEmail,
    displayName: matched?.name ?? members[0] ?? "夫",
    isRegistered: Boolean(matched),
    members,
    users,
    gasConfigured,
  };
  return c.json(response);
});

app.post("/api/users", async (c) => {
  const gas = resolveGasConfig(c);
  if (gas.error) return c.json({ error: gas.error }, 400);
  if (!gas.url) {
    return c.json(
      { error: "保存先のスプレッドシート（GAS URL）が未設定です。設定タブから登録してください。" },
      400,
    );
  }

  try {
    const body = await c.req.json<{ email: string; name: string }>();
    const data = await callGas<{ users: UserProfile[]; message: string }>(
      gas.url,
      gas.secret,
      {
        action: "save_user",
        email: body.email,
        name: body.name,
      },
    );
    return c.json({
      users: data.users,
      members: buildMembersList(data.users),
      message: data.message,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ユーザー保存エラー";
    return c.json({ error: message }, 400);
  }
});

app.delete("/api/users", async (c) => {
  const gas = resolveGasConfig(c);
  if (gas.error) return c.json({ error: gas.error }, 400);
  if (!gas.url) {
    return c.json({ error: "保存先のスプレッドシート（GAS URL）が未設定です。" }, 400);
  }

  try {
    const body = await c.req.json<{ email: string }>();
    const data = await callGas<{ users: UserProfile[]; message: string }>(
      gas.url,
      gas.secret,
      {
        action: "delete_user",
        email: body.email,
      },
    );
    return c.json({
      users: data.users,
      members: buildMembersList(data.users),
      message: data.message,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ユーザー削除エラー";
    return c.json({ error: message }, 400);
  }
});

app.post("/api/analyze", async (c) => {
  if (!c.env.GEMINI_API_KEY) {
    return c.json(
      { error: "GEMINI_API_KEY が設定されていません。.dev.vars または Workers Secrets を確認してください。" },
      500,
    );
  }

  try {
    const body = await c.req.json<AnalyzeRequest>();
    if (!body.imageBase64 || !body.mimeType) {
      return c.json({ error: "画像データが不足しています。" }, 400);
    }

    const result = await analyzeImageWithGemini(c.env.GEMINI_API_KEY, body);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "画像解析中にエラーが発生しました。";
    return c.json({ error: message }, 500);
  }
});

app.post("/api/transactions", async (c) => {
  const gas = resolveGasConfig(c);
  if (gas.error) return c.json({ error: gas.error }, 400);
  if (!gas.url) {
    return c.json(
      { error: "保存先のスプレッドシート（GAS URL）が未設定です。設定タブから登録してください。" },
      400,
    );
  }

  try {
    const body = await c.req.json<SaveTransactionsRequest>();
    if (!body.items || body.items.length === 0) {
      return c.json({ error: "登録する明細がありません。" }, 400);
    }

    const itemsWithKeys = body.items.map((item) => ({
      ...item,
      dedupeKey: item.dedupeKey || buildDedupeKey(item.date, item.amount, item.title),
    }));

    const result = await callGas<SaveTransactionsResponse>(gas.url, gas.secret, {
      action: "append",
      items: itemsWithKeys,
    });
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "保存中にエラーが発生しました。";
    return c.json({ error: message }, 500);
  }
});

app.get("/api/summary", async (c) => {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const gas = resolveGasConfig(c);
  if (gas.error) return c.json({ error: gas.error }, 400);

  if (!gas.url) {
    const empty: SummaryResponse = {
      month,
      totalIncome: 0,
      totalExpense: 0,
      byPayer: {},
      recentItems: [],
      configured: false,
    };
    return c.json(empty);
  }

  try {
    const result = await callGas<Omit<SummaryResponse, "configured">>(
      gas.url,
      gas.secret,
      {
        action: "summary",
        month,
      },
    );
    return c.json({ ...result, configured: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "サマリー取得エラー";
    return c.json({ error: message }, 500);
  }
});

app.all("*", (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
