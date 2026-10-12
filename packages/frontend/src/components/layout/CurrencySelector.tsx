import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useCurrency, CURRENCY_META, CURRENCY_CODES } from '@/lib/CurrencyContext';
import type { CurrencyCode } from '@/lib/CurrencyContext';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

type CurrencyDropdownProps = {
  baseCurrency: CurrencyCode;
  onSelect: (code: CurrencyCode) => void;
  ratesUpdatedAt: string | null;
};

function formatRatesUpdatedAt(updatedAt: string | null): string {
  if (!updatedAt) return 'Synced FX rates';

  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) return 'Synced FX rates';

  return `Rates updated ${parsed.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function CurrencyDropdown({ baseCurrency, onSelect, ratesUpdatedAt }: CurrencyDropdownProps) {
  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-border-default bg-surface shadow-popover">
      <div className="border-b border-border-subtle px-3 py-2">
        <p className="text-label text-fg-muted">Base currency</p>
        <p className="mt-0.5 text-caption text-fg-subtle">All totals convert to this currency</p>
      </div>
      <div className="max-h-72 overflow-y-auto py-1">
        {CURRENCY_CODES.map((code: CurrencyCode) => {
          const m = CURRENCY_META[code];
          const isSelected = code === baseCurrency;
          return (
            <button
              key={code}
              type="button"
              onClick={() => onSelect(code)}
              className={cn(
                'flex h-8 max-sm:h-11 w-full items-center gap-2 px-3 text-cell transition-colors duration-fast focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring',
                isSelected
                  ? 'bg-brand-soft font-semibold text-brand-fg'
                  : 'text-fg hover:bg-surface-muted active:bg-surface-muted',
              )}
            >
              <span className="text-body leading-none">{m.flag}</span>
              <span className="flex-1 truncate text-left">
                {code}
                <span className="ml-2 font-normal text-fg-subtle">{m.name}</span>
              </span>
              {isSelected && <Check size={14} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className="border-t border-border-subtle px-3 py-2 text-caption text-fg-subtle">
        {formatRatesUpdatedAt(ratesUpdatedAt)}
      </div>
    </div>
  );
}

export function CurrencySelector() {
  const { baseCurrency, setBaseCurrency, ratesUpdatedAt } = useCurrency();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const meta = CURRENCY_META[baseCurrency];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="secondary"
        size="md"
        className="gap-2 max-sm:gap-1 max-sm:px-2"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="text-body leading-none">{meta.flag}</span>
        <span>{baseCurrency}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={cn('text-fg-subtle transition-transform duration-fast', open && 'rotate-180')}
        />
      </Button>
      {open && (
        <CurrencyDropdown
          baseCurrency={baseCurrency}
          ratesUpdatedAt={ratesUpdatedAt}
          onSelect={(code) => {
            setBaseCurrency(code);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
