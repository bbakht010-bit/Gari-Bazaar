import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd());
// Keep scanning lightweight and focused on app source files.
const allowedExtensions = new Set([".html", ".js", ".mjs"]);
const skipDirs = new Set(["node_modules", ".git", ".firebase"]);

const forbiddenDetailKeys = [
  "car",
  "price",
  "mileage",
  "transmission",
  "condition",
  "modelYear",
  "fuelType",
  "engine",
  "color",
  "registrationCity",
  "bodyType",
  "assembly",
  "paintStatus",
  "bodyNote",
  "panelMarks",
  "city",
  "dealer",
  "contactName",
  "contactRole",
  "phone",
  "coverImage"
];

const forbiddenDealerKeys = [
  "dealer",
  "city",
  "contactName",
  "contactRole",
  "phone"
];

const issues = [];

// Exit non-zero in CI/deploy if unsafe query payloads are reintroduced.
walk(repoRoot);

if (issues.length) {
  console.error("Stable URL guard failed. Found unsafe query param usage:\n");
  for (const issue of issues) {
    console.error(`- ${issue.file}`);
    console.error(`  Link type: ${issue.linkType}`);
    console.error(`  Forbidden keys: ${issue.keys.join(", ")}`);
    console.error(`  Snippet: ${issue.snippet}`);
  }
  process.exit(1);
}

console.log("Stable URL guard passed.");

function walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walk(path.join(dirPath, entry.name));
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!allowedExtensions.has(ext)) continue;
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(repoRoot, fullPath).replace(/\\/g, "/");
    const content = fs.readFileSync(fullPath, "utf8");
    checkUrlSearchParamBlocks(relPath, content);
  }
}

function checkUrlSearchParamBlocks(relPath, content) {
  // Parse URLSearchParams object literals where link query params are usually built.
  const blockRegex = /new\s+URLSearchParams\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    const block = match[1];
    // Use nearby code to infer whether this params object targets detail/dealer links.
    const near = content.slice(Math.max(0, match.index - 1400), Math.min(content.length, blockRegex.lastIndex + 1400));
    const linkType = detectLinkType(near);
    if (!linkType) continue;

    const forbiddenKeys = linkType === "car-detail"
      ? forbiddenDetailKeys
      : forbiddenDealerKeys;

    const foundKeys = forbiddenKeys.filter((key) => {
      const keyRegex = new RegExp(`\\b${escapeRegExp(key)}\\s*:`);
      return keyRegex.test(block);
    });

    if (!foundKeys.length) continue;

    issues.push({
      file: relPath,
      linkType,
      keys: foundKeys,
      snippet: compact(block).slice(0, 180)
    });
  }
}

function detectLinkType(text) {
  if (/car-detail\.html\?/.test(text)) return "car-detail";
  if (/dealer-profile\.html\?/.test(text)) return "dealer-profile";
  return "";
}

function compact(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
