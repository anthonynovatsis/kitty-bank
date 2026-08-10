"use client";

import Link from "next/link";
import { api } from "~/trpc/react";
import { StatusBadge } from "~/components/StatusBadge";
import { EmptyState, ThemeIllustration } from "~/components/ThemeIllustration";
import { CardGridSkeleton } from "~/components/Skeletons";
import { cents, formatCents, sumCents } from "~/lib/money";

export function DashboardContent() {
  const {
    data: accounts,
    isLoading,
    error,
  } = api.user.accounts.list.useQuery();

  if (isLoading) {
    return <CardGridSkeleton />;
  }

  if (error) {
    return (
      <div className="bg-tone-danger rounded-lg p-4">
        <p className="text-tone-danger-foreground">
          Error loading accounts: {error.message}
        </p>
      </div>
    );
  }

  const totalCashBalance = sumCents(
    accounts?.cashAccounts ?? [],
    (acc) => acc.balance,
  );

  const totalInvestmentCost = sumCents(
    accounts?.investmentAccounts ?? [],
    (acc) => acc.totalCost,
  );

  const totalNetWorth = cents(totalCashBalance + totalInvestmentCost);

  return (
    <>
      {/* Total Net Worth Summary */}
      <div className="bg-card rounded-lg p-6 shadow">
        <h2 className="text-foreground mb-4 text-2xl font-bold">
          Total Net Worth
        </h2>
        <p className="text-tone-positive-foreground text-4xl font-bold">
          {formatCents(totalNetWorth)}
        </p>
        <div className="text-muted-foreground mt-2 text-sm">
          <p>Cash: {formatCents(totalCashBalance)}</p>
          <p>Investments: {formatCents(totalInvestmentCost)}</p>
        </div>
      </div>

      {/* Accounts Grid */}
      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Cash Accounts */}
        {accounts?.cashAccounts.map((account) => (
          <Link
            key={account.id}
            href={`/dashboard/accounts/${account.id}`}
            className="bg-card block rounded-lg p-6 shadow transition-shadow hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <ThemeIllustration
                  name={
                    account.accountType === "savings"
                      ? "account-savings"
                      : "account-checking"
                  }
                  className="size-9"
                />
                <h3 className="text-foreground truncate font-medium">
                  {account.accountName}
                </h3>
              </div>
              <StatusBadge tone="info">{account.accountType}</StatusBadge>
            </div>
            <p className="text-foreground mt-2 text-2xl font-bold">
              {formatCents(account.balance)}
            </p>
            <p className="text-muted-foreground text-sm">
              Account: {account.accountNumber}
            </p>
          </Link>
        ))}

        {/* Investment Accounts */}
        {accounts?.investmentAccounts.map((account) => (
          <Link
            key={account.id}
            href={`/dashboard/accounts/${account.id}`}
            className="bg-card block rounded-lg p-6 shadow transition-shadow hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <ThemeIllustration
                  name="account-investment"
                  className="size-9"
                />
                <h3 className="text-foreground truncate font-medium">
                  {account.accountName}
                </h3>
              </div>
              <StatusBadge tone="accent">investment</StatusBadge>
            </div>
            <p className="text-foreground mt-2 text-2xl font-bold">
              {formatCents(account.totalCost)}
            </p>
            <p className="text-muted-foreground text-sm">
              {account.holdingsCount} holdings • {account.accountNumber}
            </p>
          </Link>
        ))}

        {/* No Accounts Message */}
        {!accounts?.cashAccounts.length &&
          !accounts?.investmentAccounts.length && (
            <div className="bg-muted col-span-full rounded-lg">
              <EmptyState illustration="empty-accounts">
                No accounts yet. Contact your administrator to create accounts.
              </EmptyState>
            </div>
          )}
      </div>

      {/* Recent Activity Placeholder */}
      <div className="bg-card mt-8 rounded-lg p-6 shadow">
        <h3 className="text-foreground mb-4 text-lg font-medium">
          Recent Activity
        </h3>
        <p className="text-muted-foreground">
          Transaction history coming soon...
        </p>
      </div>
    </>
  );
}
