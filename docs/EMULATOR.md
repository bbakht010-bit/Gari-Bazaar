# Firebase Emulator Suite (optional)

[`firebase.json`](../firebase.json) defines emulator ports so you can run **Auth, Firestore, Storage, Functions, and Hosting** locally without touching production.

## Start emulators

```bash
npx firebase-tools@latest emulators:start --only auth,firestore,storage,functions,hosting
```

Use **`http://localhost:5000`** as `BASE_URL` for Playwright when your static hosting is emulator-backed (requires matching project config / rules deploy to emulator UI).

## Notes

- Emulator data is ephemeral unless you configure import/export (`--import` / `--export`).
- Hosting emulator serves this repo root; **`functions`** require build (`npm run build` inside `functions/` if you use TypeScript)—this project uses Node `index.js` only.
- Use the Emulator UI (`http://localhost:4000` by default per `firebase.json`) to seed dealers/listings manually for deeper tests.
