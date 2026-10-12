import { useLayoutEffect, type RefObject } from 'react';

// Removes the copy if `transitionend` never fires, for example in a hidden tab.
const FALLBACK_REMOVE_MS = 1000;
// Attributes that would let the copy be found, focused or submitted as if it were the dialog.
const IDENTIFYING_ATTRIBUTES = ['id', 'name', 'role', 'tabindex', 'for', 'data-testid'];

function stripIdentity(element: Element) {
  for (const attribute of Array.from(element.attributes)) {
    if (IDENTIFYING_ATTRIBUTES.includes(attribute.name) || attribute.name.startsWith('aria-')) {
      element.removeAttribute(attribute.name);
    }
  }
}

function copyScrollPositions(source: HTMLElement, copy: HTMLElement) {
  const sourceElements = source.querySelectorAll('*');
  const copiedElements = copy.querySelectorAll('*');
  sourceElements.forEach((element, index) => {
    const copied = copiedElements[index];
    if (copied && (element.scrollTop || element.scrollLeft)) {
      copied.scrollTop = element.scrollTop;
      copied.scrollLeft = element.scrollLeft;
    }
  });
}

function playClosingTransition(root: HTMLElement) {
  const copy = root.cloneNode(true) as HTMLElement;
  for (const element of [copy, ...Array.from(copy.querySelectorAll('*'))]) stripIdentity(element);
  copy.setAttribute('aria-hidden', 'true');
  copy.inert = true;
  copy.style.pointerEvents = 'none';

  const layers = Array.from(copy.querySelectorAll<HTMLElement>('[data-modal-layer]'));
  // Show the copy open first: without this its entry transition would run again.
  for (const layer of layers) layer.style.transition = 'none';
  document.body.appendChild(copy);
  copyScrollPositions(root, copy);
  void copy.offsetHeight;
  for (const layer of layers) {
    layer.style.transition = '';
    layer.setAttribute('data-closing', '');
  }

  const remove = () => {
    window.clearTimeout(fallback);
    copy.remove();
  };
  const fallback = window.setTimeout(remove, FALLBACK_REMOVE_MS);
  const panel = layers.find((layer) => layer.dataset.modalLayer === 'panel');
  panel?.addEventListener('transitionend', (event) => {
    if (event.target === panel && event.propertyName === 'opacity') remove();
  });
}

/**
 * Plays the dialog's closing transition. Callers unmount a closed dialog at once, so the
 * transition runs on an inert copy of the overlay that is hidden from assistive technology,
 * ignores the pointer and is removed when the panel has faded out. The scrim and panel classes
 * animate the copy through `data-closing`.
 */
export function useExitTransition(rootRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    return () => {
      if (root.isConnected) playClosingTransition(root);
    };
  }, [rootRef]);
}
