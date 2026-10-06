export type UserRole = "student" | "teacher";
export type ViewId = "home" | "calendar" | "review" | "mastery" | "assistant" | "teacher";
export function getRoleNavigation(role: UserRole, language: "ar" | "en" = "ar"): Array<{ id: ViewId; label: string }> {
  const t = (ar: string, en: string) => language === "en" ? en : ar;
  if (role === "teacher") return [{ id: "home", label: t("لوحة المتابعة", "Progress dashboard") }, { id: "mastery", label: t("تقدم المتعلمين", "Learner progress") }];
  return [{ id: "home", label: t("الرئيسية", "Home") }, { id: "calendar", label: t("التقويم", "Calendar") }, { id: "review", label: t("المراجعة والإتقان", "Review & mastery") }, { id: "mastery", label: t("خريطة الإتقان", "Mastery map") }, { id: "assistant", label: t("مساعد أدوم", "Adwam Assistant") }];
}
export function isTeacherView(role: UserRole, view: ViewId) { return role === "teacher" && view === "teacher"; }
