"use client";

import Link from "next/link";
import { api } from "~/trpc/react";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function StatusBadge({ status }: { status: "active" | "closed" }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${
        status === "active"
          ? "bg-green-100 text-green-800"
          : "bg-gray-100 text-gray-600"
      }`}
    >
      {status}
    </span>
  );
}

export function AccountDetail({ accountId }: { accountId: string }) {
  const { data, isLoading, error } = api.user.accounts.getDetails.useQuery({
    accountId,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse text-gray-500">Loading account...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="rounded-lg bg-red-50 p-4">
          <p className="text-red-800">
            {error.data?.code === "NOT_FOUND"
              ? "Account not found."
              : "Failed to load account."}
          </p>
          <Link href="/dashboard" className="mt-2 text-sm text-blue-600 hover:underline">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
          ← Back to dashboard
        </Link>
      </div>

      {data.type === "cash" ? (
        <CashAccountDetail account={data.account} />
      ) : (
        <InvestmentAccountDetail account={data.account} />
      )}
    </div>
  );
}

type CashAccount = {
  id: string;
  accountName: string;
  accountNumber: string;
  accountType: "checking" | "savings";
  balance: number;
  status: "active" | "closed";
  createdAt: Date;
};

function CashAccountDetail({ account }: { account: CashAccount }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {account.accountName}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {account.accountNumber} •{" "}
            <span className="capitalize">{account.accountType}</span>
          </p>
        </div>
        <StatusBadge status={account.status} />
      </div>

      {/* Balance card */}
      <div className="rounded-lg bg-white p-6 shadow">
        <p className="text-sm font-medium text-gray-500">Current Balance</p>
        <p className="mt-1 text-4xl font-bold text-gray-900">
          {formatCurrency(account.balance)}
        </p>
      </div>

      {/* Transactions placeholder */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Transaction History
        </h2>
        <p className="text-gray-500">
          Deposits, withdrawals, and transfers coming soon.
        </p>
      </div>
    </div>
  );
}

type Holding = {
  id: string;
  symbol: string;
  companyName: string | null;
  quantity: number;
  averageCostBasis: number;
  dividendReinvestment: boolean;
};

type InvestmentAccount = {
  id: string;
  accountName: string;
  accountNumber: string;
  status: "active" | "closed";
  createdAt: Date;
  totalValue: number;
  holdings: Holding[];
};

function InvestmentAccountDetail({ account }: { account: InvestmentAccount }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {account.accountName}
          </h1>
          <p className="mt-1 text-sm text-gray-500">{account.accountNumber}</p>
        </div>
        <StatusBadge status={account.status} />
      </div>

      {/* Portfolio value card */}
      <div className="rounded-lg bg-white p-6 shadow">
        <p className="text-sm font-medium text-gray-500">Portfolio Value</p>
        <p className="mt-1 text-4xl font-bold text-gray-900">
          {formatCurrency(account.totalValue)}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {account.holdings.length} holding
          {account.holdings.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Holdings table */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Holdings</h2>
        {account.holdings.length === 0 ? (
          <p className="text-gray-500">No holdings yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 pr-4 font-medium">Symbol</th>
                  <th className="pb-3 pr-4 font-medium">Company</th>
                  <th className="pb-3 pr-4 font-medium text-right">Quantity</th>
                  <th className="pb-3 pr-4 font-medium text-right">Avg Cost</th>
                  <th className="pb-3 font-medium text-right">Total Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {account.holdings.map((holding) => (
                  <tr key={holding.id}>
                    <td className="py-3 pr-4 font-semibold text-gray-900">
                      {holding.symbol}
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      {holding.companyName ?? "—"}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {holding.quantity.toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {formatCurrency(holding.averageCostBasis)}
                    </td>
                    <td className="py-3 text-right font-medium">
                      {formatCurrency(holding.quantity * holding.averageCostBasis)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Buy/sell placeholder */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Trade
        </h2>
        <p className="text-gray-500">
          Buy and sell orders coming soon.
        </p>
      </div>
    </div>
  );
}
