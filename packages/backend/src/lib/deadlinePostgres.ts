import { checkWorkDeadline, currentWorkSignal, trackWork } from './workDeadline';

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
export function deadlinePostgres<T extends object>(sql: T): T {
  return new Proxy(sql, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      if (property === 'unsafe') {
        return (...args: unknown[]) => {
          checkWorkDeadline();
          return guardQuery(value.apply(target, args));
        };
      }
      if (property === 'begin' || property === 'savepoint') {
        return (...args: unknown[]) => {
          checkWorkDeadline();
          const wrapped = args.map((arg) =>
            typeof arg === 'function'
              ? (transaction: object) => (arg as TransactionCallback)(deadlinePostgres(transaction))
              : arg,
          );
          return trackWork(value.apply(target, wrapped) as Promise<unknown>);
        };
      }
      return value.bind(target);
    },
  });
}
