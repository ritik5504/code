'use strict';

const express = require('express');
const pool = require('../db');

const router = express.Router();

// ---------------------------------------------------------------------------
// Cursor helpers
// ---------------------------------------------------------------------------

/**
 * Encodes a cursor object { created_at, id } into an opaque Base64 string.
 * Using Base64 keeps the cursor safe for URL query parameters and hides
 * internal implementation details from the client.
 *
 * @param {object} row – a product row from the DB (must have created_at & id)
 * @returns {string} Base64-encoded JSON string
 */
function encodeCursor(row) {
  const payload = JSON.stringify({
    created_at: row.created_at,
    id: String(row.id), // BigInt-safe: store as string
  });
  return Buffer.from(payload, 'utf8').toString('base64');
}

/**
 * Decodes a Base64 cursor string back into { created_at, id }.
 * Returns null if the cursor is missing, malformed, or missing required fields.
 *
 * @param {string|undefined} cursorStr
 * @returns {{ created_at: string, id: string } | null}
 */
function decodeCursor(cursorStr) {
  if (!cursorStr) return null;
  try {
    const json = Buffer.from(cursorStr, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    if (!parsed.created_at || !parsed.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GET /api/products
//
// Query parameters:
//   cursor   – opaque Base64 cursor from a previous response (optional)
//   limit    – number of results to return (default: 20, max: 100)
//   category – filter by exact category name (optional)
//
// Response: { data: Product[], nextCursor: string|null, hasMore: boolean }
//
// Pagination strategy: keyset / cursor-based pagination on
//   (created_at DESC, id DESC)
// This guarantees stable pages even if new rows are inserted between requests.
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    // --- Parse & validate query parameters ---
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, 100)
      : 20;

    const { category } = req.query;
    const cursor = decodeCursor(req.query.cursor);

    // We fetch one extra row beyond the requested limit so we can tell the
    // client whether another page exists without a separate COUNT query.
    const fetchLimit = limit + 1;

    // --- Build keyset WHERE clause ---
    // The composite keyset (created_at DESC, id DESC) means "give me rows
    // that come strictly after the cursor position in the sort order":
    //
    //   (created_at, id) < (cursor.created_at, cursor.id)
    //   ≡ created_at < cursor.created_at
    //      OR (created_at = cursor.created_at AND id < cursor.id)
    //
    // This is safe from duplicate / skipped rows regardless of concurrent inserts.

    const params = [];
    const conditions = [];

    if (cursor) {
      params.push(cursor.created_at, cursor.id);
      conditions.push(
        `(created_at < $${params.length - 1} OR (created_at = $${params.length - 1} AND id < $${params.length}))`
      );
    }

    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    params.push(fetchLimit);
    const limitParam = `$${params.length}`;

    const sql = `
      SELECT
        id,
        name,
        category,
        price,
        created_at,
        updated_at
      FROM products
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limitParam}
    `;

    const { rows } = await pool.query(sql, params);

    // Determine whether there is a next page
    const hasMore = rows.length === fetchLimit;
    const data = hasMore ? rows.slice(0, limit) : rows;

    // The cursor for the next page is derived from the LAST item in `data`
    // (i.e. the oldest item in this batch).
    const nextCursor = hasMore ? encodeCursor(data[data.length - 1]) : null;

    return res.json({ data, nextCursor, hasMore });
  } catch (err) {
    console.error('[GET /api/products]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/products/:id
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const { rows } = await pool.query(
      `SELECT id, name, category, price, created_at, updated_at
       FROM products
       WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.json({ data: rows[0] });
  } catch (err) {
    console.error('[GET /api/products/:id]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
