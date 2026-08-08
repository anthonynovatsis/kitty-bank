# Illustration Brief — Kitty Bank "Kitten" theme

## What this is

Kitty Bank is a small banking app. It ships two visual themes: a **Default**
theme (deep navy, businesslike, no illustration) and a **Kitten** theme (warm,
soft, playful). This brief covers the Kitten theme's artwork only.

We need **8 marks**, in one coherent style, delivered as SVG.

Placeholder versions are already in the product — flat geometry, correct in
structure and colour but with no real character. They exist so the engineering
is finished and your work is a drop-in replacement. See
`src/components/ThemeIllustration.tsx`.

## The single most important constraint

**Colour must be specified by role, not by value.**

The app re-colours your artwork at runtime. The same kitten renders warm pink on
cream in light mode and lighter pink on near-black in dark mode, from one file.
That only works if each shape is assigned to a named role and grouped
accordingly. If the art arrives with baked-in colours, it breaks in dark mode
and cannot be themed — that is the one failure mode that makes the work
unusable.

There are **five roles**. Please use no more than these:

| Role | What it's for | Kitten light | Kitten dark |
|---|---|---|---|
| `body` | the cat: head, ears, tail, limbs | `#E65D76` | `#FC8999` |
| `cutout` | shapes punched *out* of the body — eyes, nose, inner ear | `#FFF8F4` | `#271516` |
| `prop` | objects the cat interacts with — bowl, card, cushion | `#FFDFD8` | `#4B2F31` |
| `coin` | money specifically — coins, notes | `#FFEBB1` | `#6A3A06` |
| `hint` | faint detail — whiskers, motion lines, "z"s | `#846261` | `#C4AAA6` |

The hex values are what those roles resolve to today, given so you can preview.
**Do not treat them as the spec** — the spec is the role name. We swap the
values.

Background for previewing: `#FFF8F4` light, `#271516` dark. Cards sit on
`#FFFEFD` / `#361F21`.

## The 8 marks

Sizes are the **rendered** size in the product. Everything is drawn on a
64 × 64 viewBox and scaled down, so each mark must be legible at the size in
this column — not at 64px.

| # | Name | Renders at | Where it appears | What it shows |
|---|---|---|---|---|
| 1 | `brand` | **32px** | App header, every page. Sits left of the words "Kitty Bank" | A kitten face. The identity mark — most important of the eight |
| 2 | `empty-accounts` | 64px | Dashboard, when a new user has no accounts yet | A kitten curled up asleep. Nothing to do yet |
| 3 | `empty-transactions` | 64px | Admin approval queue, when nothing is waiting | A kitten beside an empty bowl. Nothing has come in |
| 4 | `empty-holdings` | 64px | Investment account with no holdings | A kitten looking at a single coin. Nothing invested yet |
| 5 | `success` | **24px** | Inside a green confirmation bar, after money moves | A pleased kitten face. **Special — see below** |
| 6 | `account-checking` | 36px | Dashboard card, everyday account | Kitten + a bank card |
| 7 | `account-savings` | 36px | Dashboard card, savings account | Kitten + a coin or piggy bank |
| 8 | `account-investment` | 36px | Dashboard card, investment account | Kitten + a rising chart line |

### Mark 5 (`success`) is different

It sits **inside** a coloured bar, so it cannot use the palette above — a pink
cat on a green strip is two unrelated colours arguing. Draw it as a **single-tone
silhouette** with no fills of its own: one shape, all of it `body`, plus cutouts.
The app paints it with the bar's own text colour.

At 24px this is roughly emoji scale. Ears, head outline and closed happy eyes
are all that will survive — please design for that rather than shrinking a
detailed face.

### Marks 6–8 are small

At 36px a scene does not read. The kitten will be a head-and-shoulders at most,
with one clear object beside it. The three must be **distinguishable from each
other at a glance** — that is their job on the dashboard.

## Technical requirements

- **SVG source files**, one per mark. Not exported outlines, not PDF, not PNG.
- **`viewBox="0 0 64 64"`** on all eight, so they scale from one grid.
- **Flat vector only.** No gradients, no mesh fills, no blurs, no drop shadows,
  no embedded raster images, no clipping to raster masks.
- **Group by role.** Each top-level group named exactly `body`, `cutout`,
  `prop`, `coin`, `hint`. A shape's colour is decided by which group it is in.
  This is what we script against.
- **No `<style>` blocks, no CSS classes, no inline `style=` attributes.** Fills
  as plain `fill="…"` on the shape or its group.
- **No text elements.** Convert any lettering to paths, or leave it out.
- Consistent stroke weight across the set if you use strokes at all; prefer
  filled shapes, which scale more predictably.

## Style direction

- **Warm and friendly, not cutesy.** This is a real banking app that a family
  uses, including for a child's money. It should feel welcoming and
  trustworthy — not like a toy.
- **Simple enough to survive 24px.** The brand mark and success mark do most of
  the work, and both are small. Restraint reads better than detail here.
- **One cat.** The same character across all eight, in different poses. It is a
  mascot, not a cast.
- Rounded forms suit the theme — its typeface is Nunito and its corner radius is
  generous (16px).

## Please avoid

- Baked-in colour that ignores the role groups (the one blocking failure)
- More than five colours
- Anything that only reads at large size
- Outlines/strokes as the primary construction — they thin out badly when scaled
- Human figures, currency symbols, or country-specific money imagery

## Acceptance checklist

We will check each file for:

- [ ] Opens as editable SVG with a `0 0 64 64` viewBox
- [ ] Top-level groups named `body` / `cutout` / `prop` / `coin` / `hint`
- [ ] No gradients, filters, embedded images, `<style>`, or `style=` attributes
- [ ] Legible at the rendered size in the table above, on both light and dark
      backgrounds
- [ ] `success` is single-tone and readable at 24px
- [ ] Marks 6–8 are mutually distinguishable at 36px
- [ ] Recolouring a role changes every shape in that role and nothing else

## Licensing

Full commercial rights assigned to the project, in writing, including the right
to modify and to recolour. Please confirm the work is original and not derived
from a licensed stock set.

## Practicalities

- 8 marks, one style, one character.
- Happy to review at sketch stage before you commit to final vectors — the
  riskiest thing here is the 24px legibility, and that is cheapest to check
  early.
- If it helps, the placeholder geometry currently in the product shows the
  intended composition and sizing for each mark, and can be opened from
  `src/components/ThemeIllustration.tsx`.
