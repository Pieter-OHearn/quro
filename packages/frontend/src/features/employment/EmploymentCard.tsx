import { useState } from 'react';
import { todayIsoDate, type Employment } from '@quro/shared';
import { BriefcaseBusiness, CalendarDays } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { EmploymentEditorModal } from './EmploymentEditorModal';

function completedMonths(startDate: string, asOf: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${asOf}T00:00:00Z`);
  let months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  if (end.getUTCDate() < start.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

function tenureLabel(employment: Employment, asOf: string) {
  if (!employment.serviceStartDate) return 'Start date needed';
  const tenureAsOf = employment.endDate && employment.endDate < asOf ? employment.endDate : asOf;
  const months = completedMonths(employment.serviceStartDate, tenureAsOf);
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  if (years === 0) return `${remainder} month${remainder === 1 ? '' : 's'}`;
  return `${years}y ${remainder}m`;
}

export function selectCurrentEmployment(
  employments: readonly Employment[],
  asOf = todayIsoDate(),
): Employment | null {
  const active = (employment: Employment) =>
    employment.endDate === null || employment.endDate >= asOf;
  return (
    employments.find((employment) => employment.isPrimary && active(employment)) ??
    employments.find(active) ??
    employments.find((employment) => employment.isPrimary) ??
    null
  );
}

export function EmploymentCard({
  employment,
  asOf = todayIsoDate(),
}: Readonly<{ employment: Employment | null; asOf?: string }>) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <BriefcaseBusiness size={16} className="mt-0.5 shrink-0 text-fg-faint" aria-hidden />
            <div className="min-w-0">
              <p className="text-label text-fg-muted">Employment</p>
              <h2 className="text-title-section text-fg">
                {employment?.employerName || 'Add your current employment'}
              </h2>
              {employment ? (
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-cell text-fg-muted">
                  <span className="capitalize">{employment.employmentType.replace('_', '-')}</span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays size={12} className="text-fg-faint" aria-hidden />{' '}
                    {tenureLabel(employment, asOf)} tenure
                  </span>
                  {employment.endDate && employment.endDate < asOf ? (
                    <span>Ended {employment.endDate}</span>
                  ) : null}
                  <span>
                    {employment.noticePeriodMonths === null
                      ? 'Notice not set'
                      : `${employment.noticePeriodMonths} month notice`}
                  </span>
                </div>
              ) : (
                <p className="mt-1 text-cell text-fg-muted">
                  One record powers Salary, notice pay, and severance calculations.
                </p>
              )}
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            {employment ? 'Update details' : 'Add details'}
          </Button>
        </div>
      </Card>
      {editing ? (
        <EmploymentEditorModal employment={employment} onClose={() => setEditing(false)} />
      ) : null}
    </>
  );
}
