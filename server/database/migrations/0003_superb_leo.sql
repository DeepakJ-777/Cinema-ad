CREATE TABLE `sync_locations` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_synced_at` integer,
	`created_at` integer NOT NULL
);

-- Config/reference data (not scraped showtime data): the locations the daily
-- BMS sync cron covers. Add more cities here as Near Me discovery grows.
INSERT OR IGNORE INTO `sync_locations` (`slug`, `name`, `enabled`, `created_at`) VALUES
	('kochi', 'Kochi', 1, unixepoch()),
	('bengaluru', 'Bengaluru', 1, unixepoch());
