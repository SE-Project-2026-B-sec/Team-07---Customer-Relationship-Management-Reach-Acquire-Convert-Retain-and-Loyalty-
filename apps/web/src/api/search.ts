// apps/web/src/api/search.ts
import { api } from './client';

export const search = (q: string) =>
  api<{ leads: any[]; contacts: any[]; accounts: any[]; deals: any[]; tickets: any[] }>(`/analytics/search?q=${encodeURIComponent(q)}`);
