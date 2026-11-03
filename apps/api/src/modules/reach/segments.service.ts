import type { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors';
import { paged, type Pagination, toSkipTake } from '../../common/pagination';
import { audienceWhere, describeFilter, readFilter } from './segments.audience';
import { segmentsRepository as repo } from './segments.repository';
import type {
  CreateSegmentInput,
  ListSegmentsQuery,
  SegmentFilter,
  UpdateSegmentInput,
} from './segments.schema';

type SegmentRow = NonNullable<Awaited<ReturnType<typeof repo.findById>>>;

async function toDto(s: SegmentRow) {
  const filter = readFilter(s.filterJson);
  return {
    id: s.id,
    name: s.name,
    filter,
    summary: describeFilter(filter),
    audienceSize: await repo.countContacts(audienceWhere(filter)),
    campaignCount: s._count.campaigns,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

async function getOrThrow(id: string) {
  const segment = await repo.findById(id);
  if (!segment) throw new AppError(404, 'SEGMENT_NOT_FOUND', 'Segment not found');
  return segment;
}

const asJson = (filter: SegmentFilter) => filter as Prisma.InputJsonObject;

/**
 * Contact ids a campaign should go to (CRM-19). Always respects marketing consent.
 * Exported from the Reach module so the send step uses exactly the same rules as the preview.
 */
export async function resolveAudience(segmentId: string): Promise<string[]> {
  const segment = await getOrThrow(segmentId);
  return repo.allContactIds(audienceWhere(readFilter(segment.filterJson)));
}

export const segmentsService = {
  async list(query: ListSegmentsQuery) {
    const { rows, total } = await repo.list(toSkipTake(query));
    return paged(await Promise.all(rows.map(toDto)), total, query);
  },

  async get(id: string) {
    return toDto(await getOrThrow(id));
  },

  async create(input: CreateSegmentInput) {
    return toDto(await repo.create({ name: input.name, filterJson: asJson(input.filter) }));
  },

  async update(id: string, input: UpdateSegmentInput) {
    await getOrThrow(id);
    return toDto(
      await repo.update(id, {
        name: input.name,
        ...(input.filter ? { filterJson: asJson(input.filter) } : {}),
      }),
    );
  },

  /** Live count and first 10 matches while building a segment, before saving it. */
  async preview(filter: SegmentFilter) {
    const { rows, total } = await repo.listContacts(audienceWhere(filter), { skip: 0, take: 10 });
    return { audienceSize: total, sample: rows, summary: describeFilter(filter) };
  },

  async audience(id: string, query: Pagination) {
    const segment = await getOrThrow(id);
    const { rows, total } = await repo.listContacts(
      audienceWhere(readFilter(segment.filterJson)),
      toSkipTake(query),
    );
    return paged(rows, total, query);
  },
};
