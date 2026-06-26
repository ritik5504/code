# CodeVector Products API

A REST API for browsing ~200,000 products with **cursor-based (keyset) pagination** — no duplicate or skipped items even if new products are inserted while a client is mid-browse.

## Architecture

| Concern | Decision |
|---|---|
| Pagination | Keyset / cursor-based on `(created_at DESC, id DESC)` |
| Cursor format | Opaque Base64-encoded JSON (client treats it as a string) |
| Seed strategy | PostgreSQL `COPY` via `pg-copy-streams` (no INSERT loop) |
| DB indexes | `(created_at DESC, id DESC)` + `(category, created_at DESC, id DESC)` |

---

## Project Structure

```
.
├── scripts/
│   └── seed.js           # Seeds 200,000 rows via COPY protocol
├── src/
│   ├── app.js            # Express entry point
│   ├── db.js             # pg connection pool
│   └── routes/
│       └── products.js   # GET /api/products, GET /api/products/:id
├── .env.example
├── .gitignore
└── package.json
```

---

## Setup

### 1. Prerequisites

- Node.js ≥ 18
- PostgreSQL running locally (or remote)

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env and set DATABASE_URL to your PostgreSQL connection string
```

`.env` variables:

| Variable | Example | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:password@localhost:5432/mydb` | Full PostgreSQL connection string |
| `PORT` | `3000` | HTTP port the server listens on |

### 4. Create the database (if it doesn't exist)

```bash
createdb codevector_products
```

### 5. Seed the database

```bash
npm run seed
```

This will:
- Create the `products` table + both indexes (idempotent)
- Stream 200,000 rows using PostgreSQL's `COPY` protocol

Expected output:
```
[seed] Connecting to database…
[seed] Running DDL…
[seed] Table and indexes ready.
[seed] Streaming 200,000 rows via COPY…
[seed] Done! Inserted 200,000 rows in 3.21s.
[seed] Total rows in table: 200,000
```

### 6. Start the server

```bash
# Development (auto-restart on file changes)
npm run dev

# Production
npm start
```

---

## API Reference

### `GET /api/products`

Browse products ordered by newest first, with optional category filter.

#### Query Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `cursor` | string | — | Opaque cursor from a previous response's `nextCursor` |
| `limit` | integer | `20` | Items per page (max: `100`) |
| `category` | string | — | Filter by category name (exact match) |

#### Available Categories

`Electronics`, `Clothing`, `Books`, `Home & Garden`, `Sports`, `Toys`, `Food`, `Beauty`

#### Response

```json
{
  "data": [
    {
      "id": "123456",
      "name": "Electronics Product 1",
      "category": "Electronics",
      "price": "299.99",
      "created_at": "2025-06-25T12:00:00.000Z",
      "updated_at": "2025-06-25T12:00:00.000Z"
    }
  ],
  "nextCursor": "eyJjcmVhdGVkX2F0IjoiMjAyNS0wNi0yNVQxMjowMDowMC4wMDBaIiwiaWQiOiIxMjM0NTYifQ==",
  "hasMore": true
}
```

When `hasMore` is `false`, `nextCursor` is `null`.

#### Examples

```bash
# First page (20 items, newest first)
curl "http://localhost:3000/api/products"

# Next page using cursor
curl "http://localhost:3000/api/products?cursor=<nextCursor>"

# Filter by category, custom page size
curl "http://localhost:3000/api/products?category=Electronics&limit=50"

# Paginate within a category
curl "http://localhost:3000/api/products?category=Books&limit=10&cursor=<nextCursor>"
```

---

### `GET /api/products/:id`

Fetch a single product by its numeric ID.

#### Response

```json
{
  "data": {
    "id": "123456",
    "name": "Electronics Product 1",
    "category": "Electronics",
    "price": "299.99",
    "created_at": "2025-06-25T12:00:00.000Z",
    "updated_at": "2025-06-25T12:00:00.000Z"
  }
}
```

Returns `404` if the product does not exist.

---

### `GET /health`

Health check endpoint.

```json
{ "status": "ok", "timestamp": "2025-06-25T12:00:00.000Z" }
```

---

## How Cursor Pagination Works

```
Page 1: WHERE true ORDER BY created_at DESC, id DESC LIMIT 21
         → returns rows 1-20, encodes row 20 as nextCursor

Page 2: WHERE (created_at < cursor.created_at
               OR (created_at = cursor.created_at AND id < cursor.id))
         ORDER BY created_at DESC, id DESC LIMIT 21
         → returns rows 21-40, encodes row 40 as nextCursor
```

**Key properties:**
- Fetches `limit + 1` rows — the extra row determines `hasMore` without a `COUNT(*)` query.
- Composite condition `(created_at, id) < (cursor_ts, cursor_id)` is stable: new inserts always appear *before* page 1 and never cause skips or duplicates mid-browse.
- Both indexes are leveraged for index-only scans — no sequential table scans.
