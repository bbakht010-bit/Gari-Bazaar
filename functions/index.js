const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const DEFAULT_STORAGE_BUCKET = "gari-bazaar.firebasestorage.app";
const storageBucket = admin.storage().bucket(DEFAULT_STORAGE_BUCKET);
const FieldValue = admin.firestore.FieldValue;
const REGION = "asia-south1";
/** Must match your Firestore database location (default DB is often US multi-region → use us-central1 for Gen1 triggers). */
const FIRESTORE_TRIGGER_REGION = "us-central1";
/**
 * Callable App Check enforcement turns on when `scripts/generate-app-check-config.mjs`
 * detects a site key and writes `functions/.app-check-enforce` (value `1`).
 */
function readCallableRuntimeOptions() {
  try {
    const flagPath = path.join(__dirname, ".app-check-enforce");
    if (fs.existsSync(flagPath) && fs.readFileSync(flagPath, "utf8").trim() === "1") {
      return { enforceAppCheck: true };
    }
  } catch (_err) {
    /* deploy without flag file → enforcement off */
  }
  return {};
}

const CALLABLE_RUNTIME = readCallableRuntimeOptions();

const PLAN_LIMITS = {
  free: { listings: 2, employees: 1 },
  growth: { listings: 15, employees: 5 },
  pro: { listings: 50, employees: 15 }
};
const ALLOWED_PANEL_MARKS = new Set(["touched", "sprayed", "repaired"]);

function clean(value) {
  return String(value || "").trim();
}

function digitsOnly(value) {
  return clean(value).replace(/\D/g, "");
}

function normalizePlan(value) {
  const raw = clean(value).toLowerCase();
  if (raw === "growth") return "growth";
  if (raw === "pro" || raw === "professional") return "pro";
  return "free";
}

function getPlanLimits(value) {
  const plan = normalizePlan(value);
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  return {
    plan,
    listingLimit: limits.listings,
    employeeLimit: limits.employees
  };
}

function assertAuthenticated(context) {
  if (!context || !context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
  }
  return context.auth.uid;
}

function dealerHasAccess(userData) {
  return !!(
    userData &&
    (userData.role === "dealer" || userData.dealer === true || String(userData.dealer).toLowerCase() === "true")
  );
}

async function getUserRecord(uid, deps) {
  const snap = await deps.db.doc(`users/${uid}`).get();
  return snap.exists ? snap.data() || {} : null;
}

async function assertAdmin(context, deps) {
  const uid = assertAuthenticated(context);
  if (context.auth.token && context.auth.token.admin === true) return uid;
  const userData = await getUserRecord(uid, deps);
  if (!userData || userData.role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Admin access required.");
  }
  return uid;
}

async function assertDealerState(uid, deps) {
  const userSnap = await deps.db.doc(`users/${uid}`).get();
  const userData = userSnap.exists ? userSnap.data() || {} : {};
  if (!userSnap.exists || !dealerHasAccess(userData)) {
    throw new functions.https.HttpsError("permission-denied", "Dealer accounts only.");
  }

  const profileSnap = await deps.db.doc(`dealerProfiles/${uid}`).get();
  if (!profileSnap.exists) {
    throw new functions.https.HttpsError("failed-precondition", "Dealer profile not found.");
  }
  const profile = profileSnap.data() || {};
  const status = clean(profile.verificationStatus).toLowerCase();
  if (status !== "verified" && status !== "approved") {
    throw new functions.https.HttpsError("permission-denied", "Dealership is not approved.");
  }
  if (profile.suspended) {
    throw new functions.https.HttpsError("permission-denied", "Dealership is suspended.");
  }

  const privateSnap = await deps.db.doc(`dealerPrivate/${uid}`).get();
  const privateData = privateSnap.exists ? privateSnap.data() || {} : {};
  return {
    userData,
    profile,
    privateData,
    privateRef: deps.db.doc(`dealerPrivate/${uid}`),
    profileRef: deps.db.doc(`dealerProfiles/${uid}`),
    entitlements: getPlanLimits(privateData.plan),
    ownerContact: {
      name: clean(profile.ownerName) || "Owner",
      role: "Owner",
      phone: digitsOnly(profile.phone),
      whatsapp: digitsOnly(profile.whatsapp || profile.phone)
    }
  };
}

