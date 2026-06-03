// portal-router.js — tiny History-API router for the student portal SPA.
//
// Routes are /student/portal/<tab> for the 10 known tabs. The server serves the
// same shell for /student/portal and /student/portal/<anything>, so this router
// reads the tab from the URL, lazily fetches that tab's partial into a cached
// pane inside <main id="tab-root">, marks the nav link active, sets the page
// title, and calls the tab's idempotent init() (window.StudentTabs[tab].init).
//
// Replaces the monolith's hash-based activateTab()/navigation in setupUI().
// Load order: after portal-core.js, before/with the tab modules.

window.StudentRouter = (function () {
    const BASE = '/student';
    const VALID_TABS = ['dashboard', 'profile', 'financial', 'payments', 'uploads', 'notes', 'units', 'books', 'graduation', 'attachment'];

    // Page titles — same map the monolith's activateTab() used.
    const TITLES = {
        'dashboard': 'Dashboard',
        'profile': 'Profile',
        'financial': 'Financial Information',
        'payments': 'Payment History',
        'uploads': 'Uploads',
        'notes': 'Notes',
        'units': 'Units & Courses',
        'books': 'My Books',
        'graduation': 'Apply for Graduation',
        'attachment': 'Apply for Attachment'
    };

    // tab -> injected pane element (cache; partials are fetched once).
    const panes = {};

    // Pull the tab id from a /student/<tab> path (or an href): take the last path
    // segment; the role name or an empty path defaults to dashboard. (Also tolerates
    // the legacy /student/portal/<tab> shape — the last segment is still the tab.)
    function tabFromPath(pathname) {
        const segs = (pathname || '').split(/[?#]/)[0].replace(/\/+$/, '').split('/').filter(Boolean);
        const tab = segs[segs.length - 1];
        if (!tab || tab === 'student') return 'dashboard';
        return VALID_TABS.includes(tab) ? tab : 'dashboard';
    }

    // Fetch + inject a tab's partial once; return its cached pane.
    async function ensurePane(tab) {
        if (panes[tab]) return panes[tab];
        const root = document.getElementById('tab-root');
        const pane = document.createElement('div');
        // Keep the section id + content-section class so existing CSS and code
        // (e.g. navigateUnitsPage's getElementById('units') + .hidden check) work.
        pane.id = tab;
        pane.className = 'content-section hidden';
        try {
            const res = await fetch(`/student/partials/${tab}.html`, { credentials: 'include' });
            pane.innerHTML = await res.text();
        } catch (err) {
            console.error('Failed to load partial for tab', tab, err);
            pane.innerHTML = '<div class="p-6 text-center text-red-600">Failed to load this section. Please refresh.</div>';
        }
        root.appendChild(pane);
        panes[tab] = pane;
        return pane;
    }

    // Show a tab: inject (if needed), reveal it, hide the rest, sync chrome, init.
    async function showTab(tab) {
        if (!VALID_TABS.includes(tab)) tab = 'dashboard';
        const pane = await ensurePane(tab);

        // Show target, hide all other cached panes.
        Object.keys(panes).forEach(t => panes[t].classList.add('hidden'));
        pane.classList.remove('hidden');

        // Active nav link (hrefs are real /student/portal/<tab> paths).
        document.querySelectorAll('.nav-link').forEach(nl => nl.classList.remove('active', 'bg-primary', 'text-white'));
        const activeLink = document.querySelector(`.nav-link[href="${BASE}/${tab}"]`);
        if (activeLink) activeLink.classList.add('active', 'bg-primary', 'text-white');

        // Page title.
        const pageTitle = document.getElementById('page-title');
        if (pageTitle) pageTitle.textContent = TITLES[tab] || 'Dashboard';

        // Close the mobile menu (as activateTab did).
        document.getElementById('sidebar')?.classList.remove('mobile-open');
        document.getElementById('mobile-overlay')?.classList.add('hidden');

        // Run the tab's data load. Init must be idempotent (re-run on revisit).
        const mod = window.StudentTabs && window.StudentTabs[tab];
        if (mod && typeof mod.init === 'function') {
            try { mod.init(); } catch (err) { console.error('tab init error:', tab, err); }
        }

        // Keep the page scrolled to the top on tab change.
        window.scrollTo(0, 0);
    }

    // Navigate from a user action: push a new history entry, then render.
    function navigate(tab) {
        history.pushState({ tab }, '', `${BASE}/${tab}`);
        showTab(tab);
    }

    function start() {
        // Intercept sidebar nav-link clicks.
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

        // First load: render the tab from the URL. Normalise a bare
        // /student to /student/dashboard so the URL has a tab.
        const initial = tabFromPath(location.pathname);
        if (location.pathname.replace(/\/+$/, '') === BASE) {
            history.replaceState({ tab: initial }, '', `${BASE}/${initial}`);
        }
        showTab(initial);
    }

    return { start, showTab, navigate, tabFromPath };
})();
