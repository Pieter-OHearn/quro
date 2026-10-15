// Shared layout and link classes for the signed-out pages.

/** Page width with the 16px phone gutter and the 24px desktop gutter. */
export const LANDING_CONTAINER_CLASS_NAME = 'mx-auto w-full max-w-6xl px-4 sm:px-6';

/** A section on the page ground, separated from the previous one by a rule. */
export const LANDING_SECTION_CLASS_NAME = 'border-t border-border-default py-12 sm:py-16';

/** A quiet text link: muted at rest, full colour on hover, with the focus outline of every control. */
export const LANDING_LINK_CLASS_NAME =
  'rounded-sm text-fg-muted transition-colors duration-fast hover:text-fg active:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring';
