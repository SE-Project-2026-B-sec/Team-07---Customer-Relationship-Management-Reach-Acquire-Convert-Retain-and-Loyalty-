import type { CampaignStatus } from '@prisma/client';
import { AppError } from '../../common/errors';
import { paged, toSkipTake } from '../../common/pagination';
import { type CampaignRow, campaignsRepository as repo } from './campaigns.repository';
import type {
  CreateCampaignInput,
  ListCampaignsQuery,
  UpdateCampaignInput,
} from './campaigns.schema';

/** Only draft and scheduled campaigns can be edited; running, completed and archived ones are locked. */
const EDITABLE: CampaignStatus[] = ['DRAFT', 'SCHEDULED'];

const toDto = (c: CampaignRow) => ({
  id: c.id,
  name: c.name,
  channel: c.channel,
  budget: c.budget.toNumber(),
  status: c.status,
  startDate: c.startDate,
  endDate: c.endDate,
  segmentId: c.segmentId,
  segmentName: c.segment?.name ?? null,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

async function assertSegmentExists(segmentId: string | null | undefined) {
  if (segmentId && !(await repo.segmentExists(segmentId))) {
    throw new AppError(404, 'SEGMENT_NOT_FOUND', 'Segment not found');
  }
}

export const campaignsService = {
  async list(query: ListCampaignsQuery) {
    const { rows, total } = await repo.list(
      query.status ? { status: query.status } : {},
      toSkipTake(query),
    );
    return paged(rows.map(toDto), total, query);
  },

  async get(id: string) {
    const row = await repo.findById(id);
    if (!row) throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
    return toDto(row);
  },

  async create(input: CreateCampaignInput) {
    await assertSegmentExists(input.segmentId);
    const row = await repo.create({
      name: input.name,
      channel: input.channel,
      budget: input.budget,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
      segmentId: input.segmentId ?? null,
    });
    return toDto(row);
  },

  async update(id: string, input: UpdateCampaignInput) {
    const existing = await repo.findById(id);
    if (!existing) throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
    if (!EDITABLE.includes(existing.status)) {
      throw new AppError(
        409,
        'CAMPAIGN_LOCKED',
        `A ${existing.status.toLowerCase()} campaign cannot be edited`,
      );
    }

    // A change to only one date must still agree with the date that is already saved.
    const start = input.startDate ?? existing.startDate;
    const end = input.endDate ?? existing.endDate;
    if (end < start) {
      throw new AppError(400, 'VALIDATION_ERROR', 'End date must be on or after the start date');
    }

    await assertSegmentExists(input.segmentId);
    const row = await repo.update(id, {
      name: input.name,
      channel: input.channel,
      budget: input.budget,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
      segmentId: input.segmentId,
    });
    return toDto(row);
  },
};
