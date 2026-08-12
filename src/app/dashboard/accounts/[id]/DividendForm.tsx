"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { formatCents, type Cents } from "~/lib/money";

type Position = {
  symbol: string;
  quantity: number;
  dividendCashBalance: Cents;
};

type Mode = "reinvested" | "cash";

const MODES: { id: Mode; label: string }[] = [
  { id: "reinvested", label: "Reinvested" },
  { id: "cash", label: "Paid as cash" },
];

/** Today as `YYYY-MM-DD` in the viewer's timezone, for the date input's bounds. */
function todayString() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/** Local midnight — a UTC-parsed date reads as tomorrow east of UTC. */
function parseDateInput(value: string) {
  return new Date(`${value}T00:00:00`);
}

/**
 * Record a dividend from its statement.
 *
 * Every field here is copied rather than calculated. The registry already
 * decided how many shares the dividend bought and what it kept back, and a
 * second set of arithmetic could only disagree with the paper.
 */
export function DividendForm({
  accountId,
  holdings,
}: {
  accountId: string;
  holdings: Position[];
}) {
  const [mode, setMode] = useState<Mode>("reinvested");
  const [symbol, setSymbol] = useState("");
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [broughtForward, setBroughtForward] = useState("");
  const [carriedForward, setCarriedForward] = useState("");
  const [description, setDescription] = useState("");
  const [transactionDate, setTransactionDate] = useState(todayString());
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const utils = api.useUtils();
  const held = holdings.find((holding) => holding.symbol === symbol);

  const resetForm = () => {
    setAmount("");
    setQuantity("");
    setPrice("");
    setBroughtForward("");
    setCarriedForward("");
    setDescription("");
    setTransactionDate(todayString());
  };

  const record = api.user.investments.recordDividend.useMutation({
    onSuccess: (data) => {
      setError(null);
      setResult(
        data.status === "pending"
          ? "Submitted for approval. The position updates once an admin approves it."
          : "Dividend recorded.",
      );
      resetForm();
      void utils.user.accounts.getDetails.invalidate({ accountId });
      void utils.user.accounts.list.invalidate();
      void utils.user.investments.getTransactions.invalidate({ accountId });
      void utils.user.investments.getHoldings.invalidate({ accountId });
    },
    onError: (err) => {
      setResult(null);
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    setError(null);

    if (!symbol) {
      setError("Choose a position.");
      return;
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Enter the dividend amount.");
      return;
    }

    if (mode === "reinvested") {
      const parsedQuantity = Number(quantity);
      const parsedPrice = Number(price);
      if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
        setError("Enter the whole number of shares allotted.");
        return;
      }
      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        setError("Enter the price the shares were allotted at.");
        return;
      }
    }

    record.mutate({
      accountId,
      symbol,
      amount: parsedAmount,
      transactionDate: parseDateInput(transactionDate),
      residualBroughtForward: Number(broughtForward) || 0,
      residualCarriedForward: Number(carriedForward) || 0,
      ...(mode === "reinvested" && {
        quantity: Number(quantity),
        price: Number(price),
      }),
      ...(description.trim() && { description: description.trim() }),
    });
  };

  if (holdings.length === 0) return null;

  return (
    <div data-testid="dividend-form" className="bg-card rounded-lg p-6 shadow">
      <h2 className="text-foreground mb-1 text-lg font-semibold">
        Record a Dividend
      </h2>
      <p className="text-muted-foreground mb-4 text-sm">
        Copied from the statement rather than worked out — the registry has
        already done the arithmetic.
      </p>

      <div className="mb-4 flex gap-2">
        {MODES.map((m) => (
          <Button
            key={m.id}
            type="button"
            size="sm"
            variant={mode === m.id ? "default" : "secondary"}
            data-testid={`dividend-mode-${m.id}`}
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
            <Label htmlFor="dividend-symbol" className="mb-1">
              Position *
            </Label>
            <Select
              items={holdings.map((h) => ({
                value: h.symbol,
                label: `${h.symbol} (${h.quantity})`,
              }))}
              value={symbol}
              onValueChange={(value) => setSymbol(value ?? "")}
            >
              <SelectTrigger
                id="dividend-symbol"
                data-testid="dividend-symbol"
                className="w-full"
              >
                <SelectValue placeholder="Select a position" />
              </SelectTrigger>
              <SelectContent>
                {holdings.map((h) => (
                  <SelectItem
                    key={h.symbol}
                    value={h.symbol}
                    data-testid={`option-${h.symbol}`}
                  >
                    {h.symbol} ({h.quantity})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {held && held.dividendCashBalance > 0 && (
              <p
                data-testid="last-residual"
                className="text-muted-foreground mt-1 text-xs"
              >
                Last statement carried {formatCents(held.dividendCashBalance)}.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="dividend-amount" className="mb-1">
              Dividend paid *
            </Label>
            <Input
              id="dividend-amount"
              data-testid="dividend-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>

        {mode === "reinvested" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="dividend-quantity" className="mb-1">
                Shares allotted *
              </Label>
              <Input
                id="dividend-quantity"
                data-testid="dividend-quantity"
                type="number"
                step="1"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label htmlFor="dividend-price" className="mb-1">
                Allotted at *
              </Label>
              <Input
                id="dividend-price"
                data-testid="dividend-price"
                type="number"
                step="0.01"
                min="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="brought-forward" className="mb-1">
              Balance brought forward
            </Label>
            <Input
              id="brought-forward"
              data-testid="brought-forward"
              type="number"
              step="0.01"
              min="0"
              value={broughtForward}
              onChange={(e) => setBroughtForward(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="carried-forward" className="mb-1">
              Balance carried forward
            </Label>
            <Input
              id="carried-forward"
              data-testid="carried-forward"
              type="number"
              step="0.01"
              min="0"
              value={carriedForward}
              onChange={(e) => setCarriedForward(e.target.value)}
              placeholder="0.00"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Both ends, so the next statement can be checked against this one.
            </p>
          </div>
        </div>

        <div>
          <Label htmlFor="dividend-date" className="mb-1">
            Date *
          </Label>
          <Input
            id="dividend-date"
            data-testid="dividend-date"
            type="date"
            value={transactionDate}
            max={todayString()}
            onChange={(e) => setTransactionDate(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="dividend-description" className="mb-1">
            Description
          </Label>
          <Input
            id="dividend-description"
            data-testid="dividend-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional note"
          />
        </div>

        <Button
          type="submit"
          data-testid="submit-dividend"
          disabled={record.isPending}
        >
          {record.isPending ? "Recording..." : "Record dividend"}
        </Button>
      </form>

      {result && (
        <p
          data-testid="dividend-result"
          className="bg-tone-positive text-tone-positive-foreground mt-4 rounded-md p-3 text-sm"
        >
          {result}
        </p>
      )}
      {error && (
        <p
          data-testid="dividend-error"
          className="bg-tone-danger text-tone-danger-foreground mt-4 rounded-md p-3 text-sm"
        >
          {error}
        </p>
      )}
    </div>
  );
}
