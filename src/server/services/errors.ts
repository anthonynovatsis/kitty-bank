import { TRPCError } from "@trpc/server";

/**
 * The refusal shape every domain service shares.
 *
 * A single procedure can fail several ways that map to one tRPC code —
 * `user.cash.transfer` alone has four BAD_REQUESTs — so callers that need to
 * tell them apart branch on a `kind` rather than parsing message strings.
 *
 * Each service declares its own kinds and the code each one maps to, then gets
 * a matching `error`/`is` pair back from `defineRuleErrors`. That keeps the
 * kinds domain-specific while the machinery stays in one place: a second
 * service copying this file would be two implementations free to drift.
 */

/**
 * A refusal from a service's rules.
 *
 * A plain Error, deliberately: it carries no transport concepts, so the day
 * something outside tRPC calls these services — a scheduled interest posting, a
 * bulk importer — it is already the right shape. The factories below wrap it in
 * a TRPCError for the routers and leave this as the `cause`.
 */
export class RuleViolation extends Error {
  constructor(
    /** Which service refused: "cash", "investments". */
    readonly domain: string,
    readonly kind: string,
    message: string,
  ) {
    super(message);
    this.name = "RuleViolation";
  }
}

/** Pull the violation out of either a bare throw or its TRPCError wrapper. */
function violationOf(error: unknown): RuleViolation | null {
  if (error instanceof RuleViolation) return error;
  if (error instanceof TRPCError && error.cause instanceof RuleViolation) {
    return error.cause;
  }
  return null;
}

/**
 * Build the `error`/`is` pair for one service.
 *
 * `codes` is the kind→tRPC code table and doubles as the list of kinds, so the
 * two cannot fall out of step. Codes follow the split established by `cash.ts`:
 * malformed input is BAD_REQUEST, state that forbids the operation is CONFLICT,
 * a missing row is NOT_FOUND.
 *
 * The domain is part of the match, not decoration. Services share kind names —
 * both cash and investments can refuse with `account_not_found` — and without
 * it `isCashError(someInvestmentFailure, "account_not_found")` would answer
 * true, which is exactly the confusion `kind` exists to prevent.
 */
export function defineRuleErrors<Kind extends string>(
  domain: string,
  codes: Record<Kind, TRPCError["code"]>,
) {
  return {
    /** Build the TRPCError the routers throw, with the domain error as cause. */
    error: (kind: Kind, message: string) =>
      new TRPCError({
        code: codes[kind],
        message,
        cause: new RuleViolation(domain, kind, message),
      }),

    /** Narrow an unknown error to this service's refusals, optionally one kind. */
    is: (error: unknown, kind?: Kind): boolean => {
      const violation = violationOf(error);
      return (
        violation !== null &&
        violation.domain === domain &&
        (kind === undefined || violation.kind === kind)
      );
    },
  };
}
