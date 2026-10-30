export const ACTIVITY_TYPES = ['TASK', 'CALL', 'MEETING', 'NOTE'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  TASK: 'Task',
  CALL: 'Call',
  MEETING: 'Meeting',
  NOTE: 'Note',
};

export interface Activity {
  id: string;
  type: ActivityType;
  subject: string;
  notes: string | null;
  dueAt: string | null;
  done: boolean;
  /** Worked out by the server: due in the past and not done. */
  overdue: boolean;
  createdAt: string;
  userId: string;
  userName: string;
  leadId: string | null;
  contactId: string | null;
  dealId: string | null;
  linkLabel: string | null;
}

export interface ActivitiesPage {
  data: Activity[];
  page: number;
  pageSize: number;
  total: number;
}

/** What an activity is attached to. Exactly one of these. */
export type ActivityLink = { dealId: string } | { contactId: string } | { leadId: string };

export const formatDue = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
