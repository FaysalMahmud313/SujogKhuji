# SujogKhuji (সুযোগ খুঁজি)

*"I search for opportunities."*

**Live jobs, internships, scholarships, hackathons and fellowships in Bangladesh and worldwide, for
freshers and experienced people.** The site searches the web by itself twice a day, keeps only
openings that are still open, and links every listing to its source. People sign up with an email
code, say whether they are a fresher or how many years they have worked, and see what fits them.

Works in any browser on **Android and PC**, installs like an app, and has an English / বাংলা switch.
Everything runs on free plans: **Vercel** (website and email function), **Supabase** (accounts and
database), **GitHub Actions** (the twice-daily search), **Tavily** (web search) and your own
**Gmail** (verification emails).

---

## What is inside

| Part | What it does |
|---|---|
| Sign-up with a code | Email → 6-digit code sent from your Gmail → password → details about you. Sign-in by password or by code, forgot password, change email. |
| Experience matching | Freshers see roles that ask for 0 years; experienced people see roles up to their years. Every card says what it asks for. |
| Filters | Region, category, deadline, posted date, experience range, job type, work mode, country, education, field, organisation, funding, has pay, verified only, hide tracked. Filters live in the link, so a search can be shared or saved. |
| Listing details | All extracted facts, source with a *Verified source* or *Check carefully* badge, share, add to calendar, track, report. |
| Tracker | Steps with dates, status (Saved → Applied → Interview → Offer / Rejected), notes, list or board view, a 7-day strip, alerts 3 days before a step. |
| Sync | Profile, applications, saved searches and the items you add on the Add page follow the account to every device. The site checks for changes when you come back to it, when the connection returns and every 5 minutes; **Sync now** in Profile & settings does it at once. Changes made offline are sent later. Two devices editing the same application keep both sets of steps. |
| Safety | Pages that ask applicants for money are dropped. Three reports hide a listing for everyone. See [Security](#security). |
| Live search | Tavily first, then Serper, then Exa, one at a time. A provider that runs out of free searches rests until its quota resets. |
| AI extraction | The Add page reads pasted text, a link or just an opportunity name. The twice-daily search also AI-checks new listings. Free AI models only (Groq, Google Gemini, OpenRouter `:free`). Every fact must be backed by an exact quote from the source, or it is left empty. |
| AI lookup by name | Type a few words on the Add page, or press Enter in the Discover search, and the AI does the looking: it writes its own search queries, reads the pages, then gives a short answer and up to 3 matching opportunities with their sources. One lookup uses at most 3 searches, 4 page reads, 6 AI calls and 45 seconds. Pages built with JavaScript are read through Exa's page reader. |

---

## Set it up (about 40 minutes, once)

You need free accounts at GitHub, Supabase, Vercel, Tavily and Cloudflare, plus a Gmail address.
Do the steps in order; some values are copied from one place to the next.

### 1. Local secrets file
Copy `.env.example` to `.env` and fill it in as you go. `.env` is ignored by git and **is only used
on your PC**. Vercel and GitHub never see it, so the same values are also typed into their
dashboards in steps 5 and 7.

Two values are random strings you invent yourself, at least 32 characters each:
`MAIL_RPC_SECRET` and `INGEST_SECRET`. Any long random text works.

The `..._CAP` lines in `.env.example` are safety limits. Leave them as they are unless you know a
provider's free limit changed; they stop the site before a free quota runs out.

### 2. Tavily key (web search)
Sign up at **https://tavily.com** (free, no card), copy the key that starts with `tvly-` into
`TAVILY_API_KEY`. The free plan gives 1,000 searches a month; the site uses 14 per update, twice a
day (about 840 a month).

### 3. Supabase (accounts and database)
1. **https://supabase.com** → *New project*. Pick the region nearest your users (for example
   Singapore).
2. **SQL Editor → New query**, paste all of **`supabase/schema.sql`**, press *Run*. It can be run
   again safely after every update of this project.
3. In the same SQL Editor, store your two random secrets (the database keeps only a scrambled
   copy). Use the values from your `.env`:
   ```sql
   select private.set_secret('ingest', 'PASTE-YOUR-INGEST_SECRET');
   select private.set_secret('mail', 'PASTE-YOUR-MAIL_RPC_SECRET');
   ```
4. **Project Settings → API Keys** (and *Data API* for the address). Copy into `.env`:
   - `SUPABASE_URL` = the project URL, like `https://abcdxyz.supabase.co`
   - `SUPABASE_ANON_KEY` = the **publishable** key (`sb_publishable_…`) or the legacy **anon** key.
     Never the secret / service_role key. This project does not use the secret key anywhere.
