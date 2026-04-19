import { db } from "../src/server/db/index.js";
import { users, userSettings } from "../src/server/db/schema.js";
import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

type User = InferSelectModel<typeof users>;
type UserSettings = InferSelectModel<typeof userSettings>;

async function updateUserSettings() {
  const args = process.argv.slice(2);

  // Parse command line arguments
  const command = args[0];
  const targetUserId = args[1];

  if (!command) {
    showHelp();
    return;
  }

  if (!targetUserId) {
    console.log("❌ User ID is required for this command");
    showHelp();
    return;
  }

  // Find the target user
  const user = await db.query.users.findFirst({
    where: eq(users.id, targetUserId),
  });

  if (!user) {
    console.log(`❌ User with ID '${targetUserId}' not found`);
    return;
  }

  console.log(`🔧 Updating settings for: ${user.name} (${user.email})`);

  // Get or create user settings
  let settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, user.id),
  });

  if (!settings) {
    // Create default settings (ID will be auto-generated via schema)
    const [newSettings] = await db
      .insert(userSettings)
      .values({
        userId: user.id,
        requiresTransactionApproval: true,
        isAdmin: false,
      })
      .returning();
    if (!newSettings) throw new Error("Failed to create user settings");
    settings = newSettings;
    console.log("✅ Created default user settings");
  }

  // Execute the command
  switch (command) {
    case "set-admin":
      await setAdmin(user, settings, true);
      break;
    case "clear-admin":
      await setAdmin(user, settings, false);
      break;
    default:
      console.log(`❌ Unknown command: ${command}`);
      showHelp();
  }
}

async function setAdmin(user: User, settings: UserSettings, isAdmin: boolean) {
  if (settings.isAdmin === isAdmin) {
    const status = isAdmin ? "already an admin" : "not an admin";
    console.log(`ℹ️  User is ${status}`);
    return;
  }

  await db
    .update(userSettings)
    .set({ isAdmin })
    .where(eq(userSettings.userId, user.id));

  if (isAdmin) {
    console.log("✅ User is now an admin! They can access /admin");
  } else {
    console.log("✅ Admin privileges removed");
  }
}

function showHelp() {
  console.log(`
🛠️  Kitty Bank User Modifier

Usage:
  pnpm modify-user <command> <user-id>

Commands:
  set-admin <user-id>   Grant admin privileges
  clear-admin <user-id> Remove admin privileges

Examples:
  pnpm modify-user set-admin cm123abc456def789
  pnpm modify-user clear-admin cm123abc456def789

💡 Use 'pnpm create-user' to create new users first.
`);
}

updateUserSettings().catch(console.error);
