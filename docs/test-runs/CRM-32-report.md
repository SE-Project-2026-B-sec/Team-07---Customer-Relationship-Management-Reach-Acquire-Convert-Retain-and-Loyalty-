# CRM-32 — Performance, security and accessibility test runs

**Story:** CRM-32 · **Run by:** Diya Agarwal · **Date:** 3 Nov 2026 · **Build:** `main` at `f0688bb` + CRM-32 branch

This report records the non-functional test cases from the Software Test Plan (STP §5, §5.1, §13)
that CRM-32 covers. Every automated check is in the repository so it can be re-run (see *How to
re-run*).

## Summary

| Test case | Requirement | What was checked | Result |
|---|---|---|---|
| TC-PERF-01 | CRM-NF-001 | k6, 50 virtual users, 2 min, list/detail/report endpoints | **Pass** (local) — p95 **50 ms**, errors **0 %** |
| TC-PERF-02 | CRM-NF-002 | Lighthouse performance ≥ 70, first render < 3 s at 10 Mbps | **Pass** — score **100** (desktop) / **99** (mobile), dashboard **0.3–1.5 s** |
| TC-PERF-03 | CRM-NF-008 | 10,000 contacts, `pageSize=500` capped at 100, < 500 ms | **Pass** — capped at 100, worst **22 ms** |
| TC-UX-01 | CRM-NF-004 | No horizontal scroll at 360 px on 11 pages | **Pass** after fix (2 pages failed first) |
| TC-UX-02 | CRM-NF-005 | axe: no critical WCAG 2.1 AA issues; Lighthouse a11y ≥ 90 | **Pass** — **0** axe issues after fix; Lighthouse a11y **100** |
| TC-SEC-01 | CRM-SR-001 | HSTS header; HTTP → HTTPS redirect | HSTS **Pass**; redirect **Pending** (deployed site, `nfr.yml`) |
| TC-SEC-02 | CRM-SR-002 | bcrypt hashes; no passwords/tokens in logs | **Pass** |
| TC-SEC-03 | CRM-SR-003 | Expired and tampered JWT → 401 | **Pass** (existing `auth.test.ts`) |
| TC-SEC-04 | CRM-SR-004 | Every route × role returns 401/403 as specified | **Pass** (existing `route-guard.test.ts`, `roles.test.ts`) |
| TC-SEC-05 | CRM-SR-005 | Malformed / injection-style input → 4xx; ZAP baseline no High | Input **Pass** after fix; ZAP **Pending** (`nfr.yml`) |
| TC-SEC-06 | CRM-SR-006 | Request 101/min → 429; honeypot drops bots | **Pass** (existing `leads.test.ts`) |
| TC-SEC-07 | CRM-SR-007 | Consent filter; export and delete a contact's data | **Pass** after fix (delete failed first — D-5) |

## Environment

- Windows 11 laptop, Node 22.20, PostgreSQL 16 in Docker, seeded demo data.
- API: production build (`node apps/api/dist/index.js`, `NODE_ENV=production`).
- Web: production build served by `vite preview` (not the dev server).
- Chromium from Playwright 1.64, Lighthouse 12.2.1, k6 0.54.0, axe-core via `@axe-core/playwright`.
- Local runs show the code's own speed. Deployed numbers (Render free tier, which sleeps when idle)
  will be slower; run `nfr.yml` for those.

## Results in detail

### TC-PERF-01 — API latency under load (k6)

Script: `perf/api-load.js`. One login in `setup()`, then 50 VUs each pick a random read endpoint
(`/leads`, `/contacts`, `/accounts`, `/deals`, `/tickets`, `/search`, `/dashboard/kpis`,
`/reports/funnel`, `/churn-risk`) with 0.5–1.5 s think time. Raw summary:
`docs/test-runs/k6-local-summary.json`.

| Metric | Result | Target |
|---|---|---|
| Requests | 5,893 (48.6/s) | — |
| p95 latency | **49.99 ms** | < 500 ms |
| Median / p90 / max | 20.6 / 42.1 / 311 ms | — |
| Failed requests | **0 %** (0 of 5,893) | < 1 % |
| Checks (status 200) | 100 % | — |

### TC-PERF-02 — Page load

| Page | Lighthouse perf | Accessibility | Best practices | FCP / LCP | TBT |
|---|---|---|---|---|---|
| /login (desktop) | **100** | **100** | 96 | 0.4 s / 0.4 s | 0 ms |
| /enquiry (desktop) | **100** | **100** | 96 | 0.4 s / 0.4 s | 0 ms |
| /login (mobile, slow 4G — stricter than 10 Mbps) | **99** | **100** | — | 1.6 s / 1.6 s | 0 ms |

The dashboard needs a login, which Lighthouse cannot do, so `apps/web/e2e/perf.spec.ts` times it in
Chromium throttled to 10 Mbps down / 5 Mbps up / 40 ms latency with the cache off:

| Run | First render (cold) | Dashboard KPIs shown after "Sign in" |
|---|---|---|
| 1 | 390 ms | 316 ms |
| 2 | 323 ms | 433 ms |
| 3 | 371 ms | 359 ms |
| 4 | 316 ms | 1,528 ms |

All under the 3 s target. Total JavaScript + CSS + HTML on first load: 116 KiB.

### TC-PERF-03 — Pagination at scale

