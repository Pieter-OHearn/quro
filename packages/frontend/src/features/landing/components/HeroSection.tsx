import { HERO_TRUST_BADGES } from '../utils/landing-data';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { AppPreview } from './AppPreview';
import { LANDING_CONTAINER_CLASS_NAME } from './landingStyles';

type HeroSectionProps = {
  onSignUp: () => void;
  onSignIn: () => void;
};

function HeroCtaButtons({ onSignUp, onSignIn }: Readonly<HeroSectionProps>) {
  return (
    <>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row">
        <Button size="lg" onClick={onSignUp} className="max-sm:h-12">
          Get started free
        </Button>
        <Button size="lg" variant="secondary" onClick={onSignIn}>
          Sign in to your account
        </Button>
      </div>
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-caption text-fg-muted">
        {HERO_TRUST_BADGES.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-1.5">
            <Icon size={14} className="text-brand" aria-hidden="true" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function HeroSection({ onSignUp, onSignIn }: Readonly<HeroSectionProps>) {
  return (
    <section
      className={cn(
        LANDING_CONTAINER_CLASS_NAME,
        'grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-2 lg:gap-16 lg:py-20',
      )}
    >
      <div>
        <p className="mb-3 text-label text-brand">Personal finance, beautifully simplified</p>
        {/* The largest style of the type scale: 600 weight at -0.02em letter spacing. */}
        <h1 className="mb-4 text-figure-hero text-fg">Your finances, beautifully organised.</h1>
        <p className="mb-6 max-w-lg text-body text-fg-muted">
          Quro unifies your savings, investments, mortgage, pension, salary and budget in one
          elegant dashboard — with full multi-currency support for wherever life takes you.
        </p>
        <HeroCtaButtons onSignUp={onSignUp} onSignIn={onSignIn} />
      </div>
      <AppPreview />
    </section>
  );
}
