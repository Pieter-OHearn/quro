import type { MouseEvent } from 'react';

/** Runs a row action without also triggering the click handler of the row it sits in. */
export function stopRowClick(handler: () => void) {
  return (event: MouseEvent) => {
    event.stopPropagation();
    handler();
  };
}
