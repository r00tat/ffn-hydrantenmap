import { test } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const screenshotDir = path.join(__dirname, '../public/docs/screenshots');

// Ensure screenshot directory exists
fs.mkdirSync(screenshotDir, { recursive: true });

const pages = [
  { name: 'karte', path: '/', waitFor: '.leaflet-container' },
  { name: 'einsaetze', path: '/einsaetze', waitFor: 'main' },
  { name: 'tagebuch', path: '/tagebuch', waitFor: 'main' },
  { name: 'fahrzeuge', path: '/fahrzeuge', waitFor: 'main' },
  { name: 'schadstoff', path: '/schadstoff', waitFor: 'main' },
  { name: 'kostenersatz', path: '/kostenersatz', waitFor: 'main' },
  { name: 'geschaeftsbuch', path: '/geschaeftsbuch', waitFor: 'main' },
];

test.describe('Documentation Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    // Login with test credentials
    const email = process.env.DOCS_TEST_EMAIL;
    const password = process.env.DOCS_TEST_PASSWORD;

    if (!email || !password) {
      throw new Error(
        'DOCS_TEST_EMAIL and DOCS_TEST_PASSWORD must be set in environment'
      );
    }

    await page.goto('/login');

    // Wait for Firebase UI to load and click email sign-in
    await page.waitForSelector('[data-provider-id="password"]', { timeout: 10000 });
    await page.click('[data-provider-id="password"]');

    // Fill in credentials
    await page.waitForSelector('input[name="email"]', { timeout: 5000 });
    await page.fill('input[name="email"]', email);
    await page.click('button[type="submit"]');

    await page.waitForSelector('input[name="password"]', { timeout: 5000 });
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    // Wait for redirect after login
    await page.waitForURL('/', { timeout: 15000 });

    // Wait a bit for the app to fully load
    await page.waitForTimeout(2000);
  });

  for (const { name, path: pagePath, waitFor } of pages) {
    test(`capture ${name}`, async ({ page }) => {
      await page.goto(pagePath);
      await page.waitForSelector(waitFor, { timeout: 10000 });

      // Extra wait for dynamic content
      await page.waitForTimeout(1500);

      await page.screenshot({
        path: path.join(screenshotDir, `${name}.png`),
        fullPage: false,
      });
    });
  }
});
