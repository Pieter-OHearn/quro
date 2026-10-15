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
        'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition-colors duration-fast max-sm:min-h-11',
        checked
          ? 'border-brand bg-brand-soft'
          : 'border-border-control hover:bg-surface-muted active:bg-surface-muted',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded-sm border-border-control accent-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-cell font-medium text-fg">
          <Users size={14} className="text-fg-muted" aria-hidden />
          Joint with {partnerName}
        </span>
        <span className="mt-0.5 block text-caption text-fg-subtle">
          {hint ?? 'Both of you can view and edit this, and it counts 50/50 in your dashboards.'}
        </span>
      </span>
    </label>
  );
}
