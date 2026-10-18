import {
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  CONCENTRATION_THRESHOLD_KEYS,
  EXPOSURE_DEFAULT_SOURCES,
  MIX_GROUPS,
  MIX_GROUP_LABELS,
  REFERENCE_MIX_IDS,
  THRESHOLD_LABELS,
  defaultExposureSettings,
  referenceMixName,
  riskBandLabel,
  type ExposureReport,
} from '@quro/shared';
import { Badge, Card, PanelHeader } from '@/components/ui';
import { formatDate } from '@/lib/utils';

const DEFAULTS = defaultExposureSettings();

const INTRO =
  'We add up your holdings by asset class and compare them with reference mixes published by fund providers. Each class gets a default risk score on the EU 1 to 7 scale. Where a fund reports its own score, we use that. The notices show where your mix differs from a reference. This is information, not advice, and it does not take your goals or circumstances into account. Percentages and thresholds are editable defaults reviewed once a year.';

function InUse({ report }: Readonly<{ report: ExposureReport }>) {
  const { settings } = report.settings;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div>
        <h4 className="text-label text-fg-muted">Default risk class by asset class</h4>
        <ul className="mt-2 space-y-1 text-cell">
          {ASSET_CLASSES.map((assetClass) => {
            const value = settings.riskByAssetClass[assetClass];
            const changed = value !== DEFAULTS.riskByAssetClass[assetClass];
            return (
              <li key={assetClass} className="flex justify-between gap-3">
                <span className="text-fg-muted">{ASSET_CLASS_LABELS[assetClass]}</span>
                <span className="font-numeric text-fg">
                  {value === null ? 'None' : `${value} · ${riskBandLabel(value)}`}
                  {changed ? (
                    <span className="ml-1 text-caption text-fg-subtle">changed</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <h4 className="text-label text-fg-muted">Reference mixes (share of investments)</h4>
        <ul className="mt-2 space-y-2 text-cell">
          {REFERENCE_MIX_IDS.map((id) => (
            <li key={id}>
              <p className="font-medium text-fg">
                {referenceMixName(id)}
                {settings.selectedMix === id ? (
                  <Badge tone="brand" className="ml-2 align-middle">
                    Shown
                  </Badge>
                ) : null}
              </p>
              <p className="font-numeric text-fg-muted">
                {MIX_GROUPS.map((group) => {
                  const range = settings.referenceMixes[id][group];
                  return `${MIX_GROUP_LABELS[group]} ${range.min}–${range.max}%`;
                }).join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="text-label text-fg-muted">Concentration notices above</h4>
        <ul className="mt-2 space-y-1 text-cell">
          {CONCENTRATION_THRESHOLD_KEYS.map((key) => (
            <ThresholdRow
              key={key}
              label={THRESHOLD_LABELS[key]}
              value={settings.thresholds[key]}
              fallback={DEFAULTS.thresholds[key]}
              enabled={settings.noticesEnabled[key]}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function ThresholdRow({
  label,
  value,
  fallback,
  enabled,
}: Readonly<{ label: string; value: number; fallback: number; enabled: boolean }>) {
  return (
    <li className="flex justify-between gap-3">
      <span className="text-fg-muted">{label}</span>
      <span className="font-numeric text-fg">
        {enabled ? `${value}%` : `Off (${value}%)`}
        {value !== fallback ? (
          <span className="ml-1 text-caption text-fg-subtle">changed</span>
        ) : null}
      </span>
    </li>
  );
}

function Sources() {
  return (
    <details className="group rounded-md border border-border-default">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-3 text-cell font-medium text-brand-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring max-sm:min-h-11 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-fg-subtle transition-transform group-open:rotate-90">
          ›
        </span>
        Sources and version dates
        <span className="font-normal text-fg-subtle">({EXPOSURE_DEFAULT_SOURCES.length})</span>
      </summary>
      <ul className="divide-y divide-border-subtle border-t border-border-subtle">
        {EXPOSURE_DEFAULT_SOURCES.map((entry) => (
          <li key={entry.id} className="px-3 py-2 text-cell">
            <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
              {entry.covers}
              <Badge tone={entry.basis === 'published' ? 'info' : 'warning'}>
                {entry.basis === 'published' ? 'Published source' : 'Our assumption'}
              </Badge>
            </p>
            <p className="text-fg-muted">{entry.source}</p>
            <p className="text-caption text-fg-subtle">Version: {entry.versionDate}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The method, the defaults in use with their sources and dates, and the "not advice" wording. */
export function MethodPanel({ report }: Readonly<{ report: ExposureReport }>) {
  const { facts, settings } = report;
  return (
    <Card padding="none" className="overflow-hidden" data-testid="exposure-method">
      <PanelHeader title="How this is worked out" />
      <div className="space-y-5 p-4">
        <p className="max-w-3xl text-body text-fg-muted">{INTRO}</p>
        <ol className="max-w-3xl list-decimal space-y-1 pl-5 text-cell text-fg-muted">
          <li>
            Each open holding is worth its shares times the price in use (a price you entered wins
            over a synced one), rounded to cents, then converted to EUR with the stored exchange
            rate and rounded to cents once. A holding with no price or no rate is left out and named
            above, never valued at a guess.
          </li>
          <li>Weight is a holding&apos;s value divided by the total, as a percentage.</li>
          <li>
            Effective number of holdings = 1 ÷ (w₁² + w₂² + …), where each w is a holding&apos;s
            weight as a fraction of 1. Ten equal holdings give 10, two equal holdings give 2 and one
            holding gives 1. The lower it is against your count of holdings, the more your
            investments rest on a few of them.
          </li>
          <li>
            Weighted average risk class = the sum of each holding&apos;s risk class times its value,
            divided by the value of the holdings that have a risk class. A holding uses its own risk
            class when you set one, otherwise the default for its asset class.
          </li>
          <li>
            Groups for the reference mixes: stocks are both equity classes; bonds are the four bond
            classes; cash is cash and money market; other assets are gold and commodities, property
            and REITs, crypto and other.
          </li>
        </ol>
        <InUse report={report} />
        <Sources />
        <p className="max-w-3xl rounded-md bg-surface-muted px-3 py-2 text-cell text-fg-muted">
          <strong className="font-semibold text-fg">Information, not advice.</strong> This page
          describes how your investments are spread. It recommends no investment and no change to
          your investments, and it does not take your goals, circumstances or tolerance for risk
          into account. The reference mixes are published examples, not targets for you.
        </p>
        <p className="text-caption text-fg-subtle" data-testid="exposure-method-version">
          Method {facts.method.id} {facts.method.version} · facts schema {facts.schemaVersion} ·
          settings version {facts.settings.version} (
          {settings.source === 'custom' ? 'your own' : 'defaults'}) · defaults reviewed{' '}
          {settings.defaultsVersion} · as of {formatDate(facts.asOf)}
        </p>
      </div>
    </Card>
  );
}
