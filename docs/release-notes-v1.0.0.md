# CRM-RACRL v1.0.0 — Release Notes

Customer Relationship Management covering Reach → Acquire → Convert → Retain → Loyalty.

**Team:** Balla Santhosh, Dhriti Kamani, Disha Lokesh, Diya Agarwal
**Stack:** React + Vite + TypeScript, Node/Express + TypeScript, PostgreSQL + Prisma, GitHub Actions CI/CD
**Live app:** **[add URL]**  ·  **Demo video:** **[add link]**

## What's included

| Module | Features | Stories |
|--------|----------|---------|
| Auth | Login with JWT, role-based access (6 roles), user admin (create, deactivate, change role) | CRM-4, 5, 6, 7 |
| Reach | Segments with live audience count, campaigns and metrics | CRM-17, 18 **[check]** |
| Acquire | Lead capture and enquiry form, CSV import, manual and round-robin assignment | CRM-8, 9, 10 |
| Convert | Contacts and accounts, convert lead (one transaction), deal pipeline board, activities | CRM-11, 12, 13, 14 |
| Retain | Tickets with SLA, churn-risk flag, Customer 360 timeline | CRM-21, 22 **[check]**, 23 |
| Loyalty | Orders and points ledger, tiers **[add rewards/referrals if merged]** | CRM-24, 25 **[check]** |
| Analytics | Dashboard KPIs, global search, funnel report and CSV export, audit log | CRM-15, 28 **[check]**, 29, 31 |

## Quality

- API tests: **[number]** passing; web tests: **[number]** passing; E2E: Playwright specs in `apps/web/e2e`
- CI on every PR: lint, type-check, API tests on PostgreSQL, web tests; PR title must carry a Jira key
- Every story merged through a reviewed PR

## Known limitations

- **[check]** list anything not finished or moved out of scope (see `docs/deviation-log.md`)

## Run it

See `README.md` section 1.

## Demo video

https://drive.google.com/file/d/10v-RdQ3F_61XaTvyvyuB09QEID2zvGDy/view?usp=drive_link
