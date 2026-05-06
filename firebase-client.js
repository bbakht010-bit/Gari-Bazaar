import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAs5VDo5lrmJUWONSN6gyYi856P0QXzndE",
  authDomain: "gari-bazaar.firebaseapp.com",
  projectId: "gari-bazaar",
  storageBucket: "gari-bazaar.firebasestorage.app",
  messagingSenderId: "296364565325",
  appId: "1:296364565325:web:59a017564b7dd55c9d0d04",
  measurementId: "G-7LT0S01NPP"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function trim(value) {
  return String(value || "").trim();
}

export { app, auth, db };

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
      role: defaultRole,
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
  return snap.exists() ? snap.data() : null;
}

export async function upsertDealerProfile(uid, profile) {
  const ref = doc(db, "dealerProfiles", uid);
  await setDoc(
    ref,
    {
      ...profile,
      businessName: trim(profile.businessName),
      ownerName: trim(profile.ownerName),
      phone: trim(profile.phone),
      city: trim(profile.city),
      address: trim(profile.address),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}
