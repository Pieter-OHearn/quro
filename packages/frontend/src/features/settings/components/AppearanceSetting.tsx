import { useId } from 'react';
import { SunMoon } from 'lucide-react';
import { SegmentedControl, type SegmentedControlOption } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import type { ThemePreference } from '@/lib/theme';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const satisfies readonly SegmentedControlOption<ThemePreference>[];

/** Light, dark or system theme. Kept in this browser and applied at once, not by "Save changes". */
export function AppearanceSetting() {
  const labelId = useId();
  const { preference, setPreference } = useTheme();

  return (
    <div className="mb-8 border-t border-border-subtle pt-6">
      <p
        id={labelId}
        className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-fg-subtle"
      >
        <SunMoon size={14} className="text-brand" aria-hidden="true" />
        Appearance
      </p>
      <SegmentedControl
        aria-labelledby={labelId}
        options={THEME_OPTIONS}
        value={preference}
        onChange={setPreference}
        variant="soft"
      />
      <p className="mt-3 text-sm text-fg-subtle">
        System follows your device setting. Saved in this browser and applied straight away.
      </p>
    </div>
  );
}