function sanitizeEmployee(employee, index) {
  const id = clean(employee && employee.id);
  const name = clean(employee && employee.name);
  const role = clean(employee && employee.role);
  const phone = digitsOnly(employee && employee.phone);
  const whatsapp = digitsOnly(employee && (employee.whatsapp || employee.phone));
  if (!id) {
    throw new functions.https.HttpsError("invalid-argument", `Employee ${index + 1} is missing an id.`);
  }
  if (!name || name.length > 120) {
    throw new functions.https.HttpsError("invalid-argument", `Employee ${index + 1} name is invalid.`);
  }
  if (!role || role.length > 120) {
    throw new functions.https.HttpsError("invalid-argument", `Employee ${index + 1} role is invalid.`);
  }
  if (phone.length < 10 || phone.length > 15) {
    throw new functions.https.HttpsError("invalid-argument", `Employee ${index + 1} phone is invalid.`);
  }
  if (whatsapp.length < 10 || whatsapp.length > 15) {
    throw new functions.https.HttpsError("invalid-argument", `Employee ${index + 1} WhatsApp is invalid.`);
  }
  return { id, name, role, phone, whatsapp };
}

function sanitizeEmployees(value) {
  const list = Array.isArray(value) ? value : [];
  const seenIds = new Set();
  return list.map((employee, index) => {
    const sanitized = sanitizeEmployee(employee, index);
    if (seenIds.has(sanitized.id)) {
      throw new functions.https.HttpsError("invalid-argument", "Employee IDs must be unique.");
    }
    seenIds.add(sanitized.id);
    return sanitized;
  });
}

function sanitizeStringField(value, name, maxLength, required = false) {
  const cleaned = clean(value);
  if (required && !cleaned) {
    throw new functions.https.HttpsError("invalid-argument", `${name} is required.`);
  }
  if (cleaned.length > maxLength) {
    throw new functions.https.HttpsError("invalid-argument", `${name} is too long.`);
  }
  return cleaned;
}

function sanitizeListingPayload(data) {
  const listingId = clean(data && data.listingId);
  const carName = sanitizeStringField(data && data.carName, "carName", 200, true);
  const priceRaw = clean(data && (data.priceLakh || data.price));
  const numericPrice = Number(priceRaw);
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    throw new functions.https.HttpsError("invalid-argument", "price must be a non-negative number.");
  }
  const mileage = sanitizeStringField(data && data.mileage, "mileage", 96, true);
  const transmission = sanitizeStringField(data && data.transmission, "transmission", 40, true);
  const condition = sanitizeStringField(data && data.condition, "condition", 40, true);
  const city = sanitizeStringField(data && data.city, "city", 80, true);
  const description = sanitizeStringField(data && data.description, "description", 8000);
  const bodyNote = sanitizeStringField(data && data.bodyNote, "bodyNote", 2000);
  const modelYear = sanitizeStringField(data && data.modelYear, "modelYear", 8);
  const fuelType = sanitizeStringField(data && data.fuelType, "fuelType", 40);
  const engine = sanitizeStringField(data && data.engine, "engine", 32);
  const color = sanitizeStringField(data && data.color, "color", 40);
  const registrationCity = sanitizeStringField(data && data.registrationCity, "registrationCity", 80);
  const bodyType = sanitizeStringField(data && data.bodyType, "bodyType", 40);
  const assembly = sanitizeStringField(data && data.assembly, "assembly", 40);
  const paintStatus = sanitizeStringField(data && data.paintStatus, "paintStatus", 40, true);
  const assigneeId = clean(data && data.assigneeId);
  const requestedImages = Array.isArray(data && data.carImages)
    ? data.carImages.map((image) => clean(image)).filter(Boolean)
    : [];
  if (!requestedImages.length) {
    throw new functions.https.HttpsError("invalid-argument", "At least one car image is required.");
  }
  if (requestedImages.length > 28) {
    throw new functions.https.HttpsError("invalid-argument", "A listing can have at most 28 images.");
  }
  const coverImage = clean(data && data.coverImage);
  const finalCoverImage = requestedImages.includes(coverImage) ? coverImage : requestedImages[0];
  const features = Array.isArray(data && data.features)
    ? data.features.map((feature) => clean(feature)).filter(Boolean).slice(0, 72)
    : [];
  const panelMarksInput = data && data.panelMarks && typeof data.panelMarks === "object" ? data.panelMarks : {};
  const panelMarks = {};
  for (const [key, value] of Object.entries(panelMarksInput)) {
    const normalized = clean(value).toLowerCase();
    if (!normalized) continue;
    if (!ALLOWED_PANEL_MARKS.has(normalized)) {
      throw new functions.https.HttpsError("invalid-argument", `Invalid panel mark for ${key}.`);
    }
    panelMarks[key] = normalized;
  }
  return {
    listingId,
    carName,
    price: String(Math.round(numericPrice)),
    mileage,
    transmission,
    condition,
    city,
    modelYear,
    fuelType,
    engine,
    color,
    registrationCity,
    bodyType,
    assembly,
    paintStatus,
    bodyNote,
    description,
    assigneeId,
    carImages: requestedImages,
    coverImage: finalCoverImage,
    features,
    panelMarks
  };
}

