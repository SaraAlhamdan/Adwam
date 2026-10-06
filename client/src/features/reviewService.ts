import { todayKey, type Assessment, type PlanState, type ReviewItem } from "./persistence";
import { adwamDayIndex, nextActiveSessionDate } from "./planEngine";

/**
 * Operational spacing heuristic for the prototype. It is intentionally adaptive
 * and is not presented to users as a fixed scientific rule.
 */
export function calculateReviewSchedule(page: number, ayahs: number[], assessment: Assessment, existing: ReviewItem[]): ReviewItem[] {
  const previous = existing.filter(item => item.page === page && ayahs.includes(item.ayah));
  const maxRepetitions = previous.reduce((max, item) => Math.max(max, item.repetitions || 0), 0);
  const spacingDays = assessment === "strong"
    ? Math.min(21, 8 + maxRepetitions * 4)
    : assessment === "average"
      ? Math.min(10, 3 + maxRepetitions * 2)
      : assessment === "review"
        ? 2
        : 1;
  const priority = assessment === "strong" ? "low" : assessment === "average" ? "medium" : "high";
  const nextReview = todayKey(new Date(Date.now() + spacingDays * 86400000));
  const reason = assessment === "strong"
    ? "مراجعة تثبيت بناءً على آخر تقييم"
    : assessment === "average"
      ? "مراجعة متوسطة لأن آخر تقييم كان عاديًا"
      : assessment === "review"
        ? "مراجعة أقرب لأن هذا الموضع يحتاج تثبيتًا"
        : "عودة قريبة لأن الورد لم يكتمل";
  const items = ayahs.map(ayah => ({
    id: `${page}-${ayah}`,
    page,
    ayah,
    reason,
    priority: priority as ReviewItem["priority"],
    nextReview,
    repetitions: maxRepetitions + 1,
  }));
  return [...existing.filter(item => !items.some(next => next.id === item.id)), ...items];
}

export type RecoveryProposal = { label: string; pages: number; kind: "half" | "review" | "redistribute" | "none"; note: string; redistribution: Record<string, number> };
export function calculateRecoveryPlan(plan: PlanState, kind: RecoveryProposal["kind"]): RecoveryProposal {
  const quota = Math.max(0.25, plan.pagesPerDay);
  if (kind === "none") return { label: "لا توجد مهمة اليوم", pages: 0, kind, note: "يمكن استخدام مهلة الاستمرار إن كانت متاحة، وإلا يُسجل اليوم كمؤجل.", redistribution: {} };
  if (kind === "review") return { label: "مراجعة فقط", pages: 0, kind, note: "استبدال الحفظ الجديد بمراجعة من قائمة المراجعة المحفوظة.", redistribution: {} };
  if (kind === "half") return { label: `${trimQuota(quota / 2)} صفحة مخففة`, pages: quota / 2, kind, note: "خُفّض نصاب اليوم إلى 50% من إعدادك الأصلي، ويعاد حساب موعد الإكمال بعد الإنجاز.", redistribution: {} };

  const remaining = quota;
  const today = new Date();
  const redistribution: Record<string, number> = {};
  const active = plan.activeDays.length ? plan.activeDays : [adwamDayIndex(today)];
  const first = nextActiveSessionDate(new Date(today.getTime() + 86400000), active, 0);
  const second = nextActiveSessionDate(new Date(first.getTime() + 86400000), active, 0);
  const targets = [first, second].filter((d, i, arr) => i === 0 || todayKey(d) !== todayKey(arr[i - 1]));
  targets.forEach(d => { redistribution[todayKey(d)] = remaining / targets.length; });
  return {
    label: "ترحيل ذكي للأيام المختارة",
    pages: 0,
    kind,
    note: targets.length ? "وُزّع الفائض على أيام الحفظ التالية المختارة فقط." : "لا توجد أيام حفظ تالية مختارة؛ اختر يومًا من إعدادات الخطة.",
    redistribution,
  };
}
function trimQuota(value: number) { return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2))); }
