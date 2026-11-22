/* eslint-disable no-console -- the suite exercises console patching; the
   calls below are the behavior under test, not stray logging. */

// Issue #279 — puter.ts console suppression scoping. Regression contract:
// an unrelated error mentioning "websocket"/"transport" still prints; only
// Puter-SDK-origin transport noise (message match + js.puter.com or a
// bundled socket/engine.io frame in the stack) is throttled+suppressed.
// The suppressed path itself cannot be driven through the real wrapper in
// jsdom (its stack is this test file, not the CDN), so the noise semantics
// live in the pure isPuterTransportNoise helper; the wrapper tests assert
// pass-through and the debug-mode early return.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isPuterTransportNoise } from '../puter';

// initPuterDiagnostics is one-shot via a module-level flag — each init test
// imports a fresh module instance so the flag resets.
async function freshDiagnostics() {
  vi.resetModules();
  return import('../puter');
}

const PUTER_FRAME =
  '    at socket.onerror (https://js.puter.com/v2/js:1:2345)';
const APP_FRAME =
  '    at handleSubmit (http://localhost:3000/src/app/page.tsx:10:11)';

describe('isPuterTransportNoise (#279)', () => {
  it('matches Puter-origin transport spam (message match + sdk frame)', () => {
    expect(
      isPuterTransportNoise('socket.io connection closed', () => PUTER_FRAME),
    ).toBe(true);
    expect(
      isPuterTransportNoise('engine.io polling error', () => PUTER_FRAME),
    ).toBe(true);
    expect(
      isPuterTransportNoise('websocket transport closed', () => PUTER_FRAME),
    ).toBe(true);
  });

  it('REGRESSION: a non-Puter error mentioning websocket/transport is not noise', () => {
    expect(
      isPuterTransportNoise('websocket connection dropped', () => APP_FRAME),
    ).toBe(false);
    expect(
      isPuterTransportNoise('transport layer retry failed', () => APP_FRAME),
    ).toBe(false);
    // Stack-only matches are gone: a pattern-word-free Puter frame is not noise.
    expect(isPuterTransportNoise('user signup failed', () => PUTER_FRAME)).toBe(
      false,
    );
  });

  it('bundled socket/engine.io frames count as sdk origin', () => {
    expect(
      isPuterTransportNoise(
        'polling transport failed',
        () =>
          '    at Polling.onError (http://localhost:3000/_next/static/chunks/vendor-socket.io.js:1:1)',
      ),
    ).toBe(true);
  });
});

describe('initPuterDiagnostics console patch (#279)', () => {
  let sink: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sink = vi.fn();
    vi.stubGlobal('console', { ...console, error: sink, warn: sink });
    localStorage.removeItem('puter_debug');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.removeItem('puter_debug');
  });

  it('REGRESSION: unrelated console.error mentioning websocket passes through', async () => {
    const mod = await freshDiagnostics();
    mod.initPuterDiagnostics();

    console.error('websocket connection dropped', new Error('boom'));

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith(
      'websocket connection dropped',
      expect.any(Error),
    );
  });

  it('non-matching messages pass through untouched', async () => {
    const mod = await freshDiagnostics();
    mod.initPuterDiagnostics();

    console.error('rls denied for subjects');

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith('rls denied for subjects');
  });

  it('debug mode leaves console untouched (isPuterDebugEnabled early return)', async () => {
    localStorage.setItem('puter_debug', '1');
    const mod = await freshDiagnostics();
    mod.initPuterDiagnostics();

    console.error('websocket connection dropped');

    // sink IS console.error here — no wrapper was installed on top of it.
    expect(sink).toHaveBeenCalledTimes(1);
  });
});
