# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server (Next.js Turbo mode)
pnpm build        # Production build
pnpm check        # Lint + typecheck
pnpm lint         # ESLint only
pnpm lint:fix     # ESLint with auto-fix
pnpm typecheck    # TypeScript check only
pnpm format:write # Format all files with Prettier

# Database
pnpm db:generate  # Generate Drizzle migrations from schema changes
pnpm db:migrate   # Apply migrations
pnpm db:push      # Push schema directly (dev only)
pnpm db:studio    # Open Drizzle Studio UI
```

## Architecture

**T3 Stack**: Next.js 15 (App Router) + tRPC 11 + Drizzle ORM + Better Auth + TailwindCSS 4

### Request Flow

- **Pages** (`src/app/`) — React Server Components by default. Server-side tRPC calls use `src/trpc/server.ts` helpers. Client-side calls use the React Query provider from `src/trpc/react.tsx`.
- **API layer** (`src/server/api/`) — tRPC routers. Add new routers in `routers/`, register them in `root.ts`.
- **Database** (`src/server/db/`) — Drizzle ORM with LibSQL (SQLite). Schema in `schema.ts`; after changes, run `db:generate` then `db:migrate`.
- **Auth** (`src/server/better-auth/`) — Better Auth with Drizzle adapter. Auth API endpoints are at `/api/auth/[...all]`. Use `server.ts` for server-side session access and `client.ts` for client-side auth hooks.

### tRPC Procedures

Two procedure types in `src/server/api/trpc.ts`:
- `publicProcedure` — no auth required; session available if user is logged in
- `protectedProcedure` — throws `UNAUTHORIZED` if no valid session; use for all user-facing data operations

Context passed to all procedures: `{ db, session, headers }`

### Path Alias

`~/*` maps to `./src/*` — use this for all internal imports.

### Environment Variables

Defined and validated in `src/env.js` (T3 pattern). Add new env vars there before using them.

```
BETTER_AUTH_SECRET  # Generate: pnpm dlx @better-auth/cli@latest secret
DATABASE_URL        # Default: file:./db.sqlite
```

## Planned Features

See `plans/bank_accounts_plan.md` for the full implementation plan. The project is building a banking app with:
- **Cash accounts** (checking/savings) and **investment accounts** (securities/holdings)
- **Admin** and **user** roles with separate tRPC endpoints
- Planned tables: `cash_accounts`, `investment_accounts`, `holdings`, `cash_transactions`, `investment_transactions`, `admin_roles`
