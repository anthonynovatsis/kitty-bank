CREATE TABLE `cash_accounts` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`user_id` text(255) NOT NULL,
	`account_number` text(255) NOT NULL,
	`account_name` text(255) NOT NULL,
	`account_type` text(50) NOT NULL,
	`balance` real DEFAULT 0 NOT NULL,
	`status` text(50) DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cash_accounts_accountNumber_unique` ON `cash_accounts` (`account_number`);--> statement-breakpoint
CREATE INDEX `cash_accounts_user_id_idx` ON `cash_accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `cash_accounts_account_number_idx` ON `cash_accounts` (`account_number`);--> statement-breakpoint
CREATE TABLE `cash_transactions` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`cash_account_id` text(255) NOT NULL,
	`transaction_type` text(50) NOT NULL,
	`amount` real NOT NULL,
	`description` text,
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
CREATE INDEX `cash_transactions_account_id_idx` ON `cash_transactions` (`cash_account_id`);--> statement-breakpoint
CREATE INDEX `cash_transactions_status_idx` ON `cash_transactions` (`status`);--> statement-breakpoint
CREATE INDEX `cash_transactions_created_by_idx` ON `cash_transactions` (`created_by_user_id`);--> statement-breakpoint
CREATE TABLE `holdings` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`investment_account_id` text(255) NOT NULL,
	`symbol` text(20) NOT NULL,
	`company_name` text(255),
	`quantity` real NOT NULL,
	`average_cost_basis` real NOT NULL,
	`dividend_reinvestment` integer DEFAULT false NOT NULL,
	`dividend_cash_balance` real DEFAULT 0 NOT NULL,
	`last_transaction_date` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`investment_account_id`) REFERENCES `investment_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `holdings_investment_account_id_idx` ON `holdings` (`investment_account_id`);--> statement-breakpoint
CREATE INDEX `holdings_symbol_idx` ON `holdings` (`symbol`);--> statement-breakpoint
CREATE TABLE `investment_accounts` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`user_id` text(255) NOT NULL,
	`account_number` text(255) NOT NULL,
	`account_name` text(255) NOT NULL,
	`status` text(50) DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `investment_accounts_accountNumber_unique` ON `investment_accounts` (`account_number`);--> statement-breakpoint
CREATE INDEX `investment_accounts_user_id_idx` ON `investment_accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `investment_accounts_account_number_idx` ON `investment_accounts` (`account_number`);--> statement-breakpoint
CREATE TABLE `investment_transactions` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`investment_account_id` text(255) NOT NULL,
	`transaction_type` text(50) NOT NULL,
	`symbol` text(20) NOT NULL,
	`quantity` real,
	`price` real,
	`amount` real NOT NULL,
	`brokerage` real DEFAULT 0 NOT NULL,
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
CREATE INDEX `investment_transactions_account_id_idx` ON `investment_transactions` (`investment_account_id`);--> statement-breakpoint
CREATE INDEX `investment_transactions_symbol_idx` ON `investment_transactions` (`symbol`);--> statement-breakpoint
CREATE INDEX `investment_transactions_status_idx` ON `investment_transactions` (`status`);--> statement-breakpoint
CREATE INDEX `investment_transactions_created_by_idx` ON `investment_transactions` (`created_by_user_id`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`user_id` text(255) NOT NULL,
	`requires_transaction_approval` integer DEFAULT true NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_settings_userId_unique` ON `user_settings` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_settings_user_id_idx` ON `user_settings` (`user_id`);