"use client";

import { api } from "~/trpc/react";
import { StatusBadge, statusTone } from "~/components/StatusBadge";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function CashTransactionHistory({ accountId }: { accountId: string }) {
  const { data, isLoading } = api.user.cash.getTransactions.useQuery({
    accountId,
  });

  return (
    <div
      data-testid="transaction-history"
      className="rounded-lg bg-white p-6 shadow"
    >
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        Transaction History
      </h2>

      {isLoading ? (
        <p className="text-gray-500">Loading transactions...</p>
      ) : !data || data.length === 0 ? (
        <p data-testid="no-transactions" className="text-gray-500">
          No transactions yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pr-4 pb-3 font-medium">Date</th>
                <th className="pr-4 pb-3 font-medium">Type</th>
                <th className="pr-4 pb-3 font-medium">Description</th>
                <th className="pr-4 pb-3 text-right font-medium">Amount</th>
                <th className="pb-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((transaction) => (
                <tr key={transaction.id} data-testid="transaction-row">
                  <td
                    data-testid="transaction-date"
                    className="py-3 pr-4 text-gray-600"
                  >
                    {transaction.transactionDate.toLocaleDateString()}
                  </td>
                  <td
                    data-testid="transaction-type"
                    className="py-3 pr-4 capitalize"
                  >
                    {transaction.transactionType}
                    {transaction.counterparty && (
                      <span className="ml-1 text-gray-500">
                        {transaction.direction === "credit" ? "from" : "to"}{" "}
                        {transaction.counterparty.accountName}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-gray-600">
                    {transaction.description ?? "—"}
                  </td>
                  <td
                    data-testid="transaction-amount"
                    className={`py-3 pr-4 text-right font-medium ${
                      transaction.direction === "credit"
                        ? "text-green-700"
                        : "text-gray-900"
                    }`}
                  >
                    {transaction.direction === "credit" ? "+" : "−"}
                    {formatCurrency(transaction.amount)}
                  </td>
                  <td className="py-3">
                    <StatusBadge
                      tone={statusTone(transaction.status)}
                      testId="transaction-status"
                    >
                      {transaction.status}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
