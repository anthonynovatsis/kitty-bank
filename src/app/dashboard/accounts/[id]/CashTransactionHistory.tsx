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
      className="bg-card rounded-lg p-6 shadow"
    >
      <h2 className="text-foreground mb-4 text-lg font-semibold">
        Transaction History
      </h2>

      {isLoading ? (
        <p className="text-muted-foreground">Loading transactions...</p>
      ) : !data || data.length === 0 ? (
        <p data-testid="no-transactions" className="text-muted-foreground">
          No transactions yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="pr-4 pb-3 font-medium">Date</th>
                <th className="pr-4 pb-3 font-medium">Type</th>
                <th className="pr-4 pb-3 font-medium">Description</th>
                <th className="pr-4 pb-3 text-right font-medium">Amount</th>
                <th className="pb-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {data.map((transaction) => (
                <tr key={transaction.id} data-testid="transaction-row">
                  <td
                    data-testid="transaction-date"
                    className="text-muted-foreground py-3 pr-4"
                  >
                    {transaction.transactionDate.toLocaleDateString()}
                  </td>
                  <td
                    data-testid="transaction-type"
                    className="py-3 pr-4 capitalize"
                  >
                    {transaction.transactionType}
                    {transaction.counterparty && (
                      <span className="text-muted-foreground ml-1">
                        {transaction.direction === "credit" ? "from" : "to"}{" "}
                        {transaction.counterparty.accountName}
                      </span>
                    )}
                  </td>
                  <td className="text-muted-foreground py-3 pr-4">
                    {transaction.description ?? "—"}
                  </td>
                  <td
                    data-testid="transaction-amount"
                    className={`py-3 pr-4 text-right font-medium ${
                      transaction.direction === "credit"
                        ? "text-tone-positive-foreground"
                        : "text-foreground"
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
