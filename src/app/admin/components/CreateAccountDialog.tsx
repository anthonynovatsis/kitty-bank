"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { UserSearchCombobox } from "./UserSearchCombobox";

interface CreateAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccountCreated: () => void;
}

export function CreateAccountDialog({
  open,
  onOpenChange,
  onAccountCreated,
}: CreateAccountDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<"cash" | "investment" | "">(
    "",
  );
  const [cashAccountType, setCashAccountType] = useState<
    "checking" | "savings" | ""
  >("");
  const createAccountMutation = api.admin.accounts.create.useMutation({
    onSuccess: () => {
      alert("Account created successfully");
      resetForm();
      onAccountCreated();
    },
    onError: (error) => {
      alert(error?.message ?? "Failed to create account");
    },
  });

  const resetForm = () => {
    setSelectedUserId("");
    setAccountName("");
    setAccountType("");
    setCashAccountType("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedUserId || !accountName || !accountType) {
      alert("Please fill in all required fields");
      return;
    }

    if (accountType === "cash" && !cashAccountType) {
      alert("Please select a cash account type");
      return;
    }

    createAccountMutation.mutate({
      userId: selectedUserId,
      accountName,
      accountType,
      ...(accountType === "cash" && cashAccountType && { cashAccountType }),
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  if (!open) return null;

  return (
    <div className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Create New Account</h2>
          <p className="text-sm text-gray-600">
            Create a new cash or investment account for a user.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="user-search"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              User *
            </label>
            <UserSearchCombobox
              value={selectedUserId}
              onValueChange={setSelectedUserId}
            />
          </div>

          <div>
            <label
              htmlFor="account-name"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Account Name *
            </label>
            <input
              id="account-name"
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g., John's Checking Account"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="account-type"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Account Type *
            </label>
            <select
              id="account-type"
              value={accountType}
              onChange={(e) => {
                const value = e.target.value as "cash" | "investment";
                setAccountType(value);
                if (value === "investment") {
                  setCashAccountType("");
                }
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">Select account type</option>
              <option value="cash">Cash Account</option>
              <option value="investment">Investment Account</option>
            </select>
          </div>

          {accountType === "cash" && (
            <div>
              <label
                htmlFor="cash-account-type"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Cash Account Type *
              </label>
              <select
                id="cash-account-type"
                value={cashAccountType}
                onChange={(e) =>
                  setCashAccountType(e.target.value as "checking" | "savings")
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">Select cash account type</option>
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
              </select>
            </div>
          )}

          <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={createAccountMutation.isPending}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createAccountMutation.isPending}
              className="rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
            >
              {createAccountMutation.isPending ? "Creating..." : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
