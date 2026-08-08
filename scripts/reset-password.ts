import { hashPassword } from "better-auth/crypto";
import { db } from "../src/server/db/index.js";
import { users, accounts } from "../src/server/db/schema.js";
import { eq, and } from "drizzle-orm";

async function resetPassword() {
  const args = process.argv.slice(2);

  const email = args[0];
  const newPassword = args[1];

  if (!email || !newPassword) {
    console.log(`
🔑  Kitty Bank Password Reset

Usage:
  pnpm reset-password <email> <new-password>

Examples:
  pnpm reset-password john@example.com newpassword123
  pnpm reset-password admin@kittybank.com supersecret99

Note: Passwords must be at least 8 characters.
`);
    return;
  }

  if (newPassword.length < 8) {
    console.log("❌ Password must be at least 8 characters");
    return;
  }

  // Find the user
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    console.log(`❌ No user found with email '${email}'`);
    return;
  }

  console.log(`🔧 Resetting password for: ${user.name} (${user.email})`);

  // Better Auth stores credentials in the accounts table with providerId = "credential"
  const credentialAccount = await db.query.accounts.findFirst({
    where: and(
      eq(accounts.userId, user.id),
      eq(accounts.providerId, "credential"),
    ),
  });

  if (!credentialAccount) {
    console.log("❌ User does not have a password-based account");
    return;
  }

  const hashed = await hashPassword(newPassword);

  await db
    .update(accounts)
    .set({ password: hashed })
    .where(
      and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")),
    );

  console.log(`✅ Password reset successfully!

User Details:
  Name:  ${user.name}
  Email: ${user.email}
  ID:    ${user.id}
`);
}

resetPassword().catch(console.error);
