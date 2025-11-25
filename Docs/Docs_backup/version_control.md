# Version Control Log

## 2025-10-10

- Added vendor marketplace tab with profile management, active listing toggle, and directory view.
- Introduced vendor rating + review workflow with Firestore aggregation and reusable star rating component.
- Updated shared UI helpers (imports, rating widgets) to support marketplace features without impacting existing inventory tooling.
- Optimized card search calls with 12h local caching, limited default suggestions, memoized detail fetches, and CSV import reuse to preserve API quota.
- Fixed Insights summary crash (undefined `invTotals`) that caused the app to render a blank page post-deploy.
- Added graceful Firestore permission handling so logged-in users now see helpful messaging instead of a blank screen when reads are denied (collection + marketplace directory).

### Files

- `src/App.jsx`
- `Docs/version_control.md`

### Verification

- `npm run build`
