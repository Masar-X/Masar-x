// Send orchestration for the ai-assistant chat: history/context building, the
// spec-050 prompt cap, the model call, streaming sink wiring, the
// conversation-ensure persistence chain and the failure fallback. Extracted
// from useAiChat.ts (T-011a) — behavior-preserving; the hook passes every
// reactive value and ref down, the browser Supabase client included (the
// T-009 ratchet fails lint for any new browser-client importer).
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { User } from "@supabase/supabase-js";
import type { SlimAuthUser } from "@/lib/slimAuthUser";
import type { SupabaseClient } from "masarx-shared/supabase";
import { aiAssistant } from "@/lib/ai-assistant";
import type { AiAssistantMode, AiChatHistoryTurn } from "@/lib/ai-assistant";
import type { useTranslations } from "next-intl";
import { AI_PROMPT_MAX_CHARS } from "@/lib/ai/pasted-attachments";
import { PROMPT_TRUNCATION_MARKER } from "@/lib/ai/prompts";
import { cannedMessagesFor } from "@/lib/ai/canned-messages";
import { deriveConversationTitle } from "@/lib/chat-conversations";
import { buildStudentContext } from "@/lib/student-agent/contextBuilder";
import type { UserAcademic } from "@/lib/academic-utils";
import { logger } from "@/lib/logger";
import { ensureConversation, insertChatRow, pruneChatOverflow } from "./conversations";
import { createChatStreamSink } from "./stream-sink";
import type { ChatStreamSink } from "./stream-sink";
import type { ChatMessage, ConversationEnsure } from "./types";

export interface SendMessageDeps {
  supabase: SupabaseClient;
  // WS1 (spec 060): accepts the slim RSC user until the client hydrates the full one.
  user: User | SlimAuthUser | null | undefined;
  isLoading: boolean;
  mode: AiAssistantMode;
  studentSelectedSubject: string;
  academic: UserAcademic;
  locale: string;
  t: ReturnType<typeof useTranslations<"aiAssistant">>;
  trackEvent: (event: string, properties?: Record<string, unknown>) => void;
  isPuterSignedIn: boolean;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  messagesRef: RefObject<ChatMessage[]>;
  modeRef: RefObject<AiAssistantMode>;
  pendingPersistRef: RefObject<boolean>;
  conversationIdRef: RefObject<string | null>;
  conversationEnsureRef: RefObject<ConversationEnsure | null>;
  orphanConversationRef: RefObject<string | null>;
  lifecycleRef: RefObject<number>;
  setCurrentConversation: (id: string | null) => void;
}

// Spec 049: the conversation is ensured first — lazily, inside this send
// event only — so the row can link to it; a failed create logs and leaves the
// exchange unlinked instead of blocking the UI. The ensure promise is keyed
// to (user, mode) and reused while in-flight, so the assistant insert joins
// the same identity instead of racing the ref write. CodeRabbit Major: a
// promise created for (mode A, user X) is never reused for another context —
// the key check recreates instead.
const ensureConversationForSend = (params: {
  supabase: SupabaseClient;
  userId: string;
  chatMode: string;
  sendGen: number;
  content: string;
  lifecycleRef: RefObject<number>;
  conversationIdRef: RefObject<string | null>;
  conversationEnsureRef: RefObject<ConversationEnsure | null>;
  orphanConversationRef: RefObject<string | null>;
  setCurrentConversation: (id: string | null) => void;
}): Promise<string | null> => {
  const { supabase, userId, chatMode, sendGen, content, lifecycleRef, conversationIdRef, conversationEnsureRef, orphanConversationRef, setCurrentConversation } = params;
  const ensureKey = `${userId}:${chatMode}`;
  if (conversationEnsureRef.current?.key !== ensureKey) conversationEnsureRef.current = null;
  let ensurePromise: Promise<string | null>;
  if (conversationIdRef.current != null) {
    ensurePromise = Promise.resolve(conversationIdRef.current);
  } else if (conversationEnsureRef.current) {
    ensurePromise = conversationEnsureRef.current.promise;
  } else {
    ensurePromise = ensureConversation(supabase, userId, chatMode, deriveConversationTitle(content)).then(
      (id) => {
        if (id) {
          // Only the lifecycle this creation started under may adopt the
          // id — a clear/switch mid-create must not reactivate the
          // produced conversation into the emptied view.
          if (lifecycleRef.current === sendGen) setCurrentConversation(id);
        } else if (conversationEnsureRef.current?.promise === ensurePromise) {
          conversationEnsureRef.current = null; // allow a fresh attempt on the next send
        }
        return id;
      },
    );
    conversationEnsureRef.current = { key: ensureKey, promise: ensurePromise };
  }
  void ensurePromise
    .then((ensured) =>
      insertChatRow(supabase, userId, chatMode, ensured, { role: "user", content: content.trim() }),
    )
    .then((assignedId) => {
      // The server-side trigger (20261117225500) links even failed-create
      // rows to a conversation. Adopt that id under the send's lifecycle
      // and remember it so clearChat can remove the stranded exchange
      // (CodeRabbit follow-up to the trigger fix).
      if (assignedId && lifecycleRef.current === sendGen && conversationIdRef.current == null) {
        setCurrentConversation(assignedId);
        orphanConversationRef.current = assignedId;
        pruneChatOverflow(supabase, assignedId);
      }
    })
    .catch((e) => logger.warn("chat conversation ensure chain failed", e));
  return ensurePromise;
};

