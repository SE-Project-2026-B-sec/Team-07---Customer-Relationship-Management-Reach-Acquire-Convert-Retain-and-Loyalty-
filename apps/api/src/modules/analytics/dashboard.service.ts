import type { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors';
import { dashboardRepository as repo } from './dashboard.repository';
import type { KpiQuery } from './dashboard.schema';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const startOfDay = (v: string) => new Date(DATE_ONLY.test(v) ? `${v}T00:00:00.000Z` : v);
const endOfDay = (v: string) => new Date(DATE_ONLY.test(v) ? `${v}T23:59:59.999Z` : v);

const percent = (part: number, whole: number) =>
    whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;
const twoDecimals = (n: number) => Math.round(n * 100) / 100;
const rupees = (d: Prisma.Decimal | null) => (d ? d.toNumber() : 0);

/** Default range: the last 30 days, ending at the end of today (UTC). */
function resolveRange(query: KpiQuery) {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const d = now.getUTCDate();
    const to = query.to ? endOfDay(query.to) : new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
    const from = query.from ? startOfDay(query.from) : new Date(Date.UTC(y, m, d - 29));
    if (from > to) {
        throw new AppError(400, 'VALIDATION_ERROR', 'The start date must be on or before the end date');
    }
    return { from, to };
}

export const dashboardService = {
    async kpis(query: KpiQuery) {
        const { from, to } = resolveRange(query);

        const [newLeads, convertedLeads, pipeline, won, ordering, churnRiskCount, loyalty] =
            await Promise.all([
                repo.countLeads(from, to),
                repo.countLeads(from, to, true),
                repo.openPipeline(from, to),
                repo.wonRevenue(from, to),
                repo.customersWhoOrdered(from, to),
                repo.churnRiskCount(),
                repo.loyaltyMembers(from, to),
            ]);

        const customerIds = ordering.map((row) => row.contactId);
        const lifetime = customerIds.length > 0 ? await repo.lifetimeTotals(customerIds, to) : [];
        const lifetimeTotal = lifetime.reduce((sum, row) => sum + rupees(row._sum.amount), 0);
        const repeatCustomers = lifetime.filter((row) => row._count._all > 1).length;

        return {
            range: { from, to },
            newLeads,
            convertedLeads,
            conversionRate: percent(convertedLeads, newLeads),
            openPipelineValue: rupees(pipeline._sum.value),
            openDeals: pipeline._count._all,
            wonRevenue: rupees(won._sum.value),
            wonDeals: won._count._all,
            activeCustomers: customerIds.length,
            averageCustomerValue:
                customerIds.length > 0 ? twoDecimals(lifetimeTotal / customerIds.length) : 0,
            retentionRate: percent(repeatCustomers, customerIds.length),
            churnRiskCount,
            activeLoyaltyMembers: loyalty.length,
        };
    },
};