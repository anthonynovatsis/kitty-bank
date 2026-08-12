"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { StatusBadge, statusTone } from "~/components/StatusBadge";
import { Button } from "~/components/ui/button";
import { TableSkeleton } from "~/components/Skeletons";
import { formatCents } from "~/lib/money";

export function TradeHistory({ accountId }: { accountId: string }) {
  /*
   * Which row is asking to be confirmed. Deleting is not undoable and it moves
   * figures the user has already seen — later sales are recosted against the
   * corrected history — so it takes two clicks and says what it will do.
   */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const utils = api.useUtils();
  const { data, isLoading } = api.user.investments.getTransactions.useQuery({
    accountId,
  });

  const remove = api.user.investments.deleteTransaction.useMutation({
    onSuccess: () => {
      setError(null);
      setConfirming(null);
      void utils.user.accounts.getDetails.invalidate({ accountId });
      void utils.user.accounts.list.invalidate();
      void utils.user.investments.getTransactions.invalidate({ accountId });
      void utils.user.investments.getHoldings.invalidate({ accountId });
    },
    onError: (err) => {
      setConfirming(null);
      setError(err.message);
    },
  });

  return (
    <div data-testid="trade-history" className="bg-card rounded-lg p-6 shadow">
      <h2 className="text-foreground mb-4 text-lg font-semibold">
        Trade History
      </h2>

      {isLoading ? (
        <TableSkeleton />
      ) : !data || data.length === 0 ? (
        <p data-testid="no-trades" className="text-muted-foreground">
          No trades yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="pr-4 pb-3 font-medium">Date</th>
                <th className="pr-4 pb-3 font-medium">Type</th>
                <th className="pr-4 pb-3 font-medium">Symbol</th>
                <th className="pr-4 pb-3 text-right font-medium">Shares</th>
                <th className="pr-4 pb-3 text-right font-medium">Price</th>
                {/* Buys cost this, sells return it — the sign is carried by the
                    type column rather than by a minus that would read as a loss. */}
                <th className="pr-4 pb-3 text-right font-medium">Amount</th>
                <th className="pr-4 pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {data.map((trade) => (
                <tr key={trade.id} data-testid="trade-row">
                  <td data-testid="trade-date" className="py-3 pr-4">
                    {trade.transactionDate.toLocaleDateString()}
                  </td>
                  <td data-testid="trade-type" className="py-3 pr-4 capitalize">
                    {trade.transactionType.replace("_", " ")}
                  </td>
                  <td className="text-foreground py-3 pr-4 font-semibold">
                    {trade.symbol}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {/* A split's share count is the count it produced, or a
                        dash while it is still an instruction to apply a ratio. */}
                    {trade.quantity?.toLocaleString() ?? "—"}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {trade.splitNumerator && trade.splitDenominator
                      ? `${trade.splitNumerator}-for-${trade.splitDenominator}`
                      : trade.price === null
                        ? "—"
                        : formatCents(trade.price)}
                  </td>
                  <td
                    data-testid="trade-amount"
                    className="py-3 pr-4 text-right font-medium"
                  >
                    {formatCents(trade.amount)}
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge
                      tone={statusTone(trade.status)}
                      testId="trade-status"
                    >
                      {trade.status}
                    </StatusBadge>
                  </td>
                  <td className="py-3">
                    {confirming === trade.id ? (
                      <div className="flex items-center gap-2">
                        <span
                          data-testid="delete-warning"
                          className="text-muted-foreground text-xs"
                        >
                          Recalculates later trades.
                        </span>
                        <Button
                          size="sm"
                          variant="destructive"
                          data-testid="confirm-delete"
                          disabled={remove.isPending}
                          onClick={() =>
                            remove.mutate({ transactionId: trade.id })
                          }
                        >
                          Delete
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          data-testid="cancel-delete"
                          onClick={() => setConfirming(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        data-testid="delete-trade"
                        onClick={() => {
                          setError(null);
                          setConfirming(trade.id);
                        }}
                      >
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && (
        <p
          data-testid="delete-error"
          className="bg-tone-danger text-tone-danger-foreground mt-4 rounded-md p-3 text-sm"
        >
          {error}
        </p>
      )}
    </div>
  );
}
