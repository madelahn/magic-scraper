# Architecture

**Analysis Date:** 2026-03-16

## Pattern Overview

**Overall:** Layered Next.js full-stack application with separated concerns for API routes, page components, and service/utility libraries.

**Key Characteristics:**
- Next.js 16 App Router (RSC-based with server-only constraints)
- Client-server separation with explicit "use client" directives
- Puppeteer-based web scraping for price/inventory data
- SQLite database with Prisma ORM for collection card storage
- REST API routes for core operations (deck checking, scraping)

## Layers

**Presentation Layer (Client-Side):**
- Purpose: Interactive React components for user-facing features
- Location: `src/app/checkDeck/page.tsx`, `src/app/SearchLGS/page.tsx`, `src/app/admin/page.tsx`
- Contains: Page components with React hooks (useState, form handling), UI components using Tailwind CSS and Lucide icons
- Depends on: API routes via fetch calls, types from `types/`
- Used by: Next.js router

**API Route Layer:**
- Purpose: Request handling, validation, and orchestration of business logic
- Location: `src/app/api/*/route.ts` (checkDeck, scrapeLGS, admin/updateCollections)
- Contains: NextResponse handlers, request validation, error handling
- Depends on: Service layer (`src/lib/`), Prisma client, scraping functions
- Used by: Client-side fetch calls, scheduled/admin operations

**Service/Business Logic Layer:**
- Purpose: Reusable operations for scraping, parsing, and data transformation
- Location: `src/lib/` (parseDeck.ts, updateCollections.ts, scrapeLGS/, scrapeMoxfield/)
- Contains: Scraping orchestration, data parsing, collection updates, Prisma transactions
- Depends on: Puppeteer for browser automation, Prisma for DB access, external APIs
- Used by: API routes, server-side operations

**Data Access Layer:**
- Purpose: Database abstraction and Prisma client singleton management
- Location: `src/lib/prisma.ts`
- Contains: Prisma client initialization with global singleton pattern to prevent multiple instances
- Depends on: Prisma client library, SQLite database
- Used by: All service functions that interact with database

**Type Layer:**
- Purpose: TypeScript type definitions for domain models
- Location: `types/product.ts`, `types/moxfield.ts`
- Contains: Product interface, MoxfieldCard interface, ScrapeCardProps
- Depends on: None
- Used by: All layers for type safety

## Data Flow

**Deck Checking Flow:**

1. User submits decklist in `src/app/checkDeck/page.tsx` form
2. Form handler calls POST `/api/checkDeck` with decklist text
3. API route calls `parseDeckList()` in `src/lib/parseDeck.ts` to extract card names (filters basic lands)
4. API queries Prisma for all matching cards across all users' collections
5. Results grouped by card name, then by set/printing
6. Grouped data returned to client and displayed with expandable UI, hover card images from Scryfall API

**LGS Search Flow:**

1. User submits card name in `src/app/SearchLGS/page.tsx` search form
2. Form handler calls POST `/api/scrapeLGS` with card query
3. API route calls `scrapeAllSites()` in `src/lib/scrapeLGS/scrapeAllSites.ts`
4. Function launches Puppeteer browser, runs 3 scraper functions in parallel: `scrapeETB()`, `scrapeDCC()`, `scrapeFTF()`
5. Each scraper: navigates to site, waits for DOM, extracts product data (title, price, inventory, image, link)
6. Results flattened and returned to client as array of Product objects
7. Client renders product cards with images, prices, and links to stores

**Collection Update Flow (Admin):**

1. Admin submits password in `src/app/admin/page.tsx`
2. POST `/api/admin/updateCollections` validates admin secret against `ADMIN_SECRET` env var
3. API calls `updateAllCollections()` in `src/lib/updateCollections.ts`
4. Function iterates through all User records from Prisma
5. For each user, calls `scrapeMoxfield()` with their collection ID
6. Moxfield scraper: launches browser, paginates through Moxfield API (5000 items per page), extracts card metadata
7. Filters out basic lands and tokens
8. Deletes old CollectionCard records for user, inserts new batch via `createMany()`
9. Updates user's `lastUpdated` timestamp
10. Returns summary to admin UI

