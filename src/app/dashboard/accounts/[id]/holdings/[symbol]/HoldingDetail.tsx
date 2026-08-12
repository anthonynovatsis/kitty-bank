"use client";

import Link from "next/link";
import { api } from "~/trpc/react";
import { StatusBadge, statusTone } from "~/components/StatusBadge";
import { SummarySkeleton } from "~/components/Skeletons";
import { averageCents, cents, formatCents } from "~/lib/money";

export function HoldingDetail({
  accountId,
  symbol,
}: {
  accountId: string;
  symbol: string;
}) {
  const { data, isLoading, error } =
    api.user.investments.getHoldingDetail.useQuery({ accountId, symbol });

  if (isLoading) return <SummarySkeleton />;

  if (error) {
    return (
      <div className="bg-tone-danger rounded-lg p-4">
        <p className="text-tone-danger-foreground">
          {error.data?.code === "NOT_FOUND"
            ? "No position in this symbol."
            : "Failed to load the position."}
        </p>
      </div>
    );
  }

  if (!data) return null;

  const { holding } = data;

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <Link
          data-testid="back-to-account"
          href={`/dashboard/accounts/${accountId}`}
          className="text-primary text-sm hover:underline"
        >
          ← Back to account
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold">{data.symbol}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {holding?.companyName ?? "—"}
          </p>
        </div>
        {holding?.dividendReinvestment && (
          <StatusBadge tone="info" testId="drip-badge">
            DRIP on
          </StatusBadge>
        )}
      </div>

      {/* Position summary. A closed-out symbol keeps its history but has no
          holding row, so every figure here has to survive that. */}
      <div data-testid="position-summary" className="grid gap-4 sm:grid-cols-4">
        <Figure
          label="Shares"
          value={holding?.quantity.toLocaleString() ?? "0"}
        />
        <Figure
          label="Cost Basis"
          value={formatCents(holding?.totalCostBasis ?? cents(0))}
        />
        <Figure
          label="Avg Cost"
          value={
            holding && holding.quantity > 0
              ? formatCents(
                  averageCents(holding.totalCostBasis, holding.quantity),
                )
              : "—"
          }
        />
        <Figure
          label="Realised"
          value={formatCents(data.totalRealised)}
          testId="total-realised"
        />
      </div>

      {holding && holding.dividendCashBalance > 0 && (
        <p data-testid="residual" className="text-muted-foreground text-sm">
          The plan carried {formatCents(holding.dividendCashBalance)} forward
          after the last dividend.
        </p>
      )}

      <div
        data-testid="holding-transactions"
        className="bg-card rounded-lg p-6 shadow"
      >
        <h2 className="text-foreground mb-4 text-lg font-semibold">History</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="pr-4 pb-3 font-medium">Date</th>
                <th className="pr-4 pb-3 font-medium">Type</th>
                <th className="pr-4 pb-3 text-right font-medium">Shares</th>
                <th className="pr-4 pb-3 text-right font-medium">Price</th>
                <th className="pr-4 pb-3 text-right font-medium">Amount</th>
                {/* Only sales have one, and it is recomputed from the history
                    rather than remembered, so it moves if the history does. */}
                <th className="pr-4 pb-3 text-right font-medium">Realised</th>
                <th className="pb-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {data.transactions.map((row) => (
                <tr key={row.id} data-testid="holding-transaction-row">
                  <td className="py-3 pr-4">
                    {row.transactionDate.toLocaleDateString()}
                  </td>
                  <td className="py-3 pr-4 capitalize">
                    {row.transactionType.replace("_", " ")}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {row.quantity?.toLocaleString() ?? "—"}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {row.splitNumerator && row.splitDenominator
                      ? `${row.splitNumerator}-for-${row.splitDenominator}`
                      : row.price === null
                        ? "—"
                        : formatCents(row.price)}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {formatCents(row.amount)}
                  </td>
                  <td
                    data-testid="row-realised"
                    className="py-3 pr-4 text-right font-medium"
                  >
                    {row.realisedGain === null
                      ? "—"
                      : formatCents(row.realisedGain)}
                  </td>
                  <td className="py-3">
                    <StatusBadge tone={statusTone(row.status)}>
                      {row.status}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div className="bg-card rounded-lg p-4 shadow">
      <p className="text-muted-foreground text-sm font-medium">{label}</p>
      <p
        data-testid={testId}
        className="text-foreground mt-1 text-2xl font-bold"
      >
        {value}
      </p>
    </div>
  );
}