`apps/api/tests/pagination-scale.test.ts` adds 10,000 contacts, then times requests (worst of
several, after a warm-up):

| Request | Rows returned | Worst time |
|---|---|---|
| `GET /contacts?pageSize=500` | 100 (capped) | **22 ms** |
| `GET /contacts?page=90&pageSize=100` (deep page) | 100 | 96 ms |
| `GET /contacts?q=…` (search over 10k) | 100 of 1,000 | 29 ms |

### TC-UX-01 — 360 px width

`apps/web/e2e/a11y.spec.ts` measures sideways overflow on Login, Enquiry form, Dashboard,
Campaigns, Segments, Leads, Customers, Deals, Tickets, Reports and Audit log at 360 × 740.

- First run: **Campaigns overflowed by 349 px, Customers by 173 px** (defect D-3).
- After the fix: **0 px on all 11 pages.**

Click counts for create lead / convert lead / redeem reward (the other half of CRM-NF-004) are a
manual check and are not part of CRM-32.

### TC-UX-02 — Accessibility

axe (WCAG 2.0/2.1 A and AA rules) on the same 11 pages, signed in as Admin:

- First run: no critical issues; **1 serious** issue on the Dashboard — `definition-list`
  (defect D-4).
- After the fix: **0 issues of any level.**
- Lighthouse accessibility: **100** on the public pages.

### Security (TC-SEC-01 … 07)

New checks are in `apps/api/tests/security.test.ts`; the rest were already in the suite.

| Check | Result |
|---|---|
| `Strict-Transport-Security: max-age=31536000; includeSubDomains` on every response | Pass |
| Authorization header, cookies, `password`, `passwordHash` are `[Redacted]` in logs | Pass |
| Passwords stored as bcrypt `$2b$10$…` (`auth.test.ts`) | Pass |
| Expired and wrong-secret tokens → 401 (`auth.test.ts`) | Pass |
| Every protected route → 401 without a token; role table enforced (`route-guard`, `roles`) | Pass |
| SQL-like search text is treated as text; table untouched | Pass |
| Non-UUID id → 400; object instead of string at login → 400 | Pass |
| Malformed JSON → **400** (was 500, defect D-1) | Pass after fix |
| Body over 1 MB → **413** (was 500, defect D-2) | Pass after fix |
| `<script>` in a name is stored as text and returned as JSON | Pass |
| 101st login / form submission in a minute → 429; honeypot submissions dropped (`leads.test.ts`) | Pass |
| Contacts without consent never in a campaign audience (`segments.test.ts`) | Pass |
| A contact's data can be exported (`GET /customers/:id/360` returns profile and history) | Pass |
| A contact with a ticket can be erased on request: personal data wiped from the contact, its lead and the audit log; ticket kept | Pass after fix (was 500, D-5) |
| A contact with no history is deleted outright | Pass |

## Defects found

| ID | Severity | Where | Problem | Status |
|---|---|---|---|---|
| D-1 | Medium | API error handler | Malformed JSON body returned **500** instead of 400 | **Fixed** in CRM-32 (`common/errors.ts`) |
| D-2 | Low | API error handler | Body over 1 MB returned **500** instead of 413 | **Fixed** in CRM-32 |
| D-3 | Medium | Campaigns, Customers pages | Page scrolled sideways at 360 px: a screen-reader-only table header was positioned against the page, not the table's scroll box | **Fixed** — table wrappers are now `relative` (all 10 tables) |
| D-4 | Low | Dashboard KPI cards | `<p>` inside `<dl>` (axe `definition-list`, serious) | **Fixed** — hint is now a `<dd>` |
| D-5 | **High** | Contacts (CRM-11) | `DELETE /contacts/:id` returned **500** when the contact had tickets, deals or orders (foreign keys), so "delete on request" (CRM-SR-007, DPDP Act) failed for real customers | **Fixed** — such contacts are now anonymised: name, email, phone, city, tags and consent are wiped (also on the lead they came from), campaign history is removed and their audit details are replaced with "erased on request". Deals, orders, tickets and points are kept so business totals stay correct. Contacts with no history are still deleted outright. |

## Pending (needs the deployed site)

Run **Actions → NFR runs → Run workflow** (`.github/workflows/nfr.yml`) with the Vercel and Render
URLs, then add the results here:

- TC-SEC-01: plain HTTP redirects to HTTPS on both sites, and HSTS is sent.
- TC-SEC-05: OWASP ZAP baseline on the web app — pass if no High alerts (report attached as an
  artifact).
- TC-PERF-01 on Render: same k6 script against the live API.

Not part of CRM-32: TC-OPS-01 (uptime week), TC-OPS-03/04/05 and the click-count half of TC-UX-01.

## How to re-run

```bash
# API security + 10k pagination (needs the database)
npm test -w apps/api -- security pagination-scale auth route-guard leads segments

# Accessibility + 360 px (starts the dev servers)
npx playwright test e2e/a11y.spec.ts   # from apps/web

# Page-load timing against a production build
npm run build -w apps/web && npx vite preview --port 5173   # from apps/web, plus the API on 4000
npm run test:perf -w apps/web

# Load test (API running on port 4000)
docker run --rm -i -e API_URL=http://host.docker.internal:4000/api/v1 -v "$PWD/perf:/perf" \
  grafana/k6:0.54.0 run --summary-export /perf/k6-summary.json - < perf/api-load.js
```
