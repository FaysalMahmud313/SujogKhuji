from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
DHAKA = timezone(timedelta(hours=6))
MAX_ITEMS = 800
KEEP_UNDATED_DAYS = 21
STALE_UNDATED_DAYS = 60
MAX_FUTURE_DAYS = 540

EXCLUDED_DOMAINS = [
    "facebook.com", "instagram.com", "tiktok.com", "x.com", "twitter.com", "youtube.com",
    "pinterest.com", "reddit.com", "quora.com", "threads.net", "t.me", "medium.com",
]
BD_DOMAINS = ("bdjobs.com", "bdrecruit.net", "skill.jobs", "chakri.com", "jobs.com.bd", "careerjet.com.bd")
BD_PLACES = re.compile(
    r"\b(bangladesh|dhaka|chattogram|chittagong|sylhet|rajshahi|khulna|barishal|rangpur|mymensingh|gazipur|narayanganj|cumilla|comilla)\b",
    re.I,
)

CATEGORY_RULES = [
    ("competition", re.compile(r"\b(hackathon|competition|contest|challenge|olympiad|ideathon|datathon|case comp|championship)\b", re.I)),
    ("scholarship", re.compile(r"\b(scholarships?|bursary|studentship|tuition waiver|funded (master|masters|phd|degree|study))\b", re.I)),
    ("program", re.compile(r"\b(fellowships?|exchange program(me)?|summer school|winter school|conference|summit|youth program(me)?|leadership program(me)?|bootcamp|accelerator|incubator|ambassador program(me)?|camp)\b", re.I)),
    ("internship", re.compile(r"\b(intern|interns|internship|internships|apprentice|apprenticeship)\b", re.I)),
    ("job", re.compile(r"\b(job|jobs|vacancy|vacancies|circular|engineer|developer|officer|executive|analyst|associate|trainee|recruitment|position|hiring|career|careers|graduate program(me)?)\b", re.I)),
]
NOT_AN_OPENING = re.compile(
    r"^\s*(\d+\+?\s+|top\s+)|\b(how to|tips|guide|what is|why you|list of|best ways|ways to|interview questions|"
    r"salary guide|news|faq|calculator|winners?|results|announced|announces|reveals|partners with|join forces|"
    r"launches|achievement|champions?|celebrates|congratulat\w*|recap|highlights|to host|hosted|wins|won)\b",
    re.I,
)
GENERIC_START = re.compile(
    r"^\s*(scholarships|internships|jobs|vacancies|careers|funding|study abroad|cgpa|internship vacancies|"
    r"fellowship programs|graduate jobs|student jobs|part[- ]time jobs)\b",
    re.I,
)
ATS_HOSTS = ("lever", "greenhouse", "workday", "myworkdayjobs", "smartrecruiters", "ashbyhq", "bamboohr", "jobvite",
             "icims", "recruitee", "teamtailor", "workable", "breezy", "applytojob")
LISTING_PAGE = re.compile(r"\b(jobs|vacancies|openings|internships)\s+(in|for|near)\b|\bsearch (jobs|&|and apply)\b", re.I)
NEWS_DOMAINS = ("tbsnews.net", "thedailystar.net", "dhakatribune.com", "bssnews.net", "prothomalo.com", "thepienews.com",
                "postregister.com", "lankabusinessnews.com", "bdnews24.com", "newagebd.net", "businesspostbd.com")
GENERIC_WORDS = {
    "career", "careers", "job", "jobs", "search", "latest", "current", "portal", "vacancy", "vacancies", "opening",
    "openings", "internship", "internships", "intern", "interns", "programme", "program", "programs", "programmes",
    "opportunity", "opportunities", "scholarship", "scholarships", "award", "awards", "and", "at", "in", "the", "for",
    "apply", "now", "online", "bangladesh", "global", "international", "students", "student", "costs", "financial",
    "aid", "home", "page", "of", "our", "join", "us", "work", "with", "fellowship", "fellowships", "funding", "circular",
}
INDEX_PATH = re.compile(r"/(tag|tags|category|categories|search|page/\d+|author)(/|$)|[?&](s|q|search)=", re.I)

FULL_FUNDING = re.compile(
    r"\bfully[- ]funded\b|\bfull(y)? scholarship\b|\bfull tuition\b|\bfull funding\b|\ball expenses (paid|covered)\b|"
    r"\bcovers? (all|full) (costs|expenses)\b",
    re.I,
)
PARTIAL_FUNDING = re.compile(
    r"\bpartial(ly)?[- ]funded\b|\bpartial scholarship\b|\bpartial funding\b|\btuition (fee )?(waiver|reduction|discount)\b",
    re.I,
)

MONTHS = {m: i for i, names in enumerate(
    [("jan", "january"), ("feb", "february"), ("mar", "march"), ("apr", "april"), ("may",), ("jun", "june"),
     ("jul", "july"), ("aug", "august"), ("sep", "sept", "september"), ("oct", "october"), ("nov", "november"),
     ("dec", "december")], start=1) for m in names}
