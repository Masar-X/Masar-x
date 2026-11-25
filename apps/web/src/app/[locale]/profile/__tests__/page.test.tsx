// Card T-010 - behavioral characterization tests for the profile page.
// AuthContext, useUserAcademic, NotificationManager, AdminProfileImage and
// UpdateCheck are mocked; the page itself runs FOR REAL against the
// chain-recording supabase mock: loading/guest gates, name-edit validation,
// academic save, extra-assets toggle + cooldown and the role refresh.
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setMockIntlLocale, nextIntlMockFactory } from "@/test/mocks/next-intl";

const { chain, states } = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  return {
    chain: createSupabaseMock({ data: null, error: null }),
    states: {
      locale: "en",
      authLoading: false,
      isAdmin: false,
      user: null as Record<string, unknown> | null,
      profile: null as { username?: string } | null,
      academic: { level: 2, semester: 1, department_id: null as string | null },
      levels: [{ id: "l1", name: "Level 1", level_number: 1 }],
      departments: [] as Array<{ id: string; name: string; academic_level_id: string | null }>,
      optionsLoading: false,
      setUserAcademic: undefined as unknown as Mock<(...args: unknown[]) => Promise<{ success: boolean; message?: string }>>,
      toastSuccess: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
      toastError: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
      routerPush: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
      routerRefresh: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
    },
  };
});

vi.mock("@/lib/supabase", () => ({ supabase: chain.supabase }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: states.user, profile: states.profile, isAdmin: states.isAdmin, loading: states.authLoading }),
}));
vi.mock("@/hooks/useUserAcademic", () => ({
  useUserAcademic: () => ({
    academic: states.academic,
    levels: states.levels,
    departments: states.departments,
    loading: false,
    optionsLoading: states.optionsLoading,
    setUserAcademic: (...args: unknown[]) => states.setUserAcademic(...args),
  }),
}));
vi.mock("@/components/NotificationManager", () => ({ NotificationSettings: () => null }));
vi.mock("@/components/AdminProfileImage", () => ({ AdminProfileImage: () => null }));
vi.mock("@/components/desktop/UpdateCheck", () => ({ UpdateCheck: () => null }));
vi.mock("@/navigation", () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => states.routerPush(...args),
    refresh: (...args: unknown[]) => states.routerRefresh(...args),
  }),
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ locale: states.locale }) }));
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => states.toastSuccess(...args),
    error: (...args: unknown[]) => states.toastError(...args),
  },
}));
vi.mock("next-intl", () => nextIntlMockFactory());

import ProfilePage from "../page";

function profilesCalls(method: string) {
  return chain.calls.filter((c) => c.table === "profiles" && c.method === method);
}

function authMocks() {
  return chain.supabase.auth as unknown as Record<string, Mock>;
}

beforeEach(() => {
  setMockIntlLocale("en");
  states.locale = "en";
  states.authLoading = false;
  states.isAdmin = false;
  states.user = {
    id: "u-1",
    email: "student@example.com",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-15T00:00:00Z",
    last_sign_in_at: "2026-11-20T10:00:00Z",
  };
  states.profile = { username: "Fote User" };
  states.academic = { level: 2, semester: 1, department_id: null };
  states.optionsLoading = false;
  states.setUserAcademic = vi.fn(async () => ({ success: true }));
  states.toastSuccess = vi.fn();
  states.toastError = vi.fn();
  states.routerPush = vi.fn();
  states.routerRefresh = vi.fn();
  chain.resetResponses();
  chain.calls.length = 0;
  sessionStorage.clear();
  localStorage.clear();
  authMocks().refreshSession = vi.fn(async () => ({ error: null }));
  authMocks().getUser = vi.fn(async () => ({ data: { user: { id: "u-1" } }, error: null }));
});

