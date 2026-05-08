# GariBazaar

Static multi-page car marketplace built on Firebase (Hosting, Auth, Firestore, Storage, Functions).

## What This Project Does

- Lets buyers browse verified dealer inventory.
- Lets dealers onboard, manage listings, and track sold history.
- Lets admins approve dealers, moderate listings, and process dealer change requests.
- Keeps listing/dealer URLs stable using ID-only query parameters.

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript (no bundler).
- Firebase Auth: buyer, dealer, admin login and role gating.
- Firestore: users, profiles, listings, moderation/change-request data.
- Firebase Storage: dealer/listing images and verification docs.
- Firebase Functions: trusted server-side sold-listing mutation.
- Testing/CI: Playwright smoke tests, Lighthouse CI, URL guard checks.
- Monitoring: Sentry browser SDK bootstrapped from runtime config.

## Key Runtime Files

- `firebase-client.js` - Firebase init and shared auth/profile/storage helpers.
- `marketplace-firestore.js` - ID builders, data normalization, and fetch helpers.
- `url-utils.js` - Stable/canonical URL helpers (`listingId`, `dealerId` only).
- `theme.js` - Theme toggle and Sentry bootstrap.
- `sentry-config.json` - Runtime Sentry config (set DSN to enable).

## Pages and Responsibilities

- `index.html` - Homepage with live stats and featured listings.
- `listings.html` - Main catalog with filtering/search/sort.
- `car-detail.html` - Listing details hydrated from IDs and Firestore.
- `dealers.html` - Verified dealer directory.
- `dealer-profile.html` - Dealer profile and active inventory.
- `buyer-signup.html`, `buyer-login.html`, `buyer-profile.html` - Buyer auth/profile flows.
- `dealer-login.html`, `register.html`, `dealer-application-pending.html`, `dealer-dashboard.html` - Dealer auth/onboarding/dashboard flows.
- `admin-login.html`, `admin.html` - Admin access and moderation controls.
- `about.html`, `contact.html`, `privacy.html`, `terms.html` - Static policy/info pages.

## Firestore Collections

- `users` - role/email for each authenticated user.
- `buyerProfiles` - buyer profile data.
- `dealerProfiles` - public dealer profile + verification status.
- `dealerPrivate` - private dealer fields (CNIC, sold history).
- `listings` - live inventory and listing metadata.
- `dealerChangeRequests` - admin-reviewed dealer profile changes.

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

- Firestore rules: `firestore.rules`
- Storage rules: `storage.rules`
- Functions source: `functions/` (`markListingSold` callable in `functions/index.js`)

## Local Commands

- `npm run check:stable-urls` - fails on URL payload regressions.
- `npm run test:e2e` - Playwright smoke tests.
- `npm run deploy:rules` - deploy Firestore/Storage rules.
- `npm run deploy` - full Firebase deploy.

## CI Workflows

- `.github/workflows/e2e-smoke.yml` - runs Playwright smoke tests.
- `.github/workflows/lighthouse-ci.yml` - runs Lighthouse checks on key pages.

## Sentry Setup

Edit `sentry-config.json`:

- Set `dsn` to your Sentry Browser DSN.
- Keep low sample rates unless actively profiling traffic.

If DSN is empty, Sentry stays disabled safely.

## Maintainer Notes

- `admin-login.html` currently ensures a user record before admin role checks.
- Buyer avatar is stored as Data URL in Firestore profile docs.
- `firestore.indexes.json` is currently empty; add indexes if new compound queries require them.
