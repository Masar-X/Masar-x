// Issue #280 — logger error-detail preservation, tested black-box through
// logger.error: the private summarizeError/normalizeError/extractErrorFacts
// are observable via the console args and the Sentry envelope payload.
// logger.ts is DOM-free → runs in the node vitest project.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '../logger';

const withCause = (message: string, cause: unknown): Error => {
  const e = new Error(message);
  (e as Error & { cause?: unknown }).cause = cause;
  return e;
};

describe('logger.error console path', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('prefixes the summary and keeps the structured error object', () => {
    logger.error('label', new Error('boom'));

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [first, second] = errorSpy.mock.calls[0];
    expect(first).toBe('[ERROR] label: boom');
    expect(second).toMatchObject({
      error: {
        name: 'Error',
        message: 'boom',
        stack: expect.any(String),
      },
      timestamp: expect.any(String),
    });
  });

  it('REGRESSION: generic Error cause chains surface in the summary string', () => {
    // The layout workaround hand-rolled `| cause: <msg>` for exactly this
    // shape before passing only a composed string (#280).
    const err = withCause('wrapper failed', new Error('root cause'));
    logger.error('label', err);

    const [first] = errorSpy.mock.calls[0];
    expect(first).toBe('[ERROR] label: wrapper failed | cause: root cause');
  });

  it('walks multi-level cause chains in order', () => {
    const err = withCause(
      'top',
      withCause('middle', new Error('bottom')),
    );
    logger.error('label', err);

    const [first] = errorSpy.mock.calls[0];
    expect(first).toBe('[ERROR] label: top | cause: middle | cause: bottom');
  });

  it('PG-shaped causes keep their dedicated pipe formatting', () => {
    const err = withCause('insert failed', {
      code: '23503',
      message: 'foreign key violation',
      detail: 'Key is not present in table',
      table: 'quiz_questions',
    });
    logger.error('label', err);

    const [first, second] = errorSpy.mock.calls[0];
    expect(first).toBe(
      '[ERROR] label: insert failed | cause: foreign key violation | detail: Key is not present in table | [23503] | table=public.quiz_questions',
    );
    expect(second).toMatchObject({
      error: {
        pg: { code: '23503', table: 'quiz_questions' },
      },
    });
  });

  it('bounds cycle-safe cause walks (no infinite loop)', () => {
    const a = new Error('a');
    const b = withCause('b', a);
    (a as Error & { cause?: unknown }).cause = b; // cycle a → b → a

    // The seen-set + depth bound terminate deterministically: each node in
    // the cycle is visited once before the walk stops.
    expect(() => logger.error('label', b)).not.toThrow();
    const [first] = errorSpy.mock.calls[0];
    expect(first).toBe('[ERROR] label: b | cause: a | cause: b');
  });

  it('non-Error inputs degrade to the message-only fallback', () => {
    logger.error('label', 'string err');

    const [first, second] = errorSpy.mock.calls[0];
    expect(first).toBe('[ERROR] label');
    expect(second).toMatchObject({ error: { message: 'string err' } });
  });
});

describe('logger.error Sentry envelope (#280 cause/pg forwarding)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchSpy);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // parseSentryDsn is memoized at module level → fresh module per case.
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function importLoggerWithDsn(dsn: string | undefined) {
    if (dsn) vi.stubEnv('SENTRY_DSN', dsn);
    else vi.stubEnv('SENTRY_DSN', '');
    const mod = await import('../logger');
    return mod.logger.error as (message: string, error?: unknown) => void;
  }

  it('forwards cause chain + pg facts into the envelope extra', async () => {
    const dsn = 'https://key123@o.ingest.sentry.io/1234567';
    const errorLogger = await importLoggerWithDsn(dsn);

    const err = withCause('insert failed', {
      code: '23503',
      message: 'foreign key violation',
    });
    const generic = withCause('wrapped', new Error('deep cause'));
    errorLogger('pg one', err);
    errorLogger('generic one', generic);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const bodies = fetchSpy.mock.calls.map(
      (c) => (c[1] as { body: string }).body,
    );
    const pgEvent = JSON.parse(bodies[0].split('\n')[2]);
    expect(pgEvent.extra.error_pg).toMatchObject({ code: '23503' });
    expect(pgEvent.exception.values[0]).toEqual({
      type: 'Error',
      value: 'insert failed',
    });

    const genericEvent = JSON.parse(bodies[1].split('\n')[2]);
    expect(genericEvent.extra.error_cause).toEqual(['deep cause']);
    expect(genericEvent.exception.values[0].value).toBe('wrapped');
  });

  it('never posts when no DSN is configured (console stays the fallback)', async () => {
    const errorLogger = await importLoggerWithDsn(undefined);

    errorLogger('no dsn', new Error('boom'));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
