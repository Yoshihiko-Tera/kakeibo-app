import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Edit3,
  Loader2,
  Printer,
  RefreshCw,
  Scale,
} from "lucide-react";
import {
  SummaryResponse,
  SummaryScopeFilter,
  SummaryTransactionItem,
} from "../../shared/types";
import { apiFetch } from "../utils/api";
import { EditTransactionModal } from "./EditTransactionModal";

interface Props {
  members: string[];
  refreshTrigger: number;
  onFeedback: (msg: { type: "success" | "error"; text: string }) => void;
}

const SCOPE_TABS: SummaryScopeFilter[] = ["すべて", "共通費", "個人"];

function getCurrentMonthISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(ym: string, delta: number): string {
  const [yStr, mStr] = ym.split("-");
  const d = new Date(Number(yStr), Number(mStr) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

export function SummaryView({ members, refreshTrigger, onFeedback }: Props) {
  const [month, setMonth] = useState<string>(getCurrentMonthISO());
  const [scope, setScope] = useState<SummaryScopeFilter>("すべて");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<SummaryTransactionItem | null>(
    null,
  );

  const fetchSummary = async (targetMonth = month, targetScope = scope) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        month: targetMonth,
        scope: targetScope,
      });
      const res = await apiFetch(`/api/summary?${params.toString()}`);
      const data = (await res.json()) as SummaryResponse & { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error || "集計の取得に失敗しました");
      }
      setSummary(data);
    } catch (err) {
      onFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "集計の取得に失敗しました",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSummary(month, scope);
  }, [month, scope, refreshTrigger]);

  // 共通費選択時の精算目安計算
  const settlementInfo = useMemo(() => {
    if (!summary || scope !== "共通費") return null;

    const personalMembers = members.filter((m) => m !== "共通");
    const payerNames = Array.from(
      new Set([
        ...personalMembers,
        ...Object.keys(summary.byPayer).filter((p) => p !== "共通"),
      ]),
    );

    if (payerNames.length < 2) return null;

    // 支払額の上位2名（または登録メンバーの2名）で差額を計算
    const entries = payerNames
      .map((name) => ({ name, amount: summary.byPayer[name] ?? 0 }))
      .sort((a, b) => b.amount - a.amount);

    const top = entries[0];
    const second = entries[1];
    const diff = top.amount - second.amount;

    if (diff === 0) {
      return {
        balanced: true,
        text: `${top.name} と ${second.name} の支払額は同額です（精算不要）`,
      };
    }

    const settleAmount = Math.round(diff / 2);
    return {
      balanced: false,
      topName: top.name,
      secondName: second.name,
      diff,
      settleAmount,
    };
  }, [summary, scope, members]);

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      {/* 印刷時のみ表示されるレポートヘッダー */}
      <div className="print-only hidden border-b-2 border-slate-800 pb-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-bold text-slate-900">
            おうち家計簿 月次レポート（{formatMonthLabel(month)}）
          </h2>
          <span className="text-xs text-slate-600">
            区分: {scope} ／ 集計基準: 支出日（利用日）
          </span>
        </div>
      </div>

      {/* 月切り替え & アクションバー（印刷時は非表示） */}
      <div className="no-print space-y-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              className="flex items-center gap-0.5 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
              前月
            </button>
            <input
              type="month"
              value={month}
              onChange={(e) => {
                if (e.target.value) setMonth(e.target.value);
              }}
              className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-900"
            />
            <button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              className="flex items-center gap-0.5 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              次月
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrintPdf}
              disabled={!summary || loading}
              className="flex items-center gap-1 rounded-xl border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-100 disabled:opacity-50"
            >
              <Printer className="h-3.5 w-3.5" />
              PDF出力
            </button>
            <button
              type="button"
              onClick={() => void fetchSummary(month, scope)}
              disabled={loading}
              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>

        {/* 区分フィルタタブ */}
        <div className="flex rounded-xl bg-slate-100 p-1">
          {SCOPE_TABS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${
                scope === s
                  ? "bg-white text-teal-800 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {summary && !summary.configured && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          スプレッドシート（GAS URL）が未設定です。「設定」タブから自分の GAS Webアプリ URL を登録してください。
        </div>
      )}

      {loading && !summary && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-10 text-xs font-bold text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          集計データを読み込み中...
        </div>
      )}

      {summary && (
        <>
          {/* 収支サマリーカード */}
          <div className="print-card grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <p className="text-xs font-medium text-slate-500">
                {formatMonthLabel(month)}の支出（{scope}）
              </p>
              <p className="mt-1 text-xl font-bold text-rose-600">
                ¥{summary.totalExpense.toLocaleString()}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <p className="text-xs font-medium text-slate-500">
                {formatMonthLabel(month)}の収入（{scope}）
              </p>
              <p className="mt-1 text-xl font-bold text-emerald-600">
                ¥{summary.totalIncome.toLocaleString()}
              </p>
            </div>
          </div>

          {/* メンバー別支出 & 共通費の精算目安 */}
          {(Object.keys(summary.byPayer).length > 0 || settlementInfo) && (
            <div className="print-card rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <h3 className="mb-2.5 text-xs font-bold text-slate-600">
                メンバー別の支出（{scope}）
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

              {settlementInfo && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-teal-200 bg-teal-50/70 p-3 text-xs text-teal-900">
                  <Scale className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                  {settlementInfo.balanced ? (
                    <span className="font-medium">{settlementInfo.text}</span>
                  ) : (
                    <div>
                      <p className="font-bold">
                        {settlementInfo.topName} が {settlementInfo.secondName} より ¥
                        {settlementInfo.diff?.toLocaleString()} 多く立て替えています
                      </p>
                      <p className="mt-0.5 text-[11px] text-teal-800">
                        折半する場合の精算目安：{settlementInfo.secondName} →{" "}
                        {settlementInfo.topName} へ{" "}
                        <strong className="text-xs">
                          ¥{settlementInfo.settleAmount?.toLocaleString()}
                        </strong>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* カテゴリ別の支出内訳 */}
          <div className="print-card rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <h3 className="mb-3 text-xs font-bold text-slate-600">
              カテゴリ別の支出内訳
            </h3>
            {summary.categoryBreakdown.length === 0 ? (
              <p className="text-xs text-slate-400">
                該当する支出データがありません。
              </p>
            ) : (
              <div className="space-y-2.5">
                {summary.categoryBreakdown.map((cat) => (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">
                        {cat.category}
                      </span>
                      <span className="text-slate-600">
                        <strong className="text-slate-900">
                          ¥{cat.amount.toLocaleString()}
                        </strong>{" "}
                        <span className="text-[11px] text-slate-400">
                          ({cat.percentage}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-teal-600"
                        style={{ width: `${Math.min(100, cat.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 明細一覧（支出日の新しい順・タップで編集/削除） */}
          <div className="print-card rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-600">
                明細一覧（{summary.items.length}件・日付の新しい順）
              </h3>
              <span className="no-print text-[11px] text-slate-400">
                タップで編集・削除
              </span>
            </div>

            {summary.items.length === 0 ? (
              <p className="text-xs text-slate-400">
                {formatMonthLabel(month)}のデータはありません。
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {summary.items.map((row) => (
                  <li key={row.rowNumber}>
                    <button
                      type="button"
                      onClick={() => setEditingItem(row)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl px-1.5 py-2.5 text-left text-xs transition hover:bg-slate-50 active:bg-slate-100"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-bold text-slate-800">
                            {row.title}
                          </span>
                          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            {row.scope}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {row.date} ・ {row.category} ・ {row.payer}
                          {row.memo ? ` ・ ${row.memo}` : ""}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
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
                        <Edit3 className="no-print h-3.5 w-3.5 text-slate-300" />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {editingItem && (
        <EditTransactionModal
          item={editingItem}
          members={members}
          onClose={() => setEditingItem(null)}
          onSaved={(msg) => {
            setEditingItem(null);
            onFeedback({ type: "success", text: msg });
            void fetchSummary(month, scope);
          }}
        />
      )}
    </div>
  );
}
