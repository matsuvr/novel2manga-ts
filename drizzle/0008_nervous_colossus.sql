DROP TABLE IF EXISTS `__legacy_authenticator`;--> statement-breakpoint
ALTER TABLE `authenticator` RENAME TO `__legacy_authenticator`;--> statement-breakpoint
-- user.emailVerified is already camelCase in prior migration; skip if not present
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_authenticators` (
	`credential_id` text NOT NULL,
	`user_id` text NOT NULL,
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
INSERT INTO `__new_authenticators`(
  "credential_id",
  "user_id",
  "provider_account_id",
  "credential_public_key",
  "counter",
  "credential_device_type",
  "credential_backed_up",
  "transports"
) SELECT
  "credentialID",
  "userId",
  "providerAccountId",
  "credentialPublicKey",
  "counter",
  "credentialDeviceType",
  "credentialBackedUp",
  "transports"
FROM `__legacy_authenticator`;--> statement-breakpoint
DROP TABLE IF EXISTS `authenticators`;--> statement-breakpoint
ALTER TABLE `__new_authenticators` RENAME TO `authenticators`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `authenticators_credential_id_unique` ON `authenticators` (`credential_id`);--> statement-breakpoint
DROP INDEX IF EXISTS `users_email_unique`;--> statement-breakpoint
ALTER TABLE `user` ADD `created_at` text DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `user_email_unique` ON `user` (`email`);--> statement-breakpoint
-- Ensure default user exists for FK targets
INSERT OR IGNORE INTO `user` ("id", "name") VALUES ('anonymous', 'Anonymous');--> statement-breakpoint
CREATE TABLE `__new_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`novel_id` text NOT NULL,
	`job_name` text,
	`user_id` text DEFAULT 'anonymous' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`current_step` text DEFAULT 'initialized' NOT NULL,
	`split_completed` integer DEFAULT false,
	`analyze_completed` integer DEFAULT false,
	`episode_completed` integer DEFAULT false,
	`layout_completed` integer DEFAULT false,
	`render_completed` integer DEFAULT false,
	`chunks_dir_path` text,
	`analyses_dir_path` text,
	`episodes_data_path` text,
	`layouts_dir_path` text,
	`renders_dir_path` text,
	`total_chunks` integer DEFAULT 0,
	`processed_chunks` integer DEFAULT 0,
	`total_episodes` integer DEFAULT 0,
	`processed_episodes` integer DEFAULT 0,
	`total_pages` integer DEFAULT 0,
	`rendered_pages` integer DEFAULT 0,
	`processing_episode` integer,
	`processing_page` integer,
	`last_error` text,
	`last_error_step` text,
	`retry_count` integer DEFAULT 0,
	`resume_data_path` text,
	`coverage_warnings` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`started_at` text,
	`completed_at` text,
	FOREIGN KEY (`novel_id`) REFERENCES `novels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_jobs`(
  "id", "novel_id", "job_name", "user_id", "status", "current_step",
  "split_completed", "analyze_completed", "episode_completed", "layout_completed",
  "render_completed", "chunks_dir_path", "analyses_dir_path", "episodes_data_path",
  "layouts_dir_path", "renders_dir_path", "total_chunks", "processed_chunks",
  "total_episodes", "processed_episodes", "total_pages", "rendered_pages",
  "processing_episode", "processing_page", "last_error", "last_error_step",
  "retry_count", "resume_data_path", "coverage_warnings", "created_at",
  "updated_at", "started_at", "completed_at"
) SELECT
  "id", "novel_id", "job_name",
  COALESCE("user_id", 'anonymous') as "user_id",
  "status", "current_step", "split_completed", "analyze_completed",
  "episode_completed", "layout_completed", "render_completed",
  "chunks_dir_path", "analyses_dir_path", "episodes_data_path",
  "layouts_dir_path", "renders_dir_path", "total_chunks", "processed_chunks",
  "total_episodes", "processed_episodes", "total_pages", "rendered_pages",
  "processing_episode", "processing_page", "last_error", "last_error_step",
  "retry_count", "resume_data_path", "coverage_warnings", "created_at",
  "updated_at", "started_at", "completed_at"
FROM `jobs`;--> statement-breakpoint
DROP TABLE `jobs`;--> statement-breakpoint
ALTER TABLE `__new_jobs` RENAME TO `jobs`;--> statement-breakpoint
CREATE INDEX `idx_jobs_novel_id` ON `jobs` (`novel_id`);--> statement-breakpoint
CREATE INDEX `idx_jobs_status` ON `jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_jobs_novel_id_status` ON `jobs` (`novel_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_jobs_current_step` ON `jobs` (`current_step`);--> statement-breakpoint
CREATE INDEX `idx_jobs_user_id` ON `jobs` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_novels` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`author` text,
	`original_text_path` text,
	`text_length` integer NOT NULL,
	`language` text DEFAULT 'ja',
	`metadata_path` text,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_novels`(
  "id", "title", "author", "original_text_path", "text_length", "language",
  "metadata_path", "user_id", "created_at", "updated_at"
) SELECT
  "id", "title", "author", "original_text_path", "text_length", "language",
  "metadata_path", COALESCE("user_id", 'anonymous') as "user_id", "created_at", "updated_at"
FROM `novels`;--> statement-breakpoint
DROP TABLE `novels`;--> statement-breakpoint
ALTER TABLE `__new_novels` RENAME TO `novels`;--> statement-breakpoint
CREATE INDEX `idx_novels_user_id` ON `novels` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_novels_created_at` ON `novels` (`created_at`);--> statement-breakpoint
CREATE TABLE `__new_session` (
	`sessionToken` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_session`("sessionToken", "userId", "expires") SELECT "sessionToken", "userId", "expires" FROM `session`;--> statement-breakpoint
DROP TABLE `session`;--> statement-breakpoint
ALTER TABLE `__new_session` RENAME TO `session`;
