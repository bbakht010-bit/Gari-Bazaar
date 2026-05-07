import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-client.js";

function clean(value) {
  return String(value || "").trim();
}

export function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildDealerId(dealerName, city) {
  const base = slugify(dealerName);
  const cityPart = slugify(city);
  return cityPart ? base + "-" + cityPart : base;
}

export function buildListingId(carName, dealerName, city) {
  const carPart = slugify(carName);
  const dealerPart = slugify(dealerName);
  const cityPart = slugify(city);
  return [carPart, dealerPart, cityPart].filter(Boolean).join("-");
}

function pick(source, candidates, fallback = "") {
  for (const key of candidates) {
    const value = source && source[key];
    if (value !== undefined && value !== null && clean(value)) return clean(value);
  }
  return fallback;
}

export function normalizeDealerProfile(id, raw) {
  const data = raw || {};
  return {
    id: id || "",
    dealerName: pick(data, ["dealerName", "businessName", "name"]),
    city: pick(data, ["city"]),
    address: pick(data, ["address"]),
    rating: pick(data, ["rating"], "4.8 / 5.0"),
    contactName: pick(data, ["contactName", "ownerName"], "Dealer Team"),
    contactRole: pick(data, ["contactRole"], "Sales Desk"),
    phone: pick(data, ["phone", "whatsapp"], "923000000000"),
    responseTime: pick(data, ["responseTime"], "under 15 minutes")
  };
}

export function normalizeListing(id, raw) {
  const data = raw || {};
  return {
    id: id || "",
    dealerId: pick(data, ["dealerId"]),
    carName: pick(data, ["carName", "name", "title"]),
    priceLakh: pick(data, ["priceLakh", "price"]),
    mileage: pick(data, ["mileage"], "-"),
    transmission: pick(data, ["transmission"], "-"),
    condition: pick(data, ["condition"], "-"),
    city: pick(data, ["city"], "-"),
    fuelType: pick(data, ["fuelType"], "Petrol"),
    registrationCity: pick(data, ["registrationCity", "city"], "-"),
    contactName: pick(data, ["contactName"], "Dealer"),
    contactRole: pick(data, ["contactRole"], "Sales Executive"),
    phone: pick(data, ["phone"], "923000000000"),
    dealerName: pick(data, ["dealerName"], "Verified Dealer"),
    description: pick(data, ["description"], "")
  };
}

export async function fetchDealerProfileById(dealerId) {
  if (!clean(dealerId)) return null;
  try {
    const snap = await getDoc(doc(db, "dealerProfiles", dealerId));
    if (!snap.exists()) return null;
    return normalizeDealerProfile(snap.id, snap.data());
  } catch (_error) {
    return null;
  }
}

export async function fetchListingById(listingId) {
  if (!clean(listingId)) return null;
  try {
    const snap = await getDoc(doc(db, "listings", listingId));
    if (!snap.exists()) return null;
    return normalizeListing(snap.id, snap.data());
  } catch (_error) {
    return null;
  }
}
