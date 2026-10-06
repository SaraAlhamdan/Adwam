import { describe, expect, it } from 'vitest';
import { buildPlanSnapshot, requiredQuotaForTarget } from './planEngine';

describe('Adwam plan feasibility engine', () => {
  const from = new Date('2026-10-05T12:00:00');

  it('does not pretend one page on one day/week can finish in one year', () => {
    const snapshot = buildPlanSnapshot({ totalPages: 604, currentPosition: 1, pagesPerDay: 1, activeDays: [1] }, from);
    expect(snapshot.remainingCalendarDays).toBeGreaterThan(3650);
  });

  it('calculates the required quota for a target date', () => {
    const required = requiredQuotaForTarget(604, [1], '2027-10-05', from);
    expect(required).toBeGreaterThan(11);
    expect(required).toBeLessThan(12.5);
  });

  it('shortens the completion estimate when active days or quota increase', () => {
    const slow = buildPlanSnapshot({ totalPages: 604, currentPosition: 1, pagesPerDay: 1, activeDays: [1] }, from);
    const faster = buildPlanSnapshot({ totalPages: 604, currentPosition: 1, pagesPerDay: 2, activeDays: [1,2,3,4] }, from);
    expect(faster.remainingCalendarDays).toBeLessThan(slow.remainingCalendarDays);
  });
});
