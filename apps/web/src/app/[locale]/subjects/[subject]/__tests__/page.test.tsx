// Card T-010 - behavioral characterization tests for the subject page.
// Dashboard/detail/modal/workspace children and the lecture hooks are mocked;
// the page itself runs FOR REAL against the chain-recording supabase mock:
// loading/error gates, dashboard-to-detail state machine, deep links and
// the user-progress toggle mutations.
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { setMockIntlLocale, nextIntlMockFactory } from "@/test/mocks/next-intl";

const { chain, states } = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  return {
    chain: createSupabaseMock({ data: null, error: null }),
    states: {
      params: { locale: "en", subject: "calculus-1" } as Record<string, string | undefined>,
      user: { id: "u-1" } as { id: string } | null,
      isAdmin: false,
      isDesktop: false,
      showAddLectureForm: false,
      toastSuccess: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
      toastError: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
      routerPush: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
      trackEvent: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
      trackFileDownload: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
      handleAddLecture: undefined as unknown as Mock<(...args: unknown[]) => Promise<void>>,
      setNewLecture: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
      setLectureFormData: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
      setShowAddLectureForm: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
      dashboardProps: { current: null as unknown },
      detailProps: { current: null as unknown },
      workspaceProps: { current: null as unknown },
      addLectureProps: { current: null as unknown },
    },
  };
});

vi.mock("@/lib/supabase", () => ({ supabase: chain.supabase }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: states.user, isAdmin: states.isAdmin, loading: false }),
}));
vi.mock("@/components/subject/SubjectDashboard", async () => {
  const React = await import("react");
  return {
    SubjectDashboard: (props: Record<string, unknown>) => {
      states.dashboardProps.current = props;
      return React.createElement("div", null, "subject-dashboard");
    },
  };
});
vi.mock("@/components/subject/LectureDetailView", async () => {
  const React = await import("react");
  return {
    LectureDetailView: (props: Record<string, unknown>) => {
      states.detailProps.current = props;
      return React.createElement("div", null, "lecture-detail");
    },
  };
});
vi.mock("@/components/subject/AddLectureModal", async () => {
  const React = await import("react");
  return {
    AddLectureModal: (props: Record<string, unknown>) => {
      states.addLectureProps.current = props;
      return React.createElement("div", null, "add-lecture-modal");
    },
  };
});
vi.mock("@/components/desktop/workspace/StudyWorkspace", async () => {
  const React = await import("react");
  return {
    StudyWorkspace: (props: Record<string, unknown>) => {
      states.workspaceProps.current = props;
      return React.createElement("div", null, "study-workspace");
    },
  };
});
vi.mock("@/hooks/useSubjectModals", () => ({
  useSubjectModals: () => ({
    lectureFormData: { title: "", label: "", key: "", orderIndex: 1 },
    setLectureFormData: (...args: unknown[]) => states.setLectureFormData(...args),
    showAddLectureForm: states.showAddLectureForm,
    setShowAddLectureForm: (...args: unknown[]) => states.setShowAddLectureForm(...args),
  }),
}));
vi.mock("@/hooks/useLectureContent", () => ({
  useLectureContent: () => ({ summaries: [], videos: [], files: [], quizzes: [], loading: false }),
}));
vi.mock("@/hooks/useManageLectures", () => ({
  useManageLectures: () => ({
    handleAddLecture: (...args: unknown[]) => states.handleAddLecture(...args),
    loading: false,
    setNewLecture: (...args: unknown[]) => states.setNewLecture(...args),
  }),
}));
vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: () => ({ trackEvent: (...args: unknown[]) => states.trackEvent(...args) }),
}));
vi.mock("@/lib/metrics-client", () => ({
  trackFileDownload: (...args: unknown[]) => states.trackFileDownload(...args),
  pingActiveUser: () => {},
}));
vi.mock("@/lib/desktop/useIsDesktopRuntime", () => ({ useIsDesktopRuntime: () => states.isDesktop }));
vi.mock("next/navigation", () => ({
  useParams: () => states.params,
  useRouter: () => ({ push: (...args: unknown[]) => states.routerPush(...args) }),
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => states.toastSuccess(...args),
    error: (...args: unknown[]) => states.toastError(...args),
  },
}));
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

import SubjectPage from "../page";

interface DashboardProps {
  normalizedSubjectName: string;
  dashboardData: { nextLecture: string; professor: string; progress: number };
  lectureIndex: Array<{ key: string; label: string; order: number }>;
  onSelectLecture: (key: string) => void;
  onBackToSubjects: () => void;
}
interface DetailProps {
  selectedLecture: { key: string; label: string; order: number };
  completedContent: Set<string>;
  onToggleProgress: (contentId: string) => void;
  onBackToLectures: () => void;
}
interface WorkspaceProps {
  lectures: Array<{ id: string; lectureKey: string; ordinal: number }>;
  initialLectureId?: string;
}

