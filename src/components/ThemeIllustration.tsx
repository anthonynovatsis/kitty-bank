import {
  Banknote,
  ChartCandlestick,
  CircleCheck,
  Inbox,
  Landmark,
  PiggyBank,
  Wallet,
} from "lucide-react";
import { cn } from "~/lib/utils";

/**
 * A themed mark for an empty state.
 *
 * Both variants are rendered and CSS picks one (see the illustration rules in
 * globals.css). That is deliberate: branching on the theme name in JS would
 * make this a client component, which would mean a hydration boundary on pages
 * that are currently server-rendered, and a frame where the wrong art shows.
 * Every theme is one block of variables plus one selector — no component
 * anywhere asks which theme is active.
 *
 * Art is decorative and always sits next to explanatory text, so it is hidden
 * from assistive technology rather than given a label that would repeat it.
 *
 * The Kitten marks are placeholders in the honest sense: correct in structure,
 * colour and sizing, but drawn as flat geometry. Replacing them with
 * illustrated art means editing this file and nothing else — see
 * plans/ui_theming_plan.md for the brief that keeps that a drop-in.
 */

export type IllustrationName =
  | "brand"
  | "empty-accounts"
  | "empty-transactions"
  | "empty-holdings"
  | "success"
  | "account-checking"
  | "account-savings"
  | "account-investment";

/*
 * Default theme: lucide, which is already the app's icon language. The plan
 * calls for "minimal / none" here, and restraint is the point of the theme.
 */
const DEFAULT_ART: Record<IllustrationName, React.ReactNode> = {
  brand: <Landmark className="text-primary size-full" strokeWidth={1.5} />,
  "empty-accounts": <Wallet className="size-full" strokeWidth={1.25} />,
  "empty-transactions": <Inbox className="size-full" strokeWidth={1.25} />,
  "empty-holdings": (
    <ChartCandlestick className="size-full" strokeWidth={1.25} />
  ),
  success: <CircleCheck className="size-full" strokeWidth={1.75} />,
  "account-checking": <Banknote className="size-full" strokeWidth={1.5} />,
  "account-savings": <PiggyBank className="size-full" strokeWidth={1.5} />,
  "account-investment": (
    <ChartCandlestick className="size-full" strokeWidth={1.5} />
  ),
};

/*
 * Kitten theme. Fills are Tailwind colour utilities rather than literal
 * colours, so the art tracks the palette and the dark variant for free — the
 * same rule the rest of src/app follows.
 */

/** Ears, head and face, shared by every kitten mark. */
function KittenHead({ asleep = false }: { asleep?: boolean }) {
  return (
    <>
      <path d="M15 26 L18 10 L30 19 Z" className="fill-primary" />
      <path d="M49 26 L46 10 L34 19 Z" className="fill-primary" />
      <path d="M19 24 L20.5 15 L27 20 Z" className="fill-background/60" />
      <path d="M45 24 L43.5 15 L37 20 Z" className="fill-background/60" />
      <circle cx="32" cy="34" r="18" className="fill-primary" />
      {asleep ? (
        <>
          <path
            d="M22 32 q4 4 8 0"
            className="stroke-background/80"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M34 32 q4 4 8 0"
            className="stroke-background/80"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </>
      ) : (
        <>
          <circle cx="26" cy="32" r="2.4" className="fill-background" />
          <circle cx="38" cy="32" r="2.4" className="fill-background" />
        </>
      )}
      <path d="M30.5 38 L33.5 38 L32 40.5 Z" className="fill-background" />
      <path
        d="M32 41 v2"
        className="stroke-background/80"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  );
}

