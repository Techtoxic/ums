// portal-router.js — tiny History-API router for the finance portal SPA.
//
// Adapted from the admin/registrar routers. Routes are /finance/<tab> for the 8
// known tabs. The server serves the same shell for /finance and /finance/<tab>,
// so this router reads the tab from the last path segment, lazily fetches that
// tab's partial into a cached pane inside <main id="tab-root">, marks the nav link
// active, toggles visibility via the .hidden class (finance shows .section and
// hides .section.hidden), and calls the tab's idempotent init()
// (window.FinanceTabs[tab].init).
//
// Replaces the monolith's showSection() (the live line-1514 version, which wrapped
// the line-979 original). window.showSection is kept below as a thin alias.
// Load order: after portal-core.js, before/with the tab modules.

window.FinanceRouter = (function () {
    const BASE = '/finance';
    const VALID_TABS = ['dashboard', 'analytics', 'reports', 'revenue', 'payslips', 'settings'];

    // tab -> injected pane element (cache; partials are fetched once).
    const panes = {};

    // Pull the tab id from a /finance/<tab> path (or an href): last path segment;
    // the role name or an empty path defaults to dashboard.
    function tabFromPath(pathname) {
        const segs = (pathname || '').split(/[?#]/)[0].replace(/\/+$/, '').split('/').filter(Boolean);
        const tab = segs[segs.length - 1];
        if (!tab || tab === 'finance') return 'dashboard';
        return VALID_TABS.includes(tab) ? tab : 'dashboard';
    }

    // Fetch + inject a tab's partial once; return its cached pane.
    async function ensurePane(tab) {
        if (panes[tab]) return panes[tab];
        const root = document.getElementById('tab-root');
        const pane = document.createElement('div');
        // Keep the monolith's <tab>-section id + section class (finance hides via
        // the .hidden class on .section panes).
        pane.id = tab + '-section';
        pane.className = 'section hidden';
        try {
            const res = await fetch(`/finance/partials/${tab}.html`, { credentials: 'include' });
            pane.innerHTML = await res.text();
        } catch (err) {
            console.error('Failed to load partial for tab', tab, err);
            pane.innerHTML = '<div style="padding:2rem;text-align:center;color:#b91c1c">Failed to load this section. Please refresh.</div>';
        }
        root.appendChild(pane);
        panes[tab] = pane;
        return pane;
    }

    // Show a tab: inject (if needed), reveal it, hide the rest, sync nav, init.
    async function showTab(tab) {
        if (!VALID_TABS.includes(tab)) tab = 'dashboard';
        const pane = await ensurePane(tab);

        // Visibility: same mechanism as showSection() — toggle .hidden on .section.
        document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
        pane.classList.remove('hidden');

        // Active nav link (showSection toggled the .active class). Match by the
        // real href (nav was rewritten from onclick="showSection('x')").
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        const activeLink = document.querySelector(`.nav-link[href="${BASE}/${tab}"]`);
        if (activeLink) activeLink.classList.add('active');

        // Run the tab's data load. init() must be idempotent (re-run on revisit).
        const mod = window.FinanceTabs && window.FinanceTabs[tab];
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
        // Intercept sidebar nav-link clicks (hrefs are real /finance/<tab> paths).
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

        // First load: render the tab from the URL. Normalise a bare /finance to
        // /finance/dashboard so the URL has a tab.
        const initial = tabFromPath(location.pathname);
        if (location.pathname.replace(/\/+$/, '') === BASE) {
            history.replaceState({ tab: initial }, '', `${BASE}/${initial}`);
        }
        showTab(initial);
    }

    return { start, showTab, navigate, tabFromPath };
})();

// Thin alias: the monolith's showSection() is replaced by the router, but any
// inline button still calls showSection('<tab>').
window.showSection = function (tab) {
    window.FinanceRouter.navigate(tab);
};
