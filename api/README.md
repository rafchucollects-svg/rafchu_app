# Rafchu Pokémon API

Your own card metadata + pricing API. Phase 0 is a private backend that replaces the JustTCG / Pokemon Price Tracker calls in [../functions/index.js](../functions/index.js).

## What it does today

- Ingests the full pokemontcg.io catalog (sets + cards + images) nightly
- Pulls TCGPlayer and Cardmarket raw prices (legally redistributed via pokemontcg.io's license chain)
- Pulls graded card prices (PSA / BGS / CGC / SGC) for top cards from the eBay Browse API
- Serves everything over a simple Fastify HTTP API

Endpoints:
- `GET /v1/cards/search?q=charizard&set=base1&page=1&pageSize=25`
- `GET /v1/cards/:id` — full card with bundled TCGPlayer + Cardmarket + graded prices
- `GET /v1/cards/:id/prices?source=tcgplayer&variant=holofoil&window=30d` — time-series
- `GET /v1/sets`
- `GET /health`

## Response shape (this is the contract)

```jsonc
{
  "id": "base1-4",
  "name": "Charizard",
  "set": { "id": "base1", "name": "Base" },
  "number": "4",
  "rarity": "Rare Holo",
  "images": { "small": "...", "large": "..." },
  "tcgplayerId": 12345,
  "prices": {
    "tcgplayer": {
      "holofoil": { "low": 290, "mid": 330, "high": 450, "market": 325.41, "directLow": null,
                    "updatedAt": "2026-04-17T...", "source": "pokemontcg.io (TCGPlayer license)" }
    },
    "cardmarket": {
      "": { "average": 289.12, "avg1": ..., "avg7": ..., "avg30": 295, "trend": 301,
            "lowest": 240, "lowestExPlus": ..., "suggested": ...,
            "updatedAt": "2026-04-17T...", "source": "pokemontcg.io (Cardmarket license)" }
    },
    "graded": [
      { "condition": "PSA10", "saleCount": 42, "median": 5200, "p25": 4800, "p75": 5600,
        "sample": [{ "title": "...", "price": 5100, "url": "..." }],
        "updatedAt": "2026-04-17T...", "source": "eBay (Browse API)" }
    ]
  }
}
```

When TCGPlayer Partner API / Cardmarket API access is approved (Phase 2), the `source` field flips and refresh goes daily → hourly. Response shape stays identical.

## Setup (first time, ~15 minutes)

### 1. Provision a Postgres database

Easiest: [Supabase](https://supabase.com) free tier.
1. Sign up, create a new project, pick a region close to you, save the DB password.
2. In the dashboard: **Project Settings → Database → Connection string → URI**. Copy the "Session pooler" or "Direct connection" string (port 5432). For the ingestor workers you want a session connection, not the transaction pooler on 6543.
3. Paste into `.env` as `DATABASE_URL`.

### 2. Get a free pokemontcg.io API key (strongly recommended)

1. Go to [dev.pokemontcg.io](https://dev.pokemontcg.io)
2. Sign up, copy your key, paste into `.env` as `POKEMONTCG_API_KEY`. Without this you'll get rate-limited during the initial full sync.

### 3. Get eBay Browse API credentials

1. Go to [developer.ebay.com](https://developer.ebay.com), create an account.
2. Create a new keyset ("My Account" → "Application Keysets"). Choose **Production**.
3. Copy the **App ID (Client ID)** and **Cert ID (Client Secret)** into `.env`.
4. Make sure your app has the `https://api.ebay.com/oauth/api_scope` scope (it's granted by default).

### 4. Install + configure

```bash
cd api
cp .env.example .env
# fill in DATABASE_URL, POKEMONTCG_API_KEY, EBAY_CLIENT_ID, EBAY_CLIENT_SECRET
npm install
```

### 5. Bootstrap the schema

```bash
npm run db:bootstrap
```

This applies [src/db/schema.sql](src/db/schema.sql): creates `sets`, `cards`, `card_prices`, the `card_prices_latest` materialized view, and `ingest_runs`.

### 6. Run the first ingest

```bash
# Pulls ~20k cards + full sets list + TCGPlayer + Cardmarket prices.
# Takes roughly 10-15 minutes on the first run with an API key.
npm run ingest:pokemontcg

# Pulls eBay sold listings for the top 2000 cards by TCGPlayer market price.
# Takes ~30-45 minutes the first time.
npm run ingest:ebay
```

Tune `EBAY_TOP_N_CARDS` in `.env` down to e.g. 100 for a quick smoke test.

### 7. Start the API

```bash
npm run dev
```

Visit `http://localhost:8080/health` — should return `{"status":"ok","db":"up"}`.

Try: `http://localhost:8080/v1/cards/search?q=charizard&pageSize=5`

## Scheduling daily ingests

For Phase 0, the cheapest option is to add two scheduled Firebase Cloud Functions in [../functions/index.js](../functions/index.js) that shell out to these ingestor entry points, or (cleaner) deploy the API to Railway / Fly.io and use their cron feature. Recommended cadence:

- `pokemontcg`: daily at 05:00 UTC (pokemontcg.io refreshes TCGPlayer/Cardmarket prices around 04:00 UTC)
- `ebay`: daily at 06:00 UTC, staggered so it runs after pokemontcg finishes

## Project layout

```
api/
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── config.ts              # env validation via zod
│   ├── server.ts              # Fastify entry
│   ├── types.ts               # public API response shapes (stable contract)
│   ├── db/
│   │   ├── schema.sql
│   │   └── client.ts          # postgres.js connection pool
│   ├── lib/
│   │   ├── logger.ts
│   │   ├── pokemontcg.ts      # paging client
│   │   ├── ebay.ts            # OAuth + Browse API client
│   │   └── gradeParser.ts     # PSA/BGS/CGC/SGC title parser
│   ├── ingestors/
│   │   ├── pokemontcg.ts      # sets + cards + TCGPlayer + Cardmarket
│   │   └── ebaySold.ts        # graded prices
│   └── routes/
│       ├── health.ts
│       ├── sets.ts
│       └── cards.ts
└── scripts/
    ├── bootstrap-db.ts        # applies schema.sql
    └── run-ingest.ts          # CLI: pokemontcg | ebay | all
```

## What's next (phases 1 and 2)

See `.cursor/plans/build_rafchu_pokémon_api_*.plan.md` for the full roadmap. TL;DR:

- **Phase 1:** API keys + OpenAPI docs + free public beta
- **Phase 2:** Stripe billing, direct TCGPlayer Partner API (apply now — takes weeks), direct Cardmarket API, PSA paid API

## Attribution

Raw card metadata and TCGPlayer / Cardmarket prices in this API are derived from [pokemontcg.io](https://pokemontcg.io), which in turn licenses pricing data from TCGPlayer and Cardmarket. When you go public (Phase 1), you need an attribution page.
