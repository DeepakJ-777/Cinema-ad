CREATE TABLE `discovery_cache` (
	`geohash` text PRIMARY KEY NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`checked_at` integer NOT NULL
);
