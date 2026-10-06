# Adwam v5 — Connected Journey

Implemented on top of `adwam-app-memorize-v4`.

## Added
- Persistent activity history model for memorization, review, partial completion, and outside-app completion.
- Calendar reads actual activity records and shows day details.
- Plan vs actual view: planned memorization days, scheduled reviews, and completed activities are visually separated.
- Partial completion records the completed share and automatically carries the remainder forward as a recovery/reschedule record.
- Outside-app memorization can be logged into the same history.
- Review reasons are visible in the calendar and review center.
- Mastery history is time-based with recent assessment snapshots.
- Expected completion date is recalculated from current position, quota, and active days.
- Session duration is stored with completed activity records.
- New review-cycle action becomes available after completing the memorization journey and rebuilds a review queue from memorized pages.
- Recovery preview shows the current expected completion date and explains that it recalculates after the adjustment.
- Memorization aid no longer asks the user to type Quran text manually; recall is oral/self-check based.

## Persistence / database note
The current demo persists these records in the existing `adom-plan` local store so the UX works without requiring a live backend migration during the hackathon. The new `ActivityRecord` and `MasterySnapshot` data shapes are intentionally separated so they can be mapped to database tables later without redesigning the UI flow.

## Validation note
Static structural checks were completed in this environment. Full TypeScript/build validation could not be completed because project dependencies were not fully available/installed in the execution environment.
