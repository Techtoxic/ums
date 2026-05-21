/**
 * Authentication Utility
 * Cookie-based auth. Identity lives in an httpOnly cookie set by the server
 * at login; the browser auto-attaches it on every same-origin request when
 * fetch is called with credentials: 'include'. Dashboards call AUTH.me() on
 * page load to discover who the cookie identifies.
 */

(function(window) {
    'use strict';

    /**
     * Remove all known auth-related localStorage keys leftover from the pre-cookie
     * era. Called on every page load via the IIFE bottom-runner so cleanup happens
     * passively the first time any user opens the migrated build. Preserves
     * unrelated keys like dark-mode preferences and UI state.
     */
    function cleanupLegacyLocalStorage() {
        if (typeof localStorage === 'undefined') return;
        const KEYS_TO_REMOVE = [
            // Old AUTH_UTILS keys
            'authToken', 'authUser', 'authRole',
            // Per-role legacy token keys
            'adminToken', 'adminUser',
            'trainerToken', 'trainerData',
            'hodToken', 'hodData',
            'studentToken', 'studentData',
            // V1-era keys that may linger
            'currentUser', 'userToken',
        ];
        for (const k of KEYS_TO_REMOVE) {
            try { localStorage.removeItem(k); } catch (e) { /* private mode etc */ }
        }
    }

    /**
     * Read a cookie value by name. Cookies are document-readable so non-httpOnly
     * cookies like csrfToken can be picked up here. Returns null if absent.
     */
    function readCookie(name) {
        if (typeof document === 'undefined' || !document.cookie) return null;
        const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()\[\]\\\/\+^]/g, '\\$&') + '=([^;]*)'));
        return match ? decodeURIComponent(match[1]) : null;
    }

    /**
     * Fade and remove the auth gate overlay. Called only after requireAuth()
     * confirms the user is authenticated. No-op if no gate element exists.
     *
     * The fade-then-remove pattern (rather than instant removal) gives a smooth
     * transition into the real dashboard. On bfcache restoration, JS runs again
     * and either calls this (auth still valid) or redirects to login (revoked).
     */
    function hideAuthGate() {
        const el = document.getElementById('authGate');
        if (!el) return;
        el.classList.add('auth-gate--hiding');
        setTimeout(() => {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 250);
    }

    const AUTH_UTILS = {
        // Module-level cache of current user, populated by me()/init()
        _user: null,

        /**
         * Fetch the current user from /api/me. The cookie is sent automatically.
         * Caches the result so multiple dashboard panels don't all re-fetch.
         */
        async me({ force = false } = {}) {
            if (this._user && !force) return this._user;
            try {
                const response = await fetch('/api/me', {
                    method: 'GET',
                    credentials: 'include',
                });
                if (!response.ok) {
                    this._user = null;
                    return null;
                }
                const data = await response.json();
                this._user = data && data.user ? data.user : null;
                return this._user;
            } catch (err) {
                console.error('AUTH.me() failed:', err);
                this._user = null;
                return null;
            }
        },

        /**
         * Synchronously return the cached user (or null if not yet loaded).
         * Use after an `await AUTH.me()` somewhere earlier in the page lifecycle.
         */
        getUser() {
            return this._user;
        },

        /**
         * Synchronously return the cached user's role.
         */
        getRole() {
            return this._user ? this._user.role : null;
        },

        /**
         * True if /api/me has returned a user.
         */
        isAuthenticated() {
            return !!this._user;
        },

        /**
         * Log out: POST to /api/auth/logout (which clears the cookie AND bumps
         * token_version server-side), then clear any lingering localStorage keys,
         * then redirect to the login page for the current role.
         */
        async logout({ redirect = null, role = null } = {}) {
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    credentials: 'include',
                });
            } catch (err) {
                // Logout must never fail-fast. Continue with client cleanup either way.
                console.error('AUTH.logout server call failed:', err);
            }
            this._user = null;
            cleanupLegacyLocalStorage();
            const loginPath = redirect
                || (role === 'student' ? '/student/login'
                :   role === 'trainer' ? '/trainer/login'
                :   role === 'hod'     ? '/hod/login'
                :                        '/admin/login');
            window.location.href = loginPath;
        },

        /**
         * Make a cookie-authenticated API request. The cookie is sent automatically
         * via credentials: 'include'. No Authorization header is added — the backend
         * still accepts Bearer as fallback but we no longer send it.
         */
        async fetch(url, options = {}) {
            const method = (options.method || 'GET').toUpperCase();
            const isStateChanging = method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH';
            const isFormData = (typeof FormData !== 'undefined') && (options.body instanceof FormData);

            const headers = {
                ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
                ...(options.headers || {})
            };

            // Attach CSRF header on state-changing requests. The cookie is readable
            // (non-httpOnly) so JS can echo the value back. Server-side middleware
            // compares header against cookie — must match.
            if (isStateChanging) {
                const csrf = readCookie('csrfToken');
                if (csrf) headers['X-CSRF-Token'] = csrf;
            }

            const response = await fetch(url, {
                ...options,
                credentials: 'include',
                headers
            });
            // If the server tells us the session is dead, clean up and bounce to login.
            if (response.status === 401) {
                try {
                    const data = await response.clone().json();
                    if (data && (data.code === 'TOKEN_EXPIRED' || data.code === 'INVALID_TOKEN' || data.code === 'TOKEN_REVOKED' || data.code === 'NO_TOKEN')) {
                        cleanupLegacyLocalStorage();
                        this._user = null;
                        // Don't loop if we're already on a login page.
                        if (!/\/(admin|trainer|hod|student)\/login/.test(window.location.pathname)) {
                            window.location.href = '/admin/login';
                        }
                        throw new Error('Session expired. Please login again.');
                    }
                } catch (jsonErr) {
                    // Body wasn't JSON or didn't match our codes; fall through.
                }
            }
            // CSRF mismatch — usually means the token has expired or got out of
            // sync between cookie and header. Force a fresh login to re-issue
            // the cookie pair.
            if (response.status === 403) {
                try {
                    const data = await response.clone().json();
                    if (data && data.code === 'CSRF_FAILED') {
                        cleanupLegacyLocalStorage();
                        this._user = null;
                        if (!/\/(admin|trainer|hod|student)\/login/.test(window.location.pathname)) {
                            window.location.href = '/admin/login';
                        }
                        throw new Error('Security token expired. Please login again.');
                    }
                } catch (jsonErr) {
                    // fall through
                }
            }
            return response;
        },

        /**
         * Convenience wrappers.
         */
        async get(url) { const r = await this.fetch(url, { method: 'GET' });   return r.json(); },
        async post(url, data) { const r = await this.fetch(url, { method: 'POST',   body: JSON.stringify(data) }); return r.json(); },
        async put(url, data)  { const r = await this.fetch(url, { method: 'PUT',    body: JSON.stringify(data) }); return r.json(); },
        async delete(url)     { const r = await this.fetch(url, { method: 'DELETE' });                              return r.json(); },

        /**
         * Page-load guard for dashboards.
         * Awaits /api/me. If no user, bounces to the given login page. Returns the user otherwise.
         * Pages should call this at the top of their initialization.
         */
        async requireAuth(loginUrl = '/admin/login') {
            const user = await this.me();
            if (!user) {
                cleanupLegacyLocalStorage();
                if (!/\/(admin|trainer|hod|student)\/login/.test(window.location.pathname)) {
                    window.location.href = loginUrl;
                }
                return null;
            }
            // Auth succeeded — fade out the skeleton overlay so the dashboard becomes visible.
            hideAuthGate();
            return user;
        }
    };

    // Expose globally
    window.AUTH = AUTH_UTILS;
    window.cleanupLegacyLocalStorage = cleanupLegacyLocalStorage;
    window.hideAuthGate = hideAuthGate;
    window.readCookie = readCookie; // exposed for debugging

    // Passively clean up pre-cookie localStorage on every page load.
    cleanupLegacyLocalStorage();

    // Suppress the back-button bfcache flash on dashboards.
    //
    // When the user uses the browser back button to return to a dashboard after
    // logging out, Chrome restores the DOM from an in-memory snapshot it captured
    // at navigation time. That snapshot shows the dashboard AS IT WAS WHEN THE
    // USER CLICKED LOGOUT — including any data visible on screen — because
    // hideAuthGate() had already removed the skeleton overlay before logout.
    //
    // `pageshow` with event.persisted === true fires only on bfcache restoration
    // (NOT on normal navigation). When we detect it, force a fresh page load so
    // the browser re-renders the HTML from scratch. The fresh render includes
    // the skeleton overlay as the first body element, covering the dashboard
    // until requireAuth() resolves and either fades it (auth valid) or redirects
    // to login (auth dead).
    //
    // Cost: one extra HTTP request per back-button navigation to a logged-out
    // dashboard. The dashboard HTML is ~30KB, this is negligible.
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            window.location.reload();
        }
    });

    // ==========================================================================
    // Stage 2B-2A: centralized output-encoding helpers (XSS escaping).
    // One source of truth, loaded by every dashboard (they all load auth.js).
    // Strictness >= every former local escapeHtml (those escaped at most
    // & < > " ' ; this also escapes / ). Do not loosen.
    // ==========================================================================

    // HTML text context (and safe for double-quoted attribute values too,
    // since " is escaped). Escapes & < > " ' /.
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/\//g, '&#47;');
    }

    // HTML attribute context: escapeHtml plus backtick and space, so the value
    // is safe even in an unquoted attribute. Browsers decode &#32;/&#96; back
    // to space/backtick, so display is unaffected inside quoted attributes.
    function escapeAttr(value) {
        if (value === null || value === undefined) return '';
        return escapeHtml(value)
            .replace(/`/g, '&#96;')
            .replace(/ /g, '&#32;');
    }

    // JavaScript string context. Returns the escaped INNER content WITHOUT
    // surrounding quotes — the caller wraps it in quotes. Also neutralizes
    // </script>, HTML metacharacters and the JS line separators so it is safe
    // inside inline <script>/event-handler contexts.
    function escapeJs(value) {
        if (value === null || value === undefined) return '';
        const json = JSON.stringify(String(value));
        return json
            .slice(1, -1)
            .replace(/</g, '\\u003C')
            .replace(/>/g, '\\u003E')
            .replace(/&/g, '\\u0026')
            .replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029');
    }

    window.escapeHtml = escapeHtml;
    window.escapeAttr = escapeAttr;
    window.escapeJs = escapeJs;
    window.ESC = { escapeHtml: escapeHtml, escapeAttr: escapeAttr, escapeJs: escapeJs };

})(window);
