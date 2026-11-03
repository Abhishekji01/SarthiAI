"""Internships and fresher jobs for tech students, from employers' own job boards.

Reads the public job-board APIs of Greenhouse, Lever, Ashby and SmartRecruiters — the endpoints
those systems publish so employers' postings can be listed by job sites. Only
postings that are all of:
  - located in India (or remote within India),
  - tech roles (software, data, ML/AI, security, cloud/DevOps, QA, hardware…),
  - internships or entry-level / new-grad roles (senior roles and "3+ years" are dropped)
are imported. Every record links to the employer's own posting.

Board names live in companies.json; unknown boards are skipped and reported.
"""
from __future__ import annotations

import html as htmllib
import json
import re
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

from common import Fetcher, clean, slug

SOURCE_ID = "ats"
COMPANIES = json.loads((Path(__file__).parent / "companies.json").read_text())
MAX_PER_BOARD = 40

INDIA_PLACES = {
    "bengaluru": "Karnataka", "bangalore": "Karnataka", "mumbai": "Maharashtra", "pune": "Maharashtra", "navi mumbai": "Maharashtra",
    "hyderabad": "Telangana", "chennai": "Tamil Nadu", "coimbatore": "Tamil Nadu", "gurgaon": "Haryana", "gurugram": "Haryana",
    "noida": "Uttar Pradesh", "greater noida": "Uttar Pradesh", "new delhi": "Delhi", "delhi": "Delhi", "kolkata": "West Bengal",
    "ahmedabad": "Gujarat", "gandhinagar": "Gujarat", "jaipur": "Rajasthan", "kochi": "Kerala", "trivandrum": "Kerala",
    "thiruvananthapuram": "Kerala", "indore": "Madhya Pradesh", "chandigarh": "Chandigarh", "mohali": "Punjab", "bhubaneswar": "Odisha",
    "vadodara": "Gujarat", "nagpur": "Maharashtra", "mysuru": "Karnataka", "mysore": "Karnataka", "lucknow": "Uttar Pradesh",
}
INDIA_RX = re.compile(r"\bindia\b|\b(" + "|".join(map(re.escape, INDIA_PLACES)) + r")\b", re.I)

INTERN_RX = re.compile(r"\b(intern|interns|internship|trainee|apprentice(ship)?|co-?op|summer analyst)\b", re.I)
ENTRY_TITLE_RX = re.compile(
    r"\b(new grad(uate)?|graduate|fresher|freshers|entry[- ]level|junior|jr\.?|early career|campus|university|"
    r"associate (software|engineer|developer|data|ml|qa|sde)|software (development )?engineer\s*(i|1)\b|sde\s*-?\s*(i|1)\b|"
    r"engineer\s*(i|1)\b|developer\s*(i|1)\b|(data|security|systems) analyst\b|graduate engineer trainee)", re.I)
ENTRY_TEXT_RX = re.compile(
    r"\b(0\s*(-|–|to)\s*[12]\+?\s*years?|freshers?|recent(ly)? graduat\w*|new graduates?|"
    r"(graduating|graduation|pass(ing)?[- ]out|batch)\s*(year|in|of)?\s*:?\s*20(2[5-9]|3[0-1]))", re.I)
SENIOR_RX = re.compile(
    r"\b(senior|sr\.?|staff|lead|principal|manager|director|head|architect|vp|vice president|chief|distinguished|"
    r"ii|iii|iv|2|3|4|sde\s*-?\s*(2|3)|expert|specialist)\b", re.I)
EXPERIENCE_RX = re.compile(r"\b([3-9]|1\d)\s*\+?\s*(-|–|to)?\s*\d*\s*\+?\s*years?", re.I)
TECH_RX = re.compile(
    r"\b(software|engineer|engineering|developer|sde|swe|programmer|data|machine learning|ml|ai|artificial intelligence|"
    r"deep learning|nlp|computer vision|research|security|cyber|devops|sre|site reliability|cloud|platform|infrastructure|backend|"
    r"back-end|frontend|front-end|full[- ]?stack|android|ios|mobile|qa|test|automation|analytics|scientist|"
    r"embedded|firmware|hardware|vlsi|asic|fpga|silicon|network|systems|database|product design|ui|ux|technical|tech|"
    r"solutions engineer|support engineer)\b", re.I)

