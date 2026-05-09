/**
 * Collect console errors while a test runs; call the returned assertion after navigation settles.
 */
function attachConsoleCollector(page, options) {
  const allowSubstrings = (options && options.allowSubstrings) || [];
  const messages = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") messages.push("[console.error] " + msg.text());
  });
  page.on("pageerror", (err) => {
    messages.push("[pageerror] " + String(err && err.message ? err.message : err));
  });

  return async function assertNoUnhandledConsoleErrors() {
    const banned = messages.filter((line) =>
      allowSubstrings.every((substr) => !line.includes(substr))
    );
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(800);
    if (banned.length) {
      throw new Error(`Unexpected browser errors (${banned.length}):\n` + banned.join("\n"));
    }
  };
}

module.exports = { attachConsoleCollector };
