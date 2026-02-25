import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ShieldCheck,
  Plus,
  Edit3,
  Trash2,
  ChevronDown,
  ChevronUp,
  Info,
  TrendingUp,
  Calendar,
  Clock,
} from "lucide-react";
import { useCurrency } from "@/lib/CurrencyContext";
import type { PensionPot, PensionTransaction } from "@quro/shared";
import {
  usePensionPots,
  usePensionTransactions,
  useCreatePensionPot,
  useUpdatePensionPot,
  useDeletePensionPot,
  useCreatePensionTransaction,
  useDeletePensionTransaction,
} from "./hooks";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { StatCard } from "@/components/ui/StatCard";
import { AddPensionTxnModal } from "./components/AddPensionTxnModal";
import { PensionModal } from "./components/PensionModal";
import { PensionTxnHistory } from "./components/PensionTxnHistory";
import { TYPE_COLORS, toUtcTimestamp, yearEndUtc, type DatedPensionTransaction } from "./constants";

// ─── Main Page ───────────────────────────────────────────────────────────────

export function Pension(): JSX.Element {
  const { fmtBase, fmtNative, convertToBase, isForeign, baseCurrency } = useCurrency();

  // ─── Data fetching ──────────────────────────────────────────────────────
  const { data: pensions = [], isLoading: loadingPots } = usePensionPots();
  const { data: pensionTxns = [], isLoading: loadingTxns } = usePensionTransactions();

  // ─── Mutations ──────────────────────────────────────────────────────────
  const createPot = useCreatePensionPot();
  const updatePot = useUpdatePensionPot();
  const deletePot = useDeletePensionPot();
  const createTxn = useCreatePensionTransaction();
  const deleteTxn = useDeletePensionTransaction();

  // ─── UI state ───────────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PensionPot | undefined>(undefined);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [addTxnForPot, setAddTxnForPot] = useState<PensionPot | null>(null);

  // ─── Loading state ──────────────────────────────────────────────────────
  const isLoading = loadingPots || loadingTxns;

  // ─── Handlers ───────────────────────────────────────────────────────────
  function handleSave(pot: PensionPot | Omit<PensionPot, "id">): void {
    if ("id" in pot) {
      updatePot.mutate(pot as PensionPot);
    } else {
      createPot.mutate(pot);
    }
  }

  function handleAddPensionTxn(t: Omit<PensionTransaction, "id">): void {
    createTxn.mutate(t);
  }

  function handleDeletePensionTxn(id: number): void {
    deleteTxn.mutate(id);
  }

  // ─── Derived values ────────────────────────────────────────────────────
  const totalInBase = pensions.reduce((s, p) => s + convertToBase(p.balance, p.currency), 0);
  const totalMonthlyContribInBase = pensions.reduce(
    (s, p) => s + convertToBase(p.employeeMonthly + p.employerMonthly, p.currency), 0,
  );

  const yearsToRetirement = 29;
  const r = 0.05 / 12;
  const months = yearsToRetirement * 12;
  const projected = totalInBase * Math.pow(1.05, yearsToRetirement) +
    totalMonthlyContribInBase * ((Math.pow(1 + r, months) - 1) / r);

  const monthlyDrawdown = projected / (25 * 12);

  const pensionGrowthData = useMemo(() => {
    if (pensions.length === 0 || pensionTxns.length === 0) return [];

    const datedTxns: DatedPensionTransaction[] = pensionTxns
      .map((txn) => ({ ...txn, timestamp: toUtcTimestamp(txn.date) }))
      .filter((txn) => Number.isFinite(txn.timestamp));
    if (datedTxns.length === 0) return [];

    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const earliestYear = new Date(Math.min(...datedTxns.map((txn) => txn.timestamp))).getUTCFullYear();
    const years = Array.from(
      { length: currentYear - earliestYear + 1 },
      (_, i) => earliestYear + i,
    );

    return years.map((year) => {
      const cutoff = year === currentYear ? Date.now() : yearEndUtc(year);
      const total = pensions.reduce((sum, pot) => {
        const netAfterCutoff = datedTxns
          .filter((txn) => txn.potId === pot.id && txn.timestamp > cutoff)
          .reduce((acc, txn) => (
            acc + (txn.type === "contribution" ? txn.amount : -txn.amount)
          ), 0);
        const estimatedBalance = Math.max(0, pot.balance - netAfterCutoff);
        return sum + convertToBase(estimatedBalance, pot.currency);
      }, 0);

      return { year: String(year), value: total };
    });
  }, [pensions, pensionTxns, convertToBase]);

  const pensionGrowthPct = useMemo(() => {
    if (pensionGrowthData.length < 2) return null;
    const first = pensionGrowthData[0].value;
    const last = pensionGrowthData[pensionGrowthData.length - 1].value;
    if (first <= 0) return null;
    return ((last - first) / first) * 100;
  }, [pensionGrowthData]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Modals */}
      {(showModal || editing) && (
        <PensionModal
          existing={editing}
          onClose={() => { setShowModal(false); setEditing(undefined); }}
          onSave={handleSave}
        />
      )}
      {addTxnForPot && (
        <AddPensionTxnModal
          pot={addTxnForPot}
          onClose={() => setAddTxnForPot(null)}
          onSave={handleAddPensionTxn}
        />
      )}

      {/* Hero banner */}
      <div className="rounded-2xl bg-gradient-to-r from-[#0a0f1e] via-[#16213e] to-[#1a1448] p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-56 h-56 bg-amber-500/10 rounded-full -translate-y-1/3 translate-x-1/4" />
        <div className="absolute bottom-0 right-32 w-32 h-32 bg-indigo-500/10 rounded-full translate-y-1/2" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck size={18} className="text-amber-400" />
              <p className="text-amber-300 text-sm">Retirement Planning</p>
            </div>
            <h2 className="text-2xl font-bold">Pension Tracker</h2>
            <p className="text-slate-400 text-sm mt-1">{pensions.length} pension pots across {new Set(pensions.map(p => p.currency)).size} currencies</p>
          </div>
          <div className="flex gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-5 py-4 text-center">
              <p className="text-amber-300 text-[10px] uppercase tracking-widest mb-1">Total Balance</p>
              <p className="text-2xl font-bold">{fmtBase(totalInBase)}</p>
              <p className="text-slate-400 text-xs mt-0.5">in {baseCurrency}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-5 py-4 text-center">
              <p className="text-amber-300 text-[10px] uppercase tracking-widest mb-1">At 65</p>
              <p className="text-2xl font-bold">{fmtBase(projected)}</p>
              <p className="text-slate-400 text-xs mt-0.5">projected (5% growth)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Pension Value"   value={fmtBase(totalInBase)}                    subtitle={`across ${pensions.length} pots`} icon={ShieldCheck} color="amber" />
        <StatCard label="Monthly Contributions" value={fmtBase(totalMonthlyContribInBase)}      subtitle="combined (you + employer)"         icon={TrendingUp}  color="indigo" />
        <StatCard label="Annual Contributions"  value={fmtBase(totalMonthlyContribInBase * 12)} subtitle="in total per year"                 icon={Calendar}    color="emerald" />
        <StatCard label="Monthly Drawdown Est." value={fmtBase(monthlyDrawdown)}                subtitle="at 65 over 25 years"               icon={Clock}       color="sky" />
      </div>

      {/* Growth chart */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-semibold text-slate-900">Total Pension Growth</h3>
            <p className="text-xs text-slate-400 mt-0.5">Combined value across all pots ({baseCurrency})</p>
          </div>
          {pensionGrowthPct !== null && (
            <span className={`text-sm px-4 py-2 rounded-full font-semibold ${
              pensionGrowthPct >= 0 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-600"
            }`}>
              {pensionGrowthPct >= 0 ? "+" : ""}{pensionGrowthPct.toFixed(0)}%
              {" "}
              since {pensionGrowthData[0]?.year}
            </span>
          )}
        </div>
        {pensionGrowthData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={pensionGrowthData} margin={{ top: 8, right: 6, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="pensionGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 12, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
              />
              <Tooltip
                formatter={(value) => [fmtBase(Number(value) || 0), "Pension Value"]}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  fontSize: "12px",
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#f59e0b"
                strokeWidth={4}
                fill="url(#pensionGrowthGrad)"
                dot={false}
                activeDot={{ r: 5, fill: "#f59e0b" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
            Add pension transactions to generate growth history.
          </div>
        )}
      </div>

      {/* Pension pot cards */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-900">Pension Pots</h3>
            <p className="text-xs text-slate-400 mt-0.5">Click a pot to view transactions</p>
          </div>
          <button
            onClick={() => { setEditing(undefined); setShowModal(true); }}
            className="flex items-center gap-2 text-sm bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl transition-colors"
          >
            <Plus size={15} /> Add Pot
          </button>
        </div>

        <div className="divide-y divide-slate-50">
          {pensions.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm p-6">
              No pension pots yet. Click <strong>Add Pot</strong> to start tracking.
            </div>
          )}

          {pensions.map((pot) => {
            const isOpen = expanded === pot.id;
            const totalMonthly = pot.employeeMonthly + pot.employerMonthly;
            const balanceInBase = convertToBase(pot.balance, pot.currency);
            const foreign = isForeign(pot.currency);
            const txnCount = pensionTxns.filter((t) => t.potId === pot.id).length;

            return (
              <div key={pot.id} className="overflow-hidden">
                {/* Header row */}
                <div className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/60 transition-colors">
                  <span className="text-2xl flex-shrink-0">{pot.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="font-semibold text-slate-800 text-sm">{pot.name}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${TYPE_COLORS[pot.type]}`}>{pot.type}</span>
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{pot.currency}</span>
                    </div>
                    <p className="text-xs text-slate-400">{pot.provider} · {fmtNative(totalMonthly, pot.currency)}/mo · {txnCount} transactions</p>
                  </div>
                  <div className="text-right flex-shrink-0 mr-3">
                    <p className="font-bold text-slate-900">{fmtNative(pot.balance, pot.currency)}</p>
                    {foreign && <p className="text-xs text-amber-600 font-medium">&asymp; {fmtBase(balanceInBase)}</p>}
                    <p className="text-xs text-emerald-600">+{fmtNative(totalMonthly * 12, pot.currency)}/yr</p>
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => setEditing(pot)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                      title="Edit pot"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => setExpanded(isOpen ? null : pot.id)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
                      title={isOpen ? "Collapse" : "View transactions"}
                    >
                      {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* Expanded panel */}
                {isOpen && (
                  <div>
                    {/* Detail stats + notes */}
                    <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/30">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                        {[
                          { label: "Balance (Native)",          value: fmtNative(pot.balance, pot.currency) },
                          { label: `Balance (${baseCurrency})`, value: fmtBase(balanceInBase) },
                          { label: "Your Contribution",         value: `${fmtNative(pot.employeeMonthly, pot.currency)}/mo` },
                          { label: "Employer Match",            value: pot.employerMonthly > 0 ? `${fmtNative(pot.employerMonthly, pot.currency)}/mo` : "N/A" },
                        ].map(({ label, value }) => (
                          <div key={label} className="bg-white rounded-xl p-3 border border-slate-100">
                            <p className="text-xs text-slate-400 mb-1">{label}</p>
                            <p className="text-sm font-semibold text-slate-800">{value}</p>
                          </div>
                        ))}
                      </div>
                      {foreign && (
                        <div className="mb-3 p-2.5 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-2 text-xs text-amber-700">
                          <Info size={13} className="mt-0.5 flex-shrink-0" />
                          <span>This pot is held in <strong>{pot.currency}</strong>. The {baseCurrency} equivalent uses approximate exchange rates.</span>
                        </div>
                      )}
                      {pot.notes && (
                        <p className="text-xs text-slate-500 flex items-start gap-1.5">
                          <Info size={12} className="text-slate-400 mt-0.5 flex-shrink-0" />
                          {pot.notes}
                        </p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => deletePot.mutate(pot.id)}
                          className="flex items-center gap-1.5 text-xs border border-rose-100 rounded-lg px-3 py-1.5 text-rose-500 hover:bg-rose-50 transition-colors"
                        >
                          <Trash2 size={12} /> Remove Pot
                        </button>
                      </div>
                    </div>

                    {/* Transaction history */}
                    <PensionTxnHistory
                      pot={pot}
                      transactions={pensionTxns}
                      onAdd={() => setAddTxnForPot(pot)}
                      onDelete={handleDeletePensionTxn}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Retirement projection */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 border border-amber-100">
        <h3 className="font-semibold text-slate-900 mb-4">Retirement Projection</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Current Total",       value: fmtBase(totalInBase),         note: `in ${baseCurrency}` },
            { label: "Years to Retirement", value: `${yearsToRetirement} years`, note: "Target age 65" },
            { label: "Projected at 65",     value: fmtBase(projected),           note: "Assumes 5% growth p.a." },
            { label: "Est. Monthly Income", value: fmtBase(monthlyDrawdown),     note: "Over 25-year drawdown" },
          ].map(({ label, value, note }) => (
            <div key={label} className="bg-white/80 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <p className="font-bold text-amber-700">{value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{note}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
