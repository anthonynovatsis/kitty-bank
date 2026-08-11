import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, like } from "drizzle-orm";
import { createTRPCRouter, adminProcedure } from "~/server/api/trpc";
import { cents, sumCents } from "~/lib/money";
import {
  assertSettleableType,
  cashError,
  settleCashMovement,
} from "~/server/services/cash";
import {
  assertSettleableTrade,
  investmentError,
  isOutOfOrder,
  rebuildHolding,
  settleSplit,
  settleTrade,
} from "~/server/services/investments";
import type { db as database } from "~/server/db";
import {
  cashAccounts,
  cashTransactions,
  investmentAccounts,
  investmentTransactions,
  users,
  userSettings,
} from "~/server/db/schema";

export const adminRouter = createTRPCRouter({
  // User management
  users: createTRPCRouter({
    // Search users for account creation combobox
    search: adminProcedure
      .input(
        z.object({
          query: z.string().min(1),
        }),
      )
      .query(async ({ ctx, input }) => {
        const searchResults = await ctx.db.query.users.findMany({
          where: and(like(users.name, `%${input.query}%`)),
          columns: {
            id: true,
            name: true,
            email: true,
          },
          limit: 10,
        });

        return searchResults;
      }),

    // List all users with account summaries and settings
    list: adminProcedure.query(async ({ ctx }) => {
      const allUsers = await ctx.db.query.users.findMany({
        with: {
          settings: true,
          cashAccounts: {
            columns: {
              id: true,
              balance: true,
              status: true,
            },
          },
          investmentAccounts: {
            columns: {
              id: true,
              status: true,
            },
          },
        },
        orderBy: (u, { asc }) => [asc(u.createdAt)],
      });

      return allUsers.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        isAdmin: user.settings?.isAdmin ?? false,
        requiresTransactionApproval:
          user.settings?.requiresTransactionApproval ?? true,
        cashAccountCount: user.cashAccounts.length,
        activeCashAccountCount: user.cashAccounts.filter(
          (a) => a.status === "active",
        ).length,
        totalCashBalance: sumCents(user.cashAccounts, (a) => a.balance),
        investmentAccountCount: user.investmentAccounts.length,
        activeInvestmentAccountCount: user.investmentAccounts.filter(
          (a) => a.status === "active",
        ).length,
      }));
    }),

    // Update transaction approval setting for a user
    updateApprovalSettings: adminProcedure
      .input(
        z.object({
          userId: z.string(),
          requiresTransactionApproval: z.boolean(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const targetUser = await ctx.db.query.users.findFirst({
          where: eq(users.id, input.userId),
        });

        if (!targetUser) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        const existing = await ctx.db.query.userSettings.findFirst({
          where: eq(userSettings.userId, input.userId),
        });

        if (existing) {
          await ctx.db
            .update(userSettings)
            .set({
              requiresTransactionApproval: input.requiresTransactionApproval,
            })
            .where(eq(userSettings.userId, input.userId));
        } else {
          await ctx.db.insert(userSettings).values({
            userId: input.userId,
            requiresTransactionApproval: input.requiresTransactionApproval,
            isAdmin: false,
          });
        }

        return { success: true };
      }),
  }),

  accounts: createTRPCRouter({
    // Create a new account for a user
    create: adminProcedure
      .input(
        z.object({
          userId: z.string(),
          accountType: z.enum(["cash", "investment"]),
          accountName: z.string().min(1),
          cashAccountType: z.enum(["checking", "savings"]).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        // Verify the target user exists
        const targetUser = await ctx.db.query.users.findFirst({
          where: eq(users.id, input.userId),
        });

        if (!targetUser) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        // Generate unique account number
        const accountNumber = generateAccountNumber();

        if (input.accountType === "cash") {
          if (!input.cashAccountType) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Cash account type is required for cash accounts",
            });
          }

          const [newAccount] = await ctx.db
            .insert(cashAccounts)
            .values({
              userId: input.userId,
              accountNumber,
              accountName: input.accountName,
              accountType: input.cashAccountType,
              balance: cents(0),
              status: "active",
            })
            .returning();

          return {
            type: "cash" as const,
            account: newAccount,
          };
        } else {
          const [newAccount] = await ctx.db
            .insert(investmentAccounts)
            .values({
              userId: input.userId,
              accountNumber,
              accountName: input.accountName,
              status: "active",
            })
            .returning();

          return {
            type: "investment" as const,
            account: newAccount,
          };
        }
      }),

    // List all accounts with optional filters
    list: adminProcedure
      .input(
        z.object({
          userId: z.string().optional(),
          accountType: z.enum(["cash", "investment"]).optional(),
          status: z.enum(["active", "closed"]).optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const cashAccountsQuery = ctx.db.query.cashAccounts.findMany({
          where: and(
            input.userId ? eq(cashAccounts.userId, input.userId) : undefined,
            input.status ? eq(cashAccounts.status, input.status) : undefined,
          ),
          with: {
            user: {
              columns: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: (accounts, { desc }) => [desc(accounts.createdAt)],
        });

        const investmentAccountsQuery =
          ctx.db.query.investmentAccounts.findMany({
            where: and(
              input.userId
                ? eq(investmentAccounts.userId, input.userId)
                : undefined,
              input.status
                ? eq(investmentAccounts.status, input.status)
                : undefined,
            ),
            with: {
              user: {
                columns: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              holdings: {
                columns: {
                  symbol: true,
                  quantity: true,
                  totalCostBasis: true,
                },
              },
            },
            orderBy: (accounts, { desc }) => [desc(accounts.createdAt)],
          });

        const [cashAccs, investmentAccs] = await Promise.all([
          input.accountType === "investment" ? [] : cashAccountsQuery,
          input.accountType === "cash" ? [] : investmentAccountsQuery,
        ]);

        return {
          cashAccounts: cashAccs.map((acc) => ({
            ...acc,
            type: "cash" as const,
          })),
          investmentAccounts: investmentAccs.map((acc) => ({
            ...acc,
            type: "investment" as const,
            totalCost: sumCents(
              acc.holdings,
              (holding) => holding.totalCostBasis,
            ),
          })),
        };
      }),

    // Update account details
    update: adminProcedure
      .input(
        z.object({
          accountId: z.string(),
          accountType: z.enum(["cash", "investment"]),
          accountName: z.string().min(1).optional(),
          status: z.enum(["active", "closed"]).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (input.accountType === "cash") {
          const [updatedAccount] = await ctx.db
            .update(cashAccounts)
            .set({
              ...(input.accountName && { accountName: input.accountName }),
              ...(input.status && { status: input.status }),
            })
            .where(eq(cashAccounts.id, input.accountId))
            .returning();

          if (!updatedAccount) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Cash account not found",
            });
          }

          return {
            type: "cash" as const,
            account: updatedAccount,
          };
        } else {
          const [updatedAccount] = await ctx.db
            .update(investmentAccounts)
            .set({
              ...(input.accountName && { accountName: input.accountName }),
              ...(input.status && { status: input.status }),
            })
            .where(eq(investmentAccounts.id, input.accountId))
            .returning();

          if (!updatedAccount) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Investment account not found",
            });
          }

          return {
            type: "investment" as const,
            account: updatedAccount,
          };
        }
      }),
  }),

  transactions: createTRPCRouter({
    /**
     * The approval queue: everything awaiting a decision, of either kind.
     *
     * One list rather than one per kind. An admin triages by what arrived
     * first, not by what sort of thing it is, and two queues would be two
     * places to forget to look. Each row carries a `kind` so `approve` can
     * route it and the table can render the details that only apply to it.
     */
    pending: adminProcedure.query(async ({ ctx }) => {
      const [cash, investments] = await Promise.all([
        ctx.db.query.cashTransactions.findMany({
          where: eq(cashTransactions.status, "pending"),
          with: {
            cashAccount: {
              columns: {
                id: true,
                accountName: true,
                accountNumber: true,
                balance: true,
                status: true,
              },
            },
            toAccount: {
              columns: { id: true, accountName: true, accountNumber: true },
            },
            createdBy: {
              columns: { id: true, name: true, email: true },
            },
          },
        }),
        ctx.db.query.investmentTransactions.findMany({
          where: eq(investmentTransactions.status, "pending"),
          with: {
            investmentAccount: {
              columns: {
                id: true,
                accountName: true,
                accountNumber: true,
                status: true,
              },
            },
            createdBy: {
              columns: { id: true, name: true, email: true },
            },
          },
        }),
      ]);

      const queue = [
        ...cash.map((row) => ({
          kind: "cash" as const,
          id: row.id,
          transactionType: row.transactionType,
          amount: row.amount,
          description: row.description,
          transactionDate: row.transactionDate,
          createdAt: row.createdAt,
          createdBy: row.createdBy,
          account: row.cashAccount,
          /** Shown so an admin can see whether the money is still there. */
          balance: row.cashAccount.balance,
          /** The far side of a transfer; null for anything else. */
          counterparty:
            row.transactionType === "transfer" ? row.toAccount : null,
        })),
        ...investments.map((row) => ({
          kind: "investment" as const,
          id: row.id,
          transactionType: row.transactionType,
          amount: row.amount,
          description: row.description,
          transactionDate: row.transactionDate,
          createdAt: row.createdAt,
          createdBy: row.createdBy,
          account: row.investmentAccount,
          symbol: row.symbol,
          quantity: row.quantity,
          price: row.price,
          brokerage: row.brokerage,
          /* A split carries a ratio instead of a price: it is an instruction
             about the share count, and its effect is not known until it
             settles against whatever is held then. */
          ratio:
            row.splitNumerator && row.splitDenominator
              ? {
                  numerator: row.splitNumerator,
                  denominator: row.splitDenominator,
                }
              : null,
        })),
      ];

      // Oldest *submission* first — the queue is worked front to back.
      // Deliberately not transactionDate: back-dating records when the money
      // moved, and must not let a request jump the queue.
      return queue.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );
    }),

    /**
     * Approve (settling it) or reject a pending transaction of either kind.
     *
     * `kind` comes back from `pending` on the row itself, so the caller never
     * has to guess which table an id belongs to — and a cash id cannot be
     * passed off as an investment one, since it simply will not be found.
     */
    approve: adminProcedure
      .input(
        z.object({
          kind: z.enum(["cash", "investment"]).default("cash"),
          transactionId: z.string(),
          action: z.enum(["approve", "reject"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (input.kind === "investment") {
          return decideTrade(ctx, input);
        }

        const existing = await ctx.db.query.cashTransactions.findFirst({
          where: eq(cashTransactions.id, input.transactionId),
        });

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Transaction not found",
          });
        }

        if (existing.status !== "pending") {
          throw cashError(
            "already_decided",
            `Transaction is already ${existing.status}`,
          );
        }

        const adminId = ctx.session.user.id;
        const approvedAt = new Date();

        if (input.action === "reject") {
          const [rejected] = await ctx.db
            .update(cashTransactions)
            .set({
              status: "rejected",
              approvedByAdminId: adminId,
              approvedAt,
            })
            .where(eq(cashTransactions.id, input.transactionId))
            .returning();

          return { transaction: rejected!, status: "rejected" as const };
        }

        // Bind to a local const so the narrowing survives into the closure below.
        const transactionType = existing.transactionType;
        assertSettleableType(transactionType);

        // Settle and mark completed atomically — if the balances can no longer
        // support the transaction (funds spent while it sat pending, account
        // closed), settleCashMovement throws and the status change rolls back.
        return ctx.db.transaction(async (tx) => {
          await settleCashMovement(tx, {
            transactionType,
            cashAccountId: existing.cashAccountId,
            fromAccountId: existing.fromAccountId,
            toAccountId: existing.toAccountId,
            amount: existing.amount,
          });

          const [completed] = await tx
            .update(cashTransactions)
            .set({
              status: "completed",
              approvedByAdminId: adminId,
              approvedAt,
            })
            .where(eq(cashTransactions.id, input.transactionId))
            .returning();

          return { transaction: completed!, status: "completed" as const };
        });
      }),
  }),
});

