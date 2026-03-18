# External Integrations

**Analysis Date:** 2026-03-16

## APIs & External Services

**Magic Card APIs:**
- Moxfield API - Fetches user card collection data
  - Endpoint: `https://api2.moxfield.com/v1/collections/search/{collectionId}`
  - SDK/Client: Puppeteer (headless browser)
  - Implementation: `src/lib/scrapeMoxfield/scrapeMoxfield.ts`
  - Auth: None (public API)
  - Query params: sortType, sortDirection, pageNumber, pageSize, playStyle, pricingProvider
  - Pagination: Supports pageSize=5000, automatic pagination handling

**Price Comparison Sites (Web Scraping):**
- Enter The Battlefield (Canada) - MTG product listings
  - URL: `https://enterthebattlefield.ca/search`
  - Client: Puppeteer
  - Implementation: `src/lib/scrapeLGS/scrapeETB.ts`
  - Auth: None
  - Data scraped: title, price, inventory, image, product link

- Face to Face Games (Canada) - MTG inventory and pricing
  - URL: `https://facetofacegames.com/search`
  - Client: Puppeteer
  - Implementation: `src/lib/scrapeLGS/scrapeFTF.ts`
  - Auth: None
  - Data scraped: title, price, inventory by condition, image, product link

- Dungeon Comics and Cards (Canada) - MTG cards and supplies
  - URL: `https://www.dungeoncomicsandcards.ca/search`
  - Client: Puppeteer
  - Implementation: `src/lib/scrapeLGS/scrapeDCC.ts`
  - Auth: None
  - Data scraped: title, price, inventory, image, product link
  - Viewport: 1920x1080 required for proper rendering

**Scraping Infrastructure:**
- Browser pooling via singleton pattern
  - Location: `src/lib/scrapeLGS/browser.ts`
  - Single headless browser instance reused across requests
  - User-Agent: Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36

## Data Storage

**Databases:**
- SQLite 3
  - Connection: `DATABASE_URL` environment variable (required)
  - Client/ORM: Prisma 6.15.0
  - Adapter: `@prisma/adapter-better-sqlite3`
  - Location: `prisma/schema.prisma`

**Database Models:**
- `User`: Moxfield users and their collection reference
  - Fields: id (cuid), name, moxfieldCollectionId (unique), lastUpdated
  - Location: `prisma/schema.prisma` line 10-18

- `CollectionCard`: Individual Magic cards in user collections
  - Fields: id, userId, cardName, scryfallId, set, setName, quantity, condition, isFoil, typeLine, lastUpdated
  - Indexes: cardName, userId
  - Relationship: Foreign key to User with cascade delete
  - Location: `prisma/schema.prisma` line 20-38

**Migrations:**
- Location: `prisma/migrations/`
- Initial schema: `prisma/migrations/20260117202652_init/migration.sql`
- Lock file: `prisma/migrations/migration_lock.toml`

**File Storage:**
- Local filesystem only (SQLite file)
- No cloud storage integration

**Caching:**
- Memory-based: Puppeteer browser instance cached in `src/lib/scrapeLGS/browser.ts`
- No external cache service (Redis, Memcached)

## Authentication & Identity

**Admin Access:**
- Custom secret-based authentication
  - Implementation: `src/app/api/admin/updateCollections/route.ts`
  - Auth method: POST request with `secret` field in JSON body
  - Verification: `secret === process.env.ADMIN_SECRET`
  - On mismatch: Returns 401 Unauthorized
  - Location: Line 9 of `src/app/api/admin/updateCollections/route.ts`

**User Identification:**
- Moxfield Collection IDs - External user identifier
  - Stored in `User.moxfieldCollectionId` (unique constraint)
  - Used for Moxfield API queries
  - Location: `prisma/schema.prisma` line 13

**No Public Auth:**
- No login/authentication system for website users
- Read-only public API access

## Monitoring & Observability

**Error Tracking:**
- Not integrated - no external error tracking service

**Logs:**
- Console logging only
  - Location: `console.log()` and `console.error()` throughout codebase
  - Examples:
    - `src/lib/scrapeMoxfield/scrapeMoxfield.ts`: Collection fetch progress logs
    - `src/lib/scrapeLGS/scrapeDCC.ts`: Error logging for scraping failures
    - `src/app/api/scrapeLGS/route.ts`: Generic failure logging

**Debug Output:**
- Scraping progress tracked via console.log
  - Page numbers being fetched
  - Card counts per page
  - Error conditions

## CI/CD & Deployment

**Hosting:**
- Not specified - requires manual deployment
- Next.js production build ready
- Supports containerization (Puppeteer with --no-sandbox, --disable-setuid-sandbox flags for Docker)

**CI Pipeline:**
- Not configured - no GitHub Actions, GitLab CI, or similar setup

**Build Process:**
```bash
npm run build   # Compiles TypeScript and Next.js
npm start       # Runs production server
```

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - SQLite connection string (e.g., `file:./dev.db`)
- `ADMIN_SECRET` - Secret token for admin API endpoints
- `NODE_ENV` - Set to `production` for production deployments (affects Prisma client reuse)

**Optional env vars:**
- None documented

**Secrets location:**
- `.env` file (not tracked in git, add to `.gitignore`)
- Environment variables set during deployment
- No `.env.example` file provided

## Webhooks & Callbacks

**Incoming:**
- None implemented

**Outgoing:**
- None implemented

## API Endpoints

**Card Scraping:**
- `POST /api/scrapeLGS` - Scrape multiple LGS websites for a card
  - Body: `{ card: string }`
  - Returns: `{ products: Product[] }` (flattened results from all scrapers)
  - Scraped sites: Enter The Battlefield, Dungeon Comics and Cards, Face to Face Games
  - Error handling: 400 on missing card, 500 on scrape failure
  - Location: `src/app/api/scrapeLGS/route.ts`

**Deck Checking:**
- `POST /api/checkDeck` - Check which collection cards match a decklist
  - Body: `{ decklist: string }`
  - Returns: `{ results: { cardName, printings[] }[] }`
  - Printings grouped by set and sorted by card name
  - Error handling: 400 on missing decklist, 500 on database error
  - Location: `src/app/api/checkDeck/route.ts`

**Collection Updates:**
- `POST /api/admin/updateCollections` - Update all user collections from Moxfield
  - Body: `{ secret: string }`
  - Returns: `{ success: true, message: string }` or `{ error: string }`
  - Auth: Requires `ADMIN_SECRET` match
  - Processing: Calls `updateAllCollections()` from `src/lib/updateCollections.ts`
  - Error handling: 401 on auth failure, 500 on update error
  - Location: `src/app/api/admin/updateCollections/route.ts`

---

*Integration audit: 2026-03-16*
