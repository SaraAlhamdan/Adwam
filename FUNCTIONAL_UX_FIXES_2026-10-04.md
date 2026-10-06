# Functional UX fixes — 4 Oct 2026

This patch keeps Adwam's existing visual identity and focuses on the concrete issues found in manual testing.

## Implemented

- Login/signup client-side validation:
  - valid email format required for email login/signup
  - Saudi mobile format validation for phone signup/login
  - password minimum of 8 characters
  - signup name minimum of 2 characters
  - visible validation errors instead of silently accepting bad input
- Session entry guard rejects malformed/stale local session payloads.
- Streak is explicitly visible on the dashboard and increments only once per completed daily quota.
- Deferring a day resets the current streak and increments deferred-day count.
- Dynamic progress/milestone copy supports:
  - 7-day streak
  - 30-day streak
  - 50 completed ayahs
  - 100 completed ayahs
  - completing a surah when the completed page contains its final ayah
  - returning after a missed/deferred day
- Mobile navigation fixed as a persistent bottom bar with all five primary destinations accessible.
- Mobile floating recovery action and toast are lifted above the bottom navigation.

## Important boundary

The login screen now has real input validation, but this prototype still stores the demo session locally. This is not a replacement for server-side authentication. Before production deployment, connect the UI to the chosen backend auth provider and enforce authorization on the server.

## Manual QA to run in Manus/browser

1. Invalid email (`a`) + password -> must not enter.
2. Valid email + password shorter than 8 -> must not enter.
3. Valid formatted email + 8+ character password -> demo flow enters.
4. Complete a quota once -> streak increments exactly once and milestone area remains visible.
5. Repeat completion same day -> streak must not increment again.
6. Defer the day -> streak resets; deferred days increments.
7. Mobile width <=700px -> bottom navigation shows all five destinations and each is reachable.
8. Verify recovery floating button and toast do not overlap bottom navigation.

## Interactive “ساعدني أحفظها” mode
- Converted the ayah memorization button from a generic assistant answer into a three-stage interactive flow.
- Stage 1: splits the verified ayah text into short chunks; meaning and mutashabihat areas only display sourced RAG output when connected.
- Stage 2: progressively hides 25%, 50%, 75%, then all words for active recall practice.
- Stage 3: shows only the opening cue, accepts the learner's typed recall, and provides an approximate ordered-word match. This is explicitly labelled as a memorization aid, not recitation accuracy.
- Keeps “اختبرني” separate as the actual assessment/recitation flow.
