import { HOW_IT_WORKS_STEPS } from '../utils/landing-data';

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="bg-surface-sunken text-fg py-20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-14">
          <p className="text-xs font-semibold text-brand uppercase tracking-widest mb-3">
            Simple by design
          </p>
          <h2 className="font-black text-4xl tracking-tight text-fg">Up and running in minutes</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {HOW_IT_WORKS_STEPS.map(({ step, title, desc, icon: Icon, color }) => (
            <div key={step}>
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${color}`}
              >
                <Icon size={22} />
              </div>
              <p className="text-[10px] font-bold text-fg-faint tracking-widest uppercase mb-1.5">
                Step {step}
              </p>
              <h3 className="font-bold text-fg mb-2">{title}</h3>
              <p className="text-sm text-fg-subtle leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
