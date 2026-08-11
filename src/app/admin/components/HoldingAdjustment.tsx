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

type Account = {
  id: string;
  accountName: string;
  accountNumber: string;
  holdings: Position[];
};

/**
 * Apply a split or consolidation to a position.
 *
 * Admin-only and immediate — no user submits a corporate action, so this never
 * touches the approval queue.
 */
export function HoldingAdjustment({ accounts }: { accounts: Account[] }) {
  const [accountId, setAccountId] = useState("");
  const [symbol, setSymbol] = useState("");
  const [numerator, setNumerator] = useState("2");
  const [denominator, setDenominator] = useState("1");
  const [override, setOverride] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const utils = api.useUtils();

  const withHoldings = accounts.filter(
    (account) => account.holdings.length > 0,
  );
  const account = withHoldings.find((a) => a.id === accountId);
  const held = account?.holdings.find((h) => h.symbol === symbol);

  /*
   * What the ratio alone would give. Shown as the default so the common case
   * needs no arithmetic, and left editable because the registry's number —
   * which has already absorbed any rounding — is the one that counts.
   */
  const computed = (() => {
    const num = Number(numerator);
    const den = Number(denominator);
    if (!held || !num || !den) return null;
    const scaled = held.quantity * num;
    return scaled % den === 0 ? scaled / den : null;
  })();

  const adjust = api.admin.holdings.adjust.useMutation({
    onSuccess: (data) => {
      setError(null);
      setResult(
        `${data.symbol}: ${data.previousQuantity} → ${data.resultingQuantity} shares.`,
      );
      setOverride("");
      void utils.admin.accounts.list.invalidate();
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

    if (!accountId || !symbol) {
      setError("Choose an account and a position.");
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

  return (
    <div
      data-testid="holding-adjustment"
      className="bg-card mt-6 rounded-lg p-6 shadow"
    >
      <h3 className="mb-1 text-lg font-medium">Split or Consolidate</h3>
      <p className="text-muted-foreground mb-4 text-sm">
        Restates the share count. The cost basis is unchanged — a split changes
        how many pieces a holding is in, not what it cost.
      </p>

      {withHoldings.length === 0 ? (
        <p data-testid="no-positions" className="text-muted-foreground text-sm">
          No positions to adjust.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="adjust-account" className="mb-1">
                Account *
              </Label>
              <Select
                items={withHoldings.map((a) => ({
                  value: a.id,
                  label: `${a.accountName} (${a.accountNumber})`,
                }))}
                value={accountId}
                onValueChange={(value) => {
                  setAccountId(value ?? "");
                  setSymbol("");
                }}
              >
                <SelectTrigger
                  id="adjust-account"
                  data-testid="adjust-account"
                  className="w-full"
                >
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {withHoldings.map((a) => (
                    <SelectItem
                      key={a.id}
                      value={a.id}
                      data-testid={`option-${a.id}`}
                    >
                      {a.accountName} ({a.accountNumber})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="adjust-symbol" className="mb-1">
                Position *
              </Label>
              <Select
                items={(account?.holdings ?? []).map((h) => ({
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
                  {(account?.holdings ?? []).map((h) => (
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
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
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
                  ? "This ratio leaves a fraction — enter the count from the statement."
                  : "Leave blank to use the ratio."}
              </p>
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
      )}

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
