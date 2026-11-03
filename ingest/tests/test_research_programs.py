"""Offline tests for research_programs.py with page text in the styles official pages use."""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import research_programs as R  # noqa: E402
from common import Blocked  # noqa: E402

NOW = datetime(2026, 11, 3, tzinfo=timezone.utc)
P = R.PROGRAMS[0]


def page(body, meta=""):
    return f"<html><head><meta name='description' content='{meta}'></head><body><nav>Home | Last date 1 Jan 2020</nav>{body}</body></html>"


def test_open_cycle_quotes_the_deadline_sentence():
    rec = R.build(P, page("<h2>SURGE 2027</h2><p>Applications are invited for SURGE 2027.</p>"
                          "<p>Last date for submission of online application: 15th January 2027.</p>"
                          "<p>The programme runs from 15 May 2027 to 15 July 2027.</p>", "Summer research at IIT Kanpur"), NOW)
    assert rec["declaredStatus"] == "open"
    assert rec["deadline"].startswith("2027-01-15T23:59")
    assert "15th January 2027" in rec["deadlineNote"]           # quoted, not paraphrased
    assert rec["officialDescription"] == "Summer research at IIT Kanpur"
    assert rec["location"] == {"city": "Kanpur", "state": "Uttar Pradesh", "country": "India", "isNationwide": False}


def test_dates_not_tied_to_a_deadline_word_are_ignored():
    rec = R.build(P, page("<p>The programme runs from 15 May 2027 to 15 July 2027.</p>"), NOW)
    assert rec["deadline"] is None and rec["declaredStatus"] == "unknown"
    assert "not announced" in rec["deadlineNote"]


def test_last_cycle_page_is_not_shown_as_open():
    rec = R.build(P, page("<p>Last date to apply: 10 January 2026.</p>"), NOW)    # previous cycle, >200 days ago
    assert rec["declaredStatus"] == "unknown" and rec["deadline"] is None
    rec = R.build(P, page("<p>Applications closed. Deadline was 30 September 2026.</p>"), NOW)
    assert rec["declaredStatus"] == "closed"


def test_announced_opening_date_makes_it_upcoming():
    rec = R.build(P, page("<p>The application portal will open on December 1, 2026.</p>"), NOW)
    assert rec["declaredStatus"] == "upcoming" and rec["applicationOpensAt"].startswith("2026-12-01")
    rec = R.build(P, page("<p>Portal opens on 01/12/2026. Last date: 31/01/2027</p>"), NOW)
    assert rec["applicationOpensAt"].startswith("2026-12-01") and rec["deadline"].startswith("2027-01-31")


def test_run_reports_unreachable_and_blocked_pages():
    class F:
        def get(self, url, **_):
            if "surge" in url:
                return page("<p>Last date: 15 January 2027</p>")
            if "spark" in url:
                raise Blocked("robots")
            raise ValueError("404")
    recs, msg = R.run(F(), NOW)
    assert len(recs) == 1 and "iitk-surge=open until 2027-01-15" in msg and "iitr-spark=robots" in msg and "iitm-sfp=unreachable" in msg


if __name__ == "__main__":
    import json
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
    sample = [R.build(P, page("<p>Last date for submission: 15th January 2027.</p>", "Summer research at IIT Kanpur"), NOW),
              R.build(R.PROGRAMS[8], page("<p>Dates to be announced.</p>"), NOW)]
    Path("/tmp/claude-0/research_sample.json").write_text(json.dumps(sample))
    print("ok")


def test_scholarship_pages_mark_group_restrictions_and_quote_dates():
    import scholarship_pages as S

    class F:
        def get(self, url, **_):
            if "kotak" in url:
                return page("<p>Kotak Kanya Scholarship 2026-27. Last date to apply: 30th November 2026.</p>")
            if "reliance" in url:
                return page("<p>Applications for 2026-27 will open on 1 December 2026.</p>")
            raise ValueError("404")
    recs, msg = S.run(F(), NOW)
    by = {r["externalId"]: r for r in recs}
    k = by["scholarship:kotak-kanya"]
    assert k["opportunityType"] == "scholarship" and k["declaredStatus"] == "open" and "30th November 2026" in k["deadlineNote"]
    assert k["eligibilityRules"][0] == {**k["eligibilityRules"][0], "key": "audience", "restrictsAudience": True, "mandatory": True}
    assert k["eligibilityRules"][0]["label"] == "Girl students"
    r = by["scholarship:reliance-ug"]
    assert r["declaredStatus"] == "upcoming" and not any(x["key"] == "audience" for x in r["eligibilityRules"])
    assert r["location"] == {"country": "India", "isNationwide": True} and r["award"] is None  # amounts are never hard-coded
    assert "aditya-birla=unreachable" in msg
