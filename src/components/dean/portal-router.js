// portal-router.js — tiny History-API router for the dean portal SPA.
//
// Adapted from the student/admin routers. Routes are /dean/<tab> for the 3 known
// tabs; DEFAULT is "students". The server serves the same shell for /dean and
// /dean/<tab>, so this router reads the tab from the last path segment, lazily
// fetches that tab's partial into a cached pane inside <main id="tab-root">, marks
// the nav link active, toggles visibility via the .active class (the dean CSS
// shows .content-section.active and hides the rest), and calls the tab's
// idempotent init() (window.DeanTabs[tab].init — bracket notation for the
// hyphenated 'tools-of-trade').
//
// Replaces the monolith's anchor-driven setupNavigation() click handler. There is
// no named switchTab/showSection global in this portal, so no alias is exported.
// Load order: after portal-core.js, before/with the tab modules.

window.DeanRouter = (function () {
    const BASE = '/dean';
    const DEFAULT_TAB = 'students';
    const VALID_TABS = ['students', 'notes'];

    // tab -> injected pane element (cache; partials are fetched once).
    const panes = {};

    // Pull the tab id from a /dean/<tab> path (or an href): last path segment;
    // the role name or an empty path defaults to students.
    function tabFromPath(pathname) {
        const segs = (pathname || '').split(/[?#]/)[0].replace(/\/+$/, '').split('/').filter(Boolean);
        const tab = segs[segs.length - 1];
        if (!tab || tab === 'dean') return DEFAULT_TAB;
        return VALID_TABS.includes(tab) ? tab : DEFAULT_TAB;
    }

    // Fetch + inject a tab's partial once; return its cached pane.
    async function ensurePane(tab) {
        if (panes[tab]) return panes[tab];
        const root = document.getElementById('tab-root');
        const pane = document.createElement('div');
        // Keep the monolith's section id (no prefix) + content-section class (the
        // dean CSS hides .content-section and shows .content-section.active).
        pane.id = tab;
        pane.className = 'content-section';
        try {
            const res = await fetch(`/dean/partials/${tab}.html`, { credentials: 'include' });
            pane.innerHTML = await res.text();
        } catch (err) {
            console.error('Failed to load partial for tab', tab, err);
            pane.innerHTML = '<div class="text-center py-12 text-red-500">Failed to load this section. Please refresh.</div>';
        }
        root.appendChild(pane);
        panes[tab] = pane;
        return pane;
    }

    // Show a tab: inject (if needed), reveal via .active, sync nav, init.
    async function showTab(tab) {
        if (!VALID_TABS.includes(tab)) tab = DEFAULT_TAB;
        const pane = await ensurePane(tab);

        // Visibility: same mechanism as setupNavigation() — toggle .active.
        Object.keys(panes).forEach(t => panes[t].classList.remove('active'));
        pane.classList.add('active');

        // Active nav link (setupNavigation() toggled the .active class).
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        const activeLink = document.querySelector(`.nav-link[href="${BASE}/${tab}"]`);
        if (activeLink) activeLink.classList.add('active');

        // Run the tab's data load. init() must be idempotent (re-run on revisit).
        const mod = window.DeanTabs && window.DeanTabs[tab];
        if (mod && typeof mod.init === 'function') {
            try { mod.init(); } catch (err) { console.error('tab init error:', tab, err); }
        }

        window.scrollTo(0, 0);
    }

    // Navigate from a user action: push a new history entry, then render.
    function navigate(tab) {
        if (!VALID_TABS.includes(tab)) tab = DEFAULT_TAB;
        history.pushState({ tab }, '', `${BASE}/${tab}`);
        showTab(tab);
    }

    function start() {
        // Intercept sidebar nav-link clicks (hrefs are real /dean/<tab> paths).
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                navigate(tabFromPath(link.getAttribute('href')));
            });
        });

        // Back/forward: render from the URL, do NOT push again.
        window.addEventListener('popstate', () => {
            showTab(tabFromPath(location.pathname));
        });

        // First load: render the tab from the URL. Normalise a bare /dean to
        // /dean/students so the URL has a tab.
        const initial = tabFromPath(location.pathname);
        if (location.pathname.replace(/\/+$/, '') === BASE) {
            history.replaceState({ tab: initial }, '', `${BASE}/${initial}`);
        }
        showTab(initial);
    }

    return { start, showTab, navigate, tabFromPath };
})();
