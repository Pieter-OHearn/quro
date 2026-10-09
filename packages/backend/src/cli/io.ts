export type CommandIo = {
  out: (line: string) => void;
  err: (line: string) => void;
};

export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 2;
/** A dependency such as the database or the document store cannot be reached (install contract). */
export const EXIT_UNAVAILABLE = 4;

/** A command-line mistake: printed with the relevant usage text and exit code 2. */
export class UsageError extends Error {}
