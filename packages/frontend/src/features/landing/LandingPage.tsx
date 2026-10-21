import {
  CtaSection,
  FeaturesSection,
  HeroSection,
  HowItWorksSection,
  LandingFooter,
  Navbar,
  PillarsSection,
  SignInModal,
  SignUpModal,
} from './components';
import { useLandingModal, useRegistrationPolicy } from './hooks';

export function LandingPage() {
  // Read the sign-in options now, so the sign-in form opens with them.
  useRegistrationPolicy();
  const { modal, closeModal, openSignIn, openSignUp } = useLandingModal();

  return (
    <div className="min-h-screen bg-surface-sunken pt-[calc(1rem+env(safe-area-inset-top))] text-fg">
      {modal === 'signin' && <SignInModal onClose={closeModal} onSwitchToSignUp={openSignUp} />}
      {modal === 'signup' && <SignUpModal onClose={closeModal} onSwitchToSignIn={openSignIn} />}
      <Navbar onSignIn={openSignIn} onSignUp={openSignUp} />
      <HeroSection onSignUp={openSignUp} onSignIn={openSignIn} />
      <FeaturesSection />
      <HowItWorksSection />
      <PillarsSection />
      <CtaSection onSignUp={openSignUp} onSignIn={openSignIn} />
      <LandingFooter />
    </div>
  );
}
