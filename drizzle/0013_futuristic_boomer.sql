ALTER TABLE `user` ADD `email_notifications` integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE `user` ADD `theme` text DEFAULT 'light';--> statement-breakpoint
ALTER TABLE `user` ADD `language` text DEFAULT 'ja';--> statement-breakpoint
INSERT OR IGNORE INTO `user` (id, name, email, created_at) VALUES ('user1', 'User 1', 'user1@example.com', CURRENT_TIMESTAMP);--> statement-breakpoint
INSERT OR IGNORE INTO `user` (id, name, email, created_at) VALUES ('user2', 'User 2', 'user2@example.com', CURRENT_TIMESTAMP);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`novel_id` text NOT NULL,
	`job_name` text,
	`user_id` text NOT NULL DEFAULT 'anonymous',
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
	`character_memory_path` text,
	`prompt_memory_path` text,
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
	FOREIGN KEY (`novel_id`) REFERENCES `novels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_jobs`("id", "novel_id", "job_name", "user_id", "status", "current_step", "split_completed", "analyze_completed", "episode_completed", "layout_completed", "render_completed", "chunks_dir_path", "analyses_dir_path", "episodes_data_path", "layouts_dir_path", "renders_dir_path", "character_memory_path", "prompt_memory_path", "total_chunks", "processed_chunks", "total_episodes", "processed_episodes", "total_pages", "rendered_pages", "processing_episode", "processing_page", "last_error", "last_error_step", "retry_count", "resume_data_path", "coverage_warnings", "created_at", "updated_at", "started_at", "completed_at") SELECT "id", "novel_id", "job_name", "user_id", "status", "current_step", "split_completed", "analyze_completed", "episode_completed", "layout_completed", "render_completed", "chunks_dir_path", "analyses_dir_path", "episodes_data_path", "layouts_dir_path", "renders_dir_path", "character_memory_path", "prompt_memory_path", "total_chunks", "processed_chunks", "total_episodes", "processed_episodes", "total_pages", "rendered_pages", "processing_episode", "processing_page", "last_error", "last_error_step", "retry_count", "resume_data_path", "coverage_warnings", "created_at", "updated_at", "started_at", "completed_at" FROM `jobs`;--> statement-breakpoint
DROP TABLE `jobs`;--> statement-breakpoint
ALTER TABLE `__new_jobs` RENAME TO `jobs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_jobs_novel_id` ON `jobs` (`novel_id`);--> statement-breakpoint
CREATE INDEX `idx_jobs_status` ON `jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_jobs_novel_id_status` ON `jobs` (`novel_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_jobs_current_step` ON `jobs` (`current_step`);--> statement-breakpoint
CREATE INDEX `idx_jobs_user_id` ON `jobs` (`user_id`);--> statement-breakpoint
ALTER TABLE `storage_files` ADD `user_id` text;--> statement-breakpoint
UPDATE `storage_files` SET `user_id` = (SELECT `novels`.`user_id` FROM `novels` WHERE `novels`.`id` = `storage_files`.`novel_id`);--> statement-breakpoint
UPDATE `storage_files` SET `user_id` = 'anonymous' WHERE `user_id` IS NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_storage_files` (
	`id` text PRIMARY KEY NOT NULL,
	`novel_id` text NOT NULL,
	`job_id` text,
	`user_id` text NOT NULL,
	`file_path` text NOT NULL,
	`file_category` text NOT NULL,
	`file_type` text NOT NULL,
	`mime_type` text,
	`file_size` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`novel_id`) REFERENCES `novels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_storage_files`("id", "novel_id", "job_id", "user_id", "file_path", "file_category", "file_type", "mime_type", "file_size", "created_at") SELECT "id", "novel_id", "job_id", "user_id", "file_path", "file_category", "file_type", "mime_type", "file_size", "created_at" FROM `storage_files`;--> statement-breakpoint
DROP TABLE `storage_files`;--> statement-breakpoint
ALTER TABLE `__new_storage_files` RENAME TO `storage_files`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `storage_files_file_path_unique` ON `storage_files` (`file_path`);--> statement-breakpoint
CREATE INDEX `idx_storage_files_novel_id` ON `storage_files` (`novel_id`);--> statement-breakpoint
CREATE INDEX `idx_storage_files_user_id` ON `storage_files` (`user_id`);