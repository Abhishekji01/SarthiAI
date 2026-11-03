# Scraped snapshot

`records.json` is written by the **Refresh data** GitHub Actions workflow (`.github/workflows/refresh-data.yml`),
which runs `ingest/run.py` daily on GitHub's runners and commits the result here.

`npm run seed` merges it into MongoDB, so a new deployment starts with real data. A running server also
refreshes on its own every day at 03:00 IST (`ENABLE_DAILY_REFRESH`).

Sources and rules: see `ingest/README.md`. `sources` in the JSON reports what each adapter found.
