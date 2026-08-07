-- drizzle-kit generates a bare `ADD COLUMN ... NOT NULL`, which SQLite accepts
-- only while the table is empty ("Cannot add a NOT NULL column with default
-- value NULL" otherwise). The constant default plus backfill makes this safe to
-- apply to a database that already holds transactions.
--
-- Existing rows are dated from `created_at`: before this column existed, when a
-- row was recorded was the only date we had for it.
ALTER TABLE `cash_transactions` ADD `transaction_date` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `cash_transactions` SET `transaction_date` = `created_at` WHERE `transaction_date` = 0;--> statement-breakpoint
CREATE INDEX `cash_transactions_transaction_date_idx` ON `cash_transactions` (`transaction_date`);
