// Card T-010 - behavioral characterization tests for the AppNav shell.
// SideNav/MobileNav/SecretAccessGate/DynamicLogo are prop-capturing probes;
// the shell's own logic runs FOR REAL: localStorage rail persistence + CSS
// width variable, logo debounce and 5-click secret gate, the access-code
// RPC flow (matrix grant, attempts lockout, exhausted codes), TRW
// visibility via profile updates, sign-out navigation and the mobile
// drawer's Escape handling.
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { setMockIntlLocale, nextIntlMockFactory } from "@/test/mocks/next-intl";

const { chain, states } = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  return {
    chain: createSupabaseMock({ data: null, error: null }),
    states: {
      pathname: "/" as string,
      user: { id: "u-1", app_metadata: {} } as { id: string; app_metadata: Record<string, unknown> } | null,
      authProfile: {} as Record<string, unknown>,
      authLoading: false,
      isAdmin: false,
      signOut: undefined as unknown as Mock<(...args: unknown[]) => Promise<void>>,
      toastSuccess: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
      toastError: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
      routerPush: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
      logError: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
      sideNavProps: { current: null as unknown },
      mobileProps: { current: null as unknown },
      gateProps: { current: null as unknown },
    },
  };
});

vi.mock("@/lib/supabase", () => ({ supabase: chain.supabase }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: states.user,
    profile: states.authProfile,
    loading: states.authLoading,
    isAdmin: states.isAdmin,
    signOut: (...args: unknown[]) => states.signOut(...args),
  }),
}));
vi.mock("@/components/DynamicLogo", () => ({ DynamicLogo: () => null }));
vi.mock("@/components/header/MobileNav", async () => {
  const React = await import("react");
  return {
    MobileNav: (props: Record<string, unknown>) => {
      states.mobileProps.current = props;
      return React.createElement("div", null, "mobile-nav");
    },
  };
});
vi.mock("@/components/header/SecretAccessGate", async () => {
  const React = await import("react");
  return {
    SecretAccessGate: (props: Record<string, unknown>) => {
      states.gateProps.current = props;
      return React.createElement("div", null, "secret-gate");
    },
  };
});
vi.mock("../SideNav", async () => {
  const React = await import("react");
  return {
    SideNav: (props: Record<string, unknown>) => {
      states.sideNavProps.current = props;
      return React.createElement("div", null, "side-nav");
    },
  };
});
vi.mock("@/navigation", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => states.routerPush(...args) }),
  usePathname: () => states.pathname,
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => states.toastSuccess(...args),
    error: (...args: unknown[]) => states.toastError(...args),
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: (...args: unknown[]) => states.logError(...args) },
}));
vi.mock("next-intl", () => nextIntlMockFactory());

import { AppNav, SIDENAV_EXPANDED_KEY } from "../AppNav";

interface SideNavProps {
  expanded: boolean;
  trwVisible: boolean;
  currentPage: string;
  onLogoActivate: () => void;
  onNavigate: (page: string, id?: string) => void;
  onSignOut: () => void;
}
interface GateProps {
  isMatrixActive: boolean;
  showAccessInput: boolean;
  setAccessKey: (key: string) => void;
  setShowAccessInput: (value: boolean) => void;
  verifyAccessKey: () => Promise<void>;
}
interface MobileProps {
  isMobileMenuOpen: boolean;
  isTRWVisible: boolean;
}

function sideNav() {
  return states.sideNavProps.current as SideNavProps;
}
function gate() {
  return states.gateProps.current as GateProps;
}
function rpcCalls() {
  return chain.calls.filter((c) => c.table === "rpc:redeem_system_access_code" && c.method === "rpc");
}

