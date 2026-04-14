import { relations, sql } from "drizzle-orm";
import { index, sqliteTable } from "drizzle-orm/sqlite-core";

// Better Auth core tables
export const users = sqliteTable("users", (d) => ({
  id: d
    .text({ length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: d.text({ length: 255 }),
  email: d.text({ length: 255 }).notNull().unique(),
  emailVerified: d.integer({ mode: "boolean" }).default(false),
  image: d.text({ length: 255 }),
  createdAt: d
    .integer({ mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
  updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
}));

export const userRelations = relations(users, ({ one, many }) => ({
  account: many(accounts),
  session: many(sessions),
  cashAccounts: many(cashAccounts),
  investmentAccounts: many(investmentAccounts),
  settings: one(userSettings),
  createdCashTransactions: many(cashTransactions, {
    relationName: "createdBy",
  }),
  approvedCashTransactions: many(cashTransactions, {
    relationName: "approvedBy",
  }),
  createdInvestmentTransactions: many(investmentTransactions, {
    relationName: "createdBy",
  }),
  approvedInvestmentTransactions: many(investmentTransactions, {
    relationName: "approvedBy",
  }),
}));

export const accounts = sqliteTable(
  "accounts",
  (d) => ({
    id: d
      .text({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: d
      .text({ length: 255 })
      .notNull()
      .references(() => users.id),
    accountId: d.text({ length: 255 }).notNull(),
    providerId: d.text({ length: 255 }).notNull(),
    accessToken: d.text(),
    refreshToken: d.text(),
    accessTokenExpiresAt: d.integer({ mode: "timestamp" }),
    refreshTokenExpiresAt: d.integer({ mode: "timestamp" }),
    scope: d.text({ length: 255 }),
    idToken: d.text(),
    password: d.text(),
    createdAt: d
      .integer({ mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
  }),
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const accountRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessions = sqliteTable(
  "sessions",
  (d) => ({
    id: d
      .text({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: d
      .text({ length: 255 })
      .notNull()
      .references(() => users.id),
    token: d.text({ length: 255 }).notNull().unique(),
    expiresAt: d.integer({ mode: "timestamp" }).notNull(),
    ipAddress: d.text({ length: 255 }),
    userAgent: d.text({ length: 255 }),
    createdAt: d
      .integer({ mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
  }),
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const sessionRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const verifications = sqliteTable(
  "verifications",
  (d) => ({
    id: d
      .text({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    identifier: d.text({ length: 255 }).notNull(),
    value: d.text({ length: 255 }).notNull(),
    expiresAt: d.integer({ mode: "timestamp" }).notNull(),
    createdAt: d
      .integer({ mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
  }),
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

// Bank Account Management Tables

export const cashAccounts = sqliteTable(
  "cash_accounts",
  (d) => ({
    id: d
      .text({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: d
      .text({ length: 255 })
      .notNull()
      .references(() => users.id),
    accountNumber: d.text({ length: 255 }).notNull().unique(),
    accountName: d.text({ length: 255 }).notNull(),
    accountType: d
      .text({ length: 50 })
      .notNull()
      .$type<"checking" | "savings">(),
    balance: d.real().notNull().default(0),
    status: d
      .text({ length: 50 })
      .notNull()
      .default("active")
      .$type<"active" | "closed">(),
    createdAt: d
      .integer({ mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("cash_accounts_user_id_idx").on(t.userId),
    index("cash_accounts_account_number_idx").on(t.accountNumber),
  ],
);

export const investmentAccounts = sqliteTable(
  "investment_accounts",
  (d) => ({
    id: d
      .text({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: d
      .text({ length: 255 })
      .notNull()
      .references(() => users.id),
    accountNumber: d.text({ length: 255 }).notNull().unique(),
    accountName: d.text({ length: 255 }).notNull(),
    status: d
      .text({ length: 50 })
      .notNull()
      .default("active")
      .$type<"active" | "closed">(),
    createdAt: d
      .integer({ mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("investment_accounts_user_id_idx").on(t.userId),
    index("investment_accounts_account_number_idx").on(t.accountNumber),
  ],
);

export const holdings = sqliteTable(
  "holdings",
  (d) => ({
    id: d
      .text({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    investmentAccountId: d
      .text({ length: 255 })
      .notNull()
      .references(() => investmentAccounts.id),
    symbol: d.text({ length: 20 }).notNull(),
    companyName: d.text({ length: 255 }),
    quantity: d.real().notNull(),
    averageCostBasis: d.real().notNull(),
    dividendReinvestment: d
      .integer({ mode: "boolean" })
      .notNull()
      .default(false),
    dividendCashBalance: d.real().notNull().default(0),
    lastTransactionDate: d.integer({ mode: "timestamp" }),
    createdAt: d
      .integer({ mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("holdings_investment_account_id_idx").on(t.investmentAccountId),
    index("holdings_symbol_idx").on(t.symbol),
  ],
);

export const investmentTransactions = sqliteTable(
  "investment_transactions",
  (d) => ({
    id: d
      .text({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    investmentAccountId: d
      .text({ length: 255 })
      .notNull()
      .references(() => investmentAccounts.id),
    transactionType: d
      .text({ length: 50 })
      .notNull()
      .$type<"buy" | "sell" | "dividend_reinvest" | "split">(),
    symbol: d.text({ length: 20 }).notNull(),
    quantity: d.real(),
    price: d.real(),
    amount: d.real().notNull(),
    brokerage: d.real().notNull().default(0),
    description: d.text(),
    transactionDate: d.integer({ mode: "timestamp" }).notNull(),
    status: d
      .text({ length: 50 })
      .notNull()
      .default("pending")
      .$type<"pending" | "approved" | "rejected" | "executed">(),
    createdByUserId: d
      .text({ length: 255 })
      .notNull()
      .references(() => users.id),
    approvedByAdminId: d.text({ length: 255 }).references(() => users.id),
    createdAt: d
      .integer({ mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    approvedAt: d.integer({ mode: "timestamp" }),
  }),
  (t) => [
    index("investment_transactions_account_id_idx").on(t.investmentAccountId),
    index("investment_transactions_symbol_idx").on(t.symbol),
    index("investment_transactions_status_idx").on(t.status),
    index("investment_transactions_created_by_idx").on(t.createdByUserId),
  ],
);

export const cashTransactions = sqliteTable(
  "cash_transactions",
  (d) => ({
    id: d
      .text({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    cashAccountId: d
      .text({ length: 255 })
      .notNull()
      .references(() => cashAccounts.id),
    transactionType: d
      .text({ length: 50 })
      .notNull()
      .$type<"deposit" | "withdrawal" | "transfer" | "interest" | "fee">(),
    amount: d.real().notNull(),
    description: d.text(),
    fromAccountId: d.text({ length: 255 }).references(() => cashAccounts.id),
    toAccountId: d.text({ length: 255 }).references(() => cashAccounts.id),
    status: d
      .text({ length: 50 })
      .notNull()
      .default("pending")
      .$type<"pending" | "approved" | "rejected" | "completed">(),
    createdByUserId: d
      .text({ length: 255 })
      .notNull()
      .references(() => users.id),
    approvedByAdminId: d.text({ length: 255 }).references(() => users.id),
    createdAt: d
      .integer({ mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    approvedAt: d.integer({ mode: "timestamp" }),
  }),
  (t) => [
    index("cash_transactions_account_id_idx").on(t.cashAccountId),
    index("cash_transactions_status_idx").on(t.status),
    index("cash_transactions_created_by_idx").on(t.createdByUserId),
  ],
);

export const userSettings = sqliteTable(
  "user_settings",
  (d) => ({
    id: d
      .text({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: d
      .text({ length: 255 })
      .notNull()
      .unique()
      .references(() => users.id),
    requiresTransactionApproval: d
      .integer({ mode: "boolean" })
      .notNull()
      .default(true),
    isAdmin: d.integer({ mode: "boolean" }).notNull().default(false),
    createdAt: d
      .integer({ mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
  }),
  (t) => [index("user_settings_user_id_idx").on(t.userId)],
);

// Relations

export const cashAccountRelations = relations(
  cashAccounts,
  ({ one, many }) => ({
    user: one(users, { fields: [cashAccounts.userId], references: [users.id] }),
    transactions: many(cashTransactions),
  }),
);

export const investmentAccountRelations = relations(
  investmentAccounts,
  ({ one, many }) => ({
    user: one(users, {
      fields: [investmentAccounts.userId],
      references: [users.id],
    }),
    holdings: many(holdings),
    transactions: many(investmentTransactions),
  }),
);

export const holdingRelations = relations(holdings, ({ one, many }) => ({
  investmentAccount: one(investmentAccounts, {
    fields: [holdings.investmentAccountId],
    references: [investmentAccounts.id],
  }),
  transactions: many(investmentTransactions),
}));

export const investmentTransactionRelations = relations(
  investmentTransactions,
  ({ one }) => ({
    investmentAccount: one(investmentAccounts, {
      fields: [investmentTransactions.investmentAccountId],
      references: [investmentAccounts.id],
    }),
    createdBy: one(users, {
      fields: [investmentTransactions.createdByUserId],
      references: [users.id],
      relationName: "createdBy",
    }),
    approvedBy: one(users, {
      fields: [investmentTransactions.approvedByAdminId],
      references: [users.id],
      relationName: "approvedBy",
    }),
  }),
);

export const cashTransactionRelations = relations(
  cashTransactions,
  ({ one }) => ({
    cashAccount: one(cashAccounts, {
      fields: [cashTransactions.cashAccountId],
      references: [cashAccounts.id],
    }),
    fromAccount: one(cashAccounts, {
      fields: [cashTransactions.fromAccountId],
      references: [cashAccounts.id],
    }),
    toAccount: one(cashAccounts, {
      fields: [cashTransactions.toAccountId],
      references: [cashAccounts.id],
    }),
    createdBy: one(users, {
      fields: [cashTransactions.createdByUserId],
      references: [users.id],
      relationName: "createdBy",
    }),
    approvedBy: one(users, {
      fields: [cashTransactions.approvedByAdminId],
      references: [users.id],
      relationName: "approvedBy",
    }),
  }),
);

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, { fields: [userSettings.userId], references: [users.id] }),
}));
