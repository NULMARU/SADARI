CREATE TABLE `rooms` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`state` text NOT NULL,
	`version` integer NOT NULL,
	`updated_at` integer NOT NULL
);
