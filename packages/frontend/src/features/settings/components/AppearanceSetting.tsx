import { SegmentedControl, type SegmentedControlOption } from '@/components/ui';
import { SettingsCard } from './settingsForm';
import { useTheme } from '@/hooks/useTheme';
import type { ThemePreference } from '@/lib/theme';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const satisfies readonly SegmentedControlOption<ThemePreference>[];

/** Light, dark or system theme. Kept in this browser and applied at once, not by "Save changes". */
export function AppearanceSetting() {
  const { preference, setPreference } = useTheme();

  return (
    <SettingsCard title="Appearance">
      <div>
        <SegmentedControl
          aria-label="Appearance"
          options={THEME_OPTIONS}
          value={preference}
          onChange={setPreference}
          variant="soft"
        />
        <p className="mt-2 text-caption text-fg-subtle">
          System follows your device setting. Saved in this browser and applied straight away.
        </p>
      </div>
    </SettingsCard>
  );
}
