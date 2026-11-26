// Transcript synchronization for the authenticated chat: restore on mount /
// mode / user change, lazy older-page loading, conversation switching and the
// shared transcript-transition reset. Extracted from useAiChat.ts (T-011a).
// Callers own the lifecycle generation; every async completion re-checks it so
// a superseded load never touches shared state.
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { SupabaseClient } from "masarx-shared/supabase";
import type { AiAssistantMode } from "@/lib/ai-assistant";
import { CHAT_PAGE_SIZE, hasMoreAfterLoad, nextOlderRange } from "@/lib/chat-pagination";
import { pickCurrentConversation } from "@/lib/chat-conversations";
import type { Conversation } from "@/types/database";
import { logger } from "@/lib/logger";
import { fetchConversationNewestPage, mapRowsToMessages } from "./conversations";
import type { ChatMessage, ConversationEnsure, SupabaseChatMessage } from "./types";

// State surface of the reset/switch transitions (all refs and setters are
// stable across renders; the api object is built inside the hook callbacks).
export interface TranscriptResetApi {
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setHasMoreOlder: Dispatch<SetStateAction<boolean>>;
  setIsReady: Dispatch<SetStateAction<boolean>>;
  loadedCountRef: RefObject<number>;
  lifecycleRef: RefObject<number>;
  setCurrentConversation: (id: string | null) => void;
  orphanConversationRef: RefObject<string | null>;
  conversationEnsureRef: RefObject<ConversationEnsure | null>;
}

// Shared transition for clearChat / deleteConversation-of-the-active-thread /
// startNewConversation: bump the lifecycle generation so any in-flight
// completion (loaded page, created conversation, streamed reply) drops its
// result, then empty the transcript. All three are synchronous blocks — React
// batches the state updates, so the committed state is identical to the
// original per-site statement ordering.
export const resetTranscriptForNewThread = (api: TranscriptResetApi): void => {
  api.lifecycleRef.current += 1;
  api.setMessages([]);
  api.loadedCountRef.current = 0;
  api.setHasMoreOlder(false);
  api.setIsReady(true);
  api.setCurrentConversation(null);
  api.orphanConversationRef.current = null;
  api.conversationEnsureRef.current = null;
};

// Newest-page restore for the authenticated path (the async body of the
// mount/mode/user-change effect). isStale covers unmount AND supersession by
// a newer transcript transition.
export interface TranscriptRestoreApi {
  isStale: () => boolean;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setHasMoreOlder: Dispatch<SetStateAction<boolean>>;
  setIsReady: Dispatch<SetStateAction<boolean>>;
  loadedCountRef: RefObject<number>;
  setCurrentConversation: (id: string | null) => void;
}

