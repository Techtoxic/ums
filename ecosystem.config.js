// ============================================================================
// pm2 process definition for EDTTI UMS (production).
//
// Zero-downtime deploys:
//     pm2 reload ecosystem.config.js --env production
//
// The app is STATELESS (auth is a JWT in an httpOnly cookie; there is no
// in-memory session store), so it is safe to run several workers in `cluster`
// mode behind pm2's load balancer. server.js implements graceful shutdown
// (SIGTERM drain + DB pool close) and signals `ready` once it is listening, so
// `wait_ready` gives a true rolling reload with no dropped requests.
//
// CONNECTION-BUDGET NOTE (important when self-hosting Postgres):
//   each worker opens its own pool of DB_POOL_MAX connections, so keep
//       instances * DB_POOL_MAX  +  headroom  <  postgres max_connections
//   e.g. 2 instances * 20 = 40 connections (default Postgres allows 100).
//   On Neon (PgBouncer pooled) the pooled endpoint handles this for you.
//
// Tunables (override in the shell or a pm2 env): PM2_INSTANCES, DB_POOL_MAX.
// ============================================================================
module.exports = {
  apps: [
    {
      name: 'ums',
      script: 'server.js',
      // Workers across CPU cores. Default 2 keeps the Postgres connection
      // budget modest; set PM2_INSTANCES=max (or a number) for bigger boxes.
      instances: process.env.PM2_INSTANCES || 2,
      exec_mode: 'cluster',

      // Rolling reload: wait for the app to emit `ready` before swapping.
      wait_ready: true,
      listen_timeout: 10000,
      // Must exceed server.js's 10s graceful-shutdown force-exit timer so
      // in-flight requests can finish before pm2 SIGKILLs the worker.
      kill_timeout: 12000,

      // Restart the worker if it leaks past this (single-instance VPS safety).
      max_memory_restart: '512M',

      // Crash-loop guard.
      min_uptime: '20s',
      max_restarts: 10,
      restart_delay: 2000,

      // Logs (pm2 timestamps each line).
      time: true,
      merge_logs: true,

      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
