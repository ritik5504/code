/**
 * App.jsx — Nexus Store Product Browser
 *
 * Single-file React SPA that connects to the Express + PostgreSQL backend.
 * Features:
 *  - Cursor-based (keyset) pagination — no duplicate / skipped products
 *  - Category chip filtering
 *  - Debounced client-side name search
 *  - Product detail modal (fetches GET /api/products/:id)
 *  - Skeleton loaders, toast notifications, back-to-top button
 *  - ⌘K shortcut to focus search
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/* ═══════════════════════════════════════════════════════════════
   Constants
═══════════════════════════════════════════════════════════════ */

const API = '/api';

const CATEGORIES = [
  { label: 'All Products', value: '' },
  { label: '⚡ Electronics', value: 'Electronics' },
  { label: '👕 Clothing', value: 'Clothing' },
  { label: '📚 Books', value: 'Books' },
  { label: '🌿 Home & Garden', value: 'Home & Garden' },
  { label: '🏅 Sports', value: 'Sports' },
  { label: '🎮 Toys', value: 'Toys' },
  { label: '🍎 Food', value: 'Food' },
  { label: '✨ Beauty', value: 'Beauty' },
];

const CAT_CLASS = {
  Electronics:   'cat-electronics',
  Clothing:      'cat-clothing',
  Books:         'cat-books',
  'Home & Garden': 'cat-home',
  Sports:        'cat-sports',
  Toys:          'cat-toys',
  Food:          'cat-food',
  Beauty:        'cat-beauty',
};

const CAT_EMOJI = {
  Electronics:   '⚡',
  Clothing:      '👕',
  Books:         '📚',
  'Home & Garden': '🌿',
  Sports:        '🏅',
  Toys:          '🎮',
  Food:          '🍎',
  Beauty:        '✨',
};

/* ═══════════════════════════════════════════════════════════════
   Utility helpers
═══════════════════════════════════════════════════════════════ */

function fmtPrice(p) {
  return '$' + parseFloat(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/* ═══════════════════════════════════════════════════════════════
   API layer
═══════════════════════════════════════════════════════════════ */

async function apiFetch(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchProducts({ cursor, limit, category }) {
  const p = new URLSearchParams({ limit });
  if (cursor)   p.set('cursor', cursor);
  if (category) p.set('category', category);
  return apiFetch(`/products?${p}`);
}

async function fetchProduct(id) {
  return apiFetch(`/products/${id}`);
}

/* ═══════════════════════════════════════════════════════════════
   Small reusable components
═══════════════════════════════════════════════════════════════ */

/** Skeleton placeholder cards */
function SkeletonGrid({ count }) {
  return (
    <div className="skel-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skel-card">
          <div className="skel-line skel-badge" />
          <div className="skel-line skel-t1" />
          <div className="skel-line skel-t2" />
          <div className="skel-line skel-price" />
        </div>
      ))}
    </div>
  );
}

/** Individual product card */
function ProductCard({ product, onClick }) {
  const catClass = CAT_CLASS[product.category] ?? 'cat-default';
  const emoji    = CAT_EMOJI[product.category]  ?? '📦';
  return (
    <article
      className="card"
      onClick={() => onClick(product.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(product.id); } }}
      role="button"
      tabIndex={0}
      aria-label={`View ${product.name}`}
      style={{ animationDelay: `${Math.floor(Math.random() * 120)}ms` }}
    >
      <div className="card-header">
        <span className={`cat-badge ${catClass}`}>{emoji} {product.category}</span>
        <span className="card-id">#{product.id}</span>
      </div>
      <h3 className="card-name">{product.name}</h3>
      <div className="card-footer">
        <span className="card-price">{fmtPrice(product.price)}</span>
        <span className="card-date">{fmtDate(product.created_at)}</span>
      </div>
      <button className="card-arrow" aria-hidden tabIndex={-1}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M7 17L17 7M17 7H7M17 7v10"/>
        </svg>
      </button>
    </article>
  );
}

