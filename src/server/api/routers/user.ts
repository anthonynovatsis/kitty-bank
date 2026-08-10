import { desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { MAX_AMOUNT_CENTS, sumCents, toCents } from "~/lib/money";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  type SettleableType,
  assertActive,
  assertSufficientFunds,
  cashError,
  loadCashAccount,
  requiresApproval,
  settleCashMovement,
} from "~/server/services/cash";
import type { Transaction } from "~/server/db";
import {
  cashAccounts,
  cashTransactions,
  investmentAccounts,
} from "~/server/db/schema";

/** Money in, money out, or moved — as seen from one specific account. */
type Direction = "credit" | "debit";

/*
 * Input stays a decimal amount, as typed. The server converts to cents at this
 * boundary so the rounding rule is ours, not the client's — after that nothing
 * on the server sees a fraction.
 */
const amountSchema = z
  .number()
  .positive("Amount must be greater than zero")
  .finite()
  .max(MAX_AMOUNT_CENTS / 100, "Amount is too large");

const descriptionSchema = z.string().trim().max(500).optional();

/**
 * When the money actually moved. Optional — omitted means now.
 *
 * Back-dating is the point: users record transactions that already happened.
 * Forward-dating is rejected, because a completed transaction that settles the
 * balance today cannot be dated to something that has not occurred yet.
 *
 * The bound is checked per-parse rather than via `.max(new Date())`, which
 * would freeze "now" at module load and start rejecting valid dates.
 */
const transactionDateSchema = z
  .date()
  .refine(
    (date) => date.getTime() <= Date.now(),
    "Transaction date cannot be in the future",
  )
  .optional();

