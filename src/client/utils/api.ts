const STORAGE_GAS_URL = "kakeibo_gas_url";
const STORAGE_GAS_SECRET = "kakeibo_gas_secret";

export interface StoredGasConfig {
  gasUrl: string;
  gasSecret: string;
}

export function getStoredGasConfig(): StoredGasConfig {
  try {
    return {
      gasUrl: localStorage.getItem(STORAGE_GAS_URL) ?? "",
      gasSecret: localStorage.getItem(STORAGE_GAS_SECRET) ?? "",
    };
  } catch {
    return { gasUrl: "", gasSecret: "" };
  }
}

export function saveStoredGasConfig(gasUrl: string, gasSecret: string): void {
  localStorage.setItem(STORAGE_GAS_URL, gasUrl.trim());
  localStorage.setItem(STORAGE_GAS_SECRET, gasSecret.trim());
}

export function clearStoredGasConfig(): void {
  localStorage.removeItem(STORAGE_GAS_URL);
  localStorage.removeItem(STORAGE_GAS_SECRET);
}

/**
 * 共有リンク (?gasUrl=...&gasSecret=...) で開かれた場合、自動で localStorage に取り込み URL を綺麗にする
 */
export function importGasConfigFromUrl(): boolean {
  try {
    const url = new URL(window.location.href);
    const gasUrl = url.searchParams.get("gasUrl");
    if (!gasUrl) return false;

    const gasSecret = url.searchParams.get("gasSecret") ?? "";
    saveStoredGasConfig(gasUrl, gasSecret);

    url.searchParams.delete("gasUrl");
    url.searchParams.delete("gasSecret");
    window.history.replaceState({}, "", url.toString());
    return true;
  } catch {
    return false;
  }
}

export function buildShareLink(gasUrl: string, gasSecret: string): string {
  const url = new URL(window.location.origin);
  url.searchParams.set("gasUrl", gasUrl.trim());
  if (gasSecret.trim()) {
    url.searchParams.set("gasSecret", gasSecret.trim());
  }
  return url.toString();
}

export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const { gasUrl, gasSecret } = getStoredGasConfig();
  const headers = new Headers(init.headers);
  if (gasUrl) {
    headers.set("X-Gas-Webhook-Url", gasUrl);
    if (gasSecret) {
      headers.set("X-Gas-Secret", gasSecret);
    }
  }
  return fetch(input, { ...init, headers });
}
