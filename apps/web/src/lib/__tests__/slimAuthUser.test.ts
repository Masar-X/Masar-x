import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { toSlimAuthUser } from "../slimAuthUser";

// Minimal full-User fixture — the shape getCachedUser() hands the layout.
const fullUser = {
  id: "u-1",
  email: "student@example.com",
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  role: "authenticated",
  confirmation_sent_at: null,
  email_confirmed_at: "2026-01-01T00:00:00Z",
  last_sign_in_at: "2026-11-27T00:00:00Z",
  identities: [{ id: "id-1", provider: "email" }],
  factors: [{ id: "f-1" }],
  phone: "",
  phone_confirmed_at: null,
  app_metadata: { role: "student", provider: "email", providers: ["email"] },
  user_metadata: { full_name: "Test Student", avatar_url: "https://a/x.png", username: "tstudent" },
} as unknown as User;

describe("toSlimAuthUser — WS1 RSC payload subset (spec 060)", () => {
  it("keeps exactly id/email/app_metadata/user_metadata/created_at/last_sign_in_at", () => {
    const slim = toSlimAuthUser(fullUser);
    expect(slim).toEqual({
      id: "u-1",
      email: "student@example.com",
      app_metadata: { role: "student", provider: "email", providers: ["email"] },
      user_metadata: {
        full_name: "Test Student",
        avatar_url: "https://a/x.png",
        username: "tstudent",
      },
      created_at: "2026-01-01T00:00:00Z",
      last_sign_in_at: "2026-11-27T00:00:00Z",
    });
    // The heavy blobs the audit flagged must not survive the mapping.
    expect("identities" in slim).toBe(false);
    expect("factors" in slim).toBe(false);
    expect("aud" in slim).toBe(false);
  });

  it("tolerates null metadata blobs (runtime null-guards)", () => {
    const sparse = { ...fullUser, app_metadata: null, user_metadata: null } as unknown as User;
    const slim = toSlimAuthUser(sparse);
    expect(slim.app_metadata).toEqual({});
    expect(slim.user_metadata).toEqual({});
    expect(slim.id).toBe("u-1");
    expect(slim.email).toBe("student@example.com");
  });
});
