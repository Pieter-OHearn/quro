import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// An inline action in the brand colour, such as "Forgot password?". It takes the text size of
// its paragraph and is at least 44px high on phones.
export function TextLinkButton({
  className,
  type = 'button',
  ...props
}: Readonly<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center rounded-sm text-[length:inherit] font-medium text-brand transition-colors duration-fast hover:text-brand-hover hover:underline active:text-brand-hover max-sm:min-h-11',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring',
        className,
      )}
      {...props}
    />
  );
}
