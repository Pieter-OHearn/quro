type SectionIntroProps = {
  eyebrow: string;
  title: string;
  description?: string;
};

/** A section's label, title and optional line of text. */
export function SectionIntro({ eyebrow, title, description }: Readonly<SectionIntroProps>) {
  return (
    <div className="mb-8 max-w-xl">
      <p className="mb-2 text-label text-brand">{eyebrow}</p>
      <h2 className="text-title-page text-fg">{title}</h2>
      {description ? <p className="mt-2 text-body text-fg-muted">{description}</p> : null}
    </div>
  );
}
