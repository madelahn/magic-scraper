# Codebase Concerns

## Tech Debt

### 1. Disabled scraper (`scrape401.ts`)
`src/lib/scrapeLGS/scrape401.ts` is commented out in `scrapeAllSites.ts` with comment `// DOESNT SEEM TO WORK`. 401 Games is a major Canadian MTG retailer — this is a significant gap. The scraper exists but uses a polling loop (`for i < 20 { wait 5s }`) that can run up to 100 seconds per request.

### 2. Legacy files at root
- `src/scrape.js` — old standalone JS scrape script, not imported anywhere
- `src/scrapeETB.ts` — root-level duplicate of `src/lib/scrapeLGS/scrapeETB.ts`
These create confusion about what code is actually used.

### 3. Mixed JS/TS
`src/scrape.js` is plain JavaScript in an otherwise fully TypeScript project.

### 4. Type-unsafe grouping logic
In `src/app/api/checkDeck/route.ts`, the `grouped` variable is typed as `Record<string, any>` — loses type safety during the grouping step.

### 5. Browser lifecycle fragility
The Puppeteer browser singleton in `src/lib/scrapeLGS/browser.ts` is closed after `scrapeAllSites` completes, but if an exception occurs before `closeBrowser()` is called, the browser process leaks. No cleanup on process exit.

### 6. Sequential collection updates
`updateCollections.ts` iterates users in a `for...of` loop — collections are updated one at a time. With many users this becomes slow.

## Known Bugs

### 1. 401 Games scraper non-functional
`scrape401.ts` — confirmed not working (noted in code). Root cause appears to be the site's JavaScript-heavy rendering requiring extended waits that aren't reliable.

### 2. Brittle CSS selectors
All LGS scrapers depend on specific CSS class selectors (`.product-card`, `.price`, `.title`, etc.). Any site redesign breaks the scraper silently — it returns an empty array rather than an error.

### 3. Error propagation suppressed
Individual scrapers catch all errors and return `[]`. If a scraper breaks, the user sees no results for that store with no indication of failure. Silent failures are hard to debug.

## Security Considerations

### 1. No admin authentication
`src/app/api/admin/updateCollections/route.ts` and `src/app/admin/page.tsx` have no authentication or authorization. Any user can trigger a full collection refresh or access the admin panel.

### 2. Input validation gaps
`/api/checkDeck` only checks that `decklist` is a non-empty string — no length limit, no rate limiting. A large payload could cause a slow DB query.

### 3. Cascade deletes
The Prisma schema uses `onDelete: Cascade` on `CollectionCard → User`. Deleting a user removes all their cards — intentional but worth noting as a footgun.

### 4. DATABASE_URL in environment
SQLite DB path comes from `DATABASE_URL` env var. If misconfigured in production, Prisma will silently create a new empty DB.

## Performance Bottlenecks

### 1. Sequential scraping (partially fixed)
`scrapeAllSites.ts` uses `Promise.all` for active scrapers (good), but 401 Games is disabled. If re-enabled naively with the polling loop, it would serialize with others or dramatically increase response time.

### 2. Puppeteer startup cost
A new Puppeteer browser is launched per request if the singleton was previously closed. Browser launch takes ~1-3 seconds and blocks the response.

### 3. No DB query optimization for deck check
The `checkDeck` route queries `collectionCard.findMany` with `cardName IN (...)`. With a large collection and a 100-card deck, this query could be slow. The `@@index([cardName])` helps but the result set could be large.

### 4. No caching
LGS scrape results are not cached. Scraping the same card twice fires full browser sessions both times.

## Fragile Areas

### 1. DOM scraping
All LGS scrapers (`scrapeETB`, `scrapeDCC`, `scrapeFTF`) use Puppeteer's `page.evaluate()` with hardcoded CSS selectors. These break on any site layout change with no warning.

### 2. Moxfield scraping
`scrapeMoxfield.ts` depends on Moxfield's internal API/HTML structure. Moxfield has no public API SLA — any change to their site breaks collection sync.

### 3. Deck parser regex
`parseDeck.ts` uses `/^(\d+)\s+(.+)$/` — assumes strict `"N CardName"` format. Alternate formats (e.g., `"1x CardName"`, MTGA export format with set codes) will silently drop cards.

### 4. Collection update atomicity
`updateCollections.ts` does `deleteMany` then `createMany` per user with no transaction. A failure between these two operations leaves the user with zero cards in the DB.

## Missing Features

- No user authentication / login system
- No admin auth (anyone can trigger updateCollections)
- No scrape result caching (store prices)
- No error reporting / visibility when scrapers fail
- No test coverage
- No rate limiting on any API endpoint
