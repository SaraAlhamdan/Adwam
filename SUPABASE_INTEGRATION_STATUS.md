# Supabase integration status — v8 consultant preview

The Adwam Supabase production foundation has been created separately and its migration is tracked in the GitHub repository.

Current backend foundation includes:
- profiles
- memorization_plans
- plan_days
- memorization_sessions
- review_assignments
- mastery_snapshots
- calendar_events
- streaks
- grace_days
- user_settings
- recitation_attempts
- assistant_messages
- source_references

RLS is enabled and the post-migration Supabase security advisor returned no active security lints.

The v8 consultant preview intentionally retains local persistence as a fallback so UX review can continue while frontend-to-Supabase wiring is completed. Do not describe the preview UI as fully database-connected until that wiring is finished.
