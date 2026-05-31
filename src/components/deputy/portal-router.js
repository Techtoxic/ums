// portal-router.js — tiny History-API router for the deputy portal SPA.
//
// Adapted from the registrar/finance routers. Routes are /deputy/<tab> for the 7
// known tabs; DEFAULT is "dashboard". The server serves the same shell for
// /deputy and /deputy/<tab>, so this router reads the tab from the last path
// segment, lazily fetches that tab's partial into a cached pane inside
// <main id="tab-root">, marks the nav link active (replicating switchTab()),
// toggles visibility via the .hidden class, sets the page title, closes the
// mobile sidebar, and calls the tab's idempotent init() (window.DeputyTabs[tab].init).
//
// Replaces the monolith's switchTab(). window.switchTab is kept below as a thin
// alias. Load order: after portal-core.js, before/with the tab modules.

window.DeputyRouter = (function () {
    const BASE = '/deputy';
    const DEFAULT_TAB = 'dashboard';
    const VALID_TABS = ['dashboard', 'students', 'trainers', 'courses', 'units', 'tools', 'notifications'];

    // Page titles — same map switchTab() used.
    const TITLES = {
        'dashboard': 'Dashboard Overview',
        'students': 'Student Management',
        'trainers': 'Trainer Management',
        'courses': 'Course Management',
        'units': 'Unit Management',
        'tools': 'Tools of Trade',
        'notifications': 'Notifications'
    };

    // tab -> injected pane element (cache; partials are fetched once).
    const panes = {};

    // Pull the tab id from a /deputy/<tab> path (or an href): last path segment;
    // the role name or an empty path defaults to dashboard.
    function tabFromPath(pathname) {
        const segs = (pathname || '').split(/[?#]/)[0].replace(/\/+$/, '').split('/').filter(Boolean);
        const tab = segs[segs.length - 1];
        if (!tab || tab === 'deputy') return DEFAULT_TAB;
        return VALID_TABS.includes(tab) ? tab : DEFAULT_TAB;
    }

    // Fetch + inject a tab's partial once; return its cached pane.
    async function ensurePane(tab) {
        if (panes[tab]) return panes[tab];
        const root = document.getElementById('tab-root');
        const pane = document.createElement('div');
        // Keep the monolith's content-<tab> id + content-section class (hidden when inactive).
        pane.id = 'content-' + tab;
        pane.className = 'content-section hidden';
        try {
            const res = await fetch(`/deputy/partials/${tab}.html`, { credentials: 'include' });
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
        if (!VALID_TABS.includes(tab)) tab = DEFAULT_TAB;
        const pane = await ensurePane(tab);

        // Visibility: toggle both .hidden (legacy) and .active. admin-portal.css
        // hides .content-section by default and only shows .content-section.active,
        // so the active class is what actually reveals the pane.
        Object.keys(panes).forEach(t => { panes[t].classList.add('hidden'); panes[t].classList.remove('active'); });
        pane.classList.remove('hidden');
        pane.classList.add('active');

        // Active nav link (switchTab() toggled the .active class).
        document.querySelectorAll('.nav-link').forEach(item => item.classList.remove('active'));
        const activeNavItem = document.getElementById(`nav-${tab}`);
        if (activeNavItem) activeNavItem.classList.add('active');

        // Close the mobile sidebar after navigating (as switchTab did).
        if (typeof closeSidebar === 'function') closeSidebar();

        // Page title.
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) pageTitle.textContent = TITLES[tab] || tab;

        // Run the tab's data load. init() must be idempotent (re-run on revisit).
        const mod = window.DeputyTabs && window.DeputyTabs[tab];
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
        // Intercept sidebar nav-link clicks (hrefs are real /deputy/<tab> paths).
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

        // First load: render the tab from the URL. Normalise a bare /deputy to
        // /deputy/dashboard so the URL has a tab.
        const initial = tabFromPath(location.pathname);
        if (location.pathname.replace(/\/+$/, '') === BASE) {
            history.replaceState({ tab: initial }, '', `${BASE}/${initial}`);
        }
        showTab(initial);
    }

    return { start, showTab, navigate, tabFromPath };
})();

// Thin alias: the monolith's switchTab() is replaced by the router, but the
// sidebar/any inline callers still use switchTab('<tab>').
window.switchTab = function (tab) {
    window.DeputyRouter.navigate(tab);
};
