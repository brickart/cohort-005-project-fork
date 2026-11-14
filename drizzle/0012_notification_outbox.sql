CREATE TABLE `notification_outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`idempotency_key` text NOT NULL,
	`type` text NOT NULL,
	`recipient_id` integer NOT NULL,
	`actor_id` integer,
	`data` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`delivered_at` text,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_outbox_idempotency_key_unique` ON `notification_outbox` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `notification_outbox_status_next_attempt_idx` ON `notification_outbox` (`status`,`next_attempt_at`);