import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { count } from "drizzle-orm";
import { db } from "~/server/db";
import { users, userSettings } from "~/server/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite", // or "pg" or "mysql"
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
  },
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const [result] = await db.select({ count: count() }).from(users);
          const isFirstUser = (result?.count ?? 0) === 1;
          await db.insert(userSettings).values({
            userId: user.id,
            isAdmin: isFirstUser,
            requiresTransactionApproval: !isFirstUser,
          });
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
