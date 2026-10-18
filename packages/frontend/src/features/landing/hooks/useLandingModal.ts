import { useState } from 'react';
import type { ModalType } from '../types';
import { SSO_ERROR_PARAM, ssoErrorMessage } from '../utils/sso-error';

type LandingModalState = {
  modal: ModalType;
  closeModal: () => void;
  openSignIn: () => void;
  openSignUp: () => void;
};

export function useLandingModal(): LandingModalState {
  // A failed provider sign-in returns here with `?sso=<reason>`: open the sign-in form to show it.
  const [modal, setModal] = useState<ModalType>(() =>
    ssoErrorMessage(new URLSearchParams(window.location.search).get(SSO_ERROR_PARAM))
      ? 'signin'
      : null,
  );

  return {
    modal,
    closeModal: () => setModal(null),
    openSignIn: () => setModal('signin'),
    openSignUp: () => setModal('signup'),
  };
}
