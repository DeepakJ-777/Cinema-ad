ALTER TABLE `cinemas` ADD `venue_code` text;--> statement-breakpoint
ALTER TABLE `cinemas` ADD `source` text DEFAULT 'seed' NOT NULL;--> statement-breakpoint
ALTER TABLE `movies` ADD `event_code` text;--> statement-breakpoint
ALTER TABLE `movies` ADD `source` text DEFAULT 'seed' NOT NULL;--> statement-breakpoint
ALTER TABLE `shows` ADD `session_id` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `show_time_code` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `show_date_time` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `availability_status` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `language` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `source` text DEFAULT 'seed' NOT NULL;--> statement-breakpoint
ALTER TABLE `shows` ADD `last_synced_at` integer;--> statement-breakpoint
CREATE INDEX `shows_source_idx` ON `shows` (`source`,`last_synced_at`);--> statement-breakpoint
ALTER TABLE `sync_locations` ADD `region_code` text;
-- Config data: verified provider region code (from the browser request).
-- Bengaluru is intentionally NULL until its code is verified the same way;
-- the sync worker skips locations without a region_code and says so.
UPDATE `sync_locations` SET `region_code` = 'KOCH' WHERE `slug` = 'kochi';
