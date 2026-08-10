-- Holdings now pool the cost of a position rather than averaging it: a total,
-- with the per-share figure derived at display time. See the comment on
-- `holdings.total_cost_basis` in the schema for why.
--
-- Expand half of an expand/contract pair — 0006 drops `average_cost_basis`
-- once this backfill has read it.
--
-- drizzle-kit generates a bare `ADD COLUMN ... NOT NULL`, which SQLite accepts
-- only while the table is empty. The constant default plus backfill makes this
-- safe to apply to a database that already holds positions.
ALTER TABLE `holdings` ADD `total_cost_basis` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `holdings` SET `total_cost_basis` = `average_cost_basis` * `quantity`;