MONTH_RE = r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
DATE_PATTERNS = [
    (re.compile(r"\b(20\d\d)-(\d{1,2})-(\d{1,2})\b"), "ymd"),
    (re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s*(?:of\s+)?{MONTH_RE}\.?,?\s*(20\d\d)\b", re.I), "dmy_name"),
    (re.compile(rf"\b{MONTH_RE}\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?,?\s*(20\d\d)\b", re.I), "mdy_name"),
    (re.compile(r"\b(\d{1,2})[/.](\d{1,2})[/.](20\d\d)\b"), "numeric"),
]
DEADLINE_WORDS = re.compile(
    r"(deadline|apply by|apply before|applications? (close|closes|due|deadline)|last date|closing date|closes on|"
    r"close on|due date|due by|submission (deadline|date)|submit by|registration (deadline|closes|ends)|register by|"
    r"ends on|valid (till|until)|open until|accepting applications until)",
    re.I,
)

CURRENCY = r"(?:৳|BDT|Tk\.?|Taka|\$|USD|US\$|€|EUR|£|GBP|¥|JPY|INR|₹)"
AMOUNT = r"\d[\d,]*(?:\.\d+)?\s?(?:k|K)?"
PAY_RE = re.compile(
    rf"({CURRENCY}\s?{AMOUNT}(?:\s?(?:-|–|to)\s?{CURRENCY}?\s?{AMOUNT})?|{AMOUNT}(?:\s?(?:-|–|to)\s?{AMOUNT})?\s?(?:BDT|Taka|Tk|USD|EUR|GBP|yen|JPY))"
    r"(\s?(?:per|/|a)\s?(?:month|mo|year|yr|annum|day|hour|hr|week))?",
    re.I,
)
PAY_WORDS = re.compile(r"(salary|stipend|allowance|compensation|remuneration|pay(ment)?|wage|award amount|prize)", re.I)


def today() -> date:
    return datetime.now(DHAKA).date()


def log(msg: str) -> None:
    print(msg, flush=True)


def load_env_key(name: str) -> str:
    value = os.getenv(name, "").strip()
    if value:
        return value
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith(f"{name}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def fill(template: str) -> str:
    now = today()
    return template.format(year=now.year, next_year=now.year + 1, month=now.strftime("%B"))


ENGINE = ROOT / "scripts" / "engine.mjs"
ENGINE_VARS = (
    "TAVILY_API_KEY", "SERPER_API_KEY", "EXA_API_KEY", "TAVILY_MONTHLY_CAP", "SERPER_TOTAL_CAP", "EXA_MONTHLY_CAP",
    "GROQ_API_KEY", "GROQ_MODEL", "GROQ_FALLBACK_MODEL", "GROQ_DAILY_CAP", "GROQ_FAST_DAILY_CAP",
    "GEMINI_API_KEY", "GEMINI_BILLING_DISABLED", "GEMINI_MODEL", "GEMINI_DAILY_CAP",
    "OPENROUTER_API_KEY", "OPENROUTER_MODELS", "OPENROUTER_DAILY_CAP", "AI_ORDER", "AI_DAILY_CAP", "AI_MAX_PER_RUN",
)
DATABASE_VARS = ("SUPABASE_URL", "SUPABASE_ANON_KEY", "INGEST_SECRET")


def run_engine(command: str, payload: dict, use_database: bool, timeout: int = 900) -> dict | None:
    node = shutil.which("node")
    if not node or not ENGINE.exists():
        log("engine: Node.js is not installed, so searching and AI checks are skipped")
        return None
    env = {k: v for k, v in os.environ.items() if k not in ENGINE_VARS + DATABASE_VARS}
    for name in ENGINE_VARS + (DATABASE_VARS if use_database else ()):
        value = load_env_key(name)
        if value:
            env[name] = value
    try:
        done = subprocess.run([node, str(ENGINE)], input=json.dumps({"command": command, **payload}), capture_output=True,
                              text=True, encoding="utf-8", env=env, timeout=timeout)
    except subprocess.TimeoutExpired:
        log(f"engine: {command} took too long and was stopped")
        return None
    for line in (done.stderr or "").splitlines():
        if line.strip():
            log(line.strip())
    if done.returncode != 0:
        return None
    try:
        return json.loads(done.stdout or "{}")
    except json.JSONDecodeError:
        log(f"engine: {command} returned unreadable output")
        return None


def domain_of(url: str) -> str:
    host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    try:
        return host.encode("idna").decode("ascii")
    except (UnicodeError, ValueError):
        return host.encode("ascii", "backslashreplace").decode("ascii")


def parse_date(kind: str, m: re.Match) -> date | None:
    try:
        if kind == "ymd":
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        if kind == "dmy_name":
            return date(int(m.group(3)), MONTHS[m.group(2).lower()], int(m.group(1)))
        if kind == "mdy_name":
            return date(int(m.group(3)), MONTHS[m.group(1).lower()], int(m.group(2)))
        a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if a > 12:
            return date(y, b, a)
        if b > 12:
            return date(y, a, b)
        return date(y, b, a)
    except (ValueError, KeyError):
        return None


def deadline_of(text: str) -> tuple[str | None, bool]:
    now = today()
    found: list[date] = []
    for kw in DEADLINE_WORDS.finditer(text):
        window = text[kw.start(): kw.end() + 120]
        for pattern, kind in DATE_PATTERNS:
            for m in pattern.finditer(window):
                d = parse_date(kind, m)
                if d and (now - timedelta(days=400)) <= d <= now + timedelta(days=MAX_FUTURE_DAYS):
                    found.append(d)
    if not found:
        return None, False
    future = [d for d in found if d >= now]
    if future:
        return min(future).isoformat(), False
    return None, True


def funding_of(title: str, body: str) -> str | None:
    if FULL_FUNDING.search(title):
        return "full"
    if PARTIAL_FUNDING.search(title):
        return "partial"
    full, partial = bool(FULL_FUNDING.search(body)), bool(PARTIAL_FUNDING.search(body))
    if full and not partial:
        return "full"
    if partial and not full:
        return "partial"
    return None


def pay_of(text: str) -> str | None:
    for kw in PAY_WORDS.finditer(text):
        window = text[kw.end(): kw.end() + 90]
        if re.search(r"negotiable|competitive|not (disclosed|mentioned)", window[:40], re.I):
            return None
        m = PAY_RE.search(window)
        if m and re.search(r"\d", m.group(0)):
            value = re.sub(r"\s+", " ", m.group(0)).strip(" .,")
            digits = re.sub(r"\D", "", value)
            if len(digits) >= 2:
                return value[:40]
    if re.search(r"\b(this is an|is an|an) unpaid (internship|position)\b", text[:1500], re.I):
        return "Unpaid"
    return None


def category_of(title: str, fallback: str) -> str | None:
    for name, rule in CATEGORY_RULES:
        if rule.search(title):
            return name
    return None if fallback is None else fallback


def region_of(title: str, domain: str, snippet: str, query_region: str, category: str) -> str:
    labels = domain.split(".")
    if domain.endswith(".bd") or any(domain == d or domain.endswith("." + d) for d in BD_DOMAINS):
        return "BD"
    if any(len(l) > 3 and l.endswith("bd") for l in labels[:-1]):
        return "BD"
    if BD_PLACES.search(title) and not re.search(r"\bfor bangladeshi\b", title, re.I):
        return "BD"
    if query_region == "BD" and category in ("job", "internship") and BD_PLACES.search(snippet[:400]):
        return "BD"
    return "GLOBAL"


def site_tokens(domain: str) -> set[str]:
    return {t for t in re.split(r"[.\-]", domain) if len(t) > 1}


def too_generic(title: str, domain: str) -> bool:
    words = [w for w in re.findall(r"[a-z0-9]+", title.lower()) if not re.fullmatch(r"\d+", w)]
    meaningful = [w for w in words if w not in GENERIC_WORDS and w not in site_tokens(domain) and len(w) > 1]
    return len(meaningful) < 2


def title_dates(title: str) -> list[date]:
    out = []
    for pattern, kind in DATE_PATTERNS:
        for m in pattern.finditer(title):
            d = parse_date(kind, m)
            if d:
                out.append(d)
    return out


def old_edition(title: str) -> bool:
    years = [int(y) for y in re.findall(r"\b(20\d\d)\b", title)]
    return bool(years) and max(years) < today().year


DEDUPE_DROP = {"in", "the", "of", "for", "at", "and", "a", "program", "programme", "fully", "partially", "funded",
               "apply", "now", "online", "s", "dates", "registration", "open"}


def dedupe_key(title: str) -> str:
    t = re.sub(r"\(.*?\)|\[.*?\]", " ", title.lower())
    t = re.sub(r"[(\[].*$", " ", t)
    t = re.sub(r"\b20\d\d\b", " ", t)
    words = [w for w in re.findall(r"[a-z0-9]+", t) if w not in DEDUPE_DROP]
    return " ".join(words[:5])


def clean_title(title: str, domain: str) -> str:
    title = re.sub(r"\s+", " ", title).strip()
    title = re.sub(r"\s*[(\[]?\s*apply now\s*[)\]]?\s*$", "", title, flags=re.I)
    site_tokens = {t for t in re.split(r"[.\-]", domain) if len(t) > 2}
    parts = re.split(r"\s+[|–—]\s+|\s+-\s+", title)
    while len(parts) > 1:
        tail = parts[-1].lower()
        tail_tokens = set(re.findall(r"[a-z0-9]+", tail))
        prefix_of_site = any(label.startswith(t) for t in tail_tokens if len(t) >= 3 for label in site_tokens)
        if tail_tokens & site_tokens or prefix_of_site or tail in ("careers", "jobs", "home", "official website") or len(tail) <= 3:
            parts.pop()
        else:
            break
    return " - ".join(parts)[:120].strip(" -")


def org_of(title: str, domain: str) -> str | None:
    def ok(org: str) -> bool:
        return (
            4 <= len(org) <= 48
            and not re.search(r"\b(apply|now|online|registration|deadline|dates|20\d\d)\b", org, re.I)
            and not any(rule.search(org) for _, rule in CATEGORY_RULES)
        )

    first, _, rest = title.partition(" - ")
    if rest and ok(first.strip()) and any(rule.search(rest) for _, rule in CATEGORY_RULES):
        return first.strip()
    patterns = [
        r"\b(?:at|@)\s+([A-Z][\w&.,'’\- ]{2,48}?)(?:\s+[-|–—(:]|\s+in\s+|$)",
        r"^([A-Z][\w&.'’\- ]{2,48}?)\s+(?:is\s+)?(?:hiring|recruits?|invites|offers|opens)\b",
    ]
    for p in patterns:
        m = re.search(p, title)
        if not m:
            continue
        org = m.group(1).strip(" ,.-")
        if ok(org) and (" " in org or (org.isupper() and len(org) >= 3)):
            return org
    host = domain.split(".")
    if len(host) >= 3 and host[0] in ("careers", "career") and host[1] not in ATS_HOSTS:
        return host[1].capitalize()
    m = re.match(r"^([a-z]{3,})careers\.", domain)
    if m:
        return m.group(1).capitalize()
    return None


def summary_of(content: str) -> str:
    text = re.sub(r"[#*_`>\[\]]+", " ", content or "")
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= 240:
        return text
    cut = text[:240].rsplit(" ", 1)[0]
    return cut + "…"


def published_of(value) -> str | None:
    if not value:
        return None
    text = str(value).strip()
    m = re.match(r"(\d{4}-\d{2}-\d{2})", text)
    if m:
        return m.group(1)
    try:
        return parsedate_to_datetime(text).date().isoformat()
    except (TypeError, ValueError, IndexError):
        return None


NUMBER_WORDS = {"zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
                "nine": 9, "ten": 10, "twelve": 12, "fifteen": 15}
NUM = r"(\d{1,2}|zero|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen)"
YEARS = r"(?:years?|yrs?)"
EXPERIENCE_WORD = re.compile(r"\bexperience[ds]?\b|\bexp\b", re.I)
EXP_RANGE = re.compile(rf"\b{NUM}\s*\+?\s*(?:-|–|—|to)\s*{NUM}\s*\+?\s*{YEARS}", re.I)
EXP_MIN = re.compile(rf"\b(?:minimum|min\.?|at least|over|more than|above|not less than)\s*(?:of\s*)?{NUM}\s*\+?\s*{YEARS}", re.I)
EXP_PLUS = re.compile(rf"\b{NUM}\s*\+\s*{YEARS}", re.I)
EXP_PLAIN = re.compile(rf"\b{NUM}\s*{YEARS}(?:['’]s?)?\s*(?:of\s+)?(?:[a-z/&-]+\s+){{0,3}}?(?:experience|exp)\b", re.I)
FRESHER = re.compile(
    r"\b(freshers?|fresh graduates?|freshly graduated|no (?:prior |previous |work )?experience (?:is )?(?:required|needed|necessary)|"
    r"experience (?:is )?not required|entry[- ]level|new grads?|new graduates?|recent graduates?|graduate trainee|"
    r"management trainee|campus hiring|0\s*(?:-|–|to)\s*\d{1,2}\s*years?)\b",
    re.I,
)
SENIOR_TITLE = re.compile(r"\b(sr\.?|senior|lead|principal|staff|manager|head of|director|chief|vice president|vp|architect|professor)\b", re.I)
MID_TITLE = re.compile(r"\b(mid[- ]level|intermediate|ii|iii|specialist)\b", re.I)
STRONG_ENTRY_TITLE = re.compile(r"\b(graduate program(me)?|new grads?|trainee|intern|internship|apprentice(ship)?|fresher)\b", re.I)
ENTRY_TITLE = re.compile(r"\b(junior|jr\.?|entry|graduate|trainee|intern|internship|apprentice|associate|assistant|fresher)\b", re.I)


def _num(value: str) -> int | None:
    value = value.lower()
    if value.isdigit():
        return int(value)
    return NUMBER_WORDS.get(value)


def level_for(years: int) -> str:
    return "entry" if years <= 1 else "mid" if years <= 4 else "senior"


def experience_of(title: str, text: str, category: str) -> tuple[int | None, int | None, str | None]:
    found: tuple[int, int | None] | None = None
    for kw in EXPERIENCE_WORD.finditer(text):
        window = text[max(0, kw.start() - 110): kw.end() + 70]
        for pattern, kind in ((EXP_RANGE, "range"), (EXP_MIN, "min"), (EXP_PLUS, "min"), (EXP_PLAIN, "min")):
            m = pattern.search(window)
            if not m:
                continue
            low = _num(m.group(1))
            high = _num(m.group(2)) if kind == "range" else None
            if low is None or low > 30 or (high is not None and (high < low or high > 40)):
                continue
            found = (low, high)
            break
        if found:
            break
    if found and found[0] <= 2 and STRONG_ENTRY_TITLE.search(title):
        return 0, None, "entry"
    if found:
        return found[0], found[1], level_for(found[0])
    if FRESHER.search(title) or FRESHER.search(text[:15000]):
        return 0, None, "entry"
    if SENIOR_TITLE.search(title):
        return None, None, "senior"
    if MID_TITLE.search(title):
        return None, None, "mid"
    if category == "internship" or ENTRY_TITLE.search(title):
        return 0, None, "entry"
    return None, None, None


TRUSTED_DOMAINS = {
    "bdjobs.com", "linkedin.com", "indeed.com", "glassdoor.com", "wellfound.com", "unjobs.org", "impactpool.org",
    "reliefweb.int", "devex.com", "opportunitydesk.org", "scholars4dev.com", "daad.de", "chevening.org",
    "britishcouncil.org", "fulbrightonline.org", "studyinjapan.go.jp", "campusfrance.org", "nuffic.nl", "si.se",
    "undp.org", "unicef.org", "unesco.org", "who.int", "worldbank.org", "adb.org", "imf.org", "un.org", "ilo.org",
    "brac.net", "icddrb.org", "bb.org.bd", "grameenphone.com", "bkash.com", "robi.com.bd", "banglalink.net", "bracbank.com",
    "unilever.com", "nestle.com", "danone.com", "google.com", "microsoft.com", "amazon.jobs", "apple.com",
    "metacareers.com", "ibm.com", "oracle.com", "samsung.com", "intel.com", "nvidia.com", "palantir.com",
    "hennge.com", "devpost.com", "mlh.io", "kaggle.com", "hackerearth.com", "unstop.com", "devfolio.co",
    "greenhouse.io", "lever.co", "myworkdayjobs.com", "smartrecruiters.com", "ashbyhq.com", "workable.com",
    "atlanticcouncil.org", "ned.org", "odoo.com", "xylem.com",
}
TRUSTED_ENDINGS = (".int", ".europa.eu")
OFFICIAL_SUFFIX = re.compile(r"(?:^|\.)(gov|mil|edu)(?:\.[a-z]{2})?$|(?:^|\.)(go|ac)\.[a-z]{2}$")


def suffix_kind(domain: str) -> str | None:
    m = OFFICIAL_SUFFIX.search(ascii_domain(domain))
    if not m:
        return None
    return "government" if (m.group(1) or m.group(2)) in ("gov", "mil", "go") else "university"

SCRIPT_NAMES = ("LATIN", "CYRILLIC", "GREEK", "ARMENIAN", "HEBREW", "ARABIC", "BENGALI", "DEVANAGARI", "CJK",
                "HIRAGANA", "KATAKANA", "HANGUL", "THAI")
LOOKALIKE_SCRIPTS = {"CYRILLIC", "GREEK", "ARMENIAN"}


def ascii_domain(domain: str) -> str:
    try:
        return domain.encode("idna").decode("ascii").lower()
    except (UnicodeError, ValueError):
        return domain.encode("ascii", "backslashreplace").decode("ascii").lower()


def label_scripts(label: str) -> set[str]:
    scripts = set()
    for ch in label:
        if not ch.isalpha():
            continue
        name = unicodedata.name(ch, "")
        scripts.add(next((s for s in SCRIPT_NAMES if name.startswith(s)), "OTHER"))
    return scripts


def suspicious_domain(domain: str) -> bool:
    for label in ascii_domain(domain).split("."):
        if not label.startswith("xn--"):
            if not re.fullmatch(r"[a-z0-9-]*", label):
                return True
            continue
        try:
            shown = label.encode("ascii").decode("idna")
        except (UnicodeError, ValueError):
            return True
        scripts = label_scripts(shown)
        if len(scripts) > 1 or scripts & LOOKALIKE_SCRIPTS or "OTHER" in scripts:
            return True
    return False


def is_trusted(domain: str) -> bool:
    domain = ascii_domain(domain)
    if suspicious_domain(domain):
        return False
    if any(domain == d or domain.endswith("." + d) for d in TRUSTED_DOMAINS):
        return True
    return domain.endswith(TRUSTED_ENDINGS) or suffix_kind(domain) is not None


MONEY = r"(?:৳|bdt|tk\.?|taka|rs\.?|inr|₹|\$|usd|us\$|€|eur|£|gbp)"
FEE_WORD = r"(?:registration|processing|application|admission|training|security|service|form|enrol?lment|visa|medical)"
FEE_WITH_AMOUNT = re.compile(
    rf"\b{FEE_WORD}\s+(?:fees?|charges?|money|deposit)\b[^.\n]{{0,60}}?{MONEY}\s?\d|"
    rf"{MONEY}\s?\d[\d,]*[^.\n]{{0,40}}?\b{FEE_WORD}\s+(?:fees?|charges?|deposit)\b|"
    rf"\b{FEE_WORD}\s+(?:fees?|charges?|deposit)\b[^.\n]{{0,25}}?\d[\d,]*\s?{MONEY}",
    re.I,
)
FEE_NEGATION = re.compile(
    r"\b(no|without|zero|free of|waive[ds]?|waiver|not required|not charged|don[’']?t (pay|charge)|never (pay|charge)|"
    r"does not charge|do not charge|is free|exempt)\b",
    re.I,
)
SCAM_ALWAYS = [
    ("payment number", re.compile(r"\b(bkash|nagad|rocket|upay)\b[^.\n]{0,40}?\b01[3-9]\d[\d -]{7,10}\b", re.I)),
    ("payment number", re.compile(r"\b01[3-9]\d[\d -]{7,10}\b[^.\n]{0,30}?\b(bkash|nagad|rocket|upay)\b", re.I)),
    ("send money", re.compile(r"\bsend (the |your )?(money|payment|fee|amount)\b|\b(pay|transfer)[^.\n]{0,30}\b(via|through|by|to) (bkash|nagad|rocket|upay)\b", re.I)),
    ("whatsapp only", re.compile(r"\bwhats\s?app only\b|\bonly (on|via|through|by) whats\s?app\b|\b(contact|apply|message)( us)? only (on|via|through) whats\s?app\b", re.I)),
    ("guarantee", re.compile(r"\bguaranteed (job|visa|placement|selection|income|offer)\b|\b100\s?% (job|visa|placement) guarantee|\b(job|visa) guarantee\b", re.I)),
]


def scam_reason(text: str, trusted: bool = False) -> str | None:
    sample = text[:20000]
    for reason, pattern in SCAM_ALWAYS:
        if pattern.search(sample):
            return reason
    if trusted:
        return None
    for m in FEE_WITH_AMOUNT.finditer(sample):
        around = sample[max(0, m.start() - 40): m.end() + 40]
        if not FEE_NEGATION.search(around):
            return "fee"
    return None


JOB_TYPES = [
    ("part-time", re.compile(r"\bpart[- ]?time\b", re.I)),
    ("freelance", re.compile(r"\b(freelance|freelancer|freelancing|gig work|per[- ]project)\b", re.I)),
    ("contract", re.compile(r"\b(contractual|contract (basis|position|role|job|type|staff|period)|on contract|fixed[- ]term|"
                            r"temporary (position|role|job|staff)|\d+[- ](month|year)s? contract|consultancy|consultant)\b", re.I)),
    ("full-time", re.compile(r"\bfull[- ]?time\b|\bpermanent (position|role|job|staff)\b", re.I)),
]
JOB_TYPE_LABEL = re.compile(r"\b(?:job (?:type|nature)|employment (?:type|status|nature)|type of (?:employment|contract)|position type|contract type)\s*[:\-–]?\s*([^\n.;|]{0,40})", re.I)


def job_type_of(title: str, text: str, category: str) -> str | None:
    if category not in ("job", "internship"):
        return None
    for name, pattern in JOB_TYPES:
        if pattern.search(title):
            return name
    label = JOB_TYPE_LABEL.search(text[:12000])
    if label:
        for name, pattern in JOB_TYPES:
            if pattern.search(label.group(1)):
                return name
    sample = text[:6000]
    hits = [(m.start(), name) for name, pattern in JOB_TYPES for m in [pattern.search(sample)] if m]
    return min(hits)[1] if hits else None


REMOTE = re.compile(r"\b(remote|remotely|work[- ]from[- ]home|wfh|work[- ]from[- ]anywhere|telecommut\w+|virtual (?:internship|position|role|program(?:me)?)|home[- ]based)\b", re.I)
NOT_REMOTE = re.compile(r"\b(?:not|no|non)[- ]remote\b|\bremote (?:work )?(?:is )?not (?:available|possible|an option)\b|\bno remote (?:work|option)\b", re.I)
HYBRID = re.compile(r"\bhybrid\b", re.I)
ONSITE = re.compile(r"\b(on[- ]?site|in[- ]office|in[- ]person|office[- ]based|on[- ]campus|must relocate|relocation (?:is )?required)\b", re.I)
WORK_MODE_LABEL = re.compile(r"\b(?:workplace(?: type)?|work (?:mode|model|arrangement|location)|location type|job location|working model)\s*[:\-–]?\s*([^\n.;|]{0,40})", re.I)


TITLE_REMOTE = re.compile(r"\bvirtual\b|\bonline (?:hackathon|competition|contest|event|internship|program(?:me)?|bootcamp|fellowship|challenge)\b|\b(?:hackathon|competition|internship|challenge)\b[^|]{0,25}\bonline\b", re.I)


def mode_in(fragment: str) -> str | None:
    if HYBRID.search(fragment):
        return "hybrid"
    if NOT_REMOTE.search(fragment):
        return "onsite"
    if REMOTE.search(fragment):
        return "remote"
    if ONSITE.search(fragment):
        return "onsite"
    return None


def work_mode_of(title: str, text: str) -> str | None:
    found = mode_in(title) or ("remote" if TITLE_REMOTE.search(title) else None)
    if found:
        return found
    label = WORK_MODE_LABEL.search(text[:12000])
    if label:
        found = mode_in(label.group(1))
        if found:
            return found
    return mode_in(text[:5000])


COUNTRIES = {
    "Bangladesh": r"bangladesh|dhaka|chattogram|chittagong|sylhet|rajshahi|khulna|gazipur",
    "United States": r"united states|u\.s\.a?\.?|usa|america|new york|california|washington,? d\.?c\.?|boston|san francisco|texas|chicago",
    "United Kingdom": r"united kingdom|u\.k\.|uk|england|scotland|wales|britain|london|oxford|cambridge|manchester",
    "Germany": r"germany|berlin|munich|hamburg|frankfurt",
    "Japan": r"japan|tokyo|osaka|kyoto",
    "Canada": r"canada|toronto|vancouver|montreal|ontario",
    "Australia": r"australia|sydney|melbourne|brisbane",
    "India": r"india|bengaluru|bangalore|hyderabad|mumbai|delhi|pune|chennai",
    "China": r"china|beijing|shanghai|shenzhen",
    "South Korea": r"south korea|korea|seoul",
    "Netherlands": r"netherlands|holland|amsterdam|rotterdam",
    "France": r"france|paris",
    "Sweden": r"sweden|stockholm",
    "Switzerland": r"switzerland|zurich|geneva",
    "Italy": r"italy|rome|milan",
    "Spain": r"spain|madrid|barcelona",
    "Singapore": r"singapore",
    "Malaysia": r"malaysia|kuala lumpur",
    "United Arab Emirates": r"united arab emirates|uae|dubai|abu dhabi",
    "Saudi Arabia": r"saudi arabia|riyadh|jeddah|ksa",
    "Qatar": r"qatar|doha",
    "Turkey": r"turkey|türkiye|turkiye|istanbul|ankara",
    "Hungary": r"hungary|budapest",
    "Finland": r"finland|helsinki",
    "Norway": r"norway|oslo",
    "Denmark": r"denmark|copenhagen",
    "Ireland": r"ireland|dublin",
    "New Zealand": r"new zealand|auckland",
    "Belgium": r"belgium|brussels",
    "Austria": r"austria|vienna",
    "Thailand": r"thailand|bangkok",
    "Indonesia": r"indonesia|jakarta",
    "Pakistan": r"pakistan|karachi|lahore|islamabad",
    "Sri Lanka": r"sri lanka|colombo",
    "Nepal": r"nepal|kathmandu",
    "Brunei": r"brunei",
    "Russia": r"russia|moscow",
    "Poland": r"poland|warsaw",
    "Czechia": r"czech republic|czechia|prague",
    "Portugal": r"portugal|lisbon",
    "Egypt": r"egypt|cairo",
    "South Africa": r"south africa|cape town|johannesburg",
    "Kenya": r"kenya|nairobi",
    "Nigeria": r"nigeria|lagos",
    "Brazil": r"brazil|são paulo|sao paulo",
    "Mexico": r"mexico",
    "Hong Kong": r"hong kong",
    "Taiwan": r"taiwan|taipei",
    "Vietnam": r"vietnam|hanoi|ho chi minh",
    "Philippines": r"philippines|manila",
}
COUNTRY_RES = [(name, re.compile(rf"(?<![A-Za-z])(?:{pattern})(?![A-Za-z])", re.I)) for name, pattern in COUNTRIES.items()]
COUNTRY_TLDS = {
    "bd": "Bangladesh", "uk": "United Kingdom", "de": "Germany", "jp": "Japan", "ca": "Canada", "au": "Australia",
    "in": "India", "cn": "China", "kr": "South Korea", "nl": "Netherlands", "fr": "France", "se": "Sweden",
    "ch": "Switzerland", "it": "Italy", "es": "Spain", "sg": "Singapore", "my": "Malaysia", "ae": "United Arab Emirates",
    "sa": "Saudi Arabia", "qa": "Qatar", "tr": "Turkey", "hu": "Hungary", "fi": "Finland", "no": "Norway",
    "dk": "Denmark", "ie": "Ireland", "nz": "New Zealand", "be": "Belgium", "at": "Austria", "th": "Thailand",
    "id": "Indonesia", "pk": "Pakistan", "lk": "Sri Lanka", "np": "Nepal", "bn": "Brunei", "ru": "Russia",
    "pl": "Poland", "cz": "Czechia", "pt": "Portugal", "eg": "Egypt", "za": "South Africa", "ke": "Kenya",
    "ng": "Nigeria", "br": "Brazil", "mx": "Mexico", "hk": "Hong Kong", "tw": "Taiwan", "vn": "Vietnam",
    "ph": "Philippines", "edu": "United States", "gov": "United States", "mil": "United States",
}
SHORT_NAMES = ("uk", "usa", "uae", "ksa")
LOCATION_LABEL = re.compile(r"\b(?:location|job location|duty station|country|host country|venue|based in|work location|place of work|study in|hosted in|held in)\s*[:\-–]?\s*([^\n;|]{0,80})", re.I)
NATIONALITY_CONTEXT = re.compile(r"\b(?:for|from|citizens? of|nationals? of|students (?:from|of)|applicants (?:from|of))\s+$", re.I)


def countries_in(fragment: str, skip_nationality: bool = True) -> list[tuple[int, str]]:
    hits = []
    for name, pattern in COUNTRY_RES:
        for m in pattern.finditer(fragment):
            word = m.group(0)
            if word.lower() in SHORT_NAMES and word != word.upper():
                continue
            if skip_nationality and NATIONALITY_CONTEXT.search(fragment[max(0, m.start() - 24): m.start()]):
                continue
            hits.append((m.start(), name))
            break
    return sorted(hits)


def country_of(title: str, text: str, domain: str, region: str) -> str | None:
    for place in re.finditer(r"\b(?:in|at)\s+(?:the\s+)?([^,()|]{2,40})", title):
        hits = countries_in(place.group(1), skip_nationality=False)
        if hits:
            return hits[0][1]
    hits = countries_in(title)
    if hits:
        return hits[0][1]
    for label in LOCATION_LABEL.finditer(text[:12000]):
        hits = countries_in(label.group(1), skip_nationality=False)
        if hits:
            return hits[0][1]
    tld = ascii_domain(domain).rsplit(".", 1)[-1]
    if tld in COUNTRY_TLDS:
        return COUNTRY_TLDS[tld]
    if region == "BD":
        return "Bangladesh"
    return None


EDUCATION_LEVELS = [
    ("school", re.compile(r"\b(s\.?s\.?c|h\.?s\.?c|high school|secondary school|higher secondary|a[- ]levels?|o[- ]levels?|class (?:8|eight|10|ten|12|twelve))\b", re.I)),
    ("diploma", re.compile(r"\bdiploma\b", re.I)),
    ("bachelor", re.compile(r"\b(bachelor[’']?s?|b\.?sc\.?|bba|b\.?tech|b\.?eng|b\.?com|undergraduates?|undergrad|honou?rs|graduation degree|university graduates?|4[- ]year degree|final[- ]year students?)\b", re.I)),
    ("master", re.compile(r"\b(master[’']?s?|m\.?sc\.?|mba|m\.?phil|m\.?tech|m\.?eng|postgraduates?|post[- ]graduate|graduate students?)\b", re.I)),
    ("phd", re.compile(r"\b(ph\.?\s?d\.?|doctoral|doctorate|d\.?phil|post[- ]?doc(?:toral)?)", re.I)),
]
EDUCATION_CONTEXT = re.compile(r"\b(education(?:al)?|qualifications?|requirements?|eligib\w+|degree|must have|should have|minimum|who can apply|open to|applicants? must|candidates? (?:must|should))\b", re.I)


def levels_in(fragment: str) -> list[str]:
    return [name for name, pattern in EDUCATION_LEVELS if pattern.search(fragment)]


def education_of(title: str, text: str) -> str | None:
    found = levels_in(title)
    if found:
        return found[0]
    sample = text[:12000]
    for kw in EDUCATION_CONTEXT.finditer(sample):
        found = levels_in(sample[kw.start(): kw.end() + 160])
        if found:
            return found[0]
    return None


FIELD_RULES = [
    ("cse", re.compile(r"\b(software|developer|programmer|programming|coding|data scien\w+|data analy\w+|data engineer\w*|machine learning|artificial intelligence|ai|ml|cyber\s?security|devops|front[- ]?end|back[- ]?end|full[- ]?stack|web develop\w+|computer science|cse|information technology|it|cloud|qa engineer|sqa|hackathon|android|ios|python|java|javascript|react|node\.?js|database|network engineer|sre)\b", re.I)),
    ("engineering", re.compile(r"\b(civil|mechanical|electrical|electronics?|chemical engineer\w*|textile|industrial engineer\w*|architecture|architect|construction|manufacturing|eee|robotics|aerospace|automotive|power plant|structural|mechatronics|petroleum|site engineer|production engineer)\b", re.I)),
    ("business", re.compile(r"\b(marketing|sales|finance|financial|accounting|accountant|accounts|business|mba|bba|human resources?|hr|supply chain|management trainee|banking|bank|economics|commerce|audit\w*|procurement|brand|merchandis\w+|operations|customer (?:service|success)|entrepreneur\w*|consulting|investment)\b", re.I)),
    ("health", re.compile(r"\b(medical|medicine|doctor|physician|nurs(?:e|ing)|pharma\w*|public health|clinical|hospital|health\w*|dental|biomedical|mbbs|nutrition\w*|epidemiolog\w+|frailty)\b", re.I)),
    ("science", re.compile(r"\b(research(?:er)?|physics|chemistry|biolog\w+|mathematics|statistic\w+|laborator\w+|environmental|climate|agricultur\w+|biotech\w*|geolog\w+|marine|ecolog\w+|stem|scientific|water)\b", re.I)),
    ("arts", re.compile(r"\b(design(?:er)?|graphic\w*|journalis\w+|media|content writ\w+|writer|law|legal|teach(?:er|ing)|education|social science|literature|language|music|film|arts?|humanities|communications?|international relations|development studies|policy|editions|museum|photograph\w+|broadcast)\b", re.I)),
]


def field_of(title: str, text: str) -> str | None:
    best, best_score = None, 0
    sample = text[:3000]
    for name, pattern in FIELD_RULES:
        score = 3 * len(pattern.findall(title)) + min(4, len(pattern.findall(sample)))
        if score > best_score:
            best, best_score = name, score
    return best if best_score >= 2 else None


GOVERNMENT = re.compile(r"\b(ministry|government|govt\.?|directorate|public service commission|bpsc|municipal\w*|city corporation|bangladesh bank|bangladesh (?:army|navy|air force|police|railway)|petroleum corporation|power development board|election commission|civil service)\b", re.I)
UNIVERSITY = re.compile(r"\b(university|universit[eé]|college|institute of technology|polytechnic|school of [a-z]+|faculty of)\b", re.I)
NGO = re.compile(r"\b(ngo|non[- ]?profit|not[- ]for[- ]profit|foundation|unicef|undp|unhcr|unesco|world bank|brac|save the children|oxfam|red cross|red crescent|care bangladesh|plan international|usaid|charity|humanitarian|united nations|un women|iom|fao|wfp|ilo|actionaid|action aid|world vision|atlantic council|think tank|endowment)\b", re.I)
STARTUP = re.compile(r"\bstart[- ]?up\b|\bseed[- ]stage\b|\bseries [abc]\b|\by combinator\b|\bearly[- ]stage (?:company|venture)\b", re.I)
MULTINATIONAL = re.compile(
    r"\b(google|microsoft|amazon|meta|apple|unilever|nestl[eé]|samsung|huawei|ibm|oracle|accenture|deloitte|pwc|kpmg|"
    r"ernst & young|hsbc|standard chartered|citi(?:bank)?|shell|chevron|british american tobacco|bat bangladesh|reckitt|"
    r"procter & gamble|p&g|coca[- ]cola|pepsico|siemens|bosch|toyota|honda|sony|intel|nvidia|tesla|palantir|danone|"
    r"grameenphone|telenor|robi axiata|banglalink|marico|berger|linde|novartis|sanofi|roche|pfizer|bytedance|tiktok|"
    r"odoo|xylem|hennge|multinational|mnc|fortune 500)\b",
    re.I,
)


def org_type_of(title: str, org: str | None, domain: str, text: str) -> str | None:
    kind = suffix_kind(domain)
    head = f"{title} {org or ''}"
    if kind == "government" or GOVERNMENT.search(head):
        return "government"
    if kind == "university" or UNIVERSITY.search(head):
        return "university"
    if ascii_domain(domain).endswith((".int", ".un.org")) or NGO.search(head):
        return "ngo"
    if MULTINATIONAL.search(head) or MULTINATIONAL.search(re.sub(r"[.\-]", " ", domain)):
        return "multinational"
    sample = text[:2500]
    if STARTUP.search(head) or STARTUP.search(sample) or domain.endswith("wellfound.com"):
        return "startup"
    if GOVERNMENT.search(sample[:600]):
        return "government"
    if NGO.search(sample[:600]):
        return "ngo"
    return None


CURRENCY_CODES = [
    ("BDT", re.compile(r"৳|\bbdt\b|\btk\b\.?|\btaka\b", re.I)),
    ("USD", re.compile(r"us\$|\$|\busd\b", re.I)),
    ("EUR", re.compile(r"€|\beur\b", re.I)),
    ("GBP", re.compile(r"£|\bgbp\b", re.I)),
    ("JPY", re.compile(r"¥|\bjpy\b|\byen\b", re.I)),
    ("INR", re.compile(r"₹|\binr\b", re.I)),
]
PERIODS = [
    (1 / 12, re.compile(r"\b(?:year|yr|annum|annual(?:ly)?)\b", re.I)),
    (160, re.compile(r"\b(?:hour|hr)\b", re.I)),
    (22, re.compile(r"\bday\b", re.I)),
    (4.33, re.compile(r"\bweek\b", re.I)),
    (1, re.compile(r"\b(?:month|mo)\b", re.I)),
]
ANNUAL_FLOOR = {"USD": 15000, "EUR": 15000, "GBP": 12000, "BDT": 1500000, "JPY": 1500000, "INR": 600000}


def pay_range_of(pay: str | None) -> tuple[float | None, float | None, str | None]:
    if not pay or not re.search(r"\d", pay):
        return None, None, None
    currency = next((code for code, pattern in CURRENCY_CODES if pattern.search(pay)), None)
    if not currency:
        return None, None, None
    amounts = []
    for m in re.finditer(r"(\d[\d,]*(?:\.\d+)?)\s?(k\b)?", pay, re.I):
        value = float(m.group(1).replace(",", ""))
        if m.group(2):
            value *= 1000
        amounts.append(value)
    amounts = [a for a in amounts if a > 0][:2]
    if not amounts:
        return None, None, None
    factor = next((f for f, pattern in PERIODS if pattern.search(pay)), None)
    if factor is None:
        factor = 1 / 12 if max(amounts) >= ANNUAL_FLOOR.get(currency, 10 ** 9) else 1
    low, high = min(amounts) * factor, max(amounts) * factor
    if high > 10 ** 10:
        return None, None, None
    return round(low, 2), round(high, 2), currency


def to_item(result: dict, search: dict) -> dict | None:
    url = str(result.get("url") or "")
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or INDEX_PATH.search(url):
        return None
    if parsed.path in ("", "/"):
        return None
    domain = domain_of(url)
    if any(domain == d or domain.endswith("." + d) for d in EXCLUDED_DOMAINS + list(NEWS_DOMAINS)) or "news" in domain:
        return None
    if (domain == "linkedin.com" or domain.endswith(".linkedin.com")) and not parsed.path.startswith("/jobs/view"):
        return None
    raw_title = str(result.get("title") or "").strip()
    if not raw_title or NOT_AN_OPENING.search(raw_title) or LISTING_PAGE.search(raw_title) or GENERIC_START.search(raw_title):
        return None
    title = clean_title(raw_title, domain)
    if too_generic(title, domain) or old_edition(title):
        return None
    category = category_of(title, None)
    if category is None:
        return None
    dates_in_title = title_dates(title)
    if dates_in_title and max(dates_in_title) < today():
        return None
    content = str(result.get("content") or "")
    raw = str(result.get("raw_content") or "")
    body = f"{content}\n{raw}"
    deadline, closed = deadline_of(f"{title}\n{body}")
    if closed:
        return None
    published = published_of(result.get("published_date"))
    if not deadline and published:
        try:
            if (today() - date.fromisoformat(published)).days > STALE_UNDATED_DAYS:
                return None
        except ValueError:
            pass
    trusted = is_trusted(domain)
    if scam_reason(f"{title}\n{body}", trusted):
        return None
    funding = funding_of(title, content) if category in ("scholarship", "program", "competition", "internship") else None
    pay = pay_of(f"{content}\n{raw[:6000]}") if category in ("job", "internship") else None
    exp_min, exp_max, level = experience_of(title, f"{content}\n{raw[:15000]}", category)
    org = org_of(title, domain)
    region = region_of(title, domain, f"{content}\n{raw[:600]}", search.get("region", "GLOBAL"), category)
    pay_min, pay_max, pay_currency = pay_range_of(pay)
    return {
        "id": hashlib.sha1(url.encode()).hexdigest()[:16],
        "title": title,
        "org": org,
        "url": url,
        "source": domain,
        "category": category,
        "region": region,
        "funding": funding,
        "deadline": deadline,
        "pay": pay,
        "summary": summary_of(content),
        "published": published,
        "exp_min": exp_min,
        "exp_max": exp_max,
        "level": level,
        "job_type": job_type_of(title, body, category),
        "work_mode": work_mode_of(title, body),
        "country": country_of(title, body, domain, region),
        "education": education_of(title, body),
        "field": field_of(title, content),
        "org_type": org_type_of(title, org, domain, content),
        "pay_min": pay_min,
        "pay_max": pay_max,
        "pay_currency": pay_currency,
        "verified": trusted,
    }


DB_FIELDS = ("id", "title", "org", "url", "source", "category", "region", "funding", "deadline", "pay", "summary",
             "published", "exp_min", "exp_max", "level", "job_type", "work_mode", "country", "education", "field",
             "org_type", "pay_min", "pay_max", "pay_currency", "verified", "checked_by", "evidence", "found", "checked")
DB_LIMITS = {"id": 40, "title": 200, "org": 100, "source": 120, "pay": 60, "summary": 400, "country": 60, "pay_currency": 5}
DB_CHOICES = {
    "funding": ("full", "partial"),
    "level": ("entry", "mid", "senior"),
    "job_type": ("full-time", "part-time", "contract", "freelance"),
    "work_mode": ("remote", "hybrid", "onsite"),
    "education": ("school", "diploma", "bachelor", "master", "phd"),
    "field": ("cse", "engineering", "business", "health", "science", "arts"),
    "org_type": ("government", "multinational", "ngo", "startup", "university"),
}
CATEGORY_NAMES = ("job", "internship", "scholarship", "competition", "program")


def db_row(item: dict) -> dict | None:
    row = {k: item.get(k) for k in DB_FIELDS}
    if not row["id"] or not row["title"] or not re.match(r"https?://", row["url"] or "") or len(row["url"]) > 1000:
        return None
    if row["category"] not in CATEGORY_NAMES or row["region"] not in ("BD", "GLOBAL"):
        return None
    for key, limit in DB_LIMITS.items():
        row[key] = row[key][:limit] if isinstance(row[key], str) else None
    row["source"] = row["source"] or domain_of(row["url"])[:120] or "web"
    for key, allowed in DB_CHOICES.items():
        if row[key] not in allowed:
            row[key] = None
    for key, top in (("exp_min", 40), ("exp_max", 50)):
        if isinstance(row[key], bool) or not isinstance(row[key], int) or not 0 <= row[key] <= top:
            row[key] = None
    for key in ("pay_min", "pay_max"):
        if isinstance(row[key], bool) or not isinstance(row[key], (int, float)) or not 0 <= row[key] < 10 ** 11:
            row[key] = None
    row["verified"] = row["verified"] is True
    row["checked_by"] = "ai" if row["checked_by"] == "ai" else "rules"
    evidence = row["evidence"] if isinstance(row["evidence"], dict) else None
    row["evidence"] = evidence if evidence and len(json.dumps(evidence, ensure_ascii=False)) <= 9000 else None
    for key in ("deadline", "published", "found", "checked"):
        try:
            row[key] = date.fromisoformat(str(row[key])[:10]).isoformat() if row[key] else None
        except ValueError:
            row[key] = None
    row["found"] = row["found"] or today().isoformat()
    row["checked"] = row["checked"] or today().isoformat()
    return row


def database_settings() -> tuple[str, str, str] | None:
    base = load_env_key("SUPABASE_URL").rstrip("/")
    key = load_env_key("SUPABASE_ANON_KEY")
    secret = load_env_key("INGEST_SECRET")
    if not base or not key:
        return None
    if not re.match(r"https://[^/\s]+$", base) and not re.match(r"http://(127\.0\.0\.1|localhost)(:\d+)?$", base):
        log("database: SUPABASE_URL must look like https://your-project.supabase.co")
        return None
    return base, key, secret


def db_call(base: str, key: str, path: str, body=None):
    headers = {"apikey": key, "Content-Type": "application/json", "Accept": "application/json"}
    if not key.startswith("sb_"):
        headers["Authorization"] = f"Bearer {key}"
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(base + path, data=data, headers=headers, method="POST" if body is not None else "GET")
    with urllib.request.urlopen(request, timeout=60) as response:
        text = response.read(30_000_000)
    return json.loads(text) if text else None


def reported_ids(errors: list[str]) -> set[str]:
    settings = database_settings()
    if not settings or not settings[2]:
        return set()
    base, key, secret = settings
    try:
        found = db_call(base, key, "/rest/v1/rpc/reported_opportunities", {"secret": secret}) or []
        ids = {str(i) for i in found if isinstance(i, str)}
        if ids:
            log(f"database: hiding {len(ids)} listings reported by users")
        return ids
    except Exception as exc:
        errors.append(f"reports {type(exc).__name__}")
        log(f"database: could not read reports ({type(exc).__name__})")
        return set()


def push_to_database(items: list[dict], errors: list[str]) -> None:
    settings = database_settings()
    if not settings:
        log("database: not configured, skipped (the JSON file is still written)")
        return
    base, key, secret = settings
    if not secret:
        errors.append("database secret missing")
        log("database: INGEST_SECRET is not set, skipped")
        return
    rows = [r for r in (db_row(item) for item in items) if r]
    try:
        saved = 0
        for i in range(0, len(rows), 200):
            saved += int(db_call(base, key, "/rest/v1/rpc/ingest_opportunities", {"secret": secret, "items": rows[i:i + 200]}) or 0)
        removed = int(db_call(base, key, "/rest/v1/rpc/prune_opportunities", {"secret": secret}) or 0)
        log(f"database: saved {saved} open opportunities, removed {removed} closed or reported ones")
    except urllib.error.HTTPError as exc:
        errors.append(f"database HTTP {exc.code}")
        log(f"database: failed with HTTP {exc.code} (check SUPABASE_URL, the anon key, INGEST_SECRET and that schema.sql was run)")
    except Exception as exc:
        errors.append(f"database {type(exc).__name__}")
        log(f"database: failed ({type(exc).__name__})")



AI_FIELD_MAP = {
    "organization": "org", "category": "category", "country": "country", "deadline": "deadline", "funding": "funding",
    "pay": "pay", "experience_min_years": "exp_min", "experience_max_years": "exp_max", "job_type": "job_type",
    "work_mode": "work_mode", "education": "education", "field": "field", "org_type": "org_type",
}
AI_ITEM_FIELDS = tuple(AI_FIELD_MAP.values()) + ("region", "level", "pay_min", "pay_max", "pay_currency", "evidence", "checked_by")
RED_FLAGS = {"asks_for_payment", "whatsapp_only", "guaranteed_result"}


def apply_ai(item: dict, result: dict | None, trusted: bool) -> dict | None:
    if not result:
        return item
    warnings = set(result.get("warnings") or [])
    if not result.get("is_opportunity", True) or "not_an_opening" in warnings or "expired" in warnings:
        return None
    if warnings & RED_FLAGS and not trusted:
        return None
    evidence = result.get("evidence") or {}
    kept = {}
    for ai_key, item_key in AI_FIELD_MAP.items():
        proof = evidence.get(ai_key) or {}
        if proof.get("status") != "verified":
            continue
        value = result.get(item_key)
        if value is None:
            continue
        if item_key == "deadline" and value < today().isoformat():
            return None
        item[item_key] = value
        kept[item_key] = {"quote": str(proof.get("quote") or "")[:240], "url": proof.get("url")}
    if "country" in kept:
        item["region"] = "BD" if item["country"] == "Bangladesh" else "GLOBAL"
    if "exp_min" in kept:
        item["level"] = level_for(int(item["exp_min"]))
        if "exp_max" not in kept:
            item["exp_max"] = None
    if "pay" in kept:
        item["pay_min"], item["pay_max"], item["pay_currency"] = pay_range_of(item["pay"])
    item["evidence"] = kept or None
    item["checked_by"] = "ai"
    return item


def enrich_with_ai(fresh: list[dict], texts: dict[str, dict], previous: list[dict], use_database: bool) -> list[dict]:
    done_before = {p.get("id") for p in previous if p.get("checked_by") == "ai"}
    todo = [i for i in fresh if i["id"] not in done_before and i["id"] in texts]
    if not todo:
        return fresh
    reply = run_engine("extract", {"items": [{"id": i["id"], **texts[i["id"]]} for i in todo]}, use_database)
    if not reply:
        return fresh
    by_id = {r.get("id"): r.get("result") for r in reply.get("results", []) if r.get("result")}
    out, dropped = [], 0
    for item in fresh:
        if item["id"] not in by_id:
            out.append(item)
            continue
        kept = apply_ai(item, by_id[item["id"]], is_trusted(item.get("source") or ""))
        if kept is None:
            dropped += 1
        else:
            out.append(kept)
    if dropped:
        log(f"ai: removed {dropped} listings that were closed, not real openings or asked for money")
    return out


def load_previous(source: str | None) -> list[dict]:
    if not source:
        return []
    try:
        if source == "database":
            settings = database_settings()
            if not settings:
                return []
            items = db_call(settings[0], settings[1], "/rest/v1/opportunities?select=*&limit=2000") or []
            log(f"previous data: {len(items)} items from the database")
            return items
        if re.match(r"https?://", source):
            with urllib.request.urlopen(source, timeout=30) as response:
                data = json.loads(response.read(20_000_000))
        else:
            path = Path(source)
            if not path.exists():
                return []
            data = json.loads(path.read_text(encoding="utf-8"))
        items = data.get("items") or []
        log(f"previous data: {len(items)} items")
        return items
    except Exception as exc:
        log(f"previous data unavailable ({type(exc).__name__}); starting fresh")
        return []


def still_open(item: dict) -> bool:
    now = today()
    if item.get("deadline"):
        return item["deadline"] >= now.isoformat()
    try:
        return (now - date.fromisoformat(item.get("checked") or item.get("found"))).days <= KEEP_UNDATED_DAYS
    except (TypeError, ValueError):
        return False


def merge(previous: list[dict], fresh: list[dict]) -> list[dict]:
    now = today().isoformat()
    by_id = {p["id"]: p for p in previous if p.get("id") and still_open(p)}
    for item in fresh:
        old = by_id.get(item["id"])
        item["found"] = old.get("found", now) if old else now
        item["checked"] = now
        if old and old.get("checked_by") == "ai" and item.get("checked_by") != "ai":
            for key in AI_ITEM_FIELDS:
                if key in old:
                    item[key] = old[key]
        by_id[item["id"]] = item
    def quality(item: dict) -> tuple:
        years = [int(y) for y in re.findall(r"\b(20\d\d)\b", item["title"])]
        org = (item.get("org") or "").lower()
        official = bool(org) and any(t in item.get("source", "") for t in re.findall(r"[a-z0-9]{3,}", org))
        return (bool(item.get("deadline")), official, max(years) if years else 0, bool(item.get("funding")), item.get("checked") or "")

    best: dict[str, dict] = {}
    for item in by_id.values():
        if not still_open(item):
            continue
        key = dedupe_key(item["title"]) or item["id"]
        if key not in best or quality(item) > quality(best[key]):
            best[key] = item
    out = list(best.values())
    out.sort(key=lambda i: (i.get("deadline") or "9999-12-31", i.get("found") or ""))
    return out[:MAX_ITEMS]


def build_searches(config: dict) -> list[dict]:
    searches = [dict(s, q=fill(s["q"])) for s in config.get("searches", [])]
    for term in config.get("watch", []):
        searches.append({"q": fill(f"{term} internship job program {{year}} apply"), "category": "job", "region": "GLOBAL"})
    return searches


def main() -> int:
    ap = argparse.ArgumentParser(description="Collect open opportunities from the web into a JSON file.")
    ap.add_argument("--out", default=str(ROOT / "site" / "data" / "opportunities.json"))
    ap.add_argument("--previous", default=None, help="'database', or a URL or path of the last JSON, to keep listings between runs")
    ap.add_argument("--queries", default=str(Path(__file__).with_name("queries.json")))
    ap.add_argument("--no-search", action="store_true", help="only carry over previous data (no API calls)")
    ap.add_argument("--search-if-empty", action="store_true", help="with --no-search: still search when there is no previous data")
    ap.add_argument("--no-database", action="store_true", help="don't read from or write to Supabase even if configured")
    ap.add_argument("--save-raw", default=None, help="save raw search results to this file")
    ap.add_argument("--from-raw", default=None, help="rebuild from saved raw results instead of searching")
    ap.add_argument("--no-ai", action="store_true", help="don't check new listings with the free AI providers")
    ap.add_argument("--ai", action="store_true", help="with --from-raw: also run the AI check")
    args = ap.parse_args()

    previous = load_previous(args.previous) or load_previous(args.out)
    config = json.loads(Path(args.queries).read_text(encoding="utf-8"))
    searches = build_searches(config)
    raw_results: list[tuple[dict, list[dict]]] = []
    errors: list[str] = []

    should_search = not args.no_search or (args.search_if_empty and not previous)
    if args.from_raw:
        raw_results = [(r["search"], r["results"]) for r in json.loads(Path(args.from_raw).read_text(encoding="utf-8"))]
    elif should_search:
        if not any(load_env_key(k) for k in ("TAVILY_API_KEY", "SERPER_API_KEY", "EXA_API_KEY")):
            log("no search key is set (TAVILY_API_KEY, SERPER_API_KEY or EXA_API_KEY): keeping previous data only")
            errors.append("search key missing")
        else:
            reply = run_engine("search", {"queries": [{"q": s["q"], "max": 15, "range": "month"} for s in searches]}, not args.no_database)
            if reply is None:
                errors.append("search engine failed")
            else:
                for s, res in zip(searches, reply.get("results", [])):
                    if res.get("provider"):
                        raw_results.append((s, res.get("results") or []))
                    else:
                        errors.append("search unavailable for one query")

    if args.save_raw and raw_results:
        Path(args.save_raw).write_text(json.dumps([{"search": s, "results": r} for s, r in raw_results]), encoding="utf-8")

    fresh, seen_urls, texts = [], set(), {}
    for search, results in raw_results:
        for result in results:
            item = to_item(result, search)
            if item and item["url"] not in seen_urls:
                seen_urls.add(item["url"])
                item["checked_by"] = "rules"
                fresh.append(item)
                body = f"{result.get('content') or ''}\n{result.get('raw_content') or ''}".strip()
                texts[item["id"]] = {"url": item["url"], "title": str(result.get("title") or "")[:200], "text": body[:20000]}

    if fresh and not args.no_ai and not args.from_raw:
        fresh = enrich_with_ai(fresh, texts, previous, not args.no_database)
    elif fresh and args.from_raw and args.ai:
        fresh = enrich_with_ai(fresh, texts, previous, not args.no_database)

    items = merge(previous, fresh)
    if not args.no_database:
        hidden = reported_ids(errors)
        items = [i for i in items if i["id"] not in hidden]
        push_to_database(items, errors)
    payload = {
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "count": len(items),
        "searches_run": len(raw_results),
        "new_this_run": len(fresh),
        "errors": errors,
        "items": items,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log(f"wrote {len(items)} open opportunities ({len(fresh)} from this run) -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
