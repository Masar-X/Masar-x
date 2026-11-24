/**
 * Quiz player (spec US2 / US4): loads quiz + questions via
 * src/lib/quiz.ts (same Supabase tables as the web app), records each
 * answer, and on finish:
 *
 *   - signed in  -> startAttempt + saveAnswer + finishAttempt rows in
 *     quiz_attempts / quiz_answers (cross-device parity with web),
 *   - guest      -> result kept on-device only via saveGuestResult.
 *
 * Spec 019 C6: timed quizzes render a countdown derived from an
 * absolute endTime (wall-clock accurate across backgrounding) with an
 * AppState foreground re-check and a finishingRef single-finish guard
 * (owner note #2); finish writes time_taken_seconds + the answers
 * jsonb (web parity) and guest results carry title/time/answers so
 * they stay reviewable offline.
 *
 * Ends on a score screen with the save outcome (server vs on-device).
 */
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import type { RootStackParamList } from "../../app/App";
import MathText from "../components/MathText";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { useTheme } from "../context/ThemeContext";
import type { Palette } from "../lib/theme";
import {
  completeQuizAttempt,
  fetchQuizWithQuestions,
  type AttemptAnswerPayload,
} from "../lib/quiz";
import {
  computeRemainingSeconds,
  computeTimeTakenSeconds,
  isTimeExpired,
  splitTime,
} from "../lib/quiz-timer";
import { getSupabaseClient } from "../lib/supabase";
import type { PlayerQuestion } from "../types/quiz";

interface LoadedQuiz {
  title: string;
  description: string | null;
  durationSeconds: number | null;
  questions: PlayerQuestion[];
}

type Phase = "loading" | "error" | "playing" | "finished";

interface FinishResult {
  score: number;
  total: number;
  savedToServer: boolean;
  isGuest: boolean;
  gradedAnswers?: AttemptAnswerPayload[];
}

