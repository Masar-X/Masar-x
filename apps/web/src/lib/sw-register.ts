"use client";

import { logger } from "@/lib/logger";

const SW_URL = "/sw.js";

/**
 * Registers the Masar X Service Worker.
 *
 * - Skipped during development to avoid stale-cache confusion with HMR.
 * - Safe to call multiple times: `navigator.serviceWorker.register()`
 *   is idempotent when scope + URL match an already-registered worker.
 * - Deferred to the `load` event so registration never competes with
 *   hydration or first paint on slow connections.
 * - Logs (does not throw) on registration failure so a broken SW
 *   cannot take down a page.
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "development") return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .catch((err: unknown) => {
        // #284: surfaced — a broken SW registration quietly disables offline
        // caching + push; the logger.warn envelope forwards it.
        logger.warn("[sw] registration failed", { error: String(err) });
      });
  });
}