# Display labels match the server's skill taxonomy so matching treats them as known skills.
SKILLS = {
    "Python": r"python", "Java": r"java(?!script)", "JavaScript": r"javascript|\bjs\b", "TypeScript": r"typescript",
    "C++": r"c\+\+|\bcpp\b", "Go": r"\bgolang\b", "Rust": r"\brust\b", "Kotlin": r"kotlin",
    "Swift": r"\bswift\b", "SQL": r"\bsql\b|mysql|postgres", "React": r"\breact", "Node.js": r"node\.?js", "Django": r"django|flask|fastapi",
    "Spring Boot": r"spring boot|\bspring\b", "HTML/CSS": r"\bhtml|\bcss\b", "Android development": r"\bandroid\b",
    "iOS development": r"\bios\b", "Flutter": r"flutter", "Machine learning": r"machine learning|\bml\b",
    "Deep learning": r"deep learning|pytorch|tensorflow", "Natural language processing": r"\bnlp\b|natural language|llm",
    "Computer vision": r"computer vision|opencv", "Data science": r"data science|pandas|numpy|data analy", "Statistics": r"statistic",
    "Data structures & algorithms": r"data structures|algorithms", "Cybersecurity": r"cyber|information security|application security|network security|penetration|vulnerab|\bsoc\b",
    "Networking": r"networking|tcp/ip|\bnetworks\b", "Linux": r"\blinux|\bunix", "Cloud computing": r"\baws\b|\bazure\b|\bgcp\b|google cloud",
    "DevOps": r"kubernetes|docker|ci/cd|terraform|devops", "Git": r"\bgit\b|github", "Databases": r"mongodb|nosql|redis|database",
    "Embedded systems": r"embedded|firmware|microcontroller|rtos", "VLSI": r"vlsi|verilog|vhdl|rtl design|asic|fpga",
    "UI/UX design": r"\bui/ux\b|\bux\b|figma|user experience", "Backend development": r"backend|back-end|rest api|microservice",
    "Frontend development": r"frontend|front-end", "Spark/Big data": r"\bspark\b|hadoop|big data|kafka",
}
SKILL_RX = {k: re.compile(v, re.I) for k, v in SKILLS.items()}

DEGREE_PATTERNS = [
    ("B.Tech", r"b\.?\s?tech"), ("B.E.", r"\bb\.?\s?e\.?\b(?=[ /,(])"), ("BCA", r"\bbca\b"), ("B.Sc", r"b\.?\s?sc"),
    ("M.Tech", r"m\.?\s?tech"), ("MCA", r"\bmca\b"), ("M.Sc", r"m\.?\s?sc"), ("M.E.", r"\bm\.?\s?e\.?\b(?=[ /,(])"),
]
YEAR_RX = re.compile(r"(?:graduating|graduation|pass(?:ing)?[- ]?out|batch|class)\s*(?:year|in|of)?\s*:?\s*((?:20(?:2[5-9]|3[01])(?:\s*(?:,|/|&|and|or)\s*)?)+)", re.I)


def company_name(raw: str) -> str:
    """'Rubrik Job Board' / 'HackerRank Careers' -> 'Rubrik' / 'HackerRank'."""
    name = re.sub(r"\s*[-–|:]?\s*\b(job board|jobs?|careers?|career site|hiring|recruiting|talent)\b\.?\s*$", "", clean(raw), flags=re.I)
    return name or clean(raw)


def html_to_text(s: str) -> str:
    if not s:
        return ""
    soup = BeautifulSoup(htmllib.unescape(s), "lxml")
    for li in soup.find_all("li"):
        li.insert_before("\n• ")
    for br in soup.find_all(["br", "p", "div", "h1", "h2", "h3", "h4"]):
        br.insert_after("\n")
    text = soup.get_text()
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    return re.sub(r"\n\s*\n+", "\n\n", text).strip()


def is_india(location: str) -> bool:
    return bool(INDIA_RX.search(location or ""))


def classify(title: str, text: str, employment: str = "") -> str | None:
    """Returns 'internship', 'job' (entry-level) or None (not for students)."""
    if not TECH_RX.search(title):
        return None
    if INTERN_RX.search(title) or re.search(r"intern", employment or "", re.I):
        return "internship"
    title_wo_numbers = re.sub(r"20\d\d", "", title)
    if SENIOR_RX.search(title_wo_numbers):
        return None
    head = text[:6000]
    if ENTRY_TITLE_RX.search(title) or ENTRY_TEXT_RX.search(head):
        if EXPERIENCE_RX.search(head) and not ENTRY_TEXT_RX.search(head) and not ENTRY_TITLE_RX.search(title):
            return None
        return "job"
    return None


