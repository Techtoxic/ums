// services/bookSearch.js — dual open-library book search for the Book Resource
// module. Queries OpenStax (academic textbooks) and Gutendex/Project Gutenberg
// (classic literature) in parallel, normalizes both to one flat shape,
// deduplicates by title (preferring the richer OpenStax record), and sorts.
//
// Resilience: a failure of one provider never kills the search — the other's
// results are still returned with `partial: true`. Node 18+ global fetch.

const OPENSTAX_URL = 'https://openstax.org/apps/cms/api/v2/pages/';
const GUTENDEX_URL = 'https://gutendex.com/books/';
// Gutendex can be slow from some networks; cap the wait so a search never hangs.
// If a provider exceeds this it's dropped and the response is flagged `partial`.
const FETCH_TIMEOUT_MS = 12000;
const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

// fetch with a hard timeout so a hung provider can't stall the whole request.
async function fetchJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: 'application/json', 'User-Agent': 'EDTTI-UMS/1.0' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

function stripHtml(s) {
    return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncate(s, n) {
    const t = stripHtml(s);
    if (!t) return null;
    return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}

function slugify(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

// Normalized title key used for dedup + relevance.
function titleKey(title) {
    return String(title || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

function tokens(s) {
    return titleKey(s).split(' ').filter(Boolean);
}

// Jaccard token overlap — catches near-duplicate titles across providers.
function tokenOverlap(a, b) {
    const A = new Set(tokens(a));
    const B = new Set(tokens(b));
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach((t) => { if (B.has(t)) inter += 1; });
    return inter / (A.size + B.size - inter);
}

// ---------------------------------------------------------------------------
// Provider fetchers
// ---------------------------------------------------------------------------

async function fetchOpenStax(query) {
    // The CMS listing only returns id/slug/title; rich fields (cover, authors,
    // description, PDFs) live on each book's detail page. So: list, then enrich
    // each result via its detail endpoint in parallel (best-effort per item).
    const params = new URLSearchParams({ type: 'books.Book', format: 'json', limit: '40' });
    if (query) params.set('search', query);
    const data = await fetchJson(`${OPENSTAX_URL}?${params.toString()}`);
    const items = Array.isArray(data?.items) ? data.items : [];

    const enriched = await Promise.all(items.slice(0, 24).map(async (it) => {
        try {
            const detail = await fetchJson(`${OPENSTAX_URL}${it.id}/?format=json`);
            return { ...it, ...detail, meta: { ...(it.meta || {}), ...(detail.meta || {}) } };
        } catch {
            return it; // detail failed — keep list-only fields, still usable
        }
    }));
    return enriched;
}

async function fetchGutendex(query, language) {
    const params = new URLSearchParams({ mime_type: 'application/pdf' });
    if (query) params.set('search', query);
    if (language && language !== 'all') params.set('languages', language);
    const data = await fetchJson(`${GUTENDEX_URL}?${params.toString()}`);
    return Array.isArray(data?.results) ? data.results : [];
}

// ---------------------------------------------------------------------------
// Normalizers — map each provider to the unified shape
// ---------------------------------------------------------------------------

// Extract a 4-digit year from a date-ish string.
function pickYear(d) {
    const s = d.publish_date || d.created || d.meta?.first_published_at || '';
    const m = String(s).match(/(\d{4})/);
    return m ? parseInt(m[1], 10) : null;
}

// OpenStax subjects appear as book_subjects/book_categories — strings or
// {name}/{subject}/{value:{...}} objects depending on the field.
function openStaxSubject(d) {
    const cand = d.book_subjects || d.book_categories;
    if (Array.isArray(cand) && cand.length) {
        const f = cand[0];
        if (typeof f === 'string') return f;
        return f.subject || f.name || f.value?.subject || f.value?.name || null;
    }
    return null;
}

function normalizeOpenStax(book) {
    const meta = book.meta || {};
    const slug = meta.slug || book.slug || slugify(book.title);
    const authors = Array.isArray(book.authors)
        ? book.authors
            .map((a) => (typeof a === 'string' ? a : a?.value?.name || a?.name))
            .filter(Boolean)
        : [];
    return {
        external_id: String(book.id),
        source: 'openstax',
        title: book.title || 'Untitled',
        authors,
        cover_url: book.cover_url || book.title_image_url || null,
        description: truncate(book.description, 300),
        subject: openStaxSubject(book),
        pdf_url:
            book.high_resolution_pdf_url ||
            book.low_resolution_pdf_url ||
            (slug ? `https://assets.openstax.org/oscms-prodcms/media/documents/${slug}-WEB.pdf` : null),
        preview_url:
            book.webview_rex_link ||
            book.webview_link ||
            meta.html_url ||
            (slug ? `https://openstax.org/books/${slug}/pages/1-introduction` : null),
        language: 'en',
        year: pickYear(book),
    };
}

function normalizeGutendex(book) {
    const formats = book.formats || {};
    const pdfUrl = formats['application/pdf'] || null;
    const htmlUrl =
        formats['text/html'] || formats['text/html; charset=utf-8'] || null;
    const cover =
        formats['image/jpeg'] || formats['image/jpeg; charset=utf-8'] || null;
    return {
        external_id: String(book.id),
        source: 'gutendex',
        title: book.title || 'Untitled',
        authors: Array.isArray(book.authors) ? book.authors.map((a) => a.name).filter(Boolean) : [],
        cover_url: cover,
        description: truncate(Array.isArray(book.subjects) ? book.subjects.join(', ') : null, 300),
        subject: book.bookshelves?.[0] || book.subjects?.[0] || null,
        pdf_url: pdfUrl,
        preview_url: htmlUrl || pdfUrl,
        language: book.languages?.[0] || 'en',
        year: book.copyright_year || null,
    };
}

// ---------------------------------------------------------------------------
// Dedup + sort
// ---------------------------------------------------------------------------

// Keep the first occurrence of each title. Because OpenStax records are placed
// first, the OpenStax (richer) version wins on a collision. Also drops near-dupes
// with >85% token overlap against an already-kept title.
function deduplicate(books) {
    const seenKeys = new Set();
    const kept = [];
    for (const book of books) {
        const key = titleKey(book.title);
        if (!key) continue;
        if (seenKeys.has(key)) continue;
        const near = kept.some((k) => tokenOverlap(k.title, book.title) > 0.85);
        if (near) continue;
        seenKeys.add(key);
        kept.push(book);
    }
    return kept;
}

// relevance = how many query tokens appear in the title.
function relevanceScore(title, query) {
    if (!query) return 0;
    const qTokens = tokens(query);
    const tTokens = new Set(tokens(title));
    return qTokens.reduce((n, t) => n + (tTokens.has(t) ? 1 : 0), 0);
}

function sortBooks(books, query, subjectWant) {
    const subjMatch = (b) => (subjectWant && b.subject && b.subject.toLowerCase().includes(subjectWant) ? 1 : 0);
    return books.slice().sort((a, b) => {
        // Subject match first when a subject was selected (bias, not a filter)
        if (subjectWant) {
            const sA = subjMatch(a); const sB = subjMatch(b);
            if (sB !== sA) return sB - sA;
        }
        // OpenStax first (full PDFs, peer-reviewed)
        if (a.source !== b.source) return a.source === 'openstax' ? -1 : 1;
        const relA = relevanceScore(a.title, query);
        const relB = relevanceScore(b.title, query);
        if (relB !== relA) return relB - relA;
        return (b.year || 0) - (a.year || 0);
    });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search both providers and return a unified, deduplicated, sorted, paginated
 * result set. Never throws on provider failure.
 *
 * filters: { subject, language, source ('all'|'openstax'|'gutendex'),
 *            yearFrom, yearTo, page }
 * returns: { results, total, page, pageSize, totalPages, partial }
 */
async function searchBooks(query, filters = {}) {
    const source = (filters.source || 'all').toLowerCase();
    const language = (filters.language || 'all').toLowerCase();
    const page = Math.max(1, parseInt(filters.page, 10) || 1);

    const wantOpenStax = source === 'all' || source === 'openstax';
    const wantGutendex = source === 'all' || source === 'gutendex';
    // Gutendex is English/other-language literature; if a non-en/non-all
    // language is chosen, OpenStax (en only) can't contribute.
    const openStaxApplicable = wantOpenStax && (language === 'all' || language === 'en');

    const [osSettled, gxSettled] = await Promise.allSettled([
        openStaxApplicable ? fetchOpenStax(query) : Promise.resolve([]),
        wantGutendex ? fetchGutendex(query, language) : Promise.resolve([]),
    ]);

    let partial = false;
    let openstax = [];
    let gutendex = [];

    if (osSettled.status === 'fulfilled') {
        openstax = osSettled.value.map(normalizeOpenStax);
    } else if (openStaxApplicable) {
        partial = true;
        console.error('bookSearch: OpenStax failed:', osSettled.reason?.message || osSettled.reason);
    }
    if (gxSettled.status === 'fulfilled') {
        gutendex = gxSettled.value.map(normalizeGutendex);
    } else if (wantGutendex) {
        partial = true;
        console.error('bookSearch: Gutendex failed:', gxSettled.reason?.message || gxSettled.reason);
    }

    // OpenStax first so it wins dedup collisions.
    let merged = deduplicate([...openstax, ...gutendex]);

    // Subject metadata is sparse/inconsistent across both providers, so a hard
    // subject filter would wrongly drop most results. We instead let a subject
    // selection bias the sort: matching books float up, none are excluded.
    const subjectWant = filters.subject && filters.subject !== 'all'
        ? String(filters.subject).toLowerCase() : null;

    const yearFrom = parseInt(filters.yearFrom, 10);
    const yearTo = parseInt(filters.yearTo, 10);
    if (!Number.isNaN(yearFrom) || !Number.isNaN(yearTo)) {
        merged = merged.filter((b) => {
            if (b.year == null) return true; // unknown year — don't exclude
            if (!Number.isNaN(yearFrom) && b.year < yearFrom) return false;
            if (!Number.isNaN(yearTo) && b.year > yearTo) return false;
            return true;
        });
    }

    const sorted = sortBooks(merged, query, subjectWant);
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const start = (page - 1) * PAGE_SIZE;
    const results = sorted.slice(start, start + PAGE_SIZE);

    return { results, total, page, pageSize: PAGE_SIZE, totalPages, partial };
}

/**
 * Fetch a single book's full detail from one provider. Returns the normalized
 * shape (description not truncated) or null if not found.
 */
async function getBookDetail(source, externalId) {
    try {
        if (source === 'gutendex') {
            const data = await fetchJson(`${GUTENDEX_URL}${encodeURIComponent(externalId)}/`);
            if (!data || !data.id) return null;
            const norm = normalizeGutendex(data);
            norm.description = stripHtml(Array.isArray(data.subjects) ? data.subjects.join(', ') : '') || norm.description;
            return norm;
        }
        if (source === 'openstax') {
            // The CMS pages API exposes detail by id under the same endpoint.
            const data = await fetchJson(`${OPENSTAX_URL}${encodeURIComponent(externalId)}/?format=json`);
            if (!data || !data.id) return null;
            const norm = normalizeOpenStax(data);
            norm.description = stripHtml(data.description) || norm.description;
            return norm;
        }
        return null;
    } catch (err) {
        console.error('bookSearch.getBookDetail failed:', err.message);
        return null;
    }
}

module.exports = {
    searchBooks,
    getBookDetail,
    // exported for tests
    normalizeOpenStax,
    normalizeGutendex,
    deduplicate,
    sortBooks,
    PAGE_SIZE,
};
