"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { StatusBadge } from "~/components/StatusBadge";
import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/ThemeIllustration";
import { TableSkeleton } from "~/components/Skeletons";
import { formatCents } from "~/lib/money";

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
      <div className="bg-card rounded-lg p-6 shadow">
        <TableSkeleton />
      </div>
    );
  }

  const transactions = data ?? [];

  return (
    <div
      data-testid="pending-transactions"
      className="bg-card rounded-lg p-6 shadow"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-medium">Transaction Approval Queue</h3>
        {/* Nothing to count is already said by the empty state below, so the
            badge only appears when there is actually a queue. */}
        {transactions.length > 0 && (
          <StatusBadge tone="warning" testId="pending-count">
            {`${transactions.length} Pending`}
          </StatusBadge>
        )}
      </div>

      {error && (
        <p
          data-testid="approval-error"
          className="bg-tone-danger text-tone-danger-foreground mb-4 rounded-md p-3 text-sm"
        >
          {error}
        </p>
      )}

      {transactions.length === 0 ? (
        <EmptyState
          illustration="empty-transactions"
          testId="no-pending-transactions"
        >
          No transactions awaiting approval.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="pr-4 pb-3 font-medium">Date</th>
                <th className="pr-4 pb-3 font-medium">User</th>
                <th className="pr-4 pb-3 font-medium">Type</th>
                <th className="pr-4 pb-3 font-medium">Kind</th>
                <th className="pr-4 pb-3 font-medium">Account</th>
                <th className="pr-4 pb-3 font-medium">Description</th>
                <th className="pr-4 pb-3 text-right font-medium">Amount</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {transactions.map((transaction) => {
                const isDeciding =
                  decide.isPending &&
                  decide.variables?.transactionId === transaction.id;

                return (
                  <tr
                    key={transaction.id}
                    data-testid="pending-transaction-row"
                  >
                    <td
                      data-testid="pending-transaction-date"
                      className="py-3 pr-4 whitespace-nowrap"
                    >
                      {transaction.transactionDate.toLocaleDateString()}
                      {/* Flag back-dating: an admin approving something dated
                          before it was submitted should be able to see that. */}
                      {transaction.transactionDate.toDateString() !==
                        transaction.createdAt.toDateString() && (
                        <StatusBadge
                          tone="warning"
                          testId="backdated-marker"
                          title={`Submitted ${transaction.createdAt.toLocaleDateString()}`}
                        >
                          back-dated
                        </StatusBadge>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-medium">
                        {transaction.createdBy.name ?? "—"}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {transaction.createdBy.email}
                      </p>
                    </td>
                    <td
                      data-testid="pending-transaction-type"
                      className="py-3 pr-4 capitalize"
                    >
                      {transaction.transactionType}
                    </td>
                    <td
                      data-testid="pending-transaction-kind"
                      className="py-3 pr-4"
                    >
                      <StatusBadge tone="info">
                        {transaction.kind === "cash" ? "Cash" : "Investment"}
                      </StatusBadge>
                    </td>
                    <td className="py-3 pr-4">
                      <p>{transaction.account.accountName}</p>
                      {transaction.kind === "cash" ? (
                        <>
                          {transaction.counterparty && (
                            <p className="text-muted-foreground text-xs">
                              → {transaction.counterparty.accountName}
                            </p>
                          )}
                          {/* Whether the money is still there to move. */}
                          <p className="text-muted-foreground text-xs">
                            Balance: {formatCents(transaction.balance)}
                          </p>
                        </>
                      ) : transaction.ratio ? (
                        // A split has no price, and its effect is not known
                        // until it settles against whatever is held then.
                        <p
                          data-testid="pending-trade-detail"
                          className="text-muted-foreground text-xs"
                        >
                          {transaction.ratio.numerator}-for-
                          {transaction.ratio.denominator} on{" "}
                          {transaction.symbol}
                          {transaction.quantity !== null &&
                            ` → ${transaction.quantity} shares`}
                        </p>
                      ) : (
                        <p
                          data-testid="pending-trade-detail"
                          className="text-muted-foreground text-xs"
                        >
                          {transaction.quantity} × {transaction.symbol} @{" "}
                          {formatCents(transaction.price!)}
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {transaction.description ?? "—"}
                    </td>
                    <td
                      data-testid="pending-transaction-amount"
                      className="py-3 pr-4 text-right font-medium"
                    >
                      {formatCents(transaction.amount)}
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          data-testid="approve-button"
                          disabled={isDeciding}
                          onClick={() =>
                            decide.mutate({
                              kind: transaction.kind,
                              transactionId: transaction.id,
                              action: "approve",
                            })
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid="reject-button"
                          disabled={isDeciding}
                          onClick={() =>
                            decide.mutate({
                              kind: transaction.kind,
                              transactionId: transaction.id,
                              action: "reject",
                            })
                          }
                        >
                          Reject
                        </Button>
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
