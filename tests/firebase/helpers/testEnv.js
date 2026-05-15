const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");

let testEnvPromise = null;

function repoFile(name) {
  return path.join(__dirname, "..", "..", "..", name);
}

async function getTestEnv() {
  if (!testEnvPromise) {
    testEnvPromise = initializeTestEnvironment({
      projectId: "gari-bazaar-rules-test",
      firestore: {
        rules: fs.readFileSync(repoFile("firestore.rules"), "utf8")
      },
      storage: {
        rules: fs.readFileSync(repoFile("storage.rules"), "utf8")
      }
    });
  }
  return testEnvPromise;
}

async function seedFirestore(seedFn) {
  const testEnv = await getTestEnv();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await seedFn(context.firestore());
  });
}

module.exports = {
  assertFails,
  assertSucceeds,
  getTestEnv,
  seedFirestore
};
