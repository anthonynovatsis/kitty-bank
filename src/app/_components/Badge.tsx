/**
 * The one pill-shaped label used across the app.
 *
 * Badges previously carried hand-written Tailwind at each call site, which is
 * how they drifted into a mix of "savings", "Investment" and "0 pending".
 * Anything badge-shaped should come from here.
 */

export type BadgeTone =
  | "neutral" // closed, inactive, non-privileged
  | "positive" // active, completed
  | "warning" // pending, needs attention
  | "danger" // rejected, failed
  | "info" // cash account types
  | "accent"; // investment, admin

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-gray-100 text-gray-600",
  positive: "bg-green-100 text-green-800",
  warning: "bg-yellow-100 text-yellow-800",
  danger: "bg-red-100 text-red-800",
  info: "bg-blue-100 text-blue-800",
  accent: "bg-purple-100 text-purple-800",
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

export function Badge({
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
    <span
      data-testid={testId}
      title={title}
      className={`inline-block rounded-full px-2 py-1 text-xs font-medium whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {sentenceCase(children)}
    </span>
  );
}
