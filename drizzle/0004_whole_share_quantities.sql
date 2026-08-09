PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_holdings` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`investment_account_id` text(255) NOT NULL,
	`symbol` text(20) NOT NULL,
	`company_name` text(255),
	`quantity` integer NOT NULL,
	`average_cost_basis` integer NOT NULL,
	`dividend_reinvestment` integer DEFAULT false NOT NULL,
	`dividend_cash_balance` integer DEFAULT 0 NOT NULL,
	`last_transaction_date` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`investment_account_id`) REFERENCES `investment_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "holdings_quantity_whole" CHECK(typeof("__new_holdings"."quantity") = 'integer')
);
--> statement-breakpoint
INSERT INTO `__new_holdings`("id", "investment_account_id", "symbol", "company_name", "quantity", "average_cost_basis", "dividend_reinvestment", "dividend_cash_balance", "last_transaction_date", "created_at", "updated_at") SELECT "id", "investment_account_id", "symbol", "company_name", "quantity", "average_cost_basis", "dividend_reinvestment", "dividend_cash_balance", "last_transaction_date", "created_at", "updated_at" FROM `holdings`;--> statement-breakpoint
DROP TABLE `holdings`;--> statement-breakpoint
ALTER TABLE `__new_holdings` RENAME TO `holdings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `holdings_investment_account_id_idx` ON `holdings` (`investment_account_id`);--> statement-breakpoint
CREATE INDEX `holdings_symbol_idx` ON `holdings` (`symbol`);--> statement-breakpoint
CREATE TABLE `__new_investment_transactions` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`investment_account_id` text(255) NOT NULL,
	`transaction_type` text(50) NOT NULL,
	`symbol` text(20) NOT NULL,
	`quantity` integer,
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
	FOREIGN KEY (`approved_by_admin_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "investment_transactions_quantity_whole" CHECK("__new_investment_transactions"."quantity" IS NULL OR typeof("__new_investment_transactions"."quantity") = 'integer')
);
--> statement-breakpoint
INSERT INTO `__new_investment_transactions`("id", "investment_account_id", "transaction_type", "symbol", "quantity", "price", "amount", "brokerage", "description", "transaction_date", "status", "created_by_user_id", "approved_by_admin_id", "created_at", "approved_at") SELECT "id", "investment_account_id", "transaction_type", "symbol", "quantity", "price", "amount", "brokerage", "description", "transaction_date", "status", "created_by_user_id", "approved_by_admin_id", "created_at", "approved_at" FROM `investment_transactions`;--> statement-breakpoint
DROP TABLE `investment_transactions`;--> statement-breakpoint
ALTER TABLE `__new_investment_transactions` RENAME TO `investment_transactions`;--> statement-breakpoint
CREATE INDEX `investment_transactions_account_id_idx` ON `investment_transactions` (`investment_account_id`);--> statement-breakpoint
CREATE INDEX `investment_transactions_symbol_idx` ON `investment_transactions` (`symbol`);--> statement-breakpoint
CREATE INDEX `investment_transactions_status_idx` ON `investment_transactions` (`status`);--> statement-breakpoint
CREATE INDEX `investment_transactions_created_by_idx` ON `investment_transactions` (`created_by_user_id`);