export default function QuizPlayScreen() {
  const route = useRoute();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const params = (route.params ?? {}) as { quizId?: string; title?: string };
  const quizId = params.quizId ?? "";

  const { user } = useAuth();
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<LoadedQuiz | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // getSupabaseClient() throws only when the app was built without the
  // env vars; the auth gate keeps this screen behind a configured app.
  const supabaseRef = useRef<ReturnType<typeof getSupabaseClient> | null>(null);
  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) supabaseRef.current = getSupabaseClient();
    return supabaseRef.current;
  }, []);

  // Spec 019 C6 (owner note #2): countdown state kept in refs + one
  // state slot. Remaining time is always DERIVED from the absolute
  // endTimeRef (wall-clock), so backgrounded intervals that never fire
  // still resolve correctly on the next tick or AppState foreground
  // re-check — exactly once, thanks to finishingRef.
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number | null>(null);
  const endTimeRef = useRef<number | null>(null);
  const attemptStartRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setLoadError(null);
    (async () => {
      try {
        const loaded = await fetchQuizWithQuestions(getSupabase(), quizId);
        if (cancelled) return;
        setQuiz(loaded);
        setAnswers(new Array(loaded.questions.length).fill(null));
        setIndex(0);
        setPhase("playing");
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId, getSupabase, reloadToken]);

  const total = quiz?.questions.length ?? 0;
  const question = quiz?.questions[index] ?? null;
  const selected = answers[index] ?? null;

  const choose = (optionIndex: number) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = optionIndex;
      return next;
    });
  };

  const goPrev = () => {
    if (index > 0) setIndex(index - 1);
  };

  const goNext = () => {
    if (index < total - 1) setIndex(index + 1);
  };

  const finish = async () => {
    if (!quiz || submitting || finishingRef.current) return;
    finishingRef.current = true;
    const questions = quiz.questions;
    const timeTakenSeconds = computeTimeTakenSeconds(
      attemptStartRef.current ?? Date.now(),
      Date.now(),
    );
    setSubmitting(true);
    let nextResult: FinishResult = {
      score: 0,
      total: questions.length,
      savedToServer: false,
      isGuest: !user,
    };
    try {
      nextResult = await completeQuizAttempt({
        supabase: getSupabase(),
        quizId,
        quizTitle: quiz.title,
        userId: user?.id,
        questions,
        answers,
        timeTakenSeconds,
      });
    } catch {
      nextResult = {
        score: 0,
        total: questions.length,
        savedToServer: false,
        isGuest: !user,
      };
    } finally {
      setResult(nextResult);
      setSubmitting(false);
      setPhase("finished");
    }
  };

  // The auto-finish path fires from timer ticks / AppState, which hold
  // a stale closure — route them through a ref to the latest finish.
  const finishRef = useRef<() => void>(() => {});
  finishRef.current = () => {
    void finish();
  };

  const evaluateRemaining = useCallback(() => {
    if (endTimeRef.current == null) return;
    const now = Date.now();
    setTimeLeftSeconds(computeRemainingSeconds(endTimeRef.current, now));
    if (isTimeExpired(endTimeRef.current, now)) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (!finishingRef.current) finishRef.current();
    }
  }, []);

  // Start the countdown when the quiz enters "playing"; the interval is
  // cleared on finish (evaluateRemaining) and on unmount/phase change
  // (this effect's cleanup), and the AppState listener re-checks the
  // deadline the moment the app is foregrounded.
  useEffect(() => {
    if (phase !== "playing" || !quiz || !quiz.durationSeconds || quiz.durationSeconds <= 0) {
      return;
    }
    attemptStartRef.current = Date.now();
    endTimeRef.current = Date.now() + quiz.durationSeconds * 1000;
    setTimeLeftSeconds(quiz.durationSeconds);
    intervalRef.current = setInterval(evaluateRemaining, 1000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") evaluateRemaining();
    });
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      subscription.remove();
    };
  }, [phase, quiz, evaluateRemaining]);

  if (phase === "loading") {
    return (
      <SafeAreaView style={[styles.screen, styles.center]} edges={["top", "left", "right"]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.preparing}>{t("quizzes", "preparing")}</Text>
      </SafeAreaView>
    );
  }

  if (phase === "error" || !quiz) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]} edges={["top", "left", "right"]}>
        <Text style={styles.errorText}>{loadError ?? t("quizzes", "failed")}</Text>
        <Pressable style={styles.button} onPress={() => setReloadToken((n) => n + 1)}>
          <Text style={styles.buttonText}>{t("quizzes", "retry")}</Text>
        </Pressable>
        <Pressable style={styles.linkButton} onPress={() => navigation.goBack()}>
          <Text style={styles.linkText}>{t("quizzes", "backToHome")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (phase === "finished" && result) {
    const pct = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;
    const praiseKey = pct >= 90 ? "amazing" : pct >= 70 ? "excellent" : "goodJob";
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right", "bottom"]}>
        <ScrollView contentContainerStyle={[styles.center, { flexGrow: 1, padding: 24 }]}>
          <Text style={styles.doneTitle}>{t("quizzes", "completed")}</Text>
          <Text style={styles.scoreText}>
            {result.score} / {result.total}
          </Text>
          <Text style={styles.praise}>{t("quizzes", praiseKey)}</Text>
          {result.isGuest ? null : (
            <Text
              style={[
                styles.saveNote,
                result.savedToServer ? styles.saveOk : styles.saveOffline,
              ]}
            >
              {result.savedToServer ? t("quizzes", "saved") : t("mobile", "quiz.savingOffline")}
            </Text>
          )}
          {result.gradedAnswers && result.gradedAnswers.length > 0 ? (
            <View style={styles.gradedSection}>
              <Text style={styles.gradedHeading}>{t("quizzes", "answersReview")}</Text>
              <View style={styles.gradedPills}>
                {result.gradedAnswers.map((a, i) => (
                  <View
                    key={a.question_id}
                    style={[
                      styles.gradedPill,
                      a.is_correct ? styles.gradedPillCorrect : styles.gradedPillWrong,
                    ]}
                  >
                    <Text
                      style={[
                        styles.gradedPillText,
                        a.is_correct ? styles.gradedPillTextCorrect : styles.gradedPillTextWrong,
                      ]}
                    >
                      {i + 1}. {a.is_correct ? "✓" : "✗"}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          {result.isGuest ? (
            <View style={styles.guestBanner}>
              <Text style={styles.guestBannerTitle}>{t("quizzes", "guestMode")}</Text>
              <Text style={styles.guestBannerBody}>{t("quizzes", "guestNotice")}</Text>
            </View>
          ) : null}
          <Pressable style={styles.button} onPress={() => navigation.goBack()}>
            <Text style={styles.buttonText}>{t("quizzes", "backToHome")}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const isLast = index === total - 1;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right", "bottom"]}>
      <View style={[styles.header, { paddingTop: 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.backText}>{locale === "ar" ? ">" : "<"}</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {quiz.title || params.title || "Masar X"}
        </Text>
        {user ? null : (
          <View style={styles.guestChip}>
            <Text style={styles.guestChipText}>{t("mobile", "quiz.guestMode")}</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.progressRow}>
          <Text style={styles.progressRowText}>
            {index + 1} / {total}
          </Text>
          {timeLeftSeconds != null ? (
            <View
              style={[styles.timerChip, timeLeftSeconds <= 30 && styles.timerChipDanger]}
            >
              <Text
                style={[
                  styles.timerChipText,
                  timeLeftSeconds <= 30 && styles.timerChipTextDanger,
                ]}
              >
                {(() => {
                  const { minutes, seconds } = splitTime(timeLeftSeconds);
                  return `${minutes}${t("quizAttempts", "minutesShort")} ${seconds}${t("quizAttempts", "secondsShort")}`;
                })()}
              </Text>
            </View>
          ) : null}
        </View>
        {question ? (
          <>
            <View style={styles.questionCard}>
              <Text style={styles.questionIndex}>
                {t("quizzes", "question")} {index + 1}
              </Text>
              <MathText text={question.question} rtl={locale === "ar"} />
            </View>

            {question.options.map((option, optionIndex) => {
              const active = selected === optionIndex;
              return (
                <Pressable
                  key={`${question.id}:${optionIndex}`}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => choose(optionIndex)}
                >
                  <View style={[styles.optionDot, active && styles.optionDotActive]} />
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>
                    {option}
                  </Text>
                </Pressable>
              );
            })}

            {/* Mid-quiz explanation removed (spec 040): explanations typically
                restate the answer, which must not be revealed before the
                server's post-finish grading. */}
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.footerButton, index === 0 && styles.footerButtonDisabled]}
          onPress={goPrev}
          disabled={index === 0}
        >
          <Text style={styles.footerButtonText}>{t("quizzes", "previous")}</Text>
        </Pressable>
        {isLast ? (
          <Pressable
            style={[styles.footerButton, styles.footerButtonPrimary, submitting && styles.footerButtonDisabled]}
            onPress={() => void finish()}
            disabled={submitting || selected === null}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Text style={[styles.footerButtonText, styles.footerButtonTextPrimary]}>
                {t("quizzes", "confirmAnswer")}
              </Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={[styles.footerButton, styles.footerButtonPrimary]}
            onPress={goNext}
            disabled={selected === null}
          >
            <Text style={[styles.footerButtonText, styles.footerButtonTextPrimary]}>
              {t("quizzes", "nextQuestion")}
            </Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  preparing: { color: colors.subtle, marginTop: 12 },
  errorText: { color: colors.danger, textAlign: "center", marginBottom: 16, paddingHorizontal: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  backText: { fontSize: 22, fontWeight: "700", color: colors.ink, paddingHorizontal: 8 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.ink, paddingHorizontal: 8 },
  guestChip: {
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  guestChipText: { color: "#92400E", fontSize: 11, fontWeight: "700" },
  list: { padding: 16, paddingBottom: 24 },
  progress: { color: colors.subtle, fontWeight: "600", marginBottom: 10 },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  progressRowText: { color: colors.subtle, fontWeight: "600" },
  timerChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  timerChipDanger: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  timerChipText: { color: colors.ink, fontWeight: "700", fontSize: 13 },
  timerChipTextDanger: { color: colors.danger },
  questionCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  questionIndex: { color: colors.subtle, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
  },
  optionActive: { borderColor: colors.primary, backgroundColor: colors.accentBg },
  optionDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.subtle,
    marginRight: 10,
  },
  optionDotActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  optionText: { flex: 1, color: colors.ink, fontSize: 15 },
  optionTextActive: { fontWeight: "700" },
  explanation: { color: colors.subtle, fontSize: 13, marginTop: 4, lineHeight: 19 },
  footer: {
    flexDirection: "row",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  footerButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: "center",
    marginHorizontal: 4,
  },
  footerButtonPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  footerButtonDisabled: { opacity: 0.5 },
  footerButtonText: { color: colors.ink, fontWeight: "700" },
  footerButtonTextPrimary: { color: colors.onPrimary },
  doneTitle: { fontSize: 22, fontWeight: "800", color: colors.ink, marginBottom: 8 },
  scoreText: { fontSize: 40, fontWeight: "800", color: colors.primary, marginBottom: 8 },
  praise: { color: colors.subtle, marginBottom: 12 },
  saveNote: { fontSize: 13, marginBottom: 20 },
  saveOk: { color: colors.success },
  saveOffline: { color: colors.subtle },
  gradedSection: { width: "100%", marginBottom: 20 },
  gradedHeading: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
  },
  gradedPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  gradedPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  gradedPillCorrect: { backgroundColor: colors.successBg },
  gradedPillWrong: { backgroundColor: colors.dangerBg },
  gradedPillText: { fontSize: 12, fontWeight: "700" },
  gradedPillTextCorrect: { color: colors.success },
  gradedPillTextWrong: { color: colors.danger },
  guestBanner: {
    width: "100%",
    backgroundColor: colors.banner,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 20,
  },
  guestBannerTitle: {
    color: colors.bannerText,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  guestBannerBody: {
    color: colors.bannerText,
    fontSize: 12,
    lineHeight: 18,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginBottom: 8,
  },
  buttonText: { color: colors.onPrimary, fontWeight: "700" },
  linkButton: { paddingVertical: 8 },
  linkText: { color: colors.primary, fontWeight: "600" },
});