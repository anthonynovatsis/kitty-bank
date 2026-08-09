/**
 * Money is integer cents everywhere: in the database, in the services, and
 * across the tRPC boundary. Floating point never touches a stored value.
 *
 * That leaves exactly two places where a decimal exists, both at the edge —
 * `toCents` on the way in from a form, and `formatCents` on the way out to a
 * screen. Nothing in between divides, so nothing in between can drift.
 *
 * The unit lives in the *type* rather than in every field name. `balance` and
 * `amount` read as they should, while `Cents` is a distinct type that a plain
 * number cannot be passed as — so handing a decimal to `formatCents`, or a
 * cents value to something expecting decimals, is a compile error rather than
 * a page quietly rendering $25050.00.
 */

declare const CENTS: unique symbol;

/** An integer number of cents. Constructed only through the helpers below. */
export type Cents = number & { readonly [CENTS]: true };

/** Largest amount any single transaction may carry: $10,000,000 in cents. */
export const MAX_AMOUNT_CENTS = 1_000_000_000;

/**
 * Brand a number that is already cents.
 *
 * Needed after arithmetic: adding two `Cents` gives a plain `number`, because
 * TypeScript has no way to know the result is still whole cents. Wrapping the
 * result is the point at which you assert it — so `cents(a + b)` is deliberate
 * and `a + b` alone will not type-check where `Cents` is expected.
 */
export function cents(value: number): Cents {
  return value as Cents;
}

/**
 * A decimal amount as typed by a person, to cents.
 *
 * Rounds rather than truncates, so 0.1 + 0.2 arriving as 0.30000000000000004
 * still lands on 30. Conversion happens on the server, so the rounding rule is
 * ours rather than whatever the client did.
 */
export function toCents(amount: number): Cents {
  return cents(Math.round(amount * 100));
}

/** Total a collection, keeping the result branded. */
export function sumCents<T>(
  items: readonly T[],
  of: (item: T) => number,
): Cents {
  return cents(items.reduce((total, item) => total + of(item), 0));
}

/** Cents back to a decimal. Display only — never feed this into arithmetic. */
function toAmount(value: Cents): number {
  return value / 100;
}

const FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** The one place cents become a string a person reads. */
export function formatCents(value: Cents): string {
  return FORMATTER.format(toAmount(value));
}
