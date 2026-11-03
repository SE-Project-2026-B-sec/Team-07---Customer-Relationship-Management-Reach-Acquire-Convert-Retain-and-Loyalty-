import type { Prisma } from '@prisma/client';
import { segmentFilterSchema, type SegmentFilter } from './segments.schema';

const DAY_MS = 86_400_000;

/**
 * Reads a segment's stored filter. Older rows (e.g. seed data { "city": "Bengaluru" }) are
 * upgraded to the current shape; anything unreadable becomes "no rules".
 */
export function readFilter(raw: Prisma.JsonValue): SegmentFilter {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  if ('city' in obj && !('cities' in obj)) {
    obj.cities = obj.city;
    delete obj.city;
  }
  const parsed = segmentFilterSchema.safeParse(obj);
  return parsed.success ? parsed.data : {};
}

/**
 * CRM-F-011: turns a segment filter into a Prisma "where" for contacts.
 * Marketing consent is ALWAYS required (CRM-SR-007 / DPDP Act), whatever the filter says.
 */
export function audienceWhere(filter: SegmentFilter, now = new Date()): Prisma.ContactWhereInput {
  const and: Prisma.ContactWhereInput[] = [{ marketingConsent: true }];

  if (filter.cities?.length) {
    and.push({
      OR: filter.cities.map((city) => ({ city: { equals: city, mode: 'insensitive' as const } })),
    });
  }
  if (filter.tiers?.length) and.push({ tier: { in: filter.tiers } });
  if (filter.tags?.length) and.push({ tags: { hasSome: filter.tags } });
  if (filter.orderedWithinDays) {
    const since = new Date(now.getTime() - filter.orderedWithinDays * DAY_MS);
    and.push({ orders: { some: { orderedAt: { gte: since } } } });
  }
  if (filter.noOrderForDays) {
    const since = new Date(now.getTime() - filter.noOrderForDays * DAY_MS);
    and.push({ orders: { none: { orderedAt: { gte: since } } } });
  }
  return { AND: and };
}

/** A short, human-readable summary of a filter for the segments list. */
export function describeFilter(filter: SegmentFilter): string {
  const parts: string[] = [];
  if (filter.cities?.length) parts.push(`City: ${filter.cities.join(', ')}`);
  if (filter.tiers?.length) parts.push(`Tier: ${filter.tiers.map(title).join(', ')}`);
  if (filter.tags?.length) parts.push(`Tags: ${filter.tags.join(', ')}`);
  if (filter.orderedWithinDays) parts.push(`Ordered in last ${filter.orderedWithinDays} days`);
  if (filter.noOrderForDays) parts.push(`No order for ${filter.noOrderForDays} days`);
  return parts.length ? parts.join(' · ') : 'All consenting contacts';
}

const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
