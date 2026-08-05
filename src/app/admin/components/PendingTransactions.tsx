"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function PendingTransactions() {
  const [error, setError] = useState<string | null>(null);

  const utils = api.useUtils();
  const { data, isLoading } = api.admin.transactions.pending.useQuery();

  const decide = api.admin.transactions.approve.useMutation({
    onSuccess: () => {
      setError(null);
      void utils.admin.transactions.pending.invalidate();
      // Approving moves money, so the account lists are stale too.
      void utils.admin.accounts.list.invalidate();
      void utils.admin.users.list.invalidate();
    },
    onError: (err) => setError(err.message),
  });

  if (isLoading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <p className="text-gray-500">Loading pending transactions...</p>
      </div>
    );
  }

  const transactions = data ?? [];

  return (
    <div
      data-testid="pending-transactions"
      className="rounded-lg bg-white p-6 shadow"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-medium">Transaction Approval Queue</h3>
        <span
          data-testid="pending-count"
          className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800"
        >
          {transactions.length} pending
        </span>
      </div>

      {error && (
        <p
          data-testid="approval-error"
          className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      {transactions.length === 0 ? (
        <p data-testid="no-pending-transactions" className="text-gray-500">
          No transactions awaiting approval.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pr-4 pb-3 font-medium">User</th>
                <th className="pr-4 pb-3 font-medium">Type</th>
                <th className="pr-4 pb-3 font-medium">Account</th>
                <th className="pr-4 pb-3 font-medium">Description</th>
                <th className="pr-4 pb-3 text-right font-medium">Amount</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.map((transaction) => {
                const isDeciding =
                  decide.isPending &&
                  decide.variables?.transactionId === transaction.id;

                return (
                  <tr
                    key={transaction.id}
                    data-testid="pending-transaction-row"
                  >
                    <td className="py-3 pr-4">
                      <p className="font-medium">
                        {transaction.createdBy.name ?? "—"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {transaction.createdBy.email}
                      </p>
                    </td>
                    <td
                      data-testid="pending-transaction-type"
                      className="py-3 pr-4 capitalize"
                    >
                      {transaction.transactionType}
                    </td>
                    <td className="py-3 pr-4">
                      <p>{transaction.cashAccount.accountName}</p>
                      {transaction.transactionType === "transfer" &&
                        transaction.toAccount && (
                          <p className="text-xs text-gray-500">
                            → {transaction.toAccount.accountName}
                          </p>
                        )}
                      <p className="text-xs text-gray-500">
                        Balance:{" "}
                        {formatCurrency(transaction.cashAccount.balance)}
                      </p>
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      {transaction.description ?? "—"}
                    </td>
                    <td
                      data-testid="pending-transaction-amount"
                      className="py-3 pr-4 text-right font-medium"
                    >
                      {formatCurrency(transaction.amount)}
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button
                          data-testid="approve-button"
                          disabled={isDeciding}
                          onClick={() =>
                            decide.mutate({
                              transactionId: transaction.id,
                              action: "approve",
                            })
                          }
                          className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          data-testid="reject-button"
                          disabled={isDeciding}
                          onClick={() =>
                            decide.mutate({
                              transactionId: transaction.id,
                              action: "reject",
                            })
                          }
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
