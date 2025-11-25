# Rafchu Collects – Project Specification

This document explains how the project is put together, the tools it relies on, and how everything fits from a high-level, human-readable viewpoint.

## Overview
- **Goal**: Provide Pokémon card collectors with a single place to search prices, manage inventory, plan trades/buys, and share a polished public link with potential buyers.
- **Primary audience**: Individual collectors or small teams who want live market data without juggling spreadsheets.
- **Core pillars**: Real-time pricing, friendly inventory management, clear sharing, and approachable language.

## Main Building Blocks
1. **Web application (React + Vite)**  
   - React handles the interactive interface (tabs, forms, cards, animations).  
   - Vite gives quick local development, builds production files, and powers the preview server.
2. **Design system**  
   - TailwindCSS supplies utility classes for layout and theming.  
   - Custom UI components (buttons, cards, inputs, tabs) live in `src/components/ui`.
3. **Data & authentication (Firebase)**  
   - Firebase Auth (Google sign-in) manages logins for owners.  
   - Cloud Firestore stores collections, share settings, history, and metadata.  
   - Firebase Functions (two codebases: `default` and `rafchu_tcg_app`) run server-side tasks when needed.  
   - Realtime Database, Storage, and Remote Config are present for future expansion; storage rules and database rules are already configured.
4. **External pricing feed**  
   - RapidAPI’s CardMarket endpoint powers search and pricing updates. Calls happen client-side with rate limiting handled in code.
5. **Deployment**  
   - Firebase Hosting serves the built site.  
   - Firebase App Hosting is set up but currently blocked by Cloud SQL permission issues.  
   - Firebase Extensions and Data Connect are configured for future features (GraphQL-like access, Cloud SQL).

## Dependencies (Plain Language)
### Runtime
- **react / react-dom** – The interactive UI framework.  
- **firebase** – Talks to Firebase services (Auth, Firestore, Functions).  
- **framer-motion** – Provides animated transitions (e.g., sliding cards, fade-ins).  
- **lucide-react** – Supplies the icon set.  
- **@dataconnect/generated** – Generated helpers for Firebase Data Connect (currently used for early prototypes).

### Development
- **vite** – Local dev server and build tool.  
- **@vitejs/plugin-react** – Makes Vite understand React’s JSX and fast-refresh.  
- **tailwindcss / postcss / autoprefixer** – Styling pipeline and browser-prefix helper.  
- **eslint + plugins** – Keeps code quality consistent.  
- **@types/react / @types/react-dom** – Type hints for better editor support.  
- **@eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals** – Add-on linting rules.

## Project Structure (Key Folders)
- `src/` – Main application code.  
  - `App.jsx` – Single-page app that coordinates tabs, fetching, state, and rendering.  
  - `components/ui/` – Reusable styled components (button, card, input, tabs).  
  - `assets/` – Static images/logos.  
  - `dataconnect-generated/` – Auto-generated Data Connect client files.  
  - `lib/` – Helper utilities (e.g., API wrappers, formatting helpers).  
- `public/` – Static assets copied as-is (favicons, manifest).  
- `functions/` – Firebase Functions sources (with their own `package.json`).  
- `firebase.json`, `firestore.rules`, `storage.rules`, `database.rules.json` – Firebase configuration and security rules.  
- `extensions/`, `dataconnect/`, `remoteconfig.template.json` – Configuration for Firebase Extensions and Data Connect; these support future integrations.  
- `apphosting.yaml`, `apphosting.emulator.yaml` – App Hosting settings (currently blocked at deploy due to Cloud SQL permissions).  
- `Docs/` – Project documentation (roadmap + this spec).

## Build & Deployment Flow
1. **Development** – `npm run dev` to start Vite, browse at `http://localhost:5173`.  
2. **Testing** – `npm run lint` for code quality; manual testing for functionality.  
3. **Build** – `npm run build` produces optimized files in `dist/`.  
4. **Deploy** – `firebase deploy --only hosting` uploads the built assets; full deploy includes rules, functions, and extensions (currently restricted by Cloud SQL credentials).

## Data Model (Simplified)
- **Collections** (Firestore document per user)  
  - `items`: array with card details (entryId, card IDs, pricing snapshots, condition, overrides).  
  - `shareEnabled`: boolean.  
  - `shareUsername`: friendly display name for shared view header.  
  - `history`: rolling list of inventory totals for the trend chart.  
  - `roundUp`: user preference for rounding sales price.  
- **Sharing context**  
  - Public link accepts `?inventory={uid}` plus optional `selected` list.  
  - Read-only view enforces no edits, hides auth buttons, and uses buyer-friendly styling.

## Infrastructure Notes
- **Security**: Firestore, Storage, and Realtime Database rules are in place. Share links show data read-only even if user is logged out.  
- **Continuous live data**: App refreshes pricing roughly every 10 minutes per session to keep numbers from going stale.  
- **History tracking**: Inventory changes push new totals into Firestore, capped to recent entries to avoid growth.  
- **App Hosting**: Configured but not yet active; requires Cloud SQL permission fix before going live.

## Future Considerations
- **Share-selected filtering** – Parse selected IDs server-side or client-side to customise share pages.  
- **Bulk operations** – Plan for import/export and trade/buy sync.  
- **Team support** – Add role-based access if multiple collectors need to collaborate.  
- **App Hosting rollout** – Resolve Cloud SQL access to use Firebase’s new App Hosting stack for automated builds.

## How to Contribute
1. Install dependencies: `npm install`.  
2. Run `npm run dev` for local changes.  
3. Use `npm run lint` before committing.  
4. Keep buyer-facing copy and colours inviting; continue using plain language in UI and docs.  
5. When adding features, update the Roadmap and this spec to reflect new dependencies or flows.
