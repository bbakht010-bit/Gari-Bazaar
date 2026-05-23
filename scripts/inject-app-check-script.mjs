/**
 * Ensures every app HTML page loads app-check-config.js before Firebase modules.
 */
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd());
const marker = '<script src="app-check-config.js"></script>';
const skipDirs = new Set(["node_modules", ".git", ".firebase", "playwright-report", "test-results", "functions"]);

function walk(dirPath, files) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walk(full, files);
    } else if (entry.name.endsWith(".html")) {
      files.push(full);
    }
  }
}

function usesFirebaseClient(text) {
  return text.includes("firebase-client.js");
}

function inject(content) {
  if (content.includes(marker)) return content;

  const moduleNeedle = /<script\s+type="module"[^>]*>[\s\S]*?firebase-client\.js/;
  const match = content.match(moduleNeedle);
  if (match && typeof match.index === "number") {
    return content.slice(0, match.index) + marker + "\n" + content.slice(match.index);
  }

  if (usesFirebaseClient(content)) {
    const bodyIdx = content.indexOf("<body");
    if (bodyIdx === -1) return content;
    const close = content.indexOf(">", bodyIdx);
    if (close === -1) return content;
    return content.slice(0, close + 1) + "\n" + marker + content.slice(close + 1);
  }

  return content;
}

const htmlFiles = [];
walk(repoRoot, htmlFiles);

let updated = 0;
for (const file of htmlFiles) {
  const rel = path.relative(repoRoot, file).replace(/\\/g, "/");
  if (rel.startsWith("node_modules/")) continue;
  const text = fs.readFileSync(file, "utf8");
  if (!usesFirebaseClient(text)) continue;
  const next = inject(text);
  if (next !== text) {
    fs.writeFileSync(file, next, "utf8");
    updated += 1;
  }
}

console.log(`App Check script injection: ${updated} HTML file(s) updated.`);
