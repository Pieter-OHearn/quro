import type { RunwayResponse } from '@quro/shared';
import { AlertTriangle, Landmark } from 'lucide-react';
import { Button, Card } from '@/components/ui';

function exposureMessage(
  entry: RunwayResponse['depositGuarantee'][number],
  fmtBase: (value: number) => string,
): string {
  if (entry.ineligibleCurrencyTotal > 0) {
    const capExcess = entry.excess - entry.ineligibleCurrencyTotal;
    const currencyMessage = `${fmtBase(entry.ineligibleCurrencyTotal)} is outside the currencies covered by ${entry.scheme}`;
    if (capExcess > 0) {
      return `${currencyMessage}; another ${fmtBase(capExcess)} is above the modelled ${fmtBase(entry.cap)} cap.`;
    }
    return `${currencyMessage}.`;
  }
  if (entry.confidence === 'unverified') {
    return `${fmtBase(entry.excess)} may be above the modelled ${fmtBase(entry.cap)} cap, but the licensed entity still needs confirmation.`;
  }
  return `${fmtBase(entry.excess)} is above the modelled ${fmtBase(entry.cap)} cap.`;
}

export function DepositGuaranteeNotice({
  guarantees,
  fmtBase,
  onReview,
}: Readonly<{
  guarantees: RunwayResponse['depositGuarantee'];
  fmtBase: (value: number) => string;
  onReview: () => void;
}>) {
  const atRisk = guarantees.filter((entry) => entry.excess > 0);
  const unverified = guarantees.filter((entry) => entry.confidence === 'unverified');
  const unverifiedAccountCount = new Set(unverified.flatMap((entry) => entry.accountIds)).size;
  if (guarantees.length === 0) return null;
  const hasExcess = atRisk.length > 0;
  const showCompactStatus = unverifiedAccountCount > 0 || !hasExcess;

  const compactStatus = showCompactStatus ? (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Landmark className="shrink-0 text-fg-faint" size={18} />
        <div>
          <p className="text-sm font-medium text-fg">
            {unverifiedAccountCount > 0
              ? `${unverifiedAccountCount} bank account${unverifiedAccountCount === 1 ? '' : 's'} need entity review`
              : 'Banking entities identified'}
          </p>
          <p className="text-xs text-fg-muted">
            {unverifiedAccountCount > 0
              ? 'Confirm the licensed entity used for deposit protection.'
              : 'Manage how account brands are grouped for deposit protection.'}
          </p>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onReview}>
        {unverifiedAccountCount > 0 ? 'Review banks' : 'Manage'}
      </Button>
    </div>
  ) : null;

  const exposureNotice = hasExcess ? (
    <Card className="border-warning-border bg-warning-soft/70">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 shrink-0 text-warning" size={20} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="font-semibold text-fg">Deposit guarantee review</h2>
            <Button variant="ghost" size="sm" onClick={onReview}>
              Review banks
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {atRisk.map((entry) => (
              <p key={`${entry.entityId ?? entry.entityName}`} className="text-sm text-fg-strong">
                <span className="font-semibold">{entry.entityName}:</span>{' '}
                {exposureMessage(entry, fmtBase)}
              </p>
            ))}
          </div>
        </div>
      </div>
    </Card>
  ) : null;

  return (
    <div className="space-y-3">
      {exposureNotice}
      {compactStatus}
    </div>
  );
}