const SUBJECT_ROW = {
  id: "s1",
  name: "Calculus 1",
  name_en: "Calculus One",
  professor: "Dr. X",
  professor_ar: null,
  professor_gender: "male",
  description: "desc",
  description_ar: null,
  schedule: "sched",
  location: "Room 5",
};
const LECTURE_ROWS = [
  { id: "db-1", lecture_key: "lec-1", lecture_label: "Lecture 1", order_index: 1 },
  { id: "db-2", lecture_key: "lec-2", lecture_label: "Lecture 2", order_index: 2 },
];

function seedSubjectData() {
  chain.respondWith({ data: SUBJECT_ROW, error: null }, { table: "subjects" });
  chain.respondWith({ data: LECTURE_ROWS, error: null }, { table: "subject_lectures" });
}

function progressCalls(method: string) {
  return chain.calls.filter((c) => c.table === "user_progress" && c.method === method);
}

beforeEach(() => {
  setMockIntlLocale("en");
  states.params = { locale: "en", subject: "calculus-1" };
  states.user = { id: "u-1" };
  states.isAdmin = false;
  states.isDesktop = false;
  states.showAddLectureForm = false;
  states.toastSuccess = vi.fn();
  states.toastError = vi.fn();
  // Mirror real navigation: routing to /lectures/<id> updates the URL params,
  // which is what drives the page's param-sync effect.
  states.routerPush = vi.fn((...args: unknown[]) => {
    const match = /\/lectures\/([^/]+)/.exec(String(args[0] ?? ""));
    states.params = match
      ? { locale: "en", subject: "calculus-1", lectureId: match[1] }
      : { locale: "en", subject: "calculus-1" };
  });
  states.trackEvent = vi.fn();
  states.trackFileDownload = vi.fn();
  states.handleAddLecture = vi.fn(async () => {});
  states.setNewLecture = vi.fn();
  states.setLectureFormData = vi.fn();
  states.setShowAddLectureForm = vi.fn();
  states.dashboardProps.current = null;
  states.detailProps.current = null;
  states.workspaceProps.current = null;
  states.addLectureProps.current = null;
  chain.resetResponses();
  chain.calls.length = 0;
});

