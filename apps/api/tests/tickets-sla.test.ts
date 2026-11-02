// CRM-21 unit tests for the SLA rules (TC-RET-01, unit part).
import { isBreached, SLA_HOURS, slaDueAt } from '../src/modules/retain/tickets.sla';

const raised = new Date('2026-11-02T10:00:00.000Z');
const hours = (h: number) => new Date(raised.getTime() + h * 3_600_000);

describe('Ticket SLA rules (CRM-21)', () => {
  it('TC-RET-01 an Urgent ticket is due 4 hours after it is raised', () => {
    expect(SLA_HOURS.URGENT).toBe(4);
    expect(slaDueAt(raised, 'URGENT')).toEqual(hours(4));
  });

  it('sets a longer due time for lower priorities', () => {
    expect(slaDueAt(raised, 'HIGH')).toEqual(hours(24));
    expect(slaDueAt(raised, 'MEDIUM')).toEqual(hours(48));
    expect(slaDueAt(raised, 'LOW')).toEqual(hours(72));
  });

  it('TC-RET-01 an open ticket is breached only after its due time passes', () => {
    const ticket = { status: 'OPEN' as const, slaDueAt: hours(4) };
    expect(isBreached(ticket, hours(3))).toBe(false);
    expect(isBreached(ticket, hours(4))).toBe(false);
    expect(isBreached(ticket, hours(4.01))).toBe(true);
  });

  it('counts In Progress as open', () => {
    expect(isBreached({ status: 'IN_PROGRESS', slaDueAt: hours(4) }, hours(5))).toBe(true);
  });

  it('never marks a resolved or closed ticket as breached', () => {
    expect(isBreached({ status: 'RESOLVED', slaDueAt: hours(4) }, hours(10))).toBe(false);
    expect(isBreached({ status: 'CLOSED', slaDueAt: hours(4) }, hours(10))).toBe(false);
  });
});
