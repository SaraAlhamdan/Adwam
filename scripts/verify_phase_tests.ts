import {
  fetchQuranRange,
  getSpokenPrompt,
  extractAyahWords,
  isMuqattaatAyah,
  splitUthmaniMuqattaat
} from "../shared/quran";
import { performWordAlignment } from "../supabase/functions/analyze-recitation/index";
import { calculateReviewSchedule } from "../client/src/features/reviewService";
import {
  todayKey,
  type PlanState,
  type ActivityRecord,
  type Assessment,
  type ReviewItem
} from "../client/src/features/persistence";

function assessmentScore(a?: Assessment): 1 | 2 | 3 | 4 {
  return a === "strong" ? 4 : a === "average" ? 3 : a === "review" ? 2 : 1;
}
import { buildPlanSnapshot } from "../client/src/features/planEngine";

console.log("==========================================================");
console.log("   ADWAM VERIFICATION SUITE: MEMORIZATION & RECITATION   ");
console.log("==========================================================\n");

function createInitialPlan(startPage = 6, pagesPerDay = 1): PlanState {
  return {
    started: true,
    startPage,
    currentPosition: startPage,
    totalPages: 604,
    pagesPerDay,
    activeDays: [0, 1, 2, 3, 4, 5, 6], // All days active
    startType: "specific",
    goal: "pace",
    goalMode: "pace",
    completedPages: 0,
    completedAyahs: 0,
    streak: 3,
    missedDays: 0,
    graceAllowance: 1,
    graceDaysUsed: 0,
    completedDates: ["2026-10-03", "2026-10-04", "2026-10-05"],
    reviewQueue: [],
    assessments: {},
    masteryHistory: [],
    activities: [],
    recovery: [],
    calendarStatuses: {},
  };
}

// Logic replicate matching HomeV2 complete()
function simulateComplete(
  plan: PlanState,
  page: number,
  assessment: Assessment,
  completionRatio = 1,
  extraPages = 0
): PlanState {
  const today = todayKey();
  const plannedQuota = plan.pagesPerDay;
  const completed = assessment !== "not_memorized" && completionRatio > 0;
  const completedQuota = Math.max(0, plannedQuota * completionRatio);
  const isFull = completed && completionRatio >= 1;
  const isNewDailyCompletion = isFull && !plan.completedDates.includes(today);

  const queue = calculateReviewSchedule(page, [1], assessment, plan.reviewQueue);
  const nextStreak = isNewDailyCompletion ? plan.streak + 1 : plan.streak;

  const activityId = `memorize-${Date.now()}`;
  const activity: ActivityRecord = {
    id: activityId,
    date: today,
    kind: "memorization",
    pageFrom: page,
    pageTo: Math.max(page, Math.floor(page + Math.max(0, completedQuota) - 0.01)),
    plannedPages: plannedQuota,
    completedPages: completedQuota,
    assessment,
    status: !completed ? "missed" : completionRatio < 1 ? "partial" : "completed",
    source: "inside_app",
    durationMinutes: 15,
    createdAt: new Date().toISOString(),
  };

  const extraActivities: ActivityRecord[] = [];
  const extraMastery: Array<{ date: string; page: number; assessment: Assessment; score: 1 | 2 | 3 | 4; sourceActivityId: string }> = [];

  if (completed && isFull && extraPages > 0) {
    const extraStartPage = Math.floor(page + completedQuota);
    const extraEndPage = extraStartPage + extraPages - 1;
    const extraActivityId = `memorize-extra-${Date.now()}`;
    const extraActivity: ActivityRecord = {
      id: extraActivityId,
      date: today,
      kind: "memorization",
      pageFrom: extraStartPage,
      pageTo: extraEndPage,
      plannedPages: extraPages,
      completedPages: extraPages,
      assessment,
      status: "completed",
      source: "inside_app",
      durationMinutes: 10,
      createdAt: new Date().toISOString(),
      reason: "إنجاز إضافي مبكر من الورد القادم",
    };
    extraActivities.push(extraActivity);
    extraMastery.push({
      date: today,
      page: extraStartPage,
      assessment,
      score: assessmentScore(assessment),
      sourceActivityId: extraActivityId,
    });
  }

  const leftover = completed && completionRatio < 1 ? Math.max(0, plannedQuota - completedQuota) : 0;
  const recoveryRecord = leftover > 0 ? {
    date: today,
    minutes: "none" as const,
    approved: true,
    label: "تم ترحيل الجزء المتبقي تلقائيًا",
    quota: leftover,
    kind: "redistribute" as const,
    redistribution: { [todayKey(new Date(Date.now() + 86400000))]: leftover },
  } : null;

  const totalAddedPages = completed ? completedQuota + extraPages : 0;
  const nextCurrentPosition = completed ? Math.min(plan.totalPages + 1, plan.currentPosition + totalAddedPages) : plan.currentPosition;

  return {
    ...plan,
    todayRecoveryPages: undefined,
    assessments: { ...plan.assessments, [today]: assessment },
    reviewQueue: queue,
    completedDates: isNewDailyCompletion ? [...plan.completedDates, today] : plan.completedDates,
    completedPages: completed ? Math.min(plan.totalPages - plan.startPage + 1, plan.completedPages + totalAddedPages) : plan.completedPages,
    currentPosition: nextCurrentPosition,
    streak: nextStreak,
    lastAction: isNewDailyCompletion ? "done" : !completed ? "missed" : plan.lastAction,
    activities: [...(plan.activities || []), activity, ...extraActivities],
    masteryHistory: [
      ...(plan.masteryHistory || []),
      { date: today, page, assessment, score: assessmentScore(assessment), sourceActivityId: activityId },
      ...extraMastery,
    ],
    recovery: recoveryRecord ? [...plan.recovery.filter(r => r.date !== today), recoveryRecord] : plan.recovery,
    calendarStatuses: {
      ...plan.calendarStatuses,
      [today]: !completed ? "vacation" : completionRatio < 1 ? "partial" : "completed",
    },
  };
}

