import { describe, expect, test } from 'bun:test';
import { exitCodeFor, s3FailureKind, type DoctorCheck } from './doctor';
import { EXIT_FAILURE, EXIT_OK, EXIT_REFUSED, EXIT_UNAVAILABLE, EXIT_USAGE } from './io';

const failed = (failure: DoctorCheck['failure']): DoctorCheck => ({
  id: 'check',
  status: 'fail',
  failure,
  message: 'failed',
});

describe('doctor exit codes', () => {
  test('settings come first, then unreachable services, refusals and failures', () => {
    expect(exitCodeFor([{ id: 'ok', status: 'ok', message: '' }])).toBe(EXIT_OK);
    expect(exitCodeFor([{ id: 'warn', status: 'warn', message: '' }])).toBe(EXIT_OK);
    expect(exitCodeFor([failed('failed'), failed('refused')])).toBe(EXIT_REFUSED);
    expect(exitCodeFor([failed('refused'), failed('unreachable')])).toBe(EXIT_UNAVAILABLE);
    expect(exitCodeFor([failed('unreachable'), failed('settings')])).toBe(EXIT_USAGE);
    expect(exitCodeFor([failed('failed')])).toBe(EXIT_FAILURE);
  });

  test('an S3 store that rejects the key is a settings problem, a missing bucket a failure', () => {
    const withStatus = (httpStatusCode: number) => ({ $metadata: { httpStatusCode } });
    expect(s3FailureKind(withStatus(403))).toBe('settings');
    expect(s3FailureKind(withStatus(401))).toBe('settings');
    expect(s3FailureKind(withStatus(404))).toBe('failed');
    expect(s3FailureKind(new Error('connect ECONNREFUSED'))).toBe('unreachable');
  });
});
