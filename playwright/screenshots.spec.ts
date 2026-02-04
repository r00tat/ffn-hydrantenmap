import { test } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const screenshotDir = path.join(__dirname, '../public/docs-assets/screenshots');

// Ensure screenshot directory exists
fs.mkdirSync(screenshotDir, { recursive: true });

const pages = [
  { name: 'karte', path: '/', waitFor: '.leaflet-container' },
  { name: 'einsaetze', path: '/einsaetze', waitFor: '.MuiCard-root' },
  { name: 'tagebuch', path: '/tagebuch', waitFor: '.MuiPaper-root' },
  { name: 'fahrzeuge', path: '/fahrzeuge', waitFor: '.MuiPaper-root' },
  { name: 'schadstoff', path: '/schadstoff', waitFor: 'input' },
  { name: 'kostenersatz', path: '/kostenersatz', waitFor: '.MuiPaper-root' },
  { name: 'geschaeftsbuch', path: '/geschaeftsbuch', waitFor: '.MuiPaper-root' },
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
    await page.waitForSelector('[data-provider-id="password"]', {
      timeout: 10000,
    });
    await page.click('[data-provider-id="password"]');

    // Fill in credentials
    await page.waitForSelector('input[name="email"]', { timeout: 5000 });
    await page.fill('input[name="email"]', email);
    await page.click('button[type="submit"]');

    await page.waitForSelector('input[name="password"]', { timeout: 5000 });
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    // Wait for login to complete - look for "Weiter zur Einsatzkarte" button or welcome text
    await page.waitForSelector('text=Willkommen', { timeout: 20000 });

    // Wait a bit for authorization check to complete
    await page.waitForTimeout(3000);
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

  // Quickstart screenshots
  test('capture quickstart-firecall-button', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.leaflet-container', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Capture the header area with the firecall button
    const toolbar = page.locator('.MuiToolbar-root');
    await toolbar.screenshot({
      path: path.join(screenshotDir, 'quickstart-firecall-button.png'),
    });
  });

  test('capture quickstart-firecall-dialog', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.leaflet-container', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Click the firecall button (fire icon)
    await page.click('button:has(svg[data-testid="LocalFireDepartmentTwoToneIcon"])');
    await page.waitForSelector('.MuiDialog-root', { timeout: 5000 });
    await page.waitForTimeout(500);

    // Capture the dialog
    const dialog = page.locator('.MuiDialog-paper');
    await dialog.screenshot({
      path: path.join(screenshotDir, 'quickstart-firecall-dialog.png'),
    });

    // Close dialog
    await page.keyboard.press('Escape');
  });

  test('capture quickstart-edit-mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.leaflet-container', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Capture full page showing the "Bearbeiten aktivieren" button in sidebar
    await page.screenshot({
      path: path.join(screenshotDir, 'quickstart-edit-mode.png'),
      fullPage: false,
    });
  });

  test('capture quickstart-add-vehicle', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.leaflet-container', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Enable edit mode
    await page.click('button:has-text("Bearbeiten aktivieren")');
    await page.waitForTimeout(500);

    // Click on "Fahrzeug" element icon to open the dialog
    await page.click('button:has-text("Fahrzeug")');
    await page.waitForSelector('.MuiDialog-root', { timeout: 5000 });
    await page.waitForTimeout(500);

    // Capture the dialog
    const dialog = page.locator('.MuiDialog-paper');
    await dialog.screenshot({
      path: path.join(screenshotDir, 'quickstart-add-vehicle.png'),
    });

    // Close dialog
    await page.keyboard.press('Escape');
  });

  test('capture quickstart-diary-entry', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.leaflet-container', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Enable edit mode to show sidebar content
    await page.click('button:has-text("Bearbeiten aktivieren")');
    await page.waitForTimeout(500);

    // Expand the Tagebuch accordion in the sidebar if not already expanded
    const tagebuchAccordion = page.locator('.MuiAccordion-root:has-text("Tagebuch")').first();
    const isExpanded = await tagebuchAccordion.getAttribute('class');
    if (!isExpanded?.includes('Mui-expanded')) {
      await tagebuchAccordion.locator('.MuiAccordionSummary-root').click();
      await page.waitForTimeout(300);
    }

    // Capture the sidebar showing the diary section
    const sidebar = page.locator('.MuiPaper-root').last();
    await sidebar.screenshot({
      path: path.join(screenshotDir, 'quickstart-diary-entry.png'),
    });
  });

  // Kostenersatz detailed screenshots
  test('capture kostenersatz-berechnung', async ({ page }) => {
    // First activate a firecall from the einsaetze page
    await page.goto('/einsaetze');
    await page.waitForSelector('.MuiCard-root', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Click "Aktivieren" on the first firecall card
    const activateButton = page.locator('.MuiCard-root button:has-text("Aktivieren")').first();
    await activateButton.click();
    await page.waitForURL(/\/einsatz\//, { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Get the firecall ID from the URL
    const url = page.url();
    const firecallId = url.split('/einsatz/')[1]?.split(/[?/]/)[0];

    if (firecallId) {
      // Navigate to new kostenersatz calculation
      await page.goto(`/einsatz/${firecallId}/kostenersatz/neu`);
      await page.waitForSelector('[role="tabpanel"]', { timeout: 10000 });
      await page.waitForTimeout(1000);

      // Click on "Berechnung" tab
      await page.click('[role="tab"]:has-text("Berechnung")');
      await page.waitForTimeout(500);

      // Take screenshot of the calculation tab
      await page.screenshot({
        path: path.join(screenshotDir, 'kostenersatz-berechnung.png'),
        fullPage: false,
      });
    }
  });

});
