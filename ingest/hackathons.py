"""Hackathons and coding contests for tech students.

Sources (each checked against robots.txt by the Fetcher; a disallowed or changed source is
skipped and reported in the run log, never worked around):
  - Devfolio      India's main student-hackathon platform (public search API used by devfolio.co)
  - Devpost       global hackathons; kept when online or in India and not invite-only
  - HackerEarth   hackathons and hiring challenges (public events feed)
  - MLH           Major League Hacking season events (online or in India)
  - Codeforces    upcoming rated contests (documented public API)
  - CodeChef      upcoming contests (public contest list)
Unstop is not used: its terms prohibit scraping.

Every record links to the event's own page. Dates come from the source; registration
deadlines are only set when the source states them (otherwise the event's end/start).
"""
from __future__ import annotations

import html as htmllib
import json
import re
from datetime import datetime, timezone
from typing import Callable

from bs4 import BeautifulSoup

from common import Blocked, Fetcher, clean, slug

SOURCE_ID = "hack"
MAX_PER_PLATFORM = 60
INDIA_RX = re.compile(r"\b(india|bengaluru|bangalore|mumbai|pune|hyderabad|chennai|delhi|gurgaon|gurugram|noida|kolkata|ahmedabad|jaipur|kochi|"
                      r"indore|chandigarh|bhubaneswar|lucknow|nagpur|coimbatore|vellore|manipal|kharagpur|roorkee|kanpur|guwahati|surat|vadodara|"
                      r"trichy|tiruchirappalli|warangal|bhopal|patna|ranchi|dehradun|mysuru|mysore|mangalore|thiruvananthapuram|trivandrum|goa)\b", re.I)


NOTES: dict[str, str] = {}  # per-platform diagnostics for the run report (received vs kept)

# Online events limited to one institution's students ("NYU ...", "HHS ...", "... University Hackathon").
SINGLE_INSTITUTION_RX = re.compile(r"\b(university|college|school|institute|nyu|mit|ucla|ucsd|uc berkeley|stanford|harvard|hhs|high school)\b", re.I)


class ShapeChanged(Exception):
    """The source answered, but not in the format this adapter understands."""


def _iso(v) -> str | None:
    """Epoch seconds/ms or ISO string -> ISO 8601 (UTC) string."""
    if v in (None, "", 0):
        return None
    try:
        if isinstance(v, (int, float)) or (isinstance(v, str) and v.isdigit()):
            n = float(v)
            return datetime.fromtimestamp(n / 1000 if n > 1e11 else n, tz=timezone.utc).isoformat()
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).isoformat()
    except (ValueError, OverflowError, OSError):
        return None


def _text(s: str | None, sep: str = " ") -> str:
    if not s:
        return ""
    return clean(BeautifulSoup(htmllib.unescape(s), "lxml").get_text(sep))


def _future(iso: str | None, now: datetime) -> bool:
    return bool(iso) and datetime.fromisoformat(iso) > now


def record(*, platform: str, key: str, title: str, organizer: str, url: str, kind: str, now: datetime,
           starts: str | None, ends: str | None, deadline: str | None, online: bool | None, city: str | None = None,
           country: str | None = None, description: str = "", themes: list[str] | None = None, prize: str | None = None,
           apply_url: str | None = None, eligibility: str | None = None, deadline_is: str = "end") -> dict:
    where = "Online" if online else ", ".join(x for x in [city, country] if x) or None
    when = " → ".join(x for x in [starts and starts[:10], ends and ends[:10]] if x)
    deadline_note = {
        "registration": "Registration deadline stated by the organiser.",
        "start": "Register before the contest starts.",
        "end": "Event end date — registration may close earlier; check the event page.",
    }[deadline_is]
    rules = [{
        "key": "event_rules", "kind": "self_declared", "mandatory": True,
        "label": "You meet the event's eligibility rules (team size, student status, region)",
        "note": (eligibility[:400] if eligibility else "SarthiAI does not read every rule of an event automatically. Check the event page."),
    }]
    themes = [t for t in (themes or []) if t][:12]
    tags = [kind, "tech", platform] + (["online"] if online else ["in-person"]) + [slug(t)[:40] for t in themes]
    rec = {
        "externalId": f"{SOURCE_ID}:{platform}:{slug(key)}"[:300],
        "title": clean(title)[:200],
        "organization": (clean(organizer) or platform.title())[:160],
        "opportunityType": kind,
        "officialDescription": (description[:3500] + (f"\n\nWhen: {when}" if when else "")).strip() or None,
        "sourceUrl": url,
        "applicationUrl": apply_url or url,
        "additionalSources": [],
        "sourceType": "official_org_site",
        "verificationStatus": "verified",
        "lastVerifiedAt": now.isoformat(),
        "verifiedBy": f"naviq-ingest:{SOURCE_ID}:{platform}",
        "verificationNotes": f"Read from {platform.title()} on {now.date()}. Dates and prizes as published by the organiser on that page.",
        "declaredStatus": "open",  # listed events accept registrations/submissions until the deadline
        "applicationOpensAt": None,
        "deadline": deadline,
        "deadlineNote": deadline_note,
        "eligibleDegrees": [], "eligibleYears": [], "eligibleBranches": [],
        "requiredSkills": [], "preferredSkills": [],
        "location": {"city": city, "country": country or ("India" if city else None), "isNationwide": bool(online),
                     "description": (where or "")[:200] or None},
        "workMode": "remote" if online else "onsite" if online is False else "unknown",
        "award": {"amount": None, "currency": "INR", "period": None, "description": prize[:500]} if prize else None,
        "stipend": None,
        "duration": when[:120] or None,
        "eligibilityRules": rules,
        "requiredDocuments": [],
        "tags": list(dict.fromkeys(t.lower() for t in tags if t))[:20],
        "status": "published",
    }
    return _prune(rec)


