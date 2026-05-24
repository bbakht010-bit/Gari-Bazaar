# App Check rollout (Gari Bazaar)

App Check proves requests come from your real web app, not random scripts hitting Firebase directly.

## 1. Console setup (you do this once)

1. Firebase Console → **App Check** → register your **Web** app.
2. Choose **reCAPTCHA v3** and complete setup.
3. Copy the **site key** (public).
4. Optional: create a **debug token** for localhost/emulator testing.

## 2. Add the site key to the repo

Either:

- Edit `app-check-config.js` and paste the site key, or
- Deploy with env vars:

  ```bash
  set GARI_BAZAAR_APP_CHECK_SITE_KEY=your_site_key_here
  npm run generate:app-check-config
  firebase deploy
  ```

Copy `app-check-config.example.js` if you need a template.

## 3. Deploy

```bash
npm run generate:app-check-config
npm run inject:app-check
firebase deploy
```

When a valid site key is present, **callable Functions** deploy with `enforceAppCheck: true` automatically.

## 4. Verify in the browser

1. Open the live site (hard refresh).
2. Sign in as dealer → add/edit a car, mark sold, save employees.
3. Admin → open a pending application → **View Doc** (verification access).

If callables fail with `failed-precondition` / App Check errors, the site key or Console registration is wrong.

Automated/headless browser tests can be rejected by reCAPTCHA v3 risk scoring. The smoke tests ignore only the App Check token-exchange 403 from `content-firebaseappcheck.googleapis.com`; use a Firebase App Check debug token later if you need full protected E2E dealer/admin flows in CI.

## 5. Turn on Console enforcement (after step 4 works)

Firebase Console → **App Check** → enable enforcement for:

- Cloud Firestore
- Cloud Storage
- Cloud Functions (callable)

Do this only after the web app sends tokens (step 4). Turning enforcement on too early will block all traffic.

## Local / emulator debug

Set in `app-check-config.js`:

```javascript
window.GARI_BAZAAR_APP_CHECK_DEBUG_TOKEN = "your-debug-token-uuid";
```

Register that token in Firebase Console → App Check → **Manage debug tokens**.
