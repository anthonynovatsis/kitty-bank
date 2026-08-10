-- Contract half of the pair begun in 0005: the average is now derived from
-- `total_cost_basis` and `quantity`, so the stored copy goes.
ALTER TABLE `holdings` DROP COLUMN `average_cost_basis`;
