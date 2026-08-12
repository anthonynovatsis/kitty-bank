"use client";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";

/**
 * Whether the next dividend on this position is expected to be reinvested.
 *
 * A setting, not a record of anything: it says how future dividends should
 * arrive and changes nothing already entered. Recording a dividend still asks
 * how *that* one was paid, because a statement can always disagree with the
 * standing arrangement.
 */
export function DripToggle({
  accountId,
  symbol,
  enabled,
}: {
  accountId: string;
  symbol: string;
  enabled: boolean;
}) {
  const utils = api.useUtils();

  const update = api.user.investments.updateDRIP.useMutation({
    onSuccess: () => {
      void utils.user.accounts.getDetails.invalidate({ accountId });
      void utils.user.investments.getHoldings.invalidate({ accountId });
    },
  });

  return (
    <Button
      size="sm"
      variant={enabled ? "default" : "secondary"}
      data-testid="drip-toggle"
      aria-pressed={enabled}
      disabled={update.isPending}
      onClick={() => update.mutate({ accountId, symbol, enabled: !enabled })}
    >
      {enabled ? "On" : "Off"}
    </Button>
  );
}
