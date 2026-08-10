import { eq } from "drizzle-orm";

import type { Transaction } from "~/server/db";
import { userSettings } from "~/server/db/schema";

/**
 * Whose transactions need an admin to approve them.
 *
 * Deliberately not part of any one service: the rule is about the user, not
 * about what they are trying to do, so cash movements and investment trades
 * both consult it and both must answer the same way.
 */

/** True when this user's transactions have to be approved by an admin. */
export async function requiresApproval(tx: Transaction, userId: string) {
  const settings = await tx.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
  });
  // A user with no settings row is untrusted by default.
  return settings?.requiresTransactionApproval ?? true;
}
