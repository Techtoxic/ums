/* ============================================================================
   EDTTI UMS — Dashboard Theme Controller
   Phase 1 foundation. Vanilla ES6, zero dependencies.

   Runs SYNCHRONOUSLY on script load and applies the stored theme to
   <html> before paint, so there is no flash-of-wrong-theme. Load this
   in <head> AFTER dashboard-styles.css and BEFORE the body renders.

   Public API (global):
       window.DASHBOARD_THEME.get()     -> 'light' | 'dark'
       window.DASHBOARD_THEME.set(t)    -> void   (t = 'light' | 'dark')
       window.DASHBOARD_THEME.toggle()  -> 'light' | 'dark' (new theme)
       window.DASHBOARD_THEME.init()    -> void   (re-applies stored theme)

   On every change a `themeChanged` CustomEvent is dispatched on window
   with detail `{ theme }`, so charts/widgets can recolor live.

   Toggle button markup (any element with [data-theme-toggle] is auto-wired):
       <button data-theme-toggle class="theme-toggle" aria-label="Toggle dark mode">
           <i class="ri-sun-line theme-icon-light"></i>
           <i class="ri-moon-line theme-icon-dark"></i>
       </button>
   ============================================================================ */
(function () {
    'use strict';

    var STORAGE_KEY = 'theme';
    var root = document.documentElement;

    function prefersDark() {
        return window.matchMedia &&
            window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function stored() {
        try {
            return localStorage.getItem(STORAGE_KEY);
        } catch (e) {
            return null; // private mode / storage disabled
        }
    }

    function persist(theme) {
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch (e) {
            /* non-fatal: theme still applies for this session */
        }
    }

    function apply(theme) {
        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
    }

    function resolveInitial() {
        var s = stored();
        if (s === 'dark' || s === 'light') return s;
        return prefersDark() ? 'dark' : 'light';
    }

    function get() {
        return root.classList.contains('dark') ? 'dark' : 'light';
    }

    function set(theme) {
        if (theme !== 'dark' && theme !== 'light') return;
        apply(theme);
        persist(theme);
        try {
            window.dispatchEvent(new CustomEvent('themeChanged', {
                detail: { theme: theme }
            }));
        } catch (e) {
            /* CustomEvent unsupported (very old browsers) — ignore */
        }
    }

    function toggle() {
        var next = get() === 'dark' ? 'light' : 'dark';
        set(next);
        return next;
    }

    function init() {
        apply(resolveInitial());
    }

    // Auto-wire any [data-theme-toggle] control once the DOM is ready.
    function wireToggles() {
        var nodes = document.querySelectorAll('[data-theme-toggle]');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].__themeWired) continue;
            nodes[i].__themeWired = true;
            nodes[i].addEventListener('click', function () { toggle(); });
        }
    }

    // Apply stored/preferred theme immediately (pre-paint, no flash).
    init();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wireToggles);
    } else {
        wireToggles();
    }

    window.DASHBOARD_THEME = {
        get: get,
        set: set,
        toggle: toggle,
        init: init
    };
})();
