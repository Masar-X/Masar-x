// Card T-010 - behavioral characterization tests for the edit-summary page.
// AuthContext, cloudinary, notification/subject/academic hooks, FileDropzone
// and DynamicLogo are mocked; the page's own auth redirect, ?id handling,
// permission gate, form hydration, update submission (incl. the PDF upload
// branch) run FOR REAL against the chain-recording supabase mock.
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setMockIntlLocale, nextIntlMockFactory } from "@/test/mocks/next-intl";

const { chain, states, stableRouter } = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  const stableRouter = {
    push: (...args: unknown[]) => states.routerPush(...args),
    replace: (...args: unknown[]) => states.routerReplace(...args),
  };
  return {
    chain: createSupabaseMock({ data: null, error: null }),
    stableRouter,
    states: {
      searchId: "s1" as string | null,
      user: { id: "u-1" } as { id: string } | null,
      isAdmin: false,
      authLoading: false,
      dropFiles: [] as File[],
      cloudinaryUrl: "https://cdn.test/new.pdf",
      subjects: [{ id: "sub-1", name: "Calculus 1" }] as Array<{ id: string; name: string }>,
      levels: [{ id: "l1", name: "Level 1", level_number: 1 }] as Array<{ id: string; name: string; level_number: number }>,
      departments: [{ id: "d1", name: "CS" }] as Array<{ id: string; name: string }>,
      sendNotification: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
      routerPush: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
      routerReplace: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
      uploadToCloudinary: undefined as unknown as Mock<(...args: unknown[]) => Promise<{ url: string }>>,
      subjectsParams: { current: null as unknown },
      dropzoneProps: { current: null as unknown },
    },
  };
});

vi.mock("@/lib/supabase", () => ({ supabase: chain.supabase }));
vi.mock("@/lib/cloudinary", () => ({
  uploadToCloudinary: (...args: unknown[]) => states.uploadToCloudinary(...args),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: states.user, isAdmin: states.isAdmin, loading: states.authLoading }),
}));
vi.mock("@/components/NotificationManager", () => ({
  useBrowserNotifications: () => ({ sendNotification: (...args: unknown[]) => states.sendNotification(...args) }),
}));
vi.mock("@/hooks/useSubjects", () => ({
  useSubjects: (params: Record<string, unknown>) => {
    states.subjectsParams.current = params;
    return { subjects: states.subjects };
  },
}));
vi.mock("@/hooks/useAcademicOptions", () => ({
  useAcademicOptions: () => ({
    levels: states.levels,
    getDepartmentsForLevelName: (name: string) => (name === "Level 1" ? states.departments : []),
  }),
}));
vi.mock("@/components/FileDropzone", async () => {
  const React = await import("react");
  return {
    FileDropzone: (props: Record<string, unknown>) => {
      states.dropzoneProps.current = props;
      return React.createElement(
        "div",
        null,
        React.createElement(
          "button",
          { type: "button", onClick: () => (props.onFileSelect as (files: File[]) => void)(states.dropFiles) },
          "pick-pdf",
        ),
        (props.children ?? null) as React.ReactNode,
      );
    },
  };
});
vi.mock("@/components/DynamicLogo", () => ({
  DynamicLogo: () => null,
  getLogoPath: () => "/masarx-mark.svg",
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (key: string) => (key === "id" ? states.searchId : null) }),
}));
// Stable router identity: fetchSummary lists router in its deps and a fresh
// object per render would re-run the effect every render.
vi.mock("@/navigation", () => ({ useRouter: () => stableRouter }));
// The page under test puts t into fetch-callback deps: a fresh echo closure
// per render would re-run the fetch effect on every render, so the factory's
// namespace echo is cached per namespace (behavior identical otherwise).
function stableNextIntlMock() {
  const factory = nextIntlMockFactory();
  const cache = new Map<string, (key: string, values?: Record<string, unknown>) => string>();
  return {
    useLocale: factory.useLocale,
    useTranslations: (ns: string) => {
      const cached = cache.get(ns);
      if (cached) return cached;
      const created = factory.useTranslations(ns);
      cache.set(ns, created);
      return created;
    },
    getTranslations: factory.getTranslations,
  };
}

