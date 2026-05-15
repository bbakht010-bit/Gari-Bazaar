const test = require("node:test");
const assert = require("node:assert/strict");
const functions = require("../index.js");
const { createFakeDb, fieldValue } = require("./helpers/fakeDeps");

function createDeps(initialDocs, signedUrl = "https://signed.example/doc.pdf") {
  return {
    db: createFakeDb(initialDocs),
    storageBucket: {
      file(pathValue) {
        return {
          getSignedUrl: async () => [`${signedUrl}?path=${encodeURIComponent(pathValue)}`]
        };
      }
    },
    fieldValue
  };
}

test("admin gets signed access URL for dealer verification document", async () => {
  const deps = createDeps({
    "dealerPrivate/dealer-1": {
      verificationDocument: {
        storagePath: "dealers/dealer-1/verification/doc.pdf",
        fileName: "doc.pdf"
      }
    }
  });

  const result = await functions._test.getDealerVerificationDocumentAccessHandler(
    { dealerId: "dealer-1" },
    { auth: { uid: "admin-1", token: { admin: true } } },
    deps
  );

  assert.equal(result.ok, true);
  assert.match(result.url, /^https:\/\/signed\.example\/doc\.pdf/);
  assert.equal(result.fileName, "doc.pdf");
});

test("non-admin cannot fetch dealer verification document access", async () => {
  const deps = createDeps({
    "users/dealer-1": {
      email: "dealer@example.com",
      role: "dealer",
      dealer: true
    },
    "dealerPrivate/dealer-1": {
      verificationDocument: {
        storagePath: "dealers/dealer-1/verification/doc.pdf",
        fileName: "doc.pdf"
      }
    }
  });

  await assert.rejects(
    () =>
      functions._test.getDealerVerificationDocumentAccessHandler(
        { dealerId: "dealer-1" },
        { auth: { uid: "dealer-1", token: {} } },
        deps
      ),
    (error) => error && error.code === "permission-denied"
  );
});
