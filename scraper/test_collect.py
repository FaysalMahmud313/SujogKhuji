import unittest

import collect as c


class ExperienceTests(unittest.TestCase):
    def test_cases(self):
        cases = [
            ("Software Engineer", "Requirements: 3-5 years of experience in backend development.", "job", (3, 5, "mid")),
            ("Marketing Executive", "Minimum 2 years experience in FMCG sales.", "job", (2, None, "mid")),
            ("Data Analyst", "You have 5+ years of professional experience.", "job", (5, None, "senior")),
            ("Junior Developer", "Freshers are encouraged to apply. No experience required.", "job", (0, None, "entry")),
            ("Operations Graduate Program", "Up to 2 years of work experience is welcome.", "job", (0, None, "entry")),
            ("Summer Internship", "Open to current students.", "internship", (0, None, "entry")),
            ("Senior Product Manager", "Lead our product teams.", "job", (None, None, "senior")),
            ("Accounts Officer", "At least one year of experience in accounts.", "job", (1, None, "entry")),
            ("Customer Support Agent", "Friendly people wanted.", "job", (None, None, None)),
        ]
        for title, text, category, expected in cases:
            with self.subTest(title=title):
                self.assertEqual(c.experience_of(title, text, category), expected)


class ScamTests(unittest.TestCase):
    def test_flagged(self):
        cases = [
            "Selected candidates must pay a registration fee of BDT 2,000 before joining.",
            "Processing fee: Tk 1500 (non-refundable). Apply today.",
            "Send money to bKash personal 01712345678 to confirm your seat.",
            "Pay the amount via Nagad and send a screenshot.",
            "Interested candidates contact only on WhatsApp.",
            "100% job guarantee after our 7-day training.",
            "Guaranteed visa and placement in Canada for every applicant.",
            "A security deposit of $150 is required before the interview. Application fee 500 taka.",
        ]
        for text in cases:
            with self.subTest(text=text):
                self.assertIsNotNone(c.scam_reason(text))

    def test_clean(self):
        cases = [
            "There is no application fee. Applications close on 30 June 2027.",
            "The scholarship covers tuition fees of $20,000 and a monthly stipend.",
            "Salary: BDT 45,000 per month plus two festival bonuses.",
            "The application fee waiver of $75 is available for all applicants.",
            "Follow us on WhatsApp for updates, or apply through the careers portal.",
            "We guarantee equal opportunity for every candidate.",
        ]
        for text in cases:
            with self.subTest(text=text):
                self.assertIsNone(c.scam_reason(text))

    def test_trusted_sources_may_charge_exam_fees(self):
        text = "Application fee Tk 223 to be paid through Teletalk prepaid SIM."
        self.assertEqual(c.scam_reason(text), "fee")
        self.assertIsNone(c.scam_reason(text, trusted=True))
        self.assertIsNotNone(c.scam_reason("Send money to bKash 01812345678", trusted=True))


class TrustTests(unittest.TestCase):
    def test_trusted(self):
        for domain in ["erecruitment.bb.org.bd", "bpsc.gov.bd", "admissions.du.ac.bd", "careers.google.com",
                       "jobs.lever.co", "hsph.harvard.edu", "daad.de", "cscuk.fcdo.gov.uk", "careers.un.org", "mext.go.jp"]:
            with self.subTest(domain=domain):
                self.assertTrue(c.is_trusted(domain))

    def test_untrusted(self):
        for domain in ["best-jobs-bd.xyz", "scholarship-portal.info", "google.com.jobs-apply.net", "gov.bd.example.com",
                       "edu-careers.co", "xn--bksh-63d.com", "careers.ac", "apply.gov.example.org"]:
            with self.subTest(domain=domain):
                self.assertFalse(c.is_trusted(domain))

    def test_lookalike_domains(self):
        self.assertTrue(c.suspicious_domain("bkаsh.com"))
        self.assertTrue(c.suspicious_domain("xn--bksh-63d.com"))
        self.assertTrue(c.suspicious_domain("раyрal.com"))
        self.assertFalse(c.suspicious_domain("bkash.com"))
        self.assertFalse(c.suspicious_domain("careers.danone.com"))
        self.assertFalse(c.suspicious_domain("münchen.de"))
        self.assertEqual(c.domain_of("https://www.bkаsh.com/jobs"), "xn--bksh-63d.com")


