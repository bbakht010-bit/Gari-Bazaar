/**
 * Writes tests/.auth/dealer.json for Tier 2 dealer E2E.
 * Requires E2E_DEALER_EMAIL and E2E_DEALER_PASSWORD (verified dealer with complete profile).
 */
const fs = require("fs");
const path = require("path");
const { test } = require("@playwright/test");

test.describe.configure({ mode: "serial" });

test("sign in dealer and save storage state", async ({ page }) => {
  test.skip(
    !process.env.E2E_DEALER_EMAIL || !process.env.E2E_DEALER_PASSWORD,
    "Set E2E_DEALER_EMAIL and E2E_DEALER_PASSWORD"
  );

  await page.goto("/dealer-login");
  await page.locator("#email").fill(process.env.E2E_DEALER_EMAIL);
  await page.locator("#password").fill(process.env.E2E_DEALER_PASSWORD);

  await Promise.all([
    page.waitForURL("**/dealer-dashboard**", { timeout: 90_000 }),
    page.locator("form#login-form button[type=submit]").click()
  ]);

  const url = page.url();
  if (!url.includes("dealer-dashboard")) {
    throw new Error(
      "Dealer E2E account must reach dealer-dashboard after login (verified + complete profile). Got URL: " +
        url +
        ". See docs/E2E_DEALER_SETUP.md"
    );
  }

  const outDir = path.join(__dirname, ".auth");
  await fs.promises.mkdir(outDir, { recursive: true });
  await page.context().storageState({ path: path.join(outDir, "dealer.json") });
});
