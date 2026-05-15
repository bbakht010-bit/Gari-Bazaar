const test = require("node:test");
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

test("public cannot read dealer verification documents", async () => {
  const testEnv = await getTestEnv();
  const anonStorage = testEnv.unauthenticatedContext().storage();
  await assertFails(anonStorage.ref("dealers/dealer-1/verification/doc.pdf").getDownloadURL());
});

test("verified dealer can upload verification documents to private path", async () => {
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
      suspended: false
    });
  });

  const testEnv = await getTestEnv();
  const dealerStorage = testEnv.authenticatedContext("dealer-1").storage();
  await assertSucceeds(
    dealerStorage
      .ref("dealers/dealer-1/verification/doc.pdf")
      .putString("dealer verification", "raw", { contentType: "application/pdf" })
  );
});
