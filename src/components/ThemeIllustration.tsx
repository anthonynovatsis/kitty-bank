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

/*
 * Shared kitten geometry, drawn on a 64x64 grid.
 *
 * Groups carry data-role so a commissioned replacement can be dropped in
 * against the same contract — see plans/illustration_brief.md. Colour comes
 * from the role, never from a literal, which is what lets one file render warm
 * pink on cream and lighter pink on near-black.
 */

type Expression = "open" | "asleep" | "happy";

/** Ears, head, eyes, nose and whiskers. The face every mark is built from. */
function KittenFace({
  expression = "open",
  whiskers = true,
}: {
  expression?: Expression;
  whiskers?: boolean;
}) {
  return (
    <>
      <g data-role="body">
        <path d="M13.5 26 Q15 8.5 19.2 9.8 Q25 12.8 30.8 19 Z" />
        <path d="M50.5 26 Q49 8.5 44.8 9.8 Q39 12.8 33.2 19 Z" />
        <ellipse cx="32" cy="34" rx="19.5" ry="16.6" />
      </g>

      <g data-role="cutout" className="fill-background">
        <path d="M17.6 23.4 Q18.6 13.8 20.8 14.6 Q24.6 16.8 27.8 20.4 Z" />
        <path d="M46.4 23.4 Q45.4 13.8 43.2 14.6 Q39.4 16.8 36.2 20.4 Z" />
      </g>

      {expression === "open" && (
        <>
          <g data-role="cutout" className="fill-background">
            <ellipse cx="24.6" cy="32.6" rx="5.2" ry="6.6" />
            <ellipse cx="39.4" cy="32.6" rx="5.2" ry="6.6" />
          </g>
          <g data-role="ink" className="fill-art-ink">
            <ellipse cx="25.4" cy="33" rx="3.1" ry="4.7" />
            <ellipse cx="40.2" cy="33" rx="3.1" ry="4.7" />
          </g>
          <g data-role="cutout" className="fill-background">
            <circle cx="24.2" cy="30.4" r="1.2" />
            <circle cx="39" cy="30.4" r="1.2" />
          </g>
        </>
      )}

      {expression !== "open" && (
        <g
          data-role="ink"
          className="stroke-art-ink"
          fill="none"
          strokeWidth="1.9"
          strokeLinecap="round"
        >
          {/* Closed and content: arcs that curve upward at the outer edge. */}
          <path d="M20.4 33.6 Q24.6 29.2 28.8 33.6" />
          <path d="M35.2 33.6 Q39.4 29.2 43.6 33.6" />
        </g>
      )}

      <g data-role="ink" className="fill-art-ink">
        <path d="M29.9 39 Q32 38.2 34.1 39 Q32 42.6 29.9 39 Z" />
      </g>

      {expression === "happy" && (
        <g data-role="cutout" className="fill-background">
          <path d="M27.6 41.6 Q32 47.6 36.4 41.6 Z" />
        </g>
      )}

      {whiskers && (
        <g
          data-role="hint"
          className="stroke-muted-foreground"
          strokeWidth="1.7"
          strokeLinecap="round"
          fill="none"
        >
          <path d="M6.4 31.6 L17.4 34" />
          <path d="M6.8 38.4 L17.4 37.4" />
          <path d="M57.6 31.6 L46.6 34" />
          <path d="M57.2 38.4 L46.6 37.4" />
        </g>
      )}
    </>
  );
}

/**
 * Place the face at a chosen centre and size.
 *
 * KittenFace draws a head centred on (32, 34) of its own grid. Composing by
 * hand meant every mark needed that offset undone by eye, which is exactly how
 * the first attempt ended up with heads floating beside their bodies. Given a
 * scale `s`, the head lands at `(32s, 34s)`, so the translate that puts it at
 * `(cx, cy)` is the subtraction below — done once, here.
 */
function Face({
  cx,
  cy,
  scale = 1,
  ...face
}: {
  cx: number;
  cy: number;
  scale?: number;
  expression?: Expression;
  whiskers?: boolean;
}) {
  const tx = cx - 32 * scale;
  const ty = cy - 34 * scale;
  return (
    <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
      <KittenFace {...face} />
    </g>
  );
}

