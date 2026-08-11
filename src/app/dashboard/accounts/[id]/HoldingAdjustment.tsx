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

type Position = { symbol: string; quantity: number };

/**
 * Record a split or consolidation against one of your own positions.
 *
 * Follows the same approval rule as a trade: a trusted holder's applies
 * immediately, a supervised holder's queues for an admin.
 */
export function HoldingAdjustment({
  accountId,
  holdings,
}: {
  accountId: string;
  holdings: Position[];
}) {
  const [symbol, setSymbol] = useState("");
  const [numerator, setNumerator] = useState("2");
  const [denominator, setDenominator] = useState("1");
  const [override, setOverride] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const utils = api.useUtils();
  const held = holdings.find((holding) => holding.symbol === symbol);

  /*
   * What the ratio alone would give. Shown as the default so the common case
   * needs no arithmetic, and left editable because the registry's number — which
   * has already absorbed any rounding — is the one that counts.
   */
  const computed = (() => {
    const num = Number(numerator);
    const den = Number(denominator);
    if (!held || !num || !den) return null;
    const scaled = held.quantity * num;
    return scaled % den === 0 ? scaled / den : null;
  })();

  const adjust = api.user.investments.adjustHolding.useMutation({
    onSuccess: (data) => {
      setError(null);
      setResult(
        data.outcome
          ? `${data.outcome.symbol}: ${data.outcome.previousQuantity} → ${data.outcome.resultingQuantity} shares.`
          : "Submitted for approval. The position updates once an admin approves it.",
      );
      setOverride("");
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

    adjust.mutate({
      accountId,
      symbol,
      numerator: Number(numerator),
      denominator: Number(denominator),
      ...(override && { resultingQuantity: Number(override) }),
    });
  };

  if (holdings.length === 0) return null;

  return (
    <div
      data-testid="holding-adjustment"
      className="bg-card rounded-lg p-6 shadow"
    >
      <h2 className="text-foreground mb-1 text-lg font-semibold">
        Split or Consolidate
      </h2>
      <p className="text-muted-foreground mb-4 text-sm">
        Restates the share count. What the position cost is unchanged — a split
        changes how many pieces a holding is in, not what it cost.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="adjust-symbol" className="mb-1">
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
                id="adjust-symbol"
                data-testid="adjust-symbol"
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
          </div>

          <div>
            <Label htmlFor="adjust-resulting" className="mb-1">
              New share count
            </Label>
            <Input
              id="adjust-resulting"
              data-testid="adjust-resulting"
              type="number"
              min="1"
              step="1"
              value={override}
              placeholder={computed !== null ? String(computed) : "required"}
              onChange={(e) => setOverride(e.target.value)}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              {computed === null && held
                ? "This ratio leaves a fraction — enter the count from your statement."
                : "Leave blank to use the ratio."}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="adjust-numerator" className="mb-1">
              Ratio: new *
            </Label>
            <Input
              id="adjust-numerator"
              data-testid="adjust-numerator"
              type="number"
              min="1"
              step="1"
              value={numerator}
              onChange={(e) => setNumerator(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="adjust-denominator" className="mb-1">
              for old *
            </Label>
            <Input
              id="adjust-denominator"
              data-testid="adjust-denominator"
              type="number"
              min="1"
              step="1"
              value={denominator}
              onChange={(e) => setDenominator(e.target.value)}
            />
          </div>
        </div>

        <Button
          type="submit"
          data-testid="submit-adjustment"
          disabled={adjust.isPending}
        >
          {adjust.isPending ? "Applying..." : "Apply"}
        </Button>
      </form>

      {result && (
        <p
          data-testid="adjustment-result"
          className="bg-tone-positive text-tone-positive-foreground mt-4 rounded-md p-3 text-sm"
        >
          {result}
        </p>
      )}
      {error && (
        <p
          data-testid="adjustment-error"
          className="bg-tone-danger text-tone-danger-foreground mt-4 rounded-md p-3 text-sm"
        >
          {error}
        </p>
      )}
    </div>
  );
}
