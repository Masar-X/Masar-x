/**
 * Handler-level tests for ../../auth-hook-email/index.ts (T-004).
 * Run: deno test --allow-env --import-map=supabase/functions/_shared/tests/import-map.json
 *        supabase/functions/_shared/tests/handler-auth-hook-email.test.ts
 *
 * The real serve() callback is captured via stubs/std-server.ts, supabase-js
 * uses stubs/supabase-js.ts, and Brevo HTTP calls use a stubbed fetch. No network.
 */

Deno.env.set("BREVO_API_KEY", "test-fake-brevo-key");
Deno.env.set("SUPABASE_URL", "https://test-project.supabase.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-fake-service-key");

await import("../../auth-hook-email/index.ts");
const g = globalThis as unknown as {
  __SERVED_HANDLERS__?: Array<(req: Request) => Promise<Response>>;
};
const handlers = g.__SERVED_HANDLERS__ ?? [];
if (handlers.length === 0) throw new Error("serve() handler was not captured");
const handleAuthHookEmail = handlers[handlers.length - 1]!;

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
// 32-byte base64-encoded secret matching GoTrue's SEND_EMAIL_HOOK_SECRET format.
const TEST_HOOK_SECRET_B64 = btoa("0123456789abcdef0123456789abcdef");
const WRONG_HOOK_SECRET_B64 = btoa("fedcba9876543210fedcba9876543210");

interface Scenario {
  users: Record<string, { id: string } | null>;
  profileRow: { avatar_url: string | null } | null;
  rpcAllowed?: boolean;
  calls: { updates: Array<unknown>; inserts: Array<unknown> };
}

interface BrevoCall {
  toEmail: string | undefined;
  subject: string | undefined;
  htmlContent: string;
}

function baseScenario(): Scenario {
  return {
    users: {},
    profileRow: null,
    rpcAllowed: true,
    calls: { updates: [], inserts: [] },
  };
}

function setScenario(s: Scenario): void {
  (globalThis as unknown as Record<string, unknown>).__SCENARIO__ = s;
}

let brevoCalls: BrevoCall[] = [];

function stubFetch(ok = true): void {
  brevoCalls = [];
  (globalThis as unknown as Record<string, unknown>).fetch = (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ) => {
    if (String(url).startsWith(BREVO_URL)) {
      const body = JSON.parse(init?.body ?? "{}") as {
        to?: Array<{ email?: string }>;
        subject?: string;
        htmlContent?: string;
      };
      brevoCalls.push({
        toEmail: body.to?.[0]?.email,
        subject: body.subject,
        htmlContent: body.htmlContent ?? "",
      });
      return Promise.resolve({
        ok,
        status: ok ? 200 : 502,
        json: () => Promise.resolve(ok ? { messageId: "stub-msg" } : { message: "bad gateway" }),
      } as unknown as Response);
    }
    return Promise.reject(new Error(`unexpected fetch in test: ${String(url)}`));
  };
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeBase64UrlJson(obj: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
}

async function signHookJwt(
  secretB64: string,
  payload: Record<string, unknown> = { sub: "gotrue", role: "supabase_auth_admin" },
): Promise<string> {
  const headerB64 = encodeBase64UrlJson({ alg: "HS256", typ: "JWT" });
  const payloadB64 = encodeBase64UrlJson(payload);
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(secretB64).buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

async function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const prev = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(vars)) {
    prev.set(k, Deno.env.get(k));
    if (v === undefined) {
      Deno.env.delete(k);
    } else {
      Deno.env.set(k, v);
    }
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of prev.entries()) {
      if (v === undefined) {
        Deno.env.delete(k);
      } else {
        Deno.env.set(k, v);
      }
    }
  }
}

function makeReq(
  body: unknown,
  opts: { authorization?: string; method?: string } = {},
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.authorization !== undefined) {
    headers.set("authorization", opts.authorization);
  }
  return new Request("https://functions.local/auth-hook-email", {
    method: opts.method ?? "POST",
    headers,
    body: opts.method === "OPTIONS" ? null : JSON.stringify(body),
  });
}

function validPayload(redirectTo = "https://masarx.vercel.app/ar/auth/callback") {
  return {
    user: { email: "student@example.com" },
    email_data: {
      token_hash: "tok_abc123",
      redirect_to: redirectTo,
      email_action_type: "signup",
    },
  };
}

