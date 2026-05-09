# Tier 2 Playwright dealer E2E (optional)

Runs only when **`E2E_DEALER_EMAIL`** and **`E2E_DEALER_PASSWORD`** are set in the environment.

## Requirements

Use a Firebase Auth user that:

1. Has role **dealer** in Firestore (`users/{uid}.role`).
2. Has **complete** dealer profile (`isDealerProfileComplete` passes on [`register.html`](../register.html) fields).
3. Has **`verificationStatus`** **`verified`** or **`approved`** in `dealerProfiles/{uid}` (otherwise login redirects away from `/dealer-dashboard`).

Recommendation: dedicated **staging / disposable** dealer account—not a production customer.

## Local run

```bash
set E2E_DEALER_EMAIL=your-bot@example.com
set E2E_DEALER_PASSWORD=***
set BASE_URL=https://gari-bazaar.web.app
npx playwright test
```

(On PowerShell use `$env:E2E_DEALER_EMAIL='...'`)

Playwright saves session to `tests/.auth/dealer.json` (gitignored).

## CI

Add repository secrets `E2E_DEALER_EMAIL` and `E2E_DEALER_PASSWORD` if you want dealer tests on every run. Omit them and CI runs **Tier 1 only**.

Optional: Actions variable **`E2E_BASE_URL`** sets `BASE_URL` for the E2E step in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). If unset or empty, [`playwright.config.js`](../playwright.config.js) uses its default hosted URL.
