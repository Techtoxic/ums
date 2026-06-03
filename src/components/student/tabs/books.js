// tabs/books.js — Student "My Books": books approved for the units the student
// is registered in, grouped by unit. Read-only reading library.
window.StudentTabs = window.StudentTabs || {};

(function () {
    const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s));

    function placeholderHtml() {
        return `<div class="w-full h-44 rounded-t-xl bg-gradient-to-br from-primary/10 to-accent/10 dark:from-primary/20 dark:to-accent/20 flex items-center justify-center">
            <i class="ri-book-2-line text-4xl text-primary/60"></i></div>`;
    }
    window.__studentBookCover = function () {
        const wrap = document.createElement('div');
        wrap.innerHTML = placeholderHtml();
        return wrap.firstElementChild;
    };
    function coverHtml(url, title) {
        if (url) {
            return `<img src="${esc(url)}" alt="${esc(title)} cover" loading="lazy"
                class="w-full h-44 object-cover rounded-t-xl bg-gray-100 dark:bg-gray-700"
                onerror="this.replaceWith(window.__studentBookCover())">`;
        }
        return placeholderHtml();
    }

    function cardHtml(b) {
        const authors = (b.authors || []).join(', ') || '—';
        const open = b.previewUrl || b.pdfUrl;
        const openBtn = open
            ? `<a href="${esc(open)}" target="_blank" rel="noopener"
                 class="flex-1 text-center px-3 py-2 text-sm rounded-lg bg-primary hover:bg-secondary text-white inline-flex items-center justify-center gap-1">
                 <i class="ri-external-link-line"></i> Open</a>`
            : `<span class="flex-1 text-center px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed">Open</span>`;
        const dl = b.pdfUrl
            ? `<a href="${esc(b.pdfUrl)}" target="_blank" rel="noopener" download
                 class="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 inline-flex items-center justify-center gap-1" title="Download PDF">
                 <i class="ri-download-2-line"></i></a>`
            : `<span class="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed" title="No PDF available"><i class="ri-download-2-line"></i></span>`;
        return `
        <div class="book-card w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col">
            ${coverHtml(b.coverUrl, b.title)}
            <div class="p-3 flex flex-col flex-1">
                <h4 class="font-semibold text-gray-900 dark:text-gray-100 text-sm line-clamp-2">${esc(b.title)}</h4>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">${esc(authors)}</p>
                <div class="mt-3 flex items-center gap-2 pt-2 mt-auto">
                    ${openBtn}${dl}
                </div>
            </div>
        </div>`;
    }

    function groupHtml(group) {
        const u = group.unit || {};
        const codeBadge = u.code
            ? `<span class="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-primary/10 text-primary align-middle">${esc(u.code)}</span>` : '';
        const cards = (group.books || []).map(cardHtml).join('');
        return `
        <section>
            <h3 class="text-lg font-serif font-semibold text-gray-900 dark:text-gray-100 mb-3">${esc(u.name || 'Unit')}${codeBadge}</h3>
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                ${cards}
            </div>
        </section>`;
    }

    async function load() {
        const loading = document.getElementById('student-books-loading');
        const root = document.getElementById('student-books-root');
        const empty = document.getElementById('student-books-empty');
        const error = document.getElementById('student-books-error');
        if (!root) return;
        loading?.classList.remove('hidden');
        root.classList.add('hidden');
        empty?.classList.add('hidden');
        error?.classList.add('hidden');

        try {
            const body = await window.BooksAPI.myBooks();
            const groups = (body && body.groups) || [];
            loading?.classList.add('hidden');
            if (!groups.length) {
                empty?.classList.remove('hidden');
                return;
            }
            root.innerHTML = groups.map(groupHtml).join('');
            root.classList.remove('hidden');
        } catch (err) {
            console.error('my-books failed:', err);
            loading?.classList.add('hidden');
            const msg = document.getElementById('student-books-error-msg');
            if (msg) msg.textContent = err.message || 'Failed to load your books.';
            error?.classList.remove('hidden');
        }
    }

    window.StudentTabs.books = {
        init() { load(); },
    };
})();
