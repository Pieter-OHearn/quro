import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { cn } from "@/lib/utils";

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

export function EmojiPickerField({
  label = "Icon",
  value,
  onChange,
  error,
  title = "Pick an emoji",
  pickerHeight = 380,
  pickerWidth = 300,
  containerClassName,
  buttonClassName,
}: EmojiPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handler = (event: MouseEvent) => {
      if (
        pickerRef.current && !pickerRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const getPickerPos = () => {
    if (!buttonRef.current) return { position: "fixed" as const, top: 24, left: 12, zIndex: 9999 };

    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const viewportPadding = 8;

    let left = rect.left;
    if (left + pickerWidth > window.innerWidth - viewportPadding) {
      left = Math.max(viewportPadding, window.innerWidth - pickerWidth - viewportPadding);
    }

    if (spaceBelow < pickerHeight + 12) {
      return { position: "fixed" as const, bottom: window.innerHeight - rect.top + 6, left, zIndex: 9999 };
    }

    return { position: "fixed" as const, top: rect.bottom + 6, left, zIndex: 9999 };
  };

  return (
    <div className={cn("flex-shrink-0", containerClassName)}>
      {label && <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-14 h-[42px] rounded-xl border text-xl flex items-center justify-center transition-all hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-300",
          error
            ? "border-rose-300 bg-rose-50"
            : open
            ? "border-indigo-400 bg-indigo-50"
            : "border-slate-200 bg-slate-50",
          buttonClassName
        )}
        title={title}
      >
        {value}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div ref={pickerRef} style={getPickerPos()}>
          <EmojiPicker
            onEmojiClick={(data: EmojiClickData) => {
              onChange(data.emoji);
              setOpen(false);
            }}
            height={pickerHeight}
            width={pickerWidth}
            previewConfig={{ showPreview: false }}
          />
        </div>,
        document.body
      )}
      {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
    </div>
  );
}
