import { LANDING_FEATURES } from '../utils/landing-data';

export function FeaturesSection() {
  return (
    <section id="features" className="bg-white text-slate-900 py-20">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-3">
            Everything you need
          </p>
          <h2 className="font-black text-4xl tracking-tight text-slate-900 mb-4">
            One app. Every financial category.
          </h2>
          <p className="text-slate-500 max-w-lg mx-auto">
            Stop juggling spreadsheets. Quro gives you a dedicated tracker for every part of your
            financial life.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {LANDING_FEATURES.map(({ icon: Icon, label, desc, color, border }) => (
            <div
              key={label}
              className={`bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-lg transition-all duration-200 cursor-default ${border}`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${color}`}
              >
                <Icon size={18} />
              </div>
              <p className="font-bold text-slate-800 mb-1.5">{label}</p>
              <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
