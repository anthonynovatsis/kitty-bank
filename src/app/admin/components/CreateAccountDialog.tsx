"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { UserSearchCombobox } from "./UserSearchCombobox";

// Labels for <SelectValue>; without `items` Base UI shows the raw value.
const ACCOUNT_TYPE_ITEMS = [
  { value: "cash", label: "Cash Account" },
  { value: "investment", label: "Investment Account" },
];

const CASH_ACCOUNT_TYPE_ITEMS = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
];

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
      toast.success("Account created successfully");
      resetForm();
      onAccountCreated();
    },
    onError: (error) => {
      toast.error(error?.message ?? "Failed to create account");
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
      toast.error("Please fill in all required fields");
      return;
    }

    if (accountType === "cash" && !cashAccountType) {
      toast.error("Please select a cash account type");
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="create-account-dialog"
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Create New Account</DialogTitle>
          <DialogDescription>
            Create a new cash or investment account for a user.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="user-search">User *</Label>
            <UserSearchCombobox
              value={selectedUserId}
              onValueChange={setSelectedUserId}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="account-name">Account Name *</Label>
            <Input
              id="account-name"
              data-testid="account-name-input"
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g., John's Checking Account"
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="account-type">Account Type *</Label>
            <Select
              items={ACCOUNT_TYPE_ITEMS}
              value={accountType}
              onValueChange={(value) => {
                setAccountType(value ?? "");
                if (value === "investment") {
                  setCashAccountType("");
                }
              }}
            >
              <SelectTrigger
                id="account-type"
                data-testid="account-type-select"
                className="w-full"
              >
                <SelectValue placeholder="Select account type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash" data-testid="option-cash">
                  Cash Account
                </SelectItem>
                <SelectItem value="investment" data-testid="option-investment">
                  Investment Account
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {accountType === "cash" && (
            <div className="space-y-1">
              <Label htmlFor="cash-account-type">Cash Account Type *</Label>
              <Select
                items={CASH_ACCOUNT_TYPE_ITEMS}
                value={cashAccountType}
                onValueChange={(value) => setCashAccountType(value ?? "")}
              >
                <SelectTrigger
                  id="cash-account-type"
                  data-testid="cash-account-type-select"
                  className="w-full"
                >
                  <SelectValue placeholder="Select cash account type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking" data-testid="option-checking">
                    Checking
                  </SelectItem>
                  <SelectItem value="savings" data-testid="option-savings">
                    Savings
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              data-testid="create-account-cancel"
              onClick={() => handleOpenChange(false)}
              disabled={createAccountMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              data-testid="create-account-submit"
              disabled={createAccountMutation.isPending}
            >
              {createAccountMutation.isPending
                ? "Creating..."
                : "Create Account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
