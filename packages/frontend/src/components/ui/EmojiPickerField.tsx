import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { cn } from '@/lib/utils';

type EmojiPickerFieldProps = {
  label?: string;
  value: string;
  onChange: (emoji: string) => void;
  error?: string;
  title?: string;
  pickerHeight?: number;
  pickerWidth?: number;
  containerClassName?: string;
  buttonClassName?: string;
};

const PICKER_FLIP_MARGIN = 12;
const PICKER_VERTICAL_OFFSET = 6;
const DEFAULT_PICKER_HEIGHT = 380;
const DEFAULT_PICKER_WIDTH = 300;

function getPickerPos(buttonEl: HTMLButtonElement, pickerWidth: number, pickerHeight: number) {
  const rect = buttonEl.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const viewportPadding = 8;

  let left = rect.left;
  if (left + pickerWidth > window.innerWidth - viewportPadding) {
    left = Math.max(viewportPadding, window.innerWidth - pickerWidth - viewportPadding);
  }

  if (spaceBelow < pickerHeight + PICKER_FLIP_MARGIN) {
    return {
      position: 'fixed' as const,
      bottom: window.innerHeight - rect.top + PICKER_VERTICAL_OFFSET,
      left,
      zIndex: 9999,
    };
  }

  return {
    position: 'fixed' as const,
    top: rect.bottom + PICKER_VERTICAL_OFFSET,
    left,
    zIndex: 9999,
  };
}

function getButtonBorderClass(error: string | undefined, open: boolean): string {
  if (error) return 'border-rose-300 bg-rose-50';
  if (open) return 'border-indigo-400 bg-indigo-50';
  return 'border-slate-200 bg-slate-50';
}

function useOutsideClose(
  open: boolean,
  pickerRef: React.RefObject<HTMLDivElement | null>,
  buttonRef: React.RefObject<HTMLButtonElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      const outsidePicker = pickerRef.current && !pickerRef.current.contains(target);
      const outsideButton = buttonRef.current && !buttonRef.current.contains(target);
      if (outsidePicker && outsideButton) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, pickerRef, buttonRef, onClose]);
}

type PickerPortalProps = {
  pickerRef: React.RefObject<HTMLDivElement | null>;
  pickerStyle: React.CSSProperties;
  onChange: (emoji: string) => void;
  onClose: () => void;
  pickerHeight: number;
  pickerWidth: number;
};

function PickerPortal({
  pickerRef,
  pickerStyle,
  onChange,
  onClose,
  pickerHeight,
  pickerWidth,
}: PickerPortalProps) {
  return createPortal(
    <div ref={pickerRef} style={pickerStyle}>
      <EmojiPicker
        onEmojiClick={(data: EmojiClickData) => {
          onChange(data.emoji);
          onClose();
        }}
        height={pickerHeight}
        width={pickerWidth}
        previewConfig={{ showPreview: false }}
      />
    </div>,
    document.body,
  );
}

export function EmojiPickerField({
  label = 'Icon',
  value,
  onChange,
  error,
  title = 'Pick an emoji',
  pickerHeight = DEFAULT_PICKER_HEIGHT,
  pickerWidth = DEFAULT_PICKER_WIDTH,
  containerClassName,
  buttonClassName,
}: EmojiPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useOutsideClose(open, pickerRef, buttonRef, () => setOpen(false));

  const pickerStyle = buttonRef.current
    ? getPickerPos(buttonRef.current, pickerWidth, pickerHeight)
    : { position: 'fixed' as const, top: 24, left: 12, zIndex: 9999 };

  return (
    <div className={cn('flex-shrink-0', containerClassName)}>
      {label && (
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-14 h-[42px] rounded-xl border text-xl flex items-center justify-center transition-all hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-300',
          getButtonBorderClass(error, open),
          buttonClassName,
        )}
        title={title}
      >
        {value}
      </button>
      {open && typeof document !== 'undefined' && (
        <PickerPortal
          pickerRef={pickerRef}
          pickerStyle={pickerStyle}
          onChange={onChange}
          onClose={() => setOpen(false)}
          pickerHeight={pickerHeight}
          pickerWidth={pickerWidth}
        />
      )}
      {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
    </div>
  );
}
