import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";

/**
 * The one pill-shaped label used across the app.
 *
 * Badges previously carried hand-written Tailwind at each call site, which is
 * how they drifted into a mix of "savings", "Investment" and "0 pending".
 * Anything badge-shaped should come from here.
 *
 * Rendering goes through shadcn's Badge; this file owns only the mapping from
 * meaning to colour. That split is deliberate — `ui/badge.tsx` stays untouched
 * so `shadcn add badge` can be re-run without clobbering the tones below.
 */

export type BadgeTone =
  | "neutral" // closed, inactive, non-privileged
  | "positive" // active, completed
  | "warning" // pending, needs attention
  | "danger" // rejected, failed
  | "info" // cash account types
  | "accent"; // investment, admin

/**
 * Tones name a meaning, not a colour, and resolve through theme tokens — so a
 * theme is free to render "positive" as something other than green.
 */
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-tone-neutral text-tone-neutral-foreground",
  positive: "bg-tone-positive text-tone-positive-foreground",
  warning: "bg-tone-warning text-tone-warning-foreground",
  danger: "bg-tone-danger text-tone-danger-foreground",
  info: "bg-tone-info text-tone-info-foreground",
  accent: "bg-tone-accent text-tone-accent-foreground",
};

/**
 * Uppercase the first letter only.
 *
 * Deliberately not the `capitalize` CSS class, which capitalises *every* word
 * and would render "back-dated" as "Back-Dated".
 *
 * Note this is a no-op on a label that opens with a digit ("2 Pending"), so
 * such labels must already carry their own capitalisation.
 */
function sentenceCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Tone for a value from a status column, so callers don't each decide. */
export function statusTone(status: string): BadgeTone {
  switch (status) {
    case "active":
    case "completed":
      return "positive";
    case "pending":
      return "warning";
    case "rejected":
      return "danger";
    case "approved":
      return "info";
    default:
      return "neutral";
  }
}

export function StatusBadge({
  children,
  tone = "neutral",
  testId,
  title,
}: {
  /** Plain text — badges label a single value, they do not nest markup. */
  children: string;
  tone?: BadgeTone;
  testId?: string;
  title?: string;
}) {
  return (
    <Badge
      data-testid={testId}
      title={title}
      className={cn("border-transparent", TONE_CLASSES[tone])}
    >
      {sentenceCase(children)}
    </Badge>
  );
}
