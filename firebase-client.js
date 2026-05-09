import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/** Must match Firebase Console → Project settings → Your apps → SDK snippet (`firebase apps:sdkconfig WEB`). */
const firebaseConfig = {
  apiKey: "AIzaSyAs5VDo5lrmJUWONSN6gyYi856P0QXzndE",
  authDomain: "gari-bazaar.firebaseapp.com",
  projectId: "gari-bazaar",
  storageBucket: "gari-bazaar.firebasestorage.app",
  messagingSenderId: "296364565325",
  appId: "1:296364565325:web:59a017564b7dd55c9d0d04",
  measurementId: "G-7LT0S01NPP"
};

/** Paste your reCAPTCHA v3 site key after: Firebase Console → App Check → Apps → Web app → Register reCAPTCHA. */
const APP_CHECK_RECAPTCHA_SITE_KEY = "";

const app = initializeApp(firebaseConfig);

if (typeof APP_CHECK_RECAPTCHA_SITE_KEY === "string" && APP_CHECK_RECAPTCHA_SITE_KEY.length > 20) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(APP_CHECK_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });
}

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export const FIREBASE_FUNCTIONS_REGION = "asia-south1";

function trim(value) {
  return String(value || "").trim();
}

function normalizeUserRole(role) {
  const cleanRole = trim(role).toLowerCase();
  return cleanRole === "dealer" ? "dealer" : "buyer";
}

export { app, auth, db, storage };

/**
 * Dealer profile photo → Storage (public read). Falls back to caller if Storage is disabled.
 */
export async function uploadDealerProfileImage(uid, file) {
  if (!uid || !file) return "";
  const safeName = String(file.name || "profile.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = "dealers/" + uid + "/profile/" + Date.now() + "_" + safeName;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || "image/jpeg" });
  return await getDownloadURL(storageRef);
}

/** Matches `storage.rules` max object sizes (see `dealers/{id}/verification/*`). */
export const DEALER_VERIFICATION_MAX_BYTES = 12 * 1024 * 1024;
/** Matches `storage.rules` (dealership gallery). */
export const DEALER_GALLERY_MAX_BYTES = 8 * 1024 * 1024;

/** Matches `storage.rules` max object size for listing images. */
const LISTING_CAR_IMAGE_MAX_BYTES = 12 * 1024 * 1024;

function safeStorageObjectName(originalName, fallback) {
  return String(originalName || fallback).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function inferredImageContentType(file) {
  const t = String(file.type || "").trim();
  if (t.startsWith("image/")) return t;
  const n = String(file.name || "").toLowerCase();
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".heic")) return "image/heic";
  if (n.endsWith(".heif")) return "image/heif";
  return "";
}

function inferredVerificationContentType(file, safeNameLower) {
  const t = String(file.type || "").trim();
  if (t === "application/pdf") return "application/pdf";
  if (t.startsWith("image/")) return t;
  const n = safeNameLower || String(file.name || "").toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (/\.(jpe?g|png|webp)$/i.test(n)) {
    if (n.endsWith(".png")) return "image/png";
    if (n.endsWith(".webp")) return "image/webp";
    return "image/jpeg";
  }
  return t || "";
}

/**
 * Govt registration etc. → `dealers/{uid}/verification/…`. Rules: PDF or image, max 12MB.
 */
export async function uploadDealerVerificationDoc(uid, file) {
  if (!uid || !file) return "";
  const size = Number(file.size || 0);
  if (size > DEALER_VERIFICATION_MAX_BYTES) {
    throw new Error(
      'Verification document "' +
        (file.name || "file") +
        '" exceeds ' +
        (DEALER_VERIFICATION_MAX_BYTES / (1024 * 1024)) +
        "MB (Storage rule limit)."
    );
  }
  const safeBase = safeStorageObjectName(file.name, "registration.pdf");
  const lower = safeBase.toLowerCase();
  const mime = inferredVerificationContentType(file, lower);
  const looksPdf =
    mime === "application/pdf" ||
    mime.startsWith("image/") ||
    lower.endsWith(".pdf") ||
    /\.(jpe?g|png|webp)$/i.test(lower);
  if (!looksPdf) {
    throw new Error("Verification document must be a PDF or image (JPG, PNG, WebP).");
  }
  const path = "dealers/" + uid + "/verification/" + Date.now() + "_" + safeBase;
  const storageRef = ref(storage, path);
  const contentType = mime || (lower.endsWith(".pdf") ? "application/pdf" : "image/jpeg");
  await uploadBytes(storageRef, file, { contentType });
  return await getDownloadURL(storageRef);
}

/**
 * Dealership photos on registration → `dealers/{uid}/gallery/…`. Rules: images, max 8MB.
 */
