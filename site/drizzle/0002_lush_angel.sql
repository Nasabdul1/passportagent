CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`agent_id` text NOT NULL,
	`revision` integer NOT NULL,
	`status` text NOT NULL,
	`output` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `runs_owner_created_idx` ON `agent_runs` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `provider_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`provider` text NOT NULL,
	`ciphertext` text NOT NULL,
	`updated_at` integer NOT NULL
);
