"""Summer / winter research internships for engineering students, from official programme pages.

These programmes publish one page per cycle, not a feed. For each page (robots.txt checked):
  - the programme facts that never change (name, host, city) come from PROGRAMS below;
  - dates are read from the page only when a sentence ties a date to a deadline word
    ("Last date: 15 January 2027"); that sentence is quoted to the student;
  - if the page has no date for the coming cycle, the listing says so ("dates not announced
    yet") instead of guessing.
A page that cannot be reached is reported in the run log and its listing is not refreshed.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from bs4 import BeautifulSoup

from common import Blocked, Fetcher, clean, slug

SOURCE_ID = "research"

# url: official page. city/state/country: where the internship happens.
PROGRAMS = [
    {"key": "iitk-surge", "name": "SURGE (Students-Undergraduate Research Graduate Excellence)", "org": "IIT Kanpur",
     "url": "https://surge.iitk.ac.in/", "city": "Kanpur", "state": "Uttar Pradesh", "tags": ["iit", "summer"]},
    {"key": "iitr-spark", "name": "SPARK Summer Research Internship", "org": "IIT Roorkee",
     "url": "https://spark.iitr.ac.in/", "city": "Roorkee", "state": "Uttarakhand", "tags": ["iit", "summer"]},
    {"key": "iitm-sfp", "name": "Summer Fellowship Programme (SFP)", "org": "IIT Madras",
     "url": "https://sfp.iitm.ac.in/", "city": "Chennai", "state": "Tamil Nadu", "tags": ["iit", "summer"]},
    {"key": "iitgn-srip", "name": "Summer Research Internship Programme (SRIP)", "org": "IIT Gandhinagar",
     "url": "https://srip.iitgn.ac.in/", "city": "Gandhinagar", "state": "Gujarat", "tags": ["iit", "summer"]},
    {"key": "fossee-fellowship", "name": "FOSSEE Summer Fellowship", "org": "FOSSEE, IIT Bombay",
     "url": "https://fossee.in/fellowship", "city": "Mumbai", "state": "Maharashtra", "tags": ["iit", "open source", "summer"]},
    {"key": "tifr-vsrp", "name": "Visiting Students' Research Programme (VSRP)", "org": "Tata Institute of Fundamental Research",
     "url": "https://vsrp.tifr.res.in/", "city": "Mumbai", "state": "Maharashtra", "tags": ["summer", "research"]},
    {"key": "jncasr-srfp", "name": "Summer Research Fellowship Programme (SRFP)", "org": "JNCASR",
     "url": "https://www.jncasr.ac.in/academic/fandeprogrammes/srfp/", "fallbacks": ["https://www.jncasr.ac.in/fandeprogrammes"], "city": "Bengaluru", "state": "Karnataka", "tags": ["summer", "research"]},
    {"key": "niti-internship", "name": "NITI Aayog Internship Scheme", "org": "NITI Aayog, Government of India",
     "url": "https://www.niti.gov.in/internship", "fallbacks": ["https://internship.niti.gov.in/"], "city": "New Delhi", "state": "Delhi", "tags": ["government", "policy"]},
    {"key": "mitacs-globalink", "name": "Mitacs Globalink Research Internship", "org": "Mitacs (Canada)",
     "url": "https://www.mitacs.ca/our-programs/globalink-research-internship-students/", "country": "Canada", "tags": ["international", "summer"]},
    {"key": "daad-wise", "name": "DAAD WISE Scholarship (Working Internships in Science and Engineering)", "org": "DAAD (Germany)",
     "url": "https://daad.de/go/en/stipa50015295", "country": "Germany", "tags": ["international", "summer"]},
    {"key": "charpak-research", "name": "France Excellence Charpak Summer Training Scholarship (research internship)", "org": "Embassy of France in India / Campus France",
     "url": "https://www.inde.campusfrance.org/node/96", "country": "France", "tags": ["international", "summer"]},
    {"key": "iusstf-snbose", "name": "S.N. Bose Scholars Program", "org": "IUSSTF (Indo-U.S. Science and Technology Forum)",
     "url": "https://iusstf.org/s-n-bose-scholars-program", "country": "United States", "tags": ["international", "summer"]},
    {"key": "iusstf-khorana", "name": "Khorana Program for Scholars", "org": "IUSSTF (Indo-U.S. Science and Technology Forum)",
     "url": "https://iusstf.org/khorana-program-for-scholars", "fallbacks": ["https://dbtindia.gov.in/khorana-programs-scholars"],
     "country": "United States", "tags": ["international", "summer", "biotech"]},
]

MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?"
DATE_RX = re.compile(
    rf"\b(?:(\d{{1,2}})(?:st|nd|rd|th)?[\s\-]+({MONTHS})\.?,?[\s\-]+(20\d\d)"   # 15 January 2027 / 15-Jan-2027
    rf"|({MONTHS})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?,?\s+(20\d\d)"                # January 15, 2027
    rf"|(\d{{1,2}})[/.-](\d{{1,2}})[/.-](20\d\d))\b", re.I)                      # 15/01/2027
DEADLINE_WORDS = re.compile(r"last date|deadline|apply (?:by|before)|applications? (?:close|closes|due|end|ends)|closing date|"
                            r"submission[^.]{0,20}(?:by|before|till|until)|(?:till|until)\b|registration (?:closes|ends)", re.I)
# "Applications for 2026-27 will open on…", "Registration starts…", "Portal opens on…"
OPEN_WORDS = re.compile(r"(?:applications?|portal|registrations?)\b[^.]{0,40}?\b(?:will\s+)?(?:open|opens|starts?|begins?)\b", re.I)


def _date(m: re.Match) -> datetime | None:
    try:
        if m.group(1):
            s = f"{m.group(1)} {m.group(2)[:3]} {m.group(3)}"
        elif m.group(4):
            s = f"{m.group(5)} {m.group(4)[:3]} {m.group(6)}"
        else:
            return datetime(int(m.group(9)), int(m.group(8)), int(m.group(7)), 23, 59, tzinfo=timezone(timedelta(hours=5, minutes=30)))
        return datetime.strptime(s.title(), "%d %b %Y").replace(hour=23, minute=59, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    except ValueError:
        return None


def sentences(text: str) -> list[str]:
    return [clean(s) for s in re.split(r"(?<=[.!?])\s+|\n+", text) if clean(s)]


def find_dates(text: str, now: datetime) -> dict:
    """Deadline / opening dates tied to explicit words, for the current or next cycle only."""
    found = {"deadline": None, "opens": None, "deadline_quote": None, "opens_quote": None, "cycle_year_mentioned": False}
    horizon = now + timedelta(days=400)
    for s in sentences(text):
        if re.search(rf"\b({now.year}|{now.year + 1})\b", s):
            found["cycle_year_mentioned"] = True
        for m in DATE_RX.finditer(s):
            d = _date(m)
            if not d or d > horizon or d < now - timedelta(days=200):
                continue
            before = s[max(0, m.start() - 120): m.start()]
            if DEADLINE_WORDS.search(before) and (found["deadline"] is None or d > found["deadline"]):
                found["deadline"], found["deadline_quote"] = d, s[:300]
            elif OPEN_WORDS.search(before) and found["opens"] is None:
                found["opens"], found["opens_quote"] = d, s[:300]
    return found


def page_text(html: str) -> tuple[str, str]:
    soup = BeautifulSoup(html, "lxml")
    for t in soup(["script", "style", "nav", "footer", "noscript", "svg"]):
        t.decompose()
    meta = soup.select_one('meta[name="description"]') or soup.select_one('meta[property="og:description"]')
    desc = clean(meta.get("content", "")) if meta else ""
    for br in soup.find_all(["br", "p", "li", "div", "h1", "h2", "h3", "h4", "tr"]):
        br.insert_after("\n")
    text = re.sub(r"\n\s*\n+", "\n", soup.get_text())
    return desc, text


def build(p: dict, html: str, now: datetime) -> dict:
    return build_page(p, html, now, source_id=SOURCE_ID, kind="research", base_tags=["research", "internship"],
                      eligibility_label="You meet the programme's eligibility (year of study, discipline, CGPA) on its official page",
                      source_type="university_site" if "iit" in p["tags"] else "official_org_site")


def build_page(p: dict, html: str, now: datetime, *, source_id: str, kind: str, base_tags: list[str],
               eligibility_label: str, source_type: str) -> dict:
    """One listing from one official page: curated facts + dates quoted from the page."""
    desc, text = page_text(html)
    d = find_dates(text, now)
    deadline, opens = d["deadline"], d["opens"]
    if deadline and deadline < now:
        status, note = "closed", f"Closed for this cycle. The official page says: \"{d['deadline_quote']}\""
    elif deadline:
        status = "upcoming" if opens and opens > now else "open"
        note = f"From the official page: \"{d['deadline_quote']}\""
    elif opens and opens > now:
        status, note = "upcoming", f"From the official page: \"{d['opens_quote']}\""
    else:
        status = "unknown"
        note = "Dates for the next cycle are not announced on the official page yet. Save it and check back."
    intro = desc or " ".join(sentences(text)[:6])
    rec = {
        "externalId": f"{source_id}:{p['key']}",
        "title": p["name"][:200],
        "organization": p["org"][:160],
        "opportunityType": kind,
        "officialDescription": intro[:3000] or None,
        "sourceUrl": p["url"],
        "applicationUrl": p["url"],
        "additionalSources": [],
        "sourceType": source_type,
        "verificationStatus": "verified",
        "lastVerifiedAt": now.isoformat(),
        "verifiedBy": f"naviq-ingest:{source_id}",
        "verificationNotes": f"Programme page read on {now.date()}. Dates are quoted from that page; anything not stated there is left unknown.",
        "declaredStatus": status,
        "applicationOpensAt": opens.isoformat() if opens else None,
        "deadline": deadline.isoformat() if deadline else None,
        "deadlineNote": note[:300],
        "eligibleDegrees": [], "eligibleYears": [], "eligibleBranches": [], "requiredSkills": [], "preferredSkills": [],
        "location": {k: v for k, v in {"city": p.get("city"), "state": p.get("state"), "country": p.get("country", "India"),
                                        "isNationwide": False}.items() if v is not None},
        "workMode": "onsite",
        "award": None, "stipend": None,
        # Audience label names the group only; the app shows it as "Only for: …".
        "eligibilityRules": ([{"key": "audience", "kind": "self_declared", "mandatory": True, "restrictsAudience": True,
                               "label": p["audience"][:1].upper() + p["audience"][1:],
                               "note": "SarthiAI never infers this. Confirm it yourself."}] if p.get("audience") else [])
                             + [{"key": "programme_eligibility", "kind": "self_declared", "mandatory": True, "label": eligibility_label,
                                 "note": "Rules (year, marks, income limits) change each cycle. Read them on the official page."}],
        "requiredDocuments": [],
        "tags": list(dict.fromkeys(base_tags + p["tags"]))[:20],
        "status": "published",
    }
    return rec


def _why(e: Exception) -> str:
    status = getattr(getattr(e, "response", None), "status_code", None)
    if isinstance(e, Blocked):
        return "robots.txt disallows"
    if status in (401, 403, 451):
        return f"refused automated access (HTTP {status})"
    if status:
        return f"HTTP {status}"
    if "SSL" in type(e).__name__ or "SSL" in str(e):
        return "site's HTTPS certificate is invalid (not bypassed)"
    return f"unreachable ({type(e).__name__})"


def fetch_first(fetcher: Fetcher, p: dict):
    """Official page first, then official fallbacks. Returns (html, url_used, reason_if_none)."""
    reasons = []
    for url in [p["url"], *p.get("fallbacks", [])]:
        try:
            return fetcher.get(url), url, None
        except Exception as e:  # noqa: BLE001 - try the next official address
            reasons.append(_why(e))
    return None, None, " / ".join(reasons)


def run(fetcher: Fetcher, now: datetime):
    records, report = [], []
    for p in PROGRAMS:
        html, used, why = fetch_first(fetcher, p)
        if html is None:
            report.append(f"{p['key']}={why}")
            continue
        p = {**p, "url": used}
        rec = build(p, html, now)
        records.append(rec)
        report.append(f"{p['key']}={rec['declaredStatus']}" + (f" until {rec['deadline'][:10]}" if rec.get("deadline") else ""))
    return records, f"{len(records)}/{len(PROGRAMS)} programme pages read. " + ", ".join(report)
