// Card T-010 - behavioral characterization tests for the course detail page.
// CourseHero/CourseContent/ReviewSection/ReviewForm are rendered as prop-
// capturing probes (CourseHero executes renderActionButton so the enrollment
// action machine is asserted through the DOM); framer-motion is a DOM-
// passthrough. The page itself runs FOR REAL: the publication gate, the
// enrollment status machine, the subscribe/upload flow, review submission
// and the confirmed deletes.
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setMockIntlLocale, nextIntlMockFactory } from "@/test/mocks/next-intl";

// framer-motion passthrough: keeps the DOM tree identical without animation
// timings, so rendering is deterministic under jsdom.
vi.mock("framer-motion", async () => {
  const React = await import("react");
  const FRAMER_PROPS = [
    "initial", "animate", "exit", "transition", "variants",
    "whileHover", "whileTap", "whileDrag", "whileFocus", "whileInView",
    "layout", "layoutId", "drag", "dragConstraints",
  ];
  const cache = new Map<string, (props: Record<string, unknown>) => React.ReactElement>();
  const passthrough = (tag: string) => {
    if (!cache.has(tag)) {
      cache.set(tag, (props: Record<string, unknown>) => {
        const rest: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(props)) {
          if (!FRAMER_PROPS.includes(k)) rest[k] = v;
        }
        return React.createElement(tag, rest);
      });
    }
    return cache.get(tag);
  };
  const AnimatePresence = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  return {
    motion: new Proxy({}, { get: (_t, tag: string) => passthrough(String(tag)) }),
    AnimatePresence,
  };
});

const { chain, states } = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  return {
    chain: createSupabaseMock({ data: null, error: null }),
    states: {
      user: { id: "u-1", app_metadata: {} } as { id: string; app_metadata: Record<string, unknown> } | null,
      confirmResult: true,
      confirmCount: 0,
      confirmArgs: undefined as unknown[] | undefined,
      toastSuccess: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
      toastError: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
      routerPush: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
      addReview: undefined as unknown as Mock<(...args: unknown[]) => Promise<unknown>>,
      storageUpload: undefined as unknown as Mock<(...args: unknown[]) => Promise<unknown>>,
      heroProps: { current: null as unknown },
      contentProps: { current: null as unknown },
      reviewProps: { current: null as unknown },
      reviewFormProps: { current: null as unknown },
    },
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    ...chain.supabase,
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => states.storageUpload(...args),
        getPublicUrl: () => ({ data: { publicUrl: "https://cdn.test/public" } }),
      }),
    },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: states.user, loading: false }),
}));
vi.mock("@/hooks/useReviews", () => ({
  useReviews: () => ({ addReview: (...args: unknown[]) => states.addReview(...args) }),
}));
vi.mock("@/lib/confirmToast", () => ({
  confirmToast: (...args: unknown[]) => {
    states.confirmCount += 1;
    states.confirmArgs = args;
    return Promise.resolve(states.confirmResult);
  },
}));
vi.mock("@/components/courses/CourseHero", async () => {
  const React = await import("react");
  return {
    CourseHero: (props: Record<string, unknown>) => {
      states.heroProps.current = props;
      const renderAction = props.renderActionButton as (() => React.ReactElement) | undefined;
      return React.createElement("div", { "data-testid": "hero" }, renderAction ? renderAction() : null);
    },
  };
});
vi.mock("@/components/courses/CourseContent", async () => {
  const React = await import("react");
  return {
    CourseContent: (props: Record<string, unknown>) => {
      states.contentProps.current = props;
      return React.createElement(
        "div",
        null,
        React.createElement(
          "button",
          { onClick: () => (props.onDeleteSummary as (id: string) => void)("sum-1") },
          "delete-summary",
        ),
      );
    },
  };
});
vi.mock("@/components/courses/ReviewSection", async () => {
  const React = await import("react");
  return {
    ReviewSection: (props: Record<string, unknown>) => {
      states.reviewProps.current = props;
      return React.createElement("div", null, "reviews-section");
    },
  };
});
vi.mock("@/components/reviews/ReviewForm", async () => {
  const React = await import("react");
  return {
    ReviewForm: (props: Record<string, unknown>) => {
      states.reviewFormProps.current = props;
      return React.createElement(
        "button",
        { onClick: () => (props.onSubmit as (content: string, rating: number) => void)("Great course", 5) },
        "submit-review",
      );
    },
  };
});
vi.mock("@/navigation", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => states.routerPush(...args) }),
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ courseId: "course-1" }) }));
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

import CourseDetailPage from "../page";

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  full_name: string | null;
  username: string | null;
}

