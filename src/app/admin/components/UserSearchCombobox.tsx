"use client";

import { useState } from "react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";

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
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            role="combobox"
            data-testid="user-search-trigger"
            className="w-full justify-between font-normal"
          />
        }
      >
        {value && selectedLabel ? (
          <span className="truncate">{selectedLabel}</span>
        ) : (
          <span className="text-muted-foreground">Search for a user...</span>
        )}
        <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      {/* --anchor-width is Base UI's trigger-width variable, set on the positioner. */}
      <PopoverContent className="w-(--anchor-width) p-0" align="start">
        {/*
         * Results come from admin.users.search, so cmdk must not also filter
         * them — its default substring match runs against the rendered label
         * and would hide rows the server deliberately returned.
         */}
        <Command shouldFilter={false}>
          <CommandInput
            data-testid="user-search-input"
            placeholder="Type to search users..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            {isLoading && (
              <div className="text-muted-foreground px-3 py-2 text-sm">
                Searching...
              </div>
            )}

            {!searchQuery && (
              <div className="text-muted-foreground px-3 py-2 text-sm">
                Start typing to search users...
              </div>
            )}

            {!isLoading && searchQuery && searchResults.length === 0 && (
              <CommandEmpty>No users found.</CommandEmpty>
            )}

            {searchResults.length > 0 && (
              <CommandGroup>
                {searchResults.map((user) => (
                  <CommandItem
                    key={user.id}
                    value={user.id}
                    data-testid="user-search-option"
                    onSelect={() => handleUserSelect(user)}
                  >
                    <CheckIcon
                      className={cn(
                        "mr-2 size-4",
                        value === user.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="font-medium">{user.name}</span>
                      <span className="text-muted-foreground text-sm">
                        {user.email}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
