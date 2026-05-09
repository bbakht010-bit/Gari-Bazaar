#!/usr/bin/env node
/**
 * Deletes ALL Firebase Authentication users for the default project in .firebaserc.
 * Optionally wipes main Firestore collections used by Gari Bazaar (dev reset).
 *
 * Setup (one-time):
 *   Firebase Console → Project settings → Service accounts → Generate new private key
 *   Save the JSON somewhere OUTSIDE the repo (or use a path that is gitignored).
 *
 * Windows PowerShell:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\your-service-account.json"
 *
 * Then run (must match project id in .firebaserc — currently read automatically):
 *   node scripts/wipe-dev-auth.mjs --confirm YOUR_PROJECT_ID
 *   node scripts/wipe-dev-auth.mjs --confirm YOUR_PROJECT_ID --also-firestore
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function readFirebaseProjectId() {
  try {
    const rc = JSON.parse(readFileSync(join(root, ".firebaserc"), "utf8"));
    return rc.projects?.default ?? null;
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const out = { confirm: null, alsoFirestore: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--confirm" && argv[i + 1]) {
      out.confirm = argv[++i];
    } else if (argv[i] === "--also-firestore") {
      out.alsoFirestore = true;
    }
  }
  return out;
}

async function wipeAuth(auth) {
  let deleted = 0;
  let nextPageToken;
  do {
    const listResult = await auth.listUsers(1000, nextPageToken);
    const uids = listResult.users.map((u) => u.uid);
    if (uids.length > 0) {
      const delResult = await auth.deleteUsers(uids);
      deleted += uids.length - delResult.failureCount;
      if (delResult.failureCount > 0) {
        console.error("Some Auth deletes failed:", delResult.errors);
      }
    }
    nextPageToken = listResult.pageToken;
  } while (nextPageToken);
  return deleted;
}

async function wipeFirestore(db) {
  const collections = [
    "users",
    "buyerProfiles",
    "dealerProfiles",
    "dealerPrivate",
    "listings",
    "dealerChangeRequests",
  ];
  for (const name of collections) {
    const ref = db.collection(name);
    await db.recursiveDelete(ref);
    console.log(`Wiped Firestore collection: ${name}`);
  }
}

async function main() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      "Set GOOGLE_APPLICATION_CREDENTIALS to the path of your Firebase service account JSON file."
    );
    process.exit(1);
  }

  const projectId = readFirebaseProjectId();
  const { confirm, alsoFirestore } = parseArgs(process.argv);

  if (!projectId) {
    console.error("Could not read default project id from .firebaserc");
    process.exit(1);
  }
  if (confirm !== projectId) {
    console.error(
      `Refusing to run: pass --confirm ${projectId} to confirm this Firebase project.`
    );
    process.exit(1);
  }

  const { initializeApp, applicationDefault } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");

  initializeApp({
    credential: applicationDefault(),
    projectId,
  });

  const auth = getAuth();
  const n = await wipeAuth(auth);
  console.log(`Deleted ${n} Auth user(s).`);

  if (alsoFirestore) {
    const { getFirestore } = await import("firebase-admin/firestore");
    const db = getFirestore();
    await wipeFirestore(db);
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
