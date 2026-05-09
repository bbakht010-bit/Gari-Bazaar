const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const REGION = "asia-south1";
/** Must match your Firestore database location (default DB is often US multi-region → use us-central1 for Gen1 triggers). */
const FIRESTORE_TRIGGER_REGION = "us-central1";

/**
 * Keeps Firebase Auth custom claim `admin` in sync with Firestore `users/{uid}.role`.
 * Grant admin only by editing that document in Firebase Console (or Admin SDK) — never from client apps.
 */
exports.syncUserAdminClaim = functions.region(FIRESTORE_TRIGGER_REGION).firestore.document("users/{uid}").onWrite(async (change, context) => {
  const uid = context.params.uid;
  try {
    const after = change.after.exists ? change.after.data() : null;
    if (after && after.role === "admin") {
      await admin.auth().setCustomUserClaims(uid, { admin: true });
    } else {
      await admin.auth().setCustomUserClaims(uid, { admin: false });
    }
  } catch (err) {
    console.error("syncUserAdminClaim failed", uid, err && err.message ? err.message : err);
  }
});

/**
 * Trusted mark-sold: only this function may append dealerPrivate.soldHistory and increment dealerProfiles.carsSold.
 * Call from the dealer dashboard with the signed-in dealer's ID token.
 */
exports.markListingSold = functions.region(REGION).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
  }
  const uid = context.auth.uid;
  const listingId = data && typeof data.listingId === "string" ? data.listingId.trim() : "";
  if (!listingId) {
    throw new functions.https.HttpsError("invalid-argument", "listingId is required.");
  }

  const userSnap = await db.doc(`users/${uid}`).get();
  const ud = userSnap.exists ? userSnap.data() : {};
  const canDealer =
    ud.role === "dealer" || ud.dealer === true;
  if (!userSnap.exists || !canDealer) {
    throw new functions.https.HttpsError("permission-denied", "Dealer accounts only.");
  }

  const profileSnap = await db.doc(`dealerProfiles/${uid}`).get();
  if (!profileSnap.exists) {
    throw new functions.https.HttpsError("failed-precondition", "Dealer profile not found.");
  }
  const profile = profileSnap.data();
  const status = String(profile.verificationStatus || "").toLowerCase();
  if (status !== "verified" && status !== "approved") {
    throw new functions.https.HttpsError("permission-denied", "Dealership is not approved.");
  }
  if (profile.suspended) {
    throw new functions.https.HttpsError("permission-denied", "Dealership is suspended.");
  }

  await db.runTransaction(async (tx) => {
    const listingRef = db.doc(`listings/${listingId}`);
    const listingSnap = await tx.get(listingRef);
    if (!listingSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Listing not found.");
    }
    const listing = listingSnap.data();
    if (listing.dealerId !== uid) {
      throw new functions.https.HttpsError("permission-denied", "Not your listing.");
    }
    const mod = String(listing.moderationStatus || "live").toLowerCase();
    if (mod === "removed") {
      throw new functions.https.HttpsError("failed-precondition", "Listing is removed.");
    }

    const privRef = db.doc(`dealerPrivate/${uid}`);
    const pubRef = db.doc(`dealerProfiles/${uid}`);
    const privSnap = await tx.get(privRef);
    const existingHistory =
      privSnap.exists && Array.isArray(privSnap.data().soldHistory) ? privSnap.data().soldHistory : [];
    if (existingHistory.length >= 600) {
      throw new functions.https.HttpsError("resource-exhausted", "Sold history limit reached (600).");
    }
    const soldEntry = {
      listingId,
      name: String(listing.carName || listing.name || ""),
      price: String(listing.priceLakh || listing.price || ""),
      mileage: String(listing.mileage || ""),
      transmission: String(listing.transmission || ""),
      condition: String(listing.condition || ""),
      city: String(listing.city || ""),
      soldAt: new Date().toISOString()
    };

    const nextHistory = existingHistory.concat([soldEntry]);

    tx.set(
      privRef,
      { soldHistory: nextHistory, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    tx.update(pubRef, {
      carsSold: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    tx.delete(listingRef);
  });

  return { ok: true };
});
