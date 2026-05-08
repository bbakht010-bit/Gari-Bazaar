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
    businessSince: pick(data, ["businessSince"]),
    joinedAt: pick(data, ["createdAt", "joinedAt"]),
    hours: pick(data, ["hours", "businessHours"]),
    rating: pick(data, ["rating"], ""),
    contactName: pick(data, ["contactName", "ownerName"]),
    contactRole: pick(data, ["contactRole"]),
    phone: pick(data, ["phone", "whatsapp"]),
    responseTime: pick(data, ["responseTime"], ""),
    profilePicture: pick(data, ["profilePicture", "logoUrl", "profilePhoto"], ""),
    registrationDocumentUrl: pick(data, ["registrationDocumentUrl"], ""),
    dealershipPhotos: Array.isArray(data.dealershipPhotos)
      ? data.dealershipPhotos.map((img) => clean(img)).filter(Boolean)
      : []
  };
}

export function normalizeListing(id, raw) {
  const data = raw || {};
  const carImages = Array.isArray(data.carImages)
    ? data.carImages.map((img) => clean(img)).filter(Boolean)
    : [];
  const coverImage = pick(data, ["coverImage", "image"]);
  return {
    id: id || "",
    dealerId: pick(data, ["dealerId"]),
    carName: pick(data, ["carName", "name", "title"]),
    priceLakh: pick(data, ["priceLakh", "price"]),
    mileage: pick(data, ["mileage"], "-"),
    transmission: pick(data, ["transmission"], "-"),
    condition: pick(data, ["condition"], "-"),
    city: pick(data, ["city"], "-"),
    modelYear: pick(data, ["modelYear", "year"], ""),
    fuelType: pick(data, ["fuelType"]),
    engine: pick(data, ["engine"], ""),
    color: pick(data, ["color"], ""),
    registrationCity: pick(data, ["registrationCity", "city"], "-"),
    bodyType: pick(data, ["bodyType"], ""),
    assembly: pick(data, ["assembly"], ""),
    contactName: pick(data, ["contactName"]),
    contactRole: pick(data, ["contactRole"]),
    phone: pick(data, ["phone"]),
    dealerName: pick(data, ["dealerName"]),
    description: pick(data, ["description"], ""),
    features: Array.isArray(data.features) ? data.features.map((f) => clean(f)).filter(Boolean) : [],
    carImages: carImages,
    coverImage: coverImage || (carImages[0] || "")
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
