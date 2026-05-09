# GariBazaar

Static multi-page car marketplace built on Firebase (Hosting, Auth, Firestore, Storage, Functions).

## What This Project Does

- Lets buyers browse verified dealer inventory.
- Lets dealers onboard, manage listings, and track sold history.
- Lets admins approve dealers, moderate listings, process dealer change requests, suspend dealers (and remove their listings), or fully delete a dealership record.
- Uses **email verification** for password sign-ups before buyers or dealers can continue (Firebase `sendEmailVerification`).
- Keeps listing/dealer URLs stable using ID-only query parameters.

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript (no bundler).
- Firebase Auth: buyer, dealer, admin login and role gating.
- Firestore: users, profiles, listings, moderation/change-request data.
- Firebase Storage: dealer/listing images and verification docs.
- Firebase Functions: callable `markListingSold` and Firestore-triggered `syncUserAdminClaim` (admin custom claims).
- Testing/CI: Playwright smoke tests, Lighthouse CI, URL guard checks.
- Monitoring: Sentry browser SDK bootstrapped from runtime config.

## Key Runtime Files

- `firebase-client.js` - Firebase init, shared auth/profile/storage helpers, role helpers (`userHasBuyerAccess`, `userHasDealerAccess`, `userIsAdmin`, `verifyFirebaseAdminAccess`), post-login paths, email verification helpers.
- `marketplace-firestore.js` - ID builders, data normalization, and fetch helpers.
- `url-utils.js` - Stable/canonical URL helpers (`listingId`, `dealerId` only).
- `theme.js` - Theme toggle and Sentry bootstrap.
- `sentry-config.json` - Runtime Sentry config (set DSN to enable).

## Authentication and Roles

### Email verification

- After email/password sign-up, users are sent to `verify-email.html` until `emailVerified` is true.
- Google sign-in users are usually already verified; the same gate still applies if not.

### Same email: buyer and dealer

- Firebase allows **one Auth user per email**. The app supports **both** buyer and dealer access on that account using `users/{uid}` fields:
  - **`role`**: legacy primary role string (`buyer`, `dealer`, or `admin`).
  - **`buyer`**, **`dealer`**: booleans for capabilities (e.g. buyer first, then dealer login adds `dealer: true` without removing buyer access).
- Helpers in `firebase-client.js` decide portal access; Firestore/Storage rules treat `role == "dealer"` **or** `dealer == true` as dealer access.

### Admin access

- **Only** users with Firestore `users/{uid}.role == "admin"` (set in **Firebase Console** or Admin SDK—never from the public client create/update rules for self-serve promotion to admin).
- `admin-login.html` and `admin.html` use **`verifyFirebaseAdminAccess()`** (refreshes ID token + reads Firestore).
- **Custom claim `admin`**: Cloud Function **`syncUserAdminClaim`** watches `users/{uid}` and syncs `admin: true/false` on the Auth user. Firestore rules allow admin operations if **`request.auth.token.admin`** **or** Firestore role is admin (covers propagation delay).
- Rules block normal users from changing their own document to **`role: admin`** (`ownerEscalatesToAdmin`).
- Admin pages include **`noindex`** meta to reduce casual discovery (not a substitute for Console-side grants).

## Pages and Responsibilities

- `index.html` - Homepage with live stats and featured listings.
- `listings.html` - Main catalog with filtering/search/sort.
- `car-detail.html` - Listing details hydrated from IDs and Firestore.
- `dealers.html` - Verified dealer directory.
- `dealer-profile.html` - Dealer profile and active inventory.
- `buyer-signup.html`, `buyer-login.html`, `buyer-profile.html` - Buyer auth/profile flows.
- `dealer-login.html`, `register.html`, `dealer-application-pending.html`, `dealer-dashboard.html` - Dealer auth/onboarding/dashboard flows.
- `verify-email.html` - Pending email verification; resend / continue after verify.
- `admin-login.html`, `admin.html` - Admin gateway and moderation dashboard.
- `about.html`, `contact.html`, `privacy.html`, `terms.html` - Static policy/info pages.

