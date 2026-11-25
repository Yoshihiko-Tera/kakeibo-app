import { useState } from "react";
import { AlertTriangle, Loader2, Save, Trash2, X } from "lucide-react";
import {
  ALL_CATEGORIES,
  EXPENSE_CATEGORIES,
  HouseholdScope,
  INCOME_CATEGORIES,
  SummaryTransactionItem,
  TransactionType,
} from "../../shared/types";
import { apiFetch } from "../utils/api";

interface Props {
  item: SummaryTransactionItem;
  members: string[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

const SCOPES: HouseholdScope[] = ["共通費", "個人", "立替"];

export function EditTransactionModal({
  item,
  members,
  onClose,
  onSaved,
}: Props) {
  const [date, setDate] = useState(item.date);
  const [type, setType] = useState<TransactionType>(item.type);
  const [category, setCategory] = useState(item.category);
  const [title, setTitle] = useState(item.title);
  const [amount, setAmount] = useState(String(item.amount));
  const [scope, setScope] = useState<HouseholdScope>(item.scope);
  const [payer, setPayer] = useState(item.payer);
  const [memo, setMemo] = useState(item.memo);

  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payerOptions = members.includes(payer) ? members : [payer, ...members];
  const baseCategories =
    type === "収入" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const categoryOptions = baseCategories.includes(category as never)
    ? baseCategories
    : ALL_CATEGORIES;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Math.max(0, Math.round(Number(amount) || 0));
    if (!title.trim() || numAmount <= 0) {
      setError("内容と金額（1円以上）を入力してください。");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/transactions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowNumber: item.rowNumber,
          date,
          type,
          category,
          title: title.trim(),
          amount: numAmount,
          scope,
          payer,
          memo: memo.trim(),
        }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error || "更新に失敗しました");
      }
      onSaved(data.message || "明細を更新しました。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新エラー");
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/transactions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowNumber: item.rowNumber }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error || "削除に失敗しました");
      }
      onSaved(data.message || "明細を削除しました。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除エラー");
      setSubmitting(false);
    }
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-xs sm:items-center sm:p-4">
      <div className="w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">
            明細の編集・削除
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800">
            {error}
          </div>
        )}

        {confirmDelete ? (
          <div className="space-y-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <div className="flex items-start gap-2.5 text-rose-900">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
              <div className="text-sm">
                <p className="font-bold">本当にこの明細を削除しますか？</p>
                <p className="mt-1 text-xs text-rose-700">
                  {date} ・ {title} ・ ¥{Number(amount).toLocaleString()}
                  （スプレッドシートの {item.rowNumber} 行目から完全に削除されます）
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-xl border border-slate-300 bg-white py-2.5 text-xs font-bold text-slate-700"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleDelete()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                削除を実行する
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
            <div className="flex rounded-xl bg-slate-100 p-1">
              {(["支出", "収入"] as TransactionType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setType(t);
                    setCategory(t === "収入" ? "給与" : "食費");
                  }}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${
                    type === t
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

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-500">
                  日付
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-500">
                  金額（円）
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-right text-sm font-bold"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-500">
                内容・店名
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-500">
                  カテゴリ
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs"
                >
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-500">
                  区分
                </label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as HouseholdScope)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs"
                >
                  {SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-500">
                  支払/受取者
                </label>
                <select
                  value={payer}
                  onChange={(e) => setPayer(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs"
                >
                  {payerOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-500">
                メモ
              </label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="任意"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirmDelete(true)}
                className="flex items-center justify-center gap-1 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700 hover:bg-rose-100"
              >
                <Trash2 className="h-4 w-4" />
                削除
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-teal-700 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                変更を保存
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