/** Product detail modal */
function ProductModal({ productId, onClose, showToast }) {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [wishlisted, setWishlisted] = useState(false);

  useEffect(() => {
    if (!productId) return;
    setLoading(true); setError(null); setProduct(null);
    fetchProduct(productId)
      .then(({ data }) => setProduct(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [productId]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent background scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const catClass = product ? (CAT_CLASS[product.category] ?? 'cat-default') : '';
  const emoji    = product ? (CAT_EMOJI[product.category]  ?? '📦') : '';

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" role="dialog" aria-modal aria-labelledby="modal-title">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>

        {loading && (
          <div className="modal-loading">
            <div className="modal-spinner" />
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <p style={{ color: 'var(--text-secondary)' }}>Could not load product: {error}</p>
          </div>
        )}

        {product && (
          <>
            <div className="modal-cat">
              <span className={`cat-badge ${catClass}`}>{emoji} {product.category}</span>
            </div>
            <h2 className="modal-name" id="modal-title">{product.name}</h2>
            <div className="modal-price-row">
              <span className="modal-price">{fmtPrice(product.price)}</span>
              <span className="modal-price-lbl">USD</span>
            </div>
            <div className="modal-meta">
              <div>
                <div className="meta-label">Product ID</div>
                <div className="meta-val">#{product.id}</div>
              </div>
              <div>
                <div className="meta-label">Category</div>
                <div className="meta-val">{product.category}</div>
              </div>
              <div>
                <div className="meta-label">Listed</div>
                <div className="meta-val">{fmtDateTime(product.created_at)}</div>
              </div>
              <div>
                <div className="meta-label">Updated</div>
                <div className="meta-val">{fmtDateTime(product.updated_at)}</div>
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="btn-primary"
                onClick={() => showToast(`"${product.name.slice(0, 28)}…" added to cart 🛒`, 'success')}
              >
                Add to Cart
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setWishlisted((w) => !w);
                  showToast(wishlisted ? 'Removed from wishlist' : 'Saved to wishlist ✨', 'success');
                }}
              >
                {wishlisted ? '♥ Wishlisted' : '♡ Wishlist'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Toast notification item */
function Toast({ id, message, type, onRemove }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 3200);
    const t2 = setTimeout(() => onRemove(id), 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [id, onRemove]);

  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const colors = { success: 'var(--accent-green)', error: '#f87171', info: 'var(--accent-1)' };

  return (
    <div className={`toast ${type} ${leaving ? 'leaving' : ''}`}>
      <span style={{ color: colors[type], fontWeight: 700 }}>{icons[type]}</span>
      <span>{message}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main App
═══════════════════════════════════════════════════════════════ */

export default function App() {
  // ── Pagination state ──
  const [products, setProducts]   = useState([]);
  const [cursor,   setCursor]     = useState(null);
  const [hasMore,  setHasMore]    = useState(false);
  const [loading,  setLoading]    = useState(false);
  const [initLoad, setInitLoad]   = useState(true);  // true = first-page skeleton
  const [error,    setError]      = useState(null);

  // ── Filter state ──
  const [category, setCategory]   = useState('');
  const [limit,    setLimit]      = useState(24);
  const [search,   setSearch]     = useState('');

  // ── UI state ──
  const [modalId,  setModalId]    = useState(null);
  const [toasts,   setToasts]     = useState([]);
  const [scrolled, setScrolled]   = useState(false);
  const [showBtt,  setShowBtt]    = useState(false);

  const searchRef   = useRef(null);
  const searchTimer = useRef(null);
  const toastId     = useRef(0);

  /* ── Toast helper ── */
  const showToast = useCallback((message, type = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  /* ── Core fetch ─────────────────────────────────────────────
     Fetches one page and appends to `products`.
     `reset` = true clears the list and starts from page 1.
  ─────────────────────────────────────────────────────────── */
  const loadPage = useCallback(async ({ reset = false, cat, lim, q } = {}) => {
    if (loading) return;
    setLoading(true);
    if (reset) setInitLoad(true);
    setError(null);

    const activeCat    = cat  ?? category;
    const activeLimit  = lim  ?? limit;
    const activeSearch = q    ?? search;
    const activeCursor = reset ? null : cursor;

    try {
      const data = await fetchProducts({
        cursor:   activeCursor,
        limit:    activeLimit,
        category: activeCat,
      });

      // Optional client-side text filter (layered on top of category filter)
      let rows = data.data;
      if (activeSearch) {
        const ql = activeSearch.toLowerCase();
        rows = rows.filter((p) => p.name.toLowerCase().includes(ql));
      }

      setProducts((prev) => reset ? rows : [...prev, ...rows]);
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err.message);
      showToast(`Failed to load products: ${err.message}`, 'error');
    } finally {
      setLoading(false);
      setInitLoad(false);
    }
  }, [loading, cursor, category, limit, search, showToast]);

  /* ── Initial load ── */
  useEffect(() => {
    loadPage({ reset: true, cat: '', lim: 24, q: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Scroll listener ── */
  useEffect(() => {
    const handler = () => {
      setScrolled(window.scrollY > 10);
      setShowBtt(window.scrollY > 400);
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  /* ── ⌘K shortcut ── */
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* ── Category change ── */
  const handleCategoryChange = (cat) => {
    setCategory(cat);
    setProducts([]);
    loadPage({ reset: true, cat, lim: limit, q: search });
  };

  /* ── Limit change ── */
  const handleLimitChange = (e) => {
    const lim = parseInt(e.target.value, 10);
    setLimit(lim);
    setProducts([]);
    loadPage({ reset: true, cat: category, lim, q: search });
  };

  /* ── Debounced search ── */
  const handleSearchChange = (e) => {
    const q = e.target.value;
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(q);
      loadPage({ reset: true, cat: category, lim: limit, q });
    }, 350);
  };

  /* ── Clear all filters ── */
  const clearFilters = () => {
    setCategory('');
    setSearch('');
    if (searchRef.current) searchRef.current.value = '';
    loadPage({ reset: true, cat: '', lim: limit, q: '' });
  };

  /* ── Derived state ── */
  const isEmpty = !initLoad && !loading && products.length === 0;

  /* ── Render ── */
  return (
    <>
      {/* ── Navbar ── */}
      <header className={`navbar${scrolled ? ' scrolled' : ''}`}>
        <div className="navbar-inner">
          <a href="/" className="logo">
            <span className="logo-icon">⬡</span>
            <span className="logo-text">Nexus<span className="logo-accent">Store</span></span>
          </a>

          <div className="search-wrap">
            <span className="search-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </span>
            <input
              ref={searchRef}
              id="search-input"
              type="text"
              className="search-input"
              placeholder="Search products…"
              autoComplete="off"
              aria-label="Search products"
              onChange={handleSearchChange}
            />
            <kbd className="search-kbd">⌘K</kbd>
          </div>

          <div className="count-badge">
            <span className="badge-dot" />
            <span>200,000+ products</span>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="hero-content">
          <div className="hero-tag">200,000+ Products</div>
          <h1 className="hero-title">Discover Everything</h1>
          <p className="hero-sub">
            Browse our full catalog with instant filtering and seamless pagination —
            no duplicates, no skips, even as new products arrive.
          </p>
        </div>
      </section>

      {/* ── Filter Bar ── */}
      <nav className="filter-bar" aria-label="Category filters">
        <div className="chips">
          {CATEGORIES.map(({ label, value }) => (
            <button
              key={value}
              id={`chip-${value || 'all'}`}
              className={`chip${category === value ? ' active' : ''}`}
              onClick={() => handleCategoryChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          id="limit-select"
          className="limit-select"
          value={limit}
          onChange={handleLimitChange}
          aria-label="Items per page"
        >
          <option value={12}>12 / page</option>
          <option value={24}>24 / page</option>
          <option value={48}>48 / page</option>
          <option value={96}>96 / page</option>
        </select>
      </nav>

      {/* ── Main content ── */}
      <main style={{ paddingBottom: 80 }}>
        <div className="grid-wrap">

          {/* Error banner */}
          {error && !initLoad && (
            <div className="error-banner" role="alert">
              <span>⚠️</span> {error}
            </div>
          )}

          {/* First-load skeleton */}
          {initLoad && <SkeletonGrid count={limit} />}

          {/* Empty state */}
          {isEmpty && (
            <div className="empty">
              <div className="empty-icon">🔍</div>
              <h3>No products found</h3>
              <p>Try a different category or clear your search.</p>
              <button className="btn-clear" onClick={clearFilters}>Clear filters</button>
            </div>
          )}

          {/* Product grid */}
          {!initLoad && products.length > 0 && (
            <div
              className="product-grid"
              aria-live="polite"
              aria-label="Product listing"
            >
              {products.map((p) => (
                <ProductCard key={p.id} product={p} onClick={setModalId} />
              ))}
            </div>
          )}
        </div>

        {/* ── Pagination zone ── */}
        <div className="pag-zone">
          {products.length > 0 && (
            <p className="loaded-info">
              Showing {products.length.toLocaleString()} product{products.length !== 1 ? 's' : ''}
            </p>
          )}

          {hasMore && (
            <button
              id="btn-load-more"
              className="btn-load"
              onClick={() => loadPage()}
              disabled={loading}
            >
              {loading ? (
                <span className="spinner" />
              ) : (
                <>
                  <span className="btn-txt">Load More Products</span>
                  <span className="btn-arr">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 5v14M5 12l7 7 7-7"/>
                    </svg>
                  </span>
                </>
              )}
            </button>
          )}

          {!hasMore && !initLoad && products.length > 0 && (
            <p className="end-msg">
              <span>✦</span> You&apos;ve seen all products <span>✦</span>
            </p>
          )}
        </div>
      </main>

      {/* ── Product Modal ── */}
      {modalId && (
        <ProductModal
          productId={modalId}
          onClose={() => setModalId(null)}
          showToast={showToast}
        />
      )}

      {/* ── Toasts ── */}
      <div className="toast-wrap" aria-live="assertive">
        {toasts.map((t) => (
          <Toast key={t.id} {...t} onRemove={removeToast} />
        ))}
      </div>

      {/* ── Back to top ── */}
      {showBtt && (
        <button
          className="btt"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 19V5M5 12l7-7 7 7"/>
          </svg>
        </button>
      )}
    </>
  );
}
