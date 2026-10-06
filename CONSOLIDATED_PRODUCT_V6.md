# Adwam v6 — Consolidated Product Build

This build merges the connected-journey work from v5 with the full UX/product backlog agreed on 2026-10-05.

## Implemented in this build

### Planning / onboarding
- Replaced the contradictory `quota + days + fixed duration` model with a feasibility engine.
- Default mode: user chooses memorization quota + active days; Adwam calculates expected completion date and remaining calendar days.
- Optional target-date mode: user chooses a future target + active days; Adwam calculates the required pages per memorization day.
- Onboarding preview shows active days, pages remaining, days remaining, and expected completion before confirmation.
- Dashboard always shows `المتبقي لهدفك` and expected completion date.
- Target plans show whether the current pace remains on track and the required quota when it falls behind.

### Journey / history / calendar
- Persistent activity records for memorization, review, partial completion, and outside-app completion.
- Calendar shows plan vs actual and opens daily details.
- Partial completion saves what was actually completed and reschedules the remainder.
- Expected completion is recalculated from current position, active days, and quota.
- Mastery history is time-based.
- Session duration is stored.
- Review cycles can begin after memorization is complete without erasing previous history.

### Rescue / streak / motivation
- `أنقذ وردي` shows before/after quota and expected completion impact.
- Grace Day (`مهلة الاستمرار`): one limited 24-hour streak freeze instead of immediate streak loss.
- Micro-celebrations: small check animation + optional haptic after completion; no confetti/game-like effects.
- Milestone messages for return, surah completion, 50/100 ayahs, 7/30-day streaks.
- Shareable achievement text avoids personal/sensitive data.

### Memorization experience
- `ساعدني أحفظها` uses chunks, progressive hiding, oral recall/self-check, and no manual Quran typing.
- Similar-wording and brief-meaning slots stay source-gated: no fabricated religious content when RAG is unavailable.
- Review reason is visible (`why now?`).

### Quran audio
- Verse-by-verse streaming controls were added to the Quran reader.
- Play single ayah, play whole displayed quota/page, stop, active-ayah highlighting.
- Reciter selector with Mishary Alafasy, Maher Al-Muaiqly, Al-Husary, and Al-Minshawi.
- Audio is streamed from EveryAyah and is not bundled into the repository.
- External recording redistribution/storage rights still require separate review before production use.

### Login/form UX
- International country-code selector; Saudi-only phone validation removed.
- Independent per-field validation.
- Red borders + inline error text for every invalid field; simultaneous errors are shown together.
- Removed green/success styling for errors.
- Password is not persisted in localStorage.
- The hackathon build explicitly describes the local session as a demo session, not production authentication.

### Navigation / demo / states
- Mobile bottom navigation across all main views.
- Synthetic judging scenario can be loaded from Settings and is explicitly labeled as demo data.
- Existing loading/empty/error/success states remain in Quran/RAG/review/history flows.

## Deliberately not faked / still integration-pending

1. **Production authentication + remote database**
   - Current journey persistence is local for the hackathon prototype.
   - `ActivityRecord` and `MasterySnapshot` remain separated so they can be mapped to real database tables.

2. **Wafaa's RAG corpus/endpoint**
   - UI and abstention behavior are ready.
   - No tafsir/mutashabihat answer is fabricated while the source endpoint is disconnected.

3. **`اختبرني` STT analysis**
   - Recording and safe failure behavior are present.
   - The app does not invent match scores, tajweed errors, hesitation detection, or word errors before a Quran-capable STT/comparison pipeline is connected and tested.

4. **Approved translations of meanings**
   - Not enabled in this build until the team connects an approved translation source and preserves the Arabic Quran text as the Quran itself.

## Validation performed
- TypeScript/TSX syntactic transpilation checks passed for all modified files using the installed TypeScript compiler.
- Plan-engine scenarios were executed separately, including the contradiction case: one page on one day/week produces a multi-year estimate; a one-year target on one day/week calculates an approximately 11.6-page/session requirement instead of accepting an impossible plan.
- A full Vite/runtime build was not completed in this container because project npm dependencies could not finish installing within the execution window. Run `npm install`/`pnpm install`, then `npm run check`, `npm test`, and `npm run build` in the project/Manus environment before publishing.