// ---------------------------------------------------------------------------
// Fail-closed behavior when SEND_EMAIL_HOOK_SECRET is missing
// ---------------------------------------------------------------------------

Deno.test("handler: missing SEND_EMAIL_HOOK_SECRET outside local dev -> 500 fail-closed", async () => {
  await withEnv(
    { SEND_EMAIL_HOOK_SECRET: undefined, ENVIRONMENT: undefined },
    async () => {
      setScenario(baseScenario());
      stubFetch();
      const res = await handleAuthHookEmail(makeReq(validPayload()));
      const body = await res.json() as { error?: string };
      assert(res.status === 500, `expected 500, got ${res.status}`);
      assert(body.error === "Auth hook misconfigured", `unexpected error: ${JSON.stringify(body)}`);
      assert(brevoCalls.length === 0, "no Brevo email sent when misconfigured");
    },
  );
});

Deno.test("handler: empty SEND_EMAIL_HOOK_SECRET in production -> 500 fail-closed", async () => {
  await withEnv(
    { SEND_EMAIL_HOOK_SECRET: "   ", ENVIRONMENT: "production" },
    async () => {
      setScenario(baseScenario());
      stubFetch();
      const res = await handleAuthHookEmail(makeReq(validPayload()));
      const body = await res.json() as { error?: string };
      assert(res.status === 500, `expected 500, got ${res.status}`);
      assert(body.error === "Auth hook misconfigured", `unexpected error: ${JSON.stringify(body)}`);
      assert(brevoCalls.length === 0, "no Brevo email sent in production without secret");
    },
  );
});

// ---------------------------------------------------------------------------
// Explicit local development fallback (ENVIRONMENT === "development")
// ---------------------------------------------------------------------------

Deno.test("handler: missing SEND_EMAIL_HOOK_SECRET in explicit local dev -> fallback allows valid request (200)", async () => {
  await withEnv(
    { SEND_EMAIL_HOOK_SECRET: undefined, ENVIRONMENT: "development" },
    async () => {
      setScenario(baseScenario());
      stubFetch();
      const res = await handleAuthHookEmail(makeReq(validPayload("http://localhost:3000/en/auth/callback")));
      const body = await res.json() as { success?: boolean };
      assert(res.status === 200, `expected 200 in local dev fallback, got ${res.status}`);
      assert(body.success === true, `expected success: true, got ${JSON.stringify(body)}`);
      assert(brevoCalls.length === 1, "Brevo email sent in local dev fallback");
      assert(brevoCalls[0].toEmail === "student@example.com", "recipient matches");
    },
  );
});

Deno.test("handler: local dev fallback still enforces redirect allowlist (400)", async () => {
  await withEnv(
    { SEND_EMAIL_HOOK_SECRET: undefined, ENVIRONMENT: "development" },
    async () => {
      setScenario(baseScenario());
      stubFetch();
      const res = await handleAuthHookEmail(makeReq(validPayload("https://evil.example.com/phish")));
      const body = await res.json() as { error?: string };
      assert(res.status === 400, `expected 400, got ${res.status}`);
      assert(body.error === "Bad request: redirect not allowed", `unexpected error: ${JSON.stringify(body)}`);
      assert(brevoCalls.length === 0, "no Brevo email sent for disallowed redirect");
    },
  );
});

// ---------------------------------------------------------------------------
// JWT verification when SEND_EMAIL_HOOK_SECRET is configured
// ---------------------------------------------------------------------------

Deno.test("handler: missing Authorization header when secret is set -> 401", async () => {
  await withEnv(
    { SEND_EMAIL_HOOK_SECRET: TEST_HOOK_SECRET_B64, ENVIRONMENT: undefined },
    async () => {
      setScenario(baseScenario());
      stubFetch();
      const res = await handleAuthHookEmail(makeReq(validPayload()));
      const body = await res.json() as { error?: string };
      assert(res.status === 401, `expected 401, got ${res.status}`);
      assert(body.error === "Unauthorized", `unexpected error: ${JSON.stringify(body)}`);
      assert(brevoCalls.length === 0, "no Brevo email sent without JWT");
    },
  );
});

