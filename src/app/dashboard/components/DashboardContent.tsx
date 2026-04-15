"use client";

import { api } from "~/trpc/react";

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
      <div className="rounded-lg bg-red-50 p-4">
        <p className="text-red-800">Error loading accounts: {error.message}</p>
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
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-2xl font-bold text-gray-900">
          Total Net Worth
        </h2>
        <p className="text-4xl font-bold text-green-600">
          ${totalNetWorth.toFixed(2)}
        </p>
        <div className="mt-2 text-sm text-gray-500">
          <p>Cash: ${totalCashBalance.toFixed(2)}</p>
          <p>Investments: ${totalInvestmentValue.toFixed(2)}</p>
        </div>
      </div>

      {/* Accounts Grid */}
      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Cash Accounts */}
        {accounts?.cashAccounts.map((account) => (
          <div key={account.id} className="rounded-lg bg-white p-6 shadow">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900">
                {account.accountName}
              </h3>
              <span className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800">
                {account.accountType}
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              ${account.balance.toFixed(2)}
            </p>
            <p className="text-sm text-gray-500">
              Account: {account.accountNumber}
            </p>
          </div>
        ))}

        {/* Investment Accounts */}
        {accounts?.investmentAccounts.map((account) => (
          <div key={account.id} className="rounded-lg bg-white p-6 shadow">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900">
                {account.accountName}
              </h3>
              <span className="rounded-full bg-purple-100 px-2 py-1 text-xs text-purple-800">
                Investment
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              ${account.totalValue.toFixed(2)}
            </p>
            <p className="text-sm text-gray-500">
              {account.holdingsCount} holdings • {account.accountNumber}
            </p>
          </div>
        ))}

        {/* No Accounts Message */}
        {!accounts?.cashAccounts.length &&
          !accounts?.investmentAccounts.length && (
            <div className="col-span-full rounded-lg bg-gray-50 p-8 text-center">
              <p className="text-gray-500">
                No accounts yet. Contact your administrator to create accounts.
              </p>
            </div>
          )}
      </div>

      {/* Recent Activity Placeholder */}
      <div className="mt-8 rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-medium text-gray-900">
          Recent Activity
        </h3>
        <p className="text-gray-500">Transaction history coming soon...</p>
      </div>
    </>
  );
}