describe("ProfilePage", () => {
  it("shows the loading spinner while auth is resolving", () => {
    states.authLoading = true;
    render(<ProfilePage />);
    expect(screen.getByText("common.loading")).toBeInTheDocument();
  });

  it("guests get the must-login gate and the sign-in redirect", async () => {
    const user = userEvent.setup();
    states.user = null;
    render(<ProfilePage />);
    expect(screen.getByText("profile.mustLogin")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "auth.signIn" }));
    expect(states.routerPush).toHaveBeenCalledWith("/login");
  });

  it("renders the authenticated header with display name, email and role", async () => {
    render(<ProfilePage />);
    expect((await screen.findAllByText("Fote User")).length).toBeGreaterThan(0);
    expect(screen.getByText("student@example.com")).toBeInTheDocument();
    expect(screen.getAllByText("profile.user").length).toBeGreaterThan(0);
    expect(screen.getByText("profile.personalInfo")).toBeInTheDocument();
    expect(screen.getByText("profile.academicPath")).toBeInTheDocument();
  });

  it("shows the doctor rank for admin accounts", async () => {
    states.isAdmin = true;
    states.user = { ...(states.user as Record<string, unknown>), app_metadata: { role: "doctor" } };
    render(<ProfilePage />);
    expect((await screen.findAllByText("profile.adminDoctor")).length).toBeGreaterThan(0);
  });

  it("loads the profile row and reveals the special settings section", async () => {
    chain.respondWith(
      { data: { full_name: "Fote User", show_extra_assets: true, show_extra_assets_updated_at: null }, error: null },
      { table: "profiles", method: "single" },
    );
    render(<ProfilePage />);
    expect(await screen.findByText("profile.specialSettings")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeEnabled();
  });

  it("an unchanged display-name save exits edit mode without a database write", async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);
    await user.click(await screen.findByRole("button", { name: "profile.editName" }));
    expect(screen.getByLabelText("profile.username")).toHaveValue("Fote User");
    await user.click(screen.getByRole("button", { name: "profile.save" }));
    expect(screen.queryByLabelText("profile.username")).toBeNull();
    expect(profilesCalls("update")).toHaveLength(0);
  });

  it("an invalid display name shows the schema error and skips the write", async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);
    await user.click(await screen.findByRole("button", { name: "profile.editName" }));
    const input = screen.getByLabelText("profile.username");
    await user.clear(input);
    await user.type(input, "123bad");
    await user.click(screen.getByRole("button", { name: "profile.save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Name contains invalid characters");
    expect(profilesCalls("update")).toHaveLength(0);
  });

  it("a valid display name writes full_name, toasts success and broadcasts profileUpdate", async () => {
    const listener = vi.fn();
    window.addEventListener("profileUpdate", listener);
    const user = userEvent.setup();
    render(<ProfilePage />);
    await user.click(await screen.findByRole("button", { name: "profile.editName" }));
    const input = screen.getByLabelText("profile.username");
    await user.clear(input);
    await user.type(input, "Fote Dev");
    await user.click(screen.getByRole("button", { name: "profile.save" }));

    await waitFor(() => expect(profilesCalls("update")).toHaveLength(1));
    expect(profilesCalls("update")[0].args[0]).toEqual({ full_name: "Fote Dev" });
    expect(states.toastSuccess).toHaveBeenCalledWith("profile.nameUpdateSuccess");
    expect(screen.queryByLabelText("profile.username")).toBeNull();
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ full_name: "Fote Dev" });
    window.removeEventListener("profileUpdate", listener);
  });

  it("a failed display-name write toasts the error", async () => {
    chain.respondWith({ data: null, error: { message: "boom" } }, { table: "profiles", method: "eq" });
    const user = userEvent.setup();
    render(<ProfilePage />);
    await user.click(await screen.findByRole("button", { name: "profile.editName" }));
    const input = screen.getByLabelText("profile.username");
    await user.clear(input);
    await user.type(input, "Fote Dev");
    await user.click(screen.getByRole("button", { name: "profile.save" }));
    await waitFor(() => expect(states.toastError).toHaveBeenCalledWith("profile.nameUpdateError"));
  });

  it("saving the academic path delegates to setUserAcademic with profile-update semantics", async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);
    const academicSection = (await screen.findByText("profile.academicPath")).closest("section") as HTMLElement;
    await user.click(within(academicSection).getByRole("button"));
    await waitFor(() =>
      expect(states.setUserAcademic).toHaveBeenCalledWith({ level: 2, semester: 1, department_id: null }, { isProfileUpdate: true }),
    );
    expect(states.toastSuccess).toHaveBeenCalledWith("profile.academicUpdateSuccess");
  });

  it("a failed academic save surfaces the returned message", async () => {
    states.setUserAcademic = vi.fn(async () => ({ success: false, message: 'profile.academicUpdateRateLimited {"seconds":60}' }));
    const user = userEvent.setup();
    render(<ProfilePage />);
    const academicSection = (await screen.findByText("profile.academicPath")).closest("section") as HTMLElement;
    await user.click(within(academicSection).getByRole("button"));
    expect(await screen.findByText(/academicUpdateRateLimited/)).toBeInTheDocument();
  });

  it("toggling extra assets off writes the flag and the server timestamp", async () => {
    chain.respondWith(
      { data: { full_name: "Fote User", show_extra_assets: true, show_extra_assets_updated_at: null }, error: null },
      { table: "profiles", method: "single" },
    );
    render(<ProfilePage />);
    expect(await screen.findByRole("switch")).toBeEnabled();
    // Queued AFTER the profile fetch consumed its response: this one
    // resolves the toggle's update...select...single chain.
    chain.respondWith(
      { data: { show_extra_assets_updated_at: "2026-11-26T10:00:00Z" }, error: null },
      { table: "profiles", method: "single" },
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("switch"));
    await waitFor(() => expect(profilesCalls("update")).toHaveLength(1));
    expect(profilesCalls("update")[0].args[0]).toEqual({ show_extra_assets: false });
    expect(states.toastSuccess).toHaveBeenCalledWith(
      "profile.systemRevert",
      expect.objectContaining({ description: "profile.extraAssetsDisabled" }),
    );
    await waitFor(() => expect(screen.queryByRole("switch")).toBeNull());
  });

  it("a recent timestamp starts the cooldown and blocks the toggle", async () => {
    chain.respondWith(
      {
        data: {
          full_name: "Fote User",
          show_extra_assets: true,
          show_extra_assets_updated_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
        },
        error: null,
      },
      { table: "profiles", method: "single" },
    );
    render(<ProfilePage />);
    expect(await screen.findByRole("switch")).toBeDisabled();
    expect(screen.getByText(/profile.cooldownWithMinutes/)).toBeInTheDocument();
    expect(profilesCalls("update")).toHaveLength(0);
  });

  it("refreshing the admin status revalidates the session and the router", async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);
    await user.click(await screen.findByTitle("profile.refreshRole"));
    await waitFor(() => expect(states.routerRefresh).toHaveBeenCalled());
    expect(states.toastSuccess).toHaveBeenCalledWith("profile.roleRefreshSuccess");
  });

  it("a failed role refresh toasts the error without revalidating", async () => {
    authMocks().refreshSession = vi.fn(async () => ({ error: { message: "boom" } }));
    const user = userEvent.setup();
    render(<ProfilePage />);
    await user.click(await screen.findByTitle("profile.refreshRole"));
    await waitFor(() => expect(states.toastError).toHaveBeenCalledWith("profile.roleRefreshError"));
    expect(states.routerRefresh).not.toHaveBeenCalled();
  });
});