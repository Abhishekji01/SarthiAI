# SarthiAI — your future, guided

SarthiAI helps Indian college students find **verified** scholarships, internships, fellowships and research programmes, check eligibility criterion by criterion, track applications, and plan next steps with **Sarthi**, an AI guide that answers only from real data.

It runs in two places from **one codebase**:

| | How | Where |
|---|---|---|
| **Browser** | Installable PWA (works on desktop and mobile browsers) | `web/` served by the API server |
| **Android app** | Same UI packaged with [Capacitor](https://capacitorjs.com) — native storage, Custom Tabs, share sheet, haptics, back button, and **local deadline reminders that fire even when the app is closed** | `web/android/` |

The backend (`server/`) is Node + Express + MongoDB, with Google Gemini for AI features. The Python scrapers in `ingest/` refresh listings from official sources every day.

> This project is the Android/web version of [amandotyadav/neviq](https://github.com/amandotyadav/neviq), an iOS SwiftUI app, with accuracy and coverage upgrades listed below.

---

## What's new compared with neviq

### More accurate AI and matching
- **Skill & interest taxonomy** (`server/src/matching/taxonomy.js`): ~90 concepts with aliases, so `JS` = `JavaScript`, `ML` = `Machine Learning`, `C++` = `cpp`. Related skills get partial credit (React → JavaScript), but never count as an exact match for a requirement.
- **Better match scoring** (`matching/engine.js`): skills used in the student's **projects** count; interests are matched as concepts against tags, type and description; a new **career-goal fit** factor; required skills weigh more than preferred ones; each score has a **confidence** level (high/medium/low).
- **More accurate eligibility** (`eligibility/engine.js`):
  - degree families (`UG`, `PG`, `Engineering`, `Any degree`) and many more degree/branch aliases;
  - "any branch" wildcards;
  - specialisations (e.g. CSE-AIML when CSE is listed) are flagged **to confirm** rather than guessed either way;
  - year of study is estimated from the graduation year (and labelled as an estimate);
  - state abbreviations (`UP`, `TN`, Orissa → Odisha);
  - percentage rules are **never** compared against a CGPA.
- **Grounded chat** (`ai/grounding.js`): every date and ₹ amount in Sarthi's reply is checked against what the tools actually returned. Anything unsupported triggers an automatic correction pass. If it still can't be verified, the student sees an explicit "couldn't verify" note.
- **Agent improvements** (`ai/saathi.js`): profile snapshot in context (fewer tool hops), tools run in parallel, up to 6 steps, IST-correct dates (UTC slicing used to shift deadlines by a day), citations by title or id, replies in English, Hindi or Hinglish, low temperature for factual answers.
- **Self-repairing structured output** (`ai/provider.js` → `structuredWithRepair`): if a roadmap or draft fails schema validation, the model is told exactly what was wrong and retried once; invalid output is still never saved.
- **Model fallback**: if `GEMINI_MODEL` is rejected as unknown, the server switches to `GEMINI_FALLBACK_MODEL` (`gemini-flash-latest`).

### More results
- **Ranked, typo-tolerant search** (`matching/search.js`) replaces regex substring matching. It handles phrases and synonyms ("ML internship"), typos ("scholarshp"), plurals, and eligibility text ("scholarships for girls"). Ranking is BM25-style with field weights.
- **Relaxed fallback**: when no listing matches every term, related results are shown and labelled. When only closed listings match, the app says so and offers to show them.
- **Two-tier recommendations**: `/api/matches?tier=all&limit=30` adds a clearly labelled **"worth checking"** tier (open and not ruled out, but fit not confirmed), instead of hiding those listings.
- **Quick answers without an AI key** (`POST /api/ai/quick`): deterministic answers for deadlines, next steps, applications, recommendations and search, built from the same data. The app falls back to it automatically when AI is unavailable.

### Same principles as neviq (unchanged)
Listings are never invented; unknown stays unknown. Eligibility is deterministic, and the AI only explains it. AI write actions are propose-only (the student confirms). Opening a link never marks you as applied. Income and home state are private and never sent to the AI.

---

## Project layout

```
server/   Node 22 + Express 5 + Mongoose + Zod API (also serves web/dist)
  src/matching/   taxonomy.js, search.js, engine.js   ← accuracy & search
  src/eligibility/engine.js                          ← deterministic checks
  src/ai/         provider.js, saathi.js, grounding.js, quick.js, generators.js
  tests/          Vitest + Supertest (100 tests)
web/      React 19 + TypeScript + Vite client (PWA) + Capacitor 8
  src/pages/      Home, Discover, OpportunityDetail, Sarthi, Roadmap, Applications, Drafts, Profile, Onboarding, Admin
  android/        Capacitor Android project (Android Studio / Gradle)
ingest/   Python scrapers for official sources (NSP, NICSI, ISRO, Science Academies)
.github/workflows/ci.yml   tests + web build + Android debug APK
```

## Run locally

Requirements: Node 22+, and MongoDB (local, Atlas, or `docker run -d -p 27017:27017 mongo:8`).

```bash
cd server
npm install
cp .env.example .env    # set MONGODB_URI and JWT_SECRET (32+ chars); GEMINI_API_KEY is optional
npm run seed            # verified listings, colleges, learning resources
npm run dev             # API on http://localhost:4000
```

Without a local MongoDB you can use `npm run dev:memory` instead. It downloads a MongoDB binary, seeds the data and starts the API.

In another terminal, start the web app with hot reload (it proxies `/api` to :4000):

```bash
cd web
npm install
npm run dev             # http://localhost:5173
```

To serve the production build from the API server (one origin, installable PWA):

```bash
cd web && npm run build      # the server serves web/dist automatically at http://localhost:4000
```

Tests:

```bash
cd server
npm test                                          # downloads a throwaway MongoDB
MONGODB_TEST_URI=mongodb://127.0.0.1:27017 npm test   # or use an existing one

cd ../web
npm run lint                                      # type check
npm test                                          # unit + component tests (Vitest, jsdom)
npm run build && npm run e2e                      # end-to-end (Playwright, 390x844 + 1366x860; needs MongoDB at E2E_MONGODB_URI)
SHOTS=/tmp/shots npx playwright test visual-tour  # optional screenshot tour, light + dark

cd ../ingest && .venv/bin/python -m pytest -q tests
```

What changed in the latest round of fixes and features, with migrations, settings and how to test each item: **[CHANGES.md](CHANGES.md)**.

Optional campus admin for testing:

```bash
cd server && npm run admin:create -- --email admin@college.test --name "Placement Cell" --password '<strong password>' --college "KIET Group of Institutions"
```

## Android app

**Easiest:** push to GitHub. The **CI** workflow builds a debug APK and attaches it to the run as the `sarthiai-android-debug-apk` artifact. To bake in your hosted API, set the repository variable `SARTHI_API_URL` (Settings ▸ Secrets and variables ▸ Actions ▸ Variables) to your server URL, e.g. `https://sarthiai.example.com`.

**Locally** (Android Studio with SDK 36, JDK 21):

```bash
cd web
VITE_API_BASE_URL=https://your-server npm run android:sync   # builds web + copies into android/
npm run android:open                                          # opens Android Studio → Run
```

For a local dev server, build with `CAP_ALLOW_HTTP=1 VITE_DEV_SERVER_SETTING=1` and use `http://10.0.2.2:4000` (the emulator's address for your computer). Only builds made with `VITE_DEV_SERVER_SETTING=1` (and `vite dev`) offer **Profile ▸ Developer · server**; production builds always use their own server.

Release build: create a keystore, then **Build ▸ Generate Signed App Bundle** in Android Studio (or `./gradlew bundleRelease` with signing config) for the Play Store.

## Deploy (browser + API)

**Step-by-step guide: [DEPLOY.md](DEPLOY.md)** (MongoDB Atlas + Render Blueprint + Android APK).


The `Dockerfile` builds the web app and runs the API, which serves it. It works on Render, Railway, Fly.io or any container host:

1. Create a MongoDB Atlas cluster.
2. Set `MONGODB_URI`, `JWT_SECRET`, `NODE_ENV=production`, `TRUST_PROXY=1`, and optionally `GEMINI_API_KEY`.
3. Deploy the container, then run `npm run seed` once (from `server/`).
4. The daily refresh of official sources runs at 03:00 IST in production (`ENABLE_DAILY_REFRESH`).

Point the Android app at the same HTTPS URL (`SARTHI_API_URL`).

## API additions

| Endpoint | Purpose |
|---|---|
| `GET /api/opportunities?q=…` | Ranked synonym/typo-aware search. Each item has `searchMatch`; `meta.search` has `relaxed`, `terms`, `closedMatches` |
| `GET /api/matches?tier=all&limit=30` | Recommended + labelled "possible" tier (`item.tier`), up to 30 |
| `GET /api/me/plan` | **Gap-to-plan**: skills ranked by how many open opportunities they unlock, quick profile wins, experience gaps, and a dated 90-day plan (no AI; effort figures labelled estimates) |
| `POST /api/me/plan/roadmap` | Adds the plan's steps to the active roadmap (never removes existing milestones) |
| `POST /api/ai/quick` `{ message }` | Deterministic quick answers (no LLM, always available) |
| `POST /api/ai/chat` | Response now includes `grounding: { status, unverifiedClaims }` |
| `GET /api/ai/status` | Includes `quickAnswers: true` |

All other endpoints are unchanged from neviq.