export const restoreLatestTranscript = async (
  supabase: SupabaseClient,
  userId: string,
  mode: AiAssistantMode,
  api: TranscriptRestoreApi,
): Promise<void> => {
  const { isStale, setCurrentConversation, loadedCountRef, setHasMoreOlder, setMessages, setIsReady } = api;
  try {
    // Spec 049: restore the most recently active conversation of this
    // (user, mode) — updated_at is bumped server-side on every message
    // insert (tr_touch_conversation_updated_at) — then load only its
    // newest page (CHAT_PAGE_SIZE rows); the retained window is walked
    // backwards via loadOlder. desc + range keeps the "newest rows
    // readable" contract from spec 008 §4, now conversation-scoped.
    const { data: convs, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .eq("mode", mode)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (isStale()) return;
    if (convError) throw convError;

    const current = pickCurrentConversation((convs || []) as Conversation[]);
    if (!current) {
      // No conversation yet for this mode — an empty, ready chat. The
      // first send creates one (event-driven, never on mount).
      if (!isStale()) setIsReady(true);
      return;
    }
    setCurrentConversation(current.id);

    const { rows, loadedMessages } = await fetchConversationNewestPage(supabase, userId, current.id);

    if (isStale()) return;
    loadedCountRef.current = loadedMessages.length;
    setHasMoreOlder(hasMoreAfterLoad(rows.length, CHAT_PAGE_SIZE, loadedMessages.length));
    setMessages(loadedMessages);
  } catch (e) {
    if (!isStale()) {
      logger.error("Failed to load Supabase messages", e);
      setMessages([]);
    }
  } finally {
    if (!isStale()) setIsReady(true);
  }
};

// State surface of loadOlder (prepend contract lives in the caller's scroll
// anchor, not here).
export interface LoadOlderApi {
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setHasMoreOlder: Dispatch<SetStateAction<boolean>>;
  setLoadingOlder: Dispatch<SetStateAction<boolean>>;
  loadedCountRef: RefObject<number>;
  loadingOlderRef: RefObject<boolean>;
  lifecycleRef: RefObject<number>;
  conversationIdRef: RefObject<string | null>;
}

// Spec 011: fetch the next older page inside the retained window and
// PREPEND it. The scroll anchor is preserved by ChatContainer's layout
// effect (scrollHeight delta), not here.
export const loadOlderMessages = async (
  supabase: SupabaseClient,
  userId: string | null | undefined,
  api: LoadOlderApi,
): Promise<void> => {
  const currentConversation = api.conversationIdRef.current;
  if (!userId || !currentConversation || api.loadingOlderRef.current) return;
  const range = nextOlderRange(api.loadedCountRef.current);
  if (!range) {
    api.setHasMoreOlder(false);
    return;
  }

  api.loadingOlderRef.current = true;
  api.setLoadingOlder(true);
  // A switch/clear/delete during the fetch must not prepend the old
  // conversation's rows into whatever transcript is current now.
  const gen = api.lifecycleRef.current;
  try {
    const { data, error } = await supabase
      .from("ai_chat_messages")
      .select("*")
      .eq("user_id", userId)
      .eq("conversation_id", currentConversation)
      .order("created_at", { ascending: false })
      .range(range.start, range.end);

    if (error) throw error;

    const rows = (data || []) as SupabaseChatMessage[];
    const older = mapRowsToMessages(rows);

    if (gen !== api.lifecycleRef.current) return;
    api.loadedCountRef.current = range.start + older.length;
    api.setHasMoreOlder(hasMoreAfterLoad(older.length, range.end - range.start + 1, api.loadedCountRef.current));
    if (older.length > 0) {
      api.setMessages(prev => [...older, ...prev]);
    }
  } catch (e) {
    logger.error("Failed to load older chat messages", e);
  } finally {
    api.loadingOlderRef.current = false;
    api.setLoadingOlder(false);
  }
};

// Spec 049: swap the transcript to another conversation of this user —
// same paged contract as the restore (newest page + loadOlder for the
// rest). Mode-scoped lists are the caller's concern (spec 049 decision):
// a conversation of another mode loads fine but the caller decides what is
// listed; the next send still writes under the CURRENT mode.
export const switchToConversation = async (
  supabase: SupabaseClient,
  userId: string,
  id: string,
  api: TranscriptResetApi,
): Promise<void> => {
  const { setMessages, setHasMoreOlder, setIsReady, loadedCountRef, lifecycleRef, setCurrentConversation, orphanConversationRef, conversationEnsureRef } = api;
  // Bumping the shared generation (instead of a switch-only seq) is the
  // CodeRabbit Major fix: a pending page load must be invalidated not only
  // by another switch but by clearChat and deleteConversation too.
  const gen = ++lifecycleRef.current;
  setIsReady(false);
  setMessages([]);
  loadedCountRef.current = 0;
  setHasMoreOlder(false);
  setCurrentConversation(id);
  orphanConversationRef.current = null;
  conversationEnsureRef.current = null;
  try {
    const { rows, loadedMessages } = await fetchConversationNewestPage(supabase, userId, id);
    if (gen !== lifecycleRef.current) return;
    loadedCountRef.current = loadedMessages.length;
    setHasMoreOlder(hasMoreAfterLoad(rows.length, CHAT_PAGE_SIZE, loadedMessages.length));
    setMessages(loadedMessages);
  } catch (e) {
    if (gen !== lifecycleRef.current) return;
    logger.error("Failed to switch conversation", e);
    setMessages([]);
  } finally {
    if (gen === lifecycleRef.current) setIsReady(true);
  }
};