class JobTypeTests(unittest.TestCase):
    def test_cases(self):
        cases = [
            ("Part-time Content Writer", "Work 20 hours a week.", "job", "part-time"),
            ("Software Engineer", "Employment Type: Full-time\nLocation: Dhaka", "job", "full-time"),
            ("Project Officer", "This is a 12-month contract with possible extension.", "job", "contract"),
            ("Freelance Graphic Designer", "Paid per project.", "job", "freelance"),
            ("Research Assistant", "Job Nature: Contractual. Duration six months.", "job", "contract"),
            ("Marketing Intern", "A full time internship for three months.", "internship", "full-time"),
            ("Sales Executive", "Great team and benefits.", "job", None),
            ("Fully Funded Scholarship", "Full-time study only.", "scholarship", None),
        ]
        for title, text, category, expected in cases:
            with self.subTest(title=title):
                self.assertEqual(c.job_type_of(title, text, category), expected)


class WorkModeTests(unittest.TestCase):
    def test_cases(self):
        cases = [
            ("Remote Backend Developer", "Join our distributed team.", "remote"),
            ("Software Engineer", "Workplace type: Hybrid. Three days in the Dhaka office.", "hybrid"),
            ("Customer Support Officer", "This is an on-site role at our Gulshan office.", "onsite"),
            ("Data Entry Operator", "You can work from home with your own laptop.", "remote"),
            ("Field Sales Officer", "This role is not remote; daily market visits are required.", "onsite"),
            ("Global Virtual Hackathon 2026", "Teams of up to four.", "remote"),
            ("Accountant", "Competitive salary and benefits.", None),
        ]
        for title, text, expected in cases:
            with self.subTest(title=title):
                self.assertEqual(c.work_mode_of(title, text), expected)


class CountryTests(unittest.TestCase):
    def test_cases(self):
        cases = [
            ("HENNGE Global Internship 2027 in Japan (Fully Funded)", "", "opportunitiescorners.com", "GLOBAL", "Japan"),
            ("DAAD Scholarship 2027 for Bangladeshi Students", "Study in Germany for two years.", "daad.de", "GLOBAL", "Germany"),
            ("Software Engineer", "Location: Dhaka, Bangladesh\nSalary negotiable", "careers.example.com", "BD", "Bangladesh"),
            ("Chevening Scholarship", "Fully funded master's degree.", "chevening.org.uk", "GLOBAL", "United Kingdom"),
            ("Research Intern", "Duty station: Geneva", "careers.who.int", "GLOBAL", "Switzerland"),
            ("Graduate Trainee", "Join our team.", "jobs.example.com.bd", "BD", "Bangladesh"),
            ("Marketing Associate at Acme", "Open to applicants from India and Nepal.", "acme.io", "GLOBAL", None),
            ("Fully Funded Fellowship in the USA", "", "example.org", "GLOBAL", "United States"),
        ]
        for title, text, domain, region, expected in cases:
            with self.subTest(title=title):
                self.assertEqual(c.country_of(title, text, domain, region), expected)


class EducationTests(unittest.TestCase):
    def test_cases(self):
        cases = [
            ("PhD Scholarship in Climate Science", "", "phd"),
            ("Management Trainee", "Educational requirements: BBA or MBA from a reputed university.", "bachelor"),
            ("Office Assistant", "Qualification: Minimum HSC pass.", "school"),
            ("Sub-Assistant Engineer", "Requirements: Diploma in Civil Engineering.", "diploma"),
            ("Erasmus Mundus Joint Master's Scholarship", "", "master"),
            ("Software Engineer", "Requirements: B.Sc. in CSE. Master's preferred.", "bachelor"),
            ("Undergraduate Summer Research Program", "", "bachelor"),
            ("Delivery Rider", "Flexible hours and weekly pay.", None),
        ]
        for title, text, expected in cases:
            with self.subTest(title=title):
                self.assertEqual(c.education_of(title, text), expected)


