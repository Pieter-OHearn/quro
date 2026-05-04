import type { Debt, DebtPayment } from '@quro/shared';
import { Clock, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import { formatShortDate } from '../utils/forms';

type PaymentHistoryProps = {
  debt: Debt;
  payments: readonly DebtPayment[];
  onLogPayment: () => void;
  onDeletePayment: (id: number) => void;
};

type PaymentHistoryTableProps = Omit<PaymentHistoryProps, 'onLogPayment' | 'payments'> & {
  sortedPayments: DebtPayment[];
};

function PaymentHistoryEmpty() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-4 text-slate-400">
      <Clock size={16} className="flex-shrink-0" />
      <span className="text-sm">No payments recorded yet.</span>
    </div>
  );
}

function PaymentHistoryTable({
  debt,
  sortedPayments,
  onDeletePayment,
}: Readonly<PaymentHistoryTableProps>) {
  const { fmtNative } = useCurrency();

  return (
    <div className="overflow-hidden rounded-xl border border-slate-100">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-400">
              Date
            </th>
            <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-slate-400">
              Amount
            </th>
            <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-slate-400">
              Principal
            </th>
            <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-slate-400">
              Interest
            </th>
            <th className="w-10 px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {sortedPayments.map((payment) => (
            <tr key={payment.id} className="group hover:bg-slate-50/60">
              <td className="px-3 py-2.5 text-slate-600">{formatShortDate(payment.date)}</td>
              <td className="px-3 py-2.5 text-right font-semibold text-slate-800">
                {fmtNative(payment.amount, debt.currency, true)}
              </td>
              <td className="px-3 py-2.5 text-right font-medium text-emerald-600">
                {fmtNative(payment.principal, debt.currency, true)}
              </td>
              <td className="px-3 py-2.5 text-right text-rose-500">
                {fmtNative(payment.interest, debt.currency, true)}
              </td>
              <td className="px-3 py-2.5 text-right">
                <button
                  type="button"
                  onClick={() => onDeletePayment(payment.id)}
                  className="rounded-md p-1 text-slate-300 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PaymentHistory({
  debt,
  payments,
  onLogPayment,
  onDeletePayment,
}: Readonly<PaymentHistoryProps>) {
  const sortedPayments = [...payments].sort((left, right) => right.date.localeCompare(left.date));

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Payment History
        </p>
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700"
          leadingIcon={<Plus size={12} />}
          onClick={onLogPayment}
        >
          Log Payment
        </Button>
      </div>

      {sortedPayments.length === 0 ? (
        <PaymentHistoryEmpty />
      ) : (
        <PaymentHistoryTable
          debt={debt}
          sortedPayments={sortedPayments}
          onDeletePayment={onDeletePayment}
        />
      )}
    </div>
  );
}
