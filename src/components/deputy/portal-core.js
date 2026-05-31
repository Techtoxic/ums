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
// dashboard-theme.js auto-wires [data-theme-toggle], but admin-style markup also
// calls toggleDarkMode() inline and shows a #dark-mode-icon, so keep both in sync.
function toggleDarkMode() {
    const html = document.documentElement;
    const icon = document.getElementById('dark-mode-icon');
    if (html.classList.contains('dark')) {
        html.classList.remove('dark');
        localStorage.setItem('darkMode', 'false');
        if (icon) icon.className = 'ri-moon-line text-lg';
    } else {
        html.classList.add('dark');
        localStorage.setItem('darkMode', 'true');
        if (icon) icon.className = 'ri-sun-line text-lg';
    }
}

function initDarkMode() {
    const icon = document.getElementById('dark-mode-icon');
    if (document.documentElement.classList.contains('dark') || localStorage.getItem('darkMode') === 'true') {
        document.documentElement.classList.add('dark');
        if (icon) icon.className = 'ri-sun-line text-lg';
    }
}
document.addEventListener('DOMContentLoaded', initDarkMode);

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

    // Load the shared programs/departments catalog once before tabs render.
    if (window.Catalog) { await window.Catalog.ready(); }

    // Academic-year chip in the topbar (best-effort; deputy is authorized).
    loadAcademicYearChip();

    if (window.DeputyRouter) window.DeputyRouter.start();
});