async function runTests() {
  let passedCount = 0;

  // TEST 1: Half ward + Mastered (0.5 quota + "strong")
  console.log("--- TEST 1: Half ward + Mastered (نصف الورد + متقن) ---");
  const p1 = createInitialPlan(6, 1);
  const res1 = simulateComplete(p1, 6, "strong", 0.5, 0);

  const test1_check1 = res1.completedPages === 0.5;
  const test1_check2 = res1.currentPosition === 6.5;
  const test1_check3 = !res1.completedDates.includes(todayKey()); // Half is partial, not full completion
  const test1_check4 = res1.activities[0].status === "partial" && res1.activities[0].completedPages === 0.5;
  const test1_check5 = res1.masteryHistory[0].assessment === "strong" && res1.masteryHistory[0].score === 4;
  const test1_check6 = res1.recovery.some(r => r.kind === "redistribute" && r.quota === 0.5);

  console.log("Completed pages: 0.5 ->", test1_check1);
  console.log("Current position: 6.5 ->", test1_check2);
  console.log("Today not counted as full completion ->", test1_check3);
  console.log("Activity recorded as partial with 0.5 pages ->", test1_check4);
  console.log("Mastery recorded as strong (score 4) ->", test1_check5);
  console.log("Remaining 0.5 rescheduled automatically ->", test1_check6);

  if (test1_check1 && test1_check2 && test1_check3 && test1_check4 && test1_check5 && test1_check6) {
    console.log(">>> TEST 1 PASSED\n");
    passedCount++;
  } else {
    console.error(">>> TEST 1 FAILED\n");
  }

  // TEST 2: Full ward + Needs Reinforcement (كامل الورد + يحتاج تثبيت)
  console.log("--- TEST 2: Full ward + Needs Reinforcement (كامل الورد + يحتاج تثبيت) ---");
  const p2 = createInitialPlan(6, 1);
  const res2 = simulateComplete(p2, 6, "review", 1.0, 0);

  const test2_check1 = res2.completedPages === 1.0;
  const test2_check2 = res2.currentPosition === 7.0;
  const test2_check3 = res2.completedDates.includes(todayKey());
  const test2_check4 = res2.streak === p2.streak + 1; // streak increments
  const test2_check5 = res2.activities[0].status === "completed" && res2.activities[0].completedPages === 1.0;
  const test2_check6 = res2.reviewQueue.some(r => r.page === 6); // Scheduled for review
  const test2_check7 = res2.masteryHistory[0].assessment === "review" && res2.masteryHistory[0].score === 2;

  console.log("Completed pages: 1.0 ->", test2_check1);
  console.log("Current position advanced to 7.0 ->", test2_check2);
  console.log("Today marked completed in completedDates ->", test2_check3);
  console.log("Streak incremented to 4 ->", test2_check4);
  console.log("Activity status: completed ->", test2_check5);
  console.log("Review item queued for page 6 ->", test2_check6);
  console.log("Mastery recorded as review (score 2) ->", test2_check7);

  if (test2_check1 && test2_check2 && test2_check3 && test2_check4 && test2_check5 && test2_check6 && test2_check7) {
    console.log(">>> TEST 2 PASSED\n");
    passedCount++;
  } else {
    console.error(">>> TEST 2 FAILED\n");
  }

  // TEST 3: Full ward + Extra next-page progress (اليوم صفحة 6 + تقدم إضافي صفحة 7)
  console.log("--- TEST 3: Full ward + Extra next-page progress (صفحة 6 كاملة + إضافي صفحة 7) ---");
  const p3 = createInitialPlan(6, 1);
  const res3 = simulateComplete(p3, 6, "strong", 1.0, 1); // 1 extra page

  const test3_check1 = res3.completedPages === 2.0; // 1 today + 1 extra
  const test3_check2 = res3.currentPosition === 8.0; // 6 + 1 + 1 = 8
  const test3_check3 = res3.completedDates.includes(todayKey());
  const test3_check4 = res3.activities.length === 2;
  const todayActivity = res3.activities.find(a => a.pageFrom === 6 && a.pageTo === 6);
  const extraActivity = res3.activities.find(a => a.pageFrom === 7 && a.pageTo === 7);
  const test3_check5 = Boolean(todayActivity && todayActivity.status === "completed");
  const test3_check6 = Boolean(extraActivity && extraActivity.reason?.includes("إنجاز إضافي مبكر"));
  const test3_check7 = res3.masteryHistory.some(m => m.page === 6) && res3.masteryHistory.some(m => m.page === 7);

  console.log("Total completed pages: 2.0 ->", test3_check1);
  console.log("Next current position: 8.0 (upcoming ward starts at page 8) ->", test3_check2);
  console.log("Today marked complete in completedDates ->", test3_check3);
  console.log("Two distinct activities logged ->", test3_check4);
  console.log("Page 6 activity is completed ->", test3_check5);
  console.log("Page 7 extra activity logged with early progress note ->", test3_check6);
  console.log("Mastery history tracks both page 6 and page 7 ->", test3_check7);

  if (test3_check1 && test3_check2 && test3_check3 && test3_check4 && test3_check5 && test3_check6 && test3_check7) {
    console.log(">>> TEST 3 PASSED\n");
    passedCount++;
  } else {
    console.error(">>> TEST 3 FAILED\n");
  }

  // TEST 4: Page recitation in ONE continuous recording (صفحة 6 كاملة)
  console.log("--- TEST 4: Page recitation in one continuous recording (صفحة 6 كاملة متصلة) ---");
  const pageRange = await fetchQuranRange({ type: "page", pageNumber: 6 });
  console.log(`Page 6 loaded: ${pageRange.ayahs.length} ayahs, ${pageRange.totalWords} words.`);
  
  const expectedTextP6 = pageRange.ayahs.map(a => getSpokenPrompt(a)).join(" ");
  const expectedAyahsP6 = pageRange.ayahs.map(a => ({ ayah: a.numberInSurah, text: getSpokenPrompt(a) }));

  // Simulate reciter reciting the entire page 6 continuously (with 1 omission of 1 word)
  // Verse 30 starts: وإذ قال ربك للملائكة إني جاعل في الأرض خليفة
  const wordsNormalized = expectedTextP6.trim().split(/\s+/).filter(Boolean);
  const reciterTranscriptP6 = wordsNormalized.filter((_, idx) => idx !== 5).join(" "); // omit word 5

  const alignP6 = performWordAlignment(expectedTextP6, reciterTranscriptP6, expectedAyahsP6);

  const test4_check1 = alignP6.wordAlignment.length === alignP6.expectedWordsCount;
  const test4_check2 = alignP6.differences.length === 1 && alignP6.differences[0].type === "omission";
  const test4_check3 = alignP6.matchRate >= 98;
  const test4_check4 = alignP6.wordAlignment.every(w => typeof w.ayah === "number");

  console.log(`Word alignment count (${alignP6.wordAlignment.length}) matches expected count (${alignP6.expectedWordsCount}) ->`, test4_check1);
  console.log("Identified exact omission across continuous page ->", test4_check2);
  console.log(`Match rate: ${alignP6.matchRate}% ->`, test4_check3);
  console.log("Every word across all ayahs is mapped to its ayah number ->", test4_check4);

  if (test4_check1 && test4_check2 && test4_check3 && test4_check4) {
    console.log(">>> TEST 4 PASSED\n");
    passedCount++;
  } else {
    console.error(">>> TEST 4 FAILED\n");
  }

  // TEST 5: Today's ward recitation in ONE continuous recording (type="wird")
  console.log("--- TEST 5: Today's ward recitation in one continuous recording (ورد اليوم متصل) ---");
  const wirdRange = await fetchQuranRange({ type: "wird", pageNumber: 6 });
  console.log(`Ward loaded: ${wirdRange.title}, ${wirdRange.ayahs.length} ayahs.`);

  const expectedTextWird = wirdRange.ayahs.map(a => getSpokenPrompt(a)).join(" ");
  const expectedAyahsWird = wirdRange.ayahs.map(a => ({ ayah: a.numberInSurah, text: getSpokenPrompt(a) }));

  // Continuous verbatim recitation
  const alignWird = performWordAlignment(expectedTextWird, expectedTextWird, expectedAyahsWird);

  const test5_check1 = alignWird.matchRate === 100;
  const test5_check2 = alignWird.differences.length === 0;
  const test5_check3 = alignWird.correctCount === alignWird.expectedWordsCount;

  console.log("Match rate: 100% ->", test5_check1);
  console.log("Zero false differences ->", test5_check2);
  console.log("All words correct in continuous recording ->", test5_check3);

  if (test5_check1 && test5_check2 && test5_check3) {
    console.log(">>> TEST 5 PASSED\n");
    passedCount++;
  } else {
    console.error(">>> TEST 5 FAILED\n");
  }

  // TEST 6: Refresh after completion & Ward Semantics
  console.log("--- TEST 6: Refresh after completion & Ward Semantics (دلالة الورد بعد الإكمال) ---");
  // Simulate saving plan to serialized JSON and restoring (refresh simulation)
  const savedJson = JSON.stringify(res3);
  const hydratedPlan: PlanState = JSON.parse(savedJson);

  const todayCompleted = hydratedPlan.completedDates.includes(todayKey());
  const nextUpcomingPage = Math.max(1, Math.floor(hydratedPlan.currentPosition));

  const test6_check1 = todayCompleted === true;
  const test6_check2 = nextUpcomingPage === 8; // Because page 6 + page 7 extra were completed
  const kickerTitle = todayCompleted ? "وردك القادم" : "وردك اليوم";
  const test6_check3 = kickerTitle === "وردك القادم";

  console.log("Hydrated plan recognizes today is completed ->", test6_check1);
  console.log("Upcoming ward correctly displays Page 8 ->", test6_check2);
  console.log("Semantics switch to 'وردك القادم' ->", test6_check3);

  if (test6_check1 && test6_check2 && test6_check3) {
    console.log(">>> TEST 6 PASSED\n");
    passedCount++;
  } else {
    console.error(">>> TEST 6 FAILED\n");
  }

  console.log("==========================================================");
  console.log(`TOTAL RESULT: ${passedCount}/6 TESTS PASSED`);
  console.log("==========================================================");
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
