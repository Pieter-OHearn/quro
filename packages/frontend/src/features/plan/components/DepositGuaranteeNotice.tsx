import type { RunwayResponse } from '@quro/shared';
import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui';

export function DepositGuaranteeNotice({
  guarantees,
  fmtBase,
}: Readonly<{
  guarantees: RunwayResponse['depositGuarantee'];
  fmtBase: (value: number) => string;
}>) {
  const atRisk = guarantees.filter((entry) => entry.excess > 0);
  const unverified = guarantees.filter(
    (entry) => entry.confidence === 'unverified' && entry.excess === 0,
  );
  const entries = [...atRisk, ...unverified];
  if (entries.length === 0) return null;
  const hasExcess = atRisk.length > 0;
  return (
    <Card className={hasExcess ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200'}>
      <div className="flex gap-3">
        <AlertTriangle
          className={`mt-0.5 shrink-0 ${hasExcess ? 'text-amber-600' : 'text-slate-400'}`}
          size={20}
        />
        <div>
          <h2 className={`font-semibold ${hasExcess ? 'text-amber-950' : 'text-slate-900'}`}>
            {hasExcess ? 'Deposit guarantee review' : 'Unverified banking entities'}
          </h2>
          <div className="mt-3 space-y-2">
            {entries.map((entry) => (
              <p
                key={`${entry.entityId ?? entry.entityName}`}
                className={`text-sm ${hasExcess ? 'text-amber-900' : 'text-slate-600'}`}
              >
                <span className="font-semibold">{entry.entityName}:</span>{' '}
                {entry.confidence === 'unverified'
                  ? 'the licensed banking entity could not be confirmed.'
                  : `${fmtBase(entry.excess)} is above the modelled ${fmtBase(entry.cap)} cap.`}
              </p>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
