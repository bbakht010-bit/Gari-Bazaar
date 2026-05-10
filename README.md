# GariBazaar

Static Firebase Hosting site for verified dealer listings in Pakistan: buyers browse live inventory; dealers onboard, upload media, and manage dashboards through Firebase Auth, Firestore, and Storage.

## Quick start (new developer)

1. **Install tools**
   - [Node.js 20](https://nodejs.org/) (matches GitHub Actions; avoid relying on mismatched npm lockfiles).
   - Firebase CLI: `npm install -g firebase-tools`, then `firebase login`.

2. **Clone and install**

   ```bash
   git clone <your-repo-url>
   cd Gari-Bazaar
   npm ci
   ```

   If `npm ci` fails with “lock file out of sync”, run `npm install` once, commit `package-lock.json`, then use `npm ci` again.

3. **Firebase project**

   - Create or select a Firebase project whose config matches `firebase-client.js` (or replace with your project’s web app snippet from **Project settings → Your apps**).
   - Enable **Authentication** (Google/email as needed), **Firestore**, **Storage**, and **Hosting** when you migrate to your own project.

4. **Run checks (same as CI)**

   ```bash
   npm ci
   npm run check:stable-urls
   npm run check:login-ux
   npm run test:e2e
   ```

   Tier 1 E2E tests hit production `BASE_URL` from `playwright.config.js` unless you override env `BASE_URL` / GitHub variable `E2E_BASE_URL`. Tier 2 dealer flows may need `E2E_DEALER_EMAIL` / `E2E_DEALER_PASSWORD` in CI secrets.

## Theming & new pages

- **Global palette & fonts** live in **`brand.css`** (loaded by every root `*.html`). Use warm greens, `--page-bg`, and **Plus Jakarta Sans**; **`lang="ur"`** / **`lang="ur-PAK"`** can use **Noto Nastaliq Urdu** from the same sheet.
- **`theme.css`** adds shared radii, light/dark toggle behaviour, and small layout polish.
- **Adding a new HTML page:** run `python scripts/apply-brand-to-html.py` so the file gets `<link rel="stylesheet" href="brand.css">` and drops a duplicate inline `:root { … }` block. Then keep page-specific rules in that page’s `<style>` using the existing CSS variables (`--green-main`, `--gray-600`, etc.).

## Deploy (production)

**Important:** `firebase deploy --only hosting` updates the website only. It does **not** publish Firestore rules, Storage rules, or Cloud Functions.

| Goal | Command |
|------|---------|
| Site (HTML, JS, CSS, `brand.css`) | `firebase deploy --only hosting` |
| Firestore + Storage rules only | `npm run deploy:rules` or `firebase deploy --only firestore:rules,storage` |
| Everything in `firebase.json` | `npm run deploy` or `firebase deploy` |

Hosting predeploy runs `check:stable-urls` and `check:login-ux`; fix failures before the deploy finishes.

## Custom domain & auth (checklist)

Use this when `*.web.app` works but your own domain misbehaves (login, uploads, or stale UI).

1. **Firebase Console → Authentication → Settings → Authorized domains**  
   Add your apex and `www` hostnames (e.g. `garibazaarpk.com`, `www.garibazaarpk.com`).

2. **Google Cloud Console → APIs & Services → Credentials → Web client (auto-created for Firebase)**  
   Under **Authorized JavaScript origins**, add `https://your-domain` and `https://www.your-domain` if you use `www`.  
   Under **Authorized redirect URIs**, include Firebase handler URLs, e.g. `https://<project>.firebaseapp.com/__/auth/handler`, `https://<project>.web.app/__/auth/handler`, and `https://your-domain/__/auth/handler` (and `www` if needed).

3. **Sessions**  
   Sign-in state is **per origin**. Logging in on `*.firebaseapp.com` does not log you in on your custom domain until you sign in there too.

4. **CDN**  
   If Cloudflare (or similar) fronts your domain, purge cache after deploys or use short HTML cache; otherwise you may see old JS/HTML.

## Dealer uploads & Storage

- Dealer application uploads require **Storage rules** deployed and a Firestore **`users/{uid}`** document with **`dealer: true`** or **`role: "dealer"`** (see `storage.rules` and `firebase-client.js` `prepareDealerStorageWrites`).
- After changing **`storage.rules`**, run `firebase deploy --only storage` (not only Hosting).

## Local emulators (optional)

```bash
npm run emulators
```

Uses ports from `firebase.json` (Hosting 5000, etc.). Wire `firebase-client.js` or env to emulator hosts only when developing against emulators.

## Useful scripts

| Script | Purpose |
|--------|---------|
| `npm run check:stable-urls` | Guard for stable internal URLs |
| `npm run check:login-ux` | Login/signup UX invariants |
| `npm run test:e2e` | Playwright smoke tests |
| `npm run deploy:rules` | Firestore + Storage rules |
| `npm run deploy` | Full Firebase deploy per `firebase.json` |

## Repo layout (short)

- **`firebase-client.js`** — Firebase init, Auth helpers, Storage upload helpers.
- **`url-utils.js`**, **`theme.js`**, **`theme.css`**, **`brand.css`** — routing helpers, theme toggle, shared UI.
- **`functions/`** — Firebase Cloud Functions (if used in your project).
- **`tests/`** — Playwright specs.
