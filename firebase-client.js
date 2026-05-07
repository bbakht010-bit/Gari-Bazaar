import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

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
