# Rafchu

A React/Vite app for Pokémon card search, collections, vendor inventory, deals, expenses, and reporting. Firebase Hosting serves the app; Authentication, Firestore, Storage, and Cloud Functions provide the backend.

## Personal project

- GitHub: `rafchucollects-svg/rafchu_app`
- Firebase / Google Cloud project: `rafchu-tcg-app`
- Deployment account: `rafchucollects@gmail.com`
- Production: https://rafchu-tcg-app.firebaseapp.com

Before pushing or deploying, check `gh auth status` and `firebase login:list`. Use `gh auth switch --user rafchucollects-svg` for this repository. Never use the Supercell GitHub account.

## Development and checks

Use Node 22 and Java 21 (for the Firestore emulator).

```sh
npm ci
npm --prefix functions ci
npm run dev
npm run lint
npm test
npm --prefix functions test
npm run test:rules
npm run build
```

`npm run dev` uses production Firebase unless explicitly configured otherwise. For isolated development, set `VITE_USE_EMULATORS=true` and `VITE_FIREBASE_PROJECT_ID=demo-rafchu-review`, then start the auth, firestore, storage, and functions emulators. Emulator routing includes all four services and HTTP function URLs. Never seed test records into production. On macOS with Homebrew Java, add `/opt/homebrew/opt/openjdk@21/bin` to PATH when starting emulators.

The GitHub workflows run lint, unit tests, backend tests, emulator rules/integration tests, and build before deploying a preview or main to Hosting. Hook-dependency warnings inherited from older screens remain visible; lint errors block deployment.

## Data boundaries

`users`, `collections`, `collector_collections`, and `collector_wishlists` are private owner data. Public pages read allowlisted projections in `public_profiles`, `public_inventories`, and `public_collections`. Functions are their only writers. Marketplace pages are bounded to 12 vendors per request and check live sharing/access before returning records. Wishlist and rating statistics are computed by retry-safe backend projections, without sending individual wishlists to browsers.

Inventory edits use transactions and compare the user's baseline with the latest record. Unrelated changes are preserved; conflicting edits are rejected. Removed cards are retained in the owner's `trash` subcollection and can be restored from Recently deleted. Deals commit their transaction, inventory edits, and pending-deal removal together. Collection cards marked `forTrade` persist in the trade binder.

## Deployment and migration

The public-data migration is additive and restartable. It seeds the verified owner admin record, assigns missing card IDs, and creates public projections. It does not grant vendor access to legacy self-selected vendor profiles.

```sh
node functions/migratePublicData.js --dry-run
firebase deploy --only functions --project rafchu-tcg-app
node functions/migratePublicData.js --apply
node functions/migratePublicData.js --verify
npm run build
firebase deploy --only hosting,firestore:rules,storage --project rafchu-tcg-app
```

For this schema transition, deploy functions before migrating and publish the app/rules only after the migration succeeds. The migration pins its Google Cloud transport to the personal account instead of relying on an unrelated local ADC file. Do not roll back to the old public-read rules; roll forward with a compatible fix if needed. Unrelated archival folders (`temp_restore`, old application copies, mockups) are excluded from current lint/build checks.