function seedCourse(overrides: Record<string, unknown> = {}) {
  chain.respondWith(
    {
      data: {
        id: "course-1",
        title: "AI Basics",
        description: "d",
        instructor_id: "prof-1",
        price: 0,
        is_published: true,
        created_at: "2026-01-01T00:00:00Z",
        profiles: { display_name: "Prof X" },
        ...overrides,
      },
      error: null,
    },
    { table: "courses" },
  );
  chain.respondWith({ data: [], error: null }, { table: "review_details" });
  chain.respondWith({ data: [], error: null }, { table: "course_summaries" });
  chain.respondWith({ data: [], error: null }, { table: "course_videos" });
  chain.respondWith({ data: [], error: null }, { table: "course_files" });
}

function seedEnrollment(status: "active" | "pending" | "rejected" | null) {
  chain.respondWith(
    { data: status ? { id: "e-1", status, created_at: "2026-01-02T00:00:00Z" } : null, error: null },
    { table: "enrollments", method: "maybeSingle" },
  );
}

function tableCalls(table: string, method: string) {
  return chain.calls.filter((c) => c.table === table && c.method === method);
}

beforeEach(() => {
  setMockIntlLocale("en");
  states.user = { id: "u-1", app_metadata: {} };
  states.confirmResult = true;
  states.confirmCount = 0;
  states.confirmArgs = undefined;
  states.toastSuccess = vi.fn();
  states.toastError = vi.fn();
  states.routerPush = vi.fn();
  states.addReview = vi.fn(async () => undefined);
  states.storageUpload = vi.fn(async () => ({ data: { path: "proofs/shot.png" }, error: null }));
  states.heroProps.current = null;
  states.contentProps.current = null;
  states.reviewProps.current = null;
  states.reviewFormProps.current = null;
  chain.resetResponses();
  chain.calls.length = 0;
});

