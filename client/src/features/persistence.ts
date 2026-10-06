export type Assessment = "strong" | "average" | "review" | "not_memorized";
export type ReviewItem = { id: string; page: number; ayah: number; reason: string; priority: "high" | "medium" | "low"; nextReview: string; repetitions: number };
export type CalendarStatus = "completed" | "partial" | "light" | "vacation" | "recovery" | "increased" | "rescheduled";
export type ActivityKind = "memorization" | "review" | "external";
export type ActivityRecord = {
  id: string; date: string; kind: ActivityKind; pageFrom: number; pageTo: number; ayahFrom?: number; ayahTo?: number; surahNames?: string[];
  plannedPages: number; completedPages: number; assessment?: Assessment; status: "completed" | "partial" | "missed" | "rescheduled";
  source: "inside_app" | "outside_app"; durationMinutes?: number; reason?: string; createdAt: string; originalDate?: string;
};
export type MasterySnapshot = { date: string; page: number; assessment: Assessment; score: 1 | 2 | 3 | 4; sourceActivityId?: string };
export type RecoveryRecord = { date: string; minutes: number | "review" | "none"; approved: boolean; label: string; quota?: number; kind?: "half" | "review" | "redistribute" | "none"; redistribution?: Record<string, number> };
export type GoalMode = "pace" | "target";
export type PlanState = {
  started: boolean; startPage: number; currentPosition: number; pagesPerDay: number; totalPages: number;
  completedPages: number; completedAyahs: number; missedDays: number; streak: number; durationDays: number; goalDate?: string;
  targetDate?: string; goalMode: GoalMode;
  activeDays: number[]; startType: "beginning" | "specific" | "review"; goal: string;
  completedDates: string[]; assessments: Record<string, Assessment>; reviewQueue: ReviewItem[]; recovery: RecoveryRecord[];
  calendarStatuses: Record<string, CalendarStatus>; todayRecoveryPages?: number; lastAction?: "done" | "missed" | "recovery";
  activities: ActivityRecord[]; masteryHistory: MasterySnapshot[];
  graceDaysUsed: number; graceAllowance: number; graceActiveUntil?: string;
  lastMilestone?: { type: "return" | "surah" | "ayah50" | "ayah100" | "streak7" | "streak30"; date: string; surahName?: string };
  lastRecitation?: { match?: number; weakAyahs: number[]; transcript?: string; supportedBy?: string; createdAt: string };
};
export type Session = { name: string; role: "student" | "teacher"; contact: string; groupName?: string; groupId?: string; userId?: string; onboardingCompleted?: boolean };
export type UiPreferences = { language: "ar" | "en"; theme: "sand" | "sage" | "night"; reciterId: "alafasy" | "muaiqly" | "husary" | "minshawy" };
export const EMPTY_PLAN: PlanState = {
  started: false, startPage: 1, currentPosition: 1, pagesPerDay: 1, totalPages: 604,
  completedPages: 0, completedAyahs: 0, missedDays: 0, streak: 0, durationDays: 604,
  goalMode: "pace", activeDays: [], startType: "beginning", goal: "pace",
  completedDates: [], assessments: {}, reviewQueue: [], recovery: [], calendarStatuses: {}, activities: [], masteryHistory: [],
  graceDaysUsed: 0, graceAllowance: 1,
};
export const DEFAULT_UI: UiPreferences = { language: "ar", theme: "sand", reciterId: "alafasy" };
export function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
export function loadPlan(): PlanState {
  try {
    const raw = JSON.parse(localStorage.getItem("adom-plan") || "null") || {};
    return {
      ...EMPTY_PLAN,
      ...raw,
      goalMode: raw.goalMode === "target" ? "target" : "pace",
      activities: raw.activities || [],
      masteryHistory: raw.masteryHistory || [],
      graceDaysUsed: Number.isFinite(raw.graceDaysUsed) ? raw.graceDaysUsed : 0,
      graceAllowance: Number.isFinite(raw.graceAllowance) ? raw.graceAllowance : 1,
    };
  } catch { return EMPTY_PLAN; }
}
export function savePlan(plan: PlanState) { localStorage.setItem("adom-plan", JSON.stringify(plan)); }
export function loadSession(): Session | null { try { return JSON.parse(localStorage.getItem("adom-session") || "null"); } catch { return null; } }
export function saveSession(session: Session) { localStorage.setItem("adom-session", JSON.stringify(session)); }
export function loadUi(): UiPreferences { try { return { ...DEFAULT_UI, ...(JSON.parse(localStorage.getItem("adom-ui") || "null") || {}) }; } catch { return DEFAULT_UI; } }
export function saveUi(ui: UiPreferences) { localStorage.setItem("adom-ui", JSON.stringify(ui)); }
