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

function dealerContext(uid = "dealer-1") {
  return { auth: { uid, token: {} } };
}

function verifiedDealerDocs(privateData = {}) {
  return {
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
      suspended: false
    },
    "dealerPrivate/dealer-1": {
      plan: "free",
      employees: [],
      ...privateData
    }
  };
}

test("free-tier dealer cannot create more active listings than allowed", async () => {
  const deps = createDeps({
    ...verifiedDealerDocs(),
    "listings/listing-1": {
      dealerId: "dealer-1",
      moderationStatus: "live"
    },
    "listings/listing-2": {
      dealerId: "dealer-1",
      moderationStatus: "live"
    }
  });

  await assert.rejects(
    () =>
      functions._test.upsertDealerListingHandler(
        {
          listingId: "listing-3",
          carName: "Toyota Aqua",
          price: "2750000",
          mileage: "45000 km",
          transmission: "Automatic",
          condition: "Used",
          city: "Lahore",
          paintStatus: "original",
          carImages: ["https://example.com/car.jpg"],
          coverImage: "https://example.com/car.jpg"
        },
        dealerContext(),
        deps
      ),
    (error) => error && error.code === "resource-exhausted"
  );
});

test("listing save rejects assignment to an employee outside the dealer account", async () => {
  const deps = createDeps(
    verifiedDealerDocs({
      employees: [
        {
          id: "emp-1",
          name: "Ali",
          role: "Sales Executive",
          phone: "03001111111",
          whatsapp: "03001111111"
        }
      ]
    })
  );

  await assert.rejects(
    () =>
      functions._test.upsertDealerListingHandler(
        {
          listingId: "listing-1",
          carName: "Honda City",
          price: "3100000",
          mileage: "52000 km",
          transmission: "Manual",
          condition: "Used",
          city: "Islamabad",
          paintStatus: "original",
          assigneeId: "missing-employee",
          carImages: ["https://example.com/car.jpg"],
          coverImage: "https://example.com/car.jpg"
        },
        dealerContext(),
        deps
      ),
    (error) => error && error.code === "invalid-argument"
  );
});
