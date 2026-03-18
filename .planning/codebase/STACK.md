# Technology Stack

**Analysis Date:** 2026-03-16

## Languages

**Primary:**
- TypeScript 5.x - Main language for all source code
- JavaScript - Configuration files and build scripts
- SQL - Prisma migrations

**Secondary:**
- JSX/TSX - React components

## Runtime

**Environment:**
- Node.js 22.x (tested with v22.17.1)

**Package Manager:**
- npm 11.x (tested with v11.5.1)
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Next.js 16.1.6 - Full-stack React framework for web application and API routes
- React 19.2.3 - UI component library
- React DOM 19.2.3 - React DOM rendering

**Database:**
- Prisma 6.15.0 - ORM and database toolkit
  - Migration: `prisma/schema.prisma`
  - Adapter: `@prisma/adapter-better-sqlite3` 7.2.0

**Styling:**
- Tailwind CSS 4.x - Utility-first CSS framework
- PostCSS 4.x - CSS processing via `@tailwindcss/postcss`
  - Config: `postcss.config.mjs`

**Testing/Dev:**
- ESLint 9.x - JavaScript/TypeScript linting
  - Config: `eslint-config-next` 16.1.1 (built-in with Next.js)
- tsx 4.21.0 - TypeScript executor for scripts

## Key Dependencies

**Critical:**
- Puppeteer 24.34.0 - Browser automation for web scraping
  - Used for: Scraping LGS websites, Moxfield API data
  - Location: `src/lib/scrapeLGS/`, `src/lib/scrapeMoxfield/`

- better-sqlite3 12.6.2 - Native SQLite bindings for Node.js
  - Used with: Prisma adapter for local database access
  - Location: Configured in `prisma/schema.prisma`

**UI Components:**
- lucide-react 0.562.0 - Icon library for React components
  - Location: `src/app/components/`

**Type Definitions:**
- @types/better-sqlite3 7.6.13 - TypeScript types for better-sqlite3
- @types/node 20.x - Node.js standard library types
- @types/react 19.x - React type definitions
- @types/react-dom 19.x - React DOM type definitions

## Configuration

**Environment:**
- Environment variables required (see INTEGRATIONS.md)
- No `.env` file tracked in repository
- Admin secret authentication via `process.env.ADMIN_SECRET`
- Database connection via `process.env.DATABASE_URL`

**Build:**
- TypeScript compiler: `tsconfig.json`
  - Target: ES2017
  - Module: esnext
  - JSX: react-jsx
  - Path alias: `@/*` → `./src/*`

- Next.js: `next.config.ts`
  - Minimal configuration, defaults used

**Package Management:**
- Override: `hono` pinned to ^4.11.4 (dependency resolution)

## Platform Requirements

**Development:**
- Node.js 22.x or compatible
- npm or npm-compatible package manager
- SQLite database support (via better-sqlite3)
- Puppeteer browser automation dependencies

**Production:**
- Node.js 22.x runtime
- SQLite database file system
- Headless browser support (Puppeteer with --no-sandbox flag for restricted environments)
- ~500MB+ disk space for Puppeteer browser binary

## Key Build Commands

```bash
npm run dev        # Development server on port 3000
npm run build      # Production build
npm start          # Production server
npm run lint       # Run ESLint
```

---

*Stack analysis: 2026-03-16*
