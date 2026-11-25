// Card T-010 - behavioral characterization tests for NewsClient.
// useNews/useNotifications/AuthContext/modals are mocked; the component's
// own filtering (category + search), validation passthrough, login/add-news
// gating, admin delete and the notify-on-add flow run FOR REAL.
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setMockIntlLocale, nextIntlMockFactory } from "@/test/mocks/next-intl";

const states = vi.hoisted(() => ({
  user: null as { id: string } | null,
  isAdmin: false,
  news: [] as Array<Record<string, unknown>>,
  newsLoading: false,
  showAddNews: false,
  deleteNews: undefined as unknown as Mock<(...args: unknown[]) => Promise<void>>,
  addNews: undefined as unknown as Mock<(...args: unknown[]) => Promise<unknown>>,
  setShowAddNews: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
  setNewNews: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
  notifyAdmins: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
  notifyAllUsers: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
  routerPush: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
  logError: undefined as unknown as Mock<(...args: unknown[]) => unknown>,
  addModalProps: { current: null as unknown },
  appealProps: { current: null as unknown },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: states.user, isAdmin: states.isAdmin, loading: false }),
}));
vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({
    notifyAdmins: (...args: unknown[]) => states.notifyAdmins(...args),
    notifyAllUsers: (...args: unknown[]) => states.notifyAllUsers(...args),
  }),
}));
vi.mock("@/hooks/useNews", () => ({
  useNews: () => ({
    news: states.news,
    loading: states.newsLoading,
    showAddNews: states.showAddNews,
    setShowAddNews: (...args: unknown[]) => states.setShowAddNews(...args),
    newNews: { title: "", content: "", type: "announcement", priority: 0, created_by: null },
    setNewNews: (...args: unknown[]) => states.setNewNews(...args),
    deleteNews: (...args: unknown[]) => states.deleteNews(...args),
    addNews: (...args: unknown[]) => states.addNews(...args),
  }),
}));
vi.mock("@/components/AppealFormModal", async () => {
  const React = await import("react");
  return {
    AppealFormModal: (props: Record<string, unknown>) => {
      states.appealProps.current = props;
      return props.isOpen ? React.createElement("div", null, "appeal-modal") : null;
    },
  };
});
vi.mock("@/components/AddNewsModal", async () => {
  const React = await import("react");
  return {
    AddNewsModal: (props: Record<string, unknown>) => {
      states.addModalProps.current = props;
      return React.createElement("div", null, "add-news-modal");
    },
  };
});
vi.mock("@/lib/logger", () => ({
  logger: { error: (...args: unknown[]) => states.logError(...args) },
}));
vi.mock("@/navigation", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => states.routerPush(...args) }),
}));
vi.mock("next-intl", () => nextIntlMockFactory());

import NewsClient from "../NewsClient";

const NEWS_A = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Welcome back",
  content: "Semester starts soon",
  type: "announcement",
  priority: 1,
  created_at: "2026-11-01T00:00:00Z",
  image_urls: [],
  is_active: true,
};
const NEWS_B = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "New feature",
  content: "AI summaries shipped",
  type: "update",
  priority: 0,
  created_at: "2026-11-05T00:00:00Z",
  image_urls: [],
  is_active: true,
};

const ADDED_ID = "33333333-3333-4333-8333-333333333333";

interface AddNewsModalProps {
  onSetShowAddNews: (value: boolean) => void;
  onAddNews: (
    newsData: { title: string; content: string; type: string; priority: number; created_by: string | null },
    fileUrl: string | null,
    imageUrls: string[] | null,
    customCategory: string | null,
  ) => Promise<void>;
}

beforeEach(() => {
  setMockIntlLocale("en");
  states.user = { id: "u-1" };
  states.isAdmin = false;
  states.news = [NEWS_A, NEWS_B];
  states.newsLoading = false;
  states.showAddNews = false;
  states.deleteNews = vi.fn(async () => {});
  states.addNews = vi.fn(async () => ({ id: ADDED_ID }));
  states.setShowAddNews = vi.fn();
  states.setNewNews = vi.fn();
  states.notifyAdmins = vi.fn();
  states.notifyAllUsers = vi.fn();
  states.routerPush = vi.fn();
  states.logError = vi.fn();
  states.addModalProps.current = null;
  states.appealProps.current = null;
});