// Persist the reply to its ORIGINATING conversation regardless of UI state
// (CodeRabbit Major 3: join the send's captured ensure outcome for both row
// inserts — reading the mutable ref here would link the reply to a later
// send's conversation or drop the link entirely after a switch). UI
// application stays guarded by the caller.
const persistAssistantReply = (
  supabase: SupabaseClient,
  userId: string,
  chatMode: string,
  ensurePromise: Promise<string | null>,
  response: string,
): void => {
  void Promise.resolve(ensurePromise)
    .catch(() => null)
    .then((ensured) => {
      insertChatRow(supabase, userId, chatMode, ensured ?? null, { role: "assistant", content: response });
      if (ensured) pruneChatOverflow(supabase, ensured);
    });
};

const buildHistoryTurns = (messages: ChatMessage[], userMsg: ChatMessage): AiChatHistoryTurn[] =>
  [...messages, userMsg]
    .filter(m => m?.content && m.content.trim())
    .map(m => ({
      role: m.type === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));

// Student-agent RAG grounding: scope the retrieval to the selected subject
// and build the platform context (undefined for the other modes).
const buildPlatformContext = async (
  mode: AiAssistantMode,
  studentSelectedSubject: string,
  content: string,
  academic: UserAcademic,
): Promise<string | undefined> => {
  if (mode !== 'student_agent') return undefined;

  const scopedQuery = studentSelectedSubject
    ? `${content} (المادة المختارة: ${studentSelectedSubject})`
    : content;

  const built = await buildStudentContext(
    {
      level: academic.level,
      semester: academic.semester,
      department_id: academic.department_id,
    },
    scopedQuery,
  );

  if (!built.context || built.sources.length === 0) return "";
  return built.context;
};

// Spec 050 backstop (issue #242): the UI surfaces refuse over-cap sends
// with a toast before reaching here, but sendMessage is the single choke
// point for every caller — mirror the fallback route's 10k Zod cap so a
// bypassing caller can never hand the Puter path an unbounded string.
// Display and persistence keep the full text; only the model sees the cut.
const truncatePromptForModel = (content: string): string =>
  content.length > AI_PROMPT_MAX_CHARS
    ? `${content.slice(0, AI_PROMPT_MAX_CHARS)}${PROMPT_TRUNCATION_MARKER}`
    : content;

const requestAssistantResponse = async (params: {
  promptForModel: string;
  mode: AiAssistantMode;
  chatHistory: AiChatHistoryTurn[];
  platformContext?: string;
  model?: string;
  locale: string;
  onDelta: (full: string) => void;
}): Promise<string> => {
  const { promptForModel, mode, chatHistory, platformContext, model, locale, onDelta } = params;
  return aiAssistant.generateResponse(promptForModel, undefined, {
    mode,
    chatHistory,
    platformContext,
    model,
    locale,
    onDelta,
  });
};

// Error fallback for a failed send (the original catch block, verbatim):
// log, drop pending throttled frames, and either keep the partial stream or
// append the generic error bubble — never painting into a transcript the
// send no longer belongs to.
const applySendFailure = (params: {
  error: unknown;
  sink: ChatStreamSink;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  isCurrent: () => boolean;
  pendingPersistRef: RefObject<boolean>;
  locale: string;
}): void => {
  const { error, sink, setMessages, isCurrent, pendingPersistRef, locale } = params;
  logger.error("Failed to send AI message", error);
  sink.cancel();
  // Same supersession guard as the response path — an error bubble from a
  // dead send must not paint into whatever transcript is current now.
  if (!isCurrent()) return;
  pendingPersistRef.current = true;
  if (sink.hasVisibleStream()) {
    // Rare: an error after partial text was shown (streamPuterChat returns
    // partial content instead of throwing once text arrived). Keep what
    // the user saw; appending the generic error bubble on top of visible
    // content would read as a second failed answer.
    sink.endStream();
  } else {
    setMessages(prev => [...prev, {
      id: `error_${Date.now()}`,
      type: "assistant",
      // i18n (spec 012 drive-by): was a hardcoded Arabic string.
      content: cannedMessagesFor(locale).genericError,
      timestamp: new Date()
    }]);
  }
};

// The body of the useAiChat sendMessage callback (verbatim behavior; the hook
// keeps the identical useCallback dependency array and passes the captured
// values down).
export const runSendMessage = async (
  deps: SendMessageDeps,
  content: string,
  modelOverride?: string,
): Promise<void> => {
  const { supabase, user, isLoading, mode, studentSelectedSubject, academic, locale, t, trackEvent, isPuterSignedIn, setMessages, setIsLoading, messagesRef, modeRef, pendingPersistRef, conversationIdRef, conversationEnsureRef, orphanConversationRef, lifecycleRef, setCurrentConversation } = deps;
  if (!content.trim() || isLoading) return;

  if (mode === 'student_agent' && !studentSelectedSubject) {
    pendingPersistRef.current = true;
    setMessages((prev) => [
      ...prev,
      {
        id: `assistant_${Date.now()}`,
        type: "assistant",
        // Canned guard reply (spec 041 i18n batch): user-facing assistant
        // content, translated like any other copy.
        content: t("studentAgentNeedsSubject"),
        timestamp: new Date(),
      },
    ]);
    return;
  }

  const userMsg: ChatMessage = {
    id: `user_${Date.now()}`,
    type: "user",
    content: content.trim(),
    timestamp: new Date(),
  };

  const currentMode = modeRef.current;
  const sendGen = lifecycleRef.current;
  pendingPersistRef.current = true;
  setMessages(prev => [...prev, userMsg]);
  setIsLoading(true);

  // ── Streaming (spec 011) ──────────────────────────────────────────────────
  // The first delta appends the assistant message (streaming: true); later
  // deltas update its content at most once per frame. The persist effect
  // consumes pendingPersistRef once, so intermediate renders stay
  // write-free — only the finalize below persists.
  const assistantMsgId = `assistant_${Date.now()}`;
  const sink = createChatStreamSink(
    assistantMsgId,
    setMessages,
    () => modeRef.current === currentMode && lifecycleRef.current === sendGen,
    pendingPersistRef,
  );

  // Save user message to Supabase if authenticated (the ensure chain; guests
  // keep the default resolved-null, which makes the assistant-side join a
  // no-op for them).
  const ensurePromise: Promise<string | null> = user
    ? ensureConversationForSend({
        supabase,
        userId: user.id,
        chatMode: currentMode,
        sendGen,
        content,
        lifecycleRef,
        conversationIdRef,
        conversationEnsureRef,
        orphanConversationRef,
        setCurrentConversation,
      })
    : Promise.resolve(null);

  trackEvent("ai_question_asked", { length: content.length, using_puter_auth: isPuterSignedIn, model: modelOverride });

  try {
    const historyTurns: AiChatHistoryTurn[] = buildHistoryTurns(messagesRef.current, userMsg);

    const platformContext = await buildPlatformContext(mode, studentSelectedSubject, content, academic);

    const promptForModel = truncatePromptForModel(content);

    const response = await requestAssistantResponse({
      promptForModel,
      mode,
      chatHistory: historyTurns,
      platformContext,
      model: modelOverride,
      locale,
      onDelta: (full) => sink.update(full),
    });

    if (user) {
      persistAssistantReply(supabase, user.id, currentMode, ensurePromise, response);
    }

    // Avoid setting state if the mode or the transcript lifecycle moved on
    // (mode switch, conversation switch, clear, delete — CodeRabbit Major:
    // a reply must never be appended to a transcript it was not asked in).
    if (modeRef.current !== currentMode || lifecycleRef.current !== sendGen) {
      sink.cancel();
      return;
    }

    const streamed = sink.finalize(response);
    if (!streamed) {
      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        type: "assistant",
        content: response,
        timestamp: new Date(),
      };
      pendingPersistRef.current = true;
      setMessages(prev => [...prev, assistantMsg]);
    }
  } catch (_e) {
    applySendFailure({
      error: _e,
      sink,
      setMessages,
      isCurrent: () => modeRef.current === currentMode && lifecycleRef.current === sendGen,
      pendingPersistRef,
      locale,
    });
  } finally {
    setIsLoading(false);
  }
};
