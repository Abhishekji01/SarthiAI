"""Internships and fresher jobs for tech students, from employers' own job boards.

Reads the public job-board APIs of Greenhouse, Lever and Ashby (SmartRecruiters' API is disallowed by its robots.txt, so it is not used) — the endpoints
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
    r"\b(software|engineer|engineering|developer|sde|swe|programmer|data (engineer|scientist|analyst|analytics|science|platform|qa)|"
    r"machine learning|ml|ai|artificial intelligence|deep learning|nlp|computer vision|research (engineer|scientist)|applied scientist|"
    r"security|cyber|devops|sre|site reliability|cloud|platform|infrastructure|backend|"
    r"back-end|frontend|front-end|full[- ]?stack|android|ios|mobile|qa|test|automation|"
    r"embedded|firmware|hardware|vlsi|asic|fpga|silicon|network|systems engineer|database|product design|ui|ux|technical|tech|"
    r"solutions engineer|support engineer)\b", re.I)

# Display labels match the server's skill taxonomy so matching treats them as known skills.
SKILLS = {
    "Python": r"python", "Java": r"java(?!script)", "JavaScript": r"javascript|\bjs\b", "TypeScript": r"typescript",
    "C++": r"c\+\+|\bcpp\b", "Go": r"\bgolang\b", "Rust": r"\brust\b", "Kotlin": r"kotlin",
    "Swift": r"\bswift\b", "SQL": r"\bsql\b|mysql|postgres", "React": r"\breact(?:\.?js)?\b|react native", "Node.js": r"node\.?js", "Django": r"django|flask|fastapi",
    "Spring Boot": r"spring ?boot|spring framework|spring mvc", "HTML/CSS": r"\bhtml|\bcss\b", "Android development": r"\bandroid\b",
    "iOS development": r"\bios\b", "Flutter": r"flutter", "Machine learning": r"machine learning|\bml\b",
    "Deep learning": r"deep learning|pytorch|tensorflow", "Natural language processing": r"\bnlp\b|natural language|llm",
    "Computer vision": r"computer vision|opencv", "Data science": r"data science|pandas|numpy|data analy", "Statistics": r"statistic",
    "Data structures & algorithms": r"data structures|algorithms", "Cybersecurity": r"cyber|information security|application security|network security|penetration|vulnerab|\bsoc\b",
    "Networking": r"networking|tcp/ip|\bnetworks\b", "Linux": r"\blinux|\bunix", "Cloud computing": r"\baws\b|\bazure\b|\bgcp\b|google cloud",
    "DevOps": r"kubernetes|docker|ci/cd|terraform|devops", "Git": r"\bgit\b|github", "Databases": r"mongodb|nosql|redis|database",
    "Embedded systems": r"embedded (?:systems?|c|software|linux)|firmware|microcontroller|\brtos\b", "VLSI": r"\bvlsi\b|\bverilog\b|\bvhdl\b|\brtl design|\basic\b|\bfpga\b",
    "UI/UX design": r"\bui/ux\b|\bux\b|figma|user experience", "Backend development": r"backend|back-end|rest api|microservice",
    "Frontend development": r"frontend|front-end", "Spark/Big data": r"\bspark\b|hadoop|big data|kafka",
}
SKILL_RX = {k: re.compile(v, re.I) for k, v in SKILLS.items()}

DEGREE_PATTERNS = [
    ("B.Tech", r"b\.?\s?tech"), ("B.E.", r"\bb\.?\s?e\.?\b(?=[ /,(])"), ("BCA", r"\bbca\b"), ("B.Sc", r"b\.?\s?sc"),
    ("M.Tech", r"m\.?\s?tech"), ("MCA", r"\bmca\b"), ("M.Sc", r"m\.?\s?sc"), ("M.E.", r"\bm\.?\s?e\.?\b(?=[ /,(])"),
    ("Bachelor's", r"\bbachelor(?:'|’)?s?\b|\bundergraduate degree|\bug degree"), ("Master's", r"\bmaster(?:'|’)?s\b(?! of)|\bpost ?graduate degree"),
    ("Engineering", r"\bengineering (?:graduate|degree)|\bdegree in (?:computer |electronics |electrical )?engineering"),
]
DASHES = re.compile(r"[‐-―−]")  # non-breaking/en/em dashes -> "-"

# ---- Batch / graduation year (phrasings seen in real postings) ----------------------------
_Y = r"20(?:2[3-9]|3[01])"
_YEARS = rf"({_Y}(?:\s*(?:,|/|&|and|or|-|to)\s*{_Y})*)"
BATCH_BEFORE = re.compile(rf"\b(?:graduat\w*|pass(?:ing)?[ -]?out\w*(?: date)?|batch(?: of)?|class of|final[- ]year[^.\n]{{0,30}}?)"
                          rf"\s*(?:year|in|of|between|from|:)?\s*:?\s*{_YEARS}", re.I)
BATCH_AFTER = re.compile(rf"\b{_YEARS}\s*(?:graduates?|grads?|pass[ -]?outs?|passouts?|batch|passing out|graduating)\b", re.I)
BY_YEAR = re.compile(rf"(?:obtained|completed?|complete|graduat\w*|degree)[^.\n]{{0,40}}?\bby\s+(?:(?:spring|summer|fall|autumn|winter|the end of|end of|june|july|may|august|december)\s+)?({_Y})", re.I)
TITLE_YEAR = re.compile(rf"\b({_Y})\b.*\b(?:graduate|campus|new grad|university|early career)|\b(?:graduate|campus|new grad|university|early career)\b.*\b({_Y})\b", re.I)


def _expand(years_text: str) -> set[int]:
    ys = [int(y) for y in re.findall(r"20\d\d", years_text)]
    if len(ys) == 2 and re.search(r"\d\s*(?:-|to)\s*20", years_text) and ys[0] < ys[1] <= ys[0] + 6:
        return set(range(ys[0], ys[1] + 1))  # "between 2023 - 2025"
    return set(ys)


def graduation_years(title: str, text: str, now: datetime) -> tuple[list[int], bool, str | None]:
    """(years, mandatory, excerpt). 'by <year>' phrasing gives a range and is not mandatory."""
    years: set[int] = set()
    excerpt = None
    for rx in (BATCH_BEFORE, BATCH_AFTER):
        for m in rx.finditer(text):
            years |= _expand(m.group(1))
            excerpt = excerpt or m.group(0)
    m = TITLE_YEAR.search(title)
    if m:
        years.add(int(m.group(1) or m.group(2)))
        excerpt = excerpt or title
    if years:
        return sorted(years), True, excerpt
    m = BY_YEAR.search(text)
    if m:
        y = int(m.group(1))
        return list(range(min(now.year, y), y + 1)), False, m.group(0)
    return [], False, None


# ---- Sections: skills come from what the posting requires, not from company blurbs --------
_Q = r"(?:'|’)?"
REQ_HEAD = (rf"requirements?|qualifications?|minimum qualifications|basic qualifications|required qualifications|required skills|"
            rf"skills (?:&|and) requirements|skills required|what we{_Q}re looking for|what you{_Q}ll need|what you need|what you bring|"
            rf"who you are|about you|you have|you should have|must[- ]haves?|mandatory|experience you{_Q}ll need|education and experience|eligibility")
PREF_HEAD = rf"preferred qualifications|preferred skills|preferred|nice[- ]to[- ]haves?|good[- ]to[- ]haves?|bonus points?|bonus|pluses|it{_Q}s a plus"
COMPANY_HEAD = (rf"about (?:us|the company|[A-Z][\w&.-]+)|company overview|who we are|our values|our mission|benefits|perks|why (?:join|us|work)[^:\n]{{0,30}}|"
                rf"base salary[^:\n]{{0,20}}|compensation[^:\n]{{0,20}}|equal opportunity[^:\n]{{0,40}}|inclusion[^:\n]{{0,30}}|life at [^:\n]{{0,30}}|what we offer")
OTHER_HEAD = (rf"responsibilities|key responsibilities|roles? (?:and|&) responsibilities|what you{_Q}ll do|what you will (?:be )?do(?:ing)?|"
              rf"what you{_Q}ll own|about (?:the role|the job|role|the team)|position overview|role overview|job (?:description|summary)|the role|"
              rf"position summary|reports to")
HEAD_RX = re.compile(rf"(?:^|\n)[ \t•*#-]*(?P<h>{PREF_HEAD}|{REQ_HEAD}|{COMPANY_HEAD}|{OTHER_HEAD})[ \t]*(?::|\n)", re.I)


def sections(text: str) -> dict[str, str]:
    """Splits a posting into 'required', 'preferred', 'company', 'other' text by its headings."""
    out = {"required": "", "preferred": "", "company": "", "other": ""}
    marks = list(HEAD_RX.finditer(text))
    out["other"] += text[: marks[0].start()] if marks else text
    for i, m in enumerate(marks):
        body = text[m.end(): marks[i + 1].start() if i + 1 < len(marks) else len(text)]
        h = m.group("h").lower()
        kind = ("preferred" if re.fullmatch(PREF_HEAD, h, re.I) else "required" if re.fullmatch(REQ_HEAD, h, re.I)
                else "company" if re.fullmatch(COMPANY_HEAD, h, re.I) else "other")
        out[kind] += "\n" + body
    return out


# ---- Role family (what kind of job this is), from the title ------------------------------
ROLE_FAMILIES = [
    ("ml-ai", r"machine learning|\bml\b|\bai\b|artificial intelligence|deep learning|\bnlp\b|computer vision|data scien|\bllms?\b|gen ?ai|applied scientist|research (?:engineer|scientist)"),
    ("hardware", r"embedded|firmware|hardware|vlsi|asic|fpga|silicon|robotics|electronics|electrical|\bic\b|analog|mixed-signal|semiconductor"),
    ("data", r"\bdata\b(?! cent(?:er|re))|analytics|business intelligence|\bbi\b"),
    ("security", r"security|cyber|\bsoc\b|penetration"),
    ("devops-cloud", r"devops|\bsre\b|site reliability|cloud|infrastructure|platform engineer"),
    ("qa", r"\bqa\b|quality|\btest"),
    ("mobile", r"android|\bios\b|mobile|flutter|react native"),
    ("design", r"\bux\b|\bui/ux\b|\bui\b(?! engineer)|designer|design intern|product design"),
    ("frontend", r"front[- ]?end|\bui engineer"),
    ("support", r"support|customer|solutions? engineer|implementation|deployment|technical account|consultant|operations"),
    ("writing", r"writer|documentation|technical publication"),
    ("product", r"product (?:manager|analyst|management)|program manager"),
    ("software", r"software|\bsde\b|\bswe\b|developer|back[- ]?end|full[- ]?stack|engineer|programmer"),
]
ROLE_RX = [(f, re.compile(rx, re.I)) for f, rx in ROLE_FAMILIES]


def role_family(title: str) -> str | None:
    for fam, rx in ROLE_RX:
        if rx.search(title):
            return fam
    return None


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


def tidy_location(parts) -> str:
    """Joins location strings, dropping repeats ("Bangalore, India" + "Bangalore" -> "Bangalore, India")."""
    out = []
    for p in (clean(x) for x in parts):
        if p and not any(p.lower() in o.lower() for o in out):
            out = [o for o in out if o.lower() not in p.lower()] + [p]
    return " / ".join(out)


def is_india(location: str) -> bool:
    return bool(INDIA_RX.search(location or ""))


EXP_RX = re.compile(
    r"(?:minimum\s+(?:of\s+)?|at least\s+)?(\d{1,2})(?:\.\d)?\s*\+?\s*(?:(?:-|–|to)\s*(\d{1,2})\s*\+?\s*)?(?:years?|yrs?)\b"
    r"(?=[^.\n]{0,60}\b(?:experience|exp\b|industry|professional|hands-on|working))", re.I)


def min_experience(text: str) -> int | None:
    """Smallest lower bound of "N(+)/N-M years ... experience" in the posting, or None if not stated."""
    lows = [int(m.group(1)) for m in EXP_RX.finditer(text[:8000]) if int(m.group(1)) <= 15]
    return min(lows) if lows else None


def classify(title: str, text: str, employment: str = "") -> tuple[str, int | None] | None:
    """('internship' | 'job', minimum years of experience) for student-relevant roles, else None."""
    if not TECH_RX.search(title):
        return None
    senior = SENIOR_RX.search(re.sub(r"20\d\d", "", title))
    if INTERN_RX.search(title):
        return "internship", None
    if senior:
        return None
    if re.search(r"\bintern(ship)?s?\b", employment or "", re.I):  # "Internal" is not an internship
        return "internship", None
    head = text[:8000]
    years = min_experience(head)
    entry = bool(ENTRY_TITLE_RX.search(title) or ENTRY_TEXT_RX.search(head))
    if years is not None and years >= 2:
        return None  # experienced role, even if it also mentions freshers elsewhere
    if entry or years is not None:  # 0–1 years, or explicitly entry-level / new grad
        return "job", years
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
          compensation: str | None = None, team: str | None = None, min_years: int | None = None) -> dict:
    text = DASHES.sub("-", text)
    sec = sections(text)
    found = lambda t: [k for k, rx in SKILL_RX.items() if rx.search(t)]  # noqa: E731
    title_skills = found(title)
    if sec["required"].strip() or sec["preferred"].strip():
        required = list(dict.fromkeys(title_skills + found(sec["required"])))
        preferred = [k for k in found(sec["preferred"]) if k not in required]
    else:
        # No requirements heading: use the role text, never the company blurb (benefits, about us…).
        required = title_skills
        preferred = [k for k in found(sec["other"]) if k not in required]
    required, preferred = required[:15], preferred[:15]
    degree_text = sec["required"] or sec["other"]
    degrees = [label for label, rx in DEGREE_PATTERNS if re.search(rx, degree_text, re.I)]
    years, years_mandatory, years_excerpt = graduation_years(title, text, now)
    family = role_family(title)
    city, state = place(location)
    rules = []
    if degrees:
        m = re.search(r"[^.\n]*(" + "|".join(rx for _, rx in DEGREE_PATTERNS) + r")[^.\n]*", degree_text, re.I)
        rules.append({"key": "degree", "kind": "degree_in", "label": f"Degree mentioned in the posting: {', '.join(degrees)}",
                      "mandatory": False, "values": degrees, "sourceExcerpt": clean(m.group(0))[:600] if m else None,
                      "note": "The posting may also accept equivalent degrees."})
    if years:
        rules.append({"key": "grad_year", "kind": "graduation_year_in",
                      "label": f"Graduating in {', '.join(map(str, years))}" if years_mandatory else f"Degree completed by {years[-1]}",
                      "mandatory": years_mandatory, "values": [str(y) for y in years],
                      "sourceExcerpt": clean(years_excerpt)[:600] if years_excerpt else None})
    if min_years:
        m = EXP_RX.search(text)
        rules.append({"key": "experience", "kind": "self_declared",
                      "label": f"At least {min_years} year{'s' if min_years > 1 else ''} of relevant experience (internships may count — check the posting)",
                      "mandatory": True, "sourceExcerpt": clean(m.group(0))[:600] if m else None})
    rules.append({"key": "posting_requirements", "kind": "self_declared",
                  "label": "You meet the qualifications listed in the employer's posting", "mandatory": True,
                  "note": "SarthiAI reads only part of a job posting automatically. Read the full posting before applying."})

    tags = [kind, "tech", "india"] + (["fresher"] if kind == "job" and not min_years else ["early-career"] if kind == "job" else []) + ([f"role-{family}"] if family else []) + ([slug(team)[:40]] if team else [])
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
        "requiredSkills": required,
        "preferredSkills": preferred,
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
    india = 0
    data = _json(fetcher, f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true")
    if data is None:
        return None
    meta = _json(fetcher, f"https://boards-api.greenhouse.io/v1/boards/{board}") or {}
    company = meta.get("name") or board.title()
    out = []
    for j in data.get("jobs", []):
        loc = tidy_location([(j.get("location") or {}).get("name", ""), *(o.get("name", "") for o in j.get("offices", []))])
        if not is_india(loc):
            continue
        india += 1
        text = html_to_text(j.get("content", ""))
        c = classify(j.get("title", ""), text)
        kind, min_years = c if c else (None, None)
        if kind:
            dept = (j.get("departments") or [{}])[0].get("name")
            out.append(build(ats="greenhouse", board=board, job_id=str(j["id"]), company=company, title=j["title"], location=clean(loc),
                             text=text, url=j["absolute_url"], apply_url=None, kind=kind, now=now, posted=j.get("updated_at"), team=dept, min_years=min_years))
    return _found(out, india)


def lever(fetcher, board, now):
    india = 0
    data = _json(fetcher, f"https://api.lever.co/v0/postings/{board}?mode=json")
    if data is None or not isinstance(data, list):
        return None
    out = []
    for j in data:
        cat = j.get("categories") or {}
        loc = " ".join([cat.get("location") or "", *(cat.get("allLocations") or []), j.get("country") or ""])
        if not is_india(loc) and (j.get("country") or "").upper() != "IN":
            continue
        india += 1
        lists = "\n".join(f"{l.get('text', '')}\n{html_to_text(l.get('content', ''))}" for l in j.get("lists", []))
        text = clean(j.get("descriptionPlain") or "") + "\n\n" + lists + "\n\n" + clean(j.get("additionalPlain") or "")
        c = classify(j.get("text", ""), text, cat.get("commitment", ""))
        kind, min_years = c if c else (None, None)
        if kind:
            comp = None
            if j.get("salaryRange"):
                r = j["salaryRange"]
                comp = f"{r.get('currency', '')} {r.get('min', '')}–{r.get('max', '')} {r.get('interval', '')}".strip()
            company = re.sub(r"[-_]", " ", board).title()
            out.append(build(ats="lever", board=board, job_id=j["id"], company=company, title=j["text"], location=clean(loc) or "India",
                             text=text.strip(), url=j["hostedUrl"], apply_url=j.get("applyUrl"), kind=kind, now=now,
                             mode_raw=j.get("workplaceType", ""), posted=datetime.fromtimestamp(j["createdAt"] / 1000).isoformat() if j.get("createdAt") else None,
                             compensation=comp, team=cat.get("team"), min_years=min_years))
    return _found(out, india)


def ashby(fetcher, board, now):
    india = 0
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
        india += 1
        text = html_to_text(j.get("descriptionHtml", "")) or clean(j.get("descriptionPlain") or "")  # HTML keeps headings on their own lines
        c = classify(j.get("title", ""), text, j.get("employmentType", ""))
        kind, min_years = c if c else (None, None)
        if kind:
            comp = (j.get("compensation") or {}).get("compensationTierSummary")
            company = re.sub(r"[-_]", " ", board).title()
            out.append(build(ats="ashby", board=board, job_id=j.get("id") or slug(j["title"]), company=company, title=j["title"], location=loc,
                             text=text, url=j["jobUrl"], apply_url=j.get("applyUrl"), kind=kind, now=now,
                             mode_raw=j.get("workplaceType") or ("remote" if j.get("isRemote") else ""), posted=j.get("publishedAt"),
                             compensation=comp, team=j.get("department") or j.get("team"), min_years=min_years))
    return _found(out, india)


class Found(list):
    """Records from one board, plus how many India postings it had (for the run report)."""
    india = 0


def _found(out, india):
    res = Found(out)
    res.india = india
    return res


READERS = {"greenhouse": greenhouse, "lever": lever, "ashby": ashby}


BOARDS_FILE = Path(__file__).parent / "boards_india.json"


# Boards that repost other companies' jobs (aggregators/staffing), not employers' own postings.
EXCLUDED_BOARDS = {"jobgether", "examplecorpsandbox"}


def boards_to_read() -> dict[str, list[str]]:
    """Hand-picked boards (companies.json) plus boards found to have India postings (boards_india.json)."""
    boards = {ats: list(v) for ats, v in COMPANIES.items() if not ats.startswith("_") and isinstance(v, list)}
    if BOARDS_FILE.exists():
        for ats, items in json.loads(BOARDS_FILE.read_text()).get("boards", {}).items():
            boards.setdefault(ats, []).extend(i["token"] for i in items)
    excluded = EXCLUDED_BOARDS | set(COMPANIES.get("_exclude", []))
    return {ats: [b for b in dict.fromkeys(v) if b.lower() not in excluded] for ats, v in boards.items()}


def merge_duplicates(records: list[dict]) -> list[dict]:
    """One record per company + title + type; other cities are listed in the location description."""
    out, by_key = [], {}
    for r in records:
        key = (r["organization"].lower(), re.sub(r"[^a-z0-9]+", " ", r["title"].lower()).strip(), r["opportunityType"])
        first = by_key.get(key)
        if first is None:
            by_key[key] = r
            out.append(r)
            continue
        cities = first.setdefault("_cities", {first["location"].get("city")})
        city = r["location"].get("city")  # normalised (Gurgaon -> Gurugram)
        if city and city not in cities:
            cities.add(city)
            desc = first["location"].get("description") or first["location"].get("city") or "India"
            first["location"]["description"] = f"{desc}; also {city}"[:200]
    for r in out:
        r.pop("_cities", None)
    return out


def _read_provider(ats: str, boards: list[str], now: datetime):
    fetcher = Fetcher()  # own throttle: 1 request/second to this provider's host
    results = []
    for board in boards:
        try:
            results.append((board, READERS[ats](fetcher, board, now), None))
        except Exception as e:  # noqa: BLE001 - one board never stops the rest
            results.append((board, None, type(e).__name__))
    return ats, results


def run(fetcher: Fetcher, now: datetime):
    from concurrent.futures import ThreadPoolExecutor
    records, found, missing, errors = [], [], [], []
    seen_ids = set()
    plan = boards_to_read()
    with ThreadPoolExecutor(max_workers=len(plan)) as pool:
        outcomes = list(pool.map(lambda kv: _read_provider(kv[0], kv[1], now), plan.items()))
    for ats, results in outcomes:
        for board, recs, err in results:
            if err:
                errors.append(f"{ats}/{board}: {err}")
                continue
            if recs is None:
                missing.append(f"{ats}/{board}")
                continue
            india = getattr(recs, "india", 0)
            recs = [r for r in recs if r["externalId"] not in seen_ids][:MAX_PER_BOARD]
            seen_ids.update(r["externalId"] for r in recs)
            if recs or india:
                found.append(f"{ats}/{board}={len(recs)}/{india}")
            records.extend(recs)
    before = len(records)
    records = merge_duplicates(records)
    merged = before - len(records)
    interns = sum(r["opportunityType"] == "internship" for r in records)
    total_boards = sum(len(v) for v in plan.values())
    msg = (f"{len(records)} India tech roles ({interns} internships, {len(records) - interns} entry-level jobs) from {total_boards} boards "
           f"({merged} same-role postings in other cities merged). Boards with India postings (kept/India): {', '.join(found) or 'none'}. Not found: {len(missing)} ({', '.join(missing[:40])}). "
           f"Errors: {len(errors)} ({', '.join(errors[:20]) or 'none'})")
    return records, msg