/**
 * The investment half of `transactions.approve`.
 *
 * Split out rather than inlined because the two kinds share only their shape:
 * different table, different service, different terminal status. What they do
 * share is the rule that the decision and its effect are one database
 * transaction — if `settleTrade` refuses because the position was sold out from
 * under a queued sale, the status change rolls back with it and the item stays
 * in the queue for the admin to see.
 */
async function decideTrade(
  ctx: { db: typeof database; session: { user: { id: string } } },
  input: { transactionId: string; action: "approve" | "reject" },
) {
  const existing = await ctx.db.query.investmentTransactions.findFirst({
    where: eq(investmentTransactions.id, input.transactionId),
  });

  if (!existing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Transaction not found",
    });
  }

  if (existing.status !== "pending") {
    throw investmentError(
      "already_decided",
      `Transaction is already ${existing.status}`,
    );
  }

  const adminId = ctx.session.user.id;
  const approvedAt = new Date();

  if (input.action === "reject") {
    const [rejected] = await ctx.db
      .update(investmentTransactions)
      .set({ status: "rejected", approvedByAdminId: adminId, approvedAt })
      .where(eq(investmentTransactions.id, input.transactionId))
      .returning();

    return { transaction: rejected!, status: "rejected" as const };
  }

  // Bind to a local const so the narrowing survives into the closures below.
  const transactionType = existing.transactionType;

  /*
   * A pending buy or sell stored the quantity and price it was submitted at, so
   * the amount is not recomputed — re-deriving it would silently re-price a
   * trade submitted days ago.
   *
   * A split is the opposite: it stored the *ratio*, and the ratio applies to
   * whatever is held now. A buy that settled while the split queued is part of
   * the position it acts on.
   */
  return ctx.db.transaction(async (tx) => {
    /*
     * Marked executed first, which the incremental path does not care about but
     * the replay does: `rebuildHolding` folds executed rows, so a row still
     * pending would be left out of the position it is supposed to join. Both
     * happen in one transaction, so a refusal below still takes the status
     * change with it.
     */
    const [executed] = await tx
      .update(investmentTransactions)
      .set({ status: "executed", approvedByAdminId: adminId, approvedAt })
      .where(eq(investmentTransactions.id, input.transactionId))
      .returning();

    /*
     * A trade approved today can be dated before things already settled — it
     * sat in the queue while other trades went through, or it was back-dated
     * when submitted. Applying it incrementally would put it at the end of a
     * history it belongs in the middle of, so the position is replayed instead.
     */
    if (
      await isOutOfOrder(
        tx,
        existing.investmentAccountId,
        existing.symbol,
        existing.transactionDate,
      )
    ) {
      const position = await rebuildHolding(
        tx,
        existing.investmentAccountId,
        existing.symbol,
      );

      return {
        transaction: executed!,
        status: "executed" as const,
        realisedGain: position.realisedGains.get(existing.id) ?? null,
        outcome: null,
      };
    }

    if (transactionType === "split") {
      const outcome = await settleSplit(tx, {
        investmentAccountId: existing.investmentAccountId,
        symbol: existing.symbol,
        ratio: {
          numerator: existing.splitNumerator!,
          denominator: existing.splitDenominator!,
        },
        resultingQuantity: existing.quantity ?? undefined,
        transactionDate: existing.transactionDate,
      });

      return {
        transaction: executed!,
        status: "executed" as const,
        realisedGain: null,
        outcome,
      };
    }

    assertSettleableTrade(transactionType);

    const outcome = await settleTrade(tx, {
      transactionType,
      investmentAccountId: existing.investmentAccountId,
      symbol: existing.symbol,
      companyName: existing.companyName,
      quantity: existing.quantity!,
      price: existing.price!,
      brokerage: existing.brokerage,
      amount: existing.amount,
      transactionDate: existing.transactionDate,
    });

    return {
      transaction: executed!,
      status: "executed" as const,
      realisedGain: outcome.realisedGain,
      outcome: null,
    };
  });
}

// Helper function to generate unique account numbers
function generateAccountNumber(): string {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `${timestamp}${random}`;
}
