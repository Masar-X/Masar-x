// @ts-nocheck: Deno runtime types
/**
 * GoTrue send_email hook — renders and sends the platform's transactional
 * emails via Brevo.
 *
 * Hardening (review 2026-11-07 P0.2 "open relay" + T-004 fail-closed gate):
 *   1. Fail-closed secret check — when SEND_EMAIL_HOOK_SECRET is unset or
 *      empty, every request is rejected with HTTP 500 (`Auth hook misconfigured`)
 *      unless explicitly running in local development (`ENVIRONMENT === 'development'`).
 *   2. Standard Webhooks signature verification — the official Supabase
 *      send-email-hook contract (docs updated 2026-10-22; supabase/auth#2499
 *      confirms the legacy Authorization JWT is not reliably attached) signs
 *      each request with `v1,<hmac>` over `${webhook-id}.${webhook-timestamp}.${body}`,
 *      keyed by the base64 secret behind the dashboard's `v1,whsec_...` value.
 *      Missing or invalid signatures are rejected with HTTP 401.
 *   3. Input & quota guards — refuses unknown email actions, allowlists the
 *      redirect origin, and rate-limits per recipient.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildCorsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/auth.ts';
import { checkRateLimit } from '../_shared/net.ts';

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

const BREVO_SENDER_EMAIL = Deno.env.get('BREVO_SENDER_EMAIL') || 'masarx.eg@gmail.com';
const BREVO_SENDER_NAME = Deno.env.get('BREVO_SENDER_NAME') || 'مسار X - منصة طلاب';

const ALLOWED_EMAIL_ACTIONS = new Set([
  'signup',
  'recovery',
  'magiclink',
  'email_change',
  'invite',
]);

const base64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

/**
 * Verify the Supabase send_email hook per the Standard Webhooks contract
 * (dependency-free Web Crypto equivalent of standardwebhooks@1.0.0.verify):
 * strip the optional `v1,whsec_` prefix from the dashboard secret, HMAC-SHA256
 * over `${webhook-id}.${webhook-timestamp}.${rawBody}`, accept any `v1,`
 * signature listed in `webhook-signature` (each entry guarded independently —
 * GoTrue joins several with ", "), and reject replays outside the 5-minute
 * timestamp tolerance.
 */
const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;
const WHSEC_PREFIX = 'v1,whsec_';

const verifyStandardWebhook = async (
  req: Request,
  hookSecret: string,
  rawBody: string,
): Promise<boolean> => {
  const id = req.headers.get('webhook-id') ?? '';
  const timestampHeader = req.headers.get('webhook-timestamp') ?? '';
  const signatureHeader = req.headers.get('webhook-signature') ?? '';
  if (!id || !timestampHeader || !signatureHeader) return false;
  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) return false;
  try {
    let secretB64 = hookSecret.startsWith(WHSEC_PREFIX)
      ? hookSecret.slice(WHSEC_PREFIX.length)
      : hookSecret;
    secretB64 = secretB64.replace(/-/g, '+').replace(/_/g, '/');
    const secretPadded = secretB64.padEnd(secretB64.length + ((4 - (secretB64.length % 4)) % 4), '=');
    const key = await crypto.subtle.importKey(
      'raw',
      base64ToBytes(secretPadded).buffer as ArrayBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const signedContent = new TextEncoder().encode(`${id}.${timestampHeader}.${rawBody}`);
    for (const part of signatureHeader.split(/\s+/).filter(Boolean)) {
      // GoTrue joins several `v1,` entries with ", " (hookshttp.go); a
      // whitespace split leaves the separator comma at the end of an entry.
      const entry = part.replace(/,+$/, '');
      if (!entry.startsWith('v1,')) continue;
      try {
        const sigB64 = entry.slice(3).replace(/-/g, '+').replace(/_/g, '/');
        const sigPadded = sigB64.padEnd(sigB64.length + ((4 - (sigB64.length % 4)) % 4), '=');
        const ok = await crypto.subtle.verify('HMAC', key, base64ToBytes(sigPadded), signedContent);
        if (ok) return true;
      } catch {
        // Malformed entry: skip it, keep verifying the remaining signatures.
      }
    }
    return false;
  } catch {
    return false;
  }
};

