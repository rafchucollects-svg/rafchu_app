# Rebuild Prompt

Copy and paste the prompt below when starting a new conversation with an AI model. Attach `PRODUCT_DESCRIPTION.md` as context.

---

## The Prompt

```
I'm attaching a comprehensive product description for a Pokémon TCG web application called "Rafchu." This document describes every feature, data model, API integration, Cloud Function, security rule, and UI pattern in the existing app.

I want to rebuild this application from scratch with a modern, production-grade architecture. Here are my requirements:

**Tech Stack (you may suggest alternatives if you can justify them):**
- Frontend: React 19+ with TypeScript, Vite, Tailwind CSS v4, React Router v7
- State management: Zustand (replace the monolithic React Context)
- UI components: shadcn/ui (already partially used — formalize it)
- Backend: Firebase (Auth, Firestore, Cloud Functions v2, Storage, Hosting)
- Testing: Vitest + React Testing Library

**Architecture Priorities:**
1. TypeScript throughout — strict mode, no `any` types
2. Firestore subcollections instead of arrays-in-documents for scalability
3. Proper separation of concerns: hooks for data fetching, stores for state, components for UI
4. Mobile-first responsive design with dark mode toggle
5. Optimistic UI updates with proper error handling
6. Pagination and virtual scrolling for large collections
7. Offline support via Firestore persistence
8. Role-based access using Firebase custom claims (not hardcoded emails)
9. All API keys in Firebase Secret Manager (never in code)
10. Comprehensive error boundaries and loading states

**What I need you to build:**

Phase 1 — Foundation:
- Project scaffolding (Vite + React + TS + Tailwind + shadcn/ui)
- Firebase setup (Auth, Firestore, Storage, Functions)
- Authentication flow (Google + email/password + password reset)
- Onboarding flow
- Layout with responsive nav, drawer, and dark mode
- Zustand stores for auth, UI, and user preferences
- Route structure matching the spec

Phase 2 — Core Features:
- Card search system (multi-source, cache-first, with all the search helpers)
- Collection management (collector) with full CRUD
- Vendor inventory management with all features (cash manager, snapshots, etc.)
- Wishlist with price trends
- Pricing system (conditions, grading, currency conversion, market source toggle)

Phase 3 — Marketplace & Social:
- Marketplace (vendor discovery, card browsing, contact flow)
- Vendor profiles
- Real-time messaging with transaction flow
- Trade calculator and buy calculator with pending deals and sharing
- Transaction log and summary

Phase 4 — Admin & Polish:
- Admin panel with user management, vendor requests, feedback, image moderation
- Community image submission and approval flow
- Inventory insights and wishlist insights dashboards
- Shared views (inventory, collection, trade offers)
- CSV export and CardLadder import

Phase 5 — Cloud Functions:
- All search and pricing proxy functions
- Scheduled jobs (card database update, price cache, Japanese card sync, set catalog sync)
- Email notifications for messages
- Admin/maintenance endpoints

For each phase, please:
1. Create the files with complete, working code (not stubs or placeholders)
2. Include proper TypeScript types/interfaces
3. Add unit tests for business logic (pricing calculations, search helpers, etc.)
4. Explain any architectural decisions that differ from the original

Start with Phase 1. After I confirm it's working, proceed to Phase 2, and so on.

Refer to the attached PRODUCT_DESCRIPTION.md for every detail about features, data models, APIs, and business logic. If anything is ambiguous, ask before assuming.
```

---

## Tips for Best Results

1. **Use a model with a large context window** — This doc is ~12K words. Models like Claude Opus, GPT-4o, or Gemini 2.5 Pro can handle it well.

2. **Attach, don't paste** — If the platform supports file attachments, attach the .md file rather than pasting its contents. This preserves formatting and avoids token waste in the conversation.

3. **Go phase by phase** — Don't ask for everything at once. Confirm each phase works before moving to the next. This keeps the model focused and reduces errors.

4. **Provide feedback loops** — After each phase, share any errors, screenshots, or issues. The model will course-correct.

5. **Customize the tech stack section** — If you have strong preferences (e.g., Next.js instead of Vite+React Router, or Supabase instead of Firebase), update the prompt before using it.

6. **Consider splitting Cloud Functions** — Phase 5 is dense. You may want to split it into "search/pricing functions" and "scheduled jobs + notifications" as sub-phases.
