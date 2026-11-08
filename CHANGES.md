# Changes: bug fixes (Phase 1–2) and new features (Phase 3)

Branch `android-web-app`, one commit per item (search the log for `H1:`, `L5:`, `F7:` …).

## Before you deploy

### New environment variables (all optional)

| Variable | What it does | Default |
|---|---|---|
| `APP_URL` | Public web address, used in emailed links, `sitemap.xml`, share previews. On Render, `RENDER_EXTERNAL_URL` is used when this is empty. | `RENDER_EXTERNAL_URL`, else `http://localhost:PORT` |
| `RESEND_API_KEY`, `MAIL_FROM` | Email through [Resend](https://resend.com) (password reset, verification, reminders, digests, search alerts). `MAIL_FROM` must be on a domain you verified in Resend, e.g. `SarthiAI <no-reply@sarthiai.in>`. Without both: development prints emails to the console; production sends nothing. | off |
| `FEATURE_GOOGLE_SIGNIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | "Continue with Google" (web). Off unless the flag is `true` **and** both credentials are set. Google Cloud Console ▸ Credentials ▸ OAuth client (Web). Authorised redirect URI: `<APP_URL>/api/auth/google/callback`. | off |
| `ENABLE_NOTIFICATION_JOBS` | Hourly in-process reminder jobs. | on in production when `RESEND_API_KEY` is set |
| `JOBS_SECRET` (24+ chars) | Enables `POST /api/internal/jobs` (header `X-Jobs-Secret`). Needed on hosts that sleep (Render free): add GitHub secrets `SARTHI_APP_URL` and `SARTHI_JOBS_SECRET` (same value) and `.github/workflows/notify.yml` calls it hourly. `render.yaml` generates one. | endpoint absent |
| `AUTH_REQUESTS_PER_15_MIN`, `API_REQUESTS_PER_15_MIN` | Per-IP limits for sign-in/sign-up and for all API requests. | 20, 600 |
| `MAIL_OUTBOX_FILE` | Development / e2e only: also append outgoing emails to this file. | – |
| Web build: `VITE_DEV_SERVER_SETTING=1` | Shows Profile ▸ Developer · server (dev / debug APK only). CI sets it only when `SARTHI_API_URL` is empty. | off |

All are listed in `server/.env.example`; `render.yaml` declares the Render ones.

### Migrations

None to run by hand. New MongoDB collections are created on first use: `sessions`, `loginthrottles`, `eligibilityanswers`, `notifications`, `datewatches`, `savedsearches`, `documents` (+ GridFS `documents.files` / `documents.chunks`), `collegerequests`. New user fields are optional with defaults. Existing users:

- Web users signed in with a token in `localStorage` are moved to the cookie session on their next visit (no sign-out).
- Older tokens (no device id) keep working; signing out with one ends all devices, as before.
- Existing users have no verified email yet: they see the verify banner, and no reminder emails go out until they verify.
- A stale `sarthi.serverUrl` is deleted on the next load (H1).

### Dependencies added

`server`: `pdfjs-dist@6.4.299` (resume text). `web` (dev only): `vitest@5.1.0`, `jsdom@30.1.2`, `@testing-library/react@16.3.3`, `@testing-library/dom@10.4.2`, `@playwright/test@1.63.0`, `@axe-core/playwright@4.14.0`.

### Testing

| Suite | Command | Count |
|---|---|---|
| API (Vitest + Supertest, real MongoDB) | `cd server && MONGODB_TEST_URI=mongodb://127.0.0.1:27017 npm test` | 235 |
| Web unit + component (Vitest, jsdom) | `cd web && npm test` | 29 |
| End-to-end (Playwright, 390×844 + 1366×860) | `cd web && npm run build && npm run e2e` | 98 (+ optional screenshot tour) |
| Scrapers (pytest) | `cd ingest && .venv/bin/python -m pytest -q tests` | 22 |

CI runs all of them; the new `e2e` job starts MongoDB as a service. `e2e/server.mjs` seeds a throwaway database (real scraped data) and creates a platform admin.

## Phase 1: high-severity bugs

**H1. Developer server setting / lockout / token leak.** Production builds never offer the setting, ignore and delete a stored `sarthi.serverUrl` on startup, and only attach the session token to the default server. Dev builds: Save stays disabled until Test succeeds for that URL, `https://` required (except `http://10.0.2.2` / `localhost`). "Cannot reach the server" errors (Welcome and every error card) offer **Reset to default server**. *Test:* `web/src/lib/serverConfig.test.ts`, `ServerSettings.test.tsx` (reset path), `e2e/server-url.spec.ts`.

**H2. Forgot password.** `POST /api/auth/forgot-password` (always the same 200), single-use SHA-256-hashed token, 30-minute expiry, `POST /api/auth/reset-password` (password rules, ends every session via JWT `ver`, signs in). Rate-limited per IP and per email. Screens: Forgot password? → request form → Check your email → `/reset-password?token=…`. *Test:* `server/tests/password-reset.test.js`, `e2e/password-reset.spec.ts` (reads the dev mail outbox).

**H3. Onboarding errors.** Shared rules in `shared/profileRules.js` used by the zod schema and the forms: CGPA 0–10 with ≤ 2 decimals, graduation year must fit the year of study (also enforced by the API), income a whole non-negative number (no silent stripping), skills/interests ≤ 30 × 40 chars. Degree and year of study are required on step 2; Branch, Graduation year and CGPA say "(optional)". Each step validates on Continue; server field errors (`profile.cgpa`) jump to their step, show inline and focus the field. Footer: errors render inside it; `scroll-padding-bottom` keeps focused fields visible. *Test:* `profileValidation.test.ts`, `Onboarding.test.tsx`, `server/tests/profile-validation.test.js`, `e2e/onboarding.spec.ts` (invalid CGPA blocked; Career goal is `elementFromPoint` at its centre after focus and after `scrollIntoView`).

**H4. Home tiles said 0 scholarships.** `GET /api/opportunities/summary` counts open listings exactly like Find; the eligibility split is secondary text ("1 fit you · 23 need your details"). *Test:* `server/tests/home-summary.test.js` (summary = Find total for every type), `Home.test.ts`, `e2e/home-counts.spec.ts`.

**H5. Ask Sarthi answers.** Time-window search (`deadline_window` this_week / this_month / …, sorted by deadline, up to 25, "confirm eligibility" labels, likely-ineligible left out and counted) in the AI tool and in quick answers; prompt rules for "this month" questions; citations only for listings the reply names; private fields reported as "private — not shared with Sarthi" with a set reply. *Test:* `server/tests/sarthi-evals.test.js` (prompt → tool output / citation set), live check with a real key: `npm run eval:sarthi -- --email <student>`, `e2e/sarthi.spec.ts`.

## Phase 2: low-severity bugs

**L1. Contrast.** `--ink-3` light `#60666D`, dark `#9A9F99`; light `--coral` `#A63F33`. *Test:* `e2e/a11y.spec.ts`: axe wcag2a/aa on /welcome, /, /discover, /opportunity/:id, /sarthi, /profile, /profile/edit, /applications, light + dark, both viewports: **0 violations**.

**L2. Save button.** `aria-pressed`, name Save / Saved, tooltip "Remove from saved". *Test:* `SaveButton.test.tsx`.

**L3. Union territories.** `shared/states.js`: 28 states + 8 UTs (+ Other); the API accepts only these; old names of the merged UT match domicile rules. *Test:* `profile-validation.test.js`.

**L4. College search.** Trimmed query, Searching… state, multi-word search, "isn't listed" keeps the typed text and saves it. *Test:* `server/tests/colleges.test.js`, `e2e/college.spec.ts`.

**L5. Display glitches.** Heading spacing, "Optional" badge spacing, one `personInitials()` / Avatar, descriptions clipped at word boundaries (scrapers and display) with Read more + official-source link. *Test:* `ingest/tests/test_common.py`, `format.test.ts`, `e2e/display.spec.ts`.

**L6. Tab titles** per route ("Find · SarthiAI", listing title on detail). *Test:* `e2e/titles.spec.ts`.

**L7. Roadmap** is the 5th tab on phones (fits at 320 px). *Test:* `e2e/nav.spec.ts`.

**L8. Off-topic chat.** Prompt scope rule, a pre-check for coding/homework (no model call), replies containing code are replaced, `find_learning_resources` tool for grounded pointers. *Test:* `server/tests/scope.test.js`.

**L9. HTML in names.** Tags and control/bidi characters stripped from typed text before validation; email templates escape everything. *Test:* `server/tests/sanitize.test.js`.

**L10. Static files.** Real `robots.txt`, generated `sitemap.xml`, `favicon.ico`; missing files 404; unknown routes return the app with a 404 status and a Not found page. *Test:* `server/tests/seo.test.js`, `e2e/static.spec.ts`.

**L11. Token storage.** Implemented (not just assessed): the web app's session is an httpOnly, SameSite=Lax (Secure in production) cookie; CSRF: custom header + Origin check on state-changing requests; Android keeps bearer tokens; old localStorage tokens migrate automatically. *Test:* `server/tests/session-cookie.test.js`, `e2e/session.spec.ts`.

## Phase 3: features

**F1. Public opportunity pages.** Signed-out `/opportunity/:id` (official facts, source, deadline, sign-in CTA), `GET /api/public/opportunities/:id` (rate-limited, no personal data, never college-only), server-rendered Open Graph / Twitter / canonical tags, Share (Web Share API / Android sheet / copy link), `?next=` kept through sign-in and onboarding, public listings in `sitemap.xml`. *Test:* `public-pages.test.js`, `next.test.ts`, `e2e/public-pages.spec.ts`.

**F2. Account trust and safety.** Per-device sessions (Sign out = this device; Sign out of all devices); progressive login throttling per email and IP; email verification (banner; **decision: only emails from SarthiAI wait for verification**); password rules + strength hint; Google sign-in behind `FEATURE_GOOGLE_SIGNIN` (OIDC code flow + PKCE, web only). **Account enumeration: risk accepted and documented** — sign-up still says "account already exists" (409), because a neutral flow needs every new account to confirm by email before first sign-in, which needs the email provider in production; sign-in and forgot-password are neutral and sign-up is rate-limited. *Test:* `account-safety.test.js`, `google-signin.test.js` (mocked token endpoint), `password.test.ts`, `e2e/account.spec.ts`.

**F3. Private scholarship fields.** Gender, category, disability, minority, parent/guardian service, first-generation; new rule kinds plus a classifier that reads the group from existing NSP scheme names (Pragati, Saksham, PM scholarships for CAPF / Railways / police wards, SC/ST/OBC schemes). Never sent to the AI and never shown to colleges. **Privacy fix found here:** eligibility explanations sent to the AI used to include values such as the home state; private criteria are now sent as `checked_privately` and the AI's overall result is recomputed without them. *Test:* `private-fields.test.js` (incl. real seeded records and the AI tool output).

**F4. Remembered eligibility answers** per listing and criterion; used in checks, Find, Home, matches, the plan and Sarthi; clear per listing or all. *Test:* `eligibility-answers.test.js`, `e2e/answers.spec.ts`.

**F5. Reminders when the app is closed.** `.ics` download and Add to Google Calendar per deadline; deadline emails and a Monday digest (verified emails only, each sent once, one-click unsubscribe); "Notify me when dates are announced" (fires on admin edit, data refresh or seed); WhatsApp hook stub. **Bug found and fixed:** admin `PATCH` re-applied schema defaults and silently unpublished listings. *Test:* `reminders.test.js`, `admin.test.js` (regression), `e2e/reminders.spec.ts`.

**F6. Find filters.** Soonest deadline, amount at least (monthly ×12), hide likely-not-eligible, all in the URL; saved searches with daily alerts (F5 mailer). *Test:* `find-filters.test.js`, `e2e/find.spec.ts`.

**F7. Documents.** Per-listing checklist (listing's own list + documents its criteria usually need, labelled), "I have it" ticks, private vault in **MongoDB GridFS** (decision): PDF/JPG/PNG checked from bytes, 4 MB / 15 files / 10 MB per student, 5-minute signed download links, Aadhaar and bank documents never stored. *Test:* `documents.test.js`, `e2e/documents.spec.ts`.

**F8. Resume and tracker.** Resume PDF → suggested skills / projects / experience (PDF.js on the server, no AI), reviewed before anything is saved; tracker Board view with drag-and-drop and a "Move to" menu, status history kept. *Test:* `resume.test.js` (generated PDF fixture), `e2e/resume-board.spec.ts` (incl. axe on the board).

**F9. Hindi.** Dependency-free i18n (`web/src/i18n`), language switcher in Profile, remembered per device, `<html lang>` kept in sync, first visit follows the device language. Core screens translated; the rest falls back to English. *Test:* `i18n.test.ts`, `e2e/language.spec.ts`.

**F10. Add my college.** City/state on "isn't listed", one request per institution, Admin ▸ College requests (approve / merge / reject, platform admins), `npm run colleges:import -- --file <csv> [--apply]` for AISHE / AICTE exports (**not run**, decision: confirm the data licence first). *Test:* `college-requests.test.js`, `e2e/college-requests.spec.ts`.

## Known limits

- Emails are only delivered once `RESEND_API_KEY` and `MAIL_FROM` are set (and only to verified addresses). Until then, password reset in production cannot send its link.
- Google sign-in is web-only; the Android app keeps email sign-in.
- Hindi covers the core screens; server-written text (next steps, eligibility explanations, emails) is English. The Hindi strings should be reviewed by a native speaker.
- The AI still sees the overall eligibility label in search results (e.g. "confirm eligibility"), which can reflect private details; it never sees the values or which private criterion passed.
- Login throttling and rate limits are per server process (fine for one Render instance; use a shared store if you scale out).
