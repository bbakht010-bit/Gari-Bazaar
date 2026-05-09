/**
 * Regression guard: block the anti-pattern where "create account" on a login page
 * requires filling the sign-in fields first (bad UX; caused user-facing errors).
 */
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd());
const forbidden = "Enter email and password first";
const skipDirs = new Set(["node_modules", ".git", ".firebase", "playwright-report", "test-results"]);

function walk(dirPath, files) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walk(full, files);
      continue;
    }
    if (entry.name.endsWith(".html")) files.push(full);
  }
}

const htmlFiles = [];
walk(repoRoot, htmlFiles);

const hits = [];
for (const file of htmlFiles) {
  const rel = path.relative(repoRoot, file).replace(/\\/g, "/");
  const text = fs.readFileSync(file, "utf8");
  if (text.includes(forbidden)) {
    hits.push(rel);
  }
}

if (hits.length) {
  console.error("Login/signup UX guard failed. Remove this user-hostile copy from HTML:\n");
  console.error('  Forbidden substring: "' + forbidden + '"\n');
  for (const h of hits) console.error("  - " + h);
  console.error("\nUse an expandable signup section (email + password + confirm) like dealer-login / buyer-login.");
  process.exit(1);
}

console.log("Login/signup UX guard passed.");
