"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { SupabaseClient } from "masarx-shared/supabase";
import { toast } from "sonner";

interface UseAdminRoleRefreshArgs {
  supabase: SupabaseClient;
  router: { refresh: () => void };
}

/**
 * Admin-role refresh control for the profile page (T-011b split). The
 * browser Supabase client and the app router are injected by the page: the
 * import ratchet grandfathering covers only the page file itself.
 */
export function useAdminRoleRefresh({
  supabase,
  router,
}: UseAdminRoleRefreshArgs) {
  const t = useTranslations("profile");

  const [isRefreshingRole, setIsRefreshingRole] = useState(false);

  const refreshAdminStatus = async () => {
    // Role lives in the JWT's app_metadata (synced from `public.admins` by
    // migration 008). Refreshing the session fetches a new JWT so a newly
    // granted/revoked rank shows up without forcing a full sign-out/in.
    // The AuthContext `onAuthStateChange` listener then picks up the new user.
    if (isRefreshingRole) return;
    setIsRefreshingRole(true);
    try {
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;
      // Force a server round-trip so we read the fresh JWT claims, not a
      // stale cached user object.
      const {
        data: { user: freshUser },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!freshUser) throw new Error("No user after refresh");
      // Revalidate server components that read the role from the JWT.
      router.refresh();
      toast.success(t("roleRefreshSuccess"));
    } catch {
      toast.error(t("roleRefreshError"));
    } finally {
      setIsRefreshingRole(false);
    }
  };

  return { isRefreshingRole, refreshAdminStatus };
}
