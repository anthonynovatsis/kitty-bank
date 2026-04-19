"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { CreateAccountDialog } from "./CreateAccountDialog";

export function AdminDashboard() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const {
    data: accountsData,
    isLoading: accountsLoading,
    refetch: refetchAccounts,
  } = api.admin.accounts.list.useQuery({});

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

  if (accountsLoading) {
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
            {["overview", "cash", "investment"].map((tab) => (
              <button
                key={tab}
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
            ))}
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
                      <span
                        className={`inline-block rounded-full px-2 py-1 text-xs ${
                          account.status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {account.status}
                      </span>
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
                      <span
                        className={`inline-block rounded-full px-2 py-1 text-xs ${
                          account.status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {account.status}
                      </span>
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
                    <span
                      className={`inline-block rounded-full px-2 py-1 text-xs ${
                        account.status === "active"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {account.status}
                    </span>
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
                    <span
                      className={`inline-block rounded-full px-2 py-1 text-xs ${
                        account.status === "active"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {account.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <CreateAccountDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onAccountCreated={handleAccountCreated}
      />
    </div>
  );
}