def _prune(v):
    if isinstance(v, dict):
        return {k: _prune(x) for k, x in v.items() if x is not None or k in ("deadline", "applicationOpensAt", "award", "stipend")}
    if isinstance(v, list):
        return [_prune(x) for x in v]
    return v


# ---------------------------------------------------------------------------- Devfolio

def devfolio(f: Fetcher, now: datetime) -> list[dict]:
    hits = []
    for status in ("application_open", "upcoming"):
        data = f.post_json("https://api.devfolio.co/api/search/hackathons", {"type": status, "from": 0, "size": 50})
        h = (data.get("hits") or {}).get("hits") if isinstance(data, dict) else None
        if h is None:
            raise ShapeChanged(f"devfolio: keys {list(data)[:8] if isinstance(data, dict) else type(data).__name__}")
        hits += [x.get("_source") or x for x in h]
    out, seen = [], set()
    for d in hits:
        name, sl = d.get("name"), d.get("slug") or d.get("subdomain")
        if not name or not sl or sl in seen:
            continue
        seen.add(sl)
        st = d.get("hackathon_setting") or d.get("settings") or {}
        online = d.get("is_online")
        if online is None and d.get("type"):
            online = str(d["type"]).lower() == "online"
        city, country = d.get("city"), d.get("country")
        loc = " ".join(str(x) for x in [d.get("location"), city, country] if x)
        if online is False and loc and not INDIA_RX.search(loc):
            continue
        reg_end = _iso(st.get("reg_ends_at") or d.get("reg_ends_at") or d.get("application_ends_at"))
        starts, ends = _iso(d.get("starts_at")), _iso(d.get("ends_at"))
        deadline = reg_end or ends
        if deadline and not _future(deadline, now):
            continue
        site = st.get("site") or f"https://{sl}.devfolio.co"
        themes = [t.get("name") if isinstance(t, dict) else t for t in (d.get("themes") or [])]
        prizes = d.get("prizes") or []
        prize = None
        if isinstance(prizes, list) and prizes:
            total = [p.get("amount") or p.get("value") for p in prizes if isinstance(p, dict)]
            names = [clean(str(p.get("name") or p.get("title") or "")) for p in prizes[:4] if isinstance(p, dict)]
            prize = "; ".join(n for n in names if n) or (f"Prize pool: {sum(x for x in total if isinstance(x, (int, float)))}" if any(total) else None)
        out.append(record(platform="devfolio", key=sl, title=name, organizer=clean(d.get("organization_name") or name), url=f"https://{sl}.devfolio.co/",
                          apply_url=site if str(site).startswith("http") else None, kind="hackathon", now=now, starts=starts, ends=ends,
                          deadline=deadline, deadline_is="registration" if reg_end else "end", online=online, city=city,
                          country=country if city else (country or ("India" if online is False else None)),
                          description=_text(d.get("desc") or d.get("tagline") or ""), themes=themes, prize=prize))
    return out


# ---------------------------------------------------------------------------- Devpost

