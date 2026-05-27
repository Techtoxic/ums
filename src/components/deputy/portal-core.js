// portal-core.js — shared base + bootstrap for the deputy portal SPA.
//
// Folds in API_BASE_URL, the shared toast util, the mobile sidebar helpers, and
// the sidebar-collapse / resize / mobile-menu shell wiring. Verbatim moves except
// the DOMContentLoaded bootstrap at the bottom (loads identity, then starts the
// router). switchTab() is replaced by portal-router.js.
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

// ---- mobile sidebar helpers (verbatim) ----
        // Mobile sidebar helpers — design-system pattern (.dashboard-sidebar.open
        // + .dashboard-sidebar__backdrop.show). Theme toggling is handled by the
        // [data-theme-toggle] button auto-wired in /public/js/dashboard-theme.js,
        // so the old themeToggle listener is gone.
        function openSidebar() {
            const sb = document.getElementById('sidebar');
            const bd = document.getElementById('sbBackdrop');
            if (sb) sb.classList.add('open');
            if (bd) bd.classList.add('show');
        }
        function closeSidebar() {
            const sb = document.getElementById('sidebar');
            const bd = document.getElementById('sbBackdrop');
            if (sb) sb.classList.remove('open');
            if (bd) bd.classList.remove('show');
        }

// ---- sidebar collapse + responsive shell wiring (verbatim top-level block) ----
        // Sidebar collapse functionality
        let sidebarCollapsed = false;
        const toggleSidebar = document.getElementById('toggleSidebar');
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.querySelector('main');

        if (toggleSidebar && sidebar) {
            toggleSidebar.addEventListener('click', () => {
                sidebarCollapsed = !sidebarCollapsed;
                
                if (sidebarCollapsed) {
                    sidebar.classList.add('w-16');
                    sidebar.classList.remove('w-64');
                    toggleSidebar.innerHTML = '<i class="ri-menu-unfold-line text-xl text-slate-600 dark:text-slate-300"></i>';
                    
                    // Hide text in navigation items
                    const navSpans = sidebar.querySelectorAll('nav span');
                    navSpans.forEach(span => span.classList.add('hidden'));
                } else {
                    sidebar.classList.remove('w-16');
                    sidebar.classList.add('w-64');
                    toggleSidebar.innerHTML = '<i class="ri-menu-fold-line text-xl text-slate-600 dark:text-slate-300"></i>';
                    
                    // Show text in navigation items
                    const navSpans = sidebar.querySelectorAll('nav span');
                    navSpans.forEach(span => span.classList.remove('hidden'));
                }
            });
        }

        // Mobile responsive behavior
        function handleResize() {
            if (window.innerWidth < 1024) {
                // Mobile: sidebar should be hidden by default
                sidebar.classList.add('-translate-x-full');
                sidebar.classList.remove('w-16');
                sidebar.classList.add('w-64');
            } else {
                // Desktop: show sidebar
                sidebar.classList.remove('-translate-x-full');
            }
        }

        // Handle window resize
        window.addEventListener('resize', handleResize);
        
        // Initialize on load
        handleResize();

        // Mobile menu functionality
        const mobileMenuBtn = document.getElementById('menuBtn');
        if (mobileMenuBtn && sidebar) {
            mobileMenuBtn.addEventListener('click', () => {
                sidebar.classList.toggle('-translate-x-full');
                document.body.classList.toggle('menu-open');
            });
        }

// ---- bootstrap (new): identity + logout, then start the router ----
document.addEventListener('DOMContentLoaded', async () => {
    // Cookie-based auth: requireAuth bounces to /admin/login on no/expired session
    // and populates the sidebar profile + welcome line from /api/me.
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
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn && window.AUTH && typeof window.AUTH.logout === 'function') {
        logoutBtn.addEventListener('click', () => window.AUTH.logout({ role: 'admin' }));
    }

    if (window.DeputyRouter) window.DeputyRouter.start();
});
