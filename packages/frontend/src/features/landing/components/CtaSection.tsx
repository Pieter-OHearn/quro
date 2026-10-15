import { Button, QuroLogo } from '@/components/ui';
import { LANDING_CONTAINER_CLASS_NAME, LANDING_SECTION_CLASS_NAME } from './landingStyles';

type CtaSectionProps = {
  onSignUp: () => void;
  onSignIn: () => void;
};

export function CtaSection({ onSignUp, onSignIn }: Readonly<CtaSectionProps>) {
  return (
    <section className={LANDING_SECTION_CLASS_NAME}>
      <div className={`${LANDING_CONTAINER_CLASS_NAME} flex flex-col items-center text-center`}>
        <QuroLogo size={40} className="mb-4" />
        <h2 className="text-title-page text-fg">Take control of your financial future</h2>
        <p className="mt-2 max-w-xl text-body text-fg-muted">
          Join Quro and get the clarity your finances deserve — completely free.
        </p>
        <div className="mt-6 flex w-full flex-col justify-center gap-2 sm:w-auto sm:flex-row">
          <Button size="lg" onClick={onSignUp} className="max-sm:h-12">
            Create free account
          </Button>
          <Button size="lg" variant="secondary" onClick={onSignIn}>
            Sign in
          </Button>
        </div>
      </div>
    </section>
  );
}
