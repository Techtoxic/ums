// books-api.js — shared client for the Book Resource module, used by both the
// trainer (search/approve) and student (my-books) portal tabs. Depends on the
// portal globals authFetch + API_BASE_URL (defined in each portal-core.js).
(function () {
    function base() {
        return (typeof API_BASE_URL !== 'undefined' && API_BASE_URL)
            || (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL)
            || `${window.location.origin}/api`;
    }

    async function call(path, options) {
        const res = await authFetch(base() + path, options);
        let body = null;
        try { body = await res.json(); } catch (e) { /* non-JSON */ }
        if (!res.ok) {
            const msg = (body && body.message) || `Request failed (${res.status})`;
            const err = new Error(msg);
            err.status = res.status;
            throw err;
        }
        return body;
    }

    window.BooksAPI = {
        // Trainer/admin: dual-provider search.
        search(query, filters = {}) {
            const p = new URLSearchParams();
            if (query) p.set('q', query);
            if (filters.subject && filters.subject !== 'all') p.set('subject', filters.subject);
            if (filters.language && filters.language !== 'all') p.set('language', filters.language);
            if (filters.source && filters.source !== 'all') p.set('source', filters.source);
            if (filters.yearFrom) p.set('yearFrom', filters.yearFrom);
            if (filters.yearTo) p.set('yearTo', filters.yearTo);
            if (filters.page) p.set('page', filters.page);
            return call('/books/search?' + p.toString());
        },
        detail(source, id) {
            return call(`/books/detail?source=${encodeURIComponent(source)}&id=${encodeURIComponent(id)}`);
        },
        // Trainer/admin: approve a normalized book for a unit.
        approve(book) {
            return call('/books/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(book),
            });
        },
        remove(bookId) {
            return call(`/books/approve/${encodeURIComponent(bookId)}`, { method: 'DELETE' });
        },
        // Books approved for a single unit (trainer view / student view).
        unitBooks(unitId) {
            return call(`/books/unit/${encodeURIComponent(unitId)}`);
        },
        // Student: all my books grouped by registered unit.
        myBooks() {
            return call('/books/my-books');
        },
    };
})();
