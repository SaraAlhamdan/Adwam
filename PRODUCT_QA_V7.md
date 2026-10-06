# Adwam v7 — Consolidation QA

## Fixed in v7
- Login no longer accepts an arbitrary email/phone without a previously created local challenge account.
- Signup requires a real display name; signed-in profile uses the name, not the email.
- International phone country code selector retained.
- Field-level validation retained; local password is stored only as a SHA-256 hash in the challenge browser store.
- Removed the decorative login sparkle/kicker; brand subtitle simplified to "لحفظٍ يدوم".
- Memorization aid now offers two next actions after successful self-recall: voice Test Me, or return to quota completion flow.
- Test Me now calls a real server STT endpoint when the built-in transcription service is configured, and returns an approximate text-match score. It does not claim tajweed/makhraj scoring.
- After completing today, dashboard labels the next item as "وردك القادم" and shows a persistent completion message.
- Assessment choices redesigned as explanatory cards.
- Calendar month now aligns dates to actual weekdays using a Saturday-first grid.
- Calendar day details show planned memorization, scheduled review, actual records, assessment, duration, and selected-day overrides.
- Day adjustments apply only to the selected day and visibly change that day's state/quota.
- Weekly view now shows actual day cards instead of only listing active weekday names.
- History renamed/reshaped into a journey report with summary metrics + chronological session records.
- Disabled future review-cycle card is hidden until the memorization goal is actually complete.

## Still NOT production-complete
- Server database persistence is NOT wired to the custom email/phone challenge login. The repository has MySQL/Drizzle plan tables, but this UI still stores journey state locally. This must not be described as database-connected in judging until integration is completed.
- Email/phone auth in v7 is a challenge-local account registry, not production authentication.
- Voice Test Me depends on the configured built-in STT service. If unavailable, the UI must show the safe fallback rather than fabricate a score.
- RAG coverage depends on the teammate backend/source integration and should be tested against a fixed judge-demo question set.
