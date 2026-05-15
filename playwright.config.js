const path = require("path");
const { defineConfig, devices } = require("@playwright/test");

const baseURL = process.env.BASE_URL || "https://gari-bazaar.web.app";
const hasDealerE2E = Boolean(process.env.E2E_DEALER_EMAIL && process.env.E2E_DEALER_PASSWORD);

/** Specs handled only by dealer projects (never run in anonymous chromium project). */
const dealerOnlySpecs = [/auth\.dealer\.setup\.js$/, /dealer\.e2e\.spec\.js$/];
const nonPlaywrightSpecs = [/tests[\\/](firebase)[\\/].+\.spec\.js$/];

const projects = [
  {
    name: "chromium",
    testIgnore: dealerOnlySpecs.concat(nonPlaywrightSpecs),
    use: { ...devices["Desktop Chrome"] }
  }
];

if (hasDealerE2E) {
  projects.push(
    {
      name: "setup-dealer",
      testMatch: /auth\.dealer\.setup\.js$/,
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "chromium-dealer",
      dependencies: ["setup-dealer"],
      testMatch: /dealer\.e2e\.spec\.js$/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(__dirname, "tests", ".auth", "dealer.json")
      }
    }
  );
}

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: {
    timeout: 15_000
  },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  projects
});
