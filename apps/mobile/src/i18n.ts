/**
 * Mobile i18n - locale resolution + translation lookup.
 *
 * Per spec FR-008 and the edge case "a mobile user has both Arabic and
 * English system languages configured: the app follows the device
 * primary language, with an in-app override":
 *
 *   1. An in-app override persisted in AsyncStorage wins.
 *   2. Otherwise expo-localization's device primary language is used
 *      ("ar" | "en"), defaulting to "ar" to match the web app's
 *      defaultLocale.
 *
 * Messages come from the shared package (spec FR-013 / US3): the JSON
 * namespaces under masarx-shared/messages/{ar,en}/ are THE source of
 * truth - this file adds no strings of its own beyond the tiny
 * MOBILE_STRINGS supplement for mobile-only UI (tab bar labels, offline
 * banner), pending promotion into the shared registry.
 *
 * Shared namespaces delegate to masarx-shared/i18n (t()/hasKey()) since
 * T-012: the JSON imports and the local per-locale REGISTRY this file
 * used to maintain are gone; only the MOBILE_STRINGS supplement for
 * mobile-only UI (tab bar labels, offline banner) remains local, pending
 * promotion into the shared registry.
 */
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { hasKey, t, type I18nNamespace } from "masarx-shared/i18n";

export type Locale = "ar" | "en";
export type Dir = "rtl" | "ltr";
export type MessageValues = Record<string, string | number>;

const LOCALE_OVERRIDE_KEY = "masarx_locale_override";

/**
 * Mobile-only strings (tab bar, offline banner, upload toasts). These
 * have no shared-namespace counterpart yet; they are kept here so the
 * shared JSON remains web-owned. Promote into
 * packages/shared/src/messages/{ar,en}/mobileApp.json when the web team
 * picks them up (contract: "Rules for adding a new key").
 */
