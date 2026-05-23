/**
 * Predeploy guard: warns when App Check site key is missing before full enforcement rollout.
 */
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd());
const configPath = path.join(repoRoot, "app-check-config.js");
const enforcePath = path.join(repoRoot, "functions", ".app-check-enforce");
const strict = process.argv.includes("--strict");

if (!fs.existsSync(configPath)) {
  console.error("Missing app-check-config.js — run: npm run generate:app-check-config");
  process.exit(strict ? 1 : 0);
}

const text = fs.readFileSync(configPath, "utf8");
const siteMatch = text.match(/GARI_BAZAAR_APP_CHECK_SITE_KEY\s*=\s*"([^"]*)"/);
const siteKey = siteMatch ? siteMatch[1].trim() : "";
const hasKey = siteKey.length > 20;

if (!hasKey) {
  const msg =
    "App Check site key is not configured. Dealer callable Functions will deploy WITHOUT App Check enforcement.\n" +
    "Add your reCAPTCHA v3 site key to app-check-config.js (see app-check-config.example.js), then redeploy.\n" +
    "After tokens work in the browser, enable enforcement in Firebase Console → App Check for Firestore, Storage, and Functions.";
  if (strict) {
    console.error(msg);
    process.exit(1);
  }
  console.warn(msg);
} else {
  console.log("App Check site key present.");
}

if (fs.existsSync(enforcePath)) {
  const flag = fs.readFileSync(enforcePath, "utf8").trim();
  console.log(flag === "1" ? "Functions deploy: enforceAppCheck ON" : "Functions deploy: enforceAppCheck OFF");
}
