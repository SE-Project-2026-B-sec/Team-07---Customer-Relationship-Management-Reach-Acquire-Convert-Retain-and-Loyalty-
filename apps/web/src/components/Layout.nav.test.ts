import { describe, expect, it } from 'vitest';
import type { Role } from '../auth/AuthContext';
import { NAV } from './Layout';

const menuFor = (role: Role) =>
  NAV.filter((item) => !item.roles || item.roles.includes(role)).map((item) => item.label);

describe('Customers menu item (CRM-22)', () => {
  it('is shown to Admin, Sales Manager and Support', () => {
    for (const role of ['ADMIN', 'SALES_MANAGER', 'SUPPORT'] as const) {
      expect(menuFor(role)).toContain('Customers');
    }
  });

  it('is hidden from a Sales Rep and from Marketing', () => {
    for (const role of ['SALES_REP', 'MARKETING'] as const) {
      expect(menuFor(role)).not.toContain('Customers');
    }
  });
});
