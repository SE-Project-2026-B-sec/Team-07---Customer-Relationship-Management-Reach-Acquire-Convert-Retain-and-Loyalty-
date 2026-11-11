# CRM-RACRL v1.0.0 — Release Notes

Customer Relationship Management covering Reach → Acquire → Convert → Retain → Loyalty.

**Team:** Balla Santhosh, Dhriti Kamani, Disha Lokesh, Diya Agarwal
**Stack:** React + Vite + TypeScript, Node/Express + TypeScript, PostgreSQL + Prisma, GitHub Actions CI/CD
**Live app (Vercel):** https://team-07-customer-relationship-manag.vercel.app/  ·  **Live API (Render):** https://team-07-customer-relationship-management.onrender.com/api/v1/health
**Demo video:** https://drive.google.com/file/d/10v-RdQ3F_61XaTvyvyuB09QEID2zvGDy/view?usp=drive_link

## What's included

33 stories, 107 story points, delivered over two sprints (Sprint 1: 53 points, Sprint 2: 54 points).

| Module | Features | Stories |
|--------|----------|---------|
| Setup & delivery | Monorepo, database schema and demo data, CI workflow, deploy pipeline with health check and rollback | CRM-1, 2, 3 |
| Auth | Login with JWT, role-based access (5 roles), user admin (create, deactivate, change role) | CRM-4, 5, 6, 7 |
| Reach | Segments with live audience count and consent filter, campaigns, campaign sends (simulated) and metrics | CRM-17, 18, 19 |
| Acquire | Lead capture and public enquiry form, CSV import, manual and round-robin assignment, lead scoring 0–100 | CRM-8, 9, 10, 20 |
| Convert | Contacts and accounts, convert lead (one transaction), deal pipeline board, activities with overdue reminders, quote PDF | CRM-11, 12, 13, 14, 30 |
| Retain | Tickets with SLA, churn-risk flag, Customer 360 timeline | CRM-21, 22, 23 |
| Loyalty | Orders and append-only points ledger, tiers, reward catalogue and redemption, referral codes and bonus points | CRM-24, 25, 26, 27 |
| Analytics | Dashboard KPIs with date filter, global search, funnel report and CSV export, audit log | CRM-15, 28, 29, 31 |
| QA & docs | E2E tests and Sprint 1 video, performance / security / accessibility test runs, final docs and video | CRM-16, 32, 33 |

## Quality

- API tests: **409** passing (35 files, Jest + Supertest on a real PostgreSQL); API line coverage **98%** (CI fails below 70%)
- Web tests: **112** passing (22 files, Vitest + Testing Library); E2E: **18** Playwright tests in `apps/web/e2e`
- Performance: p95 API latency 50 ms with 50 users, 0% errors (target < 500 ms); Lighthouse 100 desktop, 99 mobile
- Accessibility: 0 axe issues (WCAG 2.1 AA); usable at 360 px width — see `docs/test-runs/CRM-32-report.md`
- CI on every PR: lint, type-check, API tests on PostgreSQL, web tests, build, E2E; PR title must carry a Jira key
- CD after every merge to `main`: deploy to Render, health check, automatic rollback if the check fails
- Every story merged through a reviewed PR (37 PRs)

## Known limitations

- The Leads page has no **Convert** button yet; converting a lead works through the API (`POST /leads/:id/convert`).
- Campaign sends are simulated through a logging notification service; no real email/SMS provider is connected.
- Quote PDFs show amounts as "Rs." instead of "₹" (the built-in PDF font has no rupee sign).
- One API test (`orders-points.test.ts`, "writes nothing when the order fails") can fail at random when test files run in parallel; re-running passes.
- See `docs/deviation-log.md` for every change from the original plan.

## Run it

See `README.md` section 1.
