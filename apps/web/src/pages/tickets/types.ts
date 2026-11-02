// CRM-21: shapes of the /tickets API (see apps/api/src/modules/retain/tickets.service.ts).
import type { Role } from '../../auth/AuthContext';

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type Status = (typeof STATUSES)[number];

/** Roles that can create and update tickets (Sales Manager can only read). */
export const TICKET_WRITERS: Role[] = ['ADMIN', 'SUPPORT'];

export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const PRIORITY_STYLE: Record<Priority, string> = {
  LOW: 'bg-slate-100 text-slate-800',
  MEDIUM: 'bg-blue-100 text-blue-900',
  HIGH: 'bg-orange-100 text-orange-900',
  URGENT: 'bg-red-100 text-red-900',
};

export const STATUS_LABEL: Record<Status, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export interface Ticket {
  id: string;
  subject: string;
  description: string;
  priority: Priority;
  status: Status;
  slaDueAt: string;
  resolvedAt: string | null;
  breached: boolean;
  contactId: string;
  contactName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketsPage {
  data: Ticket[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ContactOption {
  id: string;
  name: string;
  email: string;
}

export interface Assignee {
  id: string;
  name: string;
}

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** "3h 20m" style duration, used for "Due in …" and "Overdue by …". */
export function formatDuration(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** Short SLA text for the table: overdue, due soon, or when it was resolved. */
export function slaText(t: Ticket, now = Date.now()) {
  const due = new Date(t.slaDueAt).getTime();
  if (t.status === 'RESOLVED' || t.status === 'CLOSED') {
    return t.resolvedAt ? `Resolved ${formatDateTime(t.resolvedAt)}` : 'Resolved';
  }
  return due < now
    ? `Overdue by ${formatDuration(now - due)}`
    : `Due in ${formatDuration(due - now)}`;
}
