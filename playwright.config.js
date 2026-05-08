const { defineConfig, devices } = require("@playwright/test");

// Default to production URL; CI can override with BASE_URL.
const baseURL = process.env.BASE_URL || "https://gari-bazaar.web.app";

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 8_000
  },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
