import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, asc, like } from "drizzle-orm";
import { createTRPCRouter, adminProcedure } from "~/server/api/trpc";
import {
  assertSettleableType,
  settleCashMovement,
} from "~/server/services/cash";
import {
  cashAccounts,
  cashTransactions,
  investmentAccounts,
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
        totalCashBalance: user.cashAccounts.reduce(
          (sum, a) => sum + a.balance,
          0,
        ),
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
              balance: 0,
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
                  averageCostBasis: true,
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
            totalValue: acc.holdings.reduce(
              (sum, holding) =>
                sum + holding.quantity * holding.averageCostBasis,
              0,
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
    // The approval queue: every cash transaction awaiting a decision
    pending: adminProcedure.query(async ({ ctx }) => {
      const rows = await ctx.db.query.cashTransactions.findMany({
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
          fromAccount: {
            columns: { id: true, accountName: true, accountNumber: true },
          },
          toAccount: {
            columns: { id: true, accountName: true, accountNumber: true },
          },
          createdBy: {
            columns: { id: true, name: true, email: true },
          },
        },
        // Oldest first — the queue is worked front to back.
        orderBy: [asc(cashTransactions.createdAt)],
      });

      return rows;
    }),

    // Approve (settling the balances) or reject a pending cash transaction
    approve: adminProcedure
      .input(
        z.object({
          transactionId: z.string(),
          action: z.enum(["approve", "reject"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
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
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Transaction is already ${existing.status}`,
          });
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

// Helper function to generate unique account numbers
function generateAccountNumber(): string {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `${timestamp}${random}`;
}
