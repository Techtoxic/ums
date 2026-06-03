// book-reader.js — in-app book reader modal shared by the trainer + student
// book tabs. Shows the actual book INSIDE the portal (Internet Archive
// BookReader for library books, the browser PDF viewer for direct PDFs) so a
// user is never redirected to an external website. Download yields the real file.
(function () {
    const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s));

    // Books come in two shapes: search results (snake_case) and saved DB rows
    // (camelCase). Read either.
    const pick = (b, snake, camel) => (b[snake] != null ? b[snake] : b[camel]);

    // What to load in the iframe: prefer the embeddable IA reader for archive.org
    // links (handles both /details/ and /embed/ forms), else the raw PDF.
    function readerSrc(b) {
        const preview = pick(b, 'preview_url', 'previewUrl');
        const pdf = pick(b, 'pdf_url', 'pdfUrl');
        if (preview && /archive\.org\/(embed|details)\//.test(preview)) {
            return preview.replace('/details/', '/embed/');
        }
        if (pdf) return pdf;          // PDFs render in the browser's built-in viewer
        return preview || null;       // last resort
    }

    let overlay = null;

    function build() {
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.id = 'book-reader-overlay';
        overlay.className = 'fixed inset-0 z-[1000] hidden items-center justify-center bg-black/70 p-2 sm:p-6';
        overlay.innerHTML = `
            <div class="bg-white dark:bg-gray-900 w-full h-full max-w-5xl rounded-xl shadow-2xl flex flex-col overflow-hidden">
                <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <i class="ri-book-open-line text-primary text-xl"></i>
                    <h3 id="book-reader-title" class="flex-1 min-w-0 truncate font-serif font-semibold text-gray-900 dark:text-gray-100"></h3>
                    <a id="book-reader-download" href="#" target="_blank" rel="noopener" download
                        class="hidden px-3 py-1.5 text-sm rounded-lg bg-primary hover:bg-secondary text-white items-center gap-1">
                        <i class="ri-download-2-line"></i><span class="hidden sm:inline">Download</span></a>
                    <button id="book-reader-close" class="px-2 py-1.5 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200" aria-label="Close">
                        <i class="ri-close-line text-2xl"></i></button>
                </div>
                <div class="relative flex-1 bg-gray-100 dark:bg-gray-800">
                    <div id="book-reader-loading" class="absolute inset-0 flex items-center justify-center text-gray-400">
                        <i class="ri-loader-4-line text-3xl animate-spin"></i>
                    </div>
                    <iframe id="book-reader-frame" class="relative w-full h-full" allow="fullscreen" referrerpolicy="no-referrer"></iframe>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        overlay.querySelector('#book-reader-close').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
        overlay.querySelector('#book-reader-frame').addEventListener('load', () => {
            const l = overlay.querySelector('#book-reader-loading');
            if (l) l.classList.add('hidden');
        });
        return overlay;
    }

    function close() {
        if (!overlay) return;
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
        // Stop playback/network by clearing the frame.
        const f = overlay.querySelector('#book-reader-frame');
        if (f) f.src = 'about:blank';
        document.body.style.overflow = '';
    }

    function open(book) {
        if (!book) return;
        const src = readerSrc(book);
        const title = pick(book, 'title', 'title') || 'Book';
        const pdf = pick(book, 'pdf_url', 'pdfUrl');
        if (!src) {
            // Nothing embeddable — if there's a PDF, hand the file over directly.
            if (pdf) window.open(pdf, '_blank', 'noopener');
            return;
        }
        const o = build();
        o.querySelector('#book-reader-title').textContent = title;
        const dl = o.querySelector('#book-reader-download');
        if (pdf) { dl.href = pdf; dl.classList.remove('hidden'); dl.classList.add('inline-flex'); }
        else { dl.classList.add('hidden'); dl.classList.remove('inline-flex'); }
        const loading = o.querySelector('#book-reader-loading');
        if (loading) loading.classList.remove('hidden');
        o.querySelector('#book-reader-frame').src = src;
        o.classList.remove('hidden');
        o.classList.add('flex');
        document.body.style.overflow = 'hidden';
    }

    window.BookReader = { open, close };
})();