describe("CourseDetailPage", () => {
  it("shows a spinner while the course fetch is in flight, then the hero", async () => {
    seedCourse();
    seedEnrollment(null);
    const { container } = render(<CourseDetailPage />);
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(await screen.findByTestId("hero")).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("guests get the login-to-enroll action and skip the enrollment fetch", async () => {
    seedCourse();
    states.user = null;
    const user = userEvent.setup();
    render(<CourseDetailPage />);
    await user.click(await screen.findByRole("button", { name: "courseDetail.page.actions.loginToEnroll" }));
    expect(states.routerPush).toHaveBeenCalledWith("/login");
    expect(tableCalls("enrollments", "maybeSingle")).toHaveLength(0);
  });

  it("an unpublished course is hidden from non-instructors with a toast", async () => {
    seedCourse({ is_published: false });
    render(<CourseDetailPage />);
    await waitFor(() => expect(states.toastError).toHaveBeenCalledWith("Course is not published"));
    expect(await screen.findByText("courseDetail.page.status.notFound")).toBeInTheDocument();
    expect(screen.queryByTestId("hero")).toBeNull();
  });

  it("the instructor can open their own unpublished course", async () => {
    seedCourse({ is_published: false });
    states.user = { id: "prof-1", app_metadata: {} };
    render(<CourseDetailPage />);
    expect(await screen.findByTestId("hero")).toBeInTheDocument();
    expect((states.contentProps.current as { isInstructor: boolean }).isInstructor).toBe(true);
  });

  it("an active enrollment offers the AI assistant and the review action", async () => {
    seedCourse();
    seedEnrollment("active");
    const user = userEvent.setup();
    render(<CourseDetailPage />);
    await user.click(
      await screen.findByRole("button", { name: 'courseDetail.page.actions.startAi {"name":"nav.assistant"}' }),
    );
    expect(states.routerPush).toHaveBeenCalledWith("/ai-assistant");
    await user.click(screen.getByRole("button", { name: "courseDetail.page.actions.reviewCourse" }));
    expect(await screen.findByText("submit-review")).toBeInTheDocument();
  });

  it("pending and rejected enrollments show their status; rejected offers retry", async () => {
    seedCourse();
    seedEnrollment("pending");
    const user = userEvent.setup();
    const first = render(<CourseDetailPage />);
    expect(await screen.findByText("courseDetail.page.status.pending")).toBeInTheDocument();
    first.unmount();

    seedEnrollment("rejected");
    render(<CourseDetailPage />);
    await screen.findByText("courseDetail.page.status.rejected");
    await user.click(screen.getByRole("button", { name: "courseDetail.page.actions.retry" }));
    expect(
      await screen.findByRole("button", { name: "courseDetail.page.actions.confirmAndSubmit" }),
    ).toBeInTheDocument();
  });

  it("enrolling uploads the screenshot and upserts a pending enrollment", async () => {
    seedCourse();
    seedEnrollment(null);
    const user = userEvent.setup();
    const { container } = render(<CourseDetailPage />);
    await user.click(await screen.findByRole("button", { name: "courseDetail.page.actions.enroll" }));
    const input = container.querySelector('input[type="file"]') as HTMLElement;
    await user.upload(input, new File(["proof"], "shot.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "courseDetail.page.actions.confirmAndSubmit" }));

    await waitFor(() => expect(states.storageUpload).toHaveBeenCalledTimes(1));
    const [fileName] = states.storageUpload.mock.calls[0] as unknown as [string, File];
    expect(fileName).toMatch(/^u-1\/course-1\/\d+\.png$/);
    const upsert = tableCalls("enrollments", "upsert")[0];
    expect(upsert.args[0]).toEqual({
      student_id: "u-1",
      course_id: "course-1",
      payment_screenshot_url: "proofs/shot.png",
      status: "pending",
    });
    expect(upsert.args[1]).toEqual({ onConflict: "student_id,course_id" });
    expect(states.toastSuccess).toHaveBeenCalledWith("courseDetail.page.toasts.enrollmentSent");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "courseDetail.page.actions.confirmAndSubmit" })).toBeNull(),
    );
  });

  it("a successful review posts course_id/user_id/content and closes the form", async () => {
    seedCourse();
    seedEnrollment("active");
    const user = userEvent.setup();
    render(<CourseDetailPage />);
    await user.click(await screen.findByRole("button", { name: "courseDetail.page.actions.reviewCourse" }));
    await user.click(await screen.findByText("submit-review"));

    await waitFor(() => expect(states.addReview).toHaveBeenCalledTimes(1));
    expect(states.addReview).toHaveBeenCalledWith({
      course_id: "course-1",
      user_id: "u-1",
      rating: 5,
      content: "Great course",
    });
    expect(states.toastSuccess).toHaveBeenCalledWith("courseDetail.page.toasts.reviewAdded");
    await waitFor(() => expect(screen.queryByText("submit-review")).toBeNull());
  });

  it("a failed review toasts the failure and keeps the form open", async () => {
    seedCourse();
    seedEnrollment("active");
    // A rejection WITHOUT a message exercises the localized fallback branch.
    states.addReview = vi.fn(async () => {
      throw { code: "x" };
    });
    const user = userEvent.setup();
    render(<CourseDetailPage />);
    await user.click(await screen.findByRole("button", { name: "courseDetail.page.actions.reviewCourse" }));
    await user.click(await screen.findByText("submit-review"));
    await waitFor(() => expect(states.toastError).toHaveBeenCalledWith("courseDetail.page.toasts.reviewFailed"));
    expect(screen.getByText("submit-review")).toBeInTheDocument();
  });

  it("review rows are mapped to student names with fallbacks", async () => {
    seedCourse();
    seedEnrollment("active");
    const rows: ReviewRow[] = [
      { id: "r-1", rating: 5, comment: "Great", created_at: "2026-02-01T00:00:00Z", full_name: "Stu Dent", username: "stud" },
      { id: "r-2", rating: 3, comment: null, created_at: "2026-02-02T00:00:00Z", full_name: null, username: "user2" },
    ];
    // Queued after seedCourse: the later response wins for review_details.
    chain.respondWith({ data: rows, error: null }, { table: "review_details" });
    render(<CourseDetailPage />);
    await screen.findByTestId("hero");
    const reviews = (states.reviewProps.current as { reviews: Array<{ id: string; rating: number; content?: string; student_name?: string }> }).reviews;
    expect(reviews).toHaveLength(2);
    expect(reviews[0]).toMatchObject({ id: "r-1", rating: 5, content: "Great", student_name: "Stu Dent" });
    expect(reviews[1]).toMatchObject({ id: "r-2", rating: 3, content: undefined, student_name: "user2" });
  });

  it("deleting a summary confirms, deletes and toasts; declining skips the write", async () => {
    seedCourse();
    seedEnrollment("active");
    const user = userEvent.setup();
    render(<CourseDetailPage />);
    await screen.findByTestId("hero");
    await user.click(screen.getByText("delete-summary"));
    await waitFor(() =>
      expect(states.toastSuccess).toHaveBeenCalledWith(
        'courseDetail.page.toasts.deleted {"type":"courseDetail.page.deleteTypes.summary"}',
      ),
    );
    expect(tableCalls("course_summaries", "delete")).toHaveLength(1);
    expect((states.confirmArgs as unknown[])[0]).toBe(
      'courseDetail.page.toasts.confirmDelete {"type":"courseDetail.page.deleteTypes.summary"}',
    );

    states.confirmResult = false;
    await user.click(screen.getByText("delete-summary"));
    await waitFor(() => expect(states.confirmCount).toBe(2));
    expect(tableCalls("course_summaries", "delete")).toHaveLength(1);
    expect(states.toastError).not.toHaveBeenCalled();
  });
});