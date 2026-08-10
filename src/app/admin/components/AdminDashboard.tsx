"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { StatusBadge, statusTone } from "~/components/StatusBadge";
import { Button } from "~/components/ui/button";
import { CreateAccountDialog } from "./CreateAccountDialog";
import { PendingTransactions } from "./PendingTransactions";
import { EmptyState } from "~/components/ThemeIllustration";
import { CardGridSkeleton } from "~/components/Skeletons";
import { cents, formatCents, sumCents } from "~/lib/money";

export function AdminDashboard() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const {
    data: accountsData,
    isLoading: accountsLoading,
    refetch: refetchAccounts,
  } = api.admin.accounts.list.useQuery({});

  const {
    data: usersData,
    isLoading: usersLoading,
    refetch: refetchUsers,
  } = api.admin.users.list.useQuery();

  const updateApprovalSettings =
    api.admin.users.updateApprovalSettings.useMutation({
      onSuccess: () => void refetchUsers(),
    });

  const handleAccountCreated = () => {
    void refetchAccounts();
    setShowCreateDialog(false);
  };

  if (accountsLoading || usersLoading) {
    return <CardGridSkeleton />;
  }

  const { cashAccounts = [], investmentAccounts = [] } = accountsData ?? {};

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Account Management</h1>
        <Button
          data-testid="create-account-open"
          onClick={() => setShowCreateDialog(true)}
        >
          Create Account
        </Button>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="border-border border-b">
          <nav className="-mb-px flex space-x-8">
            {["overview", "cash", "investment", "users", "transactions"].map(
              (tab) => (
                <button
                  key={tab}
                  data-testid={`tab-${tab}`}
                  onClick={() => setActiveTab(tab)}
                  className={`border-b-2 px-1 py-2 text-sm font-medium ${
                    activeTab === tab
                      ? "border-primary text-primary"
                      : "text-muted-foreground hover:border-border hover:text-foreground border-transparent"
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}{" "}
                  {tab === "cash" && "Accounts"}{" "}
                  {tab === "investment" && "Accounts"}
                </button>
              ),
            )}
          </nav>
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="bg-card rounded-lg p-6 shadow">
              <h3 className="text-muted-foreground mb-2 text-sm font-medium">
                Total Cash Accounts
              </h3>
              <div className="text-2xl font-bold">{cashAccounts.length}</div>
              <p className="text-muted-foreground mt-1 text-sm">
                Total Balance:{" "}
                {formatCents(sumCents(cashAccounts, (acc) => acc.balance))}
              </p>
            </div>
            <div className="bg-card rounded-lg p-6 shadow">
              <h3 className="text-muted-foreground mb-2 text-sm font-medium">
                Total Investment Accounts
              </h3>
              <div className="text-2xl font-bold">
                {investmentAccounts.length}
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                Total Cost Basis:{" "}
                {formatCents(
                  sumCents(investmentAccounts, (acc) => acc.totalCost),
                )}
              </p>
            </div>
            <div className="bg-card rounded-lg p-6 shadow">
              <h3 className="text-muted-foreground mb-2 text-sm font-medium">
                Total Net Worth
              </h3>
              <div className="text-2xl font-bold">
                {formatCents(
                  cents(
                    sumCents(cashAccounts, (acc) => acc.balance) +
                      sumCents(investmentAccounts, (acc) => acc.totalCost),
                  ),
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="bg-card rounded-lg p-6 shadow">
              <h3 className="mb-4 text-lg font-medium">Recent Cash Accounts</h3>
              <div className="space-y-2">
                {cashAccounts.slice(0, 5).map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between rounded border p-3"
                  >
                    <div>
                      <p className="font-medium">{account.accountName}</p>
                      <p className="text-muted-foreground text-sm">
                        {account.user.name} • {account.accountNumber}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {formatCents(account.balance)}
                      </p>
                      <StatusBadge tone={statusTone(account.status)}>
                        {account.status}
                      </StatusBadge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-lg p-6 shadow">
              <h3 className="mb-4 text-lg font-medium">
                Recent Investment Accounts
              </h3>
              <div className="space-y-2">
                {investmentAccounts.slice(0, 5).map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between rounded border p-3"
                  >
                    <div>
                      <p className="font-medium">{account.accountName}</p>
                      <p className="text-muted-foreground text-sm">
                        {account.user.name} • {account.accountNumber}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {formatCents(account.totalCost)}
                      </p>
                      <StatusBadge tone={statusTone(account.status)}>
                        {account.status}
                      </StatusBadge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cash Accounts Tab */}
      {activeTab === "cash" && (
        <div className="bg-card rounded-lg p-6 shadow">
          <h3 className="mb-4 text-lg font-medium">Cash Accounts</h3>
          {cashAccounts.length === 0 ? (
            <EmptyState illustration="empty-accounts">
              No cash accounts found
            </EmptyState>
          ) : (
            <div className="space-y-2">
              {cashAccounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded border p-4"
                >
                  <div>
                    <p className="font-medium">{account.accountName}</p>
                    <p className="text-muted-foreground text-sm">
                      {account.user.name} ({account.user.email})
                    </p>
                    <p className="text-muted-foreground text-sm">
                      Account: {account.accountNumber} • Type:{" "}
                      {account.accountType}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-medium">
                      {formatCents(account.balance)}
                    </p>
                    <StatusBadge tone={statusTone(account.status)}>
                      {account.status}
                    </StatusBadge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Investment Accounts Tab */}
      {activeTab === "investment" && (
        <div className="bg-card rounded-lg p-6 shadow">
          <h3 className="mb-4 text-lg font-medium">Investment Accounts</h3>
          {investmentAccounts.length === 0 ? (
            <EmptyState illustration="empty-holdings">
              No investment accounts found
            </EmptyState>
          ) : (
            <div className="space-y-2">
              {investmentAccounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded border p-4"
                >
                  <div>
                    <p className="font-medium">{account.accountName}</p>
                    <p className="text-muted-foreground text-sm">
                      {account.user.name} ({account.user.email})
                    </p>
                    <p className="text-muted-foreground text-sm">
                      Account: {account.accountNumber} • Holdings:{" "}
                      {account.holdings.length}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-medium">
                      {formatCents(account.totalCost)}
                    </p>
                    <StatusBadge tone={statusTone(account.status)}>
                      {account.status}
                    </StatusBadge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Users Tab */}
      {activeTab === "users" && (
        <div className="bg-card rounded-lg p-6 shadow">
          <h3 className="mb-4 text-lg font-medium">User Management</h3>
          {!usersData || usersData.length === 0 ? (
            <p className="text-muted-foreground">No users found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="pr-4 pb-3 font-medium">User</th>
                    <th className="pr-4 pb-3 font-medium">Cash Accounts</th>
                    <th className="pr-4 pb-3 font-medium">
                      Investment Accounts
                    </th>
                    <th className="pr-4 pb-3 font-medium">
                      Total Cash Balance
                    </th>
                    <th className="pr-4 pb-3 font-medium">Role</th>
                    <th className="pb-3 font-medium">Requires Approval</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {usersData.map((user) => (
                    <tr key={user.id} className="py-3">
                      <td className="py-3 pr-4">
                        <p className="font-medium">{user.name ?? "—"}</p>
                        <p className="text-muted-foreground text-xs">
                          {user.email}
                        </p>
                      </td>
                      <td className="py-3 pr-4">
                        <span>{user.activeCashAccountCount} active</span>
                        {user.cashAccountCount >
                          user.activeCashAccountCount && (
                          <span className="text-muted-foreground ml-1">
                            ({user.cashAccountCount} total)
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <span>{user.activeInvestmentAccountCount} active</span>
                        {user.investmentAccountCount >
                          user.activeInvestmentAccountCount && (
                          <span className="text-muted-foreground ml-1">
                            ({user.investmentAccountCount} total)
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {formatCents(user.totalCashBalance)}
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge
                          tone={user.isAdmin ? "accent" : "neutral"}
                          testId="role-badge"
                        >
                          {user.isAdmin ? "Admin" : "User"}
                        </StatusBadge>
                      </td>
                      <td className="py-3">
                        <label className="flex cursor-pointer items-center gap-2">
                          <div
                            data-testid="approval-toggle"
                            onClick={() => {
                              if (
                                updateApprovalSettings.isPending &&
                                updateApprovalSettings.variables?.userId ===
                                  user.id
                              )
                                return;
                              updateApprovalSettings.mutate({
                                userId: user.id,
                                requiresTransactionApproval:
                                  !user.requiresTransactionApproval,
                              });
                            }}
                            className={`relative h-5 w-9 rounded-full transition-colors ${
                              user.requiresTransactionApproval
                                ? "bg-primary"
                                : "bg-input"
                            } cursor-pointer`}
                          >
                            <span
                              className={`bg-background absolute top-0.5 h-4 w-4 rounded-full shadow transition-transform ${
                                user.requiresTransactionApproval
                                  ? "left-4"
                                  : "left-0.5"
                              }`}
                            />
                          </div>
                          <span
                            data-testid="approval-label"
                            className="text-muted-foreground text-xs"
                          >
                            {user.requiresTransactionApproval ? "Yes" : "No"}
                          </span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Transactions Tab */}
      {activeTab === "transactions" && <PendingTransactions />}

      <CreateAccountDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onAccountCreated={handleAccountCreated}
      />
    </div>
  );
}
