"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { User } from "@supabase/supabase-js";
import type { SlimAuthUser } from "@/lib/slimAuthUser";
import type { SupabaseClient } from "masarx-shared/supabase";
import { toast } from "sonner";
import { ProfileFormSchema } from "@/lib/validation/profile";

interface UseProfileEditorArgs {
  supabase: SupabaseClient;
  // WS1 (spec 060): the context user is User | SlimAuthUser until the client
  // hydrates the full one; only user.id is read here.
  user: User | SlimAuthUser | null;
  displayName: string;
}

/**
 * Display-name editing + extra-assets preference for the profile page
 * (T-011b split). Both features read/write the same `profiles` row, so the
 * fetch effect feeds both. The browser Supabase client is injected by the
 * page: the import ratchet grandfathering covers only the page file itself,
 * so extracted code receives the client as a parameter instead.
 */
export function useProfileEditor({
  supabase,
  user,
  displayName,
}: UseProfileEditorArgs) {
  const t = useTranslations("profile");

  const updateDisplayName = async (name: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name })
      .eq("id", user.id);
    if (error) throw error;
    // Trigger profile update event for other components
    window.dispatchEvent(new CustomEvent("profileUpdate", { detail: { full_name: name } }));
  };

  const [isEditing, setIsEditing] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState(displayName || "");
  const [isSaving, setIsSaving] = useState(false);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [showExtraAssets, setShowExtraAssets] = useState(false);
  const [extraAssetsUpdatedAt, setExtraAssetsUpdatedAt] = useState<
    string | null
  >(null);

  // Cooldown period: 2 hours (in milliseconds)
  const COOLDOWN_MS = 2 * 60 * 60 * 1000;

  // Calculate remaining cooldown time
  const cooldownRemaining = useMemo(() => {
    if (!extraAssetsUpdatedAt) return 0;
    const lastUpdate = new Date(extraAssetsUpdatedAt).getTime();
    const elapsed = Date.now() - lastUpdate;
    return Math.max(0, COOLDOWN_MS - elapsed);
  }, [extraAssetsUpdatedAt, COOLDOWN_MS]);

  // Check if cooldown is active
  const isCooldownActive = cooldownRemaining > 0;

  // Format remaining time for display
  const formatCooldownTime = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return t("cooldownWithHours", { hours, minutes });
    return t("cooldownWithMinutes", { minutes });
  };

  useEffect(() => {
    if (user) {
      const fetchProfile = async () => {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        if (data) {
          setShowExtraAssets(data.show_extra_assets || false);
          setExtraAssetsUpdatedAt(data.show_extra_assets_updated_at || null);
          setNewDisplayName(data.full_name || displayName || "");
        }
      };
      fetchProfile();
    }
    // `supabase` is the module singleton; listing it is for the hook lint,
    // its identity never changes.
  }, [user, displayName, supabase]);

  const handleSaveDisplayName = async () => {
    if (!newDisplayName.trim() || newDisplayName.trim() === displayName) {
      setIsEditing(false);
      return;
    }

    // FR-005 (Round-B): validate with ProfileFormSchema BEFORE any DB write.
    // Implementer decision (logged in fix-log_roundB.md): the validated
    // server action updateProfile (apps/web/src/actions/profile.ts) cannot
    // be wired here without editing that file (not owned by this fix): it
    // upserts ALL of fullName/username/website/avatarUrl and ProfileFormSchema
    // requires a valid username (min 3 chars, [a-zA-Z0-9_]) which this page
    // does not manage. Calling it would block saves for users without a
    // username and could null unrelated columns. Per the Round-B brief the
    // minimal safe fallback is client-side ProfileFormSchema validation.
    const parsedDisplayName = ProfileFormSchema.shape.fullName.safeParse(
      newDisplayName.trim(),
    );
    if (!parsedDisplayName.success) {
      setDisplayNameError(
        parsedDisplayName.error.issues[0]?.message ?? "Invalid name",
      );
      return;
    }
    setDisplayNameError(null);

    setIsSaving(true);
    try {
      await updateDisplayName(newDisplayName.trim());
      setIsEditing(false);
      toast.success(t("nameUpdateSuccess"));
    } catch {
      toast.error(t("nameUpdateError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setNewDisplayName(displayName || "");
    setIsEditing(false);
  };

  const handleToggleExtraAssets = async (enabled: boolean) => {
    if (!user) return;

    // Best practice: enabling TRW requires the unlock/code flow (logo taps).
    // Profile page allows disabling only once the flag is already enabled.
    if (enabled === true && showExtraAssets === false) {
      return;
    }

    // Check cooldown
    if (isCooldownActive) {
      toast.error(t("cooldownActive"), {
        description: t("cooldownDescription", {
          time: formatCooldownTime(cooldownRemaining),
        }),
      });
      return;
    }

    try {
      setIsSaving(true);
      const { data, error } = await supabase
        .from("profiles")
        .update({
          show_extra_assets: enabled,
        })
        .eq("id", user.id)
        .select("show_extra_assets_updated_at")
        .single();

      if (error) throw error;

      setShowExtraAssets(enabled);
      setExtraAssetsUpdatedAt(data?.show_extra_assets_updated_at ?? null);

      // Force a custom event to notify Header and other components
      window.dispatchEvent(
        new CustomEvent("profileUpdate", {
          detail: { show_extra_assets: enabled },
        }),
      );

      toast.success(enabled ? t("systemUpdate") : t("systemRevert"), {
        description: enabled
          ? t("extraAssetsEnabled")
          : t("extraAssetsDisabled"),
        className: enabled
          ? "bg-black text-white border-red-900 shadow-[0_0_20px_rgba(255,0,0,0.3)] font-mono"
          : "",
      });
    } catch (err: unknown) {
      const maybeMessage =
        typeof err === "object" && err && "message" in err
          ? String((err as { message?: unknown }).message)
          : "";
      toast.error(t("systemError"), {
        description: maybeMessage || t("preferenceUpdateError"),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return {
    isEditing,
    setIsEditing,
    newDisplayName,
    setNewDisplayName,
    displayNameError,
    setDisplayNameError,
    isSaving,
    handleSaveDisplayName,
    handleCancelEdit,
    showExtraAssets,
    cooldownRemaining,
    handleToggleExtraAssets,
  };
}
