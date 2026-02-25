import { QuroLogo } from "@/components/ui/QuroLogo";

// ─── Colour palette used in the mark ─────────────────────────────────────────

const palette = [
  { name: "Midnight",  hex: "#0d1627", role: "Background",      text: "text-white" },
  { name: "Deep Navy", hex: "#1b2550", role: "Background grad.", text: "text-white" },
  { name: "Indigo",    hex: "#6366f1", role: "Tail start",       text: "text-white" },
  { name: "Violet",    hex: "#818cf8", role: "Tail mid",         text: "text-white" },
  { name: "Purple",    hex: "#c084fc", role: "Tail tip",         text: "text-white" },
  { name: "White",     hex: "#ffffff", role: "Mark stroke",      text: "text-slate-700", border: true },
];

// ─── Sizes to preview ────────────────────────────────────────────────────────

const sizes = [
  { label: "App icon",  px: 192 },
  { label: "Card",      px: 96  },
  { label: "Button",    px: 48  },
  { label: "Favicon",   px: 32  },
  { label: "Sidebar",   px: 22  },
];

// ─── Don'ts list ─────────────────────────────────────────────────────────────

const donts = [
  "Don't rotate the mark",
  "Don't recolour the arc white in light contexts — use the inverted variant",
  "Don't add drop-shadows directly to the SVG mark",
  "Don't stretch or distort proportions",
  "Don't place on busy photographic backgrounds",
];

// ─── Brand Page ───────────────────────────────────────────────────────────────

