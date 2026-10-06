# Adwam — Security Review for Hackathon Delivery

## Scope
This review focuses on the current ZIP and the highest-risk items before a public GitHub repository and Live Demo are submitted.

## Must fix before public delivery

1. **Authentication is currently demo-only in the frontend.**
   - `client/src/pages/Login.tsx` accepts any non-empty credentials and writes `adom-session` directly to `localStorage`.
   - This is not real authentication and must not be represented as secure login.
   - The repository already contains server-side auth/session infrastructure; production auth should use server-issued sessions/cookies and protected procedures.

2. **Never expose secrets in the client bundle.**
   - AI/RAG/STT provider keys must stay server-side.
   - Keep `.env*` files out of Git and provide `.env.example` with names only, never values.

3. **Protect server endpoints, not just UI routes.**
   - Any endpoint that reads or writes user plans, reviews, recordings, or AI usage must verify the authenticated user on the server.
   - Frontend visibility rules are UX only, not authorization.

4. **Validate AI and API inputs server-side.**
   - Limit question length, accepted content types, upload size, and request frequency.
   - Treat user text as untrusted input.

5. **Minimize personal data sent to external AI services.**
   - Do not send name, email, phone, or unrelated profile data with a Quran question or recitation request.
   - Use synthetic/demo accounts for the hackathon Live Demo.

6. **Rate-limit expensive AI endpoints.**
   - RAG/STT endpoints should have basic per-user/IP limits to reduce abuse and unexpected provider costs.

7. **Safe errors and logs.**
   - Do not return stack traces, database errors, provider secrets, or raw tokens to the browser.
   - Do not log access tokens, passwords, API keys, or sensitive recordings.

## Frontend responsibilities
- Never contain provider secrets.
- Do not persist passwords or tokens in localStorage.
- Avoid rendering raw HTML from AI output.
- Show neutral error states without internal implementation details.
- Make logout clear and invalidate the server session once real auth is connected.

## Backend responsibilities
- Authentication and authorization.
- Secret management.
- Input validation and rate limiting.
- Data ownership checks.
- Sanitized errors and audit-safe logging.
- External AI/provider calls.

## Hackathon-safe minimum
If there is not enough time to complete real account auth, use a clearly labeled **demo session** for the judging environment and do not claim that the current localStorage login is production authentication. Prioritize securing RAG/STT secrets and endpoints first.

## Changes applied in v2
- Added `.gitignore` rules for `.env*`, build output, logs and local tooling files.
- Added `.env.example` containing variable names only.
- Assistant input is normalized and capped before the adapter call.
- React text rendering is retained; no raw HTML renderer was introduced for AI output.
- Fixed a client-side calendar/date bug that could shift a day through UTC serialization.
- A repository text scan found no obvious hard-coded API keys/tokens matching common secret patterns at the time this ZIP was prepared.

## Still not solved by frontend changes
- The current localStorage demo session is not production authentication.
- RAG/STT endpoints must implement server-side auth/ownership checks, rate limiting and payload limits when connected.
- External-source license/terms verification remains required before public delivery.
