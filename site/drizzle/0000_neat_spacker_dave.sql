CREATE TABLE `used_nonces` (
	`nonce_key` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `nonces_expiry_idx` ON `used_nonces` (`expires_at`);