**State Management:**

- Client state: React hooks (useState) for forms, loading states, UI expansion
- Server state: Prisma SQLite database with 2 models (User, CollectionCard)
- Browser automation state: Singleton Puppeteer instance managed in `src/lib/scrapeLGS/browser.ts`
- Environment state: Admin secret, database URL via environment variables

## Key Abstractions

**Scraper Pattern:**
- Purpose: Abstract website scraping logic for different stores
- Examples: `src/lib/scrapeLGS/scrapeETB.ts`, `src/lib/scrapeLGS/scrapeDCC.ts`, `src/lib/scrapeLGS/scrapeFTF.ts`
- Pattern: Each implements async function taking `ScrapeCardProps`, returns Promise<Product[]>. Uses Puppeteer page.goto(), page.evaluate() with DOM selectors specific to site HTML structure

**Browser Lifecycle Management:**
- Purpose: Maintain single Puppeteer browser instance across multiple scrape operations
- Examples: `src/lib/scrapeLGS/browser.ts` exports `getBrowser()` and `closeBrowser()`
- Pattern: Singleton pattern with module-level browserInstance variable. Created on first call, reused across scrapes in same request, closed when scraping completes

**Card Data Transformation:**
- Purpose: Parse, filter, and normalize card data from different sources
- Examples: `src/lib/parseDeck.ts` (decklist text → DeckCard[]), `src/lib/scrapeMoxfield/scrapeMoxfield.ts` (Moxfield API JSON → MoxfieldCard[])
- Pattern: Pure functions that extract relevant fields, apply business rules (filter basics lands), map to typed interfaces

**Prisma Database Access:**
- Purpose: Single point for all database operations with transaction support
- Examples: `src/lib/prisma.ts` (client singleton), usage in `src/lib/updateCollections.ts` (deleteMany + createMany pattern)
- Pattern: Global Prisma instance prevents connection pooling issues in serverless environment

## Entry Points

**Web Server:**
- Location: `src/app/layout.tsx`
- Triggers: Next.js dev server or production server startup
- Responsibilities: Root layout with Header component, metadata, font loading, HTML structure

**Pages:**
- Home: `src/app/page.tsx` - Landing with navigation buttons
- Deck Checker: `src/app/checkDeck/page.tsx` - Decklist input and results display
- LGS Search: `src/app/SearchLGS/page.tsx` - Card search form and product results
- Admin: `src/app/admin/page.tsx` - Collection update trigger

**API Routes:**
- `src/app/api/checkDeck/route.ts` - POST endpoint for deck matching
- `src/app/api/scrapeLGS/route.ts` - POST endpoint for store scraping
- `src/app/api/admin/updateCollections/route.ts` - POST endpoint for admin collection refresh

**Scripts (Server-side only):**
- `src/lib/scripts/seed.ts` - Database seeding (referenced but not active in current setup)

## Error Handling

**Strategy:** Try-catch with fallback error responses

**Patterns:**
- API routes wrap all logic in try-catch, return 400/401/500 JSON errors with descriptive messages
- Scraper functions catch and log errors, continue with next scraper rather than failing entire request
- Moxfield scraper catches pagination/API errors, logs details but propagates error to caller
- Client components catch fetch errors, display user-friendly messages in UI
- No retry logic; failures propagate immediately

## Cross-Cutting Concerns

**Logging:** console.log() and console.error() throughout service layer for debugging (especially in updateCollections.ts and scrapeMoxfield.ts with detailed progress logging)

**Validation:**
- API routes validate request JSON structure and required fields
- parseDeck.ts filters out basic lands via regex and string matching
- Moxfield scraper filters tokens and basic lands via type_line checking
- Admin endpoint validates secret matches environment variable

**Authentication:**
- Admin operations require matching `ADMIN_SECRET` environment variable
- No user authentication; collection access is public via user IDs embedded in public Moxfield collection URLs
- No CORS restrictions (internal API only)

---

*Architecture analysis: 2026-03-16*
