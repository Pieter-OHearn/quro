import {
  ASSET_CLASSES,
  CONCENTRATION_THRESHOLD_KEYS,
  MIX_GROUPS,
  REFERENCE_MIX_IDS,
  type AssetClass,
  type ConcentrationThresholdKey,
  type ExposureSettings,
  type MixGroup,
  type ReferenceMixId,
} from '@quro/shared';

type RangeForm = { min: string; max: string };

export type Form = {
  risk: Record<AssetClass, string>;
  mixes: Record<ReferenceMixId, Record<MixGroup, RangeForm>>;
  selectedMix: string;
  thresholds: Record<ConcentrationThresholdKey, string>;
  noticesEnabled: Record<ConcentrationThresholdKey, boolean>;
};

export function toForm(settings: ExposureSettings): Form {
  return {
    risk: Object.fromEntries(
      ASSET_CLASSES.map((assetClass) => [
        assetClass,
        settings.riskByAssetClass[assetClass] === null
          ? ''
          : String(settings.riskByAssetClass[assetClass]),
      ]),
    ) as Form['risk'],
    mixes: Object.fromEntries(
      REFERENCE_MIX_IDS.map((id) => [
        id,
        Object.fromEntries(
          MIX_GROUPS.map((group) => [
            group,
            {
              min: String(settings.referenceMixes[id][group].min),
              max: String(settings.referenceMixes[id][group].max),
            },
          ]),
        ),
      ]),
    ) as Form['mixes'],
    selectedMix: settings.selectedMix ?? '',
    thresholds: Object.fromEntries(
      CONCENTRATION_THRESHOLD_KEYS.map((key) => [key, String(settings.thresholds[key])]),
    ) as Form['thresholds'],
    noticesEnabled: { ...settings.noticesEnabled },
  };
}

// An empty or non-numeric box becomes NaN, which the shared validation refuses with a message.
function toNumber(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}

export function toSettings(form: Form): unknown {
  return {
    version: 1,
    riskByAssetClass: Object.fromEntries(
      ASSET_CLASSES.map((assetClass) => [
        assetClass,
        form.risk[assetClass] === '' ? null : Number(form.risk[assetClass]),
      ]),
    ),
    referenceMixes: Object.fromEntries(
      REFERENCE_MIX_IDS.map((id) => [
        id,
        Object.fromEntries(
          MIX_GROUPS.map((group) => [
            group,
            { min: toNumber(form.mixes[id][group].min), max: toNumber(form.mixes[id][group].max) },
          ]),
        ),
      ]),
    ),
    selectedMix: form.selectedMix === '' ? null : form.selectedMix,
    thresholds: Object.fromEntries(
      CONCENTRATION_THRESHOLD_KEYS.map((key) => [key, toNumber(form.thresholds[key])]),
    ),
    noticesEnabled: { ...form.noticesEnabled },
  };
}
