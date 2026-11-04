/**
 * The two views of the Exposure tab. The switch, the `?view=` link and the default all read this
 * list.
 */
export const EXPOSURE_VIEWS = [
  { value: 'overview', label: 'Overview' },
  { value: 'brokerage', label: 'Brokerage' },
] as const;

export type ExposureViewKey = (typeof EXPOSURE_VIEWS)[number]['value'];

export const DEFAULT_EXPOSURE_VIEW: ExposureViewKey = 'overview';

/** The view a `?view=` value names; anything else opens the default one. */
export function resolveExposureView(value: string | null): ExposureViewKey {
  return EXPOSURE_VIEWS.find((view) => view.value === value)?.value ?? DEFAULT_EXPOSURE_VIEW;
}
