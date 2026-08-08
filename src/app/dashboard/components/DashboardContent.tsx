"use client";

import Link from "next/link";
import { api } from "~/trpc/react";
import { StatusBadge } from "~/components/StatusBadge";

export function DashboardContent() {
  const {
    data: accounts,
    isLoading,
    error,
  } = api.user.accounts.list.useQuery();

  if (isLoading) {
    return <div className="animate-pulse">Loading accounts...</div>;
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

  const totalCashBalance =
    accounts?.cashAccounts.reduce((sum, acc) => sum + acc.balance, 0) ?? 0;

  const totalInvestmentValue =
    accounts?.investmentAccounts.reduce(
      (sum, acc) => sum + acc.totalValue,
      0,
    ) ?? 0;

  const totalNetWorth = totalCashBalance + totalInvestmentValue;

  return (
    <>
      {/* Total Net Worth Summary */}
      <div className="bg-card rounded-lg p-6 shadow">
        <h2 className="text-foreground mb-4 text-2xl font-bold">
          Total Net Worth
        </h2>
        <p className="text-tone-positive-foreground text-4xl font-bold">
          ${totalNetWorth.toFixed(2)}
        </p>
        <div className="text-muted-foreground mt-2 text-sm">
          <p>Cash: ${totalCashBalance.toFixed(2)}</p>
          <p>Investments: ${totalInvestmentValue.toFixed(2)}</p>
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
            <div className="flex items-center justify-between">
              <h3 className="text-foreground font-medium">
                {account.accountName}
              </h3>
              <StatusBadge tone="info">{account.accountType}</StatusBadge>
            </div>
            <p className="text-foreground mt-2 text-2xl font-bold">
              ${account.balance.toFixed(2)}
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
            <div className="flex items-center justify-between">
              <h3 className="text-foreground font-medium">
                {account.accountName}
              </h3>
              <StatusBadge tone="accent">investment</StatusBadge>
            </div>
            <p className="text-foreground mt-2 text-2xl font-bold">
              ${account.totalValue.toFixed(2)}
            </p>
            <p className="text-muted-foreground text-sm">
              {account.holdingsCount} holdings • {account.accountNumber}
            </p>
          </Link>
        ))}

        {/* No Accounts Message */}
        {!accounts?.cashAccounts.length &&
          !accounts?.investmentAccounts.length && (
            <div className="bg-muted col-span-full rounded-lg p-8 text-center">
              <p className="text-muted-foreground">
                No accounts yet. Contact your administrator to create accounts.
              </p>
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
