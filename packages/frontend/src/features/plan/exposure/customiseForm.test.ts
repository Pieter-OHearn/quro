import { describe, expect, test } from 'bun:test';
import { defaultExposureSettings, parseExposureSettings } from '@quro/shared';
import { toForm, toSettings } from './customiseForm';

describe('customise form', () => {
  test('round-trips the defaults into valid settings', () => {
    const parsed = parseExposureSettings(toSettings(toForm(defaultExposureSettings())));
    expect(parsed).toEqual({ ok: true, value: defaultExposureSettings() });
  });

  test('keeps a chosen mix, an unrated class and an edited threshold', () => {
    const settings = defaultExposureSettings();
    settings.selectedMix = 'D';
    settings.riskByAssetClass.crypto = null;
    settings.thresholds.sectorPct = 25.5;
    settings.noticesEnabled.currencyPct = true;
    const form = toForm(settings);
    expect(form.noticesEnabled.currencyPct).toBe(true);
    expect(toForm(defaultExposureSettings()).noticesEnabled.currencyPct).toBe(false);
    expect(form.selectedMix).toBe('D');
    expect(form.risk.crypto).toBe('');
    expect(form.thresholds.sectorPct).toBe('25.5');
    expect(parseExposureSettings(toSettings(form))).toEqual({ ok: true, value: settings });
  });

  test('a blank or out-of-range box fails validation with a message in words', () => {
    const form = toForm(defaultExposureSettings());
    form.thresholds.topThreePct = '';
    form.mixes.A.stocks.max = '140';
    const parsed = parseExposureSettings(toSettings(form));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors).toContain(
      'Threshold for three largest holdings must be a number from 0 to 100',
    );
    expect(parsed.errors.some((error) => error.startsWith('Reference mix A, stocks maximum'))).toBe(
      true,
    );
  });

  test('a minimum above its maximum is refused', () => {
    const form = toForm(defaultExposureSettings());
    form.mixes.B.bonds = { min: '60', max: '40' };
    const parsed = parseExposureSettings(toSettings(form));
    expect(parsed.ok).toBe(false);
  });
});