/** Load a cash account, asserting the caller owns it. */
async function loadOwnAccount(
  tx: Transaction,
  accountId: string,
  userId: string,
) {
  const account = await loadCashAccount(tx, accountId);

  if (account.userId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return account;
}

/** Which way the money moved relative to the account being viewed. */
function directionFor(
  transaction: { transactionType: string; toAccountId: string | null },
  accountId: string,
): Direction {
  switch (transaction.transactionType) {
    case "deposit":
    case "interest":
      return "credit";
    case "transfer":
      return transaction.toAccountId === accountId ? "credit" : "debit";
    default:
      return "debit";
  }
}

export const userRouter = createTRPCRouter({
  accounts: createTRPCRouter({
    // Get current user's accounts
    list: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.session.user.id;

      const [cashAccs, investmentAccs] = await Promise.all([
        ctx.db.query.cashAccounts.findMany({
          where: eq(cashAccounts.userId, userId),
          orderBy: (accounts, { desc }) => [desc(accounts.createdAt)],
        }),
        ctx.db.query.investmentAccounts.findMany({
          where: eq(investmentAccounts.userId, userId),
          with: {
            holdings: {
              columns: {
                symbol: true,
                companyName: true,
                quantity: true,
                totalCostBasis: true,
              },
            },
          },
          orderBy: (accounts, { desc }) => [desc(accounts.createdAt)],
        }),
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
          holdingsCount: acc.holdings.length,
        })),
      };
    }),

    // Get details for a single account (cash or investment)
    getDetails: protectedProcedure
      .input(z.object({ accountId: z.string() }))
      .query(async ({ ctx, input }) => {
        const userId = ctx.session.user.id;

        // Try cash account first
        const cashAccount = await ctx.db.query.cashAccounts.findFirst({
          where: eq(cashAccounts.id, input.accountId),
        });

        if (cashAccount) {
          if (cashAccount.userId !== userId) {
            throw new TRPCError({ code: "FORBIDDEN" });
          }
          return { type: "cash" as const, account: cashAccount };
        }

        // Try investment account
        const investmentAccount =
          await ctx.db.query.investmentAccounts.findFirst({
            where: eq(investmentAccounts.id, input.accountId),
            with: {
              holdings: true,
            },
          });

        if (investmentAccount) {
          if (investmentAccount.userId !== userId) {
            throw new TRPCError({ code: "FORBIDDEN" });
          }
          return {
            type: "investment" as const,
            account: {
              ...investmentAccount,
              totalCost: sumCents(
                investmentAccount.holdings,
                (h) => h.totalCostBasis,
              ),
            },
          };
        }

        throw new TRPCError({ code: "NOT_FOUND" });
      }),
  }),

  cash: createTRPCRouter({
    // Submit a deposit into one of the user's own cash accounts
    deposit: protectedProcedure
      .input(
        z.object({
          accountId: z.string(),
          amount: amountSchema,
          description: descriptionSchema,
          transactionDate: transactionDateSchema,
        }),
      )
      .mutation(({ ctx, input }) =>
        ctx.db.transaction(async (tx) => {
          const userId = ctx.session.user.id;
          assertActive(await loadOwnAccount(tx, input.accountId, userId));

          return submitCashTransaction(tx, {
            transactionType: "deposit",
            cashAccountId: input.accountId,
            // Recorded on both deposits and withdrawals, not just transfers, so
            // a row describes its own direction without consulting its type.
            fromAccountId: null,
            toAccountId: input.accountId,
            amount: input.amount,
            description: input.description,
            transactionDate: input.transactionDate,
            userId,
          });
        }),
      ),

    // Submit a withdrawal from one of the user's own cash accounts
    withdraw: protectedProcedure
      .input(
        z.object({
          accountId: z.string(),
          amount: amountSchema,
          description: descriptionSchema,
          transactionDate: transactionDateSchema,
        }),
      )
      .mutation(({ ctx, input }) =>
        ctx.db.transaction(async (tx) => {
          const userId = ctx.session.user.id;
          const account = await loadOwnAccount(tx, input.accountId, userId);
          assertActive(account);

          // Fail fast rather than queueing a request that can never settle.
          // Funds are *not* reserved while pending — the balance is checked
          // again at approval time.
          assertSufficientFunds(account, toCents(input.amount));

          return submitCashTransaction(tx, {
            transactionType: "withdrawal",
            cashAccountId: input.accountId,
            fromAccountId: input.accountId,
            toAccountId: null,
            amount: input.amount,
            description: input.description,
            transactionDate: input.transactionDate,
            userId,
          });
        }),
      ),

    // Move money between two of the user's own cash accounts
    transfer: protectedProcedure
      .input(
        z.object({
          fromAccountId: z.string(),
          toAccountId: z.string(),
          amount: amountSchema,
          description: descriptionSchema,
          transactionDate: transactionDateSchema,
        }),
      )
      .mutation(({ ctx, input }) => {
        if (input.fromAccountId === input.toAccountId) {
          throw cashError(
            "invalid_transfer",
            "Cannot transfer to the same account",
          );
        }

        return ctx.db.transaction(async (tx) => {
          const userId = ctx.session.user.id;

          // Both sides must belong to the caller — this is not a payment rail.
          const from = await loadOwnAccount(tx, input.fromAccountId, userId);
          const to = await loadOwnAccount(tx, input.toAccountId, userId);
          assertActive(from);
          assertActive(to);

          assertSufficientFunds(from, toCents(input.amount));

          return submitCashTransaction(tx, {
            transactionType: "transfer",
            // Anchor the row to the source account; history queries match on
            // all three columns so it shows up for both sides.
            cashAccountId: input.fromAccountId,
            fromAccountId: input.fromAccountId,
            toAccountId: input.toAccountId,
            amount: input.amount,
            description: input.description,
            transactionDate: input.transactionDate,
            userId,
          });
        });
      }),

    // Transaction history for one of the user's own cash accounts
    getTransactions: protectedProcedure
      .input(
        z.object({
          accountId: z.string(),
          limit: z.number().int().min(1).max(200).default(50),
        }),
      )
      .query(async ({ ctx, input }) => {
        const userId = ctx.session.user.id;

        // Read-only, so this runs outside a transaction and checks ownership
        // directly. Closed accounts stay readable — only new transactions are
        // blocked.
        const account = await ctx.db.query.cashAccounts.findFirst({
          where: eq(cashAccounts.id, input.accountId),
        });
        if (!account) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Cash account not found",
          });
        }
        if (account.userId !== userId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const rows = await ctx.db.query.cashTransactions.findMany({
          where: or(
            eq(cashTransactions.cashAccountId, input.accountId),
            eq(cashTransactions.fromAccountId, input.accountId),
            eq(cashTransactions.toAccountId, input.accountId),
          ),
          // Back-dated rows must slot into the right chronological
          // position; createdAt only breaks ties within a day.
          orderBy: [
            desc(cashTransactions.transactionDate),
            desc(cashTransactions.createdAt),
          ],
          limit: input.limit,
        });

        // Resolve the other side of each transfer in one extra query.
        const counterpartyIds = [
          ...new Set(
            rows.flatMap((row) =>
              [row.fromAccountId, row.toAccountId].filter(
                (id): id is string => !!id && id !== input.accountId,
              ),
            ),
          ),
        ];

        const counterparties = counterpartyIds.length
          ? await ctx.db.query.cashAccounts.findMany({
              where: inArray(cashAccounts.id, counterpartyIds),
              columns: { id: true, accountName: true, accountNumber: true },
            })
          : [];

        const byId = new Map(counterparties.map((acc) => [acc.id, acc]));

        return rows.map((row) => {
          const direction = directionFor(row, input.accountId);
          const counterpartyId =
            row.transactionType === "transfer"
              ? direction === "credit"
                ? row.fromAccountId
                : row.toAccountId
              : null;

          return {
            ...row,
            direction,
            counterparty: counterpartyId
              ? (byId.get(counterpartyId) ?? null)
              : null,
          };
        });
      }),
  }),
});

/**
 * Record a cash transaction and, when the user is trusted, settle it straight
 * away. Runs inside the caller's transaction, so a failed settlement takes the
 * transaction row down with it.
 */
async function submitCashTransaction(
  tx: Transaction,
  input: {
    transactionType: SettleableType;
    cashAccountId: string;
    fromAccountId: string | null;
    toAccountId: string | null;
    amount: number;
    description?: string;
    /** When the money moved. Defaults to now for a transaction happening today. */
    transactionDate?: Date;
    userId: string;
  },
) {
  const amount = toCents(input.amount);
  const needsApproval = await requiresApproval(tx, input.userId);

  const [transaction] = await tx
    .insert(cashTransactions)
    .values({
      cashAccountId: input.cashAccountId,
      transactionType: input.transactionType,
      amount,
      description: input.description ?? null,
      transactionDate: input.transactionDate ?? new Date(),
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      // Auto-approved transactions skip `pending` entirely and leave
      // approvedByAdminId / approvedAt null — no admin ever touched them.
      status: needsApproval ? "pending" : "completed",
      createdByUserId: input.userId,
    })
    .returning();

  if (!needsApproval) {
    await settleCashMovement(tx, {
      transactionType: input.transactionType,
      cashAccountId: input.cashAccountId,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amount,
    });
  }

  return {
    transaction: transaction!,
    status: transaction!.status,
    requiresApproval: needsApproval,
  };
}
