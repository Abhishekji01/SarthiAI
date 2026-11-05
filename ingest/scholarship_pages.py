"""Corporate and foundation scholarships for engineering / tech students, from their official pages.

Same rules as research_programs.py: curated facts that do not change (name, sponsor, who it is
for), dates quoted from the official page only, "not announced yet" otherwise. Amounts and
income limits are NOT hard-coded (they change each year); students read them on the page.
Aggregator-hosted pages (e.g. Buddy4Study) are not used.
"""
from __future__ import annotations

from datetime import datetime

from common import Fetcher
from research_programs import build_page, fetch_first

SOURCE_ID = "scholarship"

# audience: set only when the scheme is limited to a group (never inferred about the student).
PAGES = [
    {"key": "reliance-ug", "name": "Reliance Foundation Undergraduate Scholarships", "org": "Reliance Foundation",
     "url": "https://www.scholarships.reliancefoundation.org/UG_Scholarship.aspx", "tags": ["merit-cum-means", "undergraduate"]},
    {"key": "reliance-pg", "name": "Reliance Foundation Postgraduate Scholarships (CS, AI, engineering and more)", "org": "Reliance Foundation",
     "url": "https://www.scholarships.reliancefoundation.org/PG_Scholarship.aspx", "tags": ["postgraduate", "ai"]},
    {"key": "aditya-birla", "name": "Aditya Birla Scholarship", "org": "Aditya Birla Group",
     "url": "https://www.adityabirlascholars.net/", "tags": ["merit", "engineering"]},
    {"key": "ongc", "name": "ONGC Scholarship for Meritorious Students", "org": "ONGC Foundation",
     "url": "https://ongcscholar.org/", "tags": ["engineering", "psu"]},
    {"key": "ffe", "name": "Foundation for Excellence (FFE) Scholarship", "org": "Foundation for Excellence",
     "url": "https://ffe.org/", "tags": ["need-based", "engineering"]},
    {"key": "nsf-india", "name": "North South Foundation Scholarships (India)", "org": "North South Foundation",
     "url": "https://www.northsouth.org/public/scholarships", "tags": ["need-based", "merit"]},
    {"key": "sitaram-jindal", "name": "Sitaram Jindal Foundation Scholarship", "org": "Sitaram Jindal Foundation",
     "url": "https://www.sitaramjindalfoundation.org/", "tags": ["need-based"]},
    {"key": "generation-google-apac", "name": "Generation Google Scholarship (Asia Pacific)", "org": "Google",
     "url": "https://buildyourfuture.withgoogle.com/scholarships/generation-google-scholarship-apac",
     "audience": "students who identify as women, studying computer science or a related field", "tags": ["computer science", "women in tech"]},
    {"key": "kotak-kanya", "name": "Kotak Kanya Scholarship", "org": "Kotak Education Foundation",
     "url": "https://kotakeducation.org/kotak-kanya-scholarship/", "fallbacks": ["https://www.kotakeducation.org/kotak-kanya-scholarship/"], "audience": "girl students", "tags": ["professional courses", "girls"]},
    {"key": "santoor", "name": "Santoor Women's Scholarship", "org": "Wipro Consumer Care & Wipro Cares",
     "url": "https://www.santoorscholarships.com/", "audience": "girl students from the states named on the official page", "tags": ["girls"]},
    {"key": "vidyasaarathi", "name": "Vidyasaarathi corporate scholarships portal", "org": "NSDL e-Governance (Protean)",
     "url": "https://www.vidyasaarathi.co.in/Vidyasaarathi/scholarship", "tags": ["portal", "corporate"]},
]


def run(fetcher: Fetcher, now: datetime):
    records, report = [], []
    for p in PAGES:
        html, used, why = fetch_first(fetcher, p)
        if html is None:
            report.append(f"{p['key']}={why}")
            continue
        p = {**p, "country": "India", "url": used}
        rec = build_page(p, html, now, source_id=SOURCE_ID, kind="scholarship", base_tags=["scholarship", "private"],
                         eligibility_label="You meet the scholarship's eligibility (course, year, marks, family income) on its official page",
                         source_type="official_org_site")
        rec["location"] = {"country": "India", "isNationwide": True}
        rec["workMode"] = "not_applicable"
        records.append(rec)
        report.append(f"{p['key']}={rec['declaredStatus']}" + (f" until {rec['deadline'][:10]}" if rec.get("deadline") else ""))
    return records, f"{len(records)}/{len(PAGES)} scholarship pages read. " + ", ".join(report)