function resolveAssignmentContact(ownerContact, employees, assigneeId) {
  const employeeList = Array.isArray(employees) ? employees : [];
  if (!clean(assigneeId)) {
    return {
      assigneeId: "",
      contactName: ownerContact.name,
      contactRole: ownerContact.role,
      phone: ownerContact.phone
    };
  }
  const employee = employeeList.find((entry) => clean(entry.id) === clean(assigneeId));
  if (!employee) {
    throw new functions.https.HttpsError("invalid-argument", "Assigned employee not found.");
  }
  return {
    assigneeId: clean(employee.id),
    contactName: clean(employee.name),
    contactRole: clean(employee.role),
    phone: digitsOnly(employee.phone)
  };
}

function allowedEmployeeCount(existingCount, limit) {
  return Math.max(Number(limit || 0), Number(existingCount || 0));
}

function sanitizeVerificationDocument(value) {
  if (!value || typeof value !== "object") return null;
  const storagePath = clean(value.storagePath);
  const fileName = clean(value.fileName || (storagePath ? storagePath.split("/").pop() : ""));
  const contentType = clean(value.contentType);
  const uploadedAt = clean(value.uploadedAt);
  const legacyDownloadUrl = clean(value.legacyDownloadUrl);
  if (!storagePath && !legacyDownloadUrl) return null;
  return {
    storagePath,
    fileName,
    contentType,
    uploadedAt,
    legacyDownloadUrl
  };
}

function currentActiveListingsCount(listingDocs, dealerId, excludeListingId = "") {
  return listingDocs.filter((docSnap) => {
    const listing = docSnap.data() || {};
    if (clean(listing.dealerId) !== clean(dealerId)) return false;
    if (clean(docSnap.id) === clean(excludeListingId)) return false;
    return clean(listing.moderationStatus || "live").toLowerCase() !== "removed";
  }).length;
}

function defaultDeps() {
  return {
    admin,
    db,
    storageBucket,
    fieldValue: FieldValue
  };
}

async function syncUserAdminClaimHandler(change, context, deps = defaultDeps()) {
  const uid = context.params.uid;
  try {
    const after = change.after.exists ? change.after.data() : null;
    if (after && after.role === "admin") {
      await deps.admin.auth().setCustomUserClaims(uid, { admin: true });
    } else {
      await deps.admin.auth().setCustomUserClaims(uid, { admin: false });
    }
  } catch (err) {
    console.error("syncUserAdminClaim failed", uid, err && err.message ? err.message : err);
  }
  return null;
}

