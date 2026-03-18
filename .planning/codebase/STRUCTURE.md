# Codebase Structure

## Directory Layout

```
magic-scraper/
├── src/
│   ├── app/                          # Next.js App Router pages and API routes
│   │   ├── api/                      # Server-side API route handlers
│   │   │   ├── checkDeck/
│   │   │   │   └── route.ts          # POST /api/checkDeck — deck list lookup against DB
│   │   │   ├── scrapeLGS/
│   │   │   │   └── route.ts          # POST /api/scrapeLGS — real-time store scraping
│   │   │   └── admin/
│   │   │       └── updateCollections/
│   │   │           └── route.ts      # POST /api/admin/updateCollections — refresh Moxfield data
│   │   ├── checkDeck/
│   │   │   └── page.tsx              # Deck checker UI (client component)
│   │   ├── SearchLGS/
│   │   │   └── page.tsx              # LGS card search UI (client component)
│   │   ├── admin/
│   │   │   └── page.tsx              # Admin panel UI
│   │   ├── components/
│   │   │   └── header.tsx            # Shared navigation header
│   │   ├── layout.tsx                # Root layout with header
│   │   ├── page.tsx                  # Home page
│   │   └── globals.css               # Global styles + Tailwind base
│   ├── lib/                          # Business logic and utilities
│   │   ├── scrapeLGS/
│   │   │   ├── browser.ts            # Puppeteer singleton browser manager
│   │   │   ├── scrapeAllSites.ts     # Orchestrates parallel scraping across stores
│   │   │   ├── scrapeETB.ts          # ETB Hobbies scraper
│   │   │   ├── scrapeDCC.ts          # Dragon Card Company scraper
│   │   │   ├── scrapeFTF.ts          # FTF Games scraper
│   │   │   └── scrape401.ts          # 401 Games scraper (currently disabled/broken)
│   │   ├── scrapeMoxfield/
│   │   │   └── scrapeMoxfield.ts     # Moxfield collection API scraper
│   │   ├── parseDeck.ts              # Decklist text parser (qty + card name)
│   │   ├── prisma.ts                 # Prisma client singleton
│   │   ├── updateCollections.ts      # Batch update all user collections from Moxfield
│   │   └── seedUsers.ts              # Utility to seed user records
│   ├── scripts/
│   │   └── seed.ts                   # Database seed script (run via tsx)
│   └── scrape.js                     # Legacy standalone scrape script (JS, not used in app)
├── types/                            # Shared TypeScript type definitions
│   ├── product.ts                    # Product and ScrapeCardProps interfaces
│   ├── moxfield.ts                   # Moxfield API response types
│   ├── validator.ts                  # Validation types
│   ├── routes.d.ts                   # Route type declarations
│   └── cache-life.d.ts               # Next.js cache-life type declarations
├── prisma/
│   ├── schema.prisma                 # DB schema (SQLite, User + CollectionCard models)
│   └── migrations/                   # Prisma migration history
│       └── 20260117202652_init/
│           └── migration.sql
├── public/                           # Static assets (SVGs)
├── next.config.ts                    # Next.js configuration
├── tsconfig.json                     # TypeScript config (strict, @/* alias → src/*)
├── eslint.config.mjs                 # ESLint 9 flat config (eslint-config-next)
├── postcss.config.mjs                # PostCSS config (Tailwind v4)
├── update.sh                         # Shell script for deployment/update
└── scrapeETB.ts                      # Root-level duplicate scraper (legacy artifact)
```

## Key File Locations

| Purpose | Path |
|---|---|
| Add a new LGS scraper | `src/lib/scrapeLGS/scrapeXXX.ts` + register in `scrapeAllSites.ts` |
| Add a new API endpoint | `src/app/api/<name>/route.ts` |
| Add a new page | `src/app/<name>/page.tsx` |
| Database schema changes | `prisma/schema.prisma` → run `npx prisma migrate dev` |
| Shared types | `types/` |
| DB client | `src/lib/prisma.ts` (singleton) |
| Browser client | `src/lib/scrapeLGS/browser.ts` (singleton) |

## Naming Conventions

- **Pages**: PascalCase directories (`CheckDeck/`, `SearchLGS/`) with `page.tsx`
- **API routes**: camelCase directories (`checkDeck/`, `scrapeLGS/`) with `route.ts`
- **Components**: camelCase filenames (`header.tsx`)
- **Lib files**: camelCase (`parseDeck.ts`, `updateCollections.ts`)
- **Scraper files**: `scrape<StoreName>.ts` pattern
- **Types**: PascalCase interfaces, files in `types/` root

## Import Path Aliases

- `@/*` maps to `src/*` (configured in `tsconfig.json`)
- Example: `import { prisma } from '@/lib/prisma'`
- External types live in `types/` at root (not under `src/`), imported relatively or via tsconfig include
