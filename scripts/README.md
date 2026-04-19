# Kitty Bank Scripts

Utility scripts for Kitty Bank development and administration.

## User Management Scripts

### `modify-user.ts`
Simple tool for managing user admin privileges.

```bash
# Show help
pnpm modify-user

# Manage admin privileges
pnpm modify-user set-admin <user-id>
pnpm modify-user clear-admin <user-id>
```

**Available Commands:**
- `set-admin <user-id>` - Grant admin privileges
- `clear-admin <user-id>` - Remove admin privileges

**Examples:**
```bash
# Make someone admin
pnpm modify-user set-admin cm123abc456def789

# Remove admin privileges
pnpm modify-user clear-admin cm123abc456def789
```

### `create-user.ts`
Creates a new user with default settings (regular user, requires approval).

```bash
pnpm create-user <name> <email>
```

**Usage:**
- Creates user with specified name and email
- Sets up default user settings (non-admin, requires approval)
- Checks for existing users to prevent duplicates

**Examples:**
```bash
# Create admin user
pnpm create-user "Admin User" admin@kittybank.com

# Create family member
pnpm create-user "John Doe" john@example.com
```

**After creating users:**
```bash
# Make admin
pnpm modify-user set-admin <user-id>
```
- You'll still need to handle authentication (depends on your Better Auth setup)

## After becoming admin

Once you have admin permissions, you can access:
- **Admin Dashboard**: http://localhost:3001/admin
- **Account Management**: Create and manage user accounts
- **User Management**: (Coming in next phase)

## Requirements

- Node.js
- Database must be migrated (`pnpm db:push` or `pnpm db:migrate`)
- Development server running (`pnpm dev`)