async function getDealerVerificationDocumentAccessHandler(data, context, deps = defaultDeps()) {
  await assertAdmin(context, deps);
  const dealerId = clean(data && data.dealerId);
  const changeRequestId = clean(data && data.changeRequestId);
  if (!dealerId) {
    throw new functions.https.HttpsError("invalid-argument", "dealerId is required.");
  }

  let verificationDocument = null;
  if (changeRequestId) {
    const changeSnap = await deps.db.doc(`dealerChangeRequests/${changeRequestId}`).get();
    if (!changeSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Change request not found.");
    }
    const changeData = changeSnap.data() || {};
    if (clean(changeData.dealerId) !== dealerId) {
      throw new functions.https.HttpsError("invalid-argument", "Change request does not match dealer.");
    }
    verificationDocument = sanitizeVerificationDocument(
      changeData.privateChanges && changeData.privateChanges.verificationDocument
    );
  }
  if (!verificationDocument) {
    const privateSnap = await deps.db.doc(`dealerPrivate/${dealerId}`).get();
    const privateData = privateSnap.exists ? privateSnap.data() || {} : {};
    verificationDocument = sanitizeVerificationDocument(privateData.verificationDocument);
  }
  if (!verificationDocument) {
    throw new functions.https.HttpsError("not-found", "Verification document not found.");
  }
  if (!verificationDocument.storagePath) {
    return {
      ok: true,
      url: verificationDocument.legacyDownloadUrl,
      fileName: verificationDocument.fileName || "",
      uploadedAt: verificationDocument.uploadedAt || "",
      source: "legacy-url"
    };
  }
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const [url] = await deps.storageBucket.file(verificationDocument.storagePath).getSignedUrl({
    action: "read",
    expires: expiresAt
  });
  return {
    ok: true,
    url,
    fileName: verificationDocument.fileName || "",
    uploadedAt: verificationDocument.uploadedAt || "",
    expiresAt: new Date(expiresAt).toISOString(),
    source: "signed-url"
  };
}

async function saveDealerEmployeesHandler(data, context, deps = defaultDeps()) {
  const uid = assertAuthenticated(context);
  const state = await assertDealerState(uid, deps);
  const nextEmployees = sanitizeEmployees(data && data.employees);
  const existingEmployees = Array.isArray(state.privateData.employees) ? state.privateData.employees : [];
  const effectiveLimit = allowedEmployeeCount(existingEmployees.length, state.entitlements.employeeLimit);
  if (nextEmployees.length > effectiveLimit) {
    throw new functions.https.HttpsError(
      "resource-exhausted",
      `Your current plan allows up to ${state.entitlements.employeeLimit} employee contact(s).`
    );
  }

  await state.privateRef.set(
    {
      employees: nextEmployees,
      updatedAt: deps.fieldValue.serverTimestamp()
    },
    { merge: true }
  );

  const listingsSnap = await deps.db.collection("listings").where("dealerId", "==", uid).get();
  const validIds = new Set(nextEmployees.map((employee) => clean(employee.id)));
  const batch = deps.db.batch();
  let touchedListings = 0;
  listingsSnap.docs.forEach((docSnap) => {
    const listing = docSnap.data() || {};
    const assignedEmployeeId = clean(listing.assignedEmployeeId);
    if (!assignedEmployeeId || validIds.has(assignedEmployeeId)) return;
    batch.update(docSnap.ref, {
      assignedEmployeeId: "",
      contactName: state.ownerContact.name,
      contactRole: state.ownerContact.role,
      phone: state.ownerContact.phone,
      updatedAt: deps.fieldValue.serverTimestamp()
    });
    touchedListings++;
  });
  if (touchedListings > 0) {
    await batch.commit();
  }

  return {
    ok: true,
    employees: nextEmployees,
    employeeLimit: state.entitlements.employeeLimit
  };
}