def devpost(f: Fetcher, now: datetime) -> list[dict]:
    out = []
    for page in range(1, 6):
        data = json.loads(f.get(f"https://devpost.com/api/hackathons?status[]=open&status[]=upcoming&page={page}"))
        items = data.get("hackathons") if isinstance(data, dict) else None
        if items is None:
            raise ShapeChanged(f"devpost: keys {list(data)[:8] if isinstance(data, dict) else type(data).__name__}")
        if not items:
            break
        for h in items:
            if h.get("invite_only"):
                continue
            loc = (h.get("displayed_location") or {}).get("location") or ""
            online = loc.strip().lower() == "online"
            if not online and not INDIA_RX.search(loc):
                continue
            # An online event named after a non-Indian school/university is usually for its own students.
            if online and SINGLE_INSTITUTION_RX.search(h.get("title", "") + " " + (h.get("organization_name") or "")) and not INDIA_RX.search(h.get("title", "") + " " + (h.get("organization_name") or "")):
                continue
            dates = clean(h.get("submission_period_dates") or "")
            ends = _devpost_end(dates)
            prize = _text(h.get("prize_amount") or "", sep="")  # "$<span>10,000</span>" -> "$10,000"
            out.append(record(platform="devpost", key=str(h.get("id") or h.get("url")), title=h.get("title", ""), organizer=h.get("organization_name") or "",
                              url=h.get("url"), kind="hackathon", now=now, starts=None, ends=ends, deadline=ends, deadline_is="end", online=online,
                              city=None if online else loc.split(",")[0].strip(), country=None if online else "India",
                              description=f"Submission period: {dates}." if dates else "",
                              themes=[t.get("name") for t in h.get("themes") or [] if isinstance(t, dict)],
                              prize=f"Prizes: {prize}" if prize and prize not in ("0", "$0") else None))
        if len(out) >= MAX_PER_PLATFORM:
            break
    return out


def _devpost_end(dates: str) -> str | None:
    """'Oct 01 - Nov 30, 2026' / 'Nov 01 - 30, 2026' -> end of last day (UTC)."""
    m = re.search(r"(?:([A-Z][a-z]{2})\s+)?(\d{1,2}),\s*(\d{4})\s*$", dates)
    if not m:
        return None
    month = m.group(1) or (re.match(r"([A-Z][a-z]{2})", dates).group(1) if re.match(r"([A-Z][a-z]{2})", dates) else None)
    try:
        d = datetime.strptime(f"{month} {m.group(2)} {m.group(3)} 23:59", "%b %d %Y %H:%M").replace(tzinfo=timezone.utc)
        return d.isoformat()
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------- HackerEarth

def hackerearth(f: Fetcher, now: datetime) -> list[dict]:
    data = json.loads(f.get("https://www.hackerearth.com/chrome-extension/events/"))
    items = data.get("response") if isinstance(data, dict) else None
    if items is None:
        raise ShapeChanged(f"hackerearth: keys {list(data)[:8] if isinstance(data, dict) else type(data).__name__}")
    out = []
    types = {}
    for e in items:
        types[str(e.get("challenge_type"))] = types.get(str(e.get("challenge_type")), 0) + 1
    NOTES["hackerearth"] = f"received {len(items)} events, types {types}"
    for e in items:
        ctype = str(e.get("challenge_type") or "").lower()
        if ctype not in ("hackathon", "competitive", "hiring"):
            continue
        ends = _iso(e.get("end_utc_tz") or e.get("end_tz"))
        starts = _iso(e.get("start_utc_tz") or e.get("start_tz"))
        if not ends or not _future(ends, now):
            continue
        kind = "hackathon" if ctype == "hackathon" else "competition"
        out.append(record(platform="hackerearth", key=e.get("url") or e.get("title"), title=e.get("title", ""), organizer=e.get("college") or "HackerEarth",
                          url=e.get("url"), kind=kind, now=now, starts=starts, ends=ends, deadline=ends, deadline_is="end", online=True,
                          description=_text(e.get("description")), themes=["hiring challenge"] if ctype == "hiring" else []))
    return out[:MAX_PER_PLATFORM]


# ---------------------------------------------------------------------------- MLH