/** A seated body with front paws, sized to sit under a face. */
function SittingBody({ cx, cy = 47 }: { cx: number; cy?: number }) {
  return (
    <g data-role="body">
      <ellipse cx={cx} cy={cy} rx="12.5" ry="13" />
      <ellipse cx={cx - 6} cy={cy + 11} rx="4.6" ry="3.4" />
      <ellipse cx={cx + 6} cy={cy + 11} rx="4.6" ry="3.4" />
    </g>
  );
}

/** The tail, stroked so it keeps an even weight when the mark is scaled down. */
function Tail({ d }: { d: string }) {
  return (
    <g data-role="body">
      <path
        d={d}
        className="stroke-primary"
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

/** Every kitten mark shares this frame: one grid, body colour as the default fill. */
function KittenMark({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 64 64" className="fill-primary size-full">
      {children}
    </svg>
  );
}

const KITTEN_ART: Record<IllustrationName, React.ReactNode> = {
  // The identity mark: face only, so it survives at 32px beside the wordmark.
  brand: (
    <KittenMark>
      <KittenFace />
    </KittenMark>
  ),

  // Curled up asleep. Nothing to do yet.
  "empty-accounts": (
    <KittenMark>
      <Tail d="M48 52 Q60 49 54 39" />
      <g data-role="body">
        <ellipse cx="34" cy="44" rx="22" ry="14" />
      </g>
      <Face cx={19} cy={40} scale={0.62} expression="asleep" />
      <g data-role="body">
        <ellipse cx="24" cy="54" rx="10" ry="4.4" />
      </g>
      <g
        data-role="hint"
        className="stroke-muted-foreground"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M40 20 h6 l-6 6 h6" />
        <path d="M49 10 h4.5 l-4.5 4.5 h4.5" />
      </g>
    </KittenMark>
  ),

  // Sitting beside an empty bowl. Nothing has come in.
  "empty-transactions": (
    <KittenMark>
      <Tail d="M48 56 Q60 55 55 44" />
      <SittingBody cx={38} />
      <Face cx={38} cy={22} scale={0.7} whiskers={false} />
      <g data-role="prop" className="fill-accent">
        <path d="M3 50 h24 l-3 11 a3 3 0 0 1 -3 2 h-12 a3 3 0 0 1 -3 -2 Z" />
        <ellipse cx="15" cy="50" rx="12" ry="3.4" />
      </g>
      <g
        data-role="hint"
        className="stroke-muted-foreground"
        strokeWidth="1.9"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M4 40 L7 43.5" />
        <path d="M12 37 L12.6 41.5" />
      </g>
    </KittenMark>
  ),

  // Sitting with a single coin. Nothing invested yet.
  "empty-holdings": (
    <KittenMark>
      <Tail d="M48 56 Q60 55 55 44" />
      <SittingBody cx={38} />
      <Face cx={38} cy={22} scale={0.7} whiskers={false} />
      <g data-role="coin" className="fill-tone-warning">
        <ellipse cx="14" cy="54" rx="11" ry="7.5" />
      </g>
      <g
        data-role="hint"
        className="stroke-tone-warning-foreground"
        strokeWidth="1.6"
        fill="none"
        opacity="0.5"
      >
        <ellipse cx="14" cy="54" rx="6.5" ry="4" />
      </g>
      <g
        data-role="hint"
        className="stroke-muted-foreground"
        strokeWidth="1.9"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M4 41 L7 44.5" />
        <path d="M12 37.5 L12.6 42" />
        <path d="M21 40 L18.5 43.5" />
      </g>
    </KittenMark>
  ),

  /*
   * A pleased face, in currentColor rather than the palette.
   *
   * Every other mark sits on a neutral surface and can use the body role. This
   * one sits inside the positive-tone message bar, where body pink on a green
   * strip is two unrelated colours arguing. It inherits the bar's own text
   * colour instead, which is the whole reason it stays a single-tone
   * silhouette.
   */
  success: (
    <svg viewBox="0 0 64 64" className="size-full" fill="currentColor">
      <g data-role="body">
        <path d="M13.5 26 Q15 8.5 19.2 9.8 Q25 12.8 30.8 19 Z" />
        <path d="M50.5 26 Q49 8.5 44.8 9.8 Q39 12.8 33.2 19 Z" />
        <ellipse cx="32" cy="34" rx="19.5" ry="16.6" />
      </g>
      <g
        data-role="cutout"
        className="text-tone-positive"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M20.4 34 Q24.6 29 28.8 34" />
        <path d="M35.2 34 Q39.4 29 43.6 34" />
      </g>
      <g data-role="cutout" className="text-tone-positive">
        <path d="M26.4 39.4 Q32 47.4 37.6 39.4 Z" />
      </g>
      <g
        data-role="hint"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
        opacity="0.75"
      >
        <path d="M7 31.6 L17.4 34" />
        <path d="M7.4 38.4 L17.4 37.4" />
        <path d="M57 31.6 L46.6 34" />
        <path d="M56.6 38.4 L46.6 37.4" />
      </g>
    </svg>
  ),

  // Everyday spending: a bank card held in front.
  "account-checking": (
    <KittenMark>
      <Face cx={32} cy={19} scale={0.62} whiskers={false} />
      <g data-role="body">
        <ellipse cx="32" cy="40" rx="14" ry="11" />
      </g>
      <g data-role="prop" className="fill-accent">
        <rect x="8" y="43" width="48" height="19" rx="4" />
      </g>
      <g data-role="coin" className="fill-tone-warning">
        <rect x="13" y="48" width="10" height="7" rx="1.6" />
      </g>
      <g data-role="hint" className="fill-muted-foreground" opacity="0.55">
        <rect x="36" y="56" width="7" height="2.4" rx="1.2" />
        <rect x="46" y="56" width="7" height="2.4" rx="1.2" />
      </g>
    </KittenMark>
  ),

  // Putting money away: a coin going into a piggy bank.
  "account-savings": (
    <KittenMark>
      <Face cx={26} cy={17} scale={0.55} whiskers={false} />
      <g data-role="body">
        <ellipse cx="26" cy="35" rx="12" ry="10" />
      </g>
      <g data-role="prop" className="fill-accent">
        <ellipse cx="34" cy="50" rx="19" ry="12.5" />
        <path d="M16 47 q-6 -1 -7 4.5 q4.5 3.5 8 1 Z" />
        <ellipse cx="49" cy="53" rx="6.5" ry="5.5" />
        <rect x="23" y="60" width="5.5" height="3.5" rx="1.7" />
        <rect x="39" y="60" width="5.5" height="3.5" rx="1.7" />
      </g>
      <g data-role="hint" className="fill-muted-foreground" opacity="0.45">
        <rect x="29" y="41" width="12" height="2.6" rx="1.3" />
        <circle cx="52" cy="53" r="1.4" />
      </g>
      <g data-role="coin" className="fill-tone-warning">
        <circle cx="35" cy="34" r="7" />
      </g>
      <g
        data-role="hint"
        className="stroke-tone-warning-foreground"
        strokeWidth="1.5"
        fill="none"
        opacity="0.45"
      >
        <circle cx="35" cy="34" r="3.6" />
      </g>
    </KittenMark>
  ),

  // Growth: a rising chart the cat is sitting beside.
  "account-investment": (
    <KittenMark>
      <Face cx={17} cy={24} scale={0.55} whiskers={false} />
      <g data-role="body">
        <ellipse cx="17" cy="45" rx="12" ry="11" />
        <rect x="34" y="44" width="8" height="16" rx="2.2" />
        <rect x="45" y="36" width="8" height="24" rx="2.2" />
        <rect x="56" y="27" width="7" height="33" rx="2.2" />
      </g>
      <g
        data-role="hint"
        className="stroke-muted-foreground"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M33 41 L45 31 L57 18" />
        <path d="M49 16.5 L58.5 16 L58 25" />
        <path d="M31 61 H63" />
      </g>
    </KittenMark>
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
