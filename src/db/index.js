/**
 * EDTTI UMS — V2 Drizzle DB client.
 *
 * - postgres-js driver (no prepare, suits Neon's PgBouncer)
 * - Single shared pool (max 20) per Node process
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

const client = postgres(connectionString, { max: 20, prepare: false });
const db = drizzle(client, { schema });

module.exports = { db, client, schema };
