// portal-core.js — shared base + bootstrap for the deputy portal SPA.
//
// Rebuilt to reuse the admin component CSS/shell. Provides API_BASE_URL, the
// shared toast util, the admin-style sidebar collapse / off-canvas toggle, dark
// mode, profile menu, logout, showSection() alias, the academic-year chip, and
// the DOMContentLoaded bootstrap (loads identity, then starts the router).
//
// Load order: dashboard-theme.js -> config.js -> auth.js -> portal-core.js ->
// portal-router.js -> tab modules.

// ---- API base (verbatim) ----
        const API_BASE_URL = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : `${window.location.protocol}//${window.location.host}/api`;

// ---- shared toast (verbatim) ----
        // Toast Notification Function
        function showToast(message, type = 'success') {
            const toast = document.createElement('div');
            toast.className = `fixed bottom-4 right-4 p-4 rounded-lg shadow-lg text-white mb-4 transform transition-all duration-300 z-50 ${
                type === 'success' ? 'bg-success' : 'bg-danger'
            }`;
            toast.innerHTML = `
                <div class="flex items-center gap-2">
                    <i class="${type === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'}"></i>
                    <span>${escapeHtml(message)}</span>
                </div>
            `;

            document.body.appendChild(toast);

            setTimeout(() => {
                toast.classList.add('opacity-0');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        primary: '#7A0C0C',
                        secondary: '#8B2A2A',
                        success: '#22c55e',
                        warning: '#f59e0b',
                        danger: '#ef4444',
                    }
                }
            }
        }

// ---- dark mode ----
// Theme is owned by the shared controller (public/js/dashboard-theme.js): the
// [data-theme-toggle] button is auto-wired, the choice persists under the 'theme'
// key, and it's applied PRE-PAINT on every load — so light/dark survives SPA
// navigation and reloads. We only mirror the state onto the #dark-mode-icon.
// (Previously there were TWO controllers — dashboard-theme.js + a local 'darkMode'
//  toggle — which double-toggled and never persisted light.)
function syncDarkIcon() {
    const icon = document.getElementById('dark-mode-icon');
    if (!icon) return;
    const isDark = window.DASHBOARD_THEME
        ? window.DASHBOARD_THEME.get() === 'dark'
        : document.documentElement.classList.contains('dark');
    icon.className = (isDark ? 'ri-sun-line' : 'ri-moon-line') + ' text-lg';
}
window.addEventListener('themeChanged', syncDarkIcon);
document.addEventListener('DOMContentLoaded', syncDarkIcon);

// Back-compat: any inline caller of toggleDarkMode() routes to the shared controller.
function toggleDarkMode() { if (window.DASHBOARD_THEME) window.DASHBOARD_THEME.toggle(); }

// ---- sidebar (admin-parity) ----
// One toggle for both modes: on mobile (<1024) it slides the off-canvas sidebar
// in/out; on desktop it collapses the wide sidebar to an icon rail and persists
// that choice. Styling is driven by classes on #deputy-shell (admin-portal.css).
function toggleSidebar() {
    const shell = document.getElementById('deputy-shell');
    if (!shell) return;
    if (window.innerWidth < 1024) {
        shell.classList.toggle('sidebar-open');
    } else {
        const collapsed = shell.classList.toggle('sidebar-collapsed');
        try { localStorage.setItem('deputy-sidebar-collapsed', collapsed ? '1' : '0'); } catch (e) { /* ignore */ }
    }
}

// Restore the persisted desktop collapse state on load.
function applySidebarState() {
    const shell = document.getElementById('deputy-shell');
    if (shell && localStorage.getItem('deputy-sidebar-collapsed') === '1') {
        shell.classList.add('sidebar-collapsed');
    }
}
document.addEventListener('DOMContentLoaded', applySidebarState);

// Legacy off-canvas helpers kept as thin aliases (the router calls closeSidebar()).
function openSidebar() {
    const shell = document.getElementById('deputy-shell');
    if (shell) shell.classList.add('sidebar-open');
}
function closeSidebar() {
    const shell = document.getElementById('deputy-shell');
    if (shell) shell.classList.remove('sidebar-open');
}

// ---- profile menu ----
function toggleProfileMenu() {
    const menu = document.getElementById('profile-menu');
    if (menu) menu.classList.toggle('hidden');
}
document.addEventListener('click', function (e) {
    const menu = document.getElementById('profile-menu');
    const button = menu ? menu.previousElementSibling : null;
    if (menu && !menu.contains(e.target) && !(button && button.contains(e.target))) {
        menu.classList.add('hidden');
    }
});

// ---- logout ----
async function logout() {
    if (confirm('Are you sure you want to logout?')) {
        await window.AUTH.logout({ role: 'admin' });
    }
}

// ---- showSection alias (router navigate) ----
function showSection(tab) {
    if (window.DeputyRouter) window.DeputyRouter.navigate(tab);
}

// ---- academic-year chip ----
async function loadAcademicYearChip() {
    const chip = document.getElementById('academic-year-chip');
    if (!chip) return;
    try {
        const res = await window.AUTH.fetch(`${API_BASE_URL}/system-settings/current_academic_year`);
        if (!res.ok) return;
        const data = await res.json();
        const value = data && (data.value || data.current_academic_year);
        if (value) {
            chip.textContent = `AY ${value}`;
            chip.classList.remove('hidden');
        }
    } catch (e) { /* best-effort: leave hidden */ }
}

// ---- global exposures for inline onclick= handlers ----
window.toggleSidebar = toggleSidebar;
window.openSidebar = openSidebar;
window.closeSidebar = closeSidebar;
window.toggleProfileMenu = toggleProfileMenu;
window.toggleDarkMode = toggleDarkMode;
window.logout = logout;
window.showSection = showSection;

// ---- bootstrap (new): identity + logout, then start the router ----
document.addEventListener('DOMContentLoaded', async () => {
    // Cookie-based auth: requireAuth bounces to /admin/login on no/expired session
    // and populates the sidebar profile from /api/me.
    try {
        if (window.AUTH && typeof window.AUTH.requireAuth === 'function') {
            const user = await window.AUTH.requireAuth('/admin/login');
            if (user && user.name) {
                const userName = document.getElementById('userName');
                const userAvatar = document.getElementById('userAvatar');
                const welcomeName = document.getElementById('welcomeName');
                if (userName) userName.textContent = user.name;
                if (welcomeName) welcomeName.textContent = user.name;
                if (userAvatar) userAvatar.textContent = user.name.charAt(0).toUpperCase();
            }
        }
    } catch (e) { console.error('Auth init failed:', e); }

    // Load the shared programs/departments catalog once before tabs render.
    // CRITICAL: never let a catalog failure (e.g. a 429) abort the bootstrap —
    // the router MUST start, or every tab renders blank and nav falls back to
    // full-page reloads (which reset the theme). So this is best-effort.
    try { if (window.Catalog) await window.Catalog.ready(); } catch (e) { console.error('Catalog load failed (continuing):', e); }

    // Academic-year chip in the topbar (best-effort; deputy is authorized).
    loadAcademicYearChip();

    if (window.DeputyRouter) window.DeputyRouter.start();
});