def place(location: str):
    for p, state in INDIA_PLACES.items():
        if re.search(rf"\b{re.escape(p)}\b", location or "", re.I):
            return p.title().replace("Bangalore", "Bengaluru").replace("Gurgaon", "Gurugram"), state
    return None, None


def work_mode(raw: str, location: str) -> str:
    v = f"{raw or ''} {location or ''}".lower()
    if "hybrid" in v:
        return "hybrid"
    if "remote" in v:
        return "remote"
    if "on-site" in v or "onsite" in v or "office" in v or raw:
        return "onsite"
    return "unknown"


def build(*, ats: str, board: str, job_id: str, company: str, title: str, location: str, text: str, url: str,
          apply_url: str | None, kind: str, now: datetime, mode_raw: str = "", posted: str | None = None,
          compensation: str | None = None, team: str | None = None) -> dict:
    blob = f"{title}\n{text}"
    skills = [k for k, rx in SKILL_RX.items() if rx.search(blob)][:20]
    degrees = [label for label, rx in DEGREE_PATTERNS if re.search(rx, text, re.I)]
    years = sorted({int(y) for m in YEAR_RX.finditer(text) for y in re.findall(r"20\d\d", m.group(1))})
    city, state = place(location)
    rules = []
    if degrees:
        m = re.search(r"[^.\n]*(" + "|".join(rx for _, rx in DEGREE_PATTERNS) + r")[^.\n]*", text, re.I)
        rules.append({"key": "degree", "kind": "degree_in", "label": f"Degree mentioned in the posting: {', '.join(degrees)}",
                      "mandatory": False, "values": degrees, "sourceExcerpt": clean(m.group(0))[:600] if m else None,
                      "note": "The posting may also accept equivalent degrees."})
    if years:
        m = YEAR_RX.search(text)
        rules.append({"key": "grad_year", "kind": "graduation_year_in", "label": f"Graduating in {', '.join(map(str, years))}",
                      "mandatory": True, "values": [str(y) for y in years], "sourceExcerpt": clean(m.group(0))[:600] if m else None})
    rules.append({"key": "posting_requirements", "kind": "self_declared",
                  "label": "You meet the qualifications listed in the employer's posting", "mandatory": True,
                  "note": "SarthiAI reads only part of a job posting automatically. Read the full posting before applying."})

    tags = [kind, "tech", "india"] + (["fresher"] if kind == "job" else []) + ([slug(team)[:40]] if team else [])
    rec = {
        "externalId": f"{SOURCE_ID}:{ats}:{slug(board)}:{job_id}"[:300],
        "title": clean(f"{title}")[:200],
        "organization": company_name(company)[:160],
        "opportunityType": kind,
        "officialDescription": text[:3900] or None,
        "sourceUrl": url,
        "applicationUrl": apply_url or url,
        "additionalSources": [],
        "sourceType": "employer_career_page",
        "verificationStatus": "verified",
        "lastVerifiedAt": now.isoformat(),
        "verifiedBy": f"naviq-ingest:{SOURCE_ID}:{ats}",
        "verificationNotes": f"Read from {company}'s {ats.title()} job board on {now.date()}"
                             + (f" (posted {posted[:10]})" if posted else "") + ". Listed as open; employers can close postings without notice.",
        "declaredStatus": "open",
        "applicationOpensAt": None,
        "deadline": None,
        "deadlineNote": "The employer has not published a closing date — postings can close at any time, so apply early.",
        "eligibleDegrees": [],
        "eligibleYears": [],
        "eligibleBranches": [],
        "requiredSkills": [],
        "preferredSkills": skills,
        "location": {"city": city, "state": state, "country": "India", "isNationwide": False, "description": clean(location)[:200] or None},
        "workMode": work_mode(mode_raw, location),
        "award": None,
        "stipend": {"amount": None, "currency": "INR", "period": None, "description": clean(compensation)[:500]} if compensation else None,
        "eligibilityRules": rules,
        "requiredDocuments": [],
        "tags": [t for t in dict.fromkeys(t.lower() for t in tags if t)][:20],
        "status": "published",
    }
    return prune(rec)


