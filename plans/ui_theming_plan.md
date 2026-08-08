# UI Component Library & Theming - Implementation Plan

## Overview

Kitty Bank has no component library. This plan adopts **shadcn/ui** as the
component layer and rebuilds the styling on **semantic CSS variables**, so that
swappable themes — a playful "Kitten" theme, a "Serious" theme, and room for
more — become a block of variables rather than an edit to every file.

The theming goal drives the sequencing. Adopting shadcn *first* means the colour
migration happens once, against shadcn's variable names, instead of twice.

## Current State

| | |
|---|---|
| Component library | none — no UI dependency in `package.json` |
| Styling | TailwindCSS 4, configured entirely in `src/styles/globals.css` (6 lines: the `@import` and one `@theme` block setting `--font-sans`) |
| Design tokens | none — no colour, spacing or radius tokens defined |
| Shared components | one: `src/app/_components/Badge.tsx` |
| Dark mode | zero `dark:` variants anywhere |
| Assets | `public/` contains only `favicon.ico` |

16 `.tsx` files, ~2,230 lines. Colour is applied as literal Tailwind palette
classes at each call site: `bg-blue-600` ×5, `bg-indigo-600` ×3, `bg-indigo-700`
×3, `bg-blue-700` ×3 — blue and indigo are already competing for "primary".

### Native controls to be replaced

| File | button | input | select | `alert()` | `<Badge>` |
|---|---|---|---|---|---|
| `admin/components/CreateAccountDialog.tsx` | 2 | 1 | 2 | 4 | — |
| `admin/components/UserSearchCombobox.tsx` | 2 | 1 | — | — | — |
| `admin/components/AdminDashboard.tsx` | 2 | — | — | — | 5 |
| `admin/components/PendingTransactions.tsx` | 2 | — | — | — | 2 |
| `dashboard/accounts/[id]/CashTransactionForms.tsx` | 2 | 3 | 1 | — | — |
| `dashboard/accounts/[id]/CashTransactionHistory.tsx` | — | — | — | — | 1 |
| `dashboard/accounts/[id]/AccountDetail.tsx` | — | — | — | — | 1 |
| `dashboard/components/DashboardContent.tsx` | — | — | — | — | 2 |
| `signup/page.tsx` | 1 | 4 | — | — | — |
| `signin/page.tsx` | 1 | 2 | — | — | — |
| `dashboard/page.tsx` | 1 | — | — | — | — |
| **Total** | **13** | **11** | **3** | **4** | **11** |

### Known defects this fixes

- `CreateAccountDialog.tsx:69` is a bare `fixed inset-0` div gated on
  `if (!open) return null`. No focus trap, no escape-to-close, no scroll lock,
  no portal, no `aria-modal`. Same class of gap in `UserSearchCombobox.tsx`,
  which is a hand-built combobox with no ARIA roles.
- All four error and success paths in `CreateAccountDialog` use `alert()`.

## Why shadcn/ui (on Base UI)

1. **It is not a dependency.** `npx shadcn add dialog` copies source into the
   repo. We own and edit the files; upgrades never break us. That matches how
   this codebase already works — see the doc comment on `Badge.tsx`.
   Components are generated against **Base UI**, which is shadcn v4's default
   and where the Radix maintainers now work.
2. **Base UI primitives fix the accessibility gaps above** for free.
3. **Its colour system is exactly what theming needs.** Components reference
   `bg-primary` / `text-muted-foreground`, never `bg-blue-600`. A theme is a set
   of CSS variables and nothing else in the app changes.

### Costs, stated plainly

- New runtime deps: `@base-ui/react`, `class-variance-authority`, `clsx`,
  `tailwind-merge`, `lucide-react`, `cmdk`.
- shadcn's Tailwind 4 support is current, but its scaffolding still assumes a
  `tailwind.config` mental model in places. Tokens get wired into `@theme` in
  `globals.css` by hand.
- ~14 files need their hardcoded colours swapped for tokens. Mechanical, but it
  is the bulk of the work — and it is required for theming regardless of which
  library we pick.
- **E2E churn is real and specific.** See "Test Impact" below.

## Test Impact

E2E specs select with `page.locator('[data-testid="…"]')` — ~29 distinct ids.
Base UI renders extra wrapper elements, so each testid must be re-anchored to
the node the test actually asserts on.

The sharp edge is `<select>`. Base UI's Select renders a `<button>` trigger with
a portalled popup, so Playwright's `selectOption()` **stops working**. Four call
sites break:

- `tests/e2e/helpers.ts:27` — `selectOption("#account-type", …)`
- `tests/e2e/helpers.ts:29` — `selectOption("#cash-account-type", …)`
- `tests/e2e/helpers.ts:187` — `selectOption` on `[data-testid="transfer-target"]`
- `tests/e2e/admin.spec.ts:35,36,53` — `selectOption` on both account-type selects

