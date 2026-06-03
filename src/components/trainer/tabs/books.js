// tabs/books.js — Trainer "Unit Books": pick a unit, search open libraries
// (OpenStax + Gutendex via /api/books), and approve books for students.
window.TrainerTabs = window.TrainerTabs || {};

(function () {
    const state = {
        units: [],            // [{ id, code, name }]
        unitId: '',
        approved: [],         // DB book rows (camelCase) for the selected unit
        approvedKeys: new Set(), // `${source}:${externalId}` already approved
        results: [],          // last search results (snake_case normalized)
        page: 1,
        totalPages: 1,
        lastQuery: '',
        wired: false,
    };

    const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s));
    const keyFor = (source, externalId) => `${source}:${externalId}`;
    const toast = (m, t) => (typeof showToast === 'function' ? showToast(m, t) : console.log(m));

    function trainerId() {
        const t = (typeof currentTrainer !== 'undefined' && currentTrainer) ? currentTrainer : (window.currentTrainer || null);
        return t ? (t._id || t.id) : null;
    }

    // ---- cover ------------------------------------------------------------
    function coverHtml(url, title, sizeClasses) {
        if (url) {
            return `<img src="${esc(url)}" alt="${esc(title)} cover" loading="lazy"
                class="${sizeClasses} object-cover rounded-md bg-gray-100 dark:bg-gray-700"
                onerror="this.replaceWith(window.__bookCoverPlaceholder('${sizeClasses.replace(/'/g, '')}'))">`;
        }
        return placeholderHtml(sizeClasses);
    }
    function placeholderHtml(sizeClasses) {
        return `<div class="${sizeClasses} rounded-md bg-gradient-to-br from-primary/10 to-accent/10 dark:from-primary/20 dark:to-accent/20 flex items-center justify-center">
            <i class="ri-book-2-line text-2xl text-primary/60"></i></div>`;
    }
    // Used by <img onerror> to swap a broken cover for the placeholder.
    window.__bookCoverPlaceholder = function (sizeClasses) {
        const wrap = document.createElement('div');
        wrap.innerHTML = placeholderHtml(sizeClasses);
        return wrap.firstElementChild;
    };

    // ---- units ------------------------------------------------------------
    async function loadUnits() {
        const select = document.getElementById('books-unit-select');
        const id = trainerId();
        if (!select) return;
        if (!id) { select.innerHTML = '<option value="">Sign in again to load units</option>'; return; }
        try {
            const res = await authFetch(`${API_BASE_URL}/trainers/${encodeURIComponent(id)}/assignments`);
            const body = await res.json();
            const assignments = (body && body.assignments) || [];
            const byId = new Map();
            assignments.forEach((a) => {
                const u = a.unitId;
                if (u && (u._id || u.id) && !byId.has(u._id || u.id)) {
                    byId.set(u._id || u.id, { id: u._id || u.id, code: u.unitCode || '', name: u.unitName || 'Unit' });
                }
            });
            state.units = [...byId.values()];
            if (!state.units.length) {
                select.innerHTML = '<option value="">No units assigned to you</option>';
                renderApproved();
                return;
            }
            select.innerHTML = state.units
                .map((u) => `<option value="${esc(u.id)}">${esc(u.code ? u.code + ' — ' : '')}${esc(u.name)}</option>`)
                .join('');
            state.unitId = state.units[0].id;
            select.value = state.unitId;
            await loadApproved();
        } catch (err) {
            console.error('loadUnits failed:', err);
            select.innerHTML = '<option value="">Failed to load units</option>';
        }
    }

    // ---- approved (left panel) -------------------------------------------
    async function loadApproved() {
        if (!state.unitId) { state.approved = []; state.approvedKeys = new Set(); renderApproved(); return; }
        try {
            const body = await window.BooksAPI.unitBooks(state.unitId);
            state.approved = (body && body.books) || [];
        } catch (err) {
            console.error('loadApproved failed:', err);
            state.approved = [];
            toast(err.message || 'Failed to load approved books', 'error');
        }
        state.approvedKeys = new Set(state.approved.map((b) => keyFor(b.source, b.externalId)));
        renderApproved();
        renderResults(); // refresh "Added" badges
    }

    function renderApproved() {
        const list = document.getElementById('approved-books-list');
        const empty = document.getElementById('approved-empty');
        const count = document.getElementById('approved-count');
        if (!list || !empty) return;
        if (count) count.textContent = String(state.approved.length);
        if (!state.approved.length) {
            list.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');
        list.innerHTML = state.approved.map((b) => `
            <div class="flex gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                ${coverHtml(b.coverUrl, b.title, 'w-12 h-16 flex-shrink-0')}
                <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">${esc(b.title)}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400 truncate">${esc((b.authors || []).join(', ') || '—')}</p>
                    <button onclick="TrainerBooks.remove('${esc(b.id)}')"
                        class="mt-1 text-xs text-red-600 hover:text-red-800 font-medium inline-flex items-center gap-1">
                        <i class="ri-delete-bin-line"></i> Remove
                    </button>
                </div>
            </div>`).join('');
    }

    // ---- search -----------------------------------------------------------
    function readFilters() {
        const v = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
        return {
            subject: v('book-subject'),
            language: v('book-language'),
            source: v('book-source'),
            yearFrom: v('book-year-from'),
            yearTo: v('book-year-to'),
            page: state.page,
        };
    }

    async function runSearch(resetPage) {
        const input = document.getElementById('book-search-input');
        const results = document.getElementById('book-results');
        const countEl = document.getElementById('book-results-count');
        const statusEl = document.getElementById('book-results-status');
        if (!results) return;
        const query = input ? input.value.trim() : '';
        if (resetPage) state.page = 1;
        state.lastQuery = query;

        // loading skeleton
        results.innerHTML = skeleton();
        if (countEl) countEl.textContent = 'Searching…';
        if (statusEl) statusEl.textContent = '';
        document.getElementById('book-pagination')?.classList.add('hidden');

        try {
            const body = await window.BooksAPI.search(query, readFilters());
            state.results = body.results || [];
            state.totalPages = body.totalPages || 1;
            if (countEl) countEl.textContent = `${body.total || 0} book${(body.total === 1) ? '' : 's'} found`;
            if (statusEl) statusEl.textContent = body.partial ? 'Some sources were unavailable — showing partial results.' : '';
            renderResults();
            renderPagination();
        } catch (err) {
            console.error('book search failed:', err);
            results.innerHTML = `<div class="text-center py-10 text-gray-500 dark:text-gray-400"><i class="ri-error-warning-line text-3xl"></i><p class="mt-2">${esc(err.message || 'Search failed')}</p></div>`;
            if (countEl) countEl.textContent = '';
        }
    }

    function skeleton() {
        return Array.from({ length: 4 }).map(() => `
            <div class="flex gap-4 p-4 rounded-xl border border-gray-100 dark:border-gray-700 animate-pulse">
                <div class="w-20 h-28 rounded-md bg-gray-200 dark:bg-gray-700"></div>
                <div class="flex-1 space-y-2 py-1">
                    <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                    <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                    <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
                </div>
            </div>`).join('');
    }

    function renderResults() {
        const results = document.getElementById('book-results');
        if (!results) return;
        if (!state.results.length) {
            if (state.lastQuery || state.page > 1) {
                results.innerHTML = `<div class="text-center py-10 text-gray-500 dark:text-gray-400"><i class="ri-search-line text-3xl"></i><p class="mt-2">No books matched your search.</p></div>`;
            } else {
                results.innerHTML = `<div class="text-center py-10 text-gray-400 dark:text-gray-500"><i class="ri-book-open-line text-3xl"></i><p class="mt-2">Search for textbooks or topics to add to this unit.</p></div>`;
            }
            return;
        }
        results.innerHTML = state.results.map((b, i) => {
            const added = state.approvedKeys.has(keyFor(b.source, b.external_id));
            const authors = (b.authors || []).join(', ');
            const subjectTag = b.subject
                ? `<span class="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-accent/15 text-amber-700 dark:text-amber-300">${esc(b.subject)}</span>` : '';
            const yearTag = b.year ? `<span class="text-xs text-gray-400">${esc(b.year)}</span>` : '';
            const previewLink = b.preview_url || b.pdf_url;
            return `
            <div class="book-card flex gap-4 p-4 rounded-xl border border-gray-100 dark:border-gray-700 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 bg-white dark:bg-gray-800">
                ${coverHtml(b.cover_url, b.title, 'w-20 h-28 flex-shrink-0')}
                <div class="min-w-0 flex-1">
                    <div class="flex items-start justify-between gap-2">
                        <h4 class="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">${esc(b.title)}</h4>
                        ${yearTag}
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">${esc(authors || '—')}</p>
                    <div class="mt-1">${subjectTag}</div>
                    <p class="text-sm text-gray-600 dark:text-gray-300 mt-1.5 line-clamp-2">${esc(b.description || '')}</p>
                    <div class="mt-3 flex items-center gap-2">
                        ${previewLink ? `<a href="${esc(previewLink)}" target="_blank" rel="noopener"
                            class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 inline-flex items-center gap-1">
                            <i class="ri-external-link-line"></i> Preview</a>` : ''}
                        ${added
                            ? `<span class="px-3 py-1.5 text-sm rounded-lg bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 inline-flex items-center gap-1"><i class="ri-check-line"></i> Added</span>`
                            : `<button onclick="TrainerBooks.add(${i})"
                                class="px-3 py-1.5 text-sm rounded-lg bg-primary hover:bg-secondary text-white inline-flex items-center gap-1">
                                <i class="ri-add-line"></i> Add to Unit</button>`}
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    function renderPagination() {
        const pag = document.getElementById('book-pagination');
        if (!pag) return;
        if (state.totalPages <= 1) { pag.classList.add('hidden'); return; }
        pag.classList.remove('hidden');
        pag.innerHTML = `
            <button ${state.page <= 1 ? 'disabled' : ''} onclick="TrainerBooks.go(${state.page - 1})"
                class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 ${state.page <= 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}">Previous</button>
            <span class="text-sm text-gray-500 dark:text-gray-400">Page ${state.page} of ${state.totalPages}</span>
            <button ${state.page >= state.totalPages ? 'disabled' : ''} onclick="TrainerBooks.go(${state.page + 1})"
                class="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 ${state.page >= state.totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}">Next</button>`;
    }

    // ---- actions (exposed) ------------------------------------------------
    const TrainerBooks = {
        async add(index) {
            const b = state.results[index];
            if (!b) return;
            if (!state.unitId) { toast('Select a unit first', 'error'); return; }
            try {
                const body = await window.BooksAPI.approve({
                    unit_id: state.unitId,
                    external_id: b.external_id,
                    source: b.source,
                    title: b.title,
                    authors: b.authors || [],
                    cover_url: b.cover_url || null,
                    description: b.description || null,
                    subject: b.subject || null,
                    pdf_url: b.pdf_url || null,
                    preview_url: b.preview_url || null,
                    language: b.language || 'en',
                });
                const saved = body.book;
                if (saved && !state.approvedKeys.has(keyFor(saved.source, saved.externalId))) {
                    state.approved.unshift(saved);
                }
                state.approvedKeys.add(keyFor(b.source, b.external_id));
                renderApproved();
                renderResults();
                toast('Added to unit', 'success');
            } catch (err) {
                console.error('approve failed:', err);
                toast(err.message || 'Failed to add book', 'error');
            }
        },
        async remove(bookId) {
            try {
                await window.BooksAPI.remove(bookId);
                const removed = state.approved.find((b) => b.id === bookId);
                state.approved = state.approved.filter((b) => b.id !== bookId);
                if (removed) state.approvedKeys.delete(keyFor(removed.source, removed.externalId));
                renderApproved();
                renderResults();
                toast('Removed from unit', 'success');
            } catch (err) {
                console.error('remove failed:', err);
                toast(err.message || 'Failed to remove book', 'error');
            }
        },
        go(page) {
            if (page < 1 || page > state.totalPages) return;
            state.page = page;
            runSearch(false);
            document.getElementById('book-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
    };
    window.TrainerBooks = TrainerBooks;

    function wire() {
        if (state.wired) return;
        state.wired = true;
        const btn = document.getElementById('book-search-btn');
        const input = document.getElementById('book-search-input');
        const unitSel = document.getElementById('books-unit-select');
        const toggle = document.getElementById('book-filters-toggle');
        if (btn) btn.addEventListener('click', () => runSearch(true));
        if (input) input.addEventListener('keypress', (e) => { if (e.key === 'Enter') runSearch(true); });
        if (unitSel) unitSel.addEventListener('change', (e) => { state.unitId = e.target.value; loadApproved(); });
        if (toggle) toggle.addEventListener('click', () => {
            const panel = document.getElementById('book-filters-panel');
            const chev = document.getElementById('book-filters-chevron');
            if (panel) panel.classList.toggle('hidden');
            if (chev) chev.classList.toggle('rotate-180');
        });
    }

    window.TrainerTabs.books = {
        init() {
            wire();
            loadUnits();
        },
    };
})();