const MOBILE_STRINGS: Record<Locale, Record<string, string>> = {
  ar: {
    "tabs.subjects": "المواد",
    "tabs.summaries": "الملخصات",
    "tabs.quizzes": "الاختبارات",
    "tabs.news": "الأخبار",
    "tabs.ai": "المساعد الذكي",
    "tabs.schedules": "الجداول",
    "tabs.profile": "حسابي",
    "offline.banner": "غير متصل - يتم عرض نسخة محفوظة",
    "offline.aiQueued": "غير متصل. سيتم إرسال الرسالة عند عودة الاتصال.",
    "offline.retryWhenOnline": "تعذر الاتصال. تحقق من الشبكة وحاول مجدداً.",
    "upload.pickPdf": "رفع ملف PDF",
    "upload.picking": "جارٍ فتح المنتقي...",
    "upload.reading": "جارٍ قراءة الملف...",
    "upload.uploading": "جارٍ رفع الملف...",
    "upload.finalizing": "جارٍ إنشاء الرابط...",
    "upload.done": "تم رفع الملف بنجاح",
    "upload.tooLarge": "الملف أكبر من الحد المسموح (50 ميغابايت)",
    "upload.notPdf": "يرجى اختيار ملف PDF فقط",
    "upload.failed": "فشل رفع الملف",
    "upload.needAuth": "سجّل الدخول قبل رفع الملفات",
    "profile.signOut": "تسجيل الخروج",
    "profile.signOutConfirmTitle": "تسجيل الخروج",
    "profile.signOutConfirmMessage": "هل تريد تسجيل الخروج من هذا الجهاز؟",
    "profile.language": "اللغة",
    "profile.languageArabic": "العربية",
    "profile.languageEnglish": "English",
    "profile.languageHint": "قد يتطلب تغيير الاتجاه إعادة تشغيل التطبيق.",
    "profile.restartRequiredTitle": "إعادة التشغيل مطلوبة",
    "profile.restartRequiredMessage":
      "تغيير اتجاه الواجهة (من اليمين لليسار/من اليسار لليمين) يتطلب إعادة تشغيل التطبيق.",
    "profile.appVersion": "إصدار التطبيق",
    "profile.anonymousUser": "مستخدم",
    "profile.theme": "المظهر",
    "profile.theme.system": "حسب النظام",
    "profile.theme.light": "فاتح",
    "profile.theme.dark": "داكن",
    "profile.academic": "المسار الأكاديمي",
    "profile.level": "المستوى",
    "profile.department": "القسم",
    "profile.semester": "الفصل الدراسي",
    "profile.noDepartment": "بدون قسم",
    "profile.pickLevelFirst": "اختر المستوى أولاً",
    "profile.saveAcademic": "حفظ المسار الأكاديمي",
    "profile.academicSaved": "تم حفظ المسار الأكاديمي",
    "profile.academicSaveFailed": "تعذر الحفظ. تحقق من الاتصال وحاول مجدداً.",
    "profile.academicLoadFailed": "تعذر تحميل الخيارات. تحقق من الاتصال وحاول مجدداً.",
    "login.invalidCredentials": "البريد الإلكتروني أو كلمة المرور غير صحيحة",
    "login.networkError": "تعذر الاتصال بـ Masar X. تحقق من الشبكة وحاول مجدداً.",
    "login.googleDeferred": "تسجيل الدخول عبر Google قادم في تحديث قادم.",
    "quiz.guestMode": "وضع الزائر",
    "quiz.savingOffline": "سيتم حفظ النتيجة محلياً على هذا الجهاز فقط.",
    "subjectDetail.lectures": "المحاضرات",
    "subjectDetail.videos": "الفيديوهات",
    "subjectDetail.files": "الملفات",
    "subjectDetail.exams": "الامتحانات",
    "subjectDetail.unclassified": "محتوى غير مصنّف",
    "subjectDetail.professor": "أستاذ المادة",
    "subjectDetail.schedule": "الموعد",
    "subjectDetail.location": "المكان",
    "subjectDetail.noLectures": "لا توجد محاضرات بعد",
    "subjectDetail.emptyGroup": "لا يوجد محتوى في هذا القسم بعد",
    "subjectDetail.open": "فتح",
    "subjectDetail.startQuiz": "ابدأ الاختبار",
    "summaryDetail.subject": "المادة",
    "summaryDetail.year": "السنة",
    "summaryDetail.department": "القسم",
    "summaryDetail.contributor": "المساهم",
    "summaryDetail.pdf": "فتح ملف PDF",
    "summaryDetail.youtube": "مشاهدة على يوتيوب",
    "summaryDetail.commentPlaceholder": "شاركنا رأيك (اختياري)",
    "summaryDetail.submitting": "جارٍ النشر...",
    "summaryDetail.notFound": "الملخص غير موجود",
    "summaryDetail.postFailed": "تعذر إرسال التقييم. تحقق من الاتصال وحاول مجدداً.",
    "summaryDetail.deleteFailed": "تعذر حذف التقييم. تحقق من الاتصال وحاول مجدداً.",
    "summaryDetail.loginRequiredTitle": "تسجيل الدخول مطلوب",
    "summaryDetail.loginRequired": "يجب عليك تسجيل الدخول لإضافة تقييم.",
    "common.retry": "إعادة المحاولة",
    "common.offline": "غير متصل",
    "common.cancel": "إلغاء",
  },
  en: {
    "tabs.subjects": "Subjects",
    "tabs.summaries": "Summaries",
    "tabs.quizzes": "Quizzes",
    "tabs.news": "News",
    "tabs.ai": "AI Tutor",
    "tabs.schedules": "Schedules",
    "tabs.profile": "Profile",
    "offline.banner": "Offline - showing saved version",
    "offline.aiQueued": "Offline. Your message will be sent when back online.",
    "offline.retryWhenOnline": "Could not reach Masar X. Check your connection and retry.",
    "upload.pickPdf": "Upload PDF",
    "upload.picking": "Opening picker...",
    "upload.reading": "Reading file...",
    "upload.uploading": "Uploading...",
    "upload.finalizing": "Creating link...",
    "upload.done": "File uploaded successfully",
    "upload.tooLarge": "File exceeds the 50MB limit",
    "upload.notPdf": "Please pick a PDF file",
    "upload.failed": "Upload failed",
    "upload.needAuth": "Sign in before uploading files",
    "profile.signOut": "Sign out",
    "profile.signOutConfirmTitle": "Sign out",
    "profile.signOutConfirmMessage": "Sign out of Masar X on this device?",
    "profile.language": "Language",
    "profile.languageArabic": "العربية",
    "profile.languageEnglish": "English",
    "profile.languageHint": "Direction changes may require restarting the app.",
    "profile.restartRequiredTitle": "Restart required",
    "profile.restartRequiredMessage":
      "Changing the layout direction (RTL/LTR) requires restarting the app.",
    "profile.appVersion": "App version",
    "profile.anonymousUser": "User",
    "profile.theme": "Theme",
    "profile.theme.system": "System",
    "profile.theme.light": "Light",
    "profile.theme.dark": "Dark",
    "profile.academic": "Academic path",
    "profile.level": "Level",
    "profile.department": "Department",
    "profile.semester": "Semester",
    "profile.noDepartment": "No department",
    "profile.pickLevelFirst": "Pick a level first",
    "profile.saveAcademic": "Save academic path",
    "profile.academicSaved": "Academic path saved",
    "profile.academicSaveFailed": "Could not save. Check your connection and retry.",
    "profile.academicLoadFailed": "Could not load the options. Check your connection and retry.",
    "login.invalidCredentials": "Incorrect email or password",
    "login.networkError": "Could not reach Masar X. Check your connection and retry.",
    "login.googleDeferred": "Google sign-in is coming in a future update.",
    "quiz.guestMode": "Guest mode",
    "quiz.savingOffline": "Your result will be saved on this device only.",
    "subjectDetail.lectures": "Lectures",
    "subjectDetail.videos": "Videos",
    "subjectDetail.files": "Files",
    "subjectDetail.exams": "Exams",
    "subjectDetail.unclassified": "Unclassified content",
    "subjectDetail.professor": "Professor",
    "subjectDetail.schedule": "Schedule",
    "subjectDetail.location": "Location",
    "subjectDetail.noLectures": "No lectures yet",
    "subjectDetail.emptyGroup": "Nothing here yet",
    "subjectDetail.open": "Open",
    "subjectDetail.startQuiz": "Start quiz",
    "summaryDetail.subject": "Subject",
    "summaryDetail.year": "Year",
    "summaryDetail.department": "Department",
    "summaryDetail.contributor": "Contributor",
    "summaryDetail.pdf": "Open PDF",
    "summaryDetail.youtube": "Watch on YouTube",
    "summaryDetail.commentPlaceholder": "Share your thoughts (optional)",
    "summaryDetail.submitting": "Posting...",
    "summaryDetail.notFound": "Summary not found",
    "summaryDetail.postFailed": "Could not post the review. Check your connection and retry.",
    "summaryDetail.deleteFailed": "Could not delete the review. Check your connection and retry.",
    "summaryDetail.loginRequiredTitle": "Sign in required",
    "summaryDetail.loginRequired": "You need to sign in to add a review.",
    "common.retry": "Retry",
    "common.offline": "Offline",
    "common.cancel": "Cancel",
  },
};

