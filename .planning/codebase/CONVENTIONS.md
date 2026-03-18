# Code Conventions

## Language & Tooling

- **TypeScript 5.x** with `strict: true` — no implicit any, strict null checks enforced
- **ESLint 9** flat config via `eslint-config-next` — no Prettier configured
- **Target**: ES2017, module resolution: bundler
- `"use server"` / `"use client"` directives used per Next.js App Router conventions
- `import "server-only"` used in scrapers to prevent accidental client-side inclusion

## Naming Conventions

| Element | Convention | Example |
|---|---|---|
| React components | PascalCase | `CheckDeck`, `Header` |
| TypeScript interfaces/types | PascalCase | `Product`, `DeckCard`, `ScrapeCardProps` |
| Functions/utilities | camelCase | `parseDeckList`, `scrapeAllSites`, `getBrowser` |
| API route files | `route.ts` in camelCase dirs | `api/checkDeck/route.ts` |
| Scraper files | `scrape<Store>.ts` | `scrapeETB.ts`, `scrapeDCC.ts` |
| Database fields | camelCase in Prisma, mapped to snake_case via `@@map` | `cardName` → `collection_cards` |
| CSS classes | Tailwind utility classes inline |  |

## File Organization Patterns

- API handlers live in `src/app/api/<endpoint>/route.ts` — one file per endpoint
- Business logic extracted to `src/lib/` — API routes import from lib, not the reverse
- Scrapers grouped under `src/lib/scrapeLGS/` with one file per store
- Shared TypeScript types in root `types/` directory

## Component Patterns

- Client components use `"use client"` at top of file
- Local interfaces defined at top of component file (not in `types/`)
- State managed with `useState` hooks
- Form submission via `handleSubmit` pattern with `async/await` fetch

```tsx
// Standard client component pattern
"use client";
import { useState } from "react";

export default function MyPage() {
  const [data, setData] = useState<Type[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/endpoint", { method: "POST", ... });
      const data = await res.json();
      setData(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };
}
```

## API Route Patterns

```ts
// Standard API route pattern
export async function POST(request: Request) {
  try {
    const { field } = await request.json();

    if (!field) {
      return NextResponse.json({ error: 'Field is required' }, { status: 400 });
    }

    // ... logic ...

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Descriptive error:', error);
    return NextResponse.json({ error: 'Failed to ...' }, { status: 500 });
  }
}
```

## Scraper Patterns

```ts
// Standard scraper pattern
import "server-only";
import type { Product, ScrapeCardProps } from "@/types/product";
import { getBrowser } from "./browser";

export async function scrapeXXX({ card }: ScrapeCardProps): Promise<Product[]> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // scrape logic
    return products;
  } catch (error) {
    console.error('XXX scraping failed:', error);
    return [];
  } finally {
    await page.close(); // always close page, not browser
  }
}
```

## Error Handling

- Try-catch in all async functions
- API routes return `NextResponse.json({ error: '...' }, { status: 4xx/5xx })` on failure
- Scrapers return empty array `[]` on failure (never throw to caller)
- `console.error` for errors, `console.log` with emoji prefixes for status (`✓`, `✗`, `⚠️`, `===`)
- Errors swallowed at scraper level — no propagation to caller

## Logging Style

```ts
console.log(`Starting update for ${n} users...`);
console.log(`\n=== Update Complete ===`);
console.log(`✓ Successfully updated ${n} cards for ${name}`);
console.error(`✗ Failed to update ${name}:`, error);
console.log('⚠️ No cards scraped - skipping');
```

## Singleton Patterns

Two module-level singletons used:
- `src/lib/prisma.ts` — PrismaClient instance (prevents multiple connections)
- `src/lib/scrapeLGS/browser.ts` — Puppeteer Browser instance (shared across scrapers)

Both use a `let instance: T | null = null` guard pattern.
