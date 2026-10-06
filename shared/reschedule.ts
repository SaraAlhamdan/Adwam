export type RescheduleInput = {
  remainingPages: number;
  pagesPerDay: number;
  missedDays: number;
};

export type RescheduleResult = {
  dailyPages: number;
  remainingDays: number;
  extensionDays: number;
  message: string;
};

/**
 * Keep the daily portion stable after a missed day. The plan grows instead
 * of piling the missed pages onto tomorrow's portion.
 */
export function rescheduleAfterMiss({ remainingPages, pagesPerDay, missedDays }: RescheduleInput): RescheduleResult {
  const safePages = Math.max(0, Math.ceil(remainingPages));
  const safeDaily = Math.max(1, Math.ceil(pagesPerDay));
  const safeMissedDays = Math.max(0, Math.floor(missedDays));
  const remainingDays = Math.ceil(safePages / safeDaily);
  return {
    dailyPages: safeDaily,
    remainingDays: remainingDays + safeMissedDays,
    extensionDays: safeMissedDays,
    message: safeMissedDays > 0
      ? `تم تمديد الخطة ${safeMissedDays} يومًا مع بقاء الورد اليومي ثابتًا.`
      : "الخطة على وتيرتها المعتادة.",
  };
}
