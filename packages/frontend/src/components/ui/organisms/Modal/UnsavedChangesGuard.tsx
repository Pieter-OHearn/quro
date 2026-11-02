import { useState } from 'react';
import type { Blocker } from 'react-router';
import { Button } from '../../atoms';
import { Modal } from './Modal';
import { ModalPresence } from './ModalPresence';
import { NavigationBlocker, useBeforeUnloadWarning } from './useUnsavedChanges';

/**
 * The unsaved-changes guard of a form on a page (a dialog has its own, in `Modal`). While `when`
 * holds, closing or reloading the page asks through the browser, and leaving the route (a link,
 * the back button, another settings tab) asks "Discard your changes?" first.
 */
export function UnsavedChangesGuard({ when }: Readonly<{ when: boolean }>) {
  const [blocker, setBlocker] = useState<Blocker | null>(null);
  useBeforeUnloadWarning(when);
  const keepEditing = () => {
    blocker?.reset?.();
    setBlocker(null);
  };
  const discardChanges = () => {
    blocker?.proceed?.();
    setBlocker(null);
  };

  return (
    <>
      {when && <NavigationBlocker onBlocked={setBlocker} />}
      <ModalPresence open={blocker !== null}>
        {blocker && (
          <Modal
            title="Discard your changes?"
            onClose={keepEditing}
            confirmDiscard={false}
            maxWidth="sm"
            footer={
              <>
                <Button variant="secondary" onClick={keepEditing} autoFocus>
                  Keep editing
                </Button>
                <Button variant="dangerSolid" onClick={discardChanges}>
                  Discard changes
                </Button>
              </>
            }
          >
            <p className="text-fg-muted">Your edits on this page are not saved yet.</p>
          </Modal>
        )}
      </ModalPresence>
    </>
  );
}