beforeEach(() => {
  setMockIntlLocale("en");
  states.pathname = "/";
  states.user = { id: "u-1", app_metadata: {} };
  states.authProfile = {};
  states.authLoading = false;
  states.isAdmin = false;
  states.signOut = vi.fn(async () => {});
  states.toastSuccess = vi.fn();
  states.toastError = vi.fn();
  states.routerPush = vi.fn();
  states.logError = vi.fn();
  states.sideNavProps.current = null;
  states.mobileProps.current = null;
  states.gateProps.current = null;
  chain.resetResponses();
  chain.calls.length = 0;
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AppNav", () => {
  it("restores the expanded rail from localStorage and syncs the width variable", () => {
    localStorage.setItem(SIDENAV_EXPANDED_KEY, "1");
    render(<AppNav />);
    expect(sideNav().expanded).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--sidenav-w")).toBe("15rem");
  });

  it("defaults to the collapsed rail on a fresh browser", () => {
    render(<AppNav />);
    expect(sideNav().expanded).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--sidenav-w")).toBe("4rem");
  });

  it("logo activation toggles the rail after the debounce and persists", () => {
    vi.useFakeTimers();
    render(<AppNav />);
    act(() => {
      sideNav().onLogoActivate();
    });
    expect(sideNav().expanded).toBe(false);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(sideNav().expanded).toBe(true);
    expect(localStorage.getItem(SIDENAV_EXPANDED_KEY)).toBe("1");
    expect(document.documentElement.style.getPropertyValue("--sidenav-w")).toBe("15rem");

    act(() => {
      sideNav().onLogoActivate();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(sideNav().expanded).toBe(false);
    expect(localStorage.getItem(SIDENAV_EXPANDED_KEY)).toBe("0");
    expect(document.documentElement.style.getPropertyValue("--sidenav-w")).toBe("4rem");
  });

  it("five rapid logo clicks reveal the secret access gate", () => {
    vi.useFakeTimers();
    render(<AppNav />);
    act(() => {
      for (let i = 0; i < 5; i += 1) {
        sideNav().onLogoActivate();
      }
    });
    expect(gate().showAccessInput).toBe(true);
  });

  it("a valid access code runs the matrix sequence and grants TRW visibility", async () => {
    vi.useFakeTimers();
    chain.respondWith({ data: { success: true }, error: null }, { table: "rpc:redeem_system_access_code" });
    render(<AppNav />);
    act(() => {
      gate().setAccessKey("GOLDEN-KEY");
    });
    await act(async () => {
      await gate().verifyAccessKey();
    });
    expect(rpcCalls()).toHaveLength(1);
    expect(rpcCalls()[0].args[0]).toEqual({ p_access_key: "GOLDEN-KEY" });
    expect(gate().isMatrixActive).toBe(true);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(sideNav().trwVisible).toBe(true);
    expect(states.routerPush).toHaveBeenCalledWith("/non-academic");
    expect(gate().showAccessInput).toBe(false);
    expect(gate().isMatrixActive).toBe(false);
  });

  it("an empty access code is rejected before hitting the RPC", async () => {
    render(<AppNav />);
    await act(async () => {
      await gate().verifyAccessKey();
    });
    expect(states.toastError).toHaveBeenCalledWith("header.access.codeRequired");
    expect(rpcCalls()).toHaveLength(0);
  });

  it("an exhausted code reports the max-uses error without granting entry", async () => {
    chain.respondWith({ data: { reason: "exhausted" }, error: null }, { table: "rpc:redeem_system_access_code" });
    render(<AppNav />);
    act(() => {
      gate().setAccessKey("OLD-KEY");
    });
    await act(async () => {
      await gate().verifyAccessKey();
    });
    expect(states.toastError).toHaveBeenCalledWith(
      "header.access.systemErrorTitle",
      expect.objectContaining({ description: "header.access.maxUsesDescription" }),
    );
    expect(sideNav().trwVisible).toBe(false);
    expect(states.routerPush).not.toHaveBeenCalled();
  });

  it("five failed attempts lock verification for 30 seconds", async () => {
    vi.useFakeTimers();
    chain.respondWith({ data: { success: false }, error: null }, { table: "rpc:redeem_system_access_code" });
    render(<AppNav />);
    act(() => {
      gate().setAccessKey("BAD");
    });
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await gate().verifyAccessKey();
      });
    }
    expect(rpcCalls()).toHaveLength(5);
    expect(states.toastError).toHaveBeenCalledWith(
      "header.access.securityAlertTitle",
      expect.objectContaining({ description: "header.access.locked30Description" }),
    );
    // Locked: the next try bounces before the RPC runs.
    await act(async () => {
      await gate().verifyAccessKey();
    });
    expect(rpcCalls()).toHaveLength(5);
    expect(states.toastError).toHaveBeenCalledWith(
      "header.access.lockedTitle",
      expect.objectContaining({ description: expect.stringContaining("header.access.lockedDescription") }),
    );
  });

  it("a profileUpdate event flips TRW visibility without a refetch", () => {
    render(<AppNav />);
    expect(sideNav().trwVisible).toBe(false);
    act(() => {
      window.dispatchEvent(new CustomEvent("profileUpdate", { detail: { show_extra_assets: true } }));
    });
    expect(sideNav().trwVisible).toBe(true);
    expect(rpcCalls()).toHaveLength(0);
  });

  it("signing out calls signOut and navigates home", async () => {
    render(<AppNav />);
    await act(async () => {
      await sideNav().onSignOut();
    });
    expect(states.signOut).toHaveBeenCalledTimes(1);
    expect(states.routerPush).toHaveBeenCalledWith("/");
  });

  it("the mobile logo opens the drawer immediately and Escape closes it", () => {
    render(<AppNav />);
    fireEvent.click(screen.getByRole("button", { name: "mobileNav.openMenuAriaLabel" }));
    expect((states.mobileProps.current as MobileProps).isMobileMenuOpen).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect((states.mobileProps.current as MobileProps).isMobileMenuOpen).toBe(false);
    expect(document.body.style.overflow).toBe("");
  });

  it("drawer navigation closes the drawer and routes to the page", () => {
    render(<AppNav />);
    fireEvent.click(screen.getByRole("button", { name: "mobileNav.openMenuAriaLabel" }));
    expect((states.mobileProps.current as MobileProps).isMobileMenuOpen).toBe(true);
    act(() => {
      (states.mobileProps.current as MobileProps & { handleNavigate: (page: string) => void }).handleNavigate("news");
    });
    expect(states.routerPush).toHaveBeenCalledWith("/news");
    expect((states.mobileProps.current as MobileProps).isMobileMenuOpen).toBe(false);
  });
});