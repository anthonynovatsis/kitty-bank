import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
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
  settleCashMovement,
} from "~/server/services/cash";
import { requiresApproval } from "~/server/services/approval";
import {
  type TradeType,
  assertActiveAccount,
  assertSufficientShares,
  loadHolding,
  loadInvestmentAccount,
  normaliseSymbol,
  settleTrade,
  tradeAmount,
} from "~/server/services/investments";
import type { Queryable, Transaction } from "~/server/db";
import {
  cashAccounts,
  cashTransactions,
  holdings,
  investmentAccounts,
  investmentTransactions,
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

/** A share count. Whole shares only — the service and a CHECK both enforce it. */
const quantitySchema = z
  .number()
  .int("Quantity must be a whole number of shares")
  .positive("Quantity must be greater than zero")
  .max(1_000_000_000);

/** Per-share price, as a decimal, converted to cents at this boundary. */
const priceSchema = z
  .number()
  .positive("Price must be greater than zero")
  .finite()
  .max(MAX_AMOUNT_CENTS / 100, "Price is too large");

/** Transaction fee. Zero is normal, so this one is not `.positive()`. */
const brokerageSchema = z
  .number()
  .min(0, "Brokerage cannot be negative")
  .finite()
  .max(MAX_AMOUNT_CENTS / 100, "Brokerage is too large")
  .default(0);

const symbolSchema = z.string().trim().min(1, "Symbol is required").max(20);

const companyNameSchema = z.string().trim().max(255).optional();

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

/** Load an investment account, asserting the caller owns it. */
async function loadOwnInvestmentAccount(
  tx: Transaction,
  accountId: string,
  userId: string,
) {
  const account = await loadInvestmentAccount(tx, accountId);

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

  investments: createTRPCRouter({
    // Submit a buy into one of the user's own investment accounts
    buy: protectedProcedure
      .input(
        z.object({
          accountId: z.string(),
          symbol: symbolSchema,
          companyName: companyNameSchema,
          quantity: quantitySchema,
          price: priceSchema,
          brokerage: brokerageSchema,
          description: descriptionSchema,
          transactionDate: transactionDateSchema,
        }),
      )
      .mutation(({ ctx, input }) =>
        ctx.db.transaction(async (tx) => {
          const userId = ctx.session.user.id;
          assertActiveAccount(
            await loadOwnInvestmentAccount(tx, input.accountId, userId),
          );

          return submitTrade(tx, { ...input, transactionType: "buy", userId });
        }),
      ),

    // Submit a sell from one of the user's own investment accounts
    sell: protectedProcedure
      .input(
        z.object({
          accountId: z.string(),
          symbol: symbolSchema,
          quantity: quantitySchema,
          price: priceSchema,
          brokerage: brokerageSchema,
          description: descriptionSchema,
          transactionDate: transactionDateSchema,
        }),
      )
      .mutation(({ ctx, input }) =>
        ctx.db.transaction(async (tx) => {
          const userId = ctx.session.user.id;
          assertActiveAccount(
            await loadOwnInvestmentAccount(tx, input.accountId, userId),
          );

          // Fail fast rather than queueing a sale that can never settle. Shares
          // are *not* reserved while pending — ownership is checked again at
          // approval time, the same way a pending withdrawal re-checks funds.
          const holding = await loadHolding(tx, input.accountId, input.symbol);
          assertSufficientShares(holding, input.quantity);

          return submitTrade(tx, { ...input, transactionType: "sell", userId });
        }),
      ),

    // Current positions in one of the user's own investment accounts
    getHoldings: protectedProcedure
      .input(z.object({ accountId: z.string() }))
      .query(async ({ ctx, input }) => {
        await assertOwnInvestmentAccount(
          ctx.db,
          input.accountId,
          ctx.session.user.id,
        );

        return ctx.db.query.holdings.findMany({
          where: eq(holdings.investmentAccountId, input.accountId),
          orderBy: [asc(holdings.symbol)],
        });
      }),

    // Trade history for one of the user's own investment accounts
    getTransactions: protectedProcedure
      .input(
        z.object({
          accountId: z.string(),
          /** Narrow to a single position, for the holding detail view. */
          symbol: z.string().trim().min(1).max(20).optional(),
          limit: z.number().int().min(1).max(200).default(50),
        }),
      )
      .query(async ({ ctx, input }) => {
        await assertOwnInvestmentAccount(
          ctx.db,
          input.accountId,
          ctx.session.user.id,
        );

        return ctx.db.query.investmentTransactions.findMany({
          where: and(
            eq(investmentTransactions.investmentAccountId, input.accountId),
            input.symbol
              ? eq(investmentTransactions.symbol, normaliseSymbol(input.symbol))
              : undefined,
          ),
          // Back-dated rows must slot into the right chronological position;
          // createdAt only breaks ties within a day.
          orderBy: [
            desc(investmentTransactions.transactionDate),
            desc(investmentTransactions.createdAt),
          ],
          limit: input.limit,
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

/**
 * Ownership check for the read-only investment queries.
 *
 * Runs against the root db rather than inside a transaction, since nothing is
 * being written. Closed accounts stay readable — only new trades are blocked.
 */
async function assertOwnInvestmentAccount(
  db: Queryable,
  accountId: string,
  userId: string,
) {
  const account = await db.query.investmentAccounts.findFirst({
    where: eq(investmentAccounts.id, accountId),
    columns: { id: true, userId: true },
  });

  if (!account) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Investment account not found",
    });
  }
  if (account.userId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

/**
 * Record a trade and, when the user is trusted, settle it straight away. Runs
 * inside the caller's transaction, so a failed settlement takes the transaction
 * row down with it.
 */
async function submitTrade(
  tx: Transaction,
  input: {
    transactionType: TradeType;
    accountId: string;
    symbol: string;
    companyName?: string;
    quantity: number;
    price: number;
    brokerage: number;
    description?: string;
    /** When the trade happened. Defaults to now. */
    transactionDate?: Date;
    userId: string;
  },
) {
  const price = toCents(input.price);
  const brokerage = toCents(input.brokerage);
  // Derived, never accepted: quantity, price, amount and brokerage are all
  // stored, so an entered amount is a number free to contradict the other three.
  const amount = tradeAmount(
    input.transactionType,
    input.quantity,
    price,
    brokerage,
  );

  const trade = {
    transactionType: input.transactionType,
    investmentAccountId: input.accountId,
    symbol: normaliseSymbol(input.symbol),
    companyName: input.companyName ?? null,
    quantity: input.quantity,
    price,
    brokerage,
    amount,
    transactionDate: input.transactionDate ?? new Date(),
  };

  const needsApproval = await requiresApproval(tx, input.userId);

  const [transaction] = await tx
    .insert(investmentTransactions)
    .values({
      investmentAccountId: trade.investmentAccountId,
      transactionType: trade.transactionType,
      symbol: trade.symbol,
      companyName: trade.companyName,
      quantity: trade.quantity,
      price: trade.price,
      amount: trade.amount,
      brokerage: trade.brokerage,
      description: input.description ?? null,
      transactionDate: trade.transactionDate,
      /*
       * `approved` is never written. A trade that needs no approval settles
       * here, and one that does is settled by the admin in the same database
       * transaction that decides it — so there is no moment at which a row is
       * approved but not yet applied to the holdings.
       */
      status: needsApproval ? "pending" : "executed",
      createdByUserId: input.userId,
    })
    .returning();

  const outcome = needsApproval ? null : await settleTrade(tx, trade);

  return {
    transaction: transaction!,
    status: transaction!.status,
    requiresApproval: needsApproval,
    realisedGain: outcome?.realisedGain ?? null,
  };
}
