// portal-router.js — tiny History-API router for the trainer portal SPA.
//
// Adapted from the student/registrar routers. Routes are /trainer/<tab> for the
// 7 known tabs. The server serves the same shell for /trainer and /trainer/<tab>,
// so this router reads the tab from the last path segment, lazily fetches that
// tab's partial into a cached pane inside <main id="tab-root">, marks the nav
// item active (replicating the monolith showSection() class swap), sets the page
// title, updates currentSection, closes the mobile sidebar, and calls the tab's
// idempotent init() (window.TrainerTabs[tab].init).
//
// Replaces the monolith's showSection(). window.showSection is kept below as a
// thin alias so the inline dashboard quick-action buttons keep working.
// Load order: after portal-core.js, before/with the tab modules.

window.TrainerRouter = (function () {
    const BASE = '/trainer';
    const VALID_TABS = ['dashboard', 'assignments', 'students', 'books', 'tools-of-trade', 'payslips', 'notifications', 'profile'];

    // Page titles — same map the monolith's showSection() used.
    const TITLES = {
        'dashboard': 'Dashboard',
        'assignments': 'My Assignments',
        'students': 'My Students',
        'books': 'Unit Books',
        'tools-of-trade': 'Tools of Trade',
        'payslips': 'My Payslips',
        'notifications': 'Notifications',
        'profile': 'Profile Settings'
    };

    // Active/inactive nav-item class sets (verbatim from showSection()).
    const ACTIVE_CLASSES = ['bg-primary/10', 'text-primary', 'dark:bg-primary/20', 'dark:text-primary-light'];
    const INACTIVE_CLASSES = ['text-gray-600', 'dark:text-gray-400', 'hover:bg-gray-100', 'dark:hover:bg-gray-700', 'hover:text-gray-900', 'dark:hover:text-white'];

    // tab -> in-flight/resolved pane PROMISE (memoized so concurrent showTab()
    // calls for the same tab can't double-inject the partial), and tab ->
    // resolved pane element (for the hide loop).
    const panePromises = {};
    const paneEls = {};

    // Pull the tab id from a /trainer/<tab> path (or an href): last path segment;
    // the role name or an empty path defaults to dashboard.
    function tabFromPath(pathname) {
        const segs = (pathname || '').split(/[?#]/)[0].replace(/\/+$/, '').split('/').filter(Boolean);
        const tab = segs[segs.length - 1];
        if (!tab || tab === 'trainer') return 'dashboard';
        return VALID_TABS.includes(tab) ? tab : 'dashboard';
    }

    // Fetch + inject a tab's partial exactly once; return its (memoized) pane.
    // The promise is cached SYNCHRONOUSLY before the first await so two near-
    // simultaneous calls share one pane instead of each creating their own.
    function ensurePane(tab) {
        if (panePromises[tab]) return panePromises[tab];
        panePromises[tab] = (async () => {
            const root = document.getElementById('tab-root');
            // Reuse an existing node if one is somehow already in the DOM.
            let pane = document.getElementById('section-' + tab);
            if (!pane) {
                pane = document.createElement('div');
                // Keep the monolith's section-<tab> id + content-section class.
                pane.id = 'section-' + tab;
                pane.className = 'content-section hidden';
                try {
                    const res = await fetch(`/trainer/partials/${tab}.html`, { credentials: 'include' });
                    pane.innerHTML = await res.text();
                } catch (err) {
                    console.error('Failed to load partial for tab', tab, err);
                    pane.innerHTML = '<div class="p-6 text-center text-red-600">Failed to load this section. Please refresh.</div>';
                }
                root.appendChild(pane);
            }
            paneEls[tab] = pane;
            return pane;
        })();
        return panePromises[tab];
    }

    // Show a tab: inject (if needed), reveal it, hide the rest, sync chrome, init.
    async function showTab(tab) {
        if (!VALID_TABS.includes(tab)) tab = 'dashboard';
        const pane = await ensurePane(tab);

        Object.keys(paneEls).forEach(t => paneEls[t].classList.add('hidden'));
        pane.classList.remove('hidden');

        // Active nav-item (verbatim class swap from showSection()).
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove(...ACTIVE_CLASSES);
            item.classList.add(...INACTIVE_CLASSES);
        });
        const activeNav = document.getElementById(`nav-${tab}`);
        if (activeNav) {
            activeNav.classList.remove(...INACTIVE_CLASSES);
            activeNav.classList.add(...ACTIVE_CLASSES);
        }

        // Page title.
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) pageTitle.textContent = TITLES[tab] || tab;

        // Keep the shared currentSection (used by loadAssignments/loadStudents) in sync.
        if (typeof currentSection !== 'undefined') currentSection = tab;

        // Run the tab's data load. init() must be idempotent (re-run on revisit).
        const mod = window.TrainerTabs && window.TrainerTabs[tab];
        if (mod && typeof mod.init === 'function') {
            try { mod.init(); } catch (err) { console.error('tab init error:', tab, err); }
        }

        // Close the mobile sidebar (as showSection did).
        if (typeof closeMobileSidebar === 'function') closeMobileSidebar();

        window.scrollTo(0, 0);
    }

    // Navigate from a user action: push a new history entry, then render.
    function navigate(tab) {
        if (!VALID_TABS.includes(tab)) tab = 'dashboard';
        history.pushState({ tab }, '', `${BASE}/${tab}`);
        showTab(tab);
    }

    function start() {
        // Intercept sidebar nav-item clicks (hrefs are real /trainer/<tab> paths).
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

        // First load: render the tab from the URL. Normalise a bare /trainer to
        // /trainer/dashboard so the URL has a tab.
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
    window.TrainerRouter.navigate(tab);
};
