import { inspect } from 'node:util';

const REDACTED = '[redacted]';

/**
 * Wraps a credential so it cannot leak by accident: logging, string interpolation, JSON
 * serialisation and `console.log` of an enclosing object all show `[redacted]`. Code that needs
 * the value calls `reveal()`, which makes every use easy to find.
 */
export class Secret {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [inspect.custom](): string {
    return REDACTED;
  }
}
