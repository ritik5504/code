'use strict';

require('dotenv').config();
const { Pool } = require('pg');

/**
 * A shared PostgreSQL connection pool used across the application.
 *
 * Configuration is driven entirely from the DATABASE_URL environment variable,
 * which keeps credentials out of source code and makes the app easy to
 * configure in different environments (local, staging, production).
 *
 * Pool settings:
 *   max         – maximum number of clients in the pool (default: 10)
 *   idleTimeoutMillis  – how long an idle client stays before being closed
 *   connectionTimeoutMillis – how long to wait when all clients are busy
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// Surface connection errors immediately so they aren't swallowed silently.
pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle client:', err.message);
});

module.exports = pool;
