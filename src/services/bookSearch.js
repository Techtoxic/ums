// services/bookSearch.js — dual open-library book search for the Book Resource
// module. Queries OpenStax (peer-reviewed academic textbooks, full free PDFs)
// and Open Library (broad catalog including technical/vocational/trade titles,
// many readable on the Internet Archive) in parallel, normalizes both to one
// flat shape, deduplicates by title (preferring the richer OpenStax record),
// and sorts.
//
// Resilience: a failure of one provider never kills the search — the other's
// results are still returned with `partial: true`. Node 18+ global fetch.

const OPENSTAX_URL = 'https://openstax.org/apps/cms/api/v2/pages/';
const OPENLIBRARY_SEARCH = 'https://openlibrary.org/search.json';
const OPENLIBRARY_COVERS = 'https://covers.openlibrary.org/b/id';
// Cap the wait so a slow provider can't stall a search. If a provider exceeds
// this it's dropped and the response is flagged `partial`.
const FETCH_TIMEOUT_MS = 12000;
const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

// One fetch attempt with a hard timeout so a hung provider can't stall the request.
async function fetchOnce(url) {
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

// fetchJson retries once on a transient failure (network blip / cold connection)
// — but NOT on a 4xx, which is a deterministic bad request.
async function fetchJson(url, retries = 1) {
    try {
        return await fetchOnce(url);
    } catch (err) {
        const is4xx = /HTTP 4\d\d/.test(err.message || '');
        if (retries > 0 && !is4xx) {
            await new Promise((r) => setTimeout(r, 350));
            return fetchJson(url, retries - 1);
        }
        throw err;
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

async function fetchOpenLibrary(query, language) {
    // Open Library search returns rich rows in one call (no per-item enrichment).
    const params = new URLSearchParams({
        q: query || 'textbook',
        limit: '40',
        fields: 'key,title,author_name,first_publish_year,cover_i,ia,lending_identifier_s,public_scan_b,ebook_access,language,subject',
    });
    if (language && language !== 'all') {
        // Open Library wants ISO-639-2/B 3-letter codes (eng, spa…).
        const map = { en: 'eng', es: 'spa', fr: 'fre' };
        params.set('language', map[language] || language);
    }
    const data = await fetchJson(`${OPENLIBRARY_SEARCH}?${params.toString()}`);
    return Array.isArray(data?.docs) ? data.docs : [];
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

function normalizeOpenLibrary(doc) {
    // An Internet Archive identifier means there is an actual digitized copy we
    // can show in-app. Books WITHOUT one are catalog-only stubs (no readable
    // book) and are filtered out by searchBooks — they'd just be a dead end.
    const ia = (Array.isArray(doc.ia) && doc.ia[0]) || doc.lending_identifier_s || null;
    const isPublic = doc.public_scan_b === true || doc.ebook_access === 'public';
    const key = doc.key || '';
    return {
        external_id: key.replace(/^\/works\//, '') || String(doc.cover_i || doc.title),
        source: 'openlibrary',
        title: doc.title || 'Untitled',
        authors: Array.isArray(doc.author_name) ? doc.author_name : [],
        cover_url: doc.cover_i ? `${OPENLIBRARY_COVERS}/${doc.cover_i}-M.jpg` : null,
        description: truncate(Array.isArray(doc.subject) ? doc.subject.slice(0, 8).join(', ') : null, 300),
        subject: (Array.isArray(doc.subject) && doc.subject[0]) || null,
        // Direct PDF only for fully public-domain scans (downloadable as a file).
        pdf_url: ia && isPublic ? `https://archive.org/download/${ia}/${ia}.pdf` : null,
        // The embeddable Internet Archive BookReader — the actual book pages,
        // shown INSIDE our portal via an iframe (no website chrome / redirect).
        preview_url: ia ? `https://archive.org/embed/${ia}` : null,
        ia: ia || null,
        language: (Array.isArray(doc.language) && doc.language[0]) || 'en',
        year: doc.first_publish_year || null,
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
 * filters: { subject, language, source ('all'|'openstax'|'openlibrary'),
 *            yearFrom, yearTo, page }
 * returns: { results, total, page, pageSize, totalPages, partial }
 */
async function searchBooks(query, filters = {}) {
    const source = (filters.source || 'all').toLowerCase();
    const language = (filters.language || 'all').toLowerCase();
    const page = Math.max(1, parseInt(filters.page, 10) || 1);

    const wantOpenStax = source === 'all' || source === 'openstax';
    const wantOpenLibrary = source === 'all' || source === 'openlibrary';
    // OpenStax is English-only; if a non-en/non-all language is chosen it can't
    // contribute and Open Library carries the search.
    const openStaxApplicable = wantOpenStax && (language === 'all' || language === 'en');

    const [osSettled, olSettled] = await Promise.allSettled([
        openStaxApplicable ? fetchOpenStax(query) : Promise.resolve([]),
        wantOpenLibrary ? fetchOpenLibrary(query, language) : Promise.resolve([]),
    ]);

    let partial = false;
    let openstax = [];
    let openlibrary = [];

    if (osSettled.status === 'fulfilled') {
        openstax = osSettled.value.map(normalizeOpenStax);
    } else if (openStaxApplicable) {
        partial = true;
        console.error('bookSearch: OpenStax failed:', osSettled.reason?.message || osSettled.reason);
    }
    if (olSettled.status === 'fulfilled') {
        // Keep only books with an actual readable/downloadable copy — drop
        // catalog-only stubs so a user is never sent to a dead "Want to Read" page.
        openlibrary = olSettled.value.map(normalizeOpenLibrary).filter((b) => b.preview_url || b.pdf_url);
    } else if (wantOpenLibrary) {
        partial = true;
        console.error('bookSearch: Open Library failed:', olSettled.reason?.message || olSettled.reason);
    }

    // OpenStax first so it wins dedup collisions.
    let merged = deduplicate([...openstax, ...openlibrary]);

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
        if (source === 'openlibrary') {
            // externalId is the work id (e.g. OL12345W).
            const work = await fetchJson(`https://openlibrary.org/works/${encodeURIComponent(externalId)}.json`);
            if (!work) return null;
            const descr = typeof work.description === 'string'
                ? work.description
                : (work.description && work.description.value) || null;
            const coverId = Array.isArray(work.covers) && work.covers[0];
            return {
                external_id: externalId,
                source: 'openlibrary',
                title: work.title || 'Untitled',
                authors: [],
                cover_url: coverId ? `${OPENLIBRARY_COVERS}/${coverId}-M.jpg` : null,
                description: stripHtml(descr),
                subject: (Array.isArray(work.subjects) && work.subjects[0]) || null,
                pdf_url: null,
                preview_url: `https://openlibrary.org/works/${externalId}`,
                language: 'en',
                year: null,
            };
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
    normalizeOpenLibrary,
    deduplicate,
    sortBooks,
    PAGE_SIZE,
};
