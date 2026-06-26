'use strict';

/**
 * Seed script – inserts 200,000 product rows using PostgreSQL's COPY protocol
 * via the pg-copy-streams library.
 *
 * Why COPY instead of INSERT loops?
 * ──────────────────────────────────
 * PostgreSQL's COPY command streams data directly into the table storage
 * engine, bypassing per-row planning overhead.  For 200 k rows this is
 * typically 10–30× faster than batched INSERTs and avoids out-of-memory
 * issues that come with building a single enormous SQL string.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/seed.js
 *
 * The script is idempotent in the sense that it creates the table and indexes
 * only if they don't already exist, and always inserts a fresh 200 k rows.
 */

require('dotenv').config();

const { Client } = require('pg');
const { pipeline } = require('stream/promises');
const { from: copyFrom } = require('pg-copy-streams');
const { Readable } = require('stream');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TOTAL_ROWS = 200_000;

const CATEGORIES = [
  'Electronics',
  'Clothing',
  'Books',
  'Home & Garden',
  'Sports',
  'Toys',
  'Food',
  'Beauty',
];

// ---------------------------------------------------------------------------
// DDL – table + indexes
// ---------------------------------------------------------------------------

const DDL = `
  -- Products table
  CREATE TABLE IF NOT EXISTS products (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT          NOT NULL,
    category   TEXT          NOT NULL,
    price      NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  );

  -- Index used by the paginator when browsing ALL products (no category filter)
  CREATE INDEX IF NOT EXISTS idx_products_created_at_id
    ON products (created_at DESC, id DESC);

  -- Index used by the paginator when filtering by category
  CREATE INDEX IF NOT EXISTS idx_products_category_created_at_id
    ON products (category, created_at DESC, id DESC);
`;

// ---------------------------------------------------------------------------
// CSV row generator
//
// We produce a Readable stream in object mode, then encode each row as a
// tab-separated line suitable for COPY FROM STDIN.
//
// Columns streamed (in order): name, category, price, created_at, updated_at
// (id is omitted – BIGSERIAL fills it automatically)
//
// created_at is spread over the past ~2 years with 1-second granularity so
// that pagination ordering is realistic and ties are rare.
// ---------------------------------------------------------------------------

/**
 * Creates a Readable stream that yields COPY-compatible TSV lines.
 * Each call to the generator produces one line (no newline on the very last
 * line – pg-copy-streams handles framing internally).
 */
function createSeedStream(totalRows) {
  const nowMs = Date.now();
  // Spread rows over the past 2 years (in milliseconds)
  const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1_000;

  let index = 0;

  return new Readable({
    read() {
      // Push rows in chunks to avoid blocking the event loop
      while (index < totalRows) {
        const i = index++;

        const category = CATEGORIES[i % CATEGORIES.length];
        const name = `${category} Product ${i + 1}`;
        // Price between 1.00 and 9999.99
        const price = (1 + Math.random() * 9998.99).toFixed(2);
        // Deterministic but spread-out timestamp
        const createdAtMs = nowMs - Math.floor((i / totalRows) * twoYearsMs);
        const createdAt = new Date(createdAtMs).toISOString();
        // updated_at equals created_at for seed data
        const updatedAt = createdAt;

        // Tab-separated values; escape any tabs/newlines in text fields
        // (none expected here, but good practice)
        const line = [
          name.replace(/[\t\n\\]/g, ' '),
          category.replace(/[\t\n\\]/g, ' '),
          price,
          createdAt,
          updatedAt,
        ].join('\t') + '\n';

        const canContinue = this.push(line);
        if (!canContinue) return; // respect back-pressure
      }

      // Signal end of stream
      this.push(null);
    },
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  console.log('[seed] Connecting to database…');
  await client.connect();

  try {
    // 1. Create table and indexes
    console.log('[seed] Running DDL…');
    await client.query(DDL);
    console.log('[seed] Table and indexes ready.');

    // 2. Stream 200 k rows via COPY
    console.log(`[seed] Streaming ${TOTAL_ROWS.toLocaleString()} rows via COPY…`);
    const startMs = Date.now();

    const copyStream = client.query(
      copyFrom(
        'COPY products (name, category, price, created_at, updated_at) FROM STDIN WITH (FORMAT text, DELIMITER E\'\\t\')'
      )
    );

    const seedStream = createSeedStream(TOTAL_ROWS);

    // pipeline() propagates errors and automatically destroys streams on failure
    await pipeline(seedStream, copyStream);

    const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(2);
    console.log(`[seed] Done! Inserted ${TOTAL_ROWS.toLocaleString()} rows in ${elapsedSec}s.`);

    // 3. Quick sanity check
    const { rows } = await client.query('SELECT COUNT(*) AS total FROM products');
    console.log(`[seed] Total rows in table: ${parseInt(rows[0].total, 10).toLocaleString()}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[seed] Fatal error:', err.message);
  process.exit(1);
});
