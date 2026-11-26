// Guest-mode persistence for the ai-assistant chat: localStorage restore/save
// plus the last-selected mode key. Extracted from useAiChat.ts (T-011a).
import type { AiAssistantMode } from "@/lib/ai-assistant";
import { CHAT_HISTORY_CAP } from "@/lib/chat-pagination";
import type { ChatMessage } from "./types";

export const CHAT_STORAGE_KEY_PREFIX = "ai_assistant_chat_messages";

const LAST_MODE_STORAGE_KEY = "zane_ai_last_mode";

// useState initializer for the last-selected mode (SSR-safe, runs once).
export const loadSavedMode = (): AiAssistantMode => {
  if (typeof window === "undefined") return "cs_assistant";
  const saved = localStorage.getItem(LAST_MODE_STORAGE_KEY);
  if (saved === "cs_assistant" || saved === "student_agent" || saved === "group_rag") {
    return saved;
  }
  return "cs_assistant";
};

export const persistLastMode = (next: AiAssistantMode): void => {
  localStorage.setItem(LAST_MODE_STORAGE_KEY, next);
};

// Reads and normalizes the guest transcript for a storage key.
// Returns null for a corrupted payload — the caller must then leave the
// current transcript untouched (the original inline restore ignored the
// parse failure without resetting state).
export const readGuestMessages = (storageKey: string): ChatMessage[] | null => {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) {
      return parsed.map((msg: ChatMessage) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }));
    }
    return [];
  } catch {
    return null;
  }
};

// Guest persistence is EVENT-driven, not state-synced. The old hook effect
// wrote on every `messages` change, and since `user` starts as `null`
// (AuthContext never passes undefined — the `undefined` guards were dead
// code), the first mount commit saw `messages=[]` and REMOVED the guest key
// before the restored state re-rendered, re-saving it a beat later. Every
// page load deleted and rewrote the conversation, and a mode switch briefly
// wrote the OLD conversation under the NEW mode's key. Now pendingPersistRef
// is raised only by real append events; the hook's effect consumes it once
// and skips every other commit (mount, mode switch, auth transitions).
// Deletion stays exclusive to clearChat.
//
// The write itself, capped at the same CHAT_HISTORY_CAP the DB path enforces
// (spec 008 leftover closed in 011) — oldest dropped first. Empty lists
// never persist.
export const saveGuestMessages = (storageKey: string, messages: ChatMessage[]): void => {
  if (messages.length === 0) return;
  const capped = messages.slice(-CHAT_HISTORY_CAP);
  localStorage.setItem(storageKey, JSON.stringify(capped));
};