## Firestore Collections

- `users` - `email`, `role`, optional **`buyer`** / **`dealer`** flags, timestamps. Admin rows use `role: "admin"` (grant only via Console/Admin SDK).
- `buyerProfiles` - buyer profile data.
- `dealerProfiles` - public dealer profile + verification status.
- `dealerPrivate` - private dealer fields (CNIC, sold history).
- `listings` - live inventory and listing metadata (`dealerId` links to dealer UID).
- `dealerChangeRequests` - admin-reviewed dealer profile changes.

## Admin Panel Behavior

- **Suspend** dealer: confirms, **deletes all `listings`** with `dealerId` matching that dealer, then sets `suspended` on `dealerProfiles`.
- **Delete dealer**: confirms, deletes listings, **`dealerChangeRequests`** for that dealer, then **`dealerPrivate`**, **`dealerProfiles`**, **`users/{uid}`**. Does **not** delete the Firebase Authentication user (do that in Console if needed). Listing **Storage** images may remain unless cleaned separately.

## Storage Paths

- `dealers/{dealerId}/profile/*`
- `dealers/{dealerId}/verification/*`
- `dealers/{dealerId}/gallery/*`
- `listings/{dealerId}/{listingId}/*`

## URL Contract (Important)

- Car details: `car-detail?listingId=<id>&dealerId=<id>`
- Dealer profile: `dealer-profile?dealerId=<id>`
- Do not put mutable listing payload (price/contact/panel marks/etc.) in URLs.
- Legacy shared links are canonicalized to the ID-only format at runtime.

## Security and Rules

- Firestore rules: `firestore.rules` (`isAdmin`, `hasDealerAccess`, anti–self-promotion to admin on `users` updates).
- Storage rules: `storage.rules` (dealer uploads require dealer access consistent with Firestore).
- Functions: `functions/index.js`
  - **`markListingSold`** - HTTPS callable, region **`asia-south1`** (trusted sold-path mutation).
  - **`syncUserAdminClaim`** - Firestore **`users/{uid}`** write trigger; deployed in **`us-central1`** so it matches the default Firestore database region used by Cloud Functions Gen1 triggers. If your Firestore database is in another region, adjust `FIRESTORE_TRIGGER_REGION` in `functions/index.js` and redeploy.

## Local Commands

- `npm run check:stable-urls` - fails on URL payload regressions.
- `npm run check:login-ux` - login/signup UX guard (runs on `firebase deploy` via `predeploy`).
- `npm run test:e2e` - Playwright smoke tests.
- `npm run deploy:rules` - deploy Firestore/Storage rules only.
- `npm run deploy` - full Firebase deploy (`predeploy` checks first).
- `npm run wipe:dev-auth` - **destructive**: bulk-delete Auth users (see `scripts/wipe-dev-auth.mjs`); optional `--also-firestore` to wipe main collections. Requires **`GOOGLE_APPLICATION_CREDENTIALS`** and `--confirm <projectId>`.

### Functions folder

- Before deploying Cloud Functions, install deps: **`cd functions && npm install`**.

## CI Workflows

- `.github/workflows/e2e-smoke.yml` - Playwright smoke tests.
- `.github/workflows/lighthouse-ci.yml` - Lighthouse checks on key pages.

## Sentry Setup

Edit `sentry-config.json`:

- Set `dsn` to your Sentry Browser DSN.
- Keep low sample rates unless actively profiling traffic.

If DSN is empty, Sentry stays disabled safely.

## Maintainer Notes

- Grant **admin** only by editing **`users/{uid}`** in Firestore (set `role` to `"admin"`). After deploy of **`syncUserAdminClaim`**, the user may need a fresh sign-in so the **`admin`** custom claim appears on the token.
- `ensureUserRecord(uid, email, null)` on admin login syncs email only and does **not** grant dealer/buyer capabilities.
- Buyer avatar is stored as Data URL in Firestore profile docs.
- `firestore.indexes.json` may gain compound indexes if new queries require them; deploy indexes when Firestore prompts.
