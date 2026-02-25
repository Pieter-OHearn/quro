import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Briefcase, Calculator, Download, ArrowUpRight,
  Plus, X, Info, Trash2, ShieldCheck, ArrowRight, Loader2,
} from "lucide-react";
import { StatCard, LoadingSpinner } from "@/components/ui";
import { Link } from "react-router";
import { useCurrency } from "@/lib/CurrencyContext";
import type { Payslip, SalaryHistory } from "@quro/shared";
import { usePayslips, useCreatePayslip, useDeletePayslip, useSalaryHistory } from "./hooks";

// ─── Add Payslip Modal ────────────────────────────────────────────────────────

type AddPayslipModalProps = {
  onClose: () => void;
  onSave: (p: Omit<Payslip, "id">) => void;
  baseCurrency: string;
};

function AddPayslipModal({ onClose, onSave, baseCurrency }: AddPayslipModalProps) {
  const [form, setForm] = useState({
    month: "", date: "", gross: "", tax: "", pension: "", bonus: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const gross   = parseFloat(form.gross)   || 0;
  const tax     = parseFloat(form.tax)     || 0;
  const pension = parseFloat(form.pension) || 0;
  const bonus   = parseFloat(form.bonus)   || 0;
  const net     = gross + bonus - tax - pension;

  const set = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => { const n = { ...e }; delete n[field]; return n; });
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.month.trim())                               errs.month   = "Required";
    if (!form.date.trim())                                errs.date    = "Required";
    if (!form.gross   || isNaN(gross)   || gross   <= 0) errs.gross   = "Enter a valid amount";
    if (!form.tax     || isNaN(tax)     || tax     <  0) errs.tax     = "Enter a valid amount";
    if (!form.pension || isNaN(pension) || pension <  0) errs.pension = "Enter a valid amount";
    return errs;
  };

  const handleSave = () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave({
      month: form.month.trim(),
      date: form.date.trim(),
      gross,
      tax,
      pension,
      net,
      bonus: bonus > 0 ? bonus : null,
      currency: baseCurrency as Payslip["currency"],
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="bg-gradient-to-r from-[#0a0f1e] to-[#1a1f3e] px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-white">Add Payslip</h2>
            <p className="text-xs text-indigo-300 mt-0.5">Amounts in {baseCurrency}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Month + Date */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { field: "month", label: "Pay Period", placeholder: "e.g. Mar 2026" },
              { field: "date",  label: "Pay Date",   placeholder: "e.g. 31 Mar 2026" },
            ].map(({ field, label, placeholder }) => (
              <div key={field}>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label} <span className="text-rose-500">*</span></label>
                <input
                  className={`w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 ${errors[field] ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-slate-50"}`}
                  placeholder={placeholder}
                  value={form[field as keyof typeof form]}
                  onChange={(e) => set(field, e.target.value)}
                />
                {errors[field] && <p className="text-xs text-rose-500 mt-1">{errors[field]}</p>}
              </div>
            ))}
          </div>

          {/* Gross + Bonus */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Gross Pay <span className="text-rose-500">*</span></label>
              <input
                type="number"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 ${errors.gross ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-slate-50"}`}
                placeholder="6500"
                value={form.gross}
                onChange={(e) => set("gross", e.target.value)}
              />
              {errors.gross && <p className="text-xs text-rose-500 mt-1">{errors.gross}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Bonus <span className="text-slate-400 font-normal">optional</span></label>
              <input
                type="number"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="0"
                value={form.bonus}
                onChange={(e) => set("bonus", e.target.value)}
              />
            </div>
          </div>

          {/* Deductions */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Deductions</p>
              <div className="flex-1 h-px bg-slate-100" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { field: "tax",     label: "Income Tax",       placeholder: "1680" },
                { field: "pension", label: "Pension",          placeholder: "325"  },
              ].map(({ field, label, placeholder }) => (
                <div key={field}>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label} <span className="text-rose-500">*</span></label>
                  <input
                    type="number"
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 ${errors[field] ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-slate-50"}`}
                    placeholder={placeholder}
                    value={form[field as keyof typeof form]}
                    onChange={(e) => set(field, e.target.value)}
                  />
                  {errors[field] && <p className="text-xs text-rose-500 mt-1">{errors[field]}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Net preview */}
          <div className={`rounded-xl p-4 border ${net >= 0 ? "bg-emerald-50 border-emerald-100" : "bg-rose-50 border-rose-100"}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Info size={15} className={net >= 0 ? "text-emerald-600" : "text-rose-500"} />
                <p className="text-sm font-semibold text-slate-700">Calculated Take-Home</p>
              </div>
              <p className={`font-bold ${net >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                {net >= 0 ? `${baseCurrency} ${net.toFixed(2)}` : "Check values"}
              </p>
            </div>
            {gross > 0 && (
              <div className="flex h-2 rounded-full overflow-hidden gap-px">
                {[
                  { pct: Math.max((net / (gross + bonus)) * 100, 0),  color: "bg-emerald-500" },
                  { pct: (tax / (gross + bonus)) * 100,     color: "bg-rose-400" },
                  { pct: (pension / (gross + bonus)) * 100, color: "bg-indigo-400" },
                ].filter(s => s.pct > 0).map((s, i) => (
                  <div key={i} className={`h-full ${s.color}`} style={{ width: `${s.pct}%` }} />
                ))}
              </div>
            )}
            <p className="text-xs text-slate-400 mt-1.5">Gross{bonus > 0 ? " + Bonus" : ""} − Tax − Pension</p>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 text-slate-600 py-2.5 text-sm hover:bg-slate-100 transition-colors">Cancel</button>
          <button onClick={handleSave} className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 text-sm transition-colors font-medium">Save Payslip</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Salary() {
  const { fmtBase, baseCurrency } = useCurrency();
  const { data: payslips = [], isLoading: loadingPayslips } = usePayslips();
  const { data: salaryHistory = [], isLoading: loadingHistory } = useSalaryHistory();
  const createPayslip = useCreatePayslip();
  const deletePayslip = useDeletePayslip();

  const [showAdd, setShowAdd]       = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selected = payslips.find((p) => p.id === selectedId) ?? payslips[0] ?? null;

  const handleAdd = (p: Omit<Payslip, "id">) => {
    createPayslip.mutate(p);
  };

  const handleDelete = (id: number) => {
    deletePayslip.mutate(id);
  };

  const annualGross   = useMemo(() => payslips.reduce((s, p) => s + p.gross, 0), [payslips]);
  const annualNet     = useMemo(() => payslips.reduce((s, p) => s + p.net, 0),   [payslips]);
  const annualTax     = useMemo(() => payslips.reduce((s, p) => s + p.tax, 0),   [payslips]);
  const annualPension = useMemo(() => payslips.reduce((s, p) => s + p.pension, 0), [payslips]);

  // Salary growth chart data
  const salaryChartData = salaryHistory.map((h) => ({
    year: String(h.year),
    gross: h.annualSalary,
  }));

  const salaryGrowthPct = salaryChartData.length >= 2
    ? ((salaryChartData[salaryChartData.length - 1].gross - salaryChartData[0].gross) / salaryChartData[0].gross) * 100
    : 0;

  const isLoading = loadingPayslips || loadingHistory;

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {showAdd && (
        <AddPayslipModal
          onClose={() => setShowAdd(false)}
          onSave={handleAdd}
          baseCurrency={baseCurrency}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Annual Gross",      value: fmtBase(annualGross),   sub: "Total this year",         icon: Briefcase,  color: "indigo" },
          { label: "Annual Net",        value: fmtBase(annualNet),     sub: "After all deductions",    icon: ArrowUpRight, color: "emerald" },
          { label: "Tax Paid (YTD)",    value: fmtBase(annualTax),     sub: "Income tax",              icon: Calculator, color: "rose" },
          { label: "Pension Contrib.",  value: fmtBase(annualPension), sub: "Your contributions YTD",  icon: ShieldCheck, color: "amber" },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center ${
              color === "indigo"  ? "bg-indigo-50 text-indigo-600"  :
              color === "emerald" ? "bg-emerald-50 text-emerald-600" :
              color === "rose"    ? "bg-rose-50 text-rose-500"       :
              "bg-amber-50 text-amber-600"
            }`}><Icon size={18} /></div>
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className="font-bold text-slate-900">{value}</p>
            <p className="text-xs text-slate-400 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pay breakdown for selected month */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-1">Pay Breakdown</h3>
          <p className="text-xs text-slate-400 mb-4">{selected?.month ?? "—"} — click a payslip row to switch month</p>
          {selected && (
            <>
              <div className="flex h-7 rounded-xl overflow-hidden mb-5 gap-px">
                <div className="bg-emerald-500 h-full" style={{ width: `${(selected.net   / selected.gross) * 100}%` }} />
                <div className="bg-rose-400   h-full" style={{ width: `${(selected.tax   / selected.gross) * 100}%` }} />
                <div className="bg-indigo-400 h-full" style={{ width: `${(selected.pension / selected.gross) * 100}%` }} />
              </div>
              <div className="space-y-2.5">
                {[
                  { label: "Gross Pay",         val: selected.gross,   color: "bg-slate-200",  tc: "text-slate-700" },
                  ...(selected.bonus ? [{ label: "Bonus", val: selected.bonus, color: "bg-amber-200", tc: "text-amber-700" }] : []),
                  { label: "Take-Home Pay",     val: selected.net,    color: "bg-emerald-500",  tc: "text-emerald-700", pct: (selected.net    / selected.gross) * 100 },
                  { label: "Income Tax",        val: -selected.tax,   color: "bg-rose-400",     tc: "text-rose-600",    pct: (selected.tax    / selected.gross) * 100 },
                  { label: "Pension",           val: -selected.pension, color: "bg-indigo-400", tc: "text-indigo-600",  pct: (selected.pension / selected.gross) * 100 },
                ].map(({ label, val, color, tc, pct }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-sm ${color}`} />
                      <span className="text-sm text-slate-600">{label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {pct !== undefined && <span className="text-xs text-slate-400">{pct.toFixed(0)}%</span>}
                      <span className={`text-sm font-semibold ${tc}`}>
                        {val >= 0 ? "+" : "\u2212"}{fmtBase(Math.abs(val))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {!selected && <p className="text-sm text-slate-400 py-8 text-center">No payslips yet.</p>}
        </div>

        {/* Salary history chart */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-1">Salary Growth History</h3>
          <p className="text-xs text-slate-400 mb-5">Annual gross in {baseCurrency}</p>
          {salaryChartData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={salaryChartData} barSize={32}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [fmtBase(v), "Annual Gross"]} contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "12px" }} />
                  <Bar dataKey="gross" fill="#6366f1" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              {salaryGrowthPct > 0 && (
                <div className="mt-3 flex items-center gap-2 bg-emerald-50 rounded-xl p-3">
                  <ArrowUpRight size={16} className="text-emerald-600" />
                  <p className="text-xs text-emerald-700">Salary has grown by <strong>+{salaryGrowthPct.toFixed(0)}%</strong> since {salaryChartData[0].year}</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-400 py-12 text-center">No salary history yet.</p>
          )}
        </div>
      </div>

      {/* Payslip history table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-900">Payslip History</h3>
            <p className="text-xs text-slate-400 mt-0.5">{payslips.length} payslips · click a row to view breakdown</p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl transition-colors"
          >
            <Plus size={15} /> Add Payslip
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {["Month", "Gross", "Tax", "Pension", "Net Pay", ""].map((h) => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payslips.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`border-b border-slate-50 cursor-pointer transition-colors ${selected?.id === p.id ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{p.month}</span>
                      {p.bonus && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">+Bonus</span>}
                    </div>
                    <p className="text-xs text-slate-400">{p.date}</p>
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-800">{fmtBase(p.gross)}</td>
                  <td className="py-3 px-4 text-rose-500">{"\u2212"}{fmtBase(p.tax)}</td>
                  <td className="py-3 px-4 text-indigo-600">{"\u2212"}{fmtBase(p.pension)}</td>
                  <td className="py-3 px-4 font-bold text-emerald-600">{fmtBase(p.net)}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-slate-500 transition-colors">
                        <Download size={14} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {payslips.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 text-sm">
                    No payslips yet. Click <strong>Add Payslip</strong> to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pension quick-link */}
      <Link
        to="/pension"
        className="flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 rounded-2xl p-5 hover:shadow-md transition-shadow group"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
            <ShieldCheck size={22} />
          </div>
          <div>
            <p className="font-semibold text-slate-800">Pension Tracker</p>
            <p className="text-xs text-slate-500 mt-0.5">View and manage your pension pots across currencies</p>
          </div>
        </div>
        <ArrowRight size={18} className="text-amber-500 group-hover:translate-x-1 transition-transform" />
      </Link>
    </div>
  );
}
