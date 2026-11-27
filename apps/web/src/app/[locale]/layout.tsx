import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { AppProviders } from "@/components/AppProviders";
import { getCachedUser } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cache } from "react";
import { notFound } from "next/navigation";
import { type ReactNode } from "react";
import { isAdminRole } from "@/lib/auth/roles";
import { toSlimAuthUser } from "@/lib/slimAuthUser";
import { getRepoStars } from "@/lib/github-stars";
import { logger } from "@/lib/logger";

type Locale = "ar" | "en";

// Profile row shape — kept loose to avoid coupling layout to the Drizzle schema
type ProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  website: string | null;
  level: number | null;
  semester: number | null;
  department_id: string | null;
  show_extra_assets: boolean | null;
  show_extra_assets_updated_at: string | null;
  updated_at: string | null;
  created_at: string | null;
} | null;

// Cached profile fetch via Supabase JS (service role). Avoids the
// pg + Drizzle driver, which breaks on Next.js 16 dev with webpack
// (native TLS module is not externalized reliably).
const getProfile = cache(async (userId: string): Promise<ProfileRow> => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, username, full_name, avatar_url, website, level, semester, department_id, show_extra_assets, show_extra_assets_updated_at, updated_at, created_at",
      )
      .eq("id", userId)
      .limit(1)
      .maybeSingle();

    if (error) {
      // #284: standard shape — the PostgrestError object goes through the
      // logger (normalizeError keeps code/details/hint structured; the
      // envelope forwards it).
      logger.error(`[layout] Error fetching profile for ${userId}`, error);
      return null;
    }

    return (data as ProfileRow) ?? null;
  } catch (error) {
    // #280: the error object itself goes through the logger — the summary
    // includes the cause chain and the envelope keeps name/stack/cause/pg.
    logger.error(`[layout] Unexpected error fetching profile for ${userId}`, error);
    return null;
  }
});

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params?: Promise<{ locale: string }>;
}>) {
  const resolvedParams = await params;
  const locale = resolvedParams?.locale;
  if (!locale) {
    notFound();
  }
  const typedLocale = locale as Locale;

  if (typedLocale !== "ar" && typedLocale !== "en") {
    notFound();
  }

  // Spec 033 Track C (audit MID-2): messages and auth are independent —
  // run them concurrently instead of serializing the auth roundtrip
  // behind the (cached) message loads.
  // Spec 054: the repo star count rides alongside them — getRepoStars is
  // data-cached (revalidate 3600, ~1 upstream call/hour) and never throws,
  // so it can't fail the layout; any failure resolves null → the footer
  // renders the plain star link.
  const [messages, user, repoStars] = await Promise.all([
    getMessages({ locale: typedLocale }),
    getCachedUser(),
    getRepoStars(),
  ]);

  let profile = null;
  let isAdmin = false;

  if (user) {
    const rawProfile = await getProfile(user.id);
    // Map Supabase's snake_case to the camelCase shape AppProviders expects.
    if (rawProfile) {
      profile = {
        id: rawProfile.id,
        updatedAt: rawProfile.updated_at,
        username: rawProfile.username,
        fullName: rawProfile.full_name,
        avatarUrl: rawProfile.avatar_url,
        website: rawProfile.website,
        level: rawProfile.level,
        semester: rawProfile.semester,
        departmentId: rawProfile.department_id,
        showExtraAssets: rawProfile.show_extra_assets,
        showExtraAssetsUpdatedAt: rawProfile.show_extra_assets_updated_at,
      };
    }
    const role = user.app_metadata?.role;
    isAdmin = isAdminRole(role);
  }

  const dir = typedLocale === "ar" ? "rtl" : "ltr";

  return (
    <NextIntlClientProvider
      locale={typedLocale}
      messages={messages}
      timeZone="Africa/Cairo"
    >
      <AppProviders
        dir={dir}
        // WS1 (spec 060): serialize only the auth fields any client consumer
        // reads (id/email, app_metadata.role, user_metadata profile bits) —
        // the full User with identities/factors never enters the RSC payload.
        // The client replaces this with the full User post-mount.
        user={user ? toSlimAuthUser(user) : null}
        profile={profile}
        isAdmin={isAdmin}
        repoStars={repoStars}
      >
        {children}
      </AppProviders>
    </NextIntlClientProvider>
  );
}
