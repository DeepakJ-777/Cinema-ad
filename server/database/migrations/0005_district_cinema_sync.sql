ALTER TABLE `cinemas` ADD `district_cinema_id` text;--> statement-breakpoint
ALTER TABLE `cinemas` ADD `last_synced_at` integer;
-- District (Zomato) is the live showtime provider. For District,
-- sync_locations.region_code carries the numeric District city id, verified
-- from District's own city pages (footer SEO payload):
--   kochi = 14, bengaluru = 4 (2026-08-17).
-- The BookMyShow region codes (e.g. KOCH) are retired from this column;
-- USE_BMS=1 dev runs must set their own region codes.
UPDATE `sync_locations` SET `region_code` = '14' WHERE `slug` = 'kochi';
UPDATE `sync_locations` SET `region_code` = '4' WHERE `slug` = 'bengaluru';