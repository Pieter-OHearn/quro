import { createContext, useMemo, useState, type ReactNode } from 'react';
import { useModalPresence } from './useExitTransition';

type ModalPresenceValue = { open: boolean; onExited: () => void };

/**
 * The `open` and `onExited` a `ModalPresence` hands to the `Modal` inside it. A `Modal` resets it
 * for its own content, so a dialog opened from inside another one does not inherit it.
 */
export const ModalPresenceContext = createContext<ModalPresenceValue | null>(null);

type ModalPresenceProps = {
  open: boolean;
  /** The dialog, usually rendered only while it is open: `{editing && <EditDialog … />}`. */
  children: ReactNode;
};

/**
 * Keeps a dialog on screen until its closing transition has ended (`useModalPresence`), so every
 * dialog leaves with the fade, and the sheet slide on a phone, that it arrived with. While closing
 * it keeps showing the dialog it last rendered open, so the caller can clear the state the dialog
 * was opened for at once:
 *
 *     <ModalPresence open={editing !== null}>
 *       {editing && <EditDialog item={editing} onClose={() => setEditing(null)} />}
 *     </ModalPresence>
 */
export function ModalPresence({ open, children }: Readonly<ModalPresenceProps>) {
  const presence = useModalPresence(open);
  // The children last rendered while open, kept in state set during render: React's way to keep
  // a value from an earlier render.
  const [shown, setShown] = useState<ReactNode>(children);
  if (open && shown !== children) setShown(children);
  const value = useMemo(
    () => ({ open: presence.open, onExited: presence.onExited }),
    [presence.open, presence.onExited],
  );

  if (!presence.mounted) return null;
  return (
    <ModalPresenceContext.Provider value={value}>
      {open ? children : shown}
    </ModalPresenceContext.Provider>
  );
}
