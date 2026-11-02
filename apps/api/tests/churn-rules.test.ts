// CRM-23 unit tests for the churn-risk rule (TC-RET-03).
import { evaluateChurn } from '../src/modules/retain/churn.rules';

const now = new Date('2026-11-02T12:00:00.000Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe('Churn-risk rule (CRM-23)', () => {
  it('TC-RET-03 last order 91 days ago sets the flag', () => {
    const result = evaluateChurn({ lastOrderAt: daysAgo(91), openHighTickets: 0 }, now);
    expect(result).toEqual({ atRisk: true, reasons: ['NO_RECENT_ORDER'] });
  });

  it('TC-RET-03 last order 89 days ago does not', () => {
    expect(evaluateChurn({ lastOrderAt: daysAgo(89), openHighTickets: 0 }, now).atRisk).toBe(false);
  });

  it('an order exactly 90 days ago still counts as recent', () => {
    expect(evaluateChurn({ lastOrderAt: daysAgo(90), openHighTickets: 0 }, now).atRisk).toBe(false);
  });

  it('someone who has never ordered is not flagged for lack of orders', () => {
    expect(evaluateChurn({ lastOrderAt: null, openHighTickets: 0 }, now).atRisk).toBe(false);
  });

  it('two open High/Urgent tickets set the flag; one does not', () => {
    expect(evaluateChurn({ lastOrderAt: null, openHighTickets: 2 }, now)).toEqual({
      atRisk: true,
      reasons: ['OPEN_HIGH_TICKETS'],
    });
    expect(evaluateChurn({ lastOrderAt: daysAgo(1), openHighTickets: 1 }, now).atRisk).toBe(false);
  });

  it('lists both reasons when both apply', () => {
    expect(evaluateChurn({ lastOrderAt: daysAgo(200), openHighTickets: 3 }, now).reasons).toEqual([
      'NO_RECENT_ORDER',
      'OPEN_HIGH_TICKETS',
    ]);
  });
});
