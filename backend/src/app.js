'use strict';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const productsRouter = require('./routes/products');

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// Allow cross-origin requests from the frontend dev server (localhost:5173)
// and any deployed frontend URL.
app.use(cors());

// Parse incoming JSON request bodies.
app.use(express.json());

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

app.use('/api/products', productsRouter);

// Health-check — used by Render, load balancers, and readiness probes.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 for unknown API routes
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Unhandled error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT, 10) || 3000;

app.listen(PORT, () => {
  console.log(`[backend] Server listening on http://localhost:${PORT}`);
});

module.exports = app;
