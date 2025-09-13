/**
 * PM2 Configuration for Novel2Manga Application
 * Manages both the web application and background job worker
 */
module.exports = {
  apps: [
    {
      name: 'novel2manga-web',
      script: 'npm',
      args: 'start',
      cwd: './',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      error_file: './logs/web-error.log',
      out_file: './logs/web-out.log',
      log_file: './logs/web-combined.log',
      time: true,
      merge_logs: true,
    },
    {
      name: 'novel2manga-worker',
      script: './scripts/worker.js',
      cwd: './',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
        WORKER_TICK_MS: 5000,
        WORKER_MAX_RETRIES: 3,
        WORKER_ENABLE_NOTIFICATIONS: 'true',
        WORKER_BATCH_SIZE: 1,
        WORKER_TIMEOUT_MS: 300000,
        WORKER_LOG_LEVEL: 'info',
      },
      env_development: {
        NODE_ENV: 'development',
        WORKER_TICK_MS: 10000,
        WORKER_MAX_RETRIES: 2,
        WORKER_ENABLE_NOTIFICATIONS: 'true',
        WORKER_BATCH_SIZE: 1,
        WORKER_TIMEOUT_MS: 300000,
        WORKER_LOG_LEVEL: 'debug',
      },
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      log_file: './logs/worker-combined.log',
      time: true,
      merge_logs: true,
    },
  ],

  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-username/novel2manga.git',
      path: '/var/www/novel2manga',
      'pre-deploy-local': '',
      'post-deploy':
        'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
    },
  },
}
