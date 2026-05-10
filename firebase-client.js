import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js";
import { getAuth, reload, sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  serverTimestamp,
  deleteField
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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

/** Email for Firestore `users/{uid}` and rules (Google may omit `user.email` until profile loads). */
export function authUserPrimaryEmail(user) {
  if (!user) return "";
  const direct = String(user.email || "").trim().toLowerCase();
  if (direct) return direct;
  try {
    const providers = user.providerData || [];
    const hit = providers.find((p) => p && String(p.email || "").trim());
    return hit ? String(hit.email || "").trim().toLowerCase() : "";
  } catch (_e) {
    return "";
  }
}

function googlePopupShouldUseRedirectFallback(err) {
  const code = err && err.code ? String(err.code) : "";
  return (
    code === "auth/popup-blocked" ||
    code === "auth/cancelled-popup-request" ||
    code === "auth/operation-not-supported-in-this-environment"
  );
}

/**
 * Web login: popup first (best UX); if blocked, full-page redirect (works when popups fail).
 */
export async function signInWithGoogleWithRedirectFallback() {
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"
  );
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    return await signInWithPopup(auth, provider);
  } catch (e) {
    if (googlePopupShouldUseRedirectFallback(e)) {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw e;
  }
}

/** Call once after load on login pages that use Google redirect fallback. */
export async function consumeGoogleRedirectResult() {
  const { getRedirectResult } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
  try {
    const credential = await getRedirectResult(auth);
    return credential && credential.user ? credential : null;
  } catch (_e) {
    return null;
  }
}

function trim(value) {
  return String(value || "").trim();
}

function normalizeUserRole(role) {
  const cleanRole = trim(role).toLowerCase();
  return cleanRole === "dealer" ? "dealer" : "buyer";
}

export { app, auth, db, storage };

/** Dealer profile, gallery, verification docs, listing car photos — must match `storage.rules`. */
export const DEALER_MEDIA_MAX_BYTES = 6 * 1024 * 1024;
export const DEALER_VERIFICATION_MAX_BYTES = DEALER_MEDIA_MAX_BYTES;
export const DEALER_GALLERY_MAX_BYTES = DEALER_MEDIA_MAX_BYTES;

const LISTING_CAR_IMAGE_MAX_BYTES = DEALER_MEDIA_MAX_BYTES;

/**
 * Storage rules (`storage.rules`) read Firestore `users/{uid}` for dealer uploads. Ensures `dealer: true`
 * is persisted and refreshes the ID token immediately before uploads so reads in rules match the client.
 */
export async function prepareDealerStorageWrites(uid) {
  const u = auth.currentUser;
  if (!u || !uid || u.uid !== uid) {
    throw new Error("You must stay signed in to upload dealership files.");
  }
  await ensureUserRecord(uid, authUserPrimaryEmail(u), "dealer");
  const record = await getUserRecordFromServer(uid);
  if (!userHasDealerAccess(record)) {
    throw new Error(
      "Your account is not authorized for dealer uploads. Sign out, open dealer-login.html, sign in again, then retry."
    );
  }
  await u.getIdToken(true);
}

/**
 * Dealer profile photo → Storage (public read). Falls back to caller if Storage is disabled.
 */
export async function uploadDealerProfileImage(uid, file) {
  if (!uid || !file) return "";
  await prepareDealerStorageWrites(uid);
  const size = Number(file.size || 0);
  if (size > DEALER_MEDIA_MAX_BYTES) {
    throw new Error(
      "Profile photo exceeds " +
        DEALER_MEDIA_MAX_BYTES / (1024 * 1024) +
        " MB. Use a smaller image or resize it."
    );
  }
  const ct = resolveImageFileContentType(file);
  if (!ct) {
    throw new Error("Please choose a JPG, PNG, WebP, GIF, or HEIC image.");
  }
  const safeName = String(file.name || "profile.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = "dealers/" + uid + "/profile/" + Date.now() + "_" + safeName;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: ct });
  return await getDownloadURL(storageRef);
}

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

/**
 * Many desktop browsers (especially on Windows) leave `File.type` empty. Rules and uploads need a real `image/*`
 * Content-Type; we infer from extension when the browser omits MIME data.
 * @returns {string} Non-empty image/* MIME, or "" if the file does not look like an allowed image.
 */
export function resolveImageFileContentType(file) {
  if (!file) return "";
  const direct = inferredImageContentType(file);
  if (String(direct).startsWith("image/")) return direct;
  const safeBase = safeStorageObjectName(file.name, "image.jpg");
  const lower = safeBase.toLowerCase();
  if (!/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(lower)) return "";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
}

/** Max image size before we resize in-browser (not the Storage rule — protects memory). */
export const BUYER_AVATAR_PICK_MAX_BYTES = 35 * 1024 * 1024;

/** Matches `storage.rules` (`buyers/{id}/avatar/*`); we compress to stay under this. */
export const BUYER_AVATAR_MAX_BYTES = 6 * 1024 * 1024;

function loadImageElementFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this image. Try another photo."));
    };
    img.src = url;
  });
}