**Mitigation:** these are concentrated in `helpers.ts`. Route all three through
a single `selectFromDropdown(page, testId, value)` helper *before* swapping the
components, so the spec files never change. `admin.spec.ts` should be moved onto
the helper first as a no-op refactor.

Unit tests (`pnpm test`) are tRPC-caller tests against a real DB and are
unaffected throughout.

## Phases

### Phase T1: Foundation — tokens, no visual change ✅

- [x] Install shadcn (`npx shadcn@latest init`) and its deps
- [x] Define the semantic token set in `src/styles/globals.css` under `@theme`:
      `--background`, `--foreground`, `--card`, `--card-foreground`, `--primary`,
      `--primary-foreground`, `--muted`, `--muted-foreground`, `--border`,
      `--input`, `--ring`, `--destructive`, `--radius`
- [x] Add the six badge tone pairs as tokens:
      `--tone-{neutral,positive,warning,danger,info,accent}` + `-foreground`
- [x] Set the default theme's values to match today's colours exactly, so this
      phase renders identically
- [x] Add `cn()` util at `src/lib/utils.ts`

**Result:** tokens exist, nothing looks different, nothing can regress.

### Phase T2: Component adoption ✅

- [x] Add components: `button`, `input`, `label`, `select`, `dialog`, `command`,
      `badge`, `card`, `table`, `sonner`, `popover`
- [x] **Refactor `tests/e2e/helpers.ts` to funnel all `selectOption` calls
      through one helper** (do this first — see Test Impact)
- [x] Replace `CreateAccountDialog.tsx` internals with `Dialog` — biggest
      accessibility win, and it retires the 4 `alert()` calls in favour of
      `sonner` toasts
- [x] Replace `UserSearchCombobox.tsx` with `Command` — second-biggest win
- [x] Replace the 3 native `<select>`s with `Select`
- [x] Replace the 13 `<button>`s and 11 `<input>`s
- [x] **Port `Badge.tsx` onto the shadcn badge.** Keep `statusTone()` and
      `sentenceCase()` — that logic is the valuable part, and the `sentenceCase`
      doc comment (why not the `capitalize` class) must survive. Delete
      `src/app/_components/Badge.tsx` once call sites move; do not run two badge
      systems.
- [x] Re-anchor `data-testid` attributes; `pnpm test:e2e` green

**Result:** accessible components, one badge system, no `alert()`.

**Implementation notes:**
- Components are generated against Base UI (`"style": "base-nova"` in
  components.json), shadcn v4's default. `shadcn` itself is a devDependency —
  it is a codegen CLI, and `@import "shadcn/tailwind.css"` resolves at build
  time.
- Base UI differs from the Radix-era API in three places that bit: `render`
  replaces `asChild`, `onValueChange` can hand back `null`, and Button
  defaults to `type="button"` — which silently disabled the sign-out
  formAction until it was given an explicit `type="submit"`.
- Tone mapping lives in `src/components/StatusBadge.tsx`, not in
  `ui/badge.tsx`, so the shadcn file can be re-added without clobbering it.
- Base UI keeps a Select's value in React state and never writes it to the
  DOM, so `SelectItem`s carry `option-<value>` testids for the specs to aim at.
- `chooseOption` targets `[data-slot="select-content"][data-open]`. Base UI
  keeps every select's popup mounted, and `[role="listbox"]` would also catch
  cmdk's list, which is open at the same time inside the dialog.
- The popover is sized with `--anchor-width`, Base UI's trigger-width variable.
- `shouldFilter={false}` on the user combobox is load-bearing: results come
  from `admin.users.search`, and cmdk's default substring match would hide
  rows the server deliberately returned.
- The admin tab strip is still native `<button>`s. It wants shadcn `Tabs`,
  which is a structural change rather than a control swap.
- Approve moved from green-600 to the primary button, with Reject as outline.
  Deliberate: it stops a fourth colour competing with the primary, but it does
  drop the green affordance.

### Phase T3: Token sweep ✅

- [x] Replace every remaining literal palette class with a semantic token
- [x] Resolve the blue/indigo split into a single `--primary`
- [x] Verify: `grep -rE 'bg-(blue|indigo|gray|green|red|yellow|purple)-[0-9]' src/app`
      returns nothing — and the wider
      `grep -rE '\b(bg|text|border|ring|divide)-(…|white|black)\b'` too

**Result:** the app is themeable. Everything below is now cheap.

**Implementation notes:**
- The landing page's two links go through `buttonVariants` instead of
  restating a button in Tailwind; that was the last place indigo survived.
- Form feedback boxes use `tone-danger` / `tone-positive`, so they re-colour
  with the badges rather than drifting from them.
- `text-gray-{400,500,600}` all collapsed onto `muted-foreground` — three
  weights of "less important" that no theme wants to keep distinct.
- The approval toggle reads as a switch in token terms: `bg-input` track when
  off, `bg-background` knob.
