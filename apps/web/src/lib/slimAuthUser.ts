import type { User } from "@supabase/supabase-js";

/**
 * WS1 (spec 060, audit SPLIT-4): the fields any client consumer reads from
 * the auth user — id/email, `app_metadata.role` (admin gating in
 * admin-dashboard, profile, useCourseDetail), the `user_metadata` profile
 * bits (topbar/sidenav avatars and names) and `created_at`/`last_sign_in_at`
 * (profile page's ActivityLogSection). The server layout serializes only
 * this subset into the RSC payload, so identities/factors/metadata blobs
 * never cross the server→client boundary. The client still holds the full
 * `User` after `initializeAuth`/`onAuthStateChange` — runtime behavior is
 * unchanged; this shrinks only the payload.
 */
export type SlimAuthUser = Pick<
  User,
  | "id"
  | "email"
  | "app_metadata"
  | "user_metadata"
  | "created_at"
  | "last_sign_in_at"
>;

export function toSlimAuthUser(user: User): SlimAuthUser {
  return {
    id: user.id,
    email: user.email,
    app_metadata: user.app_metadata ?? {},
    user_metadata: user.user_metadata ?? {},
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
  };
}