/**
 * Shrinks and re-encodes JPEG/PNG/WebP so typical phone-camera shots stay under `maxBytes`
 * without asking the user to compress anything.
 */
async function prepareBuyerAvatarForUpload(file, maxBytes) {
  const n = Number(file.size || 0);
  if (n > BUYER_AVATAR_PICK_MAX_BYTES) {
    throw new Error("This photo is too large to open in your browser. Please choose a file under 35 MB.");
  }
  const ct = resolveImageFileContentType(file);
  if (!ct || !/^(image\/jpeg|image\/png|image\/webp)$/i.test(ct)) {
    throw new Error("Profile photo must be JPG, PNG, or WebP.");
  }
  if (n <= maxBytes) {
    return { file, contentType: ct };
  }

  const img = await loadImageElementFromFile(file);
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (nw < 1 || nh < 1) {
    throw new Error("Invalid image.");
  }

  let maxEdge = 2048;
  const minEdge = 360;

  for (let round = 0; round < 20; round += 1) {
    const scale = Math.min(1, maxEdge / Math.max(nw, nh));
    const w = Math.max(1, Math.round(nw * scale));
    const h = Math.max(1, Math.round(nh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Your browser could not process this image.");
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    for (let q = 0.9; q >= 0.36; q -= 0.05) {
      const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", q));
      if (blob && blob.size <= maxBytes) {
        const rawBase = safeStorageObjectName(file.name, "avatar.jpg").replace(/\.[^.]+$/i, "") || "avatar";
        const outFile = new File([blob], rawBase + ".jpg", { type: "image/jpeg" });
        return { file: outFile, contentType: "image/jpeg" };
      }
    }

    maxEdge = Math.max(minEdge, Math.floor(maxEdge * 0.8));
  }

  throw new Error("Could not prepare this photo. Try a different picture.");
}

/**
 * Buyer profile avatar → `buyers/{uid}/avatar/…` (public read). Large picks are compressed client-side.
 */
export async function uploadBuyerProfileImage(uid, file) {
  if (!uid || !file) return "";
  const u = auth.currentUser;
  if (!u || u.uid !== uid) {
    throw new Error("You must stay signed in to upload your photo.");
  }
  await u.getIdToken(true);
  const prepared = await prepareBuyerAvatarForUpload(file, BUYER_AVATAR_MAX_BYTES);
  const safeName = safeStorageObjectName(prepared.file.name, "avatar.jpg");
  const path = "buyers/" + uid + "/avatar/" + Date.now() + "_" + safeName;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, prepared.file, { contentType: prepared.contentType });
  return await getDownloadURL(storageRef);
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
 * Govt registration etc. → `dealers/{uid}/verification/…`. Rules: PDF or image, max 6MB.
 */
export async function uploadDealerVerificationDoc(uid, file) {
  if (!uid || !file) return "";
  await prepareDealerStorageWrites(uid);
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
 * Dealership photos on registration → `dealers/{uid}/gallery/…`. Rules: images, max 6MB.
 */
export async function uploadDealerGallery(uid, files) {
  if (!uid) return [];
  await prepareDealerStorageWrites(uid);
  const list = Array.from(files || []);
  const urls = [];
  for (const file of list) {
    const size = Number(file.size || 0);
    if (size > DEALER_GALLERY_MAX_BYTES) {
      const sizeMb = (size / (1024 * 1024)).toFixed(1);
      throw new Error(
        'Dealership photo "' +
          (file.name || "image") +
          '" is ' +
          sizeMb +
          "MB. Max is " +
          DEALER_GALLERY_MAX_BYTES / (1024 * 1024) +
          "MB."
      );
    }
    const ct = resolveImageFileContentType(file);
    const safeBase = safeStorageObjectName(file.name, "photo.jpg");
    if (!ct) {
      throw new Error(
        'Dealership photo "' + (file.name || "") + "\" must be an image (JPG, PNG, WebP, HEIC, etc.)."
      );
    }
    const path = "dealers/" + uid + "/gallery/" + Date.now() + "_" + safeBase;
    const fileRef = ref(storage, path);
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
  await prepareDealerStorageWrites(dealerUid);
  const files = Array.from(fileList || []);
  const results = [];
  for (const file of files) {
    const ct = resolveImageFileContentType(file);
    if (!ct) {
      throw new Error(
        'Car photo "' +
          (file.name || "file") +
          "\" must be an image (JPG, PNG, WebP, etc.). If the file is correct, rename it with an extension like .jpg."
      );
    }
    if (Number(file.size || 0) > LISTING_CAR_IMAGE_MAX_BYTES) {
      const sizeMb = (Number(file.size || 0) / (1024 * 1024)).toFixed(1);
      throw new Error(
        'Image "' +
          (file.name || "file") +
          '" is ' +
          sizeMb +
          "MB. Max allowed is " +
          LISTING_CAR_IMAGE_MAX_BYTES / (1024 * 1024) +
          "MB."
      );
    }
    const safeName = String(file.name || "image.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = "listings/" + dealerUid + "/" + listingId + "/" + Date.now() + "_" + safeName;
    const imageRef = ref(storage, path);
    await uploadBytes(imageRef, file, { contentType: ct });
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

/** Same as `getUserRecord` but reads from the server — used before Storage uploads so rules see committed dealer flags. */
export async function getUserRecordFromServer(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDocFromServer(ref);
  return snap.exists() ? snap.data() : null;
}

/** True if this account may use dealer-only features (dashboard, listings, Storage dealer paths). */
export function userHasDealerAccess(record) {
  if (!record) return false;
  if (record.role === "admin") return false;
  // Firestore may deserialize legacy/admin-edited values loosely; stay aligned with `storage.rules` intent.
  if (record.dealer === true || record.dealer === 1 || String(record.dealer).toLowerCase() === "true") {
    return true;
  }
  const r = trim(record.role).toLowerCase();
  return r === "dealer";
}

/** True if this account may use buyer sign-in and buyer profile flows. */
export function userHasBuyerAccess(record) {
  if (!record) return false;
  if (record.role === "admin") return false;
  if (record.buyer === true) return true;
  if (record.buyer === false) return false;
  const r = trim(record.role).toLowerCase();
  return r === "buyer";
}

/** True only when `users/{uid}.role` is admin (set from Firebase Console / Admin SDK — never from the public app). */
export function userIsAdmin(record) {
  return !!(record && record.role === "admin");
}

/**
 * Confirms this signed-in user is allowed to use the admin panel.
 * Checks Firestore `users/{uid}` (source of truth you set in Console) and refreshes the ID token so `admin` custom claims apply when deployed.
 */
export async function verifyFirebaseAdminAccess(authUser) {
  if (!authUser) return { ok: false };
  await authUser.getIdToken(true);
  const record = await getUserRecord(authUser.uid);
  if (!userIsAdmin(record)) {
    return { ok: false };
  }
  const { getIdTokenResult } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
  await getIdTokenResult(authUser);
  return { ok: true };
}

/**
 * Ensures `users/{uid}` exists and optionally grants buyer/dealer capability flags.
 * Pass `defaultRole` null to sync email only (no new capability grants) — used by admin login.
 */
export async function ensureUserRecord(uid, email, defaultRole) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  /** Firestore rules require `users/{uid}.email` string on every update; keep it aligned with Firebase Auth email. */
  const authEmailLower = trim(email).toLowerCase();

  if (!snap.exists()) {
    if (defaultRole == null) return null;
    const role = normalizeUserRole(defaultRole);
    const payload = {
      email: authEmailLower,
      role,
      buyer: role === "buyer",
      dealer: role === "dealer",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(ref, payload);
    const created = await getUserRecord(uid);
    return created || payload;
  }

  const current = snap.data() || {};
  const existingEmailLower = trim(current.email).toLowerCase();

  if (trim(String(current.role || "")).toLowerCase() === "admin") {
    if (authEmailLower && existingEmailLower !== authEmailLower) {
      await updateDoc(ref, { email: authEmailLower, updatedAt: serverTimestamp() });
      return (await getUserRecord(uid)) || { ...current, email: authEmailLower };
    }
    return current;
  }

  if (defaultRole == null) {
    if (authEmailLower && existingEmailLower !== authEmailLower) {
      await updateDoc(ref, { email: authEmailLower, updatedAt: serverTimestamp() });
      return (await getUserRecord(uid)) || { ...current, email: authEmailLower };
    }
    return current;
  }

  const normalized = normalizeUserRole(defaultRole);
  const updates = {};
  if (authEmailLower && existingEmailLower !== authEmailLower) {
    updates.email = authEmailLower;
  } else if (authEmailLower && !existingEmailLower) {
    updates.email = authEmailLower;
  }
  // Same email works on buyer + dealer: add capability flags without changing primary `role` (rules block role churn).
  if (normalized === "dealer" && !userHasDealerAccess(current)) {
    updates.dealer = true;
  }
  if (normalized === "buyer" && !userHasBuyerAccess(current)) {
    updates.buyer = true;
  }

  if (Object.keys(updates).length) {
    updates.updatedAt = serverTimestamp();
    await updateDoc(ref, updates);
    return (await getUserRecord(uid)) || { ...current, ...updates };
  }
  return current;
}

export async function setUserRole(uid, role) {
  const ref = doc(db, "users", uid);
  await setDoc(ref, { role, updatedAt: serverTimestamp() }, { merge: true });
}

/** Reload current user from Firebase (e.g. after clicking email verification link). */
export async function reloadFirebaseUser() {
  const u = auth.currentUser;
  if (!u) return null;
  await reload(u);
  return auth.currentUser;
}

/** Sends Firebase verification email (free). No-op if already verified. */
export async function sendVerificationEmailToCurrentUser() {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in.");
  if (u.emailVerified) return { skipped: true };
  await sendEmailVerification(u);
  return { sent: true };
}


/**
 * Where to send a dealer after auth when email is verified (matches dealer-login flow).
 */
export async function getDealerPostLoginPath(user) {
  if (!user || !user.uid) return "dealer-login.html";
  let profile = await getDealerProfile(user.uid);
  if (!profile) {
    const legacyRaw = localStorage.getItem("gb_dealer_profile_" + user.uid);
    if (legacyRaw) {
      try {
        const legacy = JSON.parse(legacyRaw);
        delete legacy.verificationStatus;
        delete legacy.suspended;
        delete legacy.carsSold;
        delete legacy.soldHistory;
        await upsertDealerProfile(user.uid, {
          ...legacy,
          verificationStatus: "pending",
          suspended: false
        });
        profile = await getDealerProfile(user.uid);
      } catch (_error) {}
    }
  }
  if (profile) {
    localStorage.setItem("gb_dealer_profile_" + user.uid, JSON.stringify(profile));
  }
  if (!isDealerProfileComplete(profile)) return "register.html";
  const status = String((profile && profile.verificationStatus) || "pending").toLowerCase();
  if (status === "verified" || status === "approved") return "dealer-dashboard.html";
  return "dealer-application-pending.html";
}

/**
 * Where to send a buyer after auth when email is verified (matches buyer-login flow).
 */
export async function getBuyerPostLoginPath(user) {
  if (!user || !user.uid) return "buyer-login.html";
  let profile = await getBuyerProfile(user.uid);
  if (!profile) {
    const legacyRaw = localStorage.getItem("gb_buyer_profile_" + user.uid);
    if (legacyRaw) {
      try {
        const legacy = JSON.parse(legacyRaw);
        await upsertBuyerProfile(user.uid, legacy);
        profile = await getBuyerProfile(user.uid);
      } catch (_error) {}
    }
  }
  return isBuyerProfileComplete(profile) ? "index.html" : "buyer-profile.html";
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
