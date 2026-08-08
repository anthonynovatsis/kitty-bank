"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Badge, statusTone } from "~/app/_components/Badge";
import { CreateAccountDialog } from "./CreateAccountDialog";
import { PendingTransactions } from "./PendingTransactions";

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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const handleAccountCreated = () => {
    void refetchAccounts();
    setShowCreateDialog(false);
  };

  if (accountsLoading || usersLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  const { cashAccounts = [], investmentAccounts = [] } = accountsData ?? {};

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Account Management</h1>
        <button
          data-testid="create-account-open"
          onClick={() => setShowCreateDialog(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          Create Account
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {["overview", "cash", "investment", "users", "transactions"].map(
              (tab) => (
                <button
                  key={tab}
                  data-testid={`tab-${tab}`}
                  onClick={() => setActiveTab(tab)}
                  className={`border-b-2 px-1 py-2 text-sm font-medium ${
                    activeTab === tab
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
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
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-2 text-sm font-medium text-gray-500">
                Total Cash Accounts
              </h3>
              <div className="text-2xl font-bold">{cashAccounts.length}</div>
              <p className="mt-1 text-sm text-gray-500">
                Total Balance:{" "}
                {formatCurrency(
                  cashAccounts.reduce((sum, acc) => sum + acc.balance, 0),
                )}
              </p>
            </div>
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-2 text-sm font-medium text-gray-500">
                Total Investment Accounts
              </h3>
              <div className="text-2xl font-bold">
                {investmentAccounts.length}
              </div>
              <p className="mt-1 text-sm text-gray-500">
                Total Value:{" "}
                {formatCurrency(
                  investmentAccounts.reduce(
                    (sum, acc) => sum + acc.totalValue,
                    0,
                  ),
                )}
              </p>
            </div>
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-2 text-sm font-medium text-gray-500">
                Total Net Worth
              </h3>
              <div className="text-2xl font-bold">
                {formatCurrency(
                  cashAccounts.reduce((sum, acc) => sum + acc.balance, 0) +
                    investmentAccounts.reduce(
                      (sum, acc) => sum + acc.totalValue,
                      0,
                    ),
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-lg bg-white p-6 shadow">
              <h3 className="mb-4 text-lg font-medium">Recent Cash Accounts</h3>
              <div className="space-y-2">
                {cashAccounts.slice(0, 5).map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between rounded border p-3"
                  >
                    <div>
                      <p className="font-medium">{account.accountName}</p>
                      <p className="text-sm text-gray-500">
                        {account.user.name} • {account.accountNumber}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {formatCurrency(account.balance)}
                      </p>
                      <Badge tone={statusTone(account.status)}>
                        {account.status}
                      </Badge>
                    </div>
                  </div>
                ))}
                {cashAccounts.length === 0 && (
                  <p className="text-gray-500">No cash accounts found</p>
                )}
              </div>
            </div>

            <div className="rounded-lg bg-white p-6 shadow">
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
                      <p className="text-sm text-gray-500">
                        {account.user.name} • {account.accountNumber}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {formatCurrency(account.totalValue)}
                      </p>
                      <Badge tone={statusTone(account.status)}>
                        {account.status}
                      </Badge>
                    </div>
                  </div>
                ))}
                {investmentAccounts.length === 0 && (
                  <p className="text-gray-500">No investment accounts found</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cash Accounts Tab */}
      {activeTab === "cash" && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="mb-4 text-lg font-medium">Cash Accounts</h3>
          {cashAccounts.length === 0 ? (
            <p className="text-gray-500">No cash accounts found</p>
          ) : (
            <div className="space-y-2">
              {cashAccounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded border p-4"
                >
                  <div>
                    <p className="font-medium">{account.accountName}</p>
                    <p className="text-sm text-gray-500">
                      {account.user.name} ({account.user.email})
                    </p>
                    <p className="text-sm text-gray-500">
                      Account: {account.accountNumber} • Type:{" "}
                      {account.accountType}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-medium">
                      {formatCurrency(account.balance)}
                    </p>
                    <Badge tone={statusTone(account.status)}>
                      {account.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Investment Accounts Tab */}
      {activeTab === "investment" && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="mb-4 text-lg font-medium">Investment Accounts</h3>
          {investmentAccounts.length === 0 ? (
            <p className="text-gray-500">No investment accounts found</p>
          ) : (
            <div className="space-y-2">
              {investmentAccounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded border p-4"
                >
                  <div>
                    <p className="font-medium">{account.accountName}</p>
                    <p className="text-sm text-gray-500">
                      {account.user.name} ({account.user.email})
                    </p>
                    <p className="text-sm text-gray-500">
                      Account: {account.accountNumber} • Holdings:{" "}
                      {account.holdings.length}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-medium">
                      {formatCurrency(account.totalValue)}
                    </p>
                    <Badge tone={statusTone(account.status)}>
                      {account.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Users Tab */}
      {activeTab === "users" && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="mb-4 text-lg font-medium">User Management</h3>
          {!usersData || usersData.length === 0 ? (
            <p className="text-gray-500">No users found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
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
                <tbody className="divide-y divide-gray-100">
                  {usersData.map((user) => (
                    <tr key={user.id} className="py-3">
                      <td className="py-3 pr-4">
                        <p className="font-medium">{user.name ?? "—"}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <span>{user.activeCashAccountCount} active</span>
                        {user.cashAccountCount >
                          user.activeCashAccountCount && (
                          <span className="ml-1 text-gray-400">
                            ({user.cashAccountCount} total)
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <span>{user.activeInvestmentAccountCount} active</span>
                        {user.investmentAccountCount >
                          user.activeInvestmentAccountCount && (
                          <span className="ml-1 text-gray-400">
                            ({user.investmentAccountCount} total)
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {formatCurrency(user.totalCashBalance)}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge
                          tone={user.isAdmin ? "accent" : "neutral"}
                          testId="role-badge"
                        >
                          {user.isAdmin ? "Admin" : "User"}
                        </Badge>
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
                                ? "bg-blue-600"
                                : "bg-gray-300"
                            } cursor-pointer`}
                          >
                            <span
                              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                user.requiresTransactionApproval
                                  ? "left-4"
                                  : "left-0.5"
                              }`}
                            />
                          </div>
                          <span
                            data-testid="approval-label"
                            className="text-xs text-gray-600"
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
