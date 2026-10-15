import { HOW_IT_WORKS_STEPS } from '../utils/landing-data';
import { LANDING_CONTAINER_CLASS_NAME, LANDING_SECTION_CLASS_NAME } from './landingStyles';
import { SectionIntro } from './SectionIntro';

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className={LANDING_SECTION_CLASS_NAME}>
      <div className={LANDING_CONTAINER_CLASS_NAME}>
        <SectionIntro eyebrow="Simple by design" title="Up and running in minutes" />
        <ol className="grid gap-6 md:grid-cols-3">
          {HOW_IT_WORKS_STEPS.map(({ step, title, desc, icon: Icon }) => (
            <li key={step} className="border-t border-border-default pt-3">
              <p className="flex items-center gap-2 text-label text-fg-muted">
                <Icon size={14} className="text-brand" aria-hidden="true" />
                Step {step}
              </p>
              <h3 className="mt-2 text-title-section text-fg">{title}</h3>
              <p className="mt-1 text-cell text-fg-muted">{desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
