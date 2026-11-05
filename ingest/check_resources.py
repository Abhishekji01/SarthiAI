"""Link-checks candidate learning resources; only pages that load are published as verified.

Reads server/data/resource-candidates.json, fetches each URL (robots.txt honoured, identifiable
User-Agent) and writes the ones that answered HTTP 200 to server/data/resources-verified.json
with the check date. `npm run seed` loads that file. A page that fails is simply not published.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from common import Fetcher

DATA = Path(__file__).resolve().parent.parent / "server" / "data"


def main() -> int:
    cands = json.loads((DATA / "resource-candidates.json").read_text())["records"]
    f = Fetcher()
    now = datetime.now(timezone.utc).isoformat()
    ok, failed = [], []
    for r in cands:
        try:
            f.get(r["url"])
            ok.append({**r, "checkedAt": now})
        except Exception as e:  # noqa: BLE001 - not published, reported below
            failed.append(f"{r['url']} ({type(e).__name__})")
    (DATA / "resources-verified.json").write_text(json.dumps({"checkedAt": now, "records": ok}, indent=2, ensure_ascii=False))
    print(f"resources: {len(ok)}/{len(cands)} verified" + (f"; failed: {', '.join(failed)}" if failed else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
