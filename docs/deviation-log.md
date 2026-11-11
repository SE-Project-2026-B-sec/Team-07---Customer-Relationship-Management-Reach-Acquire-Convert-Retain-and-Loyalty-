# Deviation Log — CRM-RACRL

Every change from the original plan (SRS, SAD, Test Plan, sprint plan), with the reason and its impact.

| # | Date | Area | Planned | Actual | Reason | Impact |
|---|------|------|---------|--------|--------|--------|
| D1 | 27 Oct | Process | Track work in GitHub Projects (course handout) | Tracked in Jira (Scrum board, story points, burndown) | Team lead's instruction | None on scope; burndown in Jira |
| D2 | 29 Oct | Process | Jira linked to GitHub, cards move automatically | Jira not linked; cards moved by hand, Done only after PR merged | Team decision to keep setup simple | Burndown depends on manual updates, checked at each standup |
| D3 | 29 Oct | Schedule | Sprint 1: 27–31 Oct | Sprint 1 started 29 Oct. A sprint was started by mistake during setup and closed with 0 points ("Setup - started by mistake") | Setup delay; wrong sprint started on import | Sprint 1 had 3 working days; extra closed sprint visible in reports |
| D4 | 30 Oct | Tech | Docker Compose for the local database | Docker is the default; members may use a locally installed PostgreSQL 16 instead (README Option B) | Port clash with an existing local PostgreSQL | Local setup only; CI and deployment unchanged |
| D5 | 31 Oct | Scope | CRM-13 (convert lead) done in Sprint 1 | Finished in Sprint 1, merged 1 Nov; carried over to Sprint 2 in Jira | Review and merge waited on CRM-11 | Sprint 1 velocity lower by CRM-13's points |
| D6 | 31 Oct | Scope | CRM-11 includes Contacts and Accounts screens | API merged in Sprint 1 (31 Oct); the Contacts and Accounts screens were merged on 9 Nov (PR #40), together with the Loyalty and User admin screens. Until then contacts were viewed through the Customers and Customer 360 pages | Sprint 1 load on the API work and scrum master duties | Screens arrived after Sprint 2 ended; all their API tests passed from Sprint 1 |
| D7 | 1 Nov | Schedule | Sprint 1 ends 31 Oct | Sprint 1 ran to 1 Nov: global search (CRM-15), convert lead (CRM-13) and the E2E tests (CRM-16) merged on 1 Nov | Late start (D3) left 3 working days | Merges on 1 Nov counted late; Sprint 2 still started on plan, 2 Nov |
| D8 | 3 Nov | Design | Loyalty tier rule not fixed in SRS | Tier = highest tier reached by **lifetime** earned points; redeeming never lowers a tier | Customers should not lose a tier by using their points | CRM-F-051 behaviour defined; TC-LOY-02 tests it |
| D9 | 3 Nov | Design | Points rule | 1 point per full Rs 100 (paise rounding); orders under Rs 100 write no ledger row | Matches acceptance "Rs 2,550 → +25"; avoids zero-value ledger rows | TC-LOY-01 |
| D10 | 29 Oct–3 Nov | Design | Role access per SRS 2.3 | Support can read but not change contacts; only Admin/Sales Manager can delete accounts or assign leads; Admin cannot deactivate themselves | Prevent data loss and admin lock-out | Covered by role tests |
| D11 | 6 Nov | Delivery | CD deploys every merge to Render (CRM-3) | CD failed on every run until 6 Nov: the Render secrets had never been added to GitHub, and the smoke test checked `ok: true` while `/health` returns `{"status":"ok"}`, so each deploy was rolled back. Secrets added and smoke test fixed (PR #36); CD green since | Configuration missed during setup | Live site lagged `main` until 6 Nov; showed the automatic rollback works |
| D12 | 7 Nov | Design | Quote PDF amounts shown in ₹ (CRM-30) | PDF shows "Rs." (the web screen shows ₹) | The built-in PDF font (Helvetica) has no rupee sign | Cosmetic only; totals unchanged |
| D13 | 9 Nov | Scope | Convert button on a qualified lead (CRM-13) | Convert works through the API (`POST /leads/:id/convert`, tested by TC-CONV-05/06); no Convert button on the Leads page | Time; web screens for Sprint 1 API stories came late (D6) | Shown via the API in the demo; listed as a known limitation |
| D14 | 6 Nov | Quality | All tests deterministic | `orders-points.test.ts` "writes nothing when the order fails" counts all orders, so it can fail when other test files create orders in parallel; re-running passes | Test counts the whole table instead of its own rows | Occasional CI re-run; fix: count only the test's own orders |

Add one row for any other change (a story dropped, a test case changed, a date moved).
