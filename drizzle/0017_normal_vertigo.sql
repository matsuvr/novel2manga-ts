CREATE TABLE `job_shares` (
        `id` text PRIMARY KEY NOT NULL,
        `job_id` text NOT NULL,
        `token` text NOT NULL,
        `expires_at` text,
        `is_enabled` integer DEFAULT true NOT NULL,
        `episode_numbers` text,
        `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        `disabled_at` text,
        `last_accessed_at` text,
        FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_job_shares_job_id` ON `job_shares` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_job_shares_token` ON `job_shares` (`token`);
