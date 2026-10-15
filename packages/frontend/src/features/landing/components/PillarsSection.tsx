import { Card } from '@/components/ui';
import { LANDING_PILLARS } from '../utils/landing-data';
import { LANDING_CONTAINER_CLASS_NAME, LANDING_SECTION_CLASS_NAME } from './landingStyles';

export function PillarsSection() {
  return (
    <section className={LANDING_SECTION_CLASS_NAME}>
      <ul className={`${LANDING_CONTAINER_CLASS_NAME} grid gap-4 md:grid-cols-3`}>
        {LANDING_PILLARS.map(({ icon: Icon, title, desc }) => (
          <li key={title}>
            <Card className="h-full">
              <h3 className="flex items-center gap-2 text-title-section text-fg">
                <Icon size={16} className="shrink-0 text-brand" aria-hidden="true" />
                {title}
              </h3>
              <p className="mt-1 text-cell text-fg-muted">{desc}</p>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