/** True when `redirect_to` points at a platform-controlled origin. */
const isAllowedRedirect = (raw: string): boolean => {
  try {
    const url = new URL(raw);
    const allowed = new Set<string>();
    const frontend = Deno.env.get('FRONTEND_URL');
    if (frontend) allowed.add(new URL(frontend).origin);
    allowed.add('https://masarx.vercel.app');
    allowed.add('http://localhost:3000');
    allowed.add('http://127.0.0.1:3000');
    return allowed.has(url.origin);
  } catch {
    return false;
  }
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCorsHeaders(req) });
  }

  try {
    // Standard Webhooks: GoTrue signs each hook call with `v1,<hmac>` over
    // `${webhook-id}.${webhook-timestamp}.${body}` (key = the base64 secret
    // behind the dashboard's `v1,whsec_...` value). Fail closed unless
    // explicitly running in local development.
    const hookSecret = (Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? '').trim();
    const isLocalDev = Deno.env.get('ENVIRONMENT') === 'development';
    const rawBody = await req.text();

    if (!hookSecret) {
      if (!isLocalDev) {
        console.error('[auth-hook-email] SEND_EMAIL_HOOK_SECRET is not configured — failing closed');
        return new Response(JSON.stringify({ error: 'Auth hook misconfigured' }), {
          status: 500,
          headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      console.warn(
        '[auth-hook-email] SEND_EMAIL_HOOK_SECRET not configured — local development fallback ' +
        '(signature unverified; set SEND_EMAIL_HOOK_SECRET to test Standard Webhooks verification)'
      );
    } else {
      const signatureOk = await verifyStandardWebhook(req, hookSecret, rawBody);
      if (!signatureOk) {
        console.warn('[auth-hook-email] rejected: Standard Webhooks signature verification failed');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }

    if (!BREVO_API_KEY) {
      return new Response(JSON.stringify({ error: 'Missing BREVO_API_KEY' }), {
        status: 500,
        headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const payload = JSON.parse(rawBody);
    const { user, email_data } = payload;
    const { token_hash, redirect_to, email_action_type } = email_data ?? {};

    if (!user?.email || typeof email_action_type !== 'string' || !ALLOWED_EMAIL_ACTIONS.has(email_action_type)) {
      return new Response(JSON.stringify({ error: 'Bad request: unknown email action' }), {
        status: 400,
        headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!supabaseUrl) {
      return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL' }), {
        status: 500,
        headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const safeRedirectTo = redirect_to || Deno.env.get('FRONTEND_URL') || 'https://masarx.vercel.app';
    if (!isAllowedRedirect(safeRedirectTo)) {
      console.warn('[auth-hook-email] rejected: redirect origin not allowlisted');
      return new Response(JSON.stringify({ error: 'Bad request: redirect not allowed' }), {
        status: 400,
        headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Per-recipient throttle (Brevo quota protection). Fails open on RPC
    // error — repo convention (F12); the signature check above is the hard
    // gate when the secret is configured.
    try {
      const admin = createAdminClient();
      const allowed = await checkRateLimit(admin, {
        identifier: `auth-hook-email:${String(user.email).toLowerCase()}`,
        endpoint: 'send_email_hook',
        maxRequests: 10,
        windowMinutes: 60,
      });
      if (allowed === false) {
        return new Response(JSON.stringify({ error: 'Too many requests' }), {
          status: 429,
          headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    } catch (rateError) {
      console.error(
        '[auth-hook-email] rate limit check failed:',
        rateError instanceof Error ? rateError.message : 'unknown'
      );
    }

    console.log(`Processing ${email_action_type} email for ${user.email}`);

    // Determine subject and content based on email type
    let subject = '';
    let title = '';
    let bodyText = '';
    let buttonText = '';
    let actionUrl = '';

    // Standard Supabase confirmation link: {{ .SiteURL }}/auth/v1/verify?token=…&type=…&redirect_to=…
    // Every branch encodes its dynamic segments; unknown actions never reach
    // here (the enum check above removed the old raw-redirect default branch).
    switch (email_action_type) {
      case 'signup':
        subject = 'تفعيل حسابك - مسار X';
        title = 'مرحباً بك في مسار X';
        bodyText = 'شكراً لتسجيلك في مسار X. لتفعيل حسابك وتأكيد بريدك الإلكتروني، اضغط على الزر أدناه.';
        buttonText = 'تفعيل الحساب';
        actionUrl = `${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(token_hash)}&type=signup&redirect_to=${encodeURIComponent(safeRedirectTo)}`;
        break;
      case 'recovery':
        subject = 'إعادة تعيين كلمة المرور - مسار X';
        title = 'إعادة تعيين كلمة المرور';
        bodyText = 'تلقينا طلباً لإعادة تعيين كلمة المرور لحسابك. يرجى النقر على الزر أدناه للمتابعة.';
        buttonText = 'إعادة تعيين كلمة المرور';
        actionUrl = `${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(token_hash)}&type=recovery&redirect_to=${encodeURIComponent(safeRedirectTo)}`;
        break;
      case 'magiclink':
        subject = 'رابط تسجيل الدخول - مسار X';
        title = 'تسجيل الدخول السريع';
        bodyText = 'انقر على الزر أدناه لتسجيل الدخول إلى حسابك مباشرة.';
        buttonText = 'تسجيل الدخول';
        actionUrl = `${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(token_hash)}&type=magiclink&redirect_to=${encodeURIComponent(safeRedirectTo)}`;
        break;
      case 'email_change':
        subject = 'تغيير البريد الإلكتروني - مسار X';
        title = 'تأكيد تغيير البريد الإلكتروني';
        bodyText = 'لقد طلبت تغيير بريدك الإلكتروني. يرجى النقر على الزر أدناه لتأكيد البريد الجديد.';
        buttonText = 'تأكيد التغيير';
        actionUrl = `${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(token_hash)}&type=email_change&redirect_to=${encodeURIComponent(safeRedirectTo)}`;
        break;
      case 'invite':
        subject = 'دعوة إلى مسار X';
        title = 'أهلاً بك في مسار X';
        bodyText = 'تمت دعوتك للانضمام إلى المنصة. اضغط على الزر أدناه لتفعيل حسابك.';
        buttonText = 'قبول الدعوة';
        actionUrl = `${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(token_hash)}&type=invite&redirect_to=${encodeURIComponent(safeRedirectTo)}`;
        break;
    }

    const htmlContent = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
          <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
        </head>
        <body style="font-family: 'Cairo', Arial, sans-serif; margin: 0; padding: 0; background-color: #f3f4f6;">
          <div style="max-width: 600px; margin: 40px auto; background-color: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 700;">مسار X</h1>
              <p style="color: #e0e7ff; margin: 8px 0 0 0; font-size: 18px;">رفيقك في رحلة التعلم</p>
            </div>

            <!-- Content -->
            <div style="padding: 40px 30px;">
              <h2 style="color: #1f2937; margin: 0 0 24px 0; font-size: 24px; font-weight: 700; text-align: center;">${title}</h2>

              <p style="color: #4b5563; line-height: 1.6; font-size: 16px; margin-bottom: 24px; text-align: center;">
                مرحباً،<br>
                ${bodyText}
              </p>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="${actionUrl}"
                   style="background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
                          color: white;
                          padding: 16px 32px;
                          text-decoration: none;
                          border-radius: 12px;
                          font-weight: 700;
                          font-size: 16px;
                          display: inline-block;
                          box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.5);
                          transition: all 0.3s ease;">
                  ${buttonText}
                </a>
              </div>

              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-bottom: 24px; text-align: center;">
                إذا لم تقم بإنشاء حساب على مسار X، يمكنك تجاهل هذه الرسالة بأمان.
              </p>

              <div style="border-top: 1px solid #e5e7eb; margin: 32px 0 24px 0;"></div>

              <p style="color: #9ca3af; font-size: 13px; line-height: 1.5; text-align: center; margin: 0;">
                إذا لم يعمل الزر، انسخ الرابط التالي والصقه في متصفحك:<br>
                <a href="${actionUrl}" style="color: #3b82f6; text-decoration: none; word-break: break-all;">${actionUrl}</a>
              </p>
            </div>

            <!-- Footer -->
            <div style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; margin: 0; font-size: 14px;">
                &copy; ${new Date().getFullYear()} مسار X. جميع الحقوق محفوظة.
              </p>
            </div>
          </div>
        </body>
        </html>
        `;

    const emailResponse = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: BREVO_SENDER_NAME,
          email: BREVO_SENDER_EMAIL
        },
        to: [{ email: user.email }],
        subject: subject,
        htmlContent: htmlContent
      })
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      console.error('Brevo API error:', errorData);
      return new Response(JSON.stringify({ error: 'Failed to send email' }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('Error in auth-hook-email:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
