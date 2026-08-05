import { createCaller } from "~/server/api/root";
import { users, userSettings } from "~/server/db/schema";
import type { TestDb } from "./db";

// Minimal user shape — matches what procedures access from the session.
export type FakeUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image: null;
  createdAt: Date;
  updatedAt: Date;
};

type FakeSession = {
  session: {
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
    ipAddress: null;
    userAgent: null;
    createdAt: Date;
    updatedAt: Date;
  };
  user: FakeUser;
};

export function makeUser(overrides?: {
  email?: string;
  name?: string;
}): FakeUser {
  const id = crypto.randomUUID();
  return {
    id,
    email: overrides?.email ?? `user-${id}@example.com`,
    name: overrides?.name ?? "Test User",
    emailVerified: false,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function makeSession(user: FakeUser): FakeSession {
  return {
    session: {
      id: crypto.randomUUID(),
      userId: user.id,
      token: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 86_400_000),
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    user,
  };
}

/**
 * Insert a regular user row into the test DB.
 *
 * Pass `requiresTransactionApproval` to also create a user_settings row. Left
 * off, the user has no settings row at all and procedures fall back to their
 * default — which is to require approval.
 */
export async function insertUser(
  db: TestDb,
  overrides?: {
    email?: string;
    name?: string;
    requiresTransactionApproval?: boolean;
  },
) {
  const user = makeUser(overrides);
  await db.insert(users).values({
    id: user.id,
    email: user.email,
    name: user.name,
  });

  if (overrides?.requiresTransactionApproval !== undefined) {
    await db.insert(userSettings).values({
      userId: user.id,
      isAdmin: false,
      requiresTransactionApproval: overrides.requiresTransactionApproval,
    });
  }

  return user;
}

/** Insert a user with admin privileges (user row + user_settings.is_admin = true). */
export async function insertAdminUser(
  db: TestDb,
  overrides?: { email?: string; name?: string },
) {
  const user = await insertUser(db, overrides);
  await db.insert(userSettings).values({
    userId: user.id,
    isAdmin: true,
    requiresTransactionApproval: false,
  });
  return user;
}

/**
 * Create a tRPC caller pre-loaded with the given DB and session.
 *
 * The `as any` cast is intentional: we control the full context shape in tests,
 * and the procedures are typed at the input/output level — not the context level
 * from the caller's perspective.
 */
export function createTestCaller(
  db: TestDb,
  session: FakeSession | null = null,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  return createCaller({ db, session, headers: new Headers() } as any);
}
