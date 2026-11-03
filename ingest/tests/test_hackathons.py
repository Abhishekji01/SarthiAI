"""Offline tests for hackathons.py with sample payloads in each platform's format."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import hackathons  # noqa: E402
from common import Blocked  # noqa: E402

NOW = datetime(2026, 11, 3, tzinfo=timezone.utc)
FUTURE_MS = int(datetime(2026, 12, 10, tzinfo=timezone.utc).timestamp() * 1000)
PAST_MS = int(datetime(2026, 10, 1, tzinfo=timezone.utc).timestamp() * 1000)

DEVFOLIO = {"hits": {"hits": [
    {"_source": {"name": "HackIndia Delhi", "slug": "hackindia-delhi", "is_online": False, "city": "New Delhi", "country": "India",
                 "starts_at": "2026-12-12T04:30:00Z", "ends_at": "2026-12-13T12:00:00Z", "desc": "<p>36-hour hackathon</p>",
                 "hackathon_setting": {"reg_ends_at": "2026-12-05T18:29:00Z"}, "themes": [{"name": "AI"}, {"name": "Web3"}],
                 "prizes": [{"name": "Winner: ₹1,00,000"}]}},
    {"_source": {"name": "Berlin Hacks", "slug": "berlin", "is_online": False, "city": "Berlin", "country": "Germany",
                 "ends_at": "2026-12-20T00:00:00Z"}},
    {"_source": {"name": "Old Online Hack", "slug": "old", "is_online": True, "ends_at": "2026-10-01T00:00:00Z"}},
]}}
DEVPOST = {"hackathons": [
    {"id": 1, "title": "Global AI Hackathon", "url": "https://ai.devpost.com/", "displayed_location": {"location": "Online"},
     "submission_period_dates": "Oct 20 - Dec 15, 2026", "prize_amount": "$<span data-currency-value>10,000</span>",
     "themes": [{"name": "Machine Learning/AI"}], "organization_name": "Acme", "invite_only": False},
    {"id": 2, "title": "SF Hack", "url": "https://sf.devpost.com/", "displayed_location": {"location": "San Francisco, CA"},
     "submission_period_dates": "Nov 01 - 30, 2026", "invite_only": False},
    {"id": 3, "title": "Private", "url": "https://p.devpost.com/", "displayed_location": {"location": "Online"}, "invite_only": True},
    {"id": 4, "title": "2026 UXC NYU Fall Design-a-thon", "url": "https://nyu.devpost.com/", "displayed_location": {"location": "Online"}, "submission_period_dates": "Nov 01 - 30, 2026"},
    {"id": 5, "title": "IIT Bombay Techfest Online Hack", "organization_name": "IIT Bombay", "url": "https://iitb.devpost.com/", "displayed_location": {"location": "Online"}, "submission_period_dates": "Nov 01 - 30, 2026"},
]}
HACKEREARTH = {"response": [
    {"title": "Fresher Hiring Challenge", "url": "https://www.hackerearth.com/challenges/hiring/x/", "challenge_type": "hiring",
     "start_utc_tz": "2026-11-05T05:30:00+00:00", "end_utc_tz": "2026-11-20T18:29:00+00:00", "description": "For 2026 graduates"},
    {"title": "Past Hackathon", "url": "https://h/old", "challenge_type": "hackathon", "end_utc_tz": "2026-10-01T00:00:00+00:00"},
]}
CODEFORCES = {"status": "OK", "result": [
    {"id": 2100, "name": "Codeforces Round 1000 (Div. 2)", "type": "CF", "phase": "BEFORE", "durationSeconds": 7200, "startTimeSeconds": FUTURE_MS // 1000},
    {"id": 1999, "name": "Old Round", "phase": "FINISHED", "startTimeSeconds": PAST_MS // 1000},
]}
CODECHEF = {"future_contests": [{"contest_code": "START200", "contest_name": "Starters 200", "contest_start_date_iso": "2026-11-12T20:00:00+05:30",
                                 "contest_end_date_iso": "2026-11-12T22:00:00+05:30"}]}
MLH_HTML_2026 = """<a class="block rounded-card" href="https://events.mlh.com/events/15200-solana-hackathon?utm_source=mlh&amp;utm_medium=referral"
  itemscope itemtype="https://schema.org/Event" target="_blank">
  <meta content="https://events.mlh.com/events/15200-solana-hackathon" itemprop="url"/>
  <meta content="https://schema.org/OnlineEventAttendanceMode" itemprop="eventAttendanceMode"/>
  <h3 itemprop="name">Solana Hackathon</h3><meta itemprop="startDate" content="2026-11-20"><meta itemprop="endDate" content="2026-11-22"></a>
