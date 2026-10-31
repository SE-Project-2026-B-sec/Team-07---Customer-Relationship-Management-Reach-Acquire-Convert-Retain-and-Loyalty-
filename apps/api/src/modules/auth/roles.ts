import type { Role } from '@prisma/client';

/**
 * Who may use what (SRS 2.3 user classes). Use these groups with authorize(), e.g.
 *   router.get('/contacts', authenticate, authorize(...SALES_TEAM, 'SUPPORT'), list)
 *
 * | Area                         | Roles                                   |
 * | ---------------------------- | --------------------------------------- |
 * | Users, rewards catalogue     | ADMIN                                   |
 * | Campaigns, segments          | ADMIN, MARKETING                        |
 * | Leads (view)                 | ADMIN, MARKETING, SALES_MANAGER, SALES_REP |
 * | Lead assignment              | ADMIN, SALES_MANAGER                    |
 * | Contacts, accounts, deals    | ADMIN, SALES_MANAGER, SALES_REP (+ SUPPORT read contacts) |
 * | Tickets, loyalty, Customer 360 | ADMIN, SUPPORT (+ SALES_MANAGER read)  |
 * | Dashboard, search            | everyone logged in                      |
 * | Reports, funnel              | ADMIN, MARKETING, SALES_MANAGER         |
 */
export const ALL_ROLES: Role[] = ['ADMIN', 'MARKETING', 'SALES_MANAGER', 'SALES_REP', 'SUPPORT'];
export const ADMIN_ONLY: Role[] = ['ADMIN'];
export const MANAGERS: Role[] = ['ADMIN', 'SALES_MANAGER'];
export const SALES_TEAM: Role[] = ['ADMIN', 'SALES_MANAGER', 'SALES_REP'];
export const MARKETING_TEAM: Role[] = ['ADMIN', 'MARKETING'];
export const SUPPORT_TEAM: Role[] = ['ADMIN', 'SUPPORT'];
export const LEAD_VIEWERS: Role[] = ['ADMIN', 'MARKETING', 'SALES_MANAGER', 'SALES_REP'];
export const REPORT_VIEWERS: Role[] = ['ADMIN', 'MARKETING', 'SALES_MANAGER'];