- Light/dark token parity is complete. Only `--radius` and the (unused)
  `--chart-*` lack `.dark` values, and both correctly inherit because `.dark`
  only overrides.
- One spec asserted on `.bg-red-50`. The sign-in and sign-up error boxes now
  carry testids, per the CLAUDE.md convention that a restyle must not be able
  to break a spec.

### Phase T4: Theme switching ✅

- [x] `data-theme` attribute on `<html>`; themes as `:root[data-theme="…"]` blocks
- [x] ~~Inline script in `layout.tsx`~~ — **not needed.** The de-flash script
      exists to correct a first paint driven by `localStorage`. Reading the
      cookie server-side means `<html>` is already right in the response, so
      there is nothing to correct
- [x] Persist to a cookie, not `localStorage`, so RSCs can read the choice
- [x] Theme switcher UI
- [x] Per-theme fonts: `next/font` loads at module scope, so load **all** theme
      fonts in `layout.tsx` and have each theme point `--font-sans` at a
      different `--font-*` variable. This is what makes themes feel genuinely
      different rather than recoloured.
- [x] Add a `dark` variant per theme while the token work is fresh

**T4 implementation notes:**
- Theme and mode are separate axes: `data-theme` on `<html>` for the palette,
  the `.dark` class for mode. Keeping `.dark` means shadcn's own `dark:`
  variants and `@custom-variant dark` keep working untouched.
- `ThemeProvider` writes the DOM directly and holds state only so the switcher
  can show what is active. Rendering `<html>` from React state would
  reintroduce the flash this design avoids.
- `parseTheme`/`parseMode` fall back on unrecognised values — a cookie is user
  input. Covered by a spec.
- The Kitten and Serious palettes from the T6 table landed here, because a
  switcher with one option cannot be tested. T6 is now just the Terminal
  theme and refinement.

### Phase T5: Theme graphics

Illustration is what sells the Kitten theme; without it the theme is just pink.

- [ ] Add `--illustration-*` slots to the token contract so a theme supplies art
      the same way it supplies colour
- [ ] Define the illustration surface list (small, deliberately):
      - empty states — "no accounts yet", "no pending transactions"
        (`data-testid="no-pending-transactions"` already marks one),
        "no transfer targets" (`no-transfer-targets`)
      - signin / signup page mark
      - dashboard header mark
      - success confirmation after a transaction settles
- [ ] Kitten theme: cartoon kitten art — a sleeping kitten for empty states, a
      kitten with a coin for transaction success, a kitten face as the header
      mark
- [ ] Serious theme: geometric/abstract marks, or no illustration at all — the
      slot must degrade to nothing cleanly
- [ ] Inline SVG in a `<ThemeIllustration name="…" />` component, not `<img>`,
      so art inherits `currentColor` and tracks the theme's palette
- [ ] Per-theme favicon + `metadata.icons` (currently one static `favicon.ico`)

**Sourcing:** SVG is required for `currentColor` inheritance and for staying
crisp. Options, in order of preference — commission or draw a small set (5-6
marks is the whole surface list); or adapt a permissively-licensed cartoon-animal
SVG set. Record the licence in the repo for anything third-party. Raster/AI-
generated art is a poor fit here: it will not inherit theme colour and will
fight the dark variant.

### Phase T6: Theme designs — palettes done in T4 ✅, Terminal outstanding

| | Kitten | Serious | Terminal |
|---|---|---|---|
| Primary | warm pink / peach | deep navy | amber on near-black |
| Radius | `1rem` | `0.25rem` | `0` |
| Font | rounded (Nunito / Quicksand) | Geist / IBM Plex Sans | JetBrains Mono |
| Numerals | proportional | tabular | tabular |
| Feel | generous whitespace, playful | dense, professional | high contrast |
| Illustration | cartoon kittens | minimal / none | ASCII-ish glyphs |

Terminal is optional — listed to prove the token set is general enough that a
third theme costs nothing but a variable block.

## Design Decisions

- **shadcn over a packaged library** (MUI, Mantine, Chakra): we want to own the
  source, and semantic-variable theming is the requirement.
- **Adopt components before sweeping colours**, so the sweep happens once.
- **Cookie over `localStorage`** for theme persistence: RSCs can read cookies.
- **Illustration as a theme token**, not a hardcoded asset — otherwise the
  Serious theme inherits kittens.
- **One badge system.** Port the logic, delete the old file.
- **Phase T1 is deliberately a no-op visually.** It de-risks everything after it.

## Out of Scope

- Mobile-responsive work (tracked in `bank_accounts_plan.md` Phase 5)
- Any change to tRPC routers, services, or schema
- Per-user theme persistence in the database — cookie-only for now; a
  `user_settings.theme` column is a natural follow-up

---

*Sequenced so that T1–T3 are worth doing on their own merits even if a second
theme never ships — they are what makes T4–T6 cheap.*
