// Supabase data access for the ai-assistant chat: row mapping, fire-and-forget
// inserts, conversation create/prune/delete and the paged history queries.
// Extracted from useAiChat.ts (T-011a). The browser Supabase client is passed
// in by the hook (which keeps its grandfathered `@/lib/supabase` import)
// instead of imported here — the T-009 ratchet fails lint for any new
// browser-client importer.
import type { SupabaseClient } from "masarx-shared/supabase";
import { CHAT_HISTORY_CAP, CHAT_PAGE_SIZE } from "@/lib/chat-pagination";
import { logger } from "@/lib/logger";
import type { ChatMessage, SupabaseChatMessage } from "./types";

// DB row → transcript message mapping shared by every paged history read
// (restore, loadOlder, switchConversation).
export const mapRowsToMessages = (rows: SupabaseChatMessage[]): ChatMessage[] =>
  rows
    .map((msg) => ({
      id: msg.id,
      type: msg.role as "user" | "assistant",
      content: msg.content,
      timestamp: new Date(msg.created_at)
    }))
    .reverse();

// Spec 008: fire-and-forget inserts must never throw into the chat flow, but
// failures are surfaced to the logger (previously the .then() was discarded).
// Spec 049: rows link to their conversation — the ownership FK
// ((conversation_id, user_id) → conversations(id, user_id)) makes a
// cross-user link impossible, so the client only passes the id it owns.
export const insertChatRow = (
  supabase: SupabaseClient,
  userId: string,
  chatMode: string,
  conversationId: string | null,
  row: { role: "user" | "assistant"; content: string },
) => {
  // Reads the row back so the caller learns the conversation the server-side
  // trigger (20261117225500) may have assigned when conversation_id was null.
  return supabase
    .from("ai_chat_messages")
    .insert({ user_id: userId, role: row.role, content: row.content, mode: chatMode, conversation_id: conversationId })
    .select("conversation_id")
    .single()
    .then(({ data, error }) => {
      if (error) {
        logger.warn("ai_chat_messages insert failed", { error });
        return null;
      }
      return ((data as { conversation_id: string | null } | null)?.conversation_id) ?? null;
    });
};

// Spec 049: lazily create the conversation identity for a thread, titled
// from the first user message. Event-driven by construction — called only
// inside sendMessage's persist path, never on mount/restore. Fire-and-forget
// like the row inserts: a failed create logs and leaves the exchange
// unlinked instead of blocking the UI.
export const ensureConversation = async (
  supabase: SupabaseClient,
  userId: string,
  chatMode: string,
  title: string | null,
): Promise<string | null> => {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, mode: chatMode, title })
    .select("id")
    .single();
  if (error) {
    logger.warn("conversations insert failed", { error });
    return null;
  }
  return (data as { id: string } | null)?.id ?? null;
};

// Keep each conversation at the newest CHAT_HISTORY_CAP rows (spec 049: the
// cap is per conversation, not per mode): probe the overflow window (rows
// 101–200 newest) and delete it when present.
export const pruneChatOverflow = (supabase: SupabaseClient, conversationId: string) => {
  supabase
    .from("ai_chat_messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .range(CHAT_HISTORY_CAP, CHAT_HISTORY_CAP + 99)
    .then(({ data: overflow, error }) => {
      if (error) {
        logger.warn("ai_chat_messages prune probe failed", { error });
        return;
      }
      const ids = ((overflow || []) as { id: string }[]).map((row) => row.id);
      if (ids.length === 0) return;
      supabase
        .from("ai_chat_messages")
        .delete()
        .in("id", ids)
        .then(({ error: deleteError }) => {
          if (deleteError) logger.warn("ai_chat_messages prune delete failed", { error: deleteError });
        });
    });
};

// Newest-page load for a conversation, shared by the restore and
// switchConversation (query + mapping; callers own the cancellation/seq
// guards and the pagination-counter application).
export const fetchConversationNewestPage = async (
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
) => {
  const { data, error } = await supabase
    .from("ai_chat_messages")
    .select("*")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .range(0, CHAT_PAGE_SIZE - 1);
  if (error) throw error;
  const rows = (data || []) as SupabaseChatMessage[];
  return { rows, loadedMessages: mapRowsToMessages(rows) };
};

// Removes a conversation row; the ownership FK cascade takes its messages.
// clearChat swallows errors by contract — it awaits the delete and ignores
// the outcome, exactly like the original inline queries.
export const deleteConversationRow = async (
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<void> => {
  await supabase
    .from("conversations")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
};

// Same delete as deleteConversationRow, but surfaces failures to the logger
// (the deleteConversation hook action reports them).
export const deleteConversationById = async (
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<void> => {
  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) logger.warn("conversations delete failed", { error });
};

// A creation still in flight at clearChat time will produce a conversation
// AFTER the clear (CodeRabbit Major: clearChat saw no previous id and deleted
// nothing, so the cleared exchange stayed server-side) — remove the stranded
// exchange once it materializes.
export const cleanupPendingConversation = (
  supabase: SupabaseClient,
  userId: string,
  pendingCreation: { promise: Promise<string | null> },
): void => {
  void pendingCreation.promise
    .then((id) => {
      if (id) {
        return supabase
          .from("conversations")
          .delete()
          .eq("user_id", userId)
          .eq("id", id);
      }
    })
    .catch((e) => logger.warn("pending conversation cleanup failed", e));
};