vi.mock("next-intl", () => stableNextIntlMock());

import EditSummaryPage from "../page";

const SUMMARY_ROW = {
  id: "s1",
  user_id: "u-1",
  title: "Old title",
  subject: "Calculus 1",
  year: "Level 1",
  department: "CS",
  content: "Body text",
  pdf_url: "https://cdn.test/old.pdf",
};

function seedSummary(row: Record<string, unknown> = SUMMARY_ROW) {
  chain.respondWith({ data: row, error: null }, { table: "summaries", method: "single" });
}

function summariesCalls(method: string) {
  return chain.calls.filter((c) => c.table === "summaries" && c.method === method);
}

beforeEach(() => {
  setMockIntlLocale("en");
  states.searchId = "s1";
  states.user = { id: "u-1" };
  states.isAdmin = false;
  states.authLoading = false;
  states.dropFiles = [];
  states.cloudinaryUrl = "https://cdn.test/new.pdf";
  states.subjects = [{ id: "sub-1", name: "Calculus 1" }];
  states.sendNotification = vi.fn();
  states.routerPush = vi.fn();
  states.routerReplace = vi.fn();
  states.uploadToCloudinary = vi.fn(async () => ({ url: states.cloudinaryUrl }));
  states.subjectsParams.current = null;
  states.dropzoneProps.current = null;
  chain.resetResponses();
  chain.calls.length = 0;
  localStorage.clear();
  sessionStorage.clear();
});

