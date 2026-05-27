// portal-router.js — tiny History-API router for the ILO portal SPA.
//
// The ILO portal has no sidebar: two inline <button onclick="showTab('<tab>')">
// in the shell's button bar ARE the nav. Routes are /ilo/<tab> for the 2 known
// tabs; DEFAULT is "graduation-applications". The server serves the same shell
// for /ilo and /ilo/<tab>, so this router reads the tab from the last path
// segment, lazily fetches that tab's partial into a cached pane inside
// <main id="tab-root">, toggles visibility via the .hidden class (the ILO markup
// hides .tab-content panes with `hidden`), swaps the active button's
// btn--primary/btn--ghost, and calls the tab's idempotent init()
// (window.ILOTabs[tab].init — bracket notation for the hyphenated tab names).
//
// showTab() (the monolith global the buttons call) is re-exported as an alias to
// navigate(), so the existing inline onclick="showTab('<tab>')" handlers keep
// working unchanged — no click-wiring is done here.
// Load order: after portal-core.js, before/with the tab modules.

window.ILORouter = (function () {
    const BASE = '/ilo';
    const DEFAULT_TAB = 'graduation-applications';
    const VALID_TABS = ['graduation-applications', 'attachment-applications'];

    // tab -> injected pane element (cache; partials are fetched once).
    const panes = {};

    // Pull the tab id from a /ilo/<tab> path: last path segment; the role name
    // or an empty path defaults to graduation-applications.
    function tabFromPath(pathname) {
        const segs = (pathname || '').split(/[?#]/)[0].replace(/\/+$/, '').split('/').filter(Boolean);
        const tab = segs[segs.length - 1];
        if (!tab || tab === 'ilo') return DEFAULT_TAB;
        return VALID_TABS.includes(tab) ? tab : DEFAULT_TAB;
    }

    // Fetch + inject a tab's partial once; return its cached pane.
    async function ensurePane(tab) {
        if (panes[tab]) return panes[tab];
        const root = document.getElementById('tab-root');
        const pane = document.createElement('div');
        // Keep the monolith's section id (no prefix) + tab-content class; start
        // hidden (showTab below removes .hidden on the active pane).
        pane.id = tab;
        pane.className = 'tab-content hidden';
        try {
            const res = await fetch(`/ilo/partials/${tab}.html`, { credentials: 'include' });
            pane.innerHTML = await res.text();
        } catch (err) {
            console.error('Failed to load partial for tab', tab, err);
            pane.innerHTML = '<div class="text-center py-12 text-red-500">Failed to load this section. Please refresh.</div>';
        }
        root.appendChild(pane);
        panes[tab] = pane;
        return pane;
    }

    // Show a tab: inject (if needed), reveal via .hidden toggle, sync the active
    // button, init. Mirrors the monolith showTab() visibility + button swap.
    async function showTab(tab) {
        if (!VALID_TABS.includes(tab)) tab = DEFAULT_TAB;
        const pane = await ensurePane(tab);

        // Visibility: hide every injected pane, reveal the selected one.
        Object.keys(panes).forEach(t => panes[t].classList.add('hidden'));
        pane.classList.remove('hidden');

        // Active button: same mechanism as showTab() — reset all .tab-button to
        // ghost, then mark the matching button (its onclick contains the tab name).
        document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.remove('btn--primary');
            button.classList.add('btn--ghost');
        });
        const activeButton = document.querySelector('[onclick*="' + tab + '"]');
        if (activeButton) {
            activeButton.classList.remove('btn--ghost');
            activeButton.classList.add('btn--primary');
        }

        // Run the tab's data load. init() must be idempotent (re-run on revisit).
        const mod = window.ILOTabs && window.ILOTabs[tab];
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
        // The button bar calls showTab('<tab>') inline; showTab is aliased to
        // navigate() below, so no click handlers are wired here.

        // Back/forward: render from the URL, do NOT push again.
        window.addEventListener('popstate', () => {
            showTab(tabFromPath(location.pathname));
        });

        // First load: render the tab from the URL. Normalise a bare /ilo to
        // /ilo/graduation-applications so the URL has a tab.
        const initial = tabFromPath(location.pathname);
        if (location.pathname.replace(/\/+$/, '') === BASE) {
            history.replaceState({ tab: initial }, '', `${BASE}/${initial}`);
        }
        showTab(initial);
    }

    return { start, showTab, navigate, tabFromPath };
})();

// Keep the monolith's global entry point working: the inline button onclicks call
// showTab('<tab>'); route them through the History-API router.
window.showTab = (tab) => window.ILORouter.navigate(tab);
