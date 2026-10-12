import { cn } from '@/lib/utils';

// 32px on desktop and 44px on phones; the focus ring is 2px at a 1px offset like every control.
const BASE_FIELD_CHROME =
  'w-full h-8 max-sm:h-11 rounded-md border text-cell transition-colors duration-fast placeholder:text-fg-faint focus:outline-2 focus:outline-offset-1 focus:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-50';

type FieldChromeOptions = {
  className?: string;
  error?: boolean;
  paddingClassName?: string;
};

export function getFieldChrome({
  className,
  error = false,
  paddingClassName = 'px-2',
}: FieldChromeOptions) {
  return cn(
    BASE_FIELD_CHROME,
    paddingClassName,
    error ? 'border-danger bg-surface' : 'border-border-control bg-surface',
    className,
  );
}
