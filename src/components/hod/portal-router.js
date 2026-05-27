// portal-router.js — tiny History-API router for the HOD portal SPA.
//
// Adapted from the trainer/registrar routers. Routes are /hod/<tab> for the 7
// known tabs; the DEFAULT tab is "overview" (not "dashboard"). The server serves
// the same shell for /hod and /hod/<tab>, so this router reads the tab from the
// last path segment, lazily fetches that tab's partial into a cached pane inside
// <main id="tab-root">, marks the nav item active (replicating the live
// switchTab() class swap), sets the page title, and calls the tab's idempotent
// init() (window.HODTabs[tab].init — bracket notation for 'common-units').
//
// Replaces BOTH switchTab() definitions (the dead one ~line 784 and the live one
// ~line 1806). window.switchTab is kept below as a thin alias; navigate() does
// NOT await showTab(), so a chained inline call like
// `switchTab('trainers'); showAssignUnitsModal();` still works — the modal is a
// shell element and its content reads globals, independent of the partial fetch.
// Load order: after portal-core.js, before/with the tab modules.

window.HODRouter = (function () {
    const BASE = '/hod';
    const DEFAULT_TAB = 'overview';
    const VALID_TABS = ['overview', 'courses', 'trainers', 'common-units', 'assignments', 'analytics', 'profile'];

    // Page titles — same map the live switchTab() used.
    const TITLES = {
        'overview': 'Dashboard',
        'courses': 'Courses & Units',
        'trainers': 'Trainers',
        'common-units': 'Common Units',
        'assignments': 'Unit Assignments',
        'analytics': 'Analytics',
        'profile': 'My Profile'
    };

    // Active/inactive nav-item class sets (verbatim from the live switchTab()).
    const ACTIVE_CLASSES = ['bg-primary/10', 'text-primary', 'dark:bg-primary/20', 'dark:text-primary-light'];
    const INACTIVE_CLASSES = ['text-gray-600', 'dark:text-gray-400'];

    // tab -> injected pane element (cache; partials are fetched once).
    const panes = {};

    // Pull the tab id from a /hod/<tab> path (or an href): last path segment;
    // the role name or an empty path defaults to overview.
    function tabFromPath(pathname) {
        const segs = (pathname || '').split(/[?#]/)[0].replace(/\/+$/, '').split('/').filter(Boolean);
        const tab = segs[segs.length - 1];
        if (!tab || tab === 'hod') return DEFAULT_TAB;
        return VALID_TABS.includes(tab) ? tab : DEFAULT_TAB;
    }

    // Fetch + inject a tab's partial once; return its cached pane.
    async function ensurePane(tab) {
        if (panes[tab]) return panes[tab];
        const root = document.getElementById('tab-root');
        const pane = document.createElement('div');
        // Keep the monolith's content-<tab> id + tab-content class (hidden when inactive).
        pane.id = 'content-' + tab;
        pane.className = 'tab-content hidden';
        try {
            const res = await fetch(`/hod/partials/${tab}.html`, { credentials: 'include' });
            pane.innerHTML = await res.text();
        } catch (err) {
            console.error('Failed to load partial for tab', tab, err);
            pane.innerHTML = '<div class="p-6 text-center text-red-600">Failed to load this section. Please refresh.</div>';
        }
        root.appendChild(pane);
        panes[tab] = pane;
        return pane;
    }

    // Show a tab: inject (if needed), reveal it, hide the rest, sync nav, init.
    async function showTab(tab) {
        if (!VALID_TABS.includes(tab)) tab = DEFAULT_TAB;
        const pane = await ensurePane(tab);

        // Visibility: same mechanism as switchTab() — toggle .hidden on .tab-content.
        Object.keys(panes).forEach(t => panes[t].classList.add('hidden'));
        pane.classList.remove('hidden');

        // Active nav item (verbatim class swap from the live switchTab()).
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove(...ACTIVE_CLASSES);
            item.classList.add(...INACTIVE_CLASSES);
        });
        const activeNavItem = document.getElementById(`nav-${tab}`);
        if (activeNavItem) {
            activeNavItem.classList.add(...ACTIVE_CLASSES);
            activeNavItem.classList.remove(...INACTIVE_CLASSES);
        }

        // Page title.
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) pageTitle.textContent = TITLES[tab] || 'Dashboard';

        // Run the tab's data load. init() must be idempotent (re-run on revisit).
        const mod = window.HODTabs && window.HODTabs[tab];
        if (mod && typeof mod.init === 'function') {
            try { mod.init(); } catch (err) { console.error('tab init error:', tab, err); }
        }

        window.scrollTo(0, 0);
    }

    // Navigate from a user action: push a new history entry, then render. Does NOT
    // await showTab so chained inline calls (e.g. showAssignUnitsModal) run right after.
    function navigate(tab) {
        if (!VALID_TABS.includes(tab)) tab = DEFAULT_TAB;
        history.pushState({ tab }, '', `${BASE}/${tab}`);
        showTab(tab);
    }

    function start() {
        // Intercept sidebar nav-item clicks (hrefs are real /hod/<tab> paths).
        document.querySelectorAll('.nav-item').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                navigate(tabFromPath(link.getAttribute('href')));
            });
        });

        // Back/forward: render from the URL, do NOT push again.
        window.addEventListener('popstate', () => {
            showTab(tabFromPath(location.pathname));
        });

        // First load: render the tab from the URL. Normalise a bare /hod to
        // /hod/overview so the URL has a tab.
        const initial = tabFromPath(location.pathname);
        if (location.pathname.replace(/\/+$/, '') === BASE) {
            history.replaceState({ tab: initial }, '', `${BASE}/${initial}`);
        }
        showTab(initial);
    }

    return { start, showTab, navigate, tabFromPath };
})();

// Thin alias: both switchTab() definitions are replaced by the router, but inline
// overview buttons still call switchTab('<tab>') (incl. the chained
// switchTab('trainers'); showAssignUnitsModal()).
window.switchTab = function (tab) {
    window.HODRouter.navigate(tab);
};
