import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { Mortgage as MortgageType } from '@quro/shared';
import type { MortgageFormatFn, OverpaymentImpact } from '../types';
import { formatTermReduction } from '../utils/mortgage-metrics';

type MortgageTipsProps = {
  mortgage: MortgageType;
  fmt: MortgageFormatFn;
  overpaymentImpact: OverpaymentImpact | null;
};

export function MortgageTips({ mortgage, fmt, overpaymentImpact }: Readonly<MortgageTipsProps>) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl">
        <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Rate Fix Expiry Coming</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Your fixed rate of {mortgage.interestRate}% expires in {mortgage.fixedUntil}. Start
            comparing remortgage deals 6 months before to avoid the Standard Variable Rate.
          </p>
        </div>
      </div>
      <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
        <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-emerald-800">Overpayment Opportunity</p>
          <p className="text-xs text-emerald-700 mt-0.5">
            You can overpay up to {mortgage.overpaymentLimit}% (
            {fmt((mortgage.outstandingBalance * mortgage.overpaymentLimit) / 100)}) per year without
            penalty.
            {overpaymentImpact
              ? ` Spreading that allowance as ${fmt(overpaymentImpact.extraMonthly)}/month could save approximately ${fmt(overpaymentImpact.interestSaved)} in interest and reduce your term by ${formatTermReduction(overpaymentImpact.monthsReduced)}.`
              : ' Add complete mortgage payment details to estimate overpayment impact.'}
          </p>
        </div>
      </div>
    </div>
  );
}