5. **Authentication → Sign In / Providers → Email**
   - *Enable Email provider*: on
   - *Confirm email*: **on**
   - *Secure email change*: **off** (the app confirms the new address with one code)
   - *Email OTP length*: **6**, *Email OTP expiration*: **600** seconds
   - *Minimum password length*: 8
6. **Authentication → Rate Limits**: keep the defaults or lower them. Suggested: sign-ups and
   sign-ins 30 per 5 minutes per IP, token verifications 30 per 5 minutes per IP, one code per
   address every 60 seconds.

Steps 3.7 (CAPTCHA), 3.8 (web addresses) and 3.9 (email hook) come after Vercel is live, in step 6.

### 4. Gmail app password (sends the codes)
1. In your Google account open **Security** and turn on **2-Step Verification**.
2. Open **App passwords** (search for it in the account settings), create one named *SujogKhuji*.
3. Put the address in `SMTP_USER` and the 16-letter password in `SMTP_APP_PASSWORD` (spaces are
   fine). `SMTP_FROM_NAME` is the name people see, `MAIL_DAILY_CAP` stops sending before Gmail's
   limit of about 500 a day.

Treat the app password like a real password. If it is ever pasted somewhere public, delete it in
Google and make a new one.

### 5. Push to GitHub and deploy on Vercel
```
git init
git add .
git status
```
Check that **`.env` is not in the list**, then:
```
git commit -m "SujogKhuji"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/sujogkhuji.git
git push -u origin main
```
1. **https://vercel.com** → *Add New → Project* → import the repository. Leave the build settings
   alone; `vercel.json` sets them.
2. **Settings → Environment Variables**, for *Production* and *Preview*:

   | Name | Value | Seen by visitors? |
   |---|---|---|
   | `SUPABASE_URL` | from step 3.4 | yes, it is public |
   | `SUPABASE_ANON_KEY` | publishable / anon key | yes, it is public |
   | `TURNSTILE_SITE_KEY` | from step 6.1 (add later) | yes, it is public |
   | `SEND_EMAIL_HOOK_SECRET` | from step 6.4 (add later) | no |
   | `SMTP_USER` | your Gmail address | no |
   | `SMTP_APP_PASSWORD` | the app password | no |
   | `SMTP_FROM_NAME` | `SujogKhuji` | no |
   | `MAIL_DAILY_CAP` | `400` | no |
   | `MAIL_RPC_SECRET` | your random string | no |

3. *Deploy*. Your site is at `https://YOUR-PROJECT.vercel.app`. The deploy stops with a clear
   message if a secret is put in a public slot.

### 6. Finish in Cloudflare and Supabase
1. **Cloudflare → Turnstile → Add widget** (free). Add your Vercel domain, mode *Managed*.
   Copy the **site key** to Vercel as `TURNSTILE_SITE_KEY`, and keep the **secret key** for the
   next line.
2. Supabase **Authentication → Attack Protection**: turn on CAPTCHA, choose *Turnstile*, paste the
   Turnstile **secret key**.
3. Supabase **Authentication → URL Configuration**: *Site URL* = your Vercel address, and add the
   same address under *Redirect URLs*. No wildcards.
4. Supabase **Authentication → Auth Hooks → Send Email hook**: type *HTTPS*, URL
   `https://YOUR-PROJECT.vercel.app/api/auth-email`, press *Generate secret*, save. Copy the secret
   (it starts with `v1,whsec_`) to Vercel as `SEND_EMAIL_HOOK_SECRET`.
5. In Vercel press **Redeploy** so the two new values are used.

From now on Supabase creates each code and your Vercel function emails it from your Gmail.

### 7. Turn on the twice-daily search
On GitHub: **Settings → Secrets and variables → Actions**

| Tab | Name | Value |
|---|---|---|
| Secrets | `TAVILY_API_KEY` | your `tvly-…` key |
| Secrets | `INGEST_SECRET` | your random string |
| Variables | `SUPABASE_URL` | the project URL |
| Variables | `SUPABASE_ANON_KEY` | the publishable / anon key |

Then **Actions → Update listings → Run workflow**. It runs by itself every day at 06:00 and 18:00
Bangladesh time, saves open listings into the database and removes closed or reported ones. It
also keeps the free Supabase project active.

### 8. Free AI and extra search providers (optional but recommended)
Everything below is free. Add only the ones you want; the site skips any provider without a key.
**Never add a card or buy credits on these accounts**: that is what keeps your bill at zero.

