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

type Mode = "deposit" | "withdraw" | "transfer";

const MODES: { id: Mode; label: string }[] = [
  { id: "deposit", label: "Deposit" },
  { id: "withdraw", label: "Withdraw" },
  { id: "transfer", label: "Transfer" },
];

/** Today as `YYYY-MM-DD` in the viewer's timezone, for the date input's bounds. */
function todayString() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * Turn the date input's `YYYY-MM-DD` into local midnight.
 *
 * `new Date("2026-08-08")` parses as *UTC* midnight, which is still in the
 * future for anyone east of UTC early in the day — the server would then reject
 * today's date as forward-dated. The explicit time component parses as local.
 */
function parseDateInput(value: string) {
  return new Date(`${value}T00:00:00`);
}

export function CashTransactionForms({
  accountId,
  balance,
}: {
  accountId: string;
  balance: number;
}) {
  const [mode, setMode] = useState<Mode>("deposit");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  // Defaults to today, so the common case needs no interaction.
  const [transactionDate, setTransactionDate] = useState(todayString());
  const [targetAccountId, setTargetAccountId] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const utils = api.useUtils();
  const { data: accounts } = api.user.accounts.list.useQuery();

  // Transfers can only target the user's own other open accounts.
  const transferTargets =
    accounts?.cashAccounts.filter(
      (account) => account.id !== accountId && account.status === "active",
    ) ?? [];

  const resetForm = () => {
    setAmount("");
    setDescription("");
    setTargetAccountId("");
    setTransactionDate(todayString());
  };

  const onSuccess = (data: { status: string }) => {
    setError(null);
    setResult(
      data.status === "pending"
        ? "Submitted for approval. The balance updates once an admin approves it."
        : "Transaction completed.",
    );
    resetForm();
    void utils.user.accounts.getDetails.invalidate({ accountId });
    void utils.user.accounts.list.invalidate();
    void utils.user.cash.getTransactions.invalidate({ accountId });
  };

  const onError = (err: { message: string }) => {
    setResult(null);
    setError(err.message);
  };

  const deposit = api.user.cash.deposit.useMutation({ onSuccess, onError });
  const withdraw = api.user.cash.withdraw.useMutation({ onSuccess, onError });
  const transfer = api.user.cash.transfer.useMutation({ onSuccess, onError });

  const isPending =
    deposit.isPending || withdraw.isPending || transfer.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    setError(null);

    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }

    if (!transactionDate) {
      setError("Choose a transaction date.");
      return;
    }

    const shared = {
      amount: parsed,
      transactionDate: parseDateInput(transactionDate),
      ...(description.trim() && { description: description.trim() }),
    };

    if (mode === "deposit") {
      deposit.mutate({ accountId, ...shared });
    } else if (mode === "withdraw") {
      withdraw.mutate({ accountId, ...shared });
    } else {
      if (!targetAccountId) {
        setError("Choose an account to transfer to.");
        return;
      }
      transfer.mutate({
        fromAccountId: accountId,
        toAccountId: targetAccountId,
        ...shared,
      });
    }
  };

  return (
    <div
      data-testid="cash-transaction-forms"
      className="rounded-lg bg-white p-6 shadow"
    >
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        New Transaction
      </h2>

      <div className="mb-4 flex gap-2">
        {MODES.map((m) => (
          <Button
            key={m.id}
            type="button"
            size="sm"
            variant={mode === m.id ? "default" : "secondary"}
            data-testid={`mode-${m.id}`}
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
        <div>
          <Label htmlFor="amount" className="mb-1">
            Amount *
          </Label>
          <Input
            id="amount"
            data-testid="amount-input"
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
          {mode !== "deposit" && (
            <p className="mt-1 text-xs text-gray-500">
              Available: ${balance.toFixed(2)}
            </p>
          )}
        </div>

        {mode === "transfer" && (
          <div>
            <Label htmlFor="transfer-target" className="mb-1">
              Transfer to *
            </Label>
            {/* Base UI hands back null when a select is cleared; "" is our empty. */}
            <Select
              value={targetAccountId}
              onValueChange={(value) => setTargetAccountId(value ?? "")}
            >
              <SelectTrigger
                id="transfer-target"
                data-testid="transfer-target"
                className="w-full"
              >
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                {transferTargets.map((account) => (
                  <SelectItem
                    key={account.id}
                    value={account.id}
                    data-testid={`option-${account.id}`}
                  >
                    {account.accountName} ({account.accountNumber})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {transferTargets.length === 0 && (
              <p
                data-testid="no-transfer-targets"
                className="mt-1 text-xs text-gray-500"
              >
                You need another open cash account to transfer to.
              </p>
            )}
          </div>
        )}

        <div>
          <Label htmlFor="transaction-date" className="mb-1">
            Date *
          </Label>
          <Input
            id="transaction-date"
            data-testid="transaction-date-input"
            type="date"
            value={transactionDate}
            max={todayString()}
            onChange={(e) => setTransactionDate(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-500">
            When the money moved. Defaults to today; back-date to record a past
            transaction.
          </p>
        </div>

        <div>
          <Label htmlFor="description" className="mb-1">
            Description
          </Label>
          <Input
            id="description"
            data-testid="description-input"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional note"
          />
        </div>

        <Button
          type="submit"
          data-testid="submit-transaction"
          disabled={isPending}
        >
          {isPending ? "Submitting..." : `Submit ${mode}`}
        </Button>
      </form>

      {result && (
        <p
          data-testid="transaction-result"
          className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800"
        >
          {result}
        </p>
      )}
      {error && (
        <p
          data-testid="transaction-error"
          className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
    </div>
  );
}
