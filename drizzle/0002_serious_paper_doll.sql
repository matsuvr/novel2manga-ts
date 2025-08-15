CREATE TABLE `token_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`agent_name` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt_tokens` integer NOT NULL,
	`completion_tokens` integer NOT NULL,
	`total_tokens` integer NOT NULL,
	`cost` real,
	`step_name` text,
	`chunk_index` integer,
	`episode_number` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_token_usage_job_id` ON `token_usage` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_token_usage_agent_name` ON `token_usage` (`agent_name`);--> statement-breakpoint
CREATE INDEX `idx_token_usage_provider` ON `token_usage` (`provider`);--> statement-breakpoint
CREATE INDEX `idx_token_usage_created_at` ON `token_usage` (`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_novels` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`author` text,
	`original_text_path` text,
	`text_length` integer NOT NULL,
	`language` text DEFAULT 'ja',
	`metadata_path` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
INSERT INTO `__new_novels`("id", "title", "author", "original_text_path", "text_length", "language", "metadata_path", "created_at", "updated_at") SELECT "id", "title", "author", "original_text_path", "text_length", "language", "metadata_path", "created_at", "updated_at" FROM `novels`;--> statement-breakpoint
DROP TABLE `novels`;--> statement-breakpoint
ALTER TABLE `__new_novels` RENAME TO `novels`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_novels_created_at` ON `novels` (`created_at`);