| Provider | Where to get the key | Rules for zero billing |
|---|---|---|
| **Groq** (AI, recommended) | console.groq.com → *API Keys* | Stay on the *Free* plan. Do not upgrade to *Developer* or add a card. When the free daily limit is used up Groq refuses requests; it never charges. |
| **OpenRouter** (AI) | openrouter.ai → *Keys* | Keep the balance at $0 and do not enable auto top-up. The site only ever calls model names ending in `:free`; any other name in `OPENROUTER_MODELS` is ignored. Free models allow 50 requests a day. |
| **Google Gemini** (AI) | aistudio.google.com → *Get API key* | Make the key in a Google Cloud project **with billing turned off**. With billing on, Gemini charges for every call. Only after checking, set `GEMINI_BILLING_DISABLED=yes`; without it the site never calls Gemini. Free-tier prompts may be used by Google to improve its models. |
| **Serper** (search fallback 1) | serper.dev → *API key* | 2,500 free searches, once. Do not buy credits. When they run out Serper refuses requests. |
| **Exa** (search fallback 2) | dashboard.exa.ai → *API keys* | Uses free signup credits. In *Billing*, keep **auto recharge off** and add no card. When credits run out Exa refuses requests (HTTP 402). |

Not used on purpose:
- **Cerebras**: no lasting free tier any more, only short trial credits.
- **GitHub Models**: retired, and its paid opt-in bills all usage.
- The proxy projects LiteLLM, freellmapi, free-llm-proxy-router and freelm: each needs a separate always-on server and holds your keys. A small router inside this project does the same job.

Add each key in three places: `.env` (for local runs), **Vercel → Environment Variables** (for
the Add page) and **GitHub → Secrets** (for the twice-daily search). On GitHub,
`GEMINI_BILLING_DISABLED` and `OPENROUTER_MODELS` go on the *Variables* tab, not *Secrets*.

| Name | Vercel | GitHub |
|---|---|---|
| `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY` | yes | Secrets |
| `GEMINI_BILLING_DISABLED`, `OPENROUTER_MODELS` | yes | Variables |
| `TAVILY_API_KEY`, `SERPER_API_KEY`, `EXA_API_KEY` | yes | Secrets |

Then re-run **`supabase/schema.sql`** in the SQL Editor. It adds the tables for caches, usage
counters and provider cooldowns; until it is run, AI extraction and the extra search providers
stay switched off, so nothing can be overused. Redeploy on Vercel afterwards.

**How much it can do for free.** These numbers are rough and change when providers change their
free plans. The whole site shares them; they are not per user:
- **Twice-daily search:** about 840 Tavily searches a month, plus AI checks of up to 25 new listings per run.
- **AI lookup by name (Add page and Discover):** each lookup makes 2 or 3 web searches. Searches are capped at 40 a day for the whole site and 10 per person, so that is roughly 13 to 20 lookups a day for everyone together. Raise `LIVE_SEARCH_DAILY_CAP` and `USER_SEARCH_DAILY_CAP` only while your search providers still have free searches left. Repeated lookups come from the cache and cost nothing.
- **Groq's free plan allows 8,000 tokens a minute per model.** One lookup uses about 7,500, so when several people look things up in the same minute the engine moves on to the backup model and then to OpenRouter by itself. Answers get slower, never paid.
- **Live AI searches per person:** 5 a day (`USER_LOOKUP_DAILY_CAP`), starting again at 6 AM Bangladesh time. People are told this number the first time they search. Repeats that come from the cache do not count.
- **Add page, AI reading:** 10 an hour and 30 a day per person, and about 600 a day for the whole site.

When a limit is reached, people see a short "temporarily unavailable" message. Pasted text then
falls back to the old in-browser reading.

To see usage, run `select * from private.engine_usage;` in the Supabase SQL Editor.

### 9. Try it
Open the site, create an account with your own email, enter the code, set a password, fill in the
details, track a listing, then sign in on your phone and check that it is there. On the Add page
paste an announcement, a link and a name, and hover over a value in the result to see the quote it
came from. In Discover, type something that is not in the listings and press Enter to see the
live AI search.

---

## Use it

| On | How |
|---|---|
| **PC** | Open the site in Chrome or Edge and click **Install app** at the top. |
| **Android** | Open in Chrome → menu **⋮ → Install app**. It opens full-screen and works offline with the last listings. |
| **iPhone** | Open in Safari → **Share → Add to Home Screen**. |