async function upsertDealerListingHandler(data, context, deps = defaultDeps()) {
  const uid = assertAuthenticated(context);
  const state = await assertDealerState(uid, deps);
  const listing = sanitizeListingPayload(data || {});
  const listingId = listing.listingId || deps.db.collection("listings").doc().id;
  const listingRef = deps.db.doc(`listings/${listingId}`);

  await deps.db.runTransaction(async (tx) => {
    const existingSnap = await tx.get(listingRef);
    const existing = existingSnap.exists ? existingSnap.data() || {} : null;
    if (existing && clean(existing.dealerId) !== uid) {
      throw new functions.https.HttpsError("permission-denied", "Not your listing.");
    }
    const currentModerationStatus = clean(existing && existing.moderationStatus ? existing.moderationStatus : "live").toLowerCase();
    if (currentModerationStatus === "removed") {
      throw new functions.https.HttpsError("failed-precondition", "Removed listings cannot be edited.");
    }

    const listingQuery = deps.db.collection("listings").where("dealerId", "==", uid);
    const listingSnap = await tx.get(listingQuery);
    const activeCount = currentActiveListingsCount(listingSnap.docs, uid, existing ? listingId : "");
    const effectiveLimit = allowedEmployeeCount(activeCount, state.entitlements.listingLimit);
    if (!existing && activeCount >= effectiveLimit) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        `Your current plan allows up to ${state.entitlements.listingLimit} active listing(s).`
      );
    }

    const employees = Array.isArray(state.privateData.employees) ? state.privateData.employees : [];
    const contact = resolveAssignmentContact(state.ownerContact, employees, listing.assigneeId);
    const payload = {
      dealerId: uid,
      dealerName: clean(state.profile.businessName),
      carName: listing.carName,
      priceLakh: listing.price,
      price: listing.price,
      mileage: listing.mileage,
      transmission: listing.transmission,
      condition: listing.condition,
      city: listing.city,
      modelYear: listing.modelYear,
      fuelType: listing.fuelType,
      engine: listing.engine,
      color: listing.color,
      registrationCity: listing.registrationCity || listing.city,
      bodyType: listing.bodyType,
      assembly: listing.assembly,
      paintStatus: listing.paintStatus,
      bodyNote: listing.bodyNote,
      description: listing.description,
      features: listing.features,
      panelMarks: listing.panelMarks,
      assignedEmployeeId: contact.assigneeId,
      contactName: contact.contactName,
      contactRole: contact.contactRole,
      phone: contact.phone,
      carImages: listing.carImages,
      coverImage: listing.coverImage,
      moderationStatus: existing && currentModerationStatus === "review" ? "review" : "live",
      updatedAt: deps.fieldValue.serverTimestamp()
    };

    if (existing) {
      tx.set(listingRef, payload, { merge: true });
    } else {
      tx.set(listingRef, {
        ...payload,
        createdAt: deps.fieldValue.serverTimestamp()
      });
    }
  });

  return {
    ok: true,
    listingId,
    listingLimit: state.entitlements.listingLimit
  };
}

async function deleteDealerListingHandler(data, context, deps = defaultDeps()) {
  const uid = assertAuthenticated(context);
  await assertDealerState(uid, deps);
  const listingId = clean(data && data.listingId);
  if (!listingId) {
    throw new functions.https.HttpsError("invalid-argument", "listingId is required.");
  }
  const listingRef = deps.db.doc(`listings/${listingId}`);
  const listingSnap = await listingRef.get();
  if (!listingSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Listing not found.");
  }
  const listing = listingSnap.data() || {};
  if (clean(listing.dealerId) !== uid) {
    throw new functions.https.HttpsError("permission-denied", "Not your listing.");
  }
  await listingRef.delete();
  return { ok: true };
}

async function setDealerListingAssignmentHandler(data, context, deps = defaultDeps()) {
  const uid = assertAuthenticated(context);
  const state = await assertDealerState(uid, deps);
  const listingId = clean(data && data.listingId);
  if (!listingId) {
    throw new functions.https.HttpsError("invalid-argument", "listingId is required.");
  }
  const listingRef = deps.db.doc(`listings/${listingId}`);
  const listingSnap = await listingRef.get();
  if (!listingSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Listing not found.");
  }
  const listing = listingSnap.data() || {};
  if (clean(listing.dealerId) !== uid) {
    throw new functions.https.HttpsError("permission-denied", "Not your listing.");
  }
  if (clean(listing.moderationStatus).toLowerCase() === "removed") {
    throw new functions.https.HttpsError("failed-precondition", "Removed listings cannot be updated.");
  }
  const employees = Array.isArray(state.privateData.employees) ? state.privateData.employees : [];
  const contact = resolveAssignmentContact(state.ownerContact, employees, data && data.assigneeId);
  await listingRef.update({
    assignedEmployeeId: contact.assigneeId,
    contactName: contact.contactName,
    contactRole: contact.contactRole,
    phone: contact.phone,
    updatedAt: deps.fieldValue.serverTimestamp()
  });
  return { ok: true };
}

