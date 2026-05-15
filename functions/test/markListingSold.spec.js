const test = require("node:test");
const assert = require("node:assert/strict");
const functions = require("../index.js");
const { createFakeDb, fieldValue } = require("./helpers/fakeDeps");

function createDeps(initialDocs) {
  return {
    db: createFakeDb(initialDocs),
    fieldValue,
    storageBucket: {
      file() {
        return {
          getSignedUrl: async () => ["https://signed.example/doc.pdf"]
        };
      }
    }
  };
}

test("markListingSold rejects unauthenticated requests", async () => {
  await assert.rejects(
    () => functions._test.markListingSoldHandler({ listingId: "listing-1" }, {}, createDeps({})),
    (error) => error && error.code === "unauthenticated"
  );
});

test("markListingSold moves listing into sold history and increments carsSold", async () => {
  const deps = createDeps({
    "users/dealer-1": {
      email: "dealer@example.com",
      role: "dealer",
      dealer: true
    },
    "dealerProfiles/dealer-1": {
      businessName: "Test Dealer",
      ownerName: "Hamza",
      phone: "03001234567",
      whatsapp: "03001234567",
      verificationStatus: "verified",
      suspended: false,
      carsSold: 1
    },
    "dealerPrivate/dealer-1": {
      plan: "free",
      soldHistory: []
    },
    "listings/listing-1": {
      dealerId: "dealer-1",
      carName: "Toyota Aqua",
      priceLakh: "2750000",
      mileage: "45000 km",
      transmission: "Automatic",
      condition: "Used",
      city: "Lahore",
      moderationStatus: "live"
    }
  });

  const result = await functions._test.markListingSoldHandler(
    { listingId: "listing-1" },
    { auth: { uid: "dealer-1", token: {} } },
    deps
  );

  assert.equal(result.ok, true);
  assert.equal(deps.db.__get("listings/listing-1"), undefined);
  assert.equal(deps.db.__get("dealerProfiles/dealer-1").carsSold, 2);
  assert.equal(deps.db.__get("dealerPrivate/dealer-1").soldHistory.length, 1);
  assert.equal(deps.db.__get("dealerPrivate/dealer-1").soldHistory[0].listingId, "listing-1");
});
