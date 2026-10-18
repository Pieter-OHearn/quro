import type { ExposureNotice } from '@quro/shared';
import { StateNotice } from '@/components/ui';

/**
 * Where the mix is concentrated, against the person's own thresholds. A notice states a figure
 * and the line it crossed; it never says what to do about it.
 */
export function ConcentrationNotices({
  notices,
}: Readonly<{ notices: readonly ExposureNotice[] }>) {
  if (notices.length === 0) return null;
  return (
    <section aria-label="Concentration notices" className="space-y-2">
      {notices.map((notice) => (
        <StateNotice
          key={notice.id}
          tone="info"
          title={notice.title}
          testId={`exposure-notice-${notice.id}`}
        >
          {notice.message}
        </StateNotice>
      ))}
    </section>
  );
}
