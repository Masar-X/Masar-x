"use client";

import { User } from "@supabase/supabase-js";
import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { supabase } from "@/lib/supabase";
import type { AiAssistantMode } from "@/lib/ai-assistant";
import { useUserAcademic } from "@/hooks/useUserAcademic";
import { CHAT_STORAGE_KEY_PREFIX, loadSavedMode, persistLastMode, readGuestMessages, saveGuestMessages } from "@/hooks/ai-chat/guest-storage";
import { cleanupPendingConversation, deleteConversationById, deleteConversationRow } from "@/hooks/ai-chat/conversations";
import { loadOlderMessages, resetTranscriptForNewThread, restoreLatestTranscript, switchToConversation } from "@/hooks/ai-chat/transcript-sync";
import { runSendMessage } from "@/hooks/ai-chat/send-message";
import { usePuterSignInStatus } from "@/hooks/ai-chat/puter-status";
import type { ChatMessage, ConversationEnsure } from "@/hooks/ai-chat/types";

// Orchestrator for the ai-assistant chat state (specs 008/011/036/049/050/051).
// The data access, persistence, streaming and send orchestration live in the
// ai-chat/ modules next to this file — behavior-preserving split (T-011a);
// this hook keeps the exact public return surface and callback timing.
export function useAiChat(user: User | null | undefined, trackEvent: (event: string, properties?: Record<string, unknown>) => void) {
  const locale = useLocale();
  const t = useTranslations("aiAssistant");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Spec 036 Track A: render-body mirror — sendMessage snapshots history from
  // this ref (see ai-chat/send-message); assigned during render.
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false); // New: tracks when everything is loaded and ready
  const isPuterSignedIn = usePuterSignInStatus();
  // Spec 011: lazy history sync — the newest page renders first; older rows
  // inside the retained window (spec 008 prune cap) load on scroll-to-top.
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadedCountRef = useRef(0);
  const loadingOlderRef = useRef(false);
  // Spec 049: identity of the conversation the transcript is bound to — the
  // ref is the stable read for callbacks; the state mirrors it for consumers.
  const [conversationId, setConversationId] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  // Spec 049: in-flight conversation-ensure promise of the current send,
  // keyed to its (userId, mode) context — see ai-chat/send-message.
  const conversationEnsureRef = useRef<ConversationEnsure | null>(null);
  // Conversation the server-side trigger assigned to a failed-create row —
  // remembered until clearChat can remove the stranded exchange.
  const orphanConversationRef = useRef<string | null>(null);
  // Transcript lifecycle generation: one monotonic counter every
  // transcript-replacing transition bumps; an async completion may only touch
  // shared state while its captured generation is still current.
  const lifecycleRef = useRef(0);
  const setCurrentConversation = useCallback((id: string | null) => {
    conversationIdRef.current = id;
    setConversationId(id);
  }, []);
  const [mode, setModeState] = useState<AiAssistantMode>(loadSavedMode);
  const storageKey = `${CHAT_STORAGE_KEY_PREFIX}_${mode}`;

  const { academic } = useUserAcademic();
  const [studentSelectedSubject, setStudentSelectedSubject] = useState<string>("");

  // GUEST PATH — useLayoutEffect runs synchronously before the browser paints
  // (no "spinner flash"). readGuestMessages returns null for corrupted
  // payloads — the transcript stays untouched, like the original restore.
  useLayoutEffect(() => {
    if (user === undefined) return;
    if (!user) {
      const restored = readGuestMessages(storageKey);
      if (restored !== null) setMessages(restored);
      setIsReady(true);
    }
  }, [user, mode, storageKey]);

  // AUTHENTICATED PATH — async Supabase restore (ai-chat/transcript-sync)
  useEffect(() => {
    if (!user?.id) return;

    lifecycleRef.current += 1;
    const gen = lifecycleRef.current;
    conversationEnsureRef.current = null; // new (user, mode) context — no stale reuse
    orphanConversationRef.current = null;

    setIsReady(false);
    setMessages([]);
    loadedCountRef.current = 0;
    setHasMoreOlder(false);
    setCurrentConversation(null);

    let cancelled = false;
    // Superseded = unmounted OR a newer transcript transition (clear, switch,
    // delete) bumped the generation while this restore was in flight.
    const stale = () => cancelled || gen !== lifecycleRef.current;

    restoreLatestTranscript(supabase, user.id, mode, {
      isStale: stale,
      setMessages,
      setHasMoreOlder,
      setIsReady,
      loadedCountRef,
      setCurrentConversation,
    });
    return () => { cancelled = true; };
  }, [user?.id, mode, setCurrentConversation]);

  const loadOlder = useCallback(async () => {
    await loadOlderMessages(supabase, user?.id, {
      setMessages,
      setHasMoreOlder,
      setLoadingOlder,
      loadedCountRef,
      loadingOlderRef,
      lifecycleRef,
      conversationIdRef,
    });
  }, [user?.id]);

  // Guest persistence is EVENT-driven, not state-synced: pendingPersistRef is
  // raised only by real append events, the effect consumes it once and skips
  // every other commit (mount, mode switch, auth transitions). Deletion stays
  // exclusive to clearChat. Full history: ai-chat/guest-storage.
  // Live-mode ref for in-flight guards: the send closure captures `mode` at
  // call time, so the ref (always current) is what guards compare against
  // (review 2026-11-07 D3).
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const pendingPersistRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined" || user === undefined || user) {
      pendingPersistRef.current = false;
      return;
    }
    if (!pendingPersistRef.current) return;
    pendingPersistRef.current = false;
    saveGuestMessages(storageKey, messages);
  }, [messages, user, storageKey]);

  const sendMessage = useCallback(
    (content: string, modelOverride?: string) =>
      runSendMessage(
        {
          supabase,
          user,
          isLoading,
          mode,
          studentSelectedSubject,
          academic: { level: academic.level, semester: academic.semester, department_id: academic.department_id },
          locale,
          t,
          trackEvent,
          isPuterSignedIn,
          setMessages,
          setIsLoading,
          messagesRef,
          modeRef,
          pendingPersistRef,
          conversationIdRef,
          conversationEnsureRef,
          orphanConversationRef,
          lifecycleRef,
          setCurrentConversation,
        },
        content,
        modelOverride,
      ),
    [user, isLoading, trackEvent, isPuterSignedIn, mode, studentSelectedSubject, academic.level, academic.semester, academic.department_id, locale, t, setCurrentConversation],
  );

  const clearChat = useCallback(async () => {
    // The clear is itself a transcript transition: the reset bumps the
    // generation so pending completions drop their results instead of
    // repopulating the emptied view, and isReady is set here because the
    // superseded loads' finally blocks no longer will. The captures below
    // must happen before the reset nulls the refs.
    const previous = conversationIdRef.current;
    // A creation still in flight will produce a conversation AFTER the clear
    // (CodeRabbit Major: clearChat saw no previous id and deleted nothing, so
    // the cleared exchange stayed server-side) — capture it and remove the
    // stranded exchange once it materializes.
    const pendingCreation = conversationEnsureRef.current;
    // The trigger-assigned fallback conversation (failed create + server-side
    // link) belongs to this thread too — without deleting it the cleared
    // exchange returns on reload.
    const orphanId = orphanConversationRef.current;
    resetTranscriptForNewThread({
      setMessages,
      setHasMoreOlder,
      setIsReady,
      loadedCountRef,
      lifecycleRef,
      setCurrentConversation,
      orphanConversationRef,
      conversationEnsureRef,
    });
    if (user && previous) {
      // Spec 049: clearing removes the CURRENT conversation — the ownership
      // FK cascade takes its messages with it. The next exchange starts a
      // fresh conversation (created on that send). Guests keep the
      // localStorage removal; deletion stays exclusive to this action.
      await deleteConversationRow(supabase, user.id, previous);
    } else if (!user) {
      localStorage.removeItem(storageKey);
    }
    if (user && orphanId && orphanId !== previous) {
      await deleteConversationRow(supabase, user.id, orphanId);
    }
    if (user && pendingCreation) {
      cleanupPendingConversation(supabase, user.id, pendingCreation);
    }
  }, [user, storageKey, setCurrentConversation]);

  const switchConversation = useCallback(async (id: string) => {
    if (!user?.id) return;
    await switchToConversation(supabase, user.id, id, {
      setMessages,
      setHasMoreOlder,
      setIsReady,
      loadedCountRef,
      lifecycleRef,
      setCurrentConversation,
      orphanConversationRef,
      conversationEnsureRef,
    });
  }, [user?.id, setCurrentConversation]);

  // Spec 049: remove a conversation server-side (ownership FK cascade takes
  // its messages) and, when it is the one on screen, reset the transcript.
  const deleteConversation = useCallback(async (id: string) => {
    if (!user?.id) return;
    if (conversationIdRef.current === id) {
      // Same transition discipline as clearChat: pending loads must not
      // repopulate the transcript of a deleted conversation.
      resetTranscriptForNewThread({
        setMessages,
        setHasMoreOlder,
        setIsReady,
        loadedCountRef,
        lifecycleRef,
        setCurrentConversation,
        orphanConversationRef,
        conversationEnsureRef,
      });
    }
    await deleteConversationById(supabase, user.id, id);
  }, [user?.id, setCurrentConversation]);

  // Spec 051: start a fresh transcript WITHOUT destroying the current
  // conversation — clearChat minus the deletes; zero writes.
  const startNewConversation = useCallback(() => {
    resetTranscriptForNewThread({
      setMessages,
      setHasMoreOlder,
      setIsReady,
      loadedCountRef,
      lifecycleRef,
      setCurrentConversation,
      orphanConversationRef,
      conversationEnsureRef,
    });
  }, [setCurrentConversation]);

  const setMode = useCallback((next: AiAssistantMode | ((prev: AiAssistantMode) => AiAssistantMode)) => {
    setModeState((prev) => {
      const actualNext = typeof next === "function" ? next(prev) : next;
      persistLastMode(actualNext);
      return actualNext;
    });
  }, []);

  return {
    messages,
    // Spec 036 Track A: render-synced mirror — consumers with messages-shaped
    // callback deps (retry) read this so their identity holds while streaming.
    messagesRef,
    isLoading,
    isReady, // Changed from isInitialLoading
    sendMessage,
    clearChat,
    setMessages,
    isPuterSignedIn,
    mode,
    setMode,
    studentSelectedSubject,
    setStudentSelectedSubject,
    // Spec 011: lazy history sync
    loadOlder,
    hasMoreOlder,
    loadingOlder,
    // Spec 049: conversation identity + switch/delete (side menu consumes
    // these in the spec-049 follow-up; no UI ships in 049 itself)
    conversationId,
    switchConversation,
    deleteConversation,
    // Spec 051: fresh transcript for the side menu's new-chat action
    startNewConversation,
  };
}
