// portal-router.js — tiny History-API router for the admin portal SPA.
//
// Adapted from the trainer/student/registrar routers. Routes are /admin/<tab> for
// the 7 known tabs. The server serves the same shell for /admin and /admin/<tab>,
// so this router reads the tab from the last path segment, lazily fetches that
// tab's partial into a cached pane inside <main id="tab-root">, marks the nav link
// active (replicating the monolith showSection() class swap), updates visibility
// via the .active class (admin's CSS shows .content-section.active), and calls the
// tab's idempotent init() (window.AdminTabs[tab].init).
//
// Replaces the monolith's showSection(). window.showSection is kept below as a
// thin alias so the inline dashboard quick-action buttons keep working.
// Load order: after portal-core.js, before/with the tab modules.

window.AdminRouter = (function () {
    const BASE = '/admin';
    const VALID_TABS = ['dashboard', 'students', 'trainers', 'financial', 'programs', 'reports', 'settings'];

    // tab -> injected pane element (cache; partials are fetched once).
    const panes = {};

    // Pull the tab id from a /admin/<tab> path (or an href): last path segment;
    // the role name or an empty path defaults to dashboard.
    function tabFromPath(pathname) {
        const segs = (pathname || '').split(/[?#]/)[0].replace(/\/+$/, '').split('/').filter(Boolean);
        const tab = segs[segs.length - 1];
        if (!tab || tab === 'admin') return 'dashboard';
        return VALID_TABS.includes(tab) ? tab : 'dashboard';
    }

    // Fetch + inject a tab's partial once; return its cached pane.
    async function ensurePane(tab) {
        if (panes[tab]) return panes[tab];
        const root = document.getElementById('tab-root');
        const pane = document.createElement('div');
        // Keep the monolith's <tab>-section id + content-section class (the admin
        // CSS shows .content-section.active and hides the rest).
        pane.id = tab + '-section';
        pane.className = 'content-section';
        try {
            const res = await fetch(`/admin/partials/${tab}.html`, { credentials: 'include' });
            pane.innerHTML = await res.text();
        } catch (err) {
            console.error('Failed to load partial for tab', tab, err);
            pane.innerHTML = '<div class="p-6 text-center text-red-600">Failed to load this section. Please refresh.</div>';
        }
        root.appendChild(pane);
        panes[tab] = pane;
        return pane;
    }

    // Show a tab: inject (if needed), reveal via .active, sync nav, init.
    async function showTab(tab) {
        if (!VALID_TABS.includes(tab)) tab = 'dashboard';
        const pane = await ensurePane(tab);

        // Visibility: same mechanism as showSection() — toggle .active.
        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
        pane.classList.add('active');

        // Active nav link (verbatim class swap from showSection()).
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active', 'bg-primary', 'text-white');
            link.classList.add('text-gray-700');
        });
        const activeLink = document.querySelector(`.nav-link[data-section="${tab}"]`);
        if (activeLink) {
            activeLink.classList.add('active', 'bg-primary', 'text-white');
            activeLink.classList.remove('text-gray-700');
        }

        // Run the tab's data load. init() must be idempotent (re-run on revisit).
        const mod = window.AdminTabs && window.AdminTabs[tab];
        if (mod && typeof mod.init === 'function') {
            try { mod.init(); } catch (err) { console.error('tab init error:', tab, err); }
        }

        window.scrollTo(0, 0);
    }

    // Navigate from a user action: push a new history entry, render, and (as
    // showSection did) close the sidebar on mobile.
    function navigate(tab) {
        if (!VALID_TABS.includes(tab)) tab = 'dashboard';
        history.pushState({ tab }, '', `${BASE}/${tab}`);
        showTab(tab);
        if (window.innerWidth < 1024 && typeof toggleSidebar === 'function') {
            toggleSidebar();
        }
    }

    function start() {
        // Intercept sidebar nav-link clicks (hrefs are real /admin/<tab> paths).
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

        // First load: render the tab from the URL. Normalise a bare /admin to
        // /admin/dashboard so the URL has a tab.
        const initial = tabFromPath(location.pathname);
        if (location.pathname.replace(/\/+$/, '') === BASE) {
            history.replaceState({ tab: initial }, '', `${BASE}/${initial}`);
        }
        showTab(initial);
    }

    return { start, showTab, navigate, tabFromPath };
})();

// Thin alias: the monolith's showSection() is replaced by the router, but the
// inline dashboard quick-action buttons still call showSection('<tab>').
window.showSection = function (tab) {
    window.AdminRouter.navigate(tab);
};