describe("NewsClient", () => {
  it("shows the loading state before the news list resolves", () => {
    states.newsLoading = true;
    render(<NewsClient />);
    expect(screen.getByText("news.loadingNews")).toBeInTheDocument();
  });

  it("guests get the login prompt which redirects to /login", async () => {
    states.user = null;
    const user = userEvent.setup();
    render(<NewsClient />);
    await user.click(await screen.findByRole("button", { name: "news.loginToAddNews" }));
    expect(states.routerPush).toHaveBeenCalledWith("/login");
  });

  it("logged-in users get the add-news button which opens the modal", async () => {
    const user = userEvent.setup();
    render(<NewsClient />);
    await user.click(await screen.findByRole("button", { name: "news.addNews" }));
    expect(states.setShowAddNews).toHaveBeenCalledWith(true);
  });

  it("renders a card per news item with its category chip", async () => {
    render(<NewsClient />);
    expect(await screen.findByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByText("New feature")).toBeInTheDocument();
    expect(screen.getAllByText("news.categoryAnnouncement").length).toBeGreaterThan(0);
    expect(screen.getAllByText("news.appealNews")).toHaveLength(2);
  });

  it("the category filter narrows the grid to the selected type", async () => {
    const user = userEvent.setup();
    render(<NewsClient />);
    await user.click(await screen.findByRole("button", { name: "news.categoryUpdate" }));
    expect(screen.queryByText("Welcome back")).toBeNull();
    expect(screen.getByText("New feature")).toBeInTheDocument();
  });

  it("the search box filters by title and content", async () => {
    const user = userEvent.setup();
    render(<NewsClient />);
    const input = await screen.findByLabelText("news.searchLabel");
    await user.type(input, "AI summaries");
    expect(screen.queryByText("Welcome back")).toBeNull();
    expect(screen.getByText("New feature")).toBeInTheDocument();

    await user.type(input, "zzz");
    expect(await screen.findByText("news.noNews")).toBeInTheDocument();
  });

  it("the appeal button opens the appeal modal for that item", async () => {
    const user = userEvent.setup();
    render(<NewsClient />);
    await user.click((await screen.findAllByText("news.appealNews"))[0]);
    const props = states.appealProps.current as { isOpen: boolean; contentId: string; contentTitle: string };
    expect(props.isOpen).toBe(true);
    expect(props.contentId).toBe(NEWS_A.id);
    expect(props.contentTitle).toBe("Welcome back");
    expect(screen.getByText("appeal-modal")).toBeInTheDocument();
  });

  it("only admins see the delete button, and it deletes that item", async () => {
    const user = userEvent.setup();
    const first = render(<NewsClient />);
    await screen.findByText("Welcome back");
    expect(screen.queryByText("news.deleteNews")).toBeNull();
    first.unmount();

    states.isAdmin = true;
    render(<NewsClient />);
    await user.click((await screen.findAllByText("news.deleteNews"))[0]);
    await waitFor(() => expect(states.deleteNews).toHaveBeenCalledWith(NEWS_A.id));
  });

  it("a valid submission notifies admins and all users and closes the modal", async () => {
    render(<NewsClient />);
    const modal = states.addModalProps.current as AddNewsModalProps;
    await act(async () => {
      await modal.onAddNews(
        { title: "Big news", content: "Body", type: "update", priority: 0, created_by: "u-1" },
        null,
        null,
        null,
      );
    });
    expect(states.addNews).toHaveBeenCalledTimes(1);
    expect(states.notifyAdmins).toHaveBeenCalledTimes(1);
    expect((states.notifyAdmins.mock.calls[0] as unknown[])[0]).toBe("news.reviewRequired");
    expect(states.notifyAllUsers).toHaveBeenCalledTimes(1);
    expect((states.notifyAllUsers.mock.calls[0] as unknown[])[0]).toBe("news.newNewsTitle");
    expect(states.setShowAddNews).toHaveBeenCalledWith(false);
  });

  it("blank title/content submissions never reach addNews", async () => {
    render(<NewsClient />);
    const modal = states.addModalProps.current as AddNewsModalProps;
    await act(async () => {
      await modal.onAddNews(
        { title: "   ", content: "Body", type: "update", priority: 0, created_by: null },
        null,
        null,
        null,
      );
    });
    expect(states.addNews).not.toHaveBeenCalled();
    expect(states.notifyAdmins).not.toHaveBeenCalled();
  });

  it("a rejected submission is logged, not silently swallowed", async () => {
    states.addNews = vi.fn(async () => {
      throw new Error("db down");
    });
    render(<NewsClient />);
    const modal = states.addModalProps.current as AddNewsModalProps;
    await act(async () => {
      await modal.onAddNews(
        { title: "Big news", content: "Body", type: "update", priority: 0, created_by: null },
        null,
        null,
        null,
      );
    });
    expect(states.logError).toHaveBeenCalledTimes(1);
  });
});