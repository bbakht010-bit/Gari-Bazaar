const path = require("path");
const { test, expect } = require("@playwright/test");

/**
 * Uses storage from tests/auth.dealer.setup.js (chromium-dealer project).
 * Skips individual tests if env was not configured (setup skipped → no auth file — Playwright still runs file;
 * actually when setup skipped dependent project skips — when env set, runs).
 */

test.describe.configure({ mode: "serial" });

test.describe("Tier 2 — dealer dashboard", () => {
  test("dashboard KPIs visible", async ({ page }) => {
    await page.goto("/dealer-dashboard");
    await expect(page.locator("#dealerDashboardTitle")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#kpi-cars")).toBeVisible();
  });

  test("add listing with fixture image then mark sold", async ({ page }) => {
    await page.goto("/dealer-dashboard");
    await expect(page.locator("#dealerDashboardTitle")).toBeVisible({ timeout: 30_000 });

    const toggle = page.locator("#car-form-toggle");
    if (await toggle.isVisible()) {
      await toggle.click();
    }

    const uniqueName = "E2E_" + Date.now() + "_TestCar";
    await page.locator("#car-name").fill(uniqueName);
    await page.locator("#car-price").fill("2750000");
    await page.locator("#car-mileage").fill("45000 km");
    await page.locator("#car-trans").selectOption({ label: "Automatic" });
    await page.locator("#car-condition").selectOption({ label: "Used" });
    await page.locator("#car-city").selectOption({ label: "Islamabad" });
    await page.locator("#car-paint-status").selectOption({ value: "original" });
    await page.locator("#car-cover-index").fill("1");

    const fixturePng = path.join(__dirname, "fixtures", "e2e-car.png");
    await page.locator("#car-images").setInputFiles(fixturePng);

    await page.locator("#car-submit-btn").click();

    const errBox = page.locator("#car-error");
    await expect(errBox).toHaveClass(/success/, { timeout: 120_000 });
    await expect(errBox).toContainText(/added successfully|updated successfully/i);

    const row = page.locator("#car-list .item").filter({ hasText: uniqueName });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator("button[data-sell-car]").click();

    await expect(errBox).toContainText(/marked as sold|Sold/i, { timeout: 60_000 });

    await expect(page.locator("#sold-history-list")).toContainText(uniqueName, { timeout: 30_000 });
  });
});
