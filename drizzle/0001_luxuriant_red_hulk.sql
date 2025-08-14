DROP INDEX `unique_job_episode`;--> statement-breakpoint
CREATE UNIQUE INDEX `unique_job_episode` ON `episodes` (`job_id`,`episode_number`);