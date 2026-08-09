-- Money moves from floating point to integer minor units (cents).
--
-- The `* 100` in each SELECT below is hand-written: drizzle-kit rebuilds the
-- table for the type change but copies values across verbatim, which would
-- store 250.5 in a column the app now reads as 25050 cents — every balance
-- silently 100x too small. `quantity` is a share count and is left alone.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_cash_accounts` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`user_id` text(255) NOT NULL,
	`account_number` text(255) NOT NULL,
	`account_name` text(255) NOT NULL,
	`account_type` text(50) NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`status` text(50) DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_cash_accounts`("id", "user_id", "account_number", "account_name", "account_type", "balance", "status", "created_at", "updated_at") SELECT "id", "user_id", "account_number", "account_name", "account_type", CAST(ROUND("balance" * 100) AS INTEGER), "status", "created_at", "updated_at" FROM `cash_accounts`;--> statement-breakpoint
DROP TABLE `cash_accounts`;--> statement-breakpoint
ALTER TABLE `__new_cash_accounts` RENAME TO `cash_accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `cash_accounts_accountNumber_unique` ON `cash_accounts` (`account_number`);--> statement-breakpoint
CREATE INDEX `cash_accounts_user_id_idx` ON `cash_accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `cash_accounts_account_number_idx` ON `cash_accounts` (`account_number`);--> statement-breakpoint
CREATE TABLE `__new_cash_transactions` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`cash_account_id` text(255) NOT NULL,
	`transaction_type` text(50) NOT NULL,
	`amount` integer NOT NULL,
	`description` text,
	`transaction_date` integer NOT NULL,
	`from_account_id` text(255),
	`to_account_id` text(255),
	`status` text(50) DEFAULT 'pending' NOT NULL,
	`created_by_user_id` text(255) NOT NULL,
	`approved_by_admin_id` text(255),
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`approved_at` integer,
	FOREIGN KEY (`cash_account_id`) REFERENCES `cash_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_account_id`) REFERENCES `cash_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `cash_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by_admin_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_cash_transactions`("id", "cash_account_id", "transaction_type", "amount", "description", "transaction_date", "from_account_id", "to_account_id", "status", "created_by_user_id", "approved_by_admin_id", "created_at", "approved_at") SELECT "id", "cash_account_id", "transaction_type", CAST(ROUND("amount" * 100) AS INTEGER), "description", "transaction_date", "from_account_id", "to_account_id", "status", "created_by_user_id", "approved_by_admin_id", "created_at", "approved_at" FROM `cash_transactions`;--> statement-breakpoint
DROP TABLE `cash_transactions`;--> statement-breakpoint
ALTER TABLE `__new_cash_transactions` RENAME TO `cash_transactions`;--> statement-breakpoint
CREATE INDEX `cash_transactions_account_id_idx` ON `cash_transactions` (`cash_account_id`);--> statement-breakpoint
CREATE INDEX `cash_transactions_status_idx` ON `cash_transactions` (`status`);--> statement-breakpoint
CREATE INDEX `cash_transactions_created_by_idx` ON `cash_transactions` (`created_by_user_id`);--> statement-breakpoint
CREATE INDEX `cash_transactions_transaction_date_idx` ON `cash_transactions` (`transaction_date`);--> statement-breakpoint
CREATE TABLE `__new_holdings` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`investment_account_id` text(255) NOT NULL,
	`symbol` text(20) NOT NULL,
	`company_name` text(255),
	`quantity` real NOT NULL,
	`average_cost_basis` integer NOT NULL,
	`dividend_reinvestment` integer DEFAULT false NOT NULL,
	`dividend_cash_balance` integer DEFAULT 0 NOT NULL,
	`last_transaction_date` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`investment_account_id`) REFERENCES `investment_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_holdings`("id", "investment_account_id", "symbol", "company_name", "quantity", "average_cost_basis", "dividend_reinvestment", "dividend_cash_balance", "last_transaction_date", "created_at", "updated_at") SELECT "id", "investment_account_id", "symbol", "company_name", "quantity", CAST(ROUND("average_cost_basis" * 100) AS INTEGER), "dividend_reinvestment", CAST(ROUND("dividend_cash_balance" * 100) AS INTEGER), "last_transaction_date", "created_at", "updated_at" FROM `holdings`;--> statement-breakpoint
DROP TABLE `holdings`;--> statement-breakpoint
ALTER TABLE `__new_holdings` RENAME TO `holdings`;--> statement-breakpoint
CREATE INDEX `holdings_investment_account_id_idx` ON `holdings` (`investment_account_id`);--> statement-breakpoint
CREATE INDEX `holdings_symbol_idx` ON `holdings` (`symbol`);--> statement-breakpoint
CREATE TABLE `__new_investment_transactions` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`investment_account_id` text(255) NOT NULL,
	`transaction_type` text(50) NOT NULL,
	`symbol` text(20) NOT NULL,
	`quantity` real,
	`price` integer,
	`amount` integer NOT NULL,
	`brokerage` integer DEFAULT 0 NOT NULL,
	`description` text,
	`transaction_date` integer NOT NULL,
	`status` text(50) DEFAULT 'pending' NOT NULL,
	`created_by_user_id` text(255) NOT NULL,
	`approved_by_admin_id` text(255),
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`approved_at` integer,
	FOREIGN KEY (`investment_account_id`) REFERENCES `investment_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by_admin_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_investment_transactions`("id", "investment_account_id", "transaction_type", "symbol", "quantity", "price", "amount", "brokerage", "description", "transaction_date", "status", "created_by_user_id", "approved_by_admin_id", "created_at", "approved_at") SELECT "id", "investment_account_id", "transaction_type", "symbol", "quantity", CAST(ROUND("price" * 100) AS INTEGER), CAST(ROUND("amount" * 100) AS INTEGER), CAST(ROUND("brokerage" * 100) AS INTEGER), "description", "transaction_date", "status", "created_by_user_id", "approved_by_admin_id", "created_at", "approved_at" FROM `investment_transactions`;--> statement-breakpoint
DROP TABLE `investment_transactions`;--> statement-breakpoint
ALTER TABLE `__new_investment_transactions` RENAME TO `investment_transactions`;--> statement-breakpoint
CREATE INDEX `investment_transactions_account_id_idx` ON `investment_transactions` (`investment_account_id`);--> statement-breakpoint
CREATE INDEX `investment_transactions_symbol_idx` ON `investment_transactions` (`symbol`);--> statement-breakpoint
CREATE INDEX `investment_transactions_status_idx` ON `investment_transactions` (`status`);--> statement-breakpoint
CREATE INDEX `investment_transactions_created_by_idx` ON `investment_transactions` (`created_by_user_id`);