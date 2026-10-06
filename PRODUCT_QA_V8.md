# Adwam v8 — Consultant Preview QA

## Purpose
This build is intended for product/UX consultant review before final freeze.

## Included in v8
- Corrected account flow from v7: name is separate from contact; sign-in requires an existing preview account.
- International phone-code UI and field-level validation.
- Connected memorization flow: read -> memorize aid -> test by voice OR complete quota -> assessment.
- Calendar month/week/journey report, selected-day detail, plan-vs-actual records, reviews, and day-specific adjustments.
- Micro-celebrations, streak milestones, Grace Day, next-quota wording after completion.
- Dynamic completion estimate and target-feasibility logic.
- Quran reciter audio controls.
- Ayah tafsir and similar-passages buttons now open source-backed Quranpedia content inline instead of a dead/empty state.
- Assistant explicitly shows the future trusted-specialist referral as Roadmap, not as a live service.
- Repeated-error proactive alerts are labeled Roadmap only.
- Supabase production schema + RLS exist in the backend/repository; this preview still uses local persistence as a fallback until UI wiring is completed.

## Important honesty notes
- Voice Test is NOT a tajwid engine. It may support transcription/text-difference analysis when the STT service is connected; it must not claim makharij/madd/ghunnah precision.
- Quranpedia inline embeds are used for source-backed consultant/demo flow. Before final launch, tafsir books must be restricted to the challenge-approved scientific source policy.
- Do not present specialist referral as operational until an accredited human partnership exists.
