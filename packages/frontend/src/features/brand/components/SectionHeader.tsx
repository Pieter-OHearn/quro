type SectionHeaderProps = {
  readonly title: string;
  readonly sub: string;
};

export function SectionHeader({ title, sub }: Readonly<SectionHeaderProps>) {
  return (
    <div className="flex items-end justify-between border-b border-slate-200 pb-3">
      <div>
        <h2 className="font-bold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}
