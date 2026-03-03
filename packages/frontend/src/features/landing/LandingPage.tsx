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
import { useLandingModal } from './hooks';

export function LandingPage() {
  const { modal, closeModal, openSignIn, openSignUp } = useLandingModal();

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
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
