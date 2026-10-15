import { Card } from '@/components/ui';
import { LANDING_FEATURES } from '../utils/landing-data';
import { LANDING_CONTAINER_CLASS_NAME, LANDING_SECTION_CLASS_NAME } from './landingStyles';
import { SectionIntro } from './SectionIntro';

export function FeaturesSection() {
  return (
    <section id="features" className={LANDING_SECTION_CLASS_NAME}>
      <div className={LANDING_CONTAINER_CLASS_NAME}>
        <SectionIntro
          eyebrow="Everything you need"
          title="One app. Every financial category."
          description="Stop juggling spreadsheets. Quro gives you a dedicated tracker for every part of your financial life."
        />
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LANDING_FEATURES.map(({ icon: Icon, label, desc }) => (
            <li key={label}>
              <Card className="h-full">
                <h3 className="flex items-center gap-2 text-title-section text-fg">
                  <Icon size={16} className="shrink-0 text-brand" aria-hidden="true" />
                  {label}
                </h3>
                <p className="mt-1 text-cell text-fg-muted">{desc}</p>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