export async function uploadDealerGallery(uid, files) {
  if (!uid) return [];
  const list = Array.from(files || []);
  const urls = [];
  for (const file of list) {
    const size = Number(file.size || 0);
    if (size > DEALER_GALLERY_MAX_BYTES) {
      const sizeMb = (size / (1024 * 1024)).toFixed(1);
      throw new Error(
        'Dealership photo "' + (file.name || "image") + '" is ' + sizeMb + "MB. Max is 8MB."
      );
    }
    const mime = inferredImageContentType(file);
    const safeBase = safeStorageObjectName(file.name, "photo.jpg");
    const lower = safeBase.toLowerCase();
    const allowedExt = /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(lower);
    if (!mime.startsWith("image/") && !allowedExt) {
      throw new Error(
        'Dealership photo "' + (file.name || "") + "\" must be an image (JPG, PNG, WebP, HEIC, etc.)."
      );
    }
    const path = "dealers/" + uid + "/gallery/" + Date.now() + "_" + safeBase;
    const fileRef = ref(storage, path);
    let ct = mime;
    if (!ct) {
      if (lower.endsWith(".png")) ct = "image/png";
      else if (lower.endsWith(".webp")) ct = "image/webp";
      else if (lower.endsWith(".gif")) ct = "image/gif";
      else if (lower.endsWith(".heic")) ct = "image/heic";
      else if (lower.endsWith(".heif")) ct = "image/heif";
      else ct = "image/jpeg";
    }
    await uploadBytes(fileRef, file, { contentType: ct });
    urls.push(await getDownloadURL(fileRef));
  }
  return urls;
}

/**
 * Car listing photos → `listings/{dealerUid}/{listingId}/…` in the default bucket (Firebase Storage / GCS).
 * Download URLs are stored in Firestore `carImages` / `coverImage` for buyers to load.
 */
export async function uploadListingCarImages(dealerUid, listingId, fileList) {
  if (!dealerUid || !listingId) return [];
  const files = Array.from(fileList || []);
  const results = [];
  for (const file of files) {
    if (!String(file.type || "").startsWith("image/")) {
      throw new Error("Only image files are allowed for car photos.");
    }
    if (Number(file.size || 0) > LISTING_CAR_IMAGE_MAX_BYTES) {
      const sizeMb = (Number(file.size || 0) / (1024 * 1024)).toFixed(1);
      throw new Error('Image "' + (file.name || "file") + '" is ' + sizeMb + "MB. Max allowed is 12MB.");
    }
    const safeName = String(file.name || "image.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = "listings/" + dealerUid + "/" + listingId + "/" + Date.now() + "_" + safeName;
    const imageRef = ref(storage, path);
    await uploadBytes(imageRef, file, { contentType: file.type || "image/jpeg" });
    const url = await getDownloadURL(imageRef);
    if (url) results.push(url);
  }
  return results;
}

export async function getUserRecord(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function ensureUserRecord(uid, email, defaultRole) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const payload = {
      email: trim(email).toLowerCase(),
      role: normalizeUserRole(defaultRole),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(ref, payload);
    return payload;
  }
  const current = snap.data();
  const nextEmail = trim(email).toLowerCase();
  if (nextEmail && current.email !== nextEmail) {
    await updateDoc(ref, { email: nextEmail, updatedAt: serverTimestamp() });
    return { ...current, email: nextEmail };
  }
  return current;
}

export async function setUserRole(uid, role) {
  const ref = doc(db, "users", uid);
  await setDoc(ref, { role, updatedAt: serverTimestamp() }, { merge: true });
}

export function isBuyerProfileComplete(profile) {
  if (!profile) return false;
  return !!(trim(profile.fullName) && trim(profile.phone) && trim(profile.city));
}

export function isDealerProfileComplete(profile) {
  if (!profile) return false;
  return !!(
    trim(profile.businessName) &&
    trim(profile.ownerName) &&
    trim(profile.phone) &&
    trim(profile.city) &&
    trim(profile.address)
  );
}

export async function getBuyerProfile(uid) {
  const ref = doc(db, "buyerProfiles", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function upsertBuyerProfile(uid, profile) {
  const ref = doc(db, "buyerProfiles", uid);
  await setDoc(
    ref,
    {
      ...profile,
      fullName: trim(profile.fullName),
      phone: trim(profile.phone),
      city: trim(profile.city),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function getDealerProfile(uid) {
  const ref = doc(db, "dealerProfiles", uid);
  const snap = await getDoc(ref);
  let data = snap.exists() ? snap.data() : null;
  if (!data) return null;
  const authUid = auth.currentUser && auth.currentUser.uid;
  if (authUid === uid) {
    const privSnap = await getDoc(doc(db, "dealerPrivate", uid));
    if (privSnap.exists()) {
      const p = privSnap.data() || {};
      if (trim(p.ownerCnic)) {
        data = { ...data, ownerCnic: trim(p.ownerCnic) };
      }
      if (Array.isArray(p.soldHistory)) {
        data = { ...data, soldHistory: p.soldHistory };
      }
    }
  }
  return data;
}

export async function upsertDealerProfile(uid, profile) {
  const ref = doc(db, "dealerProfiles", uid);
  const privRef = doc(db, "dealerPrivate", uid);
  const raw = profile || {};
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data() : {};

  if (trim(existing.ownerCnic)) {
    await setDoc(
      privRef,
      { ownerCnic: trim(existing.ownerCnic), updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  const ownerCnicNew = raw.ownerCnic !== undefined ? trim(String(raw.ownerCnic)) : undefined;
  const pub = { ...raw };
  delete pub.ownerCnic;
  delete pub.soldHistory;

  if (ownerCnicNew !== undefined) {
    await setDoc(privRef, { ownerCnic: ownerCnicNew, updatedAt: serverTimestamp() }, { merge: true });
  }

  await setDoc(
    ref,
    {
      ...pub,
      businessName: trim(pub.businessName),
      ownerName: trim(pub.ownerName),
      phone: trim(pub.phone),
      city: trim(pub.city),
      address: trim(pub.address),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  await updateDoc(ref, {
    ownerCnic: deleteField(),
    soldHistory: deleteField()
  });
}