export function Brand() {
  return (
    <div className="min-h-full bg-slate-50">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-[#0a0f1e] via-[#111830] to-[#1b2550] px-8 pt-16 pb-20 text-white">
        <div className="max-w-4xl mx-auto">
          <p className="text-[10px] tracking-[0.3em] uppercase text-indigo-400 mb-6">Brand Identity</p>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-8 mb-12">
            {/* Large mark */}
            <div className="relative flex-shrink-0">
              {/* Outer glow ring */}
              <div className="absolute inset-0 rounded-[38px] bg-indigo-500/20 blur-2xl scale-110" />
              <QuroLogo size={160} showBg className="relative drop-shadow-2xl" />
            </div>

            <div>
              <h1 className="text-5xl font-black tracking-tight text-white mb-2">Quro</h1>
              <p className="text-indigo-300 mb-4 max-w-sm">
                The abstract Q arc — a single continuous stroke that wraps, opens, and rises.
                The upward tail symbolises financial momentum; the centrepoint grounds the form.
              </p>
              <div className="flex flex-wrap gap-2">
                {["Abstract", "Geometric", "Finance", "Growth"].map((tag) => (
                  <span key={tag} className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-white/10 text-slate-300 uppercase tracking-wider">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Construction guide */}
          <div className="border border-white/10 rounded-2xl p-6 bg-white/5 backdrop-blur-sm">
            <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-5">Anatomy</p>
            <div className="flex items-center gap-10 flex-wrap">
              <div className="relative">
                {/* Annotated SVG */}
                <svg width="180" height="180" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Ghost ring */}
                  <circle cx="32" cy="32" r="20" fill="none" stroke="white" strokeWidth="4.8" strokeOpacity={0.06} />
                  {/* Main arc */}
                  <path d="M 37.18 51.32 A 20 20 0 1 1 49.32 42" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeOpacity={0.92} />
                  {/* Tail */}
                  <path d="M 49.32 42 Q 54.32 33.34 57 24" fill="none" stroke="url(#anatomy-tail)" strokeWidth="5" strokeLinecap="round" />
                  {/* Centre dot */}
                  <circle cx="32" cy="32" r="2.8" fill="white" fillOpacity={0.72} />

                  {/* Annotation lines */}
                  <line x1="32" y1="32" x2="13" y2="14" stroke="#6366f1" strokeWidth="0.6" strokeDasharray="2 1.5" />
                  <line x1="32" y1="32" x2="52" y2="10" stroke="#818cf8" strokeWidth="0.6" strokeDasharray="2 1.5" />
                  <line x1="37.18" y1="51.32" x2="10" y2="58" stroke="white" strokeWidth="0.6" strokeDasharray="2 1.5" strokeOpacity={0.4} />
                  <line x1="57" y1="24" x2="62" y2="14" stroke="#c084fc" strokeWidth="0.6" strokeDasharray="2 1.5" />

                  <defs>
                    <linearGradient id="anatomy-tail" x1="49.32" y1="42" x2="57" y2="24" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#818cf8" />
                      <stop offset="100%" stopColor="#c084fc" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>

              <div className="space-y-3 text-sm flex-1 min-w-[200px]">
                {[
                  { dot: "bg-white/80",         label: "Q Arc",       desc: "315° clockwise ring — the letterform anchor" },
                  { dot: "bg-white/10 border border-white/30", label: "Ghost ring",  desc: "Full circle at low opacity — depth layer" },
                  { dot: "bg-indigo-400",        label: "Tail",        desc: "Bezier sweep, tangent-smooth to arc end" },
                  { dot: "bg-purple-400",        label: "Tail tip",    desc: "Gradient endpoint — growth accent" },
                  { dot: "bg-white/50",          label: "Centre dot",  desc: "Grounds the composition visually" },
                ].map(({ dot, label, desc }) => (
                  <div key={label} className="flex items-start gap-3">
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-0.5 ${dot}`} />
                    <div>
                      <span className="font-semibold text-white text-xs">{label}</span>
                      <span className="text-slate-400 text-xs ml-2">{desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body content ──────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-8 py-12 space-y-14">

        {/* Mark sizes */}
        <section>
          <SectionHeader title="The Mark" sub="Renders cleanly from 22 px favicon to full app-icon scale" />
          <div className="flex items-end gap-6 flex-wrap mt-6">
            {sizes.map(({ label, px }) => (
              <div key={px} className="flex flex-col items-center gap-3">
                <div className="rounded-2xl bg-[#0d1627] p-4 flex items-center justify-center shadow-lg shadow-black/20">
                  <QuroLogo size={px} showBg={false} />
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold text-slate-700">{px}px</p>
                  <p className="text-[10px] text-slate-400">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Wordmark */}
        <section>
          <SectionHeader title="Wordmark" sub="Mark paired with the logotype — two lockup sizes" />
          <div className="grid sm:grid-cols-2 gap-4 mt-6">
            {/* Dark lockup */}
            <div className="rounded-2xl bg-[#0d1627] p-8 flex items-center gap-4 shadow-lg shadow-black/20">
              <QuroLogo size={52} showBg={false} />
              <div>
                <p className="text-2xl font-black tracking-tight text-white leading-none">Quro</p>
                <p className="text-[10px] text-indigo-400 tracking-[0.25em] uppercase mt-0.5">Finance</p>
              </div>
            </div>

            {/* Light lockup */}
            <div className="rounded-2xl bg-white border border-slate-100 p-8 flex items-center gap-4 shadow-sm">
              <QuroLogo size={52} showBg inverted={false} />
              <div>
                <p className="text-2xl font-black tracking-tight text-slate-900 leading-none">Quro</p>
                <p className="text-[10px] text-indigo-500 tracking-[0.25em] uppercase mt-0.5">Finance</p>
              </div>
            </div>
          </div>

          {/* Compact / icon-only */}
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-[#0d1627] p-6 flex items-center gap-3 shadow-lg shadow-black/20">
              <QuroLogo size={32} showBg={false} />
              <span className="text-sm font-bold tracking-tight text-white">Quro</span>
            </div>
            <div className="rounded-2xl bg-white border border-slate-100 p-6 flex items-center gap-3 shadow-sm">
              <QuroLogo size={32} showBg />
              <span className="text-sm font-bold tracking-tight text-slate-900">Quro</span>
            </div>
          </div>
        </section>

        {/* On backgrounds */}
        <section>
          <SectionHeader title="Context" sub="The mark adapts across dark and light surfaces" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            {[
              { bg: "bg-[#0d1627]",                label: "Midnight",    showBg: false,  inverted: false },
              { bg: "bg-gradient-to-br from-indigo-600 to-purple-700", label: "Brand gradient", showBg: false, inverted: false },
              { bg: "bg-white border border-slate-100", label: "White",   showBg: true,  inverted: false },
              { bg: "bg-slate-100",                label: "Slate",       showBg: false,  inverted: true  },
            ].map(({ bg, label, showBg: sb, inverted: inv }) => (
              <div key={label} className={`rounded-2xl ${bg} p-6 flex flex-col items-center gap-3 shadow-sm`}>
                <QuroLogo size={56} showBg={sb} inverted={inv} />
                <p className={`text-[10px] font-semibold uppercase tracking-widest ${inv || label === "White" ? "text-slate-500" : "text-slate-400"}`}>{label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Colour palette */}
        <section>
          <SectionHeader title="Colour System" sub="The five tones that define the Quro mark" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6">
            {palette.map(({ name, hex, role, text, border }) => (
              <div key={hex} className={`rounded-xl overflow-hidden shadow-sm ${border ? "border border-slate-200" : ""}`}>
                <div className="h-16" style={{ backgroundColor: hex }} />
                <div className="bg-white px-3 py-2.5">
                  <p className="text-xs font-semibold text-slate-800">{name}</p>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">{hex}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{role}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Spacing & clearspace */}
        <section>
          <SectionHeader title="Clearspace" sub="Always leave at least ½× the mark's height as breathing room on all sides" />
          <div className="mt-6 bg-white rounded-2xl border border-dashed border-slate-300 p-12 flex items-center justify-center shadow-sm">
            <div className="relative">
              {/* Clearspace guides */}
              <div className="absolute -inset-8 border border-dashed border-indigo-300 rounded-2xl" />
              <div className="absolute -inset-8 flex items-center justify-center">
                <span className="absolute top-2 text-[9px] text-indigo-400 font-mono">½×</span>
                <span className="absolute bottom-2 text-[9px] text-indigo-400 font-mono">½×</span>
                <span className="absolute left-2 rotate-90 text-[9px] text-indigo-400 font-mono">½×</span>
                <span className="absolute right-2 -rotate-90 text-[9px] text-indigo-400 font-mono">½×</span>
              </div>
              <QuroLogo size={80} showBg />
            </div>
          </div>
        </section>

        {/* Don'ts */}
        <section>
          <SectionHeader title="Usage Guidelines" sub="Keep the mark consistent and intentional" />
          <div className="mt-6 grid sm:grid-cols-2 gap-3">
            {donts.map((d) => (
              <div key={d} className="flex items-start gap-3 bg-white rounded-xl border border-slate-100 px-4 py-3 shadow-sm">
                <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-rose-500 text-[10px] font-black leading-none">✕</span>
                </div>
                <p className="text-xs text-slate-600">{d}</p>
              </div>
            ))}
            <div className="flex items-start gap-3 bg-white rounded-xl border border-slate-100 px-4 py-3 shadow-sm">
              <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-emerald-600 text-[10px] font-black leading-none">✓</span>
              </div>
              <p className="text-xs text-slate-600">Always use the provided SVG — never recreate the mark by hand</p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex items-end justify-between border-b border-slate-200 pb-3">
      <div>
        <h2 className="font-bold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}