const KITTEN_ART: Record<IllustrationName, React.ReactNode> = {
  // The brand mark: just the face, sized to sit beside the wordmark.
  brand: (
    <svg viewBox="0 0 64 64" className="size-full">
      <KittenHead />
      <path
        d="M12 34 h-6 M12 38 h-6 M52 34 h6 M52 38 h6"
        className="stroke-primary/50"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),

  // Curled up asleep — nothing here yet, so the cat is resting.
  "empty-accounts": (
    <svg viewBox="0 0 64 64" className="size-full">
      <ellipse cx="32" cy="42" rx="24" ry="15" className="fill-accent" />
      <path
        d="M54 44 q6 -3 3 -10"
        className="stroke-primary"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <g transform="translate(0 4) scale(0.78) translate(9 6)">
        <KittenHead asleep />
      </g>
      <path
        d="M44 20 q3 -3 0 -6 M50 15 q4 -4 0 -8"
        className="stroke-muted-foreground/50"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  ),

  // An empty bowl: no transactions have arrived.
  "empty-transactions": (
    <svg viewBox="0 0 64 64" className="size-full">
      <g transform="translate(0 -6) scale(0.72) translate(12 4)">
        <KittenHead />
      </g>
      <path
        d="M14 44 h36 a4 4 0 0 1 -4 10 h-28 a4 4 0 0 1 -4 -10 Z"
        className="fill-accent"
      />
      <ellipse cx="32" cy="44" rx="18" ry="3.5" className="fill-primary/25" />
    </svg>
  ),

  // A coin the cat has not been given yet.
  "empty-holdings": (
    <svg viewBox="0 0 64 64" className="size-full">
      <circle cx="44" cy="44" r="13" className="fill-tone-warning" />
      <circle
        cx="44"
        cy="44"
        r="9"
        className="stroke-tone-warning-foreground/50"
        strokeWidth="1.5"
        fill="none"
      />
      <g transform="translate(-6 -4) scale(0.66) translate(6 6)">
        <KittenHead />
      </g>
      <path
        d="M20 50 a5 5 0 0 1 8 0"
        className="stroke-primary"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  ),

  /*
   * A pleased face, in currentColor rather than the palette.
   *
   * Every other mark sits on a neutral surface and can use fill-primary. This
   * one sits inside the positive-tone message bar, where a pink cat on a green
   * strip is two unrelated colours arguing. Inheriting the bar's own text
   * colour is the whole reason single-tone marks are worth keeping simple.
   */
  success: (
    <svg viewBox="0 0 64 64" className="size-full" fill="currentColor">
      <path d="M15 26 L18 10 L30 19 Z" />
      <path d="M49 26 L46 10 L34 19 Z" />
      <circle cx="32" cy="34" r="18" />
      <path
        d="M22 32 q4 4 8 0 M34 32 q4 4 8 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        className="text-tone-positive"
      />
      <path d="M30.5 38 L33.5 38 L32 40.5 Z" className="text-tone-positive" />
    </svg>
  ),

  /*
   * Account-card marks. At this size the head alone is the only thing that
   * survives, so the type is carried by what sits beside it rather than by a
   * different cat.
   */
  "account-checking": (
    <svg viewBox="0 0 64 64" className="size-full">
      <rect
        x="8"
        y="38"
        width="48"
        height="18"
        rx="4"
        className="fill-accent"
      />
      <g transform="translate(0 -8) scale(0.68) translate(15 6)">
        <KittenHead />
      </g>
    </svg>
  ),
  "account-savings": (
    <svg viewBox="0 0 64 64" className="size-full">
      <circle cx="32" cy="44" r="16" className="fill-tone-warning" />
      <path
        d="M26 44 h12"
        className="stroke-tone-warning-foreground/50"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <g transform="translate(0 -10) scale(0.6) translate(21 4)">
        <KittenHead />
      </g>
    </svg>
  ),
  "account-investment": (
    <svg viewBox="0 0 64 64" className="size-full">
      <path
        d="M10 50 L24 36 L34 44 L54 22"
        className="stroke-primary"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M44 22 h10 v10"
        className="stroke-primary fill-none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g transform="translate(-14 6) scale(0.5) translate(6 6)">
        <KittenHead />
      </g>
    </svg>
  ),
};

export function ThemeIllustration({
  name,
  className,
}: {
  name: IllustrationName;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "text-muted-foreground/60 block size-16 shrink-0",
        className,
      )}
    >
      <span data-theme-art="default" className="size-full">
        {DEFAULT_ART[name]}
      </span>
      <span data-theme-art="kitten" className="size-full">
        {KITTEN_ART[name]}
      </span>
    </span>
  );
}

/**
 * An empty panel: a themed mark above the sentence explaining the emptiness.
 *
 * Kept here so every empty state agrees on spacing and tone. Small inline
 * hints — the one under the transfer select, say — deliberately do not use
 * this; an illustration next to a 12px caption is louder than the thing it
 * is captioning.
 */
export function EmptyState({
  illustration,
  testId,
  children,
}: {
  illustration: IllustrationName;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col items-center gap-3 py-8 text-center"
    >
      <ThemeIllustration name={illustration} />
      <p className="text-muted-foreground text-sm">{children}</p>
    </div>
  );
}
