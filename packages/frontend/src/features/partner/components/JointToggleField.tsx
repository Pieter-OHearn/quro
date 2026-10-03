import { Users } from 'lucide-react';
import { getUserDisplayName } from '@/lib/user';
import { cn } from '@/lib/utils';
import { usePartner } from '../hooks';

type JointToggleFieldProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  className?: string;
};

// Renders nothing unless an accepted partner link exists, so personal-only
// users never see the joint option.
export function JointToggleField({ checked, onChange, hint, className }: JointToggleFieldProps) {
  const { data: link } = usePartner();
  if (link?.status !== 'accepted') return null;

  const partnerName = getUserDisplayName(link.partner);

  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors',
        checked
          ? 'border-brand-border bg-brand-soft/60'
          : 'border-border-default hover:border-border-strong',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border-strong text-brand focus:ring-brand-accent"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
          <Users size={14} className="text-brand-accent" />
          Joint with {partnerName}
        </span>
        <span className="mt-0.5 block text-xs text-fg-subtle">
          {hint ?? 'Both of you can view and edit this, and it counts 50/50 in your dashboards.'}
        </span>
      </span>
    </label>
  );
}
