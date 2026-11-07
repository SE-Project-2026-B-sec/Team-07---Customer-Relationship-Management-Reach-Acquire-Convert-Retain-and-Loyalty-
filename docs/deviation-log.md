# Deviation Log — CRM-RACRL

Every change from the original plan (SRS, SAD, Test Plan, sprint plan), with the reason and its impact.

| # | Date | Area | Planned | Actual | Reason | Impact |
|---|------|------|---------|--------|--------|--------|
| D1 | 27 Oct | Process | Track work in GitHub Projects (course handout) | Tracked in Jira (Scrum board, story points, burndown) | Team lead's instruction | None on scope; burndown in Jira |
| D2 | 29 Oct | Process | Jira linked to GitHub, cards move automatically | Jira not linked; cards moved by hand, Done only after PR merged | Team decision to keep setup simple | Burndown depends on manual updates, checked at each standup |
| D3 | 29 Oct | Schedule | Sprint 1: 27–31 Oct | Sprint 1 started 29 Oct. A sprint was started by mistake during setup and closed with 0 points ("Setup - started by mistake") | Setup delay; wrong sprint started on import | Sprint 1 had 3 working days; extra closed sprint visible in reports |
| D4 | 30 Oct | Tech | Docker Compose for the local database | Docker is the default; members may use a locally installed PostgreSQL 16 instead (README Option B) | Port clash with an existing local PostgreSQL | Local setup only; CI and deployment unchanged |
| D5 | 31 Oct | Scope | CRM-13 (convert lead) done in Sprint 1 | Finished in Sprint 1, merged 1 Nov; carried over to Sprint 2 in Jira | Review and merge waited on CRM-11 | Sprint 1 velocity lower by CRM-13's points |
| D6 | 31 Oct | Scope | CRM-11 includes Contacts and Accounts screens | **[check]** API merged in Sprint 1; screens delivered in ___ / covered by Customers pages | **[check]** | **[check]** |
| D7 | 1 Nov | Schedule | Sprint 1 ends 31 Oct | **[check]** Deadline extended to ___ | **[check]** | Merges on 1 Nov counted late |
| D8 | 3 Nov | Design | Loyalty tier rule not fixed in SRS | Tier = highest tier reached by **lifetime** earned points; redeeming never lowers a tier | Customers should not lose a tier by using their points | CRM-F-051 behaviour defined; TC-LOY-02 tests it |
| D9 | 3 Nov | Design | Points rule | 1 point per full Rs 100 (paise rounding); orders under Rs 100 write no ledger row | Matches acceptance "Rs 2,550 → +25"; avoids zero-value ledger rows | TC-LOY-01 |
| D10 | 29 Oct–3 Nov | Design | Role access per SRS 2.3 | Support can read but not change contacts; only Admin/Sales Manager can delete accounts or assign leads; Admin cannot deactivate themselves | Prevent data loss and admin lock-out | Covered by role tests |
| D11 | **[check]** | | | | | |

Add one row for any other change (a story dropped, a test case changed, a date moved).
