import { describe, expect, it } from "vitest";
import { rescheduleAfterMiss } from "../shared/reschedule";

describe("rescheduleAfterMiss", () => {
  it("keeps the daily load steady and extends the plan for one missed day", () => {
    const result = rescheduleAfterMiss({ remainingPages: 12, pagesPerDay: 1, missedDays: 1 });
    expect(result.dailyPages).toBe(1);
    expect(result.remainingDays).toBe(13);
    expect(result.extensionDays).toBe(1);
    expect(result.message).toContain("يومًا");
  });

  it("handles a half-page plan and multiple missed days", () => {
    const result = rescheduleAfterMiss({ remainingPages: 11, pagesPerDay: 1, missedDays: 2 });
    expect(result.remainingDays).toBe(13);
    expect(result.dailyPages).toBe(1);
  });
});
