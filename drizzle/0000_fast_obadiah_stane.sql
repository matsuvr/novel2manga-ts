-- Reordered to satisfy SQLite FK requirements: create referenced tables first

-- 1) novels (no FKs)
CREATE TABLE `novels` (
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
CREATE INDEX `idx_novels_created_at` ON `novels` (`created_at`);--> statement-breakpoint

-- 2) jobs (FK -> novels)
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`novel_id` text NOT NULL,
	`job_name` text,
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
	`last_error` text,
	`last_error_step` text,
	`retry_count` integer DEFAULT 0,
	`resume_data_path` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`started_at` text,
	`completed_at` text,
	FOREIGN KEY (`novel_id`) REFERENCES `novels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_novel_id` ON `jobs` (`novel_id`);--> statement-breakpoint
CREATE INDEX `idx_jobs_status` ON `jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_jobs_novel_id_status` ON `jobs` (`novel_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_jobs_current_step` ON `jobs` (`current_step`);--> statement-breakpoint

-- 3) tables that reference jobs/novels
CREATE TABLE `chunk_analysis_status` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`is_analyzed` integer DEFAULT false,
	`analysis_path` text,
	`analyzed_at` text,
	`retry_count` integer DEFAULT 0,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_chunk_analysis_status_job_id` ON `chunk_analysis_status` (`job_id`);--> statement-breakpoint
CREATE INDEX `unique_job_chunk_analysis` ON `chunk_analysis_status` (`job_id`,`chunk_index`);--> statement-breakpoint

CREATE TABLE `chunks` (
    `id` text PRIMARY KEY NOT NULL,
    `novel_id` text,
	`job_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`content_path` text NOT NULL,
	`start_position` integer NOT NULL,
	`end_position` integer NOT NULL,
	`word_count` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`novel_id`) REFERENCES `novels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_chunks_novel_id` ON `chunks` (`novel_id`);--> statement-breakpoint
CREATE INDEX `idx_chunks_job_id` ON `chunks` (`job_id`);--> statement-breakpoint
CREATE INDEX `unique_job_chunk` ON `chunks` (`job_id`,`chunk_index`);--> statement-breakpoint

CREATE TABLE `episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`novel_id` text NOT NULL,
	`job_id` text NOT NULL,
	`episode_number` integer NOT NULL,
	`title` text,
	`summary` text,
	`start_chunk` integer NOT NULL,
	`start_char_index` integer NOT NULL,
	`end_chunk` integer NOT NULL,
	`end_char_index` integer NOT NULL,
	`estimated_pages` integer NOT NULL,
	`confidence` real NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`novel_id`) REFERENCES `novels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_episodes_novel_id` ON `episodes` (`novel_id`);--> statement-breakpoint
CREATE INDEX `idx_episodes_job_id` ON `episodes` (`job_id`);--> statement-breakpoint
CREATE INDEX `unique_job_episode` ON `episodes` (`job_id`,`episode_number`);--> statement-breakpoint

CREATE TABLE `job_step_history` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`step_name` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`duration_seconds` integer,
	`input_path` text,
	`output_path` text,
	`error_message` text,
	`metadata` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_job_step_history_job_id` ON `job_step_history` (`job_id`);--> statement-breakpoint

CREATE TABLE `layout_status` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`episode_number` integer NOT NULL,
	`is_generated` integer DEFAULT false,
	`layout_path` text,
	`total_pages` integer,
	`total_panels` integer,
	`generated_at` text,
	`retry_count` integer DEFAULT 0,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_layout_status_job_id` ON `layout_status` (`job_id`);--> statement-breakpoint
CREATE INDEX `unique_job_episode_layout` ON `layout_status` (`job_id`,`episode_number`);--> statement-breakpoint

CREATE TABLE `outputs` (
	`id` text PRIMARY KEY NOT NULL,
	`novel_id` text NOT NULL,
	`job_id` text NOT NULL,
	`output_type` text NOT NULL,
	`output_path` text NOT NULL,
	`file_size` integer,
	`page_count` integer,
	`metadata_path` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`novel_id`) REFERENCES `novels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_outputs_novel_id` ON `outputs` (`novel_id`);--> statement-breakpoint
CREATE INDEX `idx_outputs_job_id` ON `outputs` (`job_id`);--> statement-breakpoint

CREATE TABLE `render_status` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`episode_number` integer NOT NULL,
	`page_number` integer NOT NULL,
	`is_rendered` integer DEFAULT false,
	`image_path` text,
	`thumbnail_path` text,
	`width` integer,
	`height` integer,
	`file_size` integer,
	`rendered_at` text,
	`retry_count` integer DEFAULT 0,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_render_status_job_id` ON `render_status` (`job_id`);--> statement-breakpoint
CREATE INDEX `unique_job_episode_page` ON `render_status` (`job_id`,`episode_number`,`page_number`);--> statement-breakpoint

CREATE TABLE `storage_files` (
	`id` text PRIMARY KEY NOT NULL,
	`novel_id` text NOT NULL,
	`job_id` text,
	`file_path` text NOT NULL,
	`file_category` text NOT NULL,
	`file_type` text NOT NULL,
	`mime_type` text,
	`file_size` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`novel_id`) REFERENCES `novels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storage_files_file_path_unique` ON `storage_files` (`file_path`);--> statement-breakpoint
CREATE INDEX `idx_storage_files_novel_id` ON `storage_files` (`novel_id`);
