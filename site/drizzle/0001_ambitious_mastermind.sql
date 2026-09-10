CREATE TABLE `agent_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`spec` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agents_owner_updated_idx` ON `agent_configs` (`owner`,`updated_at`);