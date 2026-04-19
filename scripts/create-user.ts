import { auth } from "../src/server/better-auth/config.js";
import { db } from "../src/server/db/index.js";
import { userSettings } from "../src/server/db/schema.js";

async function createUser() {
  const args = process.argv.slice(2);

  const name = args[0];
  const email = args[1];
  const password = args[2];

  if (!name || !email || !password) {
    console.log(`
🛠️  Kitty Bank User Creator

Usage:
  pnpm create-user <name> <email> <password>

Examples:
  pnpm create-user "John Doe" john@example.com password123
  pnpm create-user "Admin User" admin@kittybank.com password123

After creating the user, use the modify-user script to configure them:
  pnpm modify-user set-admin <user-id>
`);
    return;
  }

  console.log(`Creating user: ${name} (${email})`);

  const result = await auth.api.signUpEmail({
    body: { name, email, password },
  });

  const newUser = result.user;

  console.log("✅ Created user");

  await db.insert(userSettings).values({
    userId: newUser.id,
    requiresTransactionApproval: true,
    isAdmin: false,
  });

  console.log("✅ Created default user settings");
  console.log(`🎉 User created successfully!

User Details:
  Name: ${newUser.name}
  Email: ${newUser.email}
  ID: ${newUser.id}

Next Steps:
  To make admin: pnpm modify-user set-admin ${newUser.id}
`);
}

createUser().catch(console.error);
