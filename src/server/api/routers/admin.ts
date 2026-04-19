import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, like } from "drizzle-orm";
import { createTRPCRouter, adminProcedure } from "~/server/api/trpc";
import { cashAccounts, investmentAccounts, users } from "~/server/db/schema";

export const adminRouter = createTRPCRouter({
  // Search users for account creation
  users: createTRPCRouter({
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
});

// Helper function to generate unique account numbers
function generateAccountNumber(): string {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `${timestamp}${random}`;
}
