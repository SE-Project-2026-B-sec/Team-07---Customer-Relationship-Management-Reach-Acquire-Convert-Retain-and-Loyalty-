// CRM-16 E2E: TC-AUTH-01 (valid login), TC-AUTH-02 (invalid login), TC-AUTH-03 (role-based menu).
import { expect, test } from '@playwright/test';
import { loginAs, PASSWORD } from './helpers';

test('TC-AUTH-01 admin logs in and sees the dashboard with the Admin menu', async ({ page }) => {
  await loginAs(page, 'admin@crm.test');

  await expect(page.getByText('Admin User')).toBeVisible();
  const menu = page.getByRole('navigation', { name: 'Main' });
  await expect(menu.getByRole('link', { name: 'Admin' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Campaigns' })).toBeVisible();
});

test('TC-AUTH-02 wrong password shows a generic error and stays on login', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@crm.test');
  await page.getByLabel('Password').fill(`${PASSWORD}-wrong`);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
  await expect(page).toHaveURL(/\/login$/);
});

test('TC-AUTH-03 Sales Rep does not see the Admin or Campaigns menu', async ({ page }) => {
  await loginAs(page, 'rep@crm.test');

  const menu = page.getByRole('navigation', { name: 'Main' });
  await expect(menu.getByRole('link', { name: 'Deals' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Leads' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Admin' })).toHaveCount(0);
  await expect(menu.getByRole('link', { name: 'Campaigns' })).toHaveCount(0);
});

test('CRM-16 logged-out visitor is sent to the login page', async ({ page }) => {
  await page.goto('/deals');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
