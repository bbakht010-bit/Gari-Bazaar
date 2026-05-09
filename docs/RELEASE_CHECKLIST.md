# Pre-release checklist (human steps)

Run this before or right after `firebase deploy` when you want a **production-ready** cut. Items an AI or Playwright **cannot** fully verify for you.

## Firebase Console

- [ ] **Project** matches [`firebase-client.js`](../firebase-client.js) (`projectId`, `storageBucket`) and [`.firebaserc`](../.firebaserc).
- [ ] **Authorized domains** include your Hosting domain(s) and any preview channels you use for Auth redirects.
- [ ] **Firestore** + **Storage** rules deployed (`firebase deploy --only firestore:rules,storage` or full deploy).
- [ ] No pending **Firestore index build errors** in Console; [`firestore.indexes.json`](../firestore.indexes.json) is deployed.
- [ ] **Functions** deployed in **`asia-south1`** ([`firebase-client.js`](../firebase-client.js) `FIREBASE_FUNCTIONS_REGION`; [`functions/index.js`](../functions/index.js)).
- [ ] **App Check**: Either enforced for Storage/Firestore with reCAPTCHA v3 keys in SDK, **or** explicitly documented as deferred (dev-only risk).

## Hosting & QA

- [ ] `npm run check:stable-urls` passes locally.
- [ ] `npm run test:e2e` passes against release URL (`BASE_URL=…` or default in [`playwright.config.js`](../playwright.config.js)).
- [ ] GitHub Actions **CI** green (stable URLs + Playwright). Optional repo variable **`E2E_BASE_URL`**; secrets **`E2E_DEALER_EMAIL`** / **`E2E_DEALER_PASSWORD`** for Tier 2 in CI ([`docs/E2E_DEALER_SETUP.md`](./E2E_DEALER_SETUP.md)).
- [ ] Dealer Tier 2 secrets (if configured) reference a disposable **verified** dealer only—not real customers.

## Product / ops

- [ ] Rollback known: Hosting previous release revision or CLI rollback path.
- [ ] Support inbox / mailto targets in [`contact.html`](../contact.html) still correct.

See also [capability-matrix.md](./capability-matrix.md) for full feature coverage.
