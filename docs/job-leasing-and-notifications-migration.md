# Job leasing + notification outbox migration (0018)

This change introduces safe job leasing for the background worker and an idempotent notification outbox to prevent duplicate emails.

## What changed
- jobs table
  - locked_by TEXT: worker id holding the lease
  - lease_expires_at TEXT: ISO timestamp for lease expiry
  - last_notified_status TEXT: last status notified (completed/failed)
  - last_notified_at TEXT: ISO timestamp for last notification
- job_notifications table
  - Outbox table with UNIQUE(job_id, status) to guarantee idempotency

## Why
- Prevent the worker and the API pipeline from processing the same job concurrently
- Ensure only the first notification for a given (job_id, status) is sent

## Rollout steps
1) Apply migration
   - Run DB migration in all environments (dev/staging/prod)
   - Migration file: drizzle/0018_job_leasing_and_notifications.sql
2) Deploy application
   - Worker now attempts to acquire a lease before processing
   - Worker releases the lease on completion/failure
   - Notification service records outbox first; skip send if already recorded
3) Configuration
   - Keep WORKER_ENABLE_NOTIFICATIONS=false unless the worker is the sole orchestrator
   - PM2/Docker env already default to disabled in code; verify your env

## Backward compatibility
- New columns are nullable and safe to add
- Outbox table is additive; existing flows continue to work

## Observability
- Worker logs warn when lease release fails
- Add dashboards/alerts for jobs with stale leases (lease_expires_at < now and status not in completed/failed)

## Rollback
- If needed, you can stop using the new columns without dropping them
- Drop job_notifications only if absolutely necessary (ensure no code path depends on it before doing so)