<a class="block rounded-card" href="https://hackprix.example/?utm_source=mlh" itemscope itemtype="https://schema.org/Event">
  <meta content="https://hackprix.example/" itemprop="url"/>
  <meta content="https://schema.org/OfflineEventAttendanceMode" itemprop="eventAttendanceMode"/>
  <h3 itemprop="name">HackPrix Season 3</h3><meta itemprop="startDate" content="2026-12-01"><meta itemprop="endDate" content="2026-12-02">
  <span itemprop="addressLocality">Toronto</span></a>"""
MLH_HTML = """<div class="event" itemscope itemtype="http://schema.org/Event">
  <a href="https://hackwithindia.mlh.io"><h3 itemprop="name">Hack With India</h3></a>
  <meta itemprop="startDate" content="2026-12-01"><meta itemprop="endDate" content="2026-12-03">
  <span itemprop="addressLocality">Bengaluru</span><span itemprop="addressRegion">KA</span><div>In-Person Only</div></div>
<div class="event" itemscope itemtype="http://schema.org/Event">
  <a href="https://nyc.mlh.io"><h3 itemprop="name">NYC Hacks</h3></a>
  <meta itemprop="startDate" content="2026-12-01"><meta itemprop="endDate" content="2026-12-03">
  <span itemprop="addressLocality">New York</span><span itemprop="addressRegion">NY</span><div>In-Person Only</div></div>"""


class F:
    def __init__(self, blocked=()):
        self.blocked = blocked

    def get(self, url, **_):
        if any(b in url for b in self.blocked):
            raise Blocked(f"robots.txt disallows {url}")
        if "devpost" in url:
            return json.dumps(DEVPOST if "page=1" in url else {"hackathons": []})
        if "hackerearth" in url:
            return json.dumps(HACKEREARTH)
        if "codeforces" in url:
            return json.dumps(CODEFORCES)
        if "codechef" in url:
            return json.dumps(CODECHEF)
        if "mlh.io/seasons/2027" in url:
            return getattr(self, "mlh_html", MLH_HTML)
        raise ValueError("404")

    def post_json(self, url, body):
        return DEVFOLIO if body["type"] == "application_open" else {"hits": {"hits": []}}


def test_each_platform_keeps_only_open_india_or_online_events():
    f = F()
    dv = hackathons.devfolio(f, NOW)
    assert [r["title"] for r in dv] == ["HackIndia Delhi"]
    r = dv[0]
    assert r["deadline"] == "2026-12-05T18:29:00+00:00" and "Registration deadline" in r["deadlineNote"]
    assert r["location"]["city"] == "New Delhi" and r["workMode"] == "onsite"
    assert "Winner" in r["award"]["description"] and {"ai", "web3", "hackathon"} <= set(r["tags"])
    dp = hackathons.devpost(f, NOW)
    assert [x["title"] for x in dp] == ["Global AI Hackathon", "IIT Bombay Techfest Online Hack"]  # NYU-only event dropped
    assert dp[0]["deadline"].startswith("2026-12-15") and dp[0]["workMode"] == "remote" and "$10,000" in dp[0]["award"]["description"]
    he = hackathons.hackerearth(f, NOW)
    assert [(x["title"], x["opportunityType"]) for x in he] == [("Fresher Hiring Challenge", "competition")]
    cf = hackathons.codeforces(f, NOW)
    assert [x["title"] for x in cf] == ["Codeforces Round 1000 (Div. 2)"] and "start" in cf[0]["deadlineNote"].lower()
    cc = hackathons.codechef(f, NOW)
    assert cc[0]["url" if "url" in cc[0] else "sourceUrl"] == "https://www.codechef.com/START200"
    ml = hackathons.mlh(f, NOW)
    assert [x["title"] for x in ml] == ["Hack With India"]
    for rec in dv + dp + he + cf + cc + ml:
        assert rec["externalId"].startswith("hack:") and rec["declaredStatus"] == "open"
        assert rec["eligibilityRules"][0]["kind"] == "self_declared"
        assert "None" not in json.dumps(rec["location"])


def test_run_reports_blocked_and_changed_sources_without_failing():
    recs, msg = hackathons.run(F(blocked=("devpost",)), NOW)
    assert "devpost=skipped (robots.txt" in msg and "devfolio=1" in msg and "hackerearth=1 [received 2 events" in msg
    assert len(recs) == 1 + 1 + 1 + 1 + 1  # devfolio, hackerearth, mlh, codeforces, codechef

    class Changed(F):
        def post_json(self, url, body):
            return {"data": []}
    _, msg = hackathons.run(Changed(), NOW)
    assert "devfolio=format changed" in msg


if __name__ == "__main__":
    test_each_platform_keeps_only_open_india_or_online_events()
    test_run_reports_blocked_and_changed_sources_without_failing()
    f = F()
    sample = hackathons.devfolio(f, NOW) + hackathons.devpost(f, NOW) + hackathons.hackerearth(f, NOW) + hackathons.codeforces(f, NOW)
    Path("/tmp/claude-0/hack_sample.json").write_text(json.dumps(sample, ensure_ascii=False))
    print("ok", len(sample))


def test_mlh_2026_markup_card_is_the_link():
    f = F()
    f.mlh_html = MLH_HTML_2026
    ml = hackathons.mlh(f, NOW)
    assert [(x["title"], x["sourceUrl"], x["workMode"]) for x in ml] == [("Solana Hackathon", "https://events.mlh.com/events/15200-solana-hackathon", "remote")]
