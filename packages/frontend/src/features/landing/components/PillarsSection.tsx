import { LANDING_PILLARS } from '../utils/landing-data';

export function PillarsSection() {
  return (
    <section className="bg-surface text-fg py-20 border-t border-border-subtle">
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid md:grid-cols-3 gap-6">
          {LANDING_PILLARS.map(({ icon: Icon, title, desc, color }) => (
            <div
              key={title}
              className="rounded-2xl border border-border-subtle p-6 hover:shadow-md transition-shadow"
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${color}`}
              >
                <Icon size={18} className="text-fg-inverted" />
              </div>
              <h3 className="font-bold text-fg mb-2">{title}</h3>
              <p className="text-sm text-fg-subtle leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
