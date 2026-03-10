import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../../atoms';

export type ModalProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
  scrollable?: boolean;
};

const MAX_WIDTH_MAP = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
} as const;

type ModalHeaderProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  scrollable?: boolean;
};

function ModalHeader({ title, subtitle, onClose, scrollable }: ModalHeaderProps) {
  return (
    <div
      className={cn(
        'bg-gradient-to-r from-[#0a0f1e] to-[#1a1f3e] px-6 py-5 flex items-center justify-between',
        scrollable && 'flex-shrink-0',
      )}
    >
      <div>
        <h2 className="font-bold text-white">{title}</h2>
        {subtitle && <p className="text-xs text-indigo-300 mt-0.5">{subtitle}</p>}
      </div>
      <button
        onClick={onClose}
        className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
      >
        <X size={18} />
      </button>
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  maxWidth = 'md',
  children,
  footer,
  scrollable,
}: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative bg-white rounded-2xl shadow-2xl w-full overflow-hidden',
          MAX_WIDTH_MAP[maxWidth],
          scrollable && 'flex flex-col max-h-[90vh]',
        )}
      >
        <ModalHeader title={title} subtitle={subtitle} onClose={onClose} scrollable={scrollable} />
        <div className={cn('p-6 space-y-5', scrollable && 'overflow-y-auto')}>{children}</div>
        {footer && (
          <div
            className={cn(
              'px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3',
              scrollable && 'flex-shrink-0',
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export type ModalFooterProps = {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  danger?: React.ReactNode;
};

export function ModalFooter({
  onCancel,
  onConfirm,
  confirmLabel = 'Save',
  cancelLabel = 'Cancel',
  disabled,
  loading,
  danger,
}: ModalFooterProps) {
  return (
    <>
      {danger}
      <Button onClick={onCancel} variant="secondary" size="lg" className="flex-1">
        {cancelLabel}
      </Button>
      <Button
        onClick={onConfirm}
        disabled={disabled}
        variant="primary"
        size="lg"
        loading={loading}
        loadingLabel="Saving..."
        className="flex-1"
      >
        {confirmLabel}
      </Button>
    </>
  );
}
