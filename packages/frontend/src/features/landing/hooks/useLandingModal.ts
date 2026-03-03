import { useState } from 'react';
import type { ModalType } from '../types';

type LandingModalState = {
  modal: ModalType;
  closeModal: () => void;
  openSignIn: () => void;
  openSignUp: () => void;
};

export function useLandingModal(): LandingModalState {
  const [modal, setModal] = useState<ModalType>(null);

  return {
    modal,
    closeModal: () => setModal(null),
    openSignIn: () => setModal('signin'),
    openSignUp: () => setModal('signup'),
  };
}