describe("EditSummaryPage", () => {
  it("keeps the spinner while auth is resolving", () => {
    states.authLoading = true;
    const { container } = render(<EditSummaryPage />);
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(states.routerReplace).not.toHaveBeenCalled();
  });

  it("a signed-out visitor is redirected to login", async () => {
    states.user = null;
    render(<EditSummaryPage />);
    await waitFor(() => expect(states.routerReplace).toHaveBeenCalledWith("/login"));
  });

  it("a missing ?id surfaces the load error instead of a spinner", async () => {
    states.searchId = null;
    render(<EditSummaryPage />);
    // The page keeps the editable form visible under the error banner.
    expect(await screen.findByText("editSummary.loadError")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "editSummary.saveButton" })).toBeInTheDocument();
  });

  it("hydrates the form from the owner's summary row", async () => {
    seedSummary();
    render(<EditSummaryPage />);
    expect(await screen.findByLabelText(/editSummary.summaryTitle/)).toHaveValue("Old title");
    expect(screen.getByLabelText(/editSummary.summaryContent/)).toHaveValue("Body text");
    expect(screen.getByLabelText(/onboarding.academicLevel/)).toHaveValue("Level 1");
    expect(screen.getByLabelText(/onboarding.department/)).toHaveValue("CS");
    expect(screen.getByLabelText(/editSummary.subjectName/)).toHaveValue("Calculus 1");
    expect(screen.getByText("editSummary.currentPdfNote")).toBeInTheDocument();
    expect(states.subjectsParams.current).toMatchObject({ level: 1, semester: 1 });
  });

  it("a non-owner gets the permission error", async () => {
    seedSummary({ ...SUMMARY_ROW, user_id: "someone-else" });
    render(<EditSummaryPage />);
    expect(await screen.findByText("editSummary.noPermission")).toBeInTheDocument();
    expect(screen.getByLabelText(/editSummary.summaryTitle/)).toHaveValue("");
  });

  it("an admin can edit someone else's summary", async () => {
    states.isAdmin = true;
    seedSummary({ ...SUMMARY_ROW, user_id: "someone-else" });
    render(<EditSummaryPage />);
    expect(await screen.findByLabelText(/editSummary.summaryTitle/)).toHaveValue("Old title");
  });

  it("a failed fetch surfaces the load error", async () => {
    chain.respondWith({ data: null, error: { message: "boom" } }, { table: "summaries", method: "single" });
    render(<EditSummaryPage />);
    expect(await screen.findByText("editSummary.loadError")).toBeInTheDocument();
  });

  it("a successful save updates the row, notifies and redirects back", async () => {
    seedSummary();
    const user = userEvent.setup();
    render(<EditSummaryPage />);
    await user.type(await screen.findByLabelText(/editSummary.summaryTitle/), " v2");
    await user.click(screen.getByRole("button", { name: "editSummary.saveButton" }));

    await waitFor(() => expect(summariesCalls("update")).toHaveLength(1));
    expect(summariesCalls("update")[0].args[0]).toEqual({
      title: "Old title v2",
      subject: "Calculus 1",
      year: "Level 1",
      department: "CS",
      content: "Body text",
      pdf_url: "https://cdn.test/old.pdf",
    });
    expect(await screen.findByText("editSummary.updateSuccessTitle")).toBeInTheDocument();
    expect(states.sendNotification).toHaveBeenCalledWith(
      "editSummary.updateSuccessTitle",
      expect.objectContaining({ tag: "summary-updated" }),
    );
    await waitFor(() => expect(states.routerPush).toHaveBeenCalledWith("/en/summaries/s1"), { timeout: 3000 });
  });

  it("a failed update surfaces the update error and keeps the form", async () => {
    seedSummary();
    chain.respondWith({ data: null, error: { message: "boom" } }, { table: "summaries", method: "eq" });
    const user = userEvent.setup();
    render(<EditSummaryPage />);
    await screen.findByLabelText(/editSummary.summaryTitle/);
    await user.click(screen.getByRole("button", { name: "editSummary.saveButton" }));
    expect(await screen.findByText("editSummary.updateError")).toBeInTheDocument();
    expect(screen.queryByText("editSummary.updateSuccessTitle")).toBeNull();
  });

  it("a non-PDF selection is rejected with the localized error", async () => {
    seedSummary();
    const user = userEvent.setup();
    render(<EditSummaryPage />);
    await screen.findByLabelText(/editSummary.summaryTitle/);
    states.dropFiles = [new File(["text"], "notes.txt", { type: "text/plain" })];
    await user.click(screen.getByText("pick-pdf"));
    expect(await screen.findByText("editSummary.pdfOnlyError")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "editSummary.saveButton" }));
    await waitFor(() => expect(summariesCalls("update")).toHaveLength(1));
    expect(states.uploadToCloudinary).not.toHaveBeenCalled();
    expect(summariesCalls("update")[0].args[0]).toMatchObject({ pdf_url: "https://cdn.test/old.pdf" });
  });

  it("a PDF selection is uploaded to cloudinary and its url replaces the stored one", async () => {
    seedSummary();
    const user = userEvent.setup();
    render(<EditSummaryPage />);
    await screen.findByLabelText(/editSummary.summaryTitle/);
    const pdf = new File(["pdf"], "sample.pdf", { type: "application/pdf" });
    states.dropFiles = [pdf];
    await user.click(screen.getByText("pick-pdf"));
    expect(await screen.findByText("sample.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "editSummary.saveButton" }));

    await waitFor(() => expect(states.uploadToCloudinary).toHaveBeenCalledTimes(1));
    expect(states.uploadToCloudinary.mock.calls[0][1]).toMatchObject({ folder: "masarx-summaries" });
    await waitFor(() => expect(summariesCalls("update")).toHaveLength(1));
    expect(summariesCalls("update")[0].args[0]).toMatchObject({ pdf_url: "https://cdn.test/new.pdf" });
    expect(await screen.findByText("editSummary.updateSuccessTitle")).toBeInTheDocument();
  });
});