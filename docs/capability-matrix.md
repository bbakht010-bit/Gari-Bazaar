# Gari Bazaar — capability × backend matrix (test index)

Use this table as the **authoritative checklist** when adding Playwright specs or manual QA. Test IDs (`TC-*`) tie to assertions in automated suites where noted.

## Matrix

| ID | Capability | Surfaces | Firebase / backend |
|----|-------------|----------|---------------------|
| TC-PUB-01 | Homepage entry | [`index.html`](../index.html) | Firestore reads (featured paths) |
| TC-PUB-02 | Browse listings | [`listings.html`](../listings.html) | Firestore `listings` query; composite indexes |
| TC-PUB-03 | Stable car detail URLs | listings → [`car-detail.html`](../car-detail.html) | Query params contract (see `scripts/check-stable-urls.mjs`) |
| TC-PUB-04 | Dealer directory | [`dealers.html`](../dealers.html) | Firestore `dealerProfiles`, `listings` counts |
| TC-PUB-05 | Dealer profile + inventory | [`dealer-profile.html`](../dealer-profile.html) | Firestore reads |
| TC-PUB-06 | Car detail page | [`car-detail.html`](../car-detail.html) | Firestore read `listings/{id}` |
| TC-PUB-07 | Legal / static | [`terms.html`](../terms.html), [`privacy.html`](../privacy.html), [`about.html`](../about.html) | Hosting only |
| TC-PUB-08 | Contact (mailto) | [`contact.html`](../contact.html) | None (client mailto) |
| TC-PUB-09 | 404 | [`404.html`](../404.html) | Hosting only |
| TC-BUY-01 | Buyer signup | [`buyer-signup.html`](../buyer-signup.html) | Auth `createUser`, `users`, `buyerProfiles` rules |
| TC-BUY-02 | Buyer login | [`buyer-login.html`](../buyer-login.html) | Auth |
| TC-BUY-03 | Buyer profile CRUD | [`buyer-profile.html`](../buyer-profile.html) | Auth + `buyerProfiles` rules |
| TC-DEAL-01 | Dealer login / redirect | [`dealer-login.html`](../dealer-login.html) | Auth + profile routing |
| TC-DEAL-02 | Dealer registration | [`register.html`](../register.html) | Auth, Storage `dealers/...`, `dealerProfiles`, `dealerChangeRequests` |
| TC-DEAL-03 | Pending state | [`dealer-application-pending.html`](../dealer-application-pending.html) | Firestore read profile |
| TC-DEAL-04 | Onboarding redirect | [`dealer-onboarding.html`](../dealer-onboarding.html) | None |
| TC-DEAL-05 | Dashboard inventory | [`dealer-dashboard.html`](../dealer-dashboard.html) | Firestore listings CRUD, `dealerProfiles` employees |
| TC-DEAL-06 | Listing images | dashboard | Storage `listings/{uid}/{id}/...`, rules |
| TC-DEAL-07 | Mark sold | dashboard | Callable `markListingSold` (region `asia-south1`) + client transaction fallback |
| TC-DEAL-08 | Profile picture | dashboard | Storage `dealers/{uid}/profile/...` |
| TC-ADM-01 | Admin login | [`admin-login.html`](../admin-login.html) | Auth + `users.role == admin` |
| TC-ADM-02 | Admin console | [`admin.html`](../admin.html) | Firestore admin-gated reads/writes |

## Automated coverage map (current)

| Test ID | Suite | File |
|---------|--------|------|
| TC-PUB-01 | Tier 1 | [`tests/smoke.spec.js`](../tests/smoke.spec.js) |
| TC-PUB-02, TC-PUB-03 | Tier 1 | [`tests/smoke.spec.js`](../tests/smoke.spec.js) |
| TC-PUB-* (routes + console) | Tier 1 | [`tests/smoke.spec.js`](../tests/smoke.spec.js) |
| TC-DEAL-05 … TC-DEAL-07 | Tier 2 (optional env) | [`tests/dealer.e2e.spec.js`](../tests/dealer.e2e.spec.js) |

## Related docs

- [E2E dealer setup](./E2E_DEALER_SETUP.md) — Console test account for Tier 2.
- [Emulator basics](./EMULATOR.md) — local Firebase Emulator ports (`npm run emulators`).
- [Release checklist](./RELEASE_CHECKLIST.md) — human pre-deploy steps.

Expand the automated coverage rows as new specs land.

