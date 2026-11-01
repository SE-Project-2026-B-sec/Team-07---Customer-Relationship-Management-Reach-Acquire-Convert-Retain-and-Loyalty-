// CRM-16: shared helpers for the end-to-end tests.
// Uses the seeded demo accounts (one per role, all @crm.test, password from SEED_PASSWORD).
import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000/api/v1';
export const PASSWORD = process.env.SEED_PASSWORD ?? 'Password@123';

/** A short unique string so each run creates its own records. */
export const uniqueTag = () => `e2e${Date.now()}${Math.floor(Math.random() * 1e4)}`;

/**
 * Logs in through the login page and waits for the dashboard.
 * The token lives in memory only, so after this use the menu to move around (page.goto logs out).
 */
export async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

/** Opens a page from the left menu (keeps the in-memory login). */
export async function openFromMenu(page: Page, label: string) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label }).click();
}

/** Small API client for setting up test data directly, logged in as `email`. */
export async function apiAs(request: APIRequestContext, email: string) {
  const login = await request.post(`${API_URL}/auth/login`, {
    data: { email, password: PASSWORD },
  });
  expect(login.ok(), `API login failed for ${email}`).toBeTruthy();
  const { token } = (await login.json()) as { token: string };
  const headers = { Authorization: `Bearer ${token}` };

  async function send<T>(method: 'get' | 'post' | 'patch', path: string, data?: unknown) {
    const res = await request[method](`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `${method.toUpperCase()} ${path} -> ${res.status()}`).toBeTruthy();
    return (await res.json()) as T;
  }

  return {
    get: <T>(path: string) => send<T>('get', path),
    post: <T>(path: string, data: unknown) => send<T>('post', path, data),
    patch: <T>(path: string, data: unknown) => send<T>('patch', path, data),
  };
}
