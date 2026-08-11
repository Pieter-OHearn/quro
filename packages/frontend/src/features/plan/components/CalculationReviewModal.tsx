import type { RunwayResponse } from '@quro/shared';
import { Badge, Modal } from '@/components/ui';

const STATUS_LABELS = {
  included: 'Included',
  unknown: 'Needs confirmation',
  excluded: 'Excluded',
  not_applicable: 'Not applicable',
} as const;

function Status({ value }: Readonly<{ value: keyof typeof STATUS_LABELS }>) {
  return (
    <Badge tone={value === 'included' ? 'success' : value === 'unknown' ? 'warning' : 'neutral'}>
      {STATUS_LABELS[value]}
    </Badge>
  );
}

// The sections deliberately follow the backend component order for auditability.
// eslint-disable-next-line max-lines-per-function, complexity, sonarjs/cognitive-complexity
export function CalculationReviewModal({
  data,
  fmtBase,
  onClose,
}: Readonly<{ data: RunwayResponse; fmtBase: (value: number) => string; onClose: () => void }>) {
  const support = data.incomeSupport;
  const isNl = data.jurisdiction.code === 'NL';
  const isAu = data.jurisdiction.code === 'AU';
  const severanceLabel = isAu ? 'Redundancy pay' : 'Transition compensation';
  const benefitLabel = isNl ? 'WW benefit' : isAu ? 'JobSeeker Payment' : 'Unemployment benefit';
  return (
    <Modal
      title="Review calculation"
      subtitle={`${data.jurisdiction.code} rules · calculated ${data.asOf}`}
      onClose={onClose}
      maxWidth="xl"
      scrollable
    >
      <section aria-labelledby="calculation-summary">
        <h3 id="calculation-summary" className="font-semibold text-slate-900">
          What is included
        </h3>
        <div className="mt-3 space-y-3">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-slate-900">Notice pay</p>
              <Status value={support.notice.status} />
            </div>
            <p className="mt-2 text-sm text-slate-600">{support.notice.reason}</p>
            {support.notice.status === 'included' ? (
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {support.notice.months} month{support.notice.months === 1 ? '' : 's'} ×{' '}
                {fmtBase(support.notice.monthlyNet)} = {fmtBase(support.notice.totalNet)} net
              </p>
            ) : null}
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-slate-900">{severanceLabel}</p>
              <Status value={support.severance.status} />
            </div>
            <p className="mt-2 text-sm text-slate-600">{support.severance.reason}</p>
            {support.severance.status === 'included' ? (
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {fmtBase(support.severance.gross)} gross · approximately{' '}
                {fmtBase(support.severance.net)} net
              </p>
            ) : null}
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-slate-900">{benefitLabel}</p>
              <Status value={support.unemployment.status} />
            </div>
            <p className="mt-2 text-sm text-slate-600">{support.unemployment.reason}</p>
            {support.unemployment.status === 'included' ? (
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {support.unemployment.durationMonths} months · first month approximately{' '}
                {fmtBase(support.unemployment.monthlyNetByMonth[0] ?? 0)} net
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <details className="rounded-xl border border-slate-200 p-4">
        <summary className="cursor-pointer font-semibold text-slate-900">
          Inputs and calculation detail
        </summary>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Salary basis</dt>
            <dd className="font-medium text-slate-900">
              {fmtBase(support.salaryBasis.monthlyGross)} gross / month
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Salary source</dt>
            <dd className="font-medium text-slate-900">{support.salaryBasis.note}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Severance salary basis</dt>
            <dd className="font-medium text-slate-900">
              {fmtBase(support.severance.monthlyGross)} gross / month
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Continuous service</dt>
            <dd className="font-medium text-slate-900">
              {support.severance.serviceDays === null
                ? 'Not available'
                : `${support.severance.serviceDays} days (${support.severance.serviceYears?.toFixed(3)} years)`}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Effective tax estimate</dt>
            <dd className="font-medium text-slate-900">
              {(support.effectiveTaxRate * 100).toFixed(1)}% ·{' '}
              {support.taxRateSource.replace('_', ' ')}
            </dd>
          </div>
          {isNl ? (
            <div>
              <dt className="text-slate-500">WW 26-of-36 condition</dt>
              <dd className="font-medium text-slate-900">
                {support.unemployment.weeklyRequirement.replace('_', ' ')}
              </dd>
            </div>
          ) : null}
          {isNl ? (
            <div>
              <dt className="text-slate-500">WW duration source</dt>
              <dd className="font-medium text-slate-900">
                {support.unemployment.durationSource}
                {support.unemployment.durationConfirmedAt
                  ? ` · confirmed ${support.unemployment.durationConfirmedAt}`
                  : ''}
              </dd>
            </div>
          ) : null}
        </dl>
        {support.unemployment.unverifiedConditions.length > 0 ? (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">
              Still to verify with {isNl ? 'UWV' : isAu ? 'Services Australia' : 'the provider'}
            </p>
            <ul className="mt-1 list-disc pl-5">
              {support.unemployment.unverifiedConditions.map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </details>

      {support.warnings.map((warning) => (
        <p key={warning} className="text-xs leading-5 text-slate-500">
          {warning}
        </p>
      ))}

      <section aria-labelledby="official-sources">
        <h3 id="official-sources" className="font-semibold text-slate-900">
          Official sources
        </h3>
        <ul className="mt-2 space-y-2 text-sm">
          {support.sources.map((source) => (
            <li key={source.id}>
              <a
                className="font-medium text-indigo-700 underline decoration-indigo-200 underline-offset-2"
                href={source.url}
                target="_blank"
                rel="noreferrer"
              >
                {source.publisher}: {source.title}
              </a>
              <span className="ml-2 text-xs text-slate-500">
                effective {source.effectiveFrom}
                {source.effectiveTo ? `–${source.effectiveTo}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </Modal>
  );
}
