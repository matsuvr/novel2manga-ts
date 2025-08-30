DROP INDEX `unique_job_episode_layout`;--> statement-breakpoint
CREATE UNIQUE INDEX `unique_job_episode_layout` ON `layout_status` (`job_id`,`episode_number`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `coverage_warnings` text;