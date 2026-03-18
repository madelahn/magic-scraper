# Testing

## Current State

**No testing infrastructure exists in this project.**

- No test framework installed (no Jest, Vitest, Mocha, etc.)
- No test files anywhere in the codebase
- No test scripts in `package.json`
- No test configuration files

## What Needs Testing (if added)

### Critical paths without tests

| Area | Risk |
|---|---|
| `src/lib/parseDeck.ts` — `parseDeckList()` | Regex-based parser; edge cases in card name formats could silently drop cards |
| `src/app/api/checkDeck/route.ts` | Grouping/deduplication logic uses manual `Record<string, any>` — type-unsafe |
| `src/lib/updateCollections.ts` | Delete-then-insert pattern has no rollback — data loss on partial failure |
| `src/lib/scrapeLGS/scrapeAllSites.ts` | Scraper orchestration; individual scraper failures are silently swallowed |
| Prisma queries | No validation that DB queries return expected shapes |

## Recommended Setup (if adding tests)

**Vitest** is the natural choice for a Next.js/TypeScript project:

```bash
npm install -D vitest @vitest/ui
```

```json
// package.json
"scripts": {
  "test": "vitest",
  "test:ui": "vitest --ui"
}
```

### Unit test candidates

- `parseDeckList` — pure function, easy to unit test with various input formats
- Individual scraper DOM parsing logic (with JSDOM mocks)
- Collection grouping logic from `checkDeck/route.ts`

### Integration test candidates

- API routes against a test SQLite database
- `updateCollections` with a mocked Moxfield scraper

## Notes

- Puppeteer-based scrapers are hard to unit test — consider extracting DOM parsing logic into pure functions for testability
- The `src/scrape.js` legacy file suggests testing was never a priority in early development
