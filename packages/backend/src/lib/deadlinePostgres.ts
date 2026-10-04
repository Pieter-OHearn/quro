import {
  checkWorkDeadline,
  currentWorkSignal,
  currentWorkDatabase,
  trackWork,
} from './workDeadline';

type PendingQuery = {
  cancel?: () => void;
  then: (
    resolve?: (value: unknown) => unknown,
    reject?: (error: unknown) => unknown,
  ) => Promise<unknown>;
};

function guardQuery<T>(pending: T): T {
  const query = pending as unknown as PendingQuery;
  const originalThen = query.then;
  query.then = function (resolve, reject) {
    try {
      checkWorkDeadline();
    } catch (error) {
      return Promise.reject(error).then(resolve, reject);
    }
    const signal = currentWorkSignal();
    const cancel = () => query.cancel?.();
    signal?.addEventListener('abort', cancel, { once: true });
    const running = originalThen
      .call(this)
      .finally(() => signal?.removeEventListener('abort', cancel));
    return trackWork(running).then(resolve, reject);
  };
  return pending;
}

type TransactionCallback = (sql: object) => unknown;

// Reject new queries after a job deadline, including queries in error handlers.
// Already-started queries/transactions drain before the scheduler unlocks.
export function deadlinePostgres<T extends object>(sql: T, scopedRoot = false): T {
  const activeTarget = () => (scopedRoot ? (currentWorkDatabase() ?? sql) : sql);
  return new Proxy(sql, {
    apply(_target, thisArg, args) {
      checkWorkDeadline();
      const pending: unknown = Reflect.apply(
        activeTarget() as (...args: unknown[]) => unknown,
        thisArg,
        args,
      );
      // Identifier/build helpers are not executable queries.
      return pending && typeof (pending as PendingQuery).then === 'function'
        ? guardQuery(pending)
        : pending;
    },
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      if (property === 'unsafe') {
        return (...args: unknown[]) => {
          checkWorkDeadline();
          const active = activeTarget();
          return guardQuery(Reflect.get(active, property).apply(active, args));
        };
      }
      if (property === 'begin' || property === 'savepoint') {
        return (...args: unknown[]) => {
          checkWorkDeadline();
          const wrapped = args.map((arg) =>
            typeof arg === 'function'
              ? async (transaction: object) => {
                  const result = await (arg as TransactionCallback)(deadlinePostgres(transaction));
                  checkWorkDeadline();
                  return result;
                }
              : arg,
          );
          const active = activeTarget();
          return trackWork(
            Reflect.get(active, property).apply(active, wrapped) as Promise<unknown>,
          );
        };
      }
      return value.bind(target);
    },
  });
}
