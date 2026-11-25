export type TransactionType = "支出" | "収入";

export type Payer = string;

export type HouseholdScope = "共通費" | "立替" | "個人";

export type PaymentMethod =
  | "クレカ"
  | "PayPay"
  | "現金"
  | "銀行振込"
  | "電子マネー"
  | "その他";

export type InputSource =
  | "レシート"
  | "クレカ明細"
  | "PayPay"
  | "給与・収入明細"
  | "手入力";

export type SourceHint =
  | "auto"
  | "receipt"
  | "credit_card"
  | "paypay"
  | "income";

export const EXPENSE_CATEGORIES = [
  "食費",
  "外食",
  "日用品",
  "交通費",
  "医療費",
  "娯楽・交際",
  "美容・衣服",
  "光熱費・通信",
  "住居",
  "子ども・教育",
  "その他",
] as const;

export const INCOME_CATEGORIES = [
  "給与",
  "賞与",
  "副収入",
  "還付・ポイント",
  "その他収入",
] as const;

export const ALL_CATEGORIES = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
] as const;

export const DEFAULT_MEMBERS = ["夫", "妻", "共通"] as const;

export interface UserProfile {
  email: string;
  name: string;
  updatedAt?: string;
}

export interface ParsedTransaction {
  id: string;
  selected: boolean;
  date: string; // YYYY-MM-DD
  type: TransactionType;
  category: string;
  title: string;
  amount: number;
  paymentMethod: PaymentMethod;
  source: InputSource;
  payer: Payer;
  scope: HouseholdScope;
  memo: string;
  dedupeKey: string;
}

export interface AnalyzeRequest {
  imageBase64: string;
  mimeType: string;
  hint: SourceHint;
  today: string; // YYYY-MM-DD
  defaultPayer: Payer;
}

export interface AnalyzeResponse {
  items: ParsedTransaction[];
  note?: string;
}

export interface SaveTransactionsRequest {
  items: Omit<ParsedTransaction, "id" | "selected">[];
}

export interface SaveTransactionsResponse {
  savedCount: number;
  skippedCount: number;
  skippedKeys: string[];
  message: string;
}

export type SummaryScopeFilter = "すべて" | "共通費" | "個人";

export interface SummaryTransactionItem {
  rowNumber: number;
  date: string; // YYYY-MM-DD
  type: TransactionType;
  category: string;
  title: string;
  amount: number;
  paymentMethod: PaymentMethod;
  payer: string;
  scope: HouseholdScope;
  source: string;
  memo: string;
  dedupeKey: string;
}

export interface CategoryBreakdownItem {
  category: string;
  amount: number;
  percentage: number;
}

export interface SummaryResponse {
  month: string;
  scope: SummaryScopeFilter;
  totalIncome: number;
  totalExpense: number;
  byPayer: Record<string, number>;
  categoryBreakdown: CategoryBreakdownItem[];
  items: SummaryTransactionItem[];
  configured: boolean;
}

export interface UpdateTransactionRequest {
  rowNumber: number;
  date: string;
  type: TransactionType;
  category: string;
  title: string;
  amount: number;
  scope: HouseholdScope;
  payer: string;
  memo: string;
}

export interface DeleteTransactionRequest {
  rowNumber: number;
}

export interface MeResponse {
  email: string | null;
  displayName: string;
  isRegistered: boolean;
  members: string[];
  users: UserProfile[];
  gasConfigured: boolean;
}
