/**
 * One-time migration (Admin SDK — bypasses security rules):
 * - For each dealerProfiles doc that still has ownerCnic or soldHistory on the PUBLIC document,
 *   copy those fields into dealerPrivate/{uid}, then remove them from dealerProfiles.
 *
 * Setup (you must run locally):
 *   1. Firebase Console → Project settings → Service accounts → Generate new private key → save JSON.
 *   2. PowerShell:
 *        $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\serviceAccount.json"
 *        cd scripts
 *        npm install
 *        node migrate-dealer-private.mjs
 *
 * Dry run (no writes): set env DRY_RUN=1
 */

import admin from "firebase-admin";

const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.");
  process.exit(1);
}

admin.initializeApp();
const db = admin.firestore();

async function main() {
  const snap = await db.collection("dealerProfiles").get();
  let migrated = 0;
  for (const docSnap of snap.docs) {
    const uid = docSnap.id;
    const data = docSnap.data() || {};
    const cnic = data.ownerCnic;
    const hist = data.soldHistory;
    const hasCnic = cnic !== undefined && cnic !== null && String(cnic).trim() !== "";
    const hasHist = Array.isArray(hist) && hist.length > 0;
    if (!hasCnic && !hasHist) continue;

    const privRef = db.doc(`dealerPrivate/${uid}`);
    const pubRef = docSnap.ref;

    if (dryRun) {
      console.log("[dry-run] Would migrate", uid, { hasCnic, soldCount: hasHist ? hist.length : 0 });
      migrated++;
      continue;
    }

    await db.runTransaction(async (tx) => {
      const pSnap = await tx.get(privRef);
      const existing = pSnap.exists ? pSnap.data() || {} : {};
      const nextPriv = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      if (hasCnic) nextPriv.ownerCnic = String(cnic).trim();
      if (hasHist) {
        const mergedHist = Array.isArray(existing.soldHistory)
          ? existing.soldHistory.concat(hist)
          : hist;
        nextPriv.soldHistory = mergedHist;
      }
      tx.set(privRef, nextPriv, { merge: true });
      const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      if (hasCnic) updates.ownerCnic = admin.firestore.FieldValue.delete();
      if (hasHist) updates.soldHistory = admin.firestore.FieldValue.delete();
      tx.update(pubRef, updates);
    });
    console.log("Migrated", uid);
    migrated++;
  }
  console.log(doneMsg(migrated));
}

function doneMsg(n) {
  return dryRun ? `Dry run complete — ${n} documents would be updated.` : `Done — migrated ${n} dealer profile(s).`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
