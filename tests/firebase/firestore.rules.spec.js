const test = require("node:test");
const assert = require("node:assert/strict");
const { assertFails, assertSucceeds, getTestEnv, seedFirestore } = require("./helpers/testEnv");

test.before(async () => {
  await getTestEnv();
});

test.after(async () => {
  const testEnv = await getTestEnv();
  await testEnv.cleanup();
});

test.beforeEach(async () => {
  const testEnv = await getTestEnv();
  await testEnv.clearFirestore();
});

test("public cannot read dealerPrivate documents", async () => {
  await seedFirestore(async (db) => {
    await db.collection("dealerPrivate").doc("dealer-1").set({
      ownerCnic: "35202-1234567-1",
      plan: "free"
    });
  });

  const testEnv = await getTestEnv();
  const anonDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(anonDb.collection("dealerPrivate").doc("dealer-1").get());
});

test("admin can read dealerPrivate documents", async () => {
  await seedFirestore(async (db) => {
    await db.collection("users").doc("admin-1").set({
      email: "admin@example.com",
      role: "admin"
    });
    await db.collection("dealerPrivate").doc("dealer-1").set({
      ownerCnic: "35202-1234567-1",
      plan: "free"
    });
  });

  const testEnv = await getTestEnv();
  const adminDb = testEnv.authenticatedContext("admin-1", { admin: true }).firestore();
  await assertSucceeds(adminDb.collection("dealerPrivate").doc("dealer-1").get());
});

test("dealer cannot write leaked verification fields to public dealerProfiles", async () => {
  await seedFirestore(async (db) => {
    await db.collection("users").doc("dealer-1").set({
      email: "dealer@example.com",
      role: "dealer",
      dealer: true
    });
    await db.collection("dealerProfiles").doc("dealer-1").set({
      businessName: "Test Dealer",
      ownerName: "Hamza",
      phone: "03001234567",
      city: "Lahore",
      address: "Main Road",
      verificationStatus: "verified",
      suspended: false,
      carsSold: 0
    });
  });

  const testEnv = await getTestEnv();
  const dealerDb = testEnv.authenticatedContext("dealer-1").firestore();
  await assertFails(
    dealerDb.collection("dealerProfiles").doc("dealer-1").set({
      businessName: "Test Dealer",
      ownerName: "Hamza",
      phone: "03001234567",
      city: "Lahore",
      address: "Main Road",
      verificationStatus: "verified",
      suspended: false,
      carsSold: 0,
      registrationDocumentUrl: "https://example.com/doc.pdf"
    })
  );
});

test("dealer cannot directly write sold history or private employees", async () => {
  await seedFirestore(async (db) => {
    await db.collection("users").doc("dealer-1").set({
      email: "dealer@example.com",
      role: "dealer",
      dealer: true
    });
    await db.collection("dealerPrivate").doc("dealer-1").set({
      plan: "free",
      soldHistory: [],
      employees: []
    });
  });

  const testEnv = await getTestEnv();
  const dealerDb = testEnv.authenticatedContext("dealer-1").firestore();
  await assertFails(
    dealerDb.collection("dealerPrivate").doc("dealer-1").set(
      {
        plan: "free",
        soldHistory: [{ listingId: "l1" }],
        employees: [{ id: "emp-1", name: "Ali", role: "Sales", phone: "03001111111", whatsapp: "03001111111" }]
      },
      { merge: true }
    )
  );
});

test("dealer cannot create listing documents directly anymore", async () => {
  await seedFirestore(async (db) => {
    await db.collection("users").doc("dealer-1").set({
      email: "dealer@example.com",
      role: "dealer",
      dealer: true
    });
    await db.collection("dealerProfiles").doc("dealer-1").set({
      businessName: "Test Dealer",
      ownerName: "Hamza",
      phone: "03001234567",
      city: "Lahore",
      address: "Main Road",
      verificationStatus: "verified",
      suspended: false,
      carsSold: 0
    });
  });

  const testEnv = await getTestEnv();
  const dealerDb = testEnv.authenticatedContext("dealer-1").firestore();
  await assertFails(
    dealerDb.collection("listings").doc("listing-1").set({
      dealerId: "dealer-1",
      dealerName: "Test Dealer",
      carName: "Toyota Aqua",
      priceLakh: "2750000",
      price: "2750000",
      mileage: "45000 km",
      transmission: "Automatic",
      condition: "Used",
      city: "Lahore",
      contactName: "Hamza",
      contactRole: "Owner",
      phone: "03001234567",
      moderationStatus: "live",
      carImages: ["https://example.com/car.jpg"],
      features: []
    })
  );
});