async function markListingSoldHandler(data, context, deps = defaultDeps()) {
  const uid = assertAuthenticated(context);
  const listingId = data && typeof data.listingId === "string" ? data.listingId.trim() : "";
  if (!listingId) {
    throw new functions.https.HttpsError("invalid-argument", "listingId is required.");
  }

  await assertDealerState(uid, deps);

  await deps.db.runTransaction(async (tx) => {
    const listingRef = deps.db.doc(`listings/${listingId}`);
    const listingSnap = await tx.get(listingRef);
    if (!listingSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Listing not found.");
    }
    const listing = listingSnap.data() || {};
    if (clean(listing.dealerId) !== uid) {
      throw new functions.https.HttpsError("permission-denied", "Not your listing.");
    }
    const mod = clean(listing.moderationStatus || "live").toLowerCase();
    if (mod === "removed") {
      throw new functions.https.HttpsError("failed-precondition", "Listing is removed.");
    }

    const privRef = deps.db.doc(`dealerPrivate/${uid}`);
    const pubRef = deps.db.doc(`dealerProfiles/${uid}`);
    const privSnap = await tx.get(privRef);
    const existingHistory =
      privSnap.exists && Array.isArray((privSnap.data() || {}).soldHistory) ? (privSnap.data() || {}).soldHistory : [];
    if (existingHistory.length >= 600) {
      throw new functions.https.HttpsError("resource-exhausted", "Sold history limit reached (600).");
    }
    const soldEntry = {
      listingId,
      name: clean(listing.carName || listing.name),
      price: clean(listing.priceLakh || listing.price),
      mileage: clean(listing.mileage),
      transmission: clean(listing.transmission),
      condition: clean(listing.condition),
      city: clean(listing.city),
      soldAt: new Date().toISOString()
    };

    tx.set(
      privRef,
      { soldHistory: existingHistory.concat([soldEntry]), updatedAt: deps.fieldValue.serverTimestamp() },
      { merge: true }
    );
    tx.update(pubRef, {
      carsSold: deps.fieldValue.increment(1),
      updatedAt: deps.fieldValue.serverTimestamp()
    });
    tx.delete(listingRef);
  });

  return { ok: true };
}

exports.syncUserAdminClaim = functions
  .region(FIRESTORE_TRIGGER_REGION)
  .firestore.document("users/{uid}")
  .onWrite((change, context) => syncUserAdminClaimHandler(change, context));

exports.getDealerVerificationDocumentAccess = functions
  .runWith(CALLABLE_RUNTIME)
  .region(REGION)
  .https.onCall((data, context) => getDealerVerificationDocumentAccessHandler(data, context));

exports.saveDealerEmployees = functions
  .runWith(CALLABLE_RUNTIME)
  .region(REGION)
  .https.onCall((data, context) => saveDealerEmployeesHandler(data, context));

exports.upsertDealerListing = functions
  .runWith(CALLABLE_RUNTIME)
  .region(REGION)
  .https.onCall((data, context) => upsertDealerListingHandler(data, context));

exports.deleteDealerListing = functions
  .runWith(CALLABLE_RUNTIME)
  .region(REGION)
  .https.onCall((data, context) => deleteDealerListingHandler(data, context));

exports.setDealerListingAssignment = functions
  .runWith(CALLABLE_RUNTIME)
  .region(REGION)
  .https.onCall((data, context) => setDealerListingAssignmentHandler(data, context));

exports.markListingSold = functions
  .runWith(CALLABLE_RUNTIME)
  .region(REGION)
  .https.onCall((data, context) => markListingSoldHandler(data, context));

exports._test = {
  PLAN_LIMITS,
  getPlanLimits,
  sanitizeEmployees,
  sanitizeListingPayload,
  resolveAssignmentContact,
  syncUserAdminClaimHandler,
  getDealerVerificationDocumentAccessHandler,
  saveDealerEmployeesHandler,
  upsertDealerListingHandler,
  deleteDealerListingHandler,
  setDealerListingAssignmentHandler,
  markListingSoldHandler
};
