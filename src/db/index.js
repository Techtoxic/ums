/**
 * EDTTI UMS — V2 Drizzle DB client.
 *
 * - postgres-js driver (no prepare, suits Neon's PgBouncer)
 * - Single shared pool per Node process (size env-tunable via DB_POOL_MAX, default 20)
 * - Validated env vars come from src/config/env.js
 */
const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');
const schema = require('../../drizzle/schema.js');

// env.js validates DATABASE_URL with Zod and exits if missing — so by the time
// this module loads, process.env.DATABASE_URL is guaranteed to be a Postgres URL.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error('DATABASE_URL is required (was env.js loaded before this module?)');
}

// Pool sizing is env-tunable so a single VPS Postgres can stay within its
// max_connections budget when pm2 runs the app in cluster mode. Each Node
// worker opens its own pool of `DB_POOL_MAX` connections, so keep
//   (pm2 instances) * DB_POOL_MAX  +  headroom  <  postgres max_connections.
// Defaults (max 20) match the Neon pooled setup. idle/connect timeouts keep
// the pool from holding dead sockets and fail fast on a stalled DB.
const POOL_MAX = Math.max(1, Number(process.env.DB_POOL_MAX) || 20);
const IDLE_TIMEOUT = Math.max(0, Number(process.env.DB_IDLE_TIMEOUT) || 20); // seconds
const CONNECT_TIMEOUT = Math.max(1, Number(process.env.DB_CONNECT_TIMEOUT) || 15); // seconds

const client = postgres(connectionString, {
    max: POOL_MAX,
    prepare: false,           // suits Neon's PgBouncer (transaction pooling)
    idle_timeout: IDLE_TIMEOUT,
    connect_timeout: CONNECT_TIMEOUT,
});
const db = drizzle(client, { schema });

module.exports = { db, client, schema };
