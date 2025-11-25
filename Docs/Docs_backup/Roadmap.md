# Rafchu Collects – Development Roadmap

This roadmap captures the journey so far and the next targets for the PokéValue / Rafchu Collects app. It focuses on user-facing goals first, with supporting work that keeps the experience reliable.

## Completed Milestones
- **Single-page app foundation** – React + Vite base with Card Pricer, Inventory, Trade Binder, and Buy List tabs wired to live market data (RapidAPI CardMarket + Firebase).
- **Inventory sharing v1** – Owners can toggle sharing, copy a full inventory link, and viewers see a read-only view.
- **Pricing polish** – Rounding toggle, manual price overrides, red badges for overridden values, condition colour coding, and green “Sales Price” styling on shareable pages.
- **Share link experience** – Share views hide editing controls, show only buyer-friendly pricing, and update continuously from the latest API data.
- **Historical insight** – Lightweight chart showing inventory value over time with metric and timeframe selectors.
- **Share refinements** – Owner-defined share name, share-only inventory tab, share-selected link creation, and a select-all toggle to manage large groups of cards quickly.
- **Hosting automation** – Build and deploy pipeline through Firebase Hosting with regular updates pushed after each enhancement.

## In Progress / Near Term
1. **Share-selected viewer mode**  
   - Parse the `selected` query parameter and show only the chosen cards on the public view.  
   - Present a clear message when no cards are passed or when a card has been removed since the link was created.
2. **Shareable portfolio upgrades**  
   - Add optional public notes or highlight badges for star cards.  
   - Offer a simple carousel or tiled gallery layout for better buyer appeal.
3. **Inventory analytics expansion**  
   - Introduce filters for sets, types, and price brackets.  
   - Extend the trend chart with average purchase price (for future profit tracking) once cost inputs are available.
4. **Authentication guards**  
   - Prevent access to editing routes if a viewer tries to sign in from a shared link.  
   - Provide a dedicated landing page encouraging people to request access rather than creating accounts.

## Mid Term
1. **Mobile-first optimisation** – Tighten layout, add sticky action buttons, and ensure charts and share cards read cleanly on small screens.
2. **Trade & buy list syncing** – Allow optional sync of trade and buy lists to Firebase so users do not lose plans between devices.
3. **Bulk import / export** – Deliver CSV and/or Google Sheets import for collections, plus export snapshots for record keeping.
4. **Pricing engine tuning** – Offer fine-grained override rules (e.g., “round to nearest whole euro unless under €5”) and context hints (recent sales ranges, demand signals).

## Long Term / Vision
1. **Deal flow tooling** – Build quick-quote templates for buyers/sellers and automatic margin calculations for trade offers.
2. **Marketplace integrations** – Explore posting directly to third-party marketplaces or generating shareable flyers.
3. **Team workspaces** – Support multiple users managing the same inventory with role-based permissions and activity history.
4. **Mobile app wrapper** – Package the experience in a native shell (e.g., Capacitor) if offline-first or push notifications become important.
5. **App Hosting readiness** – Resolve Cloud SQL permission blockers, move long-term workloads to Firebase App Hosting with automatic rebuilds on deploy.

## Guiding Principles
- **Buyer-first presentation** – Shared views must be simple, trustworthy, and visually inviting.  
- **Owner productivity** – The app should cut the time it takes to price, list, and update cards.  
- **Trust in data** – Keep live pricing fresh, show when data last updated, and surface any gaps clearly.  
- **Friendly language** – Continue writing copy and documentation in approachable terms so collectors of any background can use the tool with confidence.