describe("SubjectPage", () => {
  it("shows a spinner while the subject fetch is in flight, then the dashboard", async () => {
    seedSubjectData();
    const { container } = render(<SubjectPage />);
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(await screen.findByText("subject-dashboard")).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("renders the dashboard with the localized subject name and lecture index", async () => {
    seedSubjectData();
    render(<SubjectPage />);
    await screen.findByText("subject-dashboard");
    const props = states.dashboardProps.current as DashboardProps;
    expect(props.normalizedSubjectName).toBe("Calculus One");
    expect(props.dashboardData.nextLecture).toBe("Room 5");
    expect(props.dashboardData.professor).toBe("Dr. X");
    expect(props.lectureIndex.map((l) => l.key)).toEqual(["lec-1", "lec-2"]);
    expect(props.lectureIndex.map((l) => l.label)).toEqual(["Lecture 1", "Lecture 2"]);
  });

  it("the RTL locale falls back to the stored Arabic subject name", async () => {
    seedSubjectData();
    setMockIntlLocale("ar");
    states.params = { locale: "ar", subject: "calculus-1" };
    render(<SubjectPage />);
    await screen.findByText("subject-dashboard");
    expect((states.dashboardProps.current as DashboardProps).normalizedSubjectName).toBe("Calculus 1");
  });

  it("toasts the localized error when the subject row fails to load", async () => {
    chain.respondWith({ data: null, error: { message: "boom" } }, { table: "subjects" });
    render(<SubjectPage />);
    await waitFor(() => expect(states.toastError).toHaveBeenCalledWith("subjectPage.errorLoadingSubject"));
    expect(await screen.findByText("subject-dashboard")).toBeInTheDocument();
  });

  it("deep-links to a lecture when lectureId is in the URL", async () => {
    seedSubjectData();
    states.params = { locale: "en", subject: "calculus-1", lectureId: "lec-2" };
    render(<SubjectPage />);
    expect(await screen.findByText("lecture-detail")).toBeInTheDocument();
    expect((states.detailProps.current as DetailProps).selectedLecture.key).toBe("lec-2");
    expect(screen.queryByText("subject-dashboard")).toBeNull();
  });

  it("selecting a lecture from the dashboard pushes the URL and opens the detail view", async () => {
    seedSubjectData();
    render(<SubjectPage />);
    await screen.findByText("subject-dashboard");
    // findBy resolves before the dashboard commit's passive effects flush -
    // React 19 schedules them as a separate scheduler task and RTL runs
    // queries outside act - so their stale params closure can otherwise land
    // after the select below. Let that chain settle before navigating.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => {
      (states.dashboardProps.current as DashboardProps).onSelectLecture("lec-1");
    });
    await waitFor(() =>
      expect(states.routerPush).toHaveBeenCalledWith("/en/subjects/calculus-1/lectures/lec-1", { scroll: false }),
    );
    // The pushed lectureId re-runs the subject fetch (fetchSubjectData deps),
    // which can briefly re-gate the page on the loading spinner; await the
    // settled post-navigation view instead of racing findBy's 1s default.
    expect(await screen.findByText("lecture-detail", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText("subject-dashboard")).toBeNull();
  });

  it("back to subjects navigates to the subjects root", async () => {
    seedSubjectData();
    render(<SubjectPage />);
    await screen.findByText("subject-dashboard");
    act(() => {
      (states.dashboardProps.current as DashboardProps).onBackToSubjects();
    });
    await waitFor(() => expect(states.routerPush).toHaveBeenCalledWith("/en/subjects"));
  });

  it("back to lectures returns from the detail view", async () => {
    seedSubjectData();
    states.params = { locale: "en", subject: "calculus-1", lectureId: "lec-1" };
    render(<SubjectPage />);
    await screen.findByText("lecture-detail");
    act(() => {
      (states.detailProps.current as DetailProps).onBackToLectures();
    });
    await waitFor(() =>
      expect(states.routerPush).toHaveBeenCalledWith("/en/subjects/calculus-1", { scroll: false }),
    );
    expect(await screen.findByText("subject-dashboard", {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it("toggling progress on uncompleted content inserts and toasts confirmation", async () => {
    seedSubjectData();
    chain.respondWith({ data: [], error: null }, { table: "user_progress" });
    render(<SubjectPage />);
    await screen.findByText("subject-dashboard");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => {
      (states.dashboardProps.current as DashboardProps).onSelectLecture("lec-1");
    });
    await screen.findByText("lecture-detail", {}, { timeout: 5000 });
    await act(async () => {
      await (states.detailProps.current as DetailProps).onToggleProgress("c-9");
    });
    expect(progressCalls("insert")).toHaveLength(1);
    expect(progressCalls("insert")[0].args[0]).toEqual({ user_id: "u-1", content_id: "c-9" });
    expect(states.toastSuccess).toHaveBeenCalledWith("subjectPage.progress.markedComplete");
  });

  it("toggling progress on completed content deletes and restores the unmarked state", async () => {
    seedSubjectData();
    chain.respondWith({ data: [{ content_id: "c-9" }], error: null }, { table: "user_progress" });
    render(<SubjectPage />);
    await screen.findByText("subject-dashboard");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => {
      (states.dashboardProps.current as DashboardProps).onSelectLecture("lec-1");
    });
    await screen.findByText("lecture-detail", {}, { timeout: 5000 });
    expect((states.detailProps.current as DetailProps).completedContent.has("c-9")).toBe(true);
    await act(async () => {
      await (states.detailProps.current as DetailProps).onToggleProgress("c-9");
    });
    expect(progressCalls("delete")).toHaveLength(1);
    expect(states.toastSuccess).toHaveBeenCalledWith("subjectPage.progress.unmarked");
    expect((states.detailProps.current as DetailProps).completedContent.has("c-9")).toBe(false);
  });

  it("toggling progress without a login toasts the gate and never writes", async () => {
    seedSubjectData();
    states.user = null;
    render(<SubjectPage />);
    await screen.findByText("subject-dashboard");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => {
      (states.dashboardProps.current as DashboardProps).onSelectLecture("lec-1");
    });
    await screen.findByText("lecture-detail", {}, { timeout: 5000 });
    await act(async () => {
      await (states.detailProps.current as DetailProps).onToggleProgress("c-9");
    });
    expect(states.toastError).toHaveBeenCalledWith("subjectPage.errors.mustLogin");
    expect(progressCalls("insert")).toHaveLength(0);
  });

  it("the desktop runtime renders the study workspace with the lecture list", async () => {
    seedSubjectData();
    states.isDesktop = true;
    render(<SubjectPage />);
    expect(await screen.findByText("study-workspace")).toBeInTheDocument();
    const props = states.workspaceProps.current as WorkspaceProps;
    expect(props.lectures.map((l) => l.lectureKey)).toEqual(["lec-1", "lec-2"]);
    expect(props.lectures.map((l) => l.ordinal)).toEqual([1, 2]);
    expect(screen.queryByText("subject-dashboard")).toBeNull();
  });
});