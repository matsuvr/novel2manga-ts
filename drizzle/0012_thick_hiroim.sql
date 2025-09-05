DROP INDEX `unique_job_episode_page`;--> statement-breakpoint
CREATE UNIQUE INDEX `unique_job_episode_page` ON `render_status` (`job_id`,`episode_number`,`page_number`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `character_memory_path` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `prompt_memory_path` text;