- **Without an account** everything stays in that browser. **Profile → Export / Import** moves it.
- **Shared or cyber-café computer**: untick *Keep me signed in* and sign out when you finish.
- **Language**: Profile → Appearance → English / বাংলা.

---

## How listings stay authentic

AI never writes listings. Each one is a real web page found by the search, and the collector
(`scraper/collect.py`) keeps it only if:

- it is a specific opening, not a news story, tips article, search page or social-media post;
- its **deadline** is today or later; pages with no deadline are dropped once they look old;
- it does **not ask applicants for money**: registration, processing or application fees with an
  amount, bKash / Nagad / Rocket payment numbers, "send money", "WhatsApp only" or "guaranteed
  job / visa". Official sites that charge a normal exam fee are the one exception;
- **funding**, **pay**, **experience**, job type, work mode, country, education, field and
  organisation type are shown only when the page says so.

When a free AI model is available, each new listing is also read by it. The engine keeps a fact
only if the model quotes the exact sentence that states it, and the quote really supports the
value: the date in the quote must match the deadline, a "fully funded" claim must say so, pay must
contain the same numbers. Everything else is thrown away, so the AI cannot invent deadlines,
funding or pay. Listings the AI marks as closed, not a real opening or asking for money are
removed. The quotes are stored with the listing.

Sources on an official or well-known site get a **Verified source** badge. Everything else says
**Check carefully**, and web addresses written with look-alike letters are flagged. Anyone signed
in can report a listing; three reports hide it for everyone.

`python -m unittest discover -s scraper -p "test_*.py"` runs the collector's checks.

---

## Security

- **Keys**: `.env` never leaves your PC. Only the Supabase address, the publishable key and the
  Turnstile site key reach the browser. The build refuses anything else in those slots.
- **No master key**: the collector and the email function can only call three narrow database
  functions, each protected by its own secret. The Supabase secret key is not used at all.
- **Database rules**: people can read and change only their own profile, applications and
  reports, and only after their email is verified. Listings are read-only for everyone.
- **Limits**: 200 applications per person, 20 steps each, 20 reports a day; one code per address
  per minute, five an hour, and a daily cap for your Gmail.
- **Email function**: accepts only requests signed by Supabase within the last five minutes, and
  logs counts and outcomes, never codes, addresses or passwords.
- **Browser**: scripts load only from your own site and Turnstile; the site cannot be shown inside
  another site's frame; fonts are served from your own domain.
- **Shared devices**: data saved without an account is moved into an account only if the person
  agrees; another person's leftovers are removed; an ended session clears the device.
- **Zero billing**:
  - Only free providers are in the code.
  - OpenRouter is limited to `:free` model names.
  - Gemini stays off until you confirm billing is off.
  - Our own counters stop each provider below its free limit.
  - If the usage database cannot be reached, AI and the extra search providers switch off instead of guessing.
  - A provider that says its quota is used up rests until the quota resets, and nothing paid is ever tried instead.
- **AI safety**:
  - Web pages are treated as data. The model is told never to follow instructions inside them.
  - Its reply must match a strict JSON schema, and every fact is checked against the source text.
  - All AI and search keys stay on the server; the browser only talks to `/api/extract`.
  - That endpoint needs a verified, signed-in user.
- **Link reading**:
  - Only `http`/`https` on normal ports, no usernames or passwords in the link, and no private, local or cloud-metadata addresses.
  - Addresses are checked again at connection time, which defeats DNS tricks.
  - At most 3 redirects, each one re-checked, and never from https down to http.
  - 8-second timeout, 1.5 MB limit, web pages and plain text only.

---

## Run it on your PC

```
npm install
python scraper/collect.py --no-database
python -m http.server 8765 --directory site
```
Then open http://127.0.0.1:8765. Run like this the site is in guest mode, because `site/config.js`
is empty in git. To try accounts locally, install the Vercel CLI and run `vercel dev` after
`npm run config:local` (it fills `site/config.js` from `.env`; run `git restore site/config.js`
before you commit). `npm test` runs the checks for the email function and for the search and AI engine; none of them call a real provider.

---

## Other hosts

- **Netlify**: `netlify.toml` is ready. Import the repository, add the same environment variables,
  and use `https://YOUR-SITE.netlify.app/api/auth-email` for the hook.
- **GitHub Pages**: `docs/github-pages.yml` is a ready workflow for the website alone. Pages cannot
  run the email function, so either keep that one function on Vercel or set Supabase's own
  *SMTP Settings* instead of the hook.
