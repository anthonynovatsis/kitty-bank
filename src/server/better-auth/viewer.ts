import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";

import { db } from "~/server/db";
import { userSettings } from "~/server/db/schema";
import { getSession } from "./server";

export type Viewer = {
  id: string;
  name: string | null;
  email: string;
  isAdmin: boolean;
};

/**
 * The signed-in user plus the one setting the shell needs.
 *
 * Wrapped in React's `cache` because a layout and the page inside it both want
 * this on the same request, and without it that is two identical lookups on
 * every navigation.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await getSession();
  if (!session) return null;

  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, session.user.id),
  });

  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email,
    isAdmin: settings?.isAdmin ?? false,
  };
});