def prune(v):
    """Drops None values inside nested objects (the importer's optional fields do not accept null)."""
    if isinstance(v, dict):
        return {k: prune(x) for k, x in v.items() if x is not None or k in ("deadline", "applicationOpensAt", "award", "stipend")}
    if isinstance(v, list):
        return [prune(x) for x in v]
    return v


def _json(fetcher: Fetcher, url: str):
    try:
        return json.loads(fetcher.get(url))
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code in (400, 404, 410):
            return None
        raise


def greenhouse(fetcher, board, now):
    data = _json(fetcher, f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true")
    if data is None:
        return None
    meta = _json(fetcher, f"https://boards-api.greenhouse.io/v1/boards/{board}") or {}
    company = meta.get("name") or board.title()
    out = []
    for j in data.get("jobs", []):
        loc = (j.get("location") or {}).get("name", "") + " " + " ".join(o.get("name", "") for o in j.get("offices", []))
        if not is_india(loc):
            continue
        _saw_india()
        text = html_to_text(j.get("content", ""))
        kind = classify(j.get("title", ""), text)
        if kind:
            dept = (j.get("departments") or [{}])[0].get("name")
            out.append(build(ats="greenhouse", board=board, job_id=str(j["id"]), company=company, title=j["title"], location=clean(loc),
                             text=text, url=j["absolute_url"], apply_url=None, kind=kind, now=now, posted=j.get("updated_at"), team=dept))
    return out


def lever(fetcher, board, now):
    data = _json(fetcher, f"https://api.lever.co/v0/postings/{board}?mode=json")
    if data is None or not isinstance(data, list):
        return None
    out = []
    for j in data:
        cat = j.get("categories") or {}
        loc = " ".join([cat.get("location") or "", *(cat.get("allLocations") or []), j.get("country") or ""])
        if not is_india(loc) and (j.get("country") or "").upper() != "IN":
            continue
        _saw_india()
        lists = "\n".join(f"{l.get('text', '')}\n{html_to_text(l.get('content', ''))}" for l in j.get("lists", []))
        text = clean(j.get("descriptionPlain") or "") + "\n\n" + lists + "\n\n" + clean(j.get("additionalPlain") or "")
        kind = classify(j.get("text", ""), text, cat.get("commitment", ""))
        if kind:
            comp = None
            if j.get("salaryRange"):
                r = j["salaryRange"]
                comp = f"{r.get('currency', '')} {r.get('min', '')}–{r.get('max', '')} {r.get('interval', '')}".strip()
            company = re.sub(r"[-_]", " ", board).title()
            out.append(build(ats="lever", board=board, job_id=j["id"], company=company, title=j["text"], location=clean(loc) or "India",
                             text=text.strip(), url=j["hostedUrl"], apply_url=j.get("applyUrl"), kind=kind, now=now,
                             mode_raw=j.get("workplaceType", ""), posted=datetime.fromtimestamp(j["createdAt"] / 1000).isoformat() if j.get("createdAt") else None,
                             compensation=comp, team=cat.get("team")))
    return out


def ashby(fetcher, board, now):
    data = _json(fetcher, f"https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true")
    if data is None or "jobs" not in data:
        return None
    out = []
    for j in data["jobs"]:
        if j.get("isListed") is False:
            continue
        locs = [j.get("location") or ""] + [s.get("location", "") for s in j.get("secondaryLocations") or []]
        addr = ((j.get("address") or {}).get("postalAddress") or {}).get("addressCountry", "")
        loc = " / ".join(x for x in locs if x) + (f" ({addr})" if addr else "")
        if not is_india(loc):
            continue
        _saw_india()
        text = clean(j.get("descriptionPlain") or "") or html_to_text(j.get("descriptionHtml", ""))
        kind = classify(j.get("title", ""), text, j.get("employmentType", ""))
        if kind:
            comp = (j.get("compensation") or {}).get("compensationTierSummary")
            company = re.sub(r"[-_]", " ", board).title()
            out.append(build(ats="ashby", board=board, job_id=j.get("id") or slug(j["title"]), company=company, title=j["title"], location=loc,
                             text=text, url=j["jobUrl"], apply_url=j.get("applyUrl"), kind=kind, now=now,
                             mode_raw=j.get("workplaceType") or ("remote" if j.get("isRemote") else ""), posted=j.get("publishedAt"),
                             compensation=comp, team=j.get("department") or j.get("team")))
    return out


class Found(list):
    """List of records that also carries how many India postings the board had (for the run report)."""
    india = 0


def counted(reader):
    def wrapped(fetcher, board, now):
        global _INDIA
        _INDIA = 0
        out = reader(fetcher, board, now)
        if out is None:
            return None
        res = Found(out)
        res.india = _INDIA
        return res
    return wrapped


_INDIA = 0


def _saw_india():
    global _INDIA
    _INDIA += 1


def smartrecruiters(fetcher, board, now):
    """SmartRecruiters public Posting API: filtered to India; experience level is structured."""
    out, offset = [], 0
    while True:
        data = _json(fetcher, f"https://api.smartrecruiters.com/v1/companies/{board}/postings?country=in&limit=100&offset={offset}")
        if data is None:
            return None
        content = data.get("content") or []
        for j in content:
            _saw_india()
            title = j.get("name", "")
            level = ((j.get("experienceLevel") or {}).get("id") or "").lower()
            emp = ((j.get("typeOfEmployment") or {}).get("label") or "")
            if level not in ("internship", "entry_level") and not INTERN_RX.search(title) and not re.search(r"intern", emp, re.I):
                continue
            if not TECH_RX.search(title) or SENIOR_RX.search(re.sub(r"20\d\d", "", title)):
                continue
            detail = _json(fetcher, f"https://api.smartrecruiters.com/v1/companies/{board}/postings/{j['id']}") or {}
            sections = ((detail.get("jobAd") or {}).get("sections") or {})
            text = "\n\n".join(html_to_text((sections.get(k) or {}).get("text", "")) for k in ("jobDescription", "qualifications", "additionalInformation"))
            kind = "internship" if (level == "internship" or INTERN_RX.search(title) or re.search(r"intern", emp, re.I)) else "job"
            loc = j.get("location") or {}
            loc_text = ", ".join(x for x in [loc.get("city"), loc.get("region"), "India"] if x)
            url = detail.get("postingUrl") or f"https://jobs.smartrecruiters.com/{board}/{j['id']}"
            company = (j.get("company") or {}).get("name") or board
            out.append(build(ats="smartrecruiters", board=board, job_id=str(j["id"]), company=company, title=title, location=loc_text,
                             text=text.strip(), url=url, apply_url=detail.get("applyUrl"), kind=kind, now=now,
                             mode_raw="remote" if loc.get("remote") else ("hybrid" if loc.get("hybrid") else ""),
                             posted=j.get("releasedDate"), team=(j.get("department") or {}).get("label") or (j.get("function") or {}).get("label")))
        offset += len(content)
        if not content or offset >= min(int(data.get("totalFound") or 0), 400):
            break
    return out


READERS = {"greenhouse": counted(greenhouse), "lever": counted(lever), "ashby": counted(ashby), "smartrecruiters": counted(smartrecruiters)}


def run(fetcher: Fetcher, now: datetime):
    records, found, missing, errors = [], [], [], []
    seen_ids = set()
    for ats, boards in COMPANIES.items():
        if ats.startswith("_"):
            continue
        for board in dict.fromkeys(boards):
            try:
                recs = READERS[ats](fetcher, board, now)
            except Exception as e:  # noqa: BLE001 - one board never stops the rest
                errors.append(f"{ats}/{board}: {type(e).__name__}")
                continue
            if recs is None:
                missing.append(f"{ats}/{board}")
                continue
            india = getattr(recs, "india", None)
            recs = [r for r in recs if r["externalId"] not in seen_ids][:MAX_PER_BOARD]
            seen_ids.update(r["externalId"] for r in recs)
            found.append(f"{ats}/{board}={len(recs)}" + (f"/{india}" if india is not None else ""))
            records.extend(recs)
    interns = sum(r["opportunityType"] == "internship" for r in records)
    msg = (f"{len(records)} India tech roles ({interns} internships, {len(records) - interns} entry-level jobs) from {len(found)} boards. "
           f"Boards (kept/India postings): {', '.join(found)}. Not found: {', '.join(missing) or 'none'}. Errors: {', '.join(errors) or 'none'}")
    return records, msg
