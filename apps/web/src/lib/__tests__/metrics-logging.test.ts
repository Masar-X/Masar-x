// Issue #284 — metrics silent-degradation surfacing. The Upstash store is
// mocked at fetch level (rejecting): read failures still return the empty
// snapshot (never-throw contract) but now surface via logger.error, and
// fire-and-forget write drops surface through runQuietly.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// metrics.ts guards itself with "server-only"; stub it for the node project.
vi.mock('server-only', () => ({}));

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({ logger: loggerMock }));

import { getAdminMetrics, recordFileDownload } from '../metrics';

beforeEach(() => {
  loggerMock.error.mockClear();
  loggerMock.warn.mockClear();
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.rest.upstash.io');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('upstash down');
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('metrics silent-degradation surfacing (#284)', () => {
  it('read failure: logs via logger.error and still returns the empty snapshot', async () => {
    const snapshot = await getAdminMetrics();

    expect(loggerMock.error).toHaveBeenCalledWith(
      '[metrics] read failed',
      expect.any(Error),
    );
    expect(snapshot).toEqual({
      redisConfigured: false, // EMPTY_SNAPSHOT is a fixed shape (module const)
      totalDownloads: 0,
      totalAiQuestions: 0,
      activeUsers30d: 0,
      dailyCounts: [],
      topFiles: [],
      recentActivity: [],
    });
  });

  it('write drop: runQuietly surfaces the dropped write via logger.error', async () => {
    recordFileDownload('u-1', { id: 'file-1', title: 'T' });

    // runQuietly is fire-and-forget — flush the microtask/timeout chain.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(loggerMock.error).toHaveBeenCalledWith(
      '[metrics] download failed (dropped)',
      expect.any(Error),
    );
  });
});
