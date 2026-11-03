"""Offline tests for ats_jobs: sample payloads in each ATS's public API format."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import ats_jobs  # noqa: E402

NOW = datetime(2026, 11, 3, tzinfo=timezone.utc)

GREENHOUSE = {"jobs": [
    {"id": 101, "title": "Software Engineer Intern (Summer 2027)", "absolute_url": "https://job-boards.greenhouse.io/acme/jobs/101",
     "location": {"name": "Bengaluru, India"}, "offices": [], "updated_at": "2026-10-30T10:00:00Z", "departments": [{"name": "Engineering"}],
     "content": "&lt;p&gt;Pursuing B.Tech/BE in Computer Science, graduating in 2027 or 2028.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Python or Java&lt;/li&gt;&lt;li&gt;Data structures and algorithms&lt;/li&gt;&lt;/ul&gt;"},
    {"id": 102, "title": "Senior Software Engineer", "absolute_url": "https://x/102", "location": {"name": "Bengaluru, India"}, "offices": [], "content": "5+ years"},
    {"id": 103, "title": "Software Engineer Intern", "absolute_url": "https://x/103", "location": {"name": "San Francisco, CA"}, "offices": [], "content": ""},
    {"id": 104, "title": "Account Executive", "absolute_url": "https://x/104", "location": {"name": "Mumbai, India"}, "offices": [], "content": "freshers welcome"},
    {"id": 105, "title": "Software Engineer", "absolute_url": "https://x/105", "location": {"name": "Hyderabad, India"}, "offices": [],
     "content": "&lt;p&gt;We are hiring new graduates (batch of 2026). Skills: React, Node.js, SQL.&lt;/p&gt;"},
    {"id": 106, "title": "Software Engineer", "absolute_url": "https://x/106", "location": {"name": "Pune, India"}, "offices": [],
     "content": "&lt;p&gt;4+ years of experience building distributed systems.&lt;/p&gt;"},
]}
LEVER = [
    {"id": "abc", "text": "Data Science Intern", "hostedUrl": "https://jobs.lever.co/acme/abc", "applyUrl": "https://jobs.lever.co/acme/abc/apply",
     "categories": {"location": "Gurugram", "commitment": "Internship", "team": "Data"}, "country": "IN", "workplaceType": "hybrid",
     "descriptionPlain": "6-month internship. Pandas, SQL, machine learning.", "lists": [], "additionalPlain": "", "createdAt": 1793000000000},
]
ASHBY = {"jobs": [
    {"id": "z1", "title": "SDE 1 - Backend", "location": "Bengaluru", "secondaryLocations": [], "isListed": True, "employmentType": "FullTime",
     "descriptionPlain": "0-1 years of experience. Go (golang), Kubernetes, PostgreSQL.", "jobUrl": "https://jobs.ashbyhq.com/acme/z1",
     "applyUrl": "https://jobs.ashbyhq.com/acme/z1/application", "workplaceType": "OnSite", "publishedAt": "2026-10-28T00:00:00Z",
     "compensation": {"compensationTierSummary": "₹18L – ₹28L"}},
]}


class FakeFetcher:
    def get(self, url, **_):
        if "greenhouse" in url:
            return json.dumps({"name": "Acme"}) if url.endswith("/acme") else json.dumps(GREENHOUSE)
        if "lever" in url:
            return json.dumps(LEVER)
        return json.dumps(ASHBY)


def records():
    f = FakeFetcher()
    return ats_jobs.greenhouse(f, "acme", NOW) + ats_jobs.lever(f, "acme", NOW) + ats_jobs.ashby(f, "acme", NOW)


def test_filters_to_india_tech_student_roles():
    titles = {r["title"]: r["opportunityType"] for r in records()}
    assert titles == {
        "Software Engineer Intern (Summer 2027)": "internship",
        "Software Engineer": "job",  # new-grad posting (105); the 4+ years one (106) is dropped
        "Data Science Intern": "internship",
        "SDE 1 - Backend": "job",
    }


def test_extracts_facts_from_the_posting_only():
    by_title = {r["title"]: r for r in records()}
    intern = by_title["Software Engineer Intern (Summer 2027)"]
    assert intern["location"]["city"] == "Bengaluru" and intern["location"]["state"] == "Karnataka"
    assert {"Python", "Java", "Data structures & algorithms"} <= set(intern["preferredSkills"])
    rules = {r["key"]: r for r in intern["eligibilityRules"]}
    assert rules["grad_year"]["values"] == ["2027", "2028"] and rules["grad_year"]["mandatory"]
    assert set(rules["degree"]["values"]) >= {"B.Tech", "B.E."}
    assert rules["posting_requirements"]["kind"] == "self_declared"
    assert intern["deadline"] is None and intern["declaredStatus"] == "open"
    sde = by_title["SDE 1 - Backend"]
    assert sde["stipend"]["description"] == "₹18L – ₹28L" and sde["workMode"] == "onsite"
    assert by_title["Data Science Intern"]["workMode"] == "hybrid"
    assert all(r["externalId"].startswith("ats:") for r in records())
    # No nulls inside nested objects (importer rejects them).
    assert "None" not in json.dumps([r["location"] for r in records()]) and "null" not in json.dumps([r["eligibilityRules"] for r in records()])


if __name__ == "__main__":
    test_filters_to_india_tech_student_roles()
    test_extracts_facts_from_the_posting_only()
    Path("/tmp/claude-0/ats_sample.json").write_text(json.dumps(records(), ensure_ascii=False))
    print("ok", len(records()))


def test_regressions_from_first_real_run():
    # "Staff Engineer I" matched the entry-level pattern; senior words must always win.
    assert ats_jobs.classify("Staff Engineer I", "") is None
    assert ats_jobs.classify("Staff Engineer 1 – Salesforce AI", "freshers") is None
    # Bare "analyst" is not a tech role.
    assert ats_jobs.classify("Business Support Analyst (LMS Admin)", "0-1 years") is None
    assert ats_jobs.classify("Data Analyst", "0-1 years of experience") == ("job", 0)
    assert ats_jobs.company_name("Rubrik Job Board") == "Rubrik"
    assert ats_jobs.company_name("HackerRank Careers") == "HackerRank"


def test_minimum_experience_decides_early_career_roles():
    assert ats_jobs.classify("Software Engineer", "We need 1+ years of experience with Java.") == ("job", 1)
    assert ats_jobs.classify("Backend Developer", "1-3 years of professional experience") == ("job", 1)
    assert ats_jobs.classify("Software Engineer", "3+ years of experience. Freshers with strong projects may apply.") is None
    assert ats_jobs.classify("Software Engineer", "Build great things.") is None  # level unknown: skipped
    assert ats_jobs.classify("Software Engineer Intern", "5+ years") == ("internship", None)
    rec = ats_jobs.build(ats="lever", board="acme", job_id="x", company="Acme", title="Software Engineer", location="Pune, India",
                         text="Requires 1+ years of experience in Python.", url="https://x", apply_url=None, kind="job", now=NOW, min_years=1)
    exp = next(r for r in rec["eligibilityRules"] if r["key"] == "experience")
    assert exp["mandatory"] and "1 year" in exp["label"] and "early-career" in rec["tags"]


def test_regressions_from_full_discovery_run():
    # Lever commitment "Full-time Internal" is not an internship; senior roles never are.
    assert ats_jobs.classify("Senior Staff Engineer, Software Autonomy", "", "Full-time Internal") is None
    assert ats_jobs.classify("Staff Autonomy Integration Engineer", "", "Intern") is None
    assert ats_jobs.classify("Systems Test Engineer", "0-1 years of experience", "Internal") == ("job", 0)
    # Non-tech roles that matched broad words.
    assert ats_jobs.classify("Research Analyst, Companies & Transactions", "0-1 years of experience") is None
    assert ats_jobs.classify("Research Associate, Invivo Pharmacology", "1+ years of experience") is None
    assert ats_jobs.classify("FP&A Systems Analyst", "1+ years of experience") is None
    assert ats_jobs.classify("Research Engineer, Applied ML", "1+ years of experience") == ("job", 1)
    # Same role in several cities becomes one record.
    a = ats_jobs.build(ats="greenhouse", board="wpp", job_id="1", company="WPP", title="Back End Engineer", location="Gurgaon, India",
                       text="0-1 years of experience", url="https://x/1", apply_url=None, kind="job", now=NOW)
    b = ats_jobs.build(ats="greenhouse", board="wpp", job_id="2", company="WPP", title="Back End Engineer", location="Pune, India",
                       text="0-1 years of experience", url="https://x/2", apply_url=None, kind="job", now=NOW)
    merged = ats_jobs.merge_duplicates([a, b])
    assert len(merged) == 1 and "Pune" in merged[0]["location"]["description"]
    assert "jobgether" not in ats_jobs.boards_to_read().get("greenhouse", [])
