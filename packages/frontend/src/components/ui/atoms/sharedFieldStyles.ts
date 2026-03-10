import { cn } from '@/lib/utils';

const BASE_FIELD_CHROME =
  'w-full rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-50';

type FieldChromeOptions = {
  className?: string;
  error?: boolean;
  paddingClassName?: string;
};

export function getFieldChrome({
  className,
  error = false,
  paddingClassName = 'px-3 py-2.5',
}: FieldChromeOptions) {
  return cn(
    BASE_FIELD_CHROME,
    paddingClassName,
    error ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50',
    className,
  );
}
