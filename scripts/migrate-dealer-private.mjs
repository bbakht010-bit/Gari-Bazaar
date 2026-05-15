/**
 * One-time migration (Admin SDK — bypasses security rules):
 * - For each dealerProfiles doc that still has private/operational fields on the PUBLIC document,
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

function clean(value) {
  return String(value || "").trim();
}

function normalizePlan(value) {
  const raw = clean(value).toLowerCase();
  if (raw === "growth") return "growth";
  if (raw === "pro" || raw === "professional") return "pro";
  return "free";
}

function parseStoragePathFromDownloadUrl(url) {
  const rawUrl = clean(url);
  if (!rawUrl) return "";
  try {
    const parsed = new URL(rawUrl);
    const parts = parsed.pathname.split("/o/");
    if (parts.length < 2) return "";
    return decodeURIComponent(parts[1]);
  } catch (_error) {
    return "";
  }
}

async function main() {
  const snap = await db.collection("dealerProfiles").get();
  let migrated = 0;
  for (const docSnap of snap.docs) {
    const uid = docSnap.id;
    const data = docSnap.data() || {};
    const cnic = data.ownerCnic;
    const hist = data.soldHistory;
    const regUrl = data.registrationDocumentUrl;
    const employees = Array.isArray(data.employees) ? data.employees : [];
    const planPreference = data.planPreference || data.plan;
    const paymentStatus = data.paymentStatus;
    const hasCnic = cnic !== undefined && cnic !== null && String(cnic).trim() !== "";
    const hasHist = Array.isArray(hist) && hist.length > 0;
    const hasRegUrl = regUrl !== undefined && regUrl !== null && clean(regUrl) !== "";
    const hasEmployees = employees.length > 0;
    const hasPlanPreference = clean(planPreference) !== "";
    const hasPaymentStatus = clean(paymentStatus) !== "";
    if (!hasCnic && !hasHist && !hasRegUrl && !hasEmployees && !hasPlanPreference && !hasPaymentStatus) continue;

    const privRef = db.doc(`dealerPrivate/${uid}`);
    const pubRef = docSnap.ref;

    if (dryRun) {
      console.log("[dry-run] Would migrate", uid, {
        hasCnic,
        soldCount: hasHist ? hist.length : 0,
        hasVerificationDocument: hasRegUrl,
        employeesCount: employees.length,
        hasPlanPreference,
        hasPaymentStatus
      });
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
      if (hasRegUrl) {
        nextPriv.verificationDocument = {
          storagePath: parseStoragePathFromDownloadUrl(regUrl),
          fileName: clean(parseStoragePathFromDownloadUrl(regUrl).split("/").pop() || ""),
          legacyDownloadUrl: clean(regUrl),
          migratedFromPublicUrl: true
        };
      }
      if (hasEmployees && !Array.isArray(existing.employees)) {
        nextPriv.employees = employees;
      }
      if (hasPlanPreference && !clean(existing.planPreference)) {
        nextPriv.planPreference = normalizePlan(planPreference);
      }
      if (!clean(existing.plan)) {
        nextPriv.plan = "free";
      }
      if (hasPaymentStatus && !clean(existing.paymentStatus)) {
        nextPriv.paymentStatus = clean(paymentStatus);
      }
      tx.set(privRef, nextPriv, { merge: true });
      const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      if (hasCnic) updates.ownerCnic = admin.firestore.FieldValue.delete();
      if (hasHist) updates.soldHistory = admin.firestore.FieldValue.delete();
      if (hasRegUrl) updates.registrationDocumentUrl = admin.firestore.FieldValue.delete();
      if (hasEmployees) updates.employees = admin.firestore.FieldValue.delete();
      if (hasPlanPreference) {
        updates.plan = admin.firestore.FieldValue.delete();
        updates.planPreference = admin.firestore.FieldValue.delete();
      }
      if (hasPaymentStatus) updates.paymentStatus = admin.firestore.FieldValue.delete();
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