- **Your own domain**: add it in Vercel, then update *Site URL*, *Redirect URLs*, the hook URL and
  the Turnstile widget. If Supabase itself gets a custom domain, add it to the two
  `connect-src` lines in `vercel.json` and `netlify.toml`.

Accounts and data stay in Supabase, so nothing is lost when the website moves.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| No code email arrives | Vercel → project → *Logs* → look for `auth_email`. `rejected`: the hook secret in Vercel and Supabase differ. `gate_unconfigured` or `gate_error`: `MAIL_RPC_SECRET`, `SUPABASE_URL` or `SUPABASE_ANON_KEY` is missing in Vercel, or step 3.3 was skipped. `smtp_failed`: the Gmail address or app password is wrong. |
| *Too many codes requested* | One code per address per minute, five an hour. Wait and try again. |
| Code is always "wrong" | The code works once and for 10 minutes. Check *Email OTP length* is 6. |
| *The security check failed* | The Turnstile site key (Vercel) and secret key (Supabase) are from different widgets, or the domain is not listed in the widget. |
| Profile says *Accounts are not switched on yet* | `SUPABASE_URL` / `SUPABASE_ANON_KEY` are missing in Vercel. Add them and redeploy. |
| Deploy stops in the build step | A secret was put in a public variable, or the address is not `https://…`. The message says which. |
| Action log shows `database: failed with HTTP 403` | `INGEST_SECRET` on GitHub differs from the one stored in step 3.3. |
| Site says *No listings yet* | Run the *Update listings* action and read its log. `HTTP 401`: wrong Tavily key. `HTTP 432`: this month's free searches are used up. |
| Updates stopped after a while | GitHub pauses schedules in repositories with no activity for 60 days. Push a change or run the action by hand. |
| No *Install app* option | Install needs the https site. On Android use Chrome. |
| Add page says *AI extraction is temporarily unavailable* | Either every free AI quota is used up for today (it comes back tomorrow), no AI key is set in Vercel, or `schema.sql` was not re-run after this update. Vercel → *Logs* → look for `extract`; `tried` lists each provider and why it was skipped. |
| Add page: *Live web search has reached today's free limit* | The site-wide daily cap for name searches (`LIVE_SEARCH_DAILY_CAP`) is reached. Paste the text or a link instead. |
| A name lookup says *No matching opportunity was found* for something you know exists | The search providers have no page for it, or it exists only on Facebook, which cannot be read. Paste the text of the post, or its link. |
| Action log shows `search none … tavily:quota, serper:not_configured` | Tavily's monthly free searches are used up and no fallback key is set. Add `SERPER_API_KEY` or `EXA_API_KEY`, or wait for next month. |
| Action log shows `store_unavailable` | `schema.sql` was not re-run after this update, or `INGEST_SECRET` does not match. |
| Action log shows `ai: no free AI provider configured` | No `GROQ_API_KEY`/`OPENROUTER_API_KEY` secret (or Gemini without `GEMINI_BILLING_DISABLED=yes`). Listings are still collected with the rule-based checks. |

---

## Project layout

```
opportunity_bd/
├── site/                       The website
│   ├── index.html, app.css, privacy.html, terms.html
│   ├── theme.js, i18n.js, backend.js, app.js, discover.js, tracker.js, detail.js, auth.js, main.js
│   ├── config.js               Database address, filled in when deploying (empty in git)
│   ├── sw.js, manifest.webmanifest, icons/, fonts/
│   └── data/                   bd_institutions.json, and opportunities.json for local runs
├── api/auth-email.js           Vercel function: emails the code
├── api/extract.js              Vercel function: the Add page's AI extraction
├── netlify/functions/          The same functions for Netlify
├── server/auth-email.js        The email function's logic and its tests
├── server/extract-handler.js   Sign-in check, limits, caching and the three input types
├── server/engine/              Shared engine: safe page fetching, Tavily → Serper → Exa, free AI router, the AI lookup loop, evidence checks
├── scripts/engine.mjs          Lets the Python collector use the same engine
├── scraper/collect.py          Searches the web and saves listings (standard library only)
├── scraper/test_collect.py     Checks for the collector
├── scraper/queries.json        What to search for
├── scripts/build-config.mjs    Runs on deploy: writes config.js and locks the security policy
├── supabase/schema.sql         Tables, rules and functions; run once in Supabase
├── vercel.json, netlify.toml   Hosting settings and security headers
├── docs/github-pages.yml       Optional GitHub Pages workflow
└── .github/workflows/update-listings.yml   Twice-daily search
```
