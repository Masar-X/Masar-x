// Shared transcript types for the ai-chat hook modules. Extracted from
// useAiChat.ts (T-011a) — behavior-preserving split.

export interface ChatMessage {
  id: string;
  type: "user" | "assistant";
  content: string;
  timestamp: Date;
  /** True while this message is still receiving streamed deltas (spec 011). */
  streaming?: boolean;
}

export interface SupabaseChatMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

// Spec 049: in-flight conversation-ensure promise of the current send, keyed
// to its (userId, mode) context — see send-message.ts.
export interface ConversationEnsure {
  key: string;
  promise: Promise<string | null>;
}
