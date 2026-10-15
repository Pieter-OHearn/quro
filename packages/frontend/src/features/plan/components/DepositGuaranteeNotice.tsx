import type { RunwayResponse } from '@quro/shared';
import { AlertTriangle, Landmark } from 'lucide-react';
import { Button, Card } from '@/components/ui';

function exposureMessage(
  entry: RunwayResponse['depositGuarantee'][number],
  fmtBase: (value: number) => string,
): string {
  if (entry.cap === null || entry.excess === null) {
    return 'Protection cannot be modelled until the licensed entity and scheme are confirmed.';
  }
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
  const atRisk = guarantees.filter((entry) => (entry.excess ?? 0) > 0);
  const unverified = guarantees.filter((entry) => entry.confidence === 'unverified');
  const unverifiedAccountCount = new Set(unverified.flatMap((entry) => entry.accountIds)).size;
  if (guarantees.length === 0) return null;
  const hasExcess = atRisk.length > 0;
  const showCompactStatus = unverifiedAccountCount > 0 || !hasExcess;

  const compactStatus = showCompactStatus ? (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface px-4 py-3 max-sm:rounded-xl">
      <div className="flex min-w-0 items-center gap-3">
        <Landmark className="shrink-0 text-fg-faint" size={16} aria-hidden />
        <div>
          <p className="text-cell font-medium text-fg">
            {unverifiedAccountCount > 0
              ? `${unverifiedAccountCount} bank account${unverifiedAccountCount === 1 ? '' : 's'} need entity review`
              : 'Banking entities identified'}
          </p>
          <p className="text-caption text-fg-muted">
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
    <Card className="border-warning bg-warning-soft">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 shrink-0 text-warning" size={20} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-title-section text-fg">Deposit guarantee review</h2>
            <Button variant="ghost" size="sm" onClick={onReview}>
              Review banks
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {atRisk.map((entry) => (
              <p key={`${entry.entityId ?? entry.entityName}`} className="text-cell text-fg">
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
