import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type FormFieldProps = {
  label: ReactNode;
  required?: boolean;
  error?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  labelClassName?: string;
  errorClassName?: string;
};

const FIELD_ERROR_SELECTOR = '[data-field-error]';
const ENTRY_CONTROL_SELECTOR = 'input, select, textarea';
// A field whose only visible control is a button (an attachment picker) focuses that button.
const FOCUS_TARGET_SELECTOR =
  'input:not([type="file"]):not([type="hidden"]), select, textarea, button';
const FORM_SCOPE_SELECTOR = '[role="dialog"], form';

function revealFirstError(field: HTMLElement) {
  // Fields that fail together mount their errors in the same commit, in document order, so only
  // the first of them reveals itself.
  const scope = field.closest<HTMLElement>(FORM_SCOPE_SELECTOR) ?? document;
  if (scope.querySelector(FIELD_ERROR_SELECTOR) !== field) return;
  field.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  // A field that is being typed in keeps focus; otherwise (a submit press) focus moves to the
  // first field with a problem.
  const active = document.activeElement;
  if (
    active instanceof HTMLElement &&
    active.matches(ENTRY_CONTROL_SELECTOR) &&
    scope.contains(active)
  ) {
    return;
  }
  field.querySelector<HTMLElement>(FOCUS_TARGET_SELECTOR)?.focus({ preventScroll: true });
}

// The label sits 4px above the control; label, hint and error use the type scale. When a field
// gains an error it scrolls into view above a sticky action bar, and the first one takes focus.
export function FormField({
  label,
  required,
  error,
  hint,
  children,
  className,
  labelClassName,
  errorClassName,
}: FormFieldProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const hasError = Boolean(error);
  const hadErrorRef = useRef(false);

  useEffect(() => {
    const field = fieldRef.current;
    if (hasError && !hadErrorRef.current && field) revealFirstError(field);
    hadErrorRef.current = hasError;
  }, [hasError]);

  return (
    <div
      ref={fieldRef}
      data-field-error={hasError ? '' : undefined}
      className={cn('scroll-mt-4 scroll-mb-28', className)}
    >
      <label className={cn('mb-1 block text-label text-fg-muted', labelClassName)}>
        {label}
        {required && <span className="text-danger"> *</span>}
        {hint && <span className="font-normal text-fg-subtle"> {hint}</span>}
      </label>
      {children}
      {error && (
        <p role="alert" className={cn('mt-1 text-caption text-danger', errorClassName)}>
          {error}
        </p>
      )}
    </div>
  );
}
