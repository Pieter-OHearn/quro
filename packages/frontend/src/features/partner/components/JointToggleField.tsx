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
        checked ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200 hover:border-slate-300',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
          <Users size={14} className="text-indigo-500" />
          Joint with {partnerName}
        </span>
        <span className="mt-0.5 block text-xs text-slate-500">
          {hint ?? 'Both of you can view and edit this, and it counts 50/50 in your dashboards.'}
        </span>
      </span>
    </label>
  );
}
