import { Link } from 'react-router';
import { Check, Circle } from 'lucide-react';
import type { SetupProgress } from '@quro/shared';
import { Card, PanelHeader } from '@/components/ui';
import { cn } from '@/lib/utils';

type Step = {
  key: string;
  title: string;
  description: string;
  to: string;
  action: string;
  /** Steps with a record to wait for show a check once it exists; the others are only a review. */
  done?: boolean;
};

function buildSteps(progress: SetupProgress): Step[] {
  return [
    {
      key: 'preferences',
      title: 'Check currency and number format',
      description:
        'Totals and charts convert into your base currency, and the planning region sets the retirement and severance rules.',
      to: '/settings?tab=preferences',
      action: 'Open preferences',
    },
    {
      key: 'household',
      title: 'Decide what is shared',
      description:
        'Your data stays on this server. Linking a partner only shares the items you mark as joint, split 50/50; everything else stays private.',
      to: '/settings?tab=partner',
      action: 'Open partner settings',
    },
    {
      key: 'account',
      title: 'Add your first account',
      description:
        'A savings account is the quickest start; investments, pensions and debts follow.',
      to: '/savings',
      action: 'Add an account',
      done: progress.hasAccount,
    },
    {
      key: 'transaction',
      title: 'Record your first transaction',
      description: 'A deposit or a budget entry gives the dashboard its first month to summarise.',
      to: progress.hasAccount ? '/savings' : '/budget',
      action: 'Add a transaction',
      done: progress.hasTransaction,
    },
  ];
}

function StepMarker({ done }: Readonly<{ done: boolean | undefined }>) {
  if (done === undefined) return <span className="w-4 flex-shrink-0" aria-hidden="true" />;
  const Icon = done ? Check : Circle;
  return (
    <Icon
      size={16}
      className={cn('mt-0.5 flex-shrink-0', done ? 'text-gain' : 'text-fg-faint')}
      aria-label={done ? 'Done' : 'To do'}
    />
  );
}

/** First-run guidance, shown until the household has an account and a transaction. */
export function GettingStartedCard({ progress }: Readonly<{ progress: SetupProgress }>) {
  if (progress.hasAccount && progress.hasTransaction) return null;
  return (
    <Card padding="none" aria-labelledby="getting-started-title">
      <PanelHeader
        title={<span id="getting-started-title">Get started</span>}
        subtitle="Four steps to a dashboard with your own figures."
      />
      <ol className="divide-y divide-border-subtle">
        {buildSteps(progress).map((step) => (
          <li key={step.key} className="flex items-start gap-3 px-4 py-3 max-sm:flex-wrap">
            <StepMarker done={step.done} />
            <div className="min-w-0 flex-1">
              <p className="text-cell font-medium text-fg">{step.title}</p>
              <p className="text-caption text-fg-subtle">{step.description}</p>
            </div>
            <Link
              to={step.to}
              className="rounded-sm text-cell font-medium text-brand transition-colors duration-fast hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
            >
              {step.action}
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
