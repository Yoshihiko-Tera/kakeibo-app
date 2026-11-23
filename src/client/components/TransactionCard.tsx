import {
  ALL_CATEGORIES,
  EXPENSE_CATEGORIES,
  HouseholdScope,
  INCOME_CATEGORIES,
  ParsedTransaction,
  PaymentMethod,
} from "../../shared/types";
import { Check, Trash2 } from "lucide-react";

interface Props {
  item: ParsedTransaction;
  members: string[];
  isDuplicateInBatch?: boolean;
  onChange: (id: string, patch: Partial<ParsedTransaction>) => void;
  onRemove: (id: string) => void;
}

const SCOPES: HouseholdScope[] = ["共通費", "立替", "個人"];
const PAYMENT_METHODS: PaymentMethod[] = [
  "クレカ",
  "PayPay",
  "現金",
  "銀行振込",
  "電子マネー",
  "その他",
];

export function TransactionCard({
  item,
  members,
  isDuplicateInBatch,
  onChange,
  onRemove,
}: Props) {
  const categories =
    item.type === "収入" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const categoryOptions = categories.includes(item.category as never)
    ? categories
    : ALL_CATEGORIES;

  const isIncome = item.type === "収入";

  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm transition-all ${
        !item.selected
          ? "border-slate-200 opacity-55"
          : isDuplicateInBatch
            ? "border-amber-400 ring-2 ring-amber-100"
            : "border-slate-200"
      }`}
    >
      {/* 上段：チェック・収支バッジ・削除 */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onChange(item.id, { selected: !item.selected })}
          className={`flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
            item.selected
              ? "bg-teal-600 text-white"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          <Check className="h-3.5 w-3.5" />
          {item.selected ? "登録する" : "除外"}
        </button>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              onChange(item.id, {
                type: isIncome ? "支出" : "収入",
                category: isIncome ? "食費" : "給与",
              })
            }
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              isIncome
                ? "bg-emerald-100 text-emerald-700"
                : "bg-rose-100 text-rose-700"
            }`}
          >
            {item.type}
          </button>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
            {item.source}
          </span>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label="削除"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isDuplicateInBatch && (
        <div className="mb-3 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
          同じ日付・金額・店名の明細がリスト内に複数あります（スクショの重複にご注意ください）
        </div>
      )}

      {/* 店名と金額 */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-12">
        <div className="sm:col-span-7">
          <label className="mb-1 block text-[11px] font-medium text-slate-500">
            内容・店名
          </label>
          <input
            type="text"
            value={item.title}
            onChange={(e) => onChange(item.id, { title: e.target.value })}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium focus:border-teal-500 focus:outline-none"
          />
        </div>
        <div className="sm:col-span-5">
          <label className="mb-1 block text-[11px] font-medium text-slate-500">
            金額（円）
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={item.amount}
            onChange={(e) =>
              onChange(item.id, { amount: Math.max(0, Number(e.target.value)) })
            }
            className={`w-full rounded-xl border border-slate-200 px-3 py-2 text-right text-sm font-bold focus:border-teal-500 focus:outline-none ${
              isIncome ? "text-emerald-700" : "text-slate-900"
            }`}
          />
        </div>
      </div>

      {/* 日付・カテゴリ・支払方法 */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-500">
            日付
          </label>
          <input
            type="date"
            value={item.date}
            onChange={(e) => onChange(item.id, { date: e.target.value })}
            className="w-full rounded-xl border border-slate-200 px-2 py-2 text-xs focus:border-teal-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-500">
            カテゴリ
          </label>
          <select
            value={item.category}
            onChange={(e) => onChange(item.id, { category: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs focus:border-teal-500 focus:outline-none"
          >
            {categoryOptions.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-500">
            支払方法
          </label>
          <select
            value={item.paymentMethod}
            onChange={(e) =>
              onChange(item.id, {
                paymentMethod: e.target.value as PaymentMethod,
              })
            }
            className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs focus:border-teal-500 focus:outline-none"
          >
            {PAYMENT_METHODS.map((pm) => (
              <option key={pm} value={pm}>
                {pm}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 支払者・区分・メモ */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
        <div className="sm:col-span-4">
          <label className="mb-1 block text-[11px] font-medium text-slate-500">
            支払/受取者
          </label>
          <select
            value={item.payer}
            onChange={(e) => onChange(item.id, { payer: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold focus:border-teal-500 focus:outline-none"
          >
            {members.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-4">
          <label className="mb-1 block text-[11px] font-medium text-slate-500">
            区分
          </label>
          <select
            value={item.scope}
            onChange={(e) =>
              onChange(item.id, { scope: e.target.value as HouseholdScope })
            }
            className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs focus:border-teal-500 focus:outline-none"
          >
            {SCOPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-2 sm:col-span-4">
          <label className="mb-1 block text-[11px] font-medium text-slate-500">
            メモ
          </label>
          <input
            type="text"
            placeholder="任意"
            value={item.memo}
            onChange={(e) => onChange(item.id, { memo: e.target.value })}
            className="w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs focus:border-teal-500 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
