# Adwam — Product / QA Checklist v6

## P0 — must work for judging
- [x] International phone selector + per-field validation UX.
- [x] Plan feasibility engine: pace -> completion, or target -> required quota.
- [x] Remaining days + expected completion shown on dashboard.
- [x] Calendar reads activity records and exposes day details.
- [x] Plan vs Actual.
- [x] Partial completion + automatic carry-forward.
- [x] Outside-app completion.
- [x] History.
- [x] Mastery history.
- [x] Review reason / `why now?`.
- [x] Rescue before/after preview.
- [x] Streak + milestone messages.
- [x] Grace Day.
- [x] Micro-celebrations.
- [x] No manual Quran typing in memorization aid.
- [x] Mobile bottom navigation.
- [x] Reciter audio streaming UI.
- [x] Explicit synthetic demo scenario.
- [ ] Run end-to-end browser QA in Manus.
- [ ] Connect production database/auth if required for the final live build.
- [ ] Connect Wafaa's RAG endpoint and run a documented coverage test set.

## P1 — after core passes
- [ ] Verify every reciter/audio URL used in the final demo and document rights/terms.
- [ ] Connect approved translations of meanings (Arabic Quran text always remains primary).
- [ ] Visual achievement-card renderer (current build shares privacy-safe achievement text).
- [ ] More granular partial completion than 50% if needed.
- [ ] Confirm all Arabic/English copy across every edge state.

## Final large feature — do last
- [ ] `اختبرني`: Quran-capable STT provider/source study.
- [ ] Speech -> transcript normalization suitable for Quran recitation.
- [ ] Comparison against the expected Uthmani text.
- [ ] Define which error categories are genuinely supported.
- [ ] Save verified result into mastery/history/review scheduling.
- [ ] Do not claim tajweed/makhraj/madd/hesitation accuracy unless separately validated.
