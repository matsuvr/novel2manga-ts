# Job Worker Configuration

## Overview

The Novel2Manga job worker is a background process that handles the processing of manga conversion jobs. It runs independently of the web application and processes jobs from the database queue.

## Environment Variables

### Core Configuration

| Variable                      | Default | Description                                      |
| ----------------------------- | ------- | ------------------------------------------------ |
| `WORKER_TICK_MS`              | `5000`  | Interval between job queue checks (milliseconds) |
| `WORKER_MAX_RETRIES`          | `3`     | Maximum number of retry attempts for failed jobs |
| `WORKER_ENABLE_NOTIFICATIONS` | `true`  | Enable/disable email notifications               |
| `WORKER_BATCH_SIZE`           | `1`     | Number of jobs to process in each batch          |

### Database Configuration

The worker uses the same database configuration as the main application:

| Variable       | Required | Description               |
| -------------- | -------- | ------------------------- |
| `DATABASE_URL` | Yes      | SQLite database file path |

### Email Configuration (for notifications)

| Variable    | Required | Description                     |
| ----------- | -------- | ------------------------------- |
| `SMTP_HOST` | No       | SMTP server hostname            |
| `SMTP_PORT` | No       | SMTP server port (default: 587) |
| `SMTP_USER` | No       | SMTP username                   |
| `SMTP_PASS` | No       | SMTP password                   |
| `MAIL_FROM` | No       | From email address              |

## Running the Worker

### Development

```bash
# Start worker directly
npm run worker:start

# Start worker with TypeScript (development)
npm run worker:dev

# Start with custom configuration
WORKER_TICK_MS=10000 npm run worker:start
```

### Production with PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start worker with PM2
npm run worker:pm2:start

# Check worker status
npm run worker:pm2:status

# View worker logs
npm run worker:pm2:logs

# Restart worker
npm run worker:pm2:restart

# Stop worker
npm run worker:pm2:stop
```

### Using Shell Scripts

```bash
# Linux/macOS
./scripts/start-worker.sh
./scripts/stop-worker.sh
./scripts/restart-worker.sh
./scripts/worker-status.sh

# Windows
scripts\start-worker.bat
scripts\stop-worker.bat
```

## Process Management

### PM2 Configuration

The worker is configured in `ecosystem.config.js` with the following features:

- **Auto-restart**: Automatically restarts if the process crashes
- **Memory limits**: Restarts if memory usage exceeds 512MB
- **Restart delay**: 5-second delay between restarts
- **Max restarts**: Limits restart attempts to prevent infinite loops
- **Logging**: Separate log files for worker output and errors

### Graceful Shutdown

The worker handles shutdown signals gracefully:

- `SIGTERM`: Graceful shutdown (waits for current job to complete)
- `SIGINT`: Immediate shutdown (Ctrl+C)
- Uncaught exceptions and unhandled rejections are logged and cause process exit

## Monitoring

### Log Files

When using PM2, logs are written to:

- `./logs/worker-out.log` - Standard output
- `./logs/worker-error.log` - Error output
- `./logs/worker-combined.log` - Combined output

### Health Checks

The worker provides status information:

```javascript
// Get worker status
const status = worker.getStatus()
console.log(status.isRunning) // true/false
console.log(status.config) // Current configuration
```

### Database Monitoring

Monitor job processing through the database:

```sql
-- Check pending jobs
SELECT COUNT(*) FROM jobs WHERE status = 'pending';

-- Check failed jobs
SELECT id, lastError, retryCount FROM jobs WHERE status = 'failed';

-- Check processing jobs
SELECT id, currentStep, updatedAt FROM jobs WHERE status = 'processing';
```

## Troubleshooting

### Common Issues

1. **Worker not processing jobs**
   - Check if worker process is running
   - Verify database connection
   - Check for errors in logs

2. **Jobs failing repeatedly**
   - Check job error messages in database
   - Verify required dependencies are installed
   - Check file system permissions

3. **High memory usage**
   - Reduce `WORKER_BATCH_SIZE`
   - Increase `WORKER_TICK_MS` to reduce frequency
   - Check for memory leaks in job processing logic

### Debug Mode

Enable debug logging by setting:

```bash
export DEBUG=worker:*
npm run worker:start
```

### Manual Job Processing

For debugging, you can process jobs manually:

```javascript
import { JobWorker } from './src/workers/job-worker.js'

const worker = new JobWorker()
// Process specific job
await worker.processJob(jobData)
```

## Scaling

### Multiple Workers

You can run multiple worker instances:

```bash
# Start multiple instances with PM2
pm2 start ecosystem.config.js --only novel2manga-worker -i 2
```

### Load Balancing

- Each worker processes jobs independently
- Database-level locking prevents job conflicts
- Consider using different `WORKER_TICK_MS` values to stagger processing

## Security

### Process Isolation

- Worker runs as separate process from web application
- Uses same authentication and authorization as main app
- Database access is read/write only for job-related tables

### Error Handling

- All errors are logged but don't crash the worker
- Failed jobs are marked appropriately in database
- Notification failures don't affect job processing