class FieldTests(unittest.TestCase):
    def test_cases(self):
        cases = [
            ("Junior Software Developer", "Work with Python and React.", "cse"),
            ("Civil Engineer (Site)", "Supervise construction work.", "engineering"),
            ("Brand Marketing Executive", "Plan campaigns and manage sales targets.", "business"),
            ("Staff Nurse", "Provide clinical care at our hospital.", "health"),
            ("Research Assistant in Environmental Chemistry", "Laboratory work on water quality.", "science"),
            ("Graphic Designer", "Create media content for our brand.", "arts"),
            ("AI Hackathon 2027", "Build something in 24 hours.", "cse"),
            ("Youth Leadership Summit", "Five days of workshops.", None),
        ]
        for title, text, expected in cases:
            with self.subTest(title=title):
                self.assertEqual(c.field_of(title, text), expected)


class OrgTypeTests(unittest.TestCase):
    def test_cases(self):
        cases = [
            ("Assistant Director", "Bangladesh Bank", "erecruitment.bb.org.bd", "", "government"),
            ("Bangladesh Petroleum Corporation Job Circular 2026", None, "students.bd", "", "government"),
            ("PhD Studentship in Physics", "University of Leeds", "jobs.leeds.ac.uk", "", "university"),
            ("Programme Officer", "UNICEF", "jobs.unicef.org", "", "ngo"),
            ("Software Engineer, New Grad", "Google", "careers.google.com", "", "multinational"),
            ("Founding Engineer", None, "jobs.acme.io", "We are a seed-stage startup backed by leading investors.", "startup"),
            ("Territory Sales Officer", "Unilever Bangladesh", "bdjobs.com", "", "multinational"),
            ("Office Executive", "Rahim Traders", "rahimtraders.com", "A family business in Chattogram.", None),
        ]
        for title, org, domain, text, expected in cases:
            with self.subTest(title=title):
                self.assertEqual(c.org_type_of(title, org, domain, text), expected)


class PayTests(unittest.TestCase):
    def test_cases(self):
        cases = [
            ("BDT 25,000 - 35,000 per month", (25000.0, 35000.0, "BDT")),
            ("EUR 650 per month", (650.0, 650.0, "EUR")),
            ("$17.50 per hour", (2800.0, 2800.0, "USD")),
            ("$55,000-134,000", (4583.33, 11166.67, "USD")),
            ("৳ 40k/month", (40000.0, 40000.0, "BDT")),
            ("£30,000 per annum", (2500.0, 2500.0, "GBP")),
            ("Tk. 18,000", (18000.0, 18000.0, "BDT")),
            ("Unpaid", (None, None, None)),
            (None, (None, None, None)),
        ]
        for pay, expected in cases:
            with self.subTest(pay=pay):
                self.assertEqual(c.pay_range_of(pay), expected)


