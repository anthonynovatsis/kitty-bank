import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  sqliteTable,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { cents, type Cents } from "~/lib/money";

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
    balance: d.integer().$type<Cents>().notNull().default(cents(0)),
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
    /*
     * A share count, not money — so not scaled to minor units the way every
     * monetary column is. Whole shares only: a corporate action that would
     * leave a fraction settles the remainder to cash instead, which is the
     * same pattern DRIP already uses for its dividend remainder.
     *
     * The CHECK is doing real work. SQLite's INTEGER is a declaration, not a
     * constraint — it stores 7.5 quite happily — so the constraint is what
     * actually stops a fraction. Affinity converts a lossless 7.0 to 7 first,
     * so only genuine fractions are rejected.
     */
    quantity: d.integer().notNull(),
    /*
     * The *total* cost of the position, not the per-share average — a pool, in
     * the sense UK Section 104 and Canadian ACB use the word. A buy adds
     * `quantity * price + brokerage` to it; a sell removes a proportion of it.
     *
     * Storing the average instead would round on every buy and compound from
     * the rounded base: 3 shares at $100 plus 1 at $101 plus $9.99 brokerage is
     * 10,274.75c per share, and a Cents column can only keep 10,275. Held as a
     * total, 41,099 stays 41,099 however many buys follow, and the division
     * happens once — in `averageCents`, on the way to a screen.
     *
     * It also keeps this cache honest. Holdings are meant to be rebuildable
     * from `investment_transactions`; with a stored average the incremental and
     * replayed values round differently and a reconciliation would report drift
     * that isn't there.
     */
    totalCostBasis: d.integer().$type<Cents>().notNull(),
    dividendReinvestment: d
      .integer({ mode: "boolean" })
      .notNull()
      .default(false),
    dividendCashBalance: d.integer().$type<Cents>().notNull().default(cents(0)),
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
    /*
     * One row per symbol per account — a position is identified by the pair,
     * and a second row for the same symbol would split the pool in two so that
     * neither reads as the real holding.
     *
     * It also makes a buy a single atomic upsert rather than a read followed by
     * an insert-or-update, which two concurrent buys of the same symbol could
     * otherwise interleave into two rows.
     */
    uniqueIndex("holdings_account_symbol_unique").on(
      t.investmentAccountId,
      t.symbol,
    ),
    check("holdings_quantity_whole", sql`typeof(${t.quantity}) = 'integer'`),
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
      .$type<"buy" | "sell" | "dividend" | "dividend_reinvest" | "split">(),
    symbol: d.text({ length: 20 }).notNull(),
    /*
     * Carried on the transaction as well as the holding, because a buy can sit
     * pending for days before it opens a position — and the name the user typed
     * has to survive that wait to reach the holding it creates.
     */
    companyName: d.text({ length: 255 }),
    /*
     * What was asked for, not what it did. On a buy or sell this is the shares
     * traded; on a split it is the resulting share count the holder read off
     * their statement, and null means "work it out from the ratio".
     *
     * A split has to be stored as the action rather than its effect because it
     * can sit pending: the ratio applies to whatever is held when it settles,
     * which is not necessarily what was held when it was submitted.
     */
    quantity: d.integer(),
    /** A 2-for-1 split; a 1-for-5 consolidation. Null on anything but a split. */
    splitNumerator: d.integer(),
    splitDenominator: d.integer(),
    /*
     * What a DRIP statement says the plan was holding either side of this
     * dividend. Recorded rather than computed: the registry has already done
     * the arithmetic, and deriving it here would produce a second number free
     * to disagree with the paper.
     *
     * Keeping both ends is what makes the next statement checkable — if its
     * opening balance does not match the last closing one, a dividend was
     * missed. Null on anything but a dividend.
     */
    residualBroughtForward: d.integer().$type<Cents>(),
    residualCarriedForward: d.integer().$type<Cents>(),
    price: d.integer().$type<Cents>(),
    amount: d.integer().$type<Cents>().notNull(),
    brokerage: d.integer().$type<Cents>().notNull().default(cents(0)),
    description: d.text(),
    transactionDate: d.integer({ mode: "timestamp" }).notNull(),
    status: d
      .text({ length: 50 })
      .notNull()
      .default("pending")
      .$type<"pending" | "rejected" | "executed">(),
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
    // Nullable here (splits may not carry one), so only non-null values are
    // constrained — `typeof(NULL)` is 'null' and would otherwise fail.
    check(
      "investment_transactions_quantity_whole",
      sql`${t.quantity} IS NULL OR typeof(${t.quantity}) = 'integer'`,
    ),
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
    amount: d.integer().$type<Cents>().notNull(),
    description: d.text(),
    // When the money actually moved, which may predate the row: users record
    // historical transactions. `createdAt` remains the audit trail of when the
    // row was entered. Mirrors investment_transactions.transaction_date.
    transactionDate: d.integer({ mode: "timestamp" }).notNull(),
    fromAccountId: d.text({ length: 255 }).references(() => cashAccounts.id),
    toAccountId: d.text({ length: 255 }).references(() => cashAccounts.id),
    status: d
      .text({ length: 50 })
      .notNull()
      .default("pending")
      .$type<"pending" | "rejected" | "completed">(),
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
    index("cash_transactions_transaction_date_idx").on(t.transactionDate),
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

// cash_transactions references cash_accounts three times (the anchor account
// plus a transfer's two sides), so every pair needs an explicit relationName —
// without one Drizzle cannot tell them apart and throws on any nested query.
export const cashAccountRelations = relations(
  cashAccounts,
  ({ one, many }) => ({
    user: one(users, { fields: [cashAccounts.userId], references: [users.id] }),
    transactions: many(cashTransactions, {
      relationName: "accountTransactions",
    }),
    outgoingTransfers: many(cashTransactions, { relationName: "transferFrom" }),
    incomingTransfers: many(cashTransactions, { relationName: "transferTo" }),
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
      relationName: "accountTransactions",
    }),
    fromAccount: one(cashAccounts, {
      fields: [cashTransactions.fromAccountId],
      references: [cashAccounts.id],
      relationName: "transferFrom",
    }),
    toAccount: one(cashAccounts, {
      fields: [cashTransactions.toAccountId],
      references: [cashAccounts.id],
      relationName: "transferTo",
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
