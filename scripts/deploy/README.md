# Deployment Guide

This directory contains scripts and configurations for deploying the Novel2Manga application to production.

## Prerequisites

- Node.js 20+
- PM2 (for process management)
- Docker and Docker Compose (for containerized deployment)
- SQLite3

## Environment Setup

1. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

2. Configure the required environment variables in `.env`:
   - `NEXTAUTH_URL`: Your production domain URL
   - `NEXTAUTH_SECRET`: A secure random string for NextAuth
   - `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`: Google OAuth credentials
   - `SMTP_*`: Email service configuration
   - Other variables as needed

## Deployment Methods

### Method 1: PM2 Process Management (Recommended)

1. Run the production setup script:

   ```bash
   # Linux/macOS
   ./scripts/deploy/production-setup.sh

   # Windows
   ./scripts/deploy/production-setup.ps1
   ```

2. Start the application:

   ```bash
   pm2 start ecosystem.config.js --env production
   ```

3. Monitor the application:

   ```bash
   pm2 status
   pm2 logs
   ```

4. Run health checks:
   ```bash
   ./scripts/deploy/health-check.sh
   ```

### Method 2: Docker Deployment

1. Build and start the production containers:

   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

2. Check container status:

   ```bash
   docker-compose -f docker-compose.prod.yml ps
   ```

3. View logs:
   ```bash
   docker-compose -f docker-compose.prod.yml logs -f
   ```

## Database Management

### Manual Migration

Run database migrations manually:

```bash
# Linux/macOS
./scripts/deploy/migrate.sh

# Windows
./scripts/deploy/migrate.ps1
```

### Backup and Restore

The migration script automatically creates backups before running migrations. Manual backups can be created:

```bash
# Create backup
cp database/novel2manga.db database/novel2manga.db.backup.$(date +%Y%m%d_%H%M%S)

# Restore from backup
cp database/novel2manga.db.backup.YYYYMMDD_HHMMSS database/novel2manga.db
```

## Monitoring and Maintenance

### Health Checks

The application includes several health check endpoints:

- `GET /api/health` - Basic application health
- `GET /api/auth/session` - Authentication service health

### Log Management

Logs are stored in the `logs/` directory:

- `web-*.log` - Web application logs
- `worker-*.log` - Background worker logs

Rotate logs regularly to prevent disk space issues:

```bash
# Using logrotate (Linux)
sudo logrotate -f /etc/logrotate.d/novel2manga

# Manual cleanup (keep last 30 days)
find logs/ -name "*.log" -mtime +30 -delete
```

### Performance Monitoring

Monitor key metrics:

- CPU and memory usage: `pm2 monit`
- Database size: `du -h database/`
- Storage usage: `du -h storage/ .local-storage/`
- Response times: Check application logs

## Security Considerations

### Environment Variables

- Never commit `.env` files to version control
- Use strong, unique secrets for `NEXTAUTH_SECRET` and `CSRF_SECRET`
- Regularly rotate OAuth credentials
- Use app-specific passwords for email services

### File Permissions

Ensure proper file permissions:

```bash
chmod 600 .env                    # Environment file
chmod 755 database/              # Database directory
chmod 755 logs/                  # Log directory
chmod -R 755 .local-storage/     # Storage directories
```

### Network Security

- Use HTTPS in production (configure reverse proxy)
- Implement rate limiting at the reverse proxy level
- Configure firewall rules to restrict access
- Use secure headers (configured in Next.js)

## Troubleshooting

### Common Issues

1. **Database connection errors**
   - Check database file permissions
   - Verify `DATABASE_URL` environment variable
   - Run database migration script

2. **Authentication failures**
   - Verify Google OAuth credentials
   - Check `NEXTAUTH_URL` matches your domain
   - Ensure `NEXTAUTH_SECRET` is set

3. **Email notification failures**
   - Test SMTP configuration
   - Check email service credentials
   - Verify firewall allows SMTP connections

4. **Worker process issues**
   - Check worker logs: `pm2 logs novel2manga-worker`
   - Verify database connectivity
   - Check available disk space

### Debug Mode

Enable debug logging:

```bash
# Set environment variables
export WORKER_LOG_LEVEL=debug
export EMAIL_DEBUG=true

# Restart services
pm2 restart all
```

## Rollback Procedure

If deployment fails:

1. Stop the application:

   ```bash
   pm2 stop all
   ```

2. Restore database from backup:

   ```bash
   cp database/novel2manga.db.backup.LATEST database/novel2manga.db
   ```

3. Revert to previous code version:

   ```bash
   git checkout PREVIOUS_TAG
   npm ci
   npm run build
   ```

4. Restart application:
   ```bash
   pm2 start ecosystem.config.js --env production
   ```

## Support

For deployment issues:

1. Check the logs: `pm2 logs`
2. Run health checks: `./scripts/deploy/health-check.sh`
3. Review this documentation
4. Check the main project README for additional troubleshooting steps
