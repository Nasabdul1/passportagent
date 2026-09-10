CREATE TABLE `trade_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`passport_id` text NOT NULL,
	`agent` text NOT NULL,
	`token_out` text NOT NULL,
	`amount_wei` text NOT NULL,
	`slippage` real NOT NULL,
	`routing` text NOT NULL,
	`output_amount` text NOT NULL,
	`quote_json` text NOT NULL,
	`spend_tx_hash` text,
	`status` text DEFAULT 'quoted' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trade_quotes_owner_created_idx` ON `trade_quotes` (`owner`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `trade_quotes_spend_tx_idx` ON `trade_quotes` (`spend_tx_hash`);
