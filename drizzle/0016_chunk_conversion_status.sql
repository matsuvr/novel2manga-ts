CREATE TABLE IF NOT EXISTS "chunk_conversion_status" (
  "job_id" text NOT NULL,
  "chunk_index" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "result_path" text,
  "error_message" text,
  "retry_count" integer DEFAULT 0,
  "started_at" text,
  "completed_at" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chunk_conversion_status_job_index" PRIMARY KEY("job_id", "chunk_index"),
  CONSTRAINT "chunk_conversion_status_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE cascade
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_chunk_conversion_job" ON "chunk_conversion_status" ("job_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chunk_conversion_status" ON "chunk_conversion_status" ("status");