/** Device primary language, normalized to the locales the product ships. */
function getDeviceLocale(): Locale {
  const locales = Localization.getLocales?.() ?? [];
  const languageCode = locales[0]?.languageCode;
  return languageCode === "en" ? "en" : "ar";
}

async function getLocaleOverride(): Promise<Locale | null> {
  try {
    const stored = await AsyncStorage.getItem(LOCALE_OVERRIDE_KEY);
    return stored === "ar" || stored === "en" ? stored : null;
  } catch {
    return null;
  }
}

export async function setLocaleOverride(locale: Locale | null): Promise<void> {
  try {
    if (locale) {
      await AsyncStorage.setItem(LOCALE_OVERRIDE_KEY, locale);
    } else {
      await AsyncStorage.removeItem(LOCALE_OVERRIDE_KEY);
    }
  } catch {
    // Best-effort persistence; the UI stays on the previous locale.
  }
}

/** Override wins over the device language (spec edge case, default "ar"). */
export async function resolveLocale(): Promise<Locale> {
  return (await getLocaleOverride()) ?? getDeviceLocale();
}

export function isRTL(locale: Locale): boolean {
  return locale === "ar";
}

export function dir(locale: Locale): Dir {
  return isRTL(locale) ? "rtl" : "ltr";
}

function lookup(tree: unknown, path: string): unknown {
  let current: unknown = tree;
  for (const segment of path.split(".")) {
    if (current && typeof current === "object" && segment in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function interpolate(template: string, values?: MessageValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/**
 * Shared-contract translation lookup: t(locale, namespace, key, values?).
 *
 * Resolution order:
 *   1. shared namespace registry (masarx-shared/i18n — hasKey probes the
 *      requested locale's table only, so the en fallback inside t() never
 *      shadows the mobile supplement);
 *   2. mobile-only supplement (MOBILE_STRINGS)
 *   3. opposite-locale rescue (shared registry, then MOBILE_STRINGS)
 *   4. the key string itself - the contract's documented fallback for a
 *      key missing from the shared files ("fall back to the key string
 *      itself ... and log a warning in dev mode").
 */
export function translateMessage(
  locale: Locale,
  namespace: string,
  key: string,
  values?: MessageValues,
): string {
  // The "mobile" namespace lives in the FLAT MOBILE_STRINGS supplement
  // ("tabs.subjects" is a single key, not a path). A dot-splitting
  // lookup of "mobile.tabs.subjects" searches tree["mobile"], which
  // exists nowhere, and every mobile label degrades to its raw key
  // (broken bottom-tab labels). So resolve "mobile" keys directly.
  if (namespace === "mobile") {
    const own = MOBILE_STRINGS[locale][key];
    if (typeof own === "string") {
      return interpolate(own, values);
    }
    const other: Locale = locale === "ar" ? "en" : "ar";
    const rescue = MOBILE_STRINGS[other][key];
    if (typeof rescue === "string") {
      if (__DEV__) {
        console.warn(`[i18n] missing message: ${locale}/mobile.${key} (rescued from ${other})`);
      }
      return interpolate(rescue, values);
    }
    if (__DEV__) {
      console.warn(`[i18n] missing message: ${locale}/mobile.${key}`);
    }
    return key;
  }
  const path = `${namespace}.${key}`;
  const ns = namespace as I18nNamespace;
  // Shared registry first: hasKey probes THIS locale's table only (no en
  // fallback), so the mobile supplement below keeps its historical
  // priority; t() then resolves + interpolates the same JSON the local
  // REGISTRY used to duplicate (T-012).
  if (hasKey(locale, ns, key)) {
    return t(locale, ns, key, values);
  }
  const fromMobile = lookup(MOBILE_STRINGS[locale], path);
  if (typeof fromMobile === "string") {
    return interpolate(fromMobile, values);
  }
  if (__DEV__) {
    console.warn(`[i18n] missing message: ${locale}/${path}`);
  }
  // Opposite-locale rescue before falling back to the raw key, so a
  // late-added key degrades gracefully instead of showing an identifier.
  const other: Locale = locale === "ar" ? "en" : "ar";
  if (hasKey(other, ns, key)) {
    return t(other, ns, key, values);
  }
  const rescue = lookup(MOBILE_STRINGS[other], path);
  if (typeof rescue === "string") {
    return interpolate(rescue, values);
  }
  return key;
}
