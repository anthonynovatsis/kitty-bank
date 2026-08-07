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
pnpm db:generate --name=add_foo_column  # Generate a migration (ALWAYS pass --name)
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

### Migrations

Always pass `--name=<snake_case_description>` to `pnpm db:generate`. Never keep
drizzle-kit's random names (`0002_melodic_starjammers`) — the migration list
should read as a history of schema changes.

Check the generated SQL before committing it. For a new non-nullable column,
drizzle-kit emits `ADD COLUMN ... NOT NULL`, which SQLite only accepts while the
table is **empty**; add a constant `DEFAULT` plus a backfill `UPDATE` so it also
applies to a database with data. Hand-editing is safe — drizzle-kit diffs the
schema against `drizzle/meta/*_snapshot.json`, not the live database.

### Domain Services

`src/server/services/` holds business logic shared by more than one router —
`cash.ts` implements the money-movement rules used by both `user.cash.*` and
`admin.transactions.approve`. Keep `routers/` for actual tRPC routers (every
file there is registered in `root.ts`).

Service functions take a `Transaction` (exported from `src/server/db/index.ts`)
rather than the root `db`, so callers must wrap them in `ctx.db.transaction()`.
That is what stops a transfer from debiting without crediting.

**Service errors** carry a machine-readable `kind`, because one procedure can
refuse for several reasons that share a tRPC code. Throw with
`cashError(kind, message)` and branch with `isCashError(err, kind)` — never by
matching message text. Codes follow: malformed input is `BAD_REQUEST`, state
that forbids the operation is `CONFLICT`. New services should copy this shape;
see `plans/bank_accounts_plan.md` for the kind/code table.

### Testing

```bash
pnpm test         # Vitest unit tests (tRPC callers against a real migrated DB)
pnpm test:e2e     # Playwright, real browser against a dev server on port 3001
pnpm test:e2e:ui  # Playwright interactive UI mode
```

- Unit tests build a per-suite SQLite database via `src/__tests__/helpers/db.ts`.
  It is backed by a **temp file, not `:memory:`** — LibSQL opens a fresh
  connection per `db.transaction()`, and every connection to `:memory:` gets its
  own empty database, so transactional code paths would silently break.
- E2E specs share one database for the whole run and seed fixtures idempotently
  (`tests/e2e/helpers.ts`). `workers: 1` is required: specs mutate each other's
  users, so they cannot run in parallel.
- Add `data-testid` attributes to anything a test needs to select, and select by
  them rather than by text or CSS classes.

### Path Alias

`~/*` maps to `./src/*` — use this for all internal imports.

### Environment Variables

Defined and validated in `src/env.js` (T3 pattern). Add new env vars there before using them.

```
BETTER_AUTH_SECRET  # Generate: pnpm dlx @better-auth/cli@latest secret
DATABASE_URL        # Default: file:./db.sqlite
```

## Planned Features

See `plans/bank_accounts_plan.md` for the full implementation plan and current
phase status. The project is building a banking app with:
- **Cash accounts** (checking/savings) and **investment accounts** (securities/holdings)
- **Admin** and **user** roles with separate tRPC endpoints
- Per-user `requires_transaction_approval`: trusted users' transactions settle
  immediately, supervised users' queue for admin approval

Phases 1 through 2C are complete (accounts, user management, cash transactions).
Phase 3 — investment transactions, holdings, buy/sell — is next and will need
its own service module alongside `cash.ts`.
