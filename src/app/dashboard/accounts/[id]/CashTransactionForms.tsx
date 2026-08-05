"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

type Mode = "deposit" | "withdraw" | "transfer";

const MODES: { id: Mode; label: string }[] = [
  { id: "deposit", label: "Deposit" },
  { id: "withdraw", label: "Withdraw" },
  { id: "transfer", label: "Transfer" },
];

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

    const shared = {
      amount: parsed,
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
          <button
            key={m.id}
            type="button"
            data-testid={`mode-${m.id}`}
            onClick={() => {
              setMode(m.id);
              setResult(null);
              setError(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              mode === m.id
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="amount"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Amount *
          </label>
          <input
            id="amount"
            data-testid="amount-input"
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          {mode !== "deposit" && (
            <p className="mt-1 text-xs text-gray-500">
              Available: ${balance.toFixed(2)}
            </p>
          )}
        </div>

        {mode === "transfer" && (
          <div>
            <label
              htmlFor="transfer-target"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Transfer to *
            </label>
            <select
              id="transfer-target"
              data-testid="transfer-target"
              value={targetAccountId}
              onChange={(e) => setTargetAccountId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">Select an account</option>
              {transferTargets.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.accountName} ({account.accountNumber})
                </option>
              ))}
            </select>
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
          <label
            htmlFor="description"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Description
          </label>
          <input
            id="description"
            data-testid="description-input"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional note"
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          data-testid="submit-transaction"
          disabled={isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? "Submitting..." : `Submit ${mode}`}
        </button>
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
