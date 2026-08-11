"use client";

import { api } from "~/trpc/react";
import { StatusBadge, statusTone } from "~/components/StatusBadge";
import { TableSkeleton } from "~/components/Skeletons";
import { formatCents } from "~/lib/money";

export function TradeHistory({ accountId }: { accountId: string }) {
  const { data, isLoading } = api.user.investments.getTransactions.useQuery({
    accountId,
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
                <th className="pb-3 font-medium">Status</th>
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
                  <td className="py-3">
                    <StatusBadge
                      tone={statusTone(trade.status)}
                      testId="trade-status"
                    >
                      {trade.status}
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
