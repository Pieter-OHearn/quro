import type { TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { getFieldChrome } from '../sharedFieldStyles';

export type TextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'onChange' | 'value'
> & {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
};

export function Textarea({
  className,
  error = false,
  onChange,
  rows = 3,
  value,
  ...props
}: TextareaProps) {
  return (
    <textarea
      {...props}
      rows={rows}
      value={value}
      aria-invalid={error || undefined}
      className={cn(getFieldChrome({ error }), 'resize-none', className)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