Deno.test("handler: invalid HS256 JWT (wrong secret / tampered) when secret is set -> 401", async () => {
  await withEnv(
    { SEND_EMAIL_HOOK_SECRET: TEST_HOOK_SECRET_B64, ENVIRONMENT: "development" },
    async () => {
      setScenario(baseScenario());
      stubFetch();

      const wrongSigJwt = await signHookJwt(WRONG_HOOK_SECRET_B64);
      const resWrong = await handleAuthHookEmail(
        makeReq(validPayload(), { authorization: `Bearer ${wrongSigJwt}` }),
      );
      assert(resWrong.status === 401, `wrong secret: expected 401, got ${resWrong.status}`);

      const validJwt = await signHookJwt(TEST_HOOK_SECRET_B64);
      const [h, , s] = validJwt.split(".");
      const tamperedJwt = `${h}.${encodeBase64UrlJson({ sub: "attacker" })}.${s}`;
      const resTampered = await handleAuthHookEmail(
        makeReq(validPayload(), { authorization: `Bearer ${tamperedJwt}` }),
      );
      assert(resTampered.status === 401, `tampered payload: expected 401, got ${resTampered.status}`);

      const resMalformed = await handleAuthHookEmail(
        makeReq(validPayload(), { authorization: "Bearer not-a-jwt" }),
      );
      assert(resMalformed.status === 401, `malformed token: expected 401, got ${resMalformed.status}`);
      assert(brevoCalls.length === 0, "no Brevo email sent on invalid JWTs");
    },
  );
});

// ---------------------------------------------------------------------------
// Valid HS256 JWT + redirect allowlist checks
// ---------------------------------------------------------------------------

Deno.test("handler: valid HS256 JWT + disallowed redirect -> 400", async () => {
  await withEnv(
    { SEND_EMAIL_HOOK_SECRET: TEST_HOOK_SECRET_B64, ENVIRONMENT: undefined },
    async () => {
      setScenario(baseScenario());
      stubFetch();
      const jwt = await signHookJwt(TEST_HOOK_SECRET_B64);
      const res = await handleAuthHookEmail(
        makeReq(validPayload("https://attacker.example/steal-token"), {
          authorization: `Bearer ${jwt}`,
        }),
      );
      const body = await res.json() as { error?: string };
      assert(res.status === 400, `expected 400, got ${res.status}`);
      assert(body.error === "Bad request: redirect not allowed", `unexpected error: ${JSON.stringify(body)}`);
      assert(brevoCalls.length === 0, "no Brevo email sent on disallowed redirect");
    },
  );
});

Deno.test("handler: valid HS256 JWT + allowlisted redirect -> 200", async () => {
  await withEnv(
    { SEND_EMAIL_HOOK_SECRET: TEST_HOOK_SECRET_B64, ENVIRONMENT: undefined },
    async () => {
      setScenario(baseScenario());
      stubFetch();
      const jwt = await signHookJwt(TEST_HOOK_SECRET_B64);
      const redirect = "https://masarx.vercel.app/ar/auth/callback";
      const res = await handleAuthHookEmail(
        makeReq(validPayload(redirect), {
          authorization: `Bearer ${jwt}`,
        }),
      );
      const body = await res.json() as { success?: boolean };
      assert(res.status === 200, `expected 200, got ${res.status}`);
      assert(body.success === true, `expected success: true, got ${JSON.stringify(body)}`);
      assert(brevoCalls.length === 1, "exactly one Brevo email sent");
      assert(brevoCalls[0].toEmail === "student@example.com", "recipient email matches");
      assert(
        brevoCalls[0].htmlContent.includes(encodeURIComponent(redirect)),
        "actionUrl includes encoded allowlisted redirect_to",
      );
    },
  );
});

Deno.test("handler: OPTIONS -> preflight 200 without auth", async () => {
  await withEnv(
    { SEND_EMAIL_HOOK_SECRET: undefined, ENVIRONMENT: undefined },
    async () => {
      setScenario(baseScenario());
      stubFetch();
      const res = await handleAuthHookEmail(makeReq(null, { method: "OPTIONS" }));
      assert(res.status === 200 && (await res.text()) === "ok", "preflight ok");
    },
  );
});