def mlh(f: Fetcher, now: datetime) -> list[dict]:
    out = []
    for season in (now.year + 1, now.year):
        try:
            page = f.get(f"https://mlh.io/seasons/{season}/events")
        except Blocked:
            raise
        except Exception:  # noqa: BLE001 - season page may not exist yet
            continue
        soup = BeautifulSoup(page, "lxml")
        events = soup.select('[itemtype*="schema.org/Event"]') or soup.select(".event")
        NOTES["mlh"] = f"season {season}: page {len(page)} bytes, {len(events)} event blocks"
        if not events:
            # Record what the page does contain so the parser can be updated.
            NOTES["mlh"] += f", ld+json blocks {len(soup.select('script[type=\"application/ld+json\"]'))}, __NEXT_DATA__ {bool(soup.select_one('#__NEXT_DATA__'))}"
        for ev in events:
            def prop(name):
                el = ev.select_one(f'[itemprop="{name}"]')
                return (el.get("content") or el.get_text(" ")).strip() if el else None
            name = prop("name") or (ev.select_one("h3") or ev).get_text(" ").strip()
            link = ev.select_one("a[href]")
            url = link["href"] if link else None
            start, end = _iso(prop("startDate")), _iso(prop("endDate"))
            text = ev.get_text(" ").lower()
            online = "digital" in text or "online" in text
            city = prop("addressLocality")
            region = " ".join(x for x in [city, prop("addressRegion"), prop("addressCountry")] if x)
            if not url or not name or not end or not _future(end, now):
                continue
            if not online and not INDIA_RX.search(region):
                continue
            out.append(record(platform="mlh", key=url, title=name, organizer="Major League Hacking", url=url, kind="hackathon", now=now,
                              starts=start, ends=end, deadline=start or end, deadline_is="start" if start else "end", online=online,
                              city=None if online else city, country=None if online else "India",
                              description="Major League Hacking member event."))
        if out:
            break
    return out[:MAX_PER_PLATFORM]


# ---------------------------------------------------------------------------- Codeforces / CodeChef

def codeforces(f: Fetcher, now: datetime) -> list[dict]:
    data = json.loads(f.get("https://codeforces.com/api/contest.list?gym=false"))
    if not isinstance(data, dict) or data.get("status") != "OK":
        raise ShapeChanged(f"codeforces: {str(data)[:120]}")
    out = []
    for c in data.get("result", []):
        if c.get("phase") != "BEFORE":
            continue
        starts = _iso(c.get("startTimeSeconds"))
        ends = _iso((c.get("startTimeSeconds") or 0) + (c.get("durationSeconds") or 0))
        out.append(record(platform="codeforces", key=str(c["id"]), title=c.get("name", ""), organizer="Codeforces",
                          url=f"https://codeforces.com/contests/{c['id']}", kind="competition", now=now, starts=starts, ends=ends,
                          deadline=starts, deadline_is="start", online=True,
                          description=f"Online programming contest ({c.get('type', '')}), {round((c.get('durationSeconds') or 0) / 3600, 1)} hours.",
                          themes=["competitive programming"]))
    return out[:MAX_PER_PLATFORM]


def codechef(f: Fetcher, now: datetime) -> list[dict]:
    data = json.loads(f.get("https://www.codechef.com/api/list/contests/all?sort_by=START&sorting_order=asc&offset=0&mode=all"))
    items = data.get("future_contests") if isinstance(data, dict) else None
    if items is None:
        raise ShapeChanged(f"codechef: keys {list(data)[:8] if isinstance(data, dict) else type(data).__name__}")
    out = []
    for c in items:
        starts = _iso(c.get("contest_start_date_iso"))
        ends = _iso(c.get("contest_end_date_iso"))
        code = c.get("contest_code")
        if not code or not starts:
            continue
        out.append(record(platform="codechef", key=code, title=c.get("contest_name") or code, organizer="CodeChef",
                          url=f"https://www.codechef.com/{code}", kind="competition", now=now, starts=starts, ends=ends,
                          deadline=starts, deadline_is="start", online=True,
                          description="Online programming contest on CodeChef.", themes=["competitive programming"]))
    return out[:MAX_PER_PLATFORM]


PLATFORMS: dict[str, Callable[[Fetcher, datetime], list[dict]]] = {
    "devfolio": devfolio, "devpost": devpost, "hackerearth": hackerearth, "mlh": mlh, "codeforces": codeforces, "codechef": codechef,
}


def run(fetcher: Fetcher, now: datetime):
    records, report = [], []
    for name, fn in PLATFORMS.items():
        try:
            recs = fn(fetcher, now)
            records.extend(recs)
            report.append(f"{name}={len(recs)}" + (f" [{NOTES[name]}]" if name in NOTES else ""))
        except Blocked as e:
            report.append(f"{name}=skipped (robots.txt: {str(e)[:80]})")
        except ShapeChanged as e:
            report.append(f"{name}=format changed ({str(e)[:160]})")
        except Exception as e:  # noqa: BLE001 - one platform never stops the rest
            report.append(f"{name}=error ({type(e).__name__}: {str(e)[:120]})")
    hacks = sum(r["opportunityType"] == "hackathon" for r in records)
    return records, f"{hacks} hackathons, {len(records) - hacks} coding contests. " + ", ".join(report)
