'use strict';

/**
 * portalPages.js — one reusable registrar for the EDTTI tabbed-SPA portal pages.
 *
 * Every tabbed portal (admin, hod, trainer, student, finance, registrar, dean,
 * deputy, ilo) used to hand-roll the SAME ~5 page routes with different names.
 * registerPortal() folds that duplication into a single config-driven call per
 * portal, so the routing logic is ONE tested thing instead of nine copies.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ROUTE ORDER IS LOAD-BEARING. Express matches in registration order, and the
 * catch-all `GET /<role>/:tab` matches ANY single segment after /<role>
 * (including 'login', 'dashboard', a bogus tab, etc.). So every more-specific
 * /<role>/... route MUST be registered BEFORE that catch-all or it gets shadowed.
 * registerPortal registers, strictly in this order:
 *
 *   1. login              GET /<role>/login              (302 redirect OR file)
 *   2. extraPages[]       GET <page.path>                (file, noCacheAuthPages)
 *   3. partials           GET /<role>/partials/:name.html (whitelisted → 404/file)
 *   4. legacy bare alias  GET /<role>/<alias>            (301 → default tab)  [opt]
 *   5. legacy alias/:tab  GET /<role>/<alias>/:tab       (301 → /<role>/:tab)
 *   6. bare role          GET /<role>                    (302 → default tab)
 *   7. catch-all          GET /<role>/:tab               (shell iff whitelisted)
 *
 * The catch-all calls next() for a non-whitelisted :tab, so unrelated /<role>/*
 * routes registered elsewhere (and a genuine 404) still resolve. Because each
 * catch-all is scoped to its own /<role> prefix, portals never shadow each other;
 * registering them where their old blocks lived preserves the global order.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @param app   the Express app
 * @param deps  { serveHTML, noCacheAuthPages, path, __dirname } — passed in so the
 *              helper reuses server.js's Vercel-aware serveHTML + its __dirname
 *              (NOT this module's dir).
 * @param config {
 *   role,        // URL prefix /<role> and (default) component dir
 *   componentDir,// folder under src/components/ (defaults to role)
 *   tabs,        // string[] tab whitelist
 *   defaultTab,  // tab the bare /<role> redirects to
 *   login,       // { redirectTo } OR { file } OR { fileSegments: [...] }
 *   extraPages,  // optional [{ path, file | fileSegments }] (e.g. /admin/first-login)
 *   legacyAlias, // legacy path segment for the redirects (default 'dashboard';
 *                //   'portal' for student)
 *   legacyDashboardRedirect, // if true, also register GET /<role>/<alias> →
 *                //   /<role>/<defaultTab> (needed when the alias is not a real tab,
 *                //   i.e. hod/dean/ilo, and for student's /portal alias)
 * }
 */
function registerPortal(app, deps, config) {
    const { serveHTML, noCacheAuthPages, path, __dirname } = deps;
    const {
        role,
        componentDir = role,
        tabs,
        defaultTab,
        login = {},
        extraPages = [],
        legacyAlias = 'dashboard',
        legacyDashboardRedirect = false,
    } = config;

    const base = `/${role}`;
    const tabSet = new Set(tabs);
    const componentPath = (...segs) =>
        path.join(__dirname, 'src', 'components', componentDir, ...segs);
    // A login/extra page may live outside the component dir (student's login is
    // the shared src/login.html) — fileSegments are resolved from __dirname.
    const pagePathOf = (spec) =>
        spec.fileSegments ? path.join(__dirname, ...spec.fileSegments) : componentPath(spec.file);

    // ---- 1. login ----------------------------------------------------------
    // Redirect-style logins (finance/registrar/dean/deputy/ilo) carry NO no-cache
    // headers — they 302 elsewhere. File-style logins (admin/hod/trainer/student)
    // DO get noCacheAuthPages so the browser never re-displays a cached auth page.
    if (login.redirectTo) {
        app.get(`${base}/login`, (req, res) => res.redirect(login.redirectTo));
    } else if (login.file || login.fileSegments) {
        const loginPath = pagePathOf(login);
        app.get(`${base}/login`, noCacheAuthPages, (req, res) => serveHTML(res, loginPath));
    }

    // ---- 2. extra standalone pages (e.g. admin /admin/first-login) ---------
    for (const page of extraPages) {
        const pagePath = pagePathOf(page);
        app.get(page.path, noCacheAuthPages, (req, res) => serveHTML(res, pagePath));
    }

    // ---- 3. tab partials (whitelisted HTML fragments → #tab-root) ----------
    app.get(`${base}/partials/:name.html`, noCacheAuthPages, (req, res) => {
        const name = req.params.name;
        if (!tabSet.has(name)) {
            return res.status(404).send('Not found');
        }
        serveHTML(res, componentPath('partials', `${name}.html`));
    });

    // ---- 4. legacy bare alias → default tab --------------------------------
    // Only when the alias is NOT itself a real tab: hod/dean/ilo ('dashboard' is
    // not a tab) and student ('portal'). For portals whose default tab IS
    // 'dashboard', the bare /<role>/dashboard is just the dashboard tab and is
    // served by the catch-all, so no redirect is registered.
    if (legacyDashboardRedirect) {
        app.get(`${base}/${legacyAlias}`, (req, res) => res.redirect(301, `${base}/${defaultTab}`));
    }

    // ---- 5. legacy alias/:tab → /<role>/:tab (all portals) -----------------
    app.get(`${base}/${legacyAlias}/:tab`, (req, res) => res.redirect(301, `${base}/${req.params.tab}`));

    // ---- 6. bare /<role> → default tab -------------------------------------
    app.get(base, (req, res) => res.redirect(302, `${base}/${defaultTab}`));

    // ---- 7. catch-all: serve the shell iff :tab is whitelisted, else next() -
    app.get(`${base}/:tab`, noCacheAuthPages, (req, res, next) => {
        if (!tabSet.has(req.params.tab)) return next();
        serveHTML(res, componentPath('portal-shell.html'));
    });
}

module.exports = { registerPortal };
