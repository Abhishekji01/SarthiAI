# SarthiAI ingest — daily refresh from official sources

Python scrapers collect scholarships, internships and entry-level tech jobs from official sources; the Node server merges them into MongoDB.

**Daily snapshot:** the `Refresh data` GitHub Actions workflow runs these scrapers every day at 03:07 IST and commits `server/data/scraped/records.json`; `npm run seed` loads it. The run's summary page shows what each source returned.

## Setup (once)
```bash
cd ingest
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

## Run
```bash
.venv/bin/python run.py          # scrape only → out/records.json (nothing touches the database)
cd ../server && npm run refresh  # scrape + merge into MongoDB + retire vanished + link check
```
Automatic: the API server runs the refresh daily at 03:00 IST when `ENABLE_DAILY_REFRESH=true`
(default **true in production**, and on in `npm run dev:memory`). `REFRESH_ON_START=true` also runs it at boot.
Alternative: system cron → `0 3 * * * cd /path/to/server && node scripts/daily-refresh.js`.
Each run is stored in the `ingestruns` collection (platform admins: `GET /api/admin/ingest-runs`).

## Sources
| id | what | how |
|---|---|---|
| `nsp` | National Scholarship Portal — every college-level scheme (≈27) | Public HTML page (names, ministry, windows, guideline links) + guideline PDFs parsed with pdfplumber |
| `nicsi` | NICSI internship programme | Public page (batch status) + notification/scheme PDFs |
| `isro` | ISRO student internships (via centres) | Public programme page |
| `ias` | Science Academies SRFP | Refreshes the deadline of the curated record only |
| `ats` | **Internships & fresher jobs (tech)** from employers' own job boards: Greenhouse, Lever and Ashby public job-board APIs (boards listed in `companies.json`) | Only India-located tech roles that are internships or entry-level (senior titles and "3+ years" postings are dropped). Skills, degree and graduation batch are read from the posting; a "meets the posting's qualifications" check always needs the student's confirmation. No deadlines are invented — postings are open until the employer removes them. |
| `discover_boards.py` | Weekly: which employer job boards have India postings | Checks ~11,300 Greenhouse/Lever/Ashby boards (candidates in `board_candidates.csv`, from the MIT-licensed [open-ats-feed](https://github.com/veresk06/open-ats-feed) by veresk06) plus `companies.json`; writes `boards_india.json`, which `ats` reads daily. |
| `aicte_internships` | AICTE National Internship Portal | **Not scraped.** Listings load only from `/api/`, which its robots.txt disallows. Re-checked every run. |

NCS (ncs.gov.in) is a JavaScript app with no static listings and is not scraped. Adding it needs permission or an official feed.

## Rules the scrapers follow
- `robots.txt` is honoured with longest-match semantics (`common.Robots`); 1 request/second/host; identifiable User-Agent; PDFs cached 3–7 days.
- No CAPTCHA/login bypass. School-level schemes (pre-matric, NMMS) are skipped.
- Only quoted facts are stored: income ceilings with the source sentence, amounts as quoted text (never as a number), objective/eligibility prose (table-of-contents text is rejected). Anything uncertain stays unknown.
- Group- or field-restricted schemes (girl students, SC/ST/OBC, disability, agriculture…) get a `restrictsAudience` criterion and are **never recommended** automatically.
- Every auto-ingested scheme has a mandatory "You meet every eligibility condition in the official guidelines" criterion, so it can never read as "all criteria met".

## Merge policy (server/src/ingestion/importer.js)
- New `externalId` → inserted. Auto-ingested record → fully refreshed.
- Hand-verified/admin record → **only dates and status** refreshed (`datesRefreshedAt`), never rules or amounts.
- A listing missing from its source is flagged `needs_review` (not deleted) — unless the source returned < 50% of what we hold (assumed layout change).

## Known limits
- If NSP or a PDF changes layout, parsing degrades to "dates only"; check `ingestruns` for `partial`/`error`.
- NSP still links older guideline PDFs for some schemes; quoted text may predate 2026-27.
- Board names in `companies.json` are best guesses until a run confirms them — the run report lists boards that were not found; fix or remove them.
- Aggregators such as Internshala and Unstop are not scraped (their terms prohibit it). AICTE/NCS need permission or an official feed.
