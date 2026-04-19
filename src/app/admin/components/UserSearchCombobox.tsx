"use client";

import { useState } from "react";
import { api, type RouterOutputs } from "~/trpc/react";

type SearchUser = RouterOutputs["admin"]["users"]["search"][number];

interface UserSearchComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
}

export function UserSearchCombobox({
  value,
  onValueChange,
}: UserSearchComboboxProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");

  const { data, isLoading } = api.admin.users.search.useQuery(
    { query: searchQuery },
    { enabled: isOpen && searchQuery.length >= 1 },
  );
  const searchResults: SearchUser[] = data ?? [];

  const handleUserSelect = (user: SearchUser) => {
    setSelectedLabel(`${user.name ?? ""} (${user.email})`);
    onValueChange(user.id);
    setIsOpen(false);
    setSearchQuery("");
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-left focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
      >
        {value && selectedLabel ? (
          <span className="truncate">{selectedLabel}</span>
        ) : (
          <span className="text-gray-500">Search for a user...</span>
        )}
        <svg
          className="h-5 w-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0" onClick={() => setIsOpen(false)} />
          <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-300 bg-white shadow-lg">
          <div className="p-2">
            <input
              type="text"
              placeholder="Type to search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
              autoFocus
            />
          </div>

          <div className="max-h-48 overflow-y-auto">
            {isLoading && (
              <div className="px-3 py-2 text-gray-500">Searching...</div>
            )}

            {!isLoading && searchResults.length === 0 && searchQuery && (
              <div className="px-3 py-2 text-gray-500">No users found.</div>
            )}

            {!searchQuery && (
              <div className="px-3 py-2 text-gray-500">
                Start typing to search users...
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="py-1">
                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleUserSelect(user)}
                    className={`flex w-full items-center px-3 py-2 text-left hover:bg-gray-100 ${
                      value === user.id ? "bg-blue-50 text-blue-600" : ""
                    }`}
                  >
                    {value === user.id && (
                      <svg
                        className="mr-2 h-4 w-4"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                    <div className="flex flex-col">
                      <span className="font-medium">{user.name}</span>
                      <span className="text-sm text-gray-500">
                        {user.email}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        </>
      )}
    </div>
  );
}
