"""Finds which employer job boards have postings in India.

Candidates: ingest/board_candidates.csv (Greenhouse/Lever/Ashby board tokens with open
postings, from the MIT-licensed open-ats-feed project: github.com/veresk06/open-ats-feed)
plus ingest/companies.json. Each board is checked once through the same public job-board
APIs that ats_jobs.py reads; boards with at least one India-located posting are written to
ingest/boards_india.json, which the daily refresh then reads.

    python discover_boards.py [--minutes 170]

Polite: two requests per second per provider host (providers run in parallel), robots.txt
honoured, identifiable User-Agent. Run weekly — the refresh workflow does this automatically.
"""
from __future__ import annotations

import argparse
import csv
import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import requests

from ats_jobs import COMPANIES, is_india
from common import Fetcher

HERE = Path(__file__).parent
URLS = {
    "greenhouse": "https://boards-api.greenhouse.io/v1/boards/{t}/jobs",
    "lever": "https://api.lever.co/v0/postings/{t}?mode=json",
    "ashby": "https://api.ashbyhq.com/posting-api/job-board/{t}",
}


def locations(ats: str, data) -> list[str]:
    if ats == "greenhouse":
        return [(j.get("location") or {}).get("name", "") for j in data.get("jobs", [])]
    if ats == "lever":
        return [" ".join([(j.get("categories") or {}).get("location") or "", *((j.get("categories") or {}).get("allLocations") or []),
                          "India" if (j.get("country") or "").upper() == "IN" else ""]) for j in data]
    return [" / ".join([j.get("location") or "", *[s.get("location", "") for s in j.get("secondaryLocations") or []]]) for j in data.get("jobs", [])]


def scan(ats: str, tokens: list[str], deadline: float):
    fetcher = Fetcher(min_interval=0.5)  # 2 requests/second to each provider's public API
    found, checked, failed = [], 0, 0
    for t in tokens:
        if time.time() > deadline:
            break
        checked += 1
        try:
            data = json.loads(fetcher.get(URLS[ats].format(t=t)))
        except (requests.RequestException, ValueError):
            failed += 1
            continue
        except Exception:  # noqa: BLE001 - robots block or anything unexpected: skip this board
            failed += 1
            continue
        india = sum(1 for loc in locations(ats, data) if is_india(loc))
        if india:
            found.append({"token": t, "india": india})
    return ats, found, checked, failed, len(tokens)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--minutes", type=float, default=170)
    args = ap.parse_args()
    deadline = time.time() + args.minutes * 60
    cands: dict[str, list[str]] = {a: [] for a in URLS}
    with open(HERE / "board_candidates.csv") as f:
        for r in csv.DictReader(f):
            if r["provider"] in cands:
                cands[r["provider"]].append(r["token"])
    for ats, toks in COMPANIES.items():
        if ats in cands:
            cands[ats] = list(dict.fromkeys(toks + cands[ats]))  # hand-picked first
    with ThreadPoolExecutor(max_workers=len(cands)) as pool:
        results = list(pool.map(lambda kv: scan(kv[0], kv[1], deadline), cands.items()))
    out = {"generatedAt": datetime.now(timezone.utc).isoformat(), "boards": {}, "stats": {}}
    for ats, found, checked, failed, total in results:
        out["boards"][ats] = sorted(found, key=lambda x: -x["india"])
        out["stats"][ats] = {"candidates": total, "checked": checked, "failed": failed, "withIndiaPostings": len(found),
                             "indiaPostings": sum(x["india"] for x in found)}
        print(f"{ats:10} checked {checked}/{total} (failed {failed}) -> {len(found)} boards with {sum(x['india'] for x in found)} India postings")
    (HERE / "boards_india.json").write_text(json.dumps(out, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
