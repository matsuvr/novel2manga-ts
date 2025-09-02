PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_authenticators` (
	`credential_id` text NOT NULL,
	`user_id` text DEFAULT 'anonymous' NOT NULL,
	`provider_account_id` text NOT NULL,
	`credential_public_key` text NOT NULL,
	`counter` integer NOT NULL,
	`credential_device_type` text NOT NULL,
	`credential_backed_up` integer NOT NULL,
	`transports` text,
	PRIMARY KEY(`user_id`, `credential_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_authenticators`("credential_id", "user_id", "provider_account_id", "credential_public_key", "counter", "credential_device_type", "credential_backed_up", "transports") SELECT "credential_id", "user_id", "provider_account_id", "credential_public_key", "counter", "credential_device_type", "credential_backed_up", "transports" FROM `authenticators`;--> statement-breakpoint
DROP TABLE `authenticators`;--> statement-breakpoint
ALTER TABLE `__new_authenticators` RENAME TO `authenticators`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `authenticators_credential_id_unique` ON `authenticators` (`credential_id`);