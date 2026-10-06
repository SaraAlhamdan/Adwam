import { todayKey, type PlanState } from './persistence';

export type PlanSnapshot = {
  remainingPages: number;
  pagesPerSession: number;
  sessionsNeeded: number;
  activeDaysPerWeek: number;
  estimatedCompletionDate: string;
  remainingCalendarDays: number;
  targetDate?: string;
  requiredPagesPerSession?: number;
  targetFeasible?: boolean;
  targetGapPagesPerSession?: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Adwam day index: Saturday=0, Sunday=1, ... Friday=6.
 */
export function adwamDayIndex(date: Date) {
  return (date.getDay() + 1) % 7;
}

export function nextActiveSessionDate(from: Date, activeDays: number[], sessionOffset: number) {
  const selected = new Set(activeDays.length ? activeDays : [adwamDayIndex(from)]);
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12, 0, 0, 0);
  let found = -1;
  for (let safety = 0; safety < 5000; safety += 1) {
    if (selected.has(adwamDayIndex(d))) {
      found += 1;
      if (found >= sessionOffset) return new Date(d);
    }
    d.setDate(d.getDate() + 1);
  }
  return new Date(from);
}

export function countActiveSessionsUntil(targetDate: string, activeDays: number[], from = new Date()) {
  const target = new Date(`${targetDate}T23:59:59`);
  if (Number.isNaN(target.getTime()) || target.getTime() < from.getTime()) return 0;
  const selected = new Set(activeDays);
  if (!selected.size) return 0;
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12, 0, 0, 0);
  let count = 0;
  while (d <= target) {
    if (selected.has(adwamDayIndex(d))) count += 1;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

export function requiredQuotaForTarget(remainingPages: number, activeDays: number[], targetDate: string, from = new Date()) {
  const sessions = countActiveSessionsUntil(targetDate, activeDays, from);
  if (!sessions) return Infinity;
  return Math.max(0.25, remainingPages / sessions);
}

export function roundQuotaForPlan(value: number) {
  if (!Number.isFinite(value)) return value;
  return Math.max(0.25, Math.ceil(value * 4) / 4);
}

export function buildPlanSnapshot(input: Pick<PlanState, 'totalPages' | 'currentPosition' | 'pagesPerDay' | 'activeDays' | 'targetDate'>, from = new Date()): PlanSnapshot {
  const totalPages = clamp(input.totalPages || 604, 1, 604);
  const currentPosition = clamp(input.currentPosition || 1, 1, totalPages + 1);
  const remainingPages = Math.max(0, totalPages - currentPosition + (currentPosition <= totalPages ? 1 : 0));
  const pagesPerSession = Math.max(0.25, input.pagesPerDay || 1);
  const activeDays = input.activeDays?.length ? input.activeDays : [adwamDayIndex(from)];
  const sessionsNeeded = remainingPages === 0 ? 0 : Math.ceil(remainingPages / pagesPerSession);
  const completion = sessionsNeeded === 0 ? from : nextActiveSessionDate(from, activeDays, Math.max(0, sessionsNeeded - 1));
  const startMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const completionMidnight = new Date(completion.getFullYear(), completion.getMonth(), completion.getDate());
  const remainingCalendarDays = Math.max(0, Math.ceil((completionMidnight.getTime() - startMidnight.getTime()) / 86400000));

  let requiredPagesPerSession: number | undefined;
  let targetFeasible: boolean | undefined;
  let targetGapPagesPerSession: number | undefined;
  if (input.targetDate) {
    requiredPagesPerSession = requiredQuotaForTarget(remainingPages, activeDays, input.targetDate, from);
    targetFeasible = Number.isFinite(requiredPagesPerSession) && pagesPerSession + 1e-9 >= requiredPagesPerSession;
    targetGapPagesPerSession = Number.isFinite(requiredPagesPerSession) ? Math.max(0, requiredPagesPerSession - pagesPerSession) : undefined;
  }

  return {
    remainingPages,
    pagesPerSession,
    sessionsNeeded,
    activeDaysPerWeek: activeDays.length,
    estimatedCompletionDate: todayKey(completion),
    remainingCalendarDays,
    targetDate: input.targetDate,
    requiredPagesPerSession,
    targetFeasible,
    targetGapPagesPerSession,
  };
}

export function buildProspectiveSnapshot(params: {
  startPage: number;
  totalPages?: number;
  pagesPerDay: number;
  activeDays: number[];
  targetDate?: string;
}, from = new Date()) {
  const totalPages = params.totalPages || 604;
  return buildPlanSnapshot({
    totalPages,
    currentPosition: params.startPage,
    pagesPerDay: params.pagesPerDay,
    activeDays: params.activeDays,
    targetDate: params.targetDate,
  }, from);
}
