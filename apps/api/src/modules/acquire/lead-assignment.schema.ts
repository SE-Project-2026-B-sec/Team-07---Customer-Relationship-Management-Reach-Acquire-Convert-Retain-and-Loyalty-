// CRM-10 (CRM-F-023): request validation for lead assignment.
import { z } from 'zod';

// PATCH /leads/:id/assign
export const assignLeadBody = z.object({
  ownerId: z.string().min(1, 'Pick a sales rep'),
});
export type AssignLeadBody = z.infer<typeof assignLeadBody>;

// POST /leads/assign/round-robin
export const roundRobinBody = z.object({
  leadIds: z.array(z.string().min(1)).min(1, 'Select at least one lead').max(500),
  // Optional: limit the rotation to these reps. Default = every active sales rep.
  repIds: z.array(z.string().min(1)).min(1).optional(),
});
export type RoundRobinBody = z.infer<typeof roundRobinBody>;
