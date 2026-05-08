const { test, expect } = require("@playwright/test");

test("homepage loads and links to listings", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("text=GariBazaar").first()).toBeVisible();

  const browseCars = page.locator('a[href*="listings"]');
  await expect(browseCars.first()).toBeVisible();
});

test("listings page has cards and stable detail URL", async ({ page }) => {
  await page.goto("/listings");
  const detailLink = page.locator('a.detail-btn[href*="car-detail"]').first();
  await expect(detailLink).toBeVisible();

  const href = await detailLink.getAttribute("href");
  expect(href).toBeTruthy();
  // Guard the stable URL contract: IDs only, no bulky mutable payload.
  expect(href).toContain("listingId=");
  expect(href).not.toContain("panelMarks=");
  expect(href).not.toContain("contactName=");
  expect(href).not.toContain("phone=");
});
