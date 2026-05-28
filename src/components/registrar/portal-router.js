// portal-router.js — tiny History-API router for the registrar portal SPA.
//
// Adapted from the student portal router (commit 597a8d9). Routes are
// /registrar/dashboard/<tab> for the 10 known tabs. The server serves the same
// shell for /registrar/dashboard and /registrar/dashboard/<anything>, so this
// router reads the tab from the URL, lazily fetches that tab's partial into a
// cached pane inside <main id="tab-root">, marks the nav link active, and calls
// the tab's idempotent init() (window.RegistrarTabs[tab].init).
//
// Replaces the monolith's switchTab(). window.switchTab is kept below as a thin
// alias so the one internal caller (showPromotionSection) still works.
// Load order: after portal-core.js, before/with the tab modules.

window.RegistrarRouter = (function () {
    const BASE = '/registrar';
    const VALID_TABS = ['dashboard', 'admission', 'management', 'promotion'];

    // tab -> injected pane element (cache; partials are fetched once).
    const panes = {};

    // Pull the tab id from a /registrar/<tab> path: take the last path segment;
    // the role name or an empty path defaults to dashboard. (Also tolerates the
    // legacy /registrar/dashboard/<tab> shape — the last segment is still the tab.)
    function tabFromPath(pathname) {
        const segs = (pathname || '').split(/[?#]/)[0].replace(/\/+$/, '').split('/').filter(Boolean);
        const tab = segs[segs.length - 1];
        if (!tab || tab === 'registrar') return 'dashboard';
        return VALID_TABS.includes(tab) ? tab : 'dashboard';
    }

    // Fetch + inject a tab's partial once; return its cached pane.
    async function ensurePane(tab) {
        if (panes[tab]) return panes[tab];
        const root = document.getElementById('tab-root');
        const pane = document.createElement('div');
        // Keep the monolith's content-<tab> id + content-section class so existing
        // CSS/markup expectations hold.
        pane.id = 'content-' + tab;
        pane.className = 'content-section hidden';
        try {
            const res = await fetch(`/registrar/partials/${tab}.html`, { credentials: 'include' });
            pane.innerHTML = await res.text();
        } catch (err) {
            console.error('Failed to load partial for tab', tab, err);
            pane.innerHTML = '<div class="card"><div class="card__body" style="text-align:center;">Failed to load this section. Please refresh.</div></div>';
        }
        root.appendChild(pane);
        panes[tab] = pane;
        return pane;
    }

    // Show a tab: inject (if needed), reveal it, hide the rest, sync nav, init.
    async function showTab(tab) {
        if (!VALID_TABS.includes(tab)) tab = 'dashboard';
        const pane = await ensurePane(tab);

        Object.keys(panes).forEach(t => panes[t].classList.add('hidden'));
        pane.classList.remove('hidden');

        // Active nav link — registrar uses the design-system .active class only,
        // keyed by the unique data-section attribute (same as switchTab did).
        document.querySelectorAll('.nav-link').forEach(nl => nl.classList.remove('active'));
        const activeLink = document.querySelector(`.nav-link[data-section="${tab}"]`);
        if (activeLink) activeLink.classList.add('active');

        // Run the tab's data load. init() must be idempotent (re-run on revisit).
        const mod = window.RegistrarTabs && window.RegistrarTabs[tab];
        if (mod && typeof mod.init === 'function') {
            try { mod.init(); } catch (err) { console.error('tab init error:', tab, err); }
        }

        window.scrollTo(0, 0);
    }

    // Navigate from a user action: push a new history entry, then render.
    function navigate(tab) {
        if (!VALID_TABS.includes(tab)) tab = 'dashboard';
        history.pushState({ tab }, '', `${BASE}/${tab}`);
        showTab(tab);
    }

    function start() {
        // Intercept sidebar nav-link clicks (keyed by data-section).
        document.querySelectorAll('.nav-link[data-section]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                navigate(link.dataset.section);
            });
        });

        // Back/forward: render from the URL, do NOT push again.
        window.addEventListener('popstate', () => {
            showTab(tabFromPath(location.pathname));
        });

        // First load: render the tab from the URL. Normalise a bare
        // /registrar to /registrar/dashboard.
        const initial = tabFromPath(location.pathname);
        if (location.pathname.replace(/\/+$/, '') === BASE) {
            history.replaceState({ tab: initial }, '', `${BASE}/${initial}`);
        }
        showTab(initial);
    }

    return { start, showTab, navigate, tabFromPath };
})();

// Thin alias: the monolith's switchTab() is replaced by the router, but
// showPromotionSection() (and any other inline caller) still calls switchTab().
window.switchTab = function (tab) {
    window.RegistrarRouter.navigate(tab);
};
