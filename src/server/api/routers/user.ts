import { eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { cashAccounts, investmentAccounts } from "~/server/db/schema";

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
                averageCostBasis: true,
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
          totalValue: acc.holdings.reduce(
            (sum, holding) => sum + holding.quantity * holding.averageCostBasis,
            0,
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
              totalValue: investmentAccount.holdings.reduce(
                (sum, h) => sum + h.quantity * h.averageCostBasis,
                0,
              ),
            },
          };
        }

        throw new TRPCError({ code: "NOT_FOUND" });
      }),
  }),
});
