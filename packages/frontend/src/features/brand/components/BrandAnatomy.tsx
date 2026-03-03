import type { BrandAnatomyItem } from '../types';

type BrandAnatomyProps = {
  readonly anatomyItems: readonly BrandAnatomyItem[];
};

function AnatomySvgPaths() {
  return (
    <>
      <circle
        cx="32"
        cy="32"
        r="20"
        fill="none"
        stroke="white"
        strokeWidth="4.8"
        strokeOpacity={0.06}
      />
      <path
        d="M 37.18 51.32 A 20 20 0 1 1 49.32 42"
        fill="none"
        stroke="white"
        strokeWidth="5"
        strokeLinecap="round"
        strokeOpacity={0.92}
      />
      <path
        d="M 49.32 42 Q 54.32 33.34 57 24"
        fill="none"
        stroke="url(#anatomy-tail)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="32" cy="32" r="2.8" fill="white" fillOpacity={0.72} />
    </>
  );
}

function AnatomyTailGradient() {
  return (
    <defs>
      <linearGradient
        id="anatomy-tail"
        x1="49.32"
        y1="42"
        x2="57"
        y2="24"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0%" stopColor="#818cf8" />
        <stop offset="100%" stopColor="#c084fc" />
      </linearGradient>
    </defs>
  );
}

function AnatomySvgLines() {
  return (
    <>
      <line
        x1="32"
        y1="32"
        x2="13"
        y2="14"
        stroke="#6366f1"
        strokeWidth="0.6"
        strokeDasharray="2 1.5"
      />
      <line
        x1="32"
        y1="32"
        x2="52"
        y2="10"
        stroke="#818cf8"
        strokeWidth="0.6"
        strokeDasharray="2 1.5"
      />
      <line
        x1="37.18"
        y1="51.32"
        x2="10"
        y2="58"
        stroke="white"
        strokeWidth="0.6"
        strokeDasharray="2 1.5"
        strokeOpacity={0.4}
      />
      <line
        x1="57"
        y1="24"
        x2="62"
        y2="14"
        stroke="#c084fc"
        strokeWidth="0.6"
        strokeDasharray="2 1.5"
      />
      <AnatomyTailGradient />
    </>
  );
}

function AnatomySvg() {
  return (
    <svg
      width="180"
      height="180"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <AnatomySvgPaths />
      <AnatomySvgLines />
    </svg>
  );
}

function AnatomyLegend({ anatomyItems }: Readonly<BrandAnatomyProps>) {
  return (
    <div className="space-y-3 text-sm flex-1 min-w-[200px]">
      {anatomyItems.map(({ dot, label, desc }) => (
        <div key={label} className="flex items-start gap-3">
          <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-0.5 ${dot}`} />
          <div>
            <span className="font-semibold text-white text-xs">{label}</span>
            <span className="text-slate-400 text-xs ml-2">{desc}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function BrandAnatomy({ anatomyItems }: Readonly<BrandAnatomyProps>) {
  return (
    <div className="border border-white/10 rounded-2xl p-6 bg-white/5 backdrop-blur-sm">
      <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-5">
        Anatomy
      </p>
      <div className="flex items-center gap-10 flex-wrap">
        <div className="relative">
          <AnatomySvg />
        </div>
        <AnatomyLegend anatomyItems={anatomyItems} />
      </div>
    </div>
  );
}