class DatabaseRowTests(unittest.TestCase):
    def test_row_is_cleaned(self):
        row = c.db_row({
            "id": "abc", "title": "T" * 300, "url": "https://example.com/job", "source": "example.com", "category": "job",
            "region": "BD", "funding": "maybe", "level": "boss", "job_type": "gig", "work_mode": "remote",
            "exp_min": 99, "exp_max": 3, "pay_min": -5, "pay_max": 1000.5, "verified": "yes", "deadline": "2027-13-40",
        })
        self.assertEqual(len(row["title"]), 200)
        self.assertIsNone(row["funding"])
        self.assertIsNone(row["level"])
        self.assertIsNone(row["job_type"])
        self.assertEqual(row["work_mode"], "remote")
        self.assertIsNone(row["exp_min"])
        self.assertEqual(row["exp_max"], 3)
        self.assertIsNone(row["pay_min"])
        self.assertEqual(row["pay_max"], 1000.5)
        self.assertFalse(row["verified"])
        self.assertIsNone(row["deadline"])
        self.assertEqual(set(row), set(c.DB_FIELDS))

    def test_bad_rows_are_dropped(self):
        self.assertIsNone(c.db_row({"id": "a", "title": "x", "url": "javascript:alert(1)", "category": "job", "region": "BD"}))
        self.assertIsNone(c.db_row({"id": "a", "title": "x", "url": "https://e.com/a", "category": "lottery", "region": "BD"}))
        self.assertIsNone(c.db_row({"id": "", "title": "x", "url": "https://e.com/a", "category": "job", "region": "BD"}))


class ScamListingTests(unittest.TestCase):
    def test_scam_page_never_becomes_a_listing(self):
        result = {
            "url": "https://best-jobs-bd.xyz/circular/data-entry-officer",
            "title": "Data Entry Officer Job Circular 2099",
            "content": "Work from home. Registration fee Tk 1,500. Send money to bKash 01712345678. Deadline: 30 December 2099.",
        }
        self.assertIsNone(c.to_item(result, {"region": "BD"}))


class ApplyAiTests(unittest.TestCase):
    def base(self):
        return {"id": "x", "title": "Trainee", "url": "https://acme.com/j", "source": "acme.com", "category": "job", "region": "GLOBAL",
                "deadline": None, "funding": None, "pay": None, "exp_min": None, "exp_max": None, "level": None, "country": None,
                "checked_by": "rules"}

    def ai(self, **extra):
        r = {"is_opportunity": True, "warnings": [], "deadline": "2099-12-30", "country": "Bangladesh", "pay": "BDT 45,000 per month",
             "exp_min": 0, "funding": "full",
             "evidence": {"deadline": {"status": "verified", "quote": "Deadline: 30 December 2099", "url": "https://acme.com/j"},
                          "country": {"status": "verified", "quote": "Dhaka, Bangladesh", "url": "https://acme.com/j"},
                          "pay": {"status": "verified", "quote": "BDT 45,000 per month", "url": "https://acme.com/j"},
                          "experience_min_years": {"status": "verified", "quote": "No experience required", "url": "https://acme.com/j"},
                          "funding": {"status": "rejected"}}}
        r.update(extra)
        return r

    def test_only_verified_facts_are_applied(self):
        item = c.apply_ai(self.base(), self.ai(), trusted=False)
        self.assertEqual(item["deadline"], "2099-12-30")
        self.assertEqual(item["region"], "BD")
        self.assertEqual(item["level"], "entry")
        self.assertEqual(item["pay_min"], 45000.0)
        self.assertIsNone(item["funding"])
        self.assertEqual(item["checked_by"], "ai")
        self.assertEqual(set(item["evidence"]), {"deadline", "country", "pay", "exp_min"})

    def test_closed_fake_or_non_openings_are_dropped(self):
        self.assertIsNone(c.apply_ai(self.base(), self.ai(warnings=["expired"]), trusted=False))
        self.assertIsNone(c.apply_ai(self.base(), self.ai(is_opportunity=False), trusted=False))
        self.assertIsNone(c.apply_ai(self.base(), self.ai(warnings=["asks_for_payment"]), trusted=False))
        self.assertIsNotNone(c.apply_ai(self.base(), self.ai(warnings=["asks_for_payment"]), trusted=True))
        past = self.ai(deadline="2020-01-01")
        self.assertIsNone(c.apply_ai(self.base(), past, trusted=False))

    def test_no_ai_result_leaves_the_item_alone(self):
        self.assertEqual(c.apply_ai(self.base(), None, trusted=False)["checked_by"], "rules")


if __name__ == "__main__":
    unittest.main()
