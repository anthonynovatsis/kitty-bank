"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ThemeIllustration } from "~/components/ThemeIllustration";
import { formatCents, cents } from "~/lib/money";

type Mode = "buy" | "sell";

const MODES: { id: Mode; label: string }[] = [
  { id: "buy", label: "Buy" },
  { id: "sell", label: "Sell" },
];

/** Today as `YYYY-MM-DD` in the viewer's timezone, for the date input's bounds. */
function todayString() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * Turn the date input's `YYYY-MM-DD` into local midnight — `new Date("2026-08-08")`
 * parses as UTC, which the server would reject as forward-dated for anyone east
 * of UTC early in the day.
 */
function parseDateInput(value: string) {
  return new Date(`${value}T00:00:00`);
}

export function TradeForms({
  accountId,
  holdings,
}: {
  accountId: string;
  holdings: { symbol: string; quantity: number }[];
}) {
  const [mode, setMode] = useState<Mode>("buy");
  const [symbol, setSymbol] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [brokerage, setBrokerage] = useState("");
  const [description, setDescription] = useState("");
  const [transactionDate, setTransactionDate] = useState(todayString());
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const utils = api.useUtils();

  // What a sale can be against, so the shares held show next to the input.
  const held = holdings.find(
    (holding) => holding.symbol === symbol.trim().toUpperCase(),
  );

  /*
   * The running total, shown before submitting. Deliberately mirrors the
   * server's `tradeAmount` — brokerage costs the trader either way, so it is
   * added to a buy and taken off a sell — because a figure on screen that
   * disagreed with the recorded one would be worse than showing nothing.
   */
  const estimate = (() => {
    const q = Number(quantity);
    const p = Number(price);
    const fee = Number(brokerage) || 0;
    if (!Number.isFinite(q) || !Number.isFinite(p) || q <= 0 || p <= 0) {
      return null;
    }
    const gross = Math.round(q * p * 100);
    return cents(mode === "buy" ? gross + fee * 100 : gross - fee * 100);
  })();

  const resetForm = () => {
    setSymbol("");
    setCompanyName("");
    setQuantity("");
    setPrice("");
    setBrokerage("");
    setDescription("");
    setTransactionDate(todayString());
  };

  const onSuccess = (data: { status: string; realisedGain: number | null }) => {
    setError(null);
    setResult(
      data.status === "pending"
        ? "Submitted for approval. The position updates once an admin approves it."
        : data.realisedGain !== null
          ? `Trade executed. Realised ${formatCents(cents(data.realisedGain))}.`
          : "Trade executed.",
    );
    resetForm();
    void utils.user.accounts.getDetails.invalidate({ accountId });
    void utils.user.accounts.list.invalidate();
    void utils.user.investments.getTransactions.invalidate({ accountId });
    void utils.user.investments.getHoldings.invalidate({ accountId });
  };

  const onError = (err: { message: string }) => {
    setResult(null);
    setError(err.message);
  };

  const buy = api.user.investments.buy.useMutation({ onSuccess, onError });
  const sell = api.user.investments.sell.useMutation({ onSuccess, onError });

  const isPending = buy.isPending || sell.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    setError(null);

    if (!symbol.trim()) {
      setError("Enter a symbol.");
      return;
    }

    const parsedQuantity = Number(quantity);
    // Whole shares only — a fraction settles to cash instead, which is not
    // built. Caught here so the message is about shares, not about a constraint.
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      setError("Enter a whole number of shares.");
      return;
    }

    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError("Enter a price greater than zero.");
      return;
    }

    const parsedBrokerage = brokerage ? Number(brokerage) : 0;
    if (!Number.isFinite(parsedBrokerage) || parsedBrokerage < 0) {
      setError("Brokerage cannot be negative.");
      return;
    }

    if (!transactionDate) {
      setError("Choose a trade date.");
      return;
    }

    const shared = {
      accountId,
      symbol: symbol.trim(),
      quantity: parsedQuantity,
      price: parsedPrice,
      brokerage: parsedBrokerage,
      transactionDate: parseDateInput(transactionDate),
      ...(description.trim() && { description: description.trim() }),
    };

    if (mode === "buy") {
      buy.mutate({
        ...shared,
        ...(companyName.trim() && { companyName: companyName.trim() }),
      });
    } else {
      sell.mutate(shared);
    }
  };

  return (
    <div data-testid="trade-forms" className="bg-card rounded-lg p-6 shadow">
      <h2 className="text-foreground mb-4 text-lg font-semibold">Trade</h2>

      <div className="mb-4 flex gap-2">
        {MODES.map((m) => (
          <Button
            key={m.id}
            type="button"
            size="sm"
            variant={mode === m.id ? "default" : "secondary"}
            data-testid={`trade-mode-${m.id}`}
            onClick={() => {
              setMode(m.id);
              setResult(null);
              setError(null);
            }}
          >
            {m.label}
          </Button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="symbol" className="mb-1">
              Symbol *
            </Label>
            <Input
              id="symbol"
              data-testid="symbol-input"
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="AAPL"
              // Folded to upper case on the server too; this just shows what
              // will be recorded rather than letting the two look different.
              className="uppercase"
            />
            {mode === "sell" && (
              <p
                data-testid="shares-held"
                className="text-muted-foreground mt-1 text-xs"
              >
                {held
                  ? `Holding ${held.quantity} share${held.quantity === 1 ? "" : "s"}`
                  : "No position in this symbol."}
              </p>
            )}
          </div>

          {mode === "buy" && (
            <div>
              <Label htmlFor="company-name" className="mb-1">
                Company
              </Label>
              <Input
                id="company-name"
                data-testid="company-name-input"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Optional"
              />
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="quantity" className="mb-1">
              Shares *
            </Label>
            <Input
              id="quantity"
              data-testid="quantity-input"
              type="number"
              step="1"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
            />
          </div>

          <div>
            <Label htmlFor="price" className="mb-1">
              Price per share *
            </Label>
            <Input
              id="price"
              data-testid="price-input"
              type="number"
              step="0.01"
              min="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div>
            <Label htmlFor="brokerage" className="mb-1">
              Brokerage
            </Label>
            <Input
              id="brokerage"
              data-testid="brokerage-input"
              type="number"
              step="0.01"
              min="0"
              value={brokerage}
              onChange={(e) => setBrokerage(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="trade-date" className="mb-1">
            Date *
          </Label>
          <Input
            id="trade-date"
            data-testid="trade-date-input"
            type="date"
            value={transactionDate}
            max={todayString()}
            onChange={(e) => setTransactionDate(e.target.value)}
          />
          <p className="text-muted-foreground mt-1 text-xs">
            When the trade happened. Defaults to today; back-date to record a
            past trade.
          </p>
        </div>

        <div>
          <Label htmlFor="trade-description" className="mb-1">
            Description
          </Label>
          <Input
            id="trade-description"
            data-testid="trade-description-input"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional note"
          />
        </div>

        {estimate !== null && (
          <p
            data-testid="trade-estimate"
            className="text-muted-foreground text-sm"
          >
            {mode === "buy" ? "Total cost" : "Net proceeds"}:{" "}
            <span className="text-foreground font-medium">
              {formatCents(estimate)}
            </span>
          </p>
        )}

        <Button type="submit" data-testid="submit-trade" disabled={isPending}>
          {isPending ? "Submitting..." : `Submit ${mode}`}
        </Button>
      </form>

      {result && (
        <p
          data-testid="trade-result"
          className="bg-tone-positive text-tone-positive-foreground mt-4 flex items-center gap-2 rounded-md p-3 text-sm"
        >
          <ThemeIllustration
            name="success"
            className="size-6 shrink-0 text-current"
          />
          {result}
        </p>
      )}
      {error && (
        <p
          data-testid="trade-error"
          className="bg-tone-danger text-tone-danger-foreground mt-4 rounded-md p-3 text-sm"
        >
          {error}
        </p>
      )}
    </div>
  );
}
