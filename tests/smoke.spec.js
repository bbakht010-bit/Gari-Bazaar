const { test, expect } = require("@playwright/test");
const { attachConsoleCollector } = require("./helpers/console");

/** Pages that should load for anonymous users without redirect loops. */
const PUBLIC_ROUTES = [
  "/",
  "/listings",
  "/dealers",
  "/about",
  "/contact",
  "/terms",
  "/privacy",
  "/buyer-login",
  "/buyer-signup",
  "/dealer-login",
  "/dealer-onboarding"
];

test.describe("Tier 1 — public routes", () => {
  for (const path of PUBLIC_ROUTES) {
    test(`HTTP 200 and no console errors: ${path}`, async ({ page }) => {
      const assertClean = attachConsoleCollector(page);
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(res && res.ok(), `expected 2xx for ${path}, got ${res ? res.status() : "no response"}`).toBeTruthy();
      await expect(page.locator("body")).toBeVisible();
      await assertClean();
    });
  }
});

test("homepage loads and links to listings", async ({ page }) => {
  const assertClean = attachConsoleCollector(page);
  await page.goto("/");
  await expect(page.locator("text=GariBazaar").first()).toBeVisible();
  const browseCars = page.locator('a[href*="listings"]:visible').first();
  await expect(browseCars).toBeVisible();
  await assertClean();
});

test("listings: Firestore-driven grid or empty note, and stable detail URL", async ({ page }) => {
  const assertClean = attachConsoleCollector(page);
  await page.goto("/listings");

  const detailLink = page.locator("a.detail-btn[href*='car-detail']").first();
  const emptyNote = page.locator("#results, main").getByText(/No live approved listings/i);

  await expect(detailLink.or(emptyNote).first()).toBeVisible({ timeout: 20_000 });

  if (await detailLink.isVisible().catch(() => false)) {
    const href = await detailLink.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toContain("listingId=");
    expect(href).not.toContain("panelMarks=");
    expect(href).not.toContain("contactName=");
    expect(href).not.toContain("phone=");
  }

  await assertClean();
});

test("dealers: cards or empty state, profile links use dealerId only", async ({ page }) => {
  const assertClean = attachConsoleCollector(page);
  await page.goto("/dealers");

  const card = page.locator(".dealer-card").first();
  const empty = page.locator("#dealerEmptyState.show");

  await expect(card.or(empty).first()).toBeVisible({ timeout: 20_000 });

  if (await card.isVisible().catch(() => false)) {
    const profileLink = page.locator("a.card-btn[href*='dealer-profile']").first();
    await expect(profileLink).toBeVisible();
    const href = await profileLink.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toContain("dealerId=");
    expect(href).not.toContain("phone=");
    expect(href).not.toContain("contactName=");
  }

  await assertClean();
});
