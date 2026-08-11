"use client";

import Link from "next/link";
import { api } from "~/trpc/react";
import { StatusBadge, statusTone } from "~/components/StatusBadge";
import { CashTransactionForms } from "./CashTransactionForms";
import { CashTransactionHistory } from "./CashTransactionHistory";
import { TradeForms } from "./TradeForms";
import { TradeHistory } from "./TradeHistory";
import { EmptyState } from "~/components/ThemeIllustration";
import { SummarySkeleton } from "~/components/Skeletons";
import { averageCents, formatCents, type Cents } from "~/lib/money";

/** Binds the account-status testid, so both render sites stay selectable alike. */
function AccountStatusBadge({ status }: { status: "active" | "closed" }) {
  return (
    <StatusBadge tone={statusTone(status)} testId="status-badge">
      {status}
    </StatusBadge>
  );
}

export function AccountDetail({ accountId }: { accountId: string }) {
  const { data, isLoading, error } = api.user.accounts.getDetails.useQuery({
    accountId,
  });

  if (isLoading) {
    return <SummarySkeleton />;
  }

  if (error) {
    return (
      <div>
        <div className="bg-tone-danger rounded-lg p-4">
          <p className="text-tone-danger-foreground">
            {error.data?.code === "NOT_FOUND"
              ? "Account not found."
              : "Failed to load account."}
          </p>
          <Link
            href="/dashboard"
            className="text-primary mt-2 text-sm hover:underline"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      <div className="mb-6">
        <Link
          data-testid="back-to-dashboard"
          href="/dashboard"
          className="text-primary text-sm hover:underline"
        >
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
  balance: Cents;
  status: "active" | "closed";
  createdAt: Date;
};

function CashAccountDetail({ account }: { account: CashAccount }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold">
            {account.accountName}
          </h1>
          <p
            data-testid="account-subtitle"
            className="text-muted-foreground mt-1 text-sm"
          >
            {account.accountNumber} •{" "}
            <span className="capitalize">{account.accountType}</span>
          </p>
        </div>
        <AccountStatusBadge status={account.status} />
      </div>

      {/* Balance card */}
      <div className="bg-card rounded-lg p-6 shadow">
        <p className="text-muted-foreground text-sm font-medium">
          Current Balance
        </p>
        <p
          data-testid="account-balance"
          className="text-foreground mt-1 text-4xl font-bold"
        >
          {formatCents(account.balance)}
        </p>
      </div>

      {account.status === "active" && (
        <CashTransactionForms
          accountId={account.id}
          balance={account.balance}
        />
      )}

      <CashTransactionHistory accountId={account.id} />
    </div>
  );
}

type Holding = {
  id: string;
  symbol: string;
  companyName: string | null;
  quantity: number;
  totalCostBasis: Cents;
  dividendReinvestment: boolean;
};

type InvestmentAccount = {
  id: string;
  accountName: string;
  accountNumber: string;
  status: "active" | "closed";
  createdAt: Date;
  totalCost: Cents;
  holdings: Holding[];
};

function InvestmentAccountDetail({ account }: { account: InvestmentAccount }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold">
            {account.accountName}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {account.accountNumber}
          </p>
        </div>
        <AccountStatusBadge status={account.status} />
      </div>

      {/* Cost basis card. Not "portfolio value" — there is no market data yet,
          so this is what the positions cost, not what they are worth. */}
      <div
        data-testid="portfolio-summary"
        className="bg-card rounded-lg p-6 shadow"
      >
        <p className="text-muted-foreground text-sm font-medium">Cost Basis</p>
        <p className="text-foreground mt-1 text-4xl font-bold">
          {formatCents(account.totalCost)}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {account.holdings.length} holding
          {account.holdings.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Holdings table */}
      <div
        data-testid="holdings-section"
        className="bg-card rounded-lg p-6 shadow"
      >
        <h2 className="text-foreground mb-4 text-lg font-semibold">Holdings</h2>
        {account.holdings.length === 0 ? (
          <EmptyState illustration="empty-holdings">
            No holdings yet.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="pr-4 pb-3 font-medium">Symbol</th>
                  <th className="pr-4 pb-3 font-medium">Company</th>
                  <th className="pr-4 pb-3 text-right font-medium">Quantity</th>
                  <th className="pr-4 pb-3 text-right font-medium">Avg Cost</th>
                  <th className="pb-3 text-right font-medium">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {account.holdings.map((holding) => (
                  <tr key={holding.id}>
                    <td className="text-foreground py-3 pr-4 font-semibold">
                      {holding.symbol}
                    </td>
                    <td className="py-3 pr-4">{holding.companyName ?? "—"}</td>
                    <td className="py-3 pr-4 text-right">
                      {holding.quantity.toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {formatCents(
                        averageCents(holding.totalCostBasis, holding.quantity),
                      )}
                    </td>
                    <td className="py-3 text-right font-medium">
                      {formatCents(holding.totalCostBasis)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {account.status === "active" && (
        <TradeForms accountId={account.id} holdings={account.holdings} />
      )}

      <TradeHistory accountId={account.id} />
    </div>
  );
}
