// Streaming sink for an in-flight assistant reply (spec 011): the first delta
// appends the assistant message (streaming: true); later deltas update its
// content at most once per frame. Extracted from useAiChat.ts (T-011a) — the
// sendMessage orchestration owns the sink's lifecycle.
import type { Dispatch, RefObject, SetStateAction } from "react";
import { createDeltaThrottle } from "@/lib/ai/delta-throttle";
import type { ChatMessage } from "./types";

export interface ChatStreamSink {
  /** Feed a streamed full-text snapshot (flushed at most once per frame). */
  update: (full: string) => void;
  /** Drop any pending frame flush. */
  cancel: () => void;
  /** True once at least one delta painted the streaming message. */
  hasVisibleStream: () => boolean;
  /** Marks the partial message as done streaming without touching content. */
  endStream: () => void;
  /** Applies the final text and clears the streaming flag. True when the stream had started. */
  finalize: (finalContent: string) => boolean;
}

export const createChatStreamSink = (
  assistantMsgId: string,
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>,
  // Supersession guard shared by every paint: false once the mode or the
  // transcript lifecycle moved on (mode switch, switch, clear, delete).
  isCurrent: () => boolean,
  // Raised on finalize so the event-driven guest persist effect consumes it.
  pendingPersistRef: RefObject<boolean>,
): ChatStreamSink => {
  let streamStarted = false;
  const flushStream = (full: string) => {
    if (!isCurrent()) return;
    if (!streamStarted) {
      streamStarted = true;
      setMessages(prev => [
        ...prev,
        { id: assistantMsgId, type: "assistant", content: full, timestamp: new Date(), streaming: true },
      ]);
    } else {
      setMessages(prev => prev.map(m => (m.id === assistantMsgId ? { ...m, content: full } : m)));
    }
  };
  const deltaThrottle = createDeltaThrottle(flushStream, (cb) => {
    const frame = requestAnimationFrame(cb);
    return () => cancelAnimationFrame(frame);
  });
  return {
    update: (full) => deltaThrottle.update(full),
    cancel: () => deltaThrottle.cancel(),
    hasVisibleStream: () => streamStarted,
    endStream: () => {
      setMessages(prev => prev.map(m => (m.id === assistantMsgId ? { ...m, streaming: false } : m)));
    },
    finalize: (finalContent: string): boolean => {
      deltaThrottle.cancel();
      if (!streamStarted) return false;
      streamStarted = false;
      pendingPersistRef.current = true;
      setMessages(prev => prev.map(m => (
        m.id === assistantMsgId ? { ...m, content: finalContent, streaming: false } : m
      )));
      return true;
    },
  };
};
