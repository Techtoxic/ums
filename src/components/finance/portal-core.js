// portal-core.js — shared base + bootstrap for the finance portal SPA.
//
// Folds in the finance utils/state, authFetch/API_BASE_URL, shell chrome (sidebar,
// dark mode), toast/notification, and identity bootstrap. Verbatim moves except
// the DOMContentLoaded bootstrap at the bottom (loads identity + starts router).
// The dead financeDashboard.js showToast (overridden in the monolith by the inline
// one) is dropped; the inline showToast is kept here as the single definition.
//
// Load order: dashboard-theme.js -> config.js -> auth.js -> portal-core.js ->
// portal-router.js -> tab modules.

// ---- authFetch + formatCourseName (formatCourseName now DB-backed via Catalog) ----
// Authenticated fetch wrapper — guarded against double-declaration.
// financeAnalytics.js also defines this; both load as classic scripts so a
// bare top-level `const` collides in global scope. window assignment is
// idempotent. Bare authFetch(...) call sites resolve to window.authFetch via
// global-scope lookup, so they stay unchanged.
window.authFetch = window.authFetch || (async (url, options = {}) => {
    return window.AUTH.fetch(url, options);
});


// Function to format course names for display. Delegates to the shared Catalog
// helper (single DB-backed source of program names). student.course stores the
// program CODE (e.g. 'GA5'); Catalog.formatCourseName resolves it. Title-case
// fallback only when Catalog is unavailable (script load failure).
function formatCourseName(courseCode) {
    if (window.Catalog) {
        return window.Catalog.formatCourseName(courseCode);
    }
    if (!courseCode) return 'Unknown Course';
    return courseCode
        .split('_')
        .map(word => {
            if (/^\d+$/.test(word)) {
                return `Level ${word}`;
            }
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
}

// ---- API base (verbatim) ----
// API Base URL
const API_BASE_URL = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : `${window.location.protocol}//${window.location.host}/api`;

// ---- formatCurrency (verbatim) ----
// Format currency
function formatCurrency(amount) {
    // Decimal128 fields serialize to strings via toJSON — coerce before formatting.
    const n = Number(amount);
    return Number.isFinite(n)
        ? n.toLocaleString('en-KE', { style: 'currency', currency: 'KES' })
        : 'N/A';
}

// ---- generateFeesStatement (topbar button, verbatim) ----
// Generate fees statement function (placeholder)
function generateFeesStatement() {
    showToast('Generating fees statement...', 'info');
    // Implementation would go here
}

// ---- showNotification (verbatim) ----
// Show notification toast
function showNotification(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg text-white transform transition-all duration-300 ${
        type === 'success' ? 'bg-green-500' :
        type === 'error' ? 'bg-red-500' :
        type === 'warning' ? 'bg-yellow-500' :
        'bg-blue-500'
    }`;
    toast.innerHTML = `
        <div class="flex items-center space-x-2">
            <i class="ri-${type === 'success' ? 'check' : type === 'error' ? 'error-warning' : 'information'}-line"></i>
            <span>${escapeHtml(message)}</span>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.style.transform = 'translateX(0)', 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.transform = 'translateX(400px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ---- getFinanceUserData (verbatim) ----
// Get finance user data (from session or local storage)
function getFinanceUserData() {
    // This should be replaced with actual auth logic
    return {
        userId: 'finance_admin',
        name: 'Finance Administrator'
    };
}

// ---- shell chrome: mobile sidebar + legacy dark-mode (verbatim inline block) ----
        /* Mobile sidebar helpers — match the design-system demo pattern. */
        function openSidebar() {
            document.getElementById('sidebar').classList.add('open');
            document.getElementById('sbBackdrop').classList.add('show');
        }
        function closeSidebar() {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('sbBackdrop').classList.remove('show');
        }

        // Initialize dark mode from localStorage — legacy key kept for users who
        // had it set before the design-system theme controller took over. The
        // controller in /public/js/dashboard-theme.js uses localStorage.theme
        // and runs in <head>, so this block is a one-time bridge.
        if (localStorage.getItem('finance-dark-mode') === 'enabled' && localStorage.getItem('theme') == null) {
            try { localStorage.setItem('theme', 'dark'); } catch (e) { /* ignore */ }
            document.documentElement.classList.add('dark');
        }
        
        // Set today's date as default for payment date
        document.addEventListener('DOMContentLoaded', function() {
            const today = new Date().toISOString().split('T')[0];
            const paymentDateField = document.getElementById('payment-date');
            if (paymentDateField) {
                paymentDateField.value = today;
            }
        });

        // Toggle dark mode function — legacy. The active theme controller is
        // /public/js/dashboard-theme.js wired via [data-theme-toggle] in the
        // topbar. This function is retained for any pre-migration inline
        // onclick callers; guards against the removed #dark-mode-toggle.
        function toggleDarkMode() {
            document.documentElement.classList.toggle('dark');
            const darkModeToggle = document.getElementById('dark-mode-toggle');
            if (!darkModeToggle) return;
            const icon = darkModeToggle.querySelector('i');
            const span = darkModeToggle.querySelector('span');
            
            if (document.documentElement.classList.contains('dark')) {
                // Switch to sun icon for dark mode
                icon.classList.remove('ri-moon-line');
                icon.classList.add('ri-sun-line');
                if (span) span.textContent = 'Light Mode';
                localStorage.setItem('finance-dark-mode', 'enabled');
            } else {
                // Switch to moon icon for light mode
                icon.classList.remove('ri-sun-line');
                icon.classList.add('ri-moon-line');
                if (span) span.textContent = 'Dark Mode';
                localStorage.setItem('finance-dark-mode', 'disabled');
            }
        }
        
        // Check for saved dark mode preference
        document.addEventListener('DOMContentLoaded', function() {
            // Set today's date as default for payment date
            const today = new Date().toISOString().split('T')[0];
            const paymentDateField = document.getElementById('payment-date');
            if (paymentDateField) {
                paymentDateField.value = today;
            }
            
            // Apply saved dark mode preference (legacy — the design-system theme
            // controller in /public/js/dashboard-theme.js handles theme now; this
            // block only fires for users whose 'finance-dark-mode' key predates
            // the migration. The old sidebar dark-mode button is gone, so we
            // skip the icon/text swap that used to update it.)
            const darkModePreference = localStorage.getItem('finance-dark-mode');
            if (darkModePreference === 'enabled') {
                document.documentElement.classList.add('dark');
            }
        });


// ---- showToast — the inline version that wins the monolith load order (verbatim) ----
        // Toast notification function (if not already exists)
        function showToast(message, type = 'info') {
            const toast = document.getElementById('toast');
            
            // Set colors based on type
            const colors = {
                success: 'bg-green-500',
                error: 'bg-red-500',
                warning: 'bg-yellow-500',
                info: 'bg-blue-500'
            };
            
            toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-xl text-white transform translate-y-full opacity-0 transition-all duration-300 shadow-lg z-50 ${colors[type] || colors.info}`;
            toast.textContent = message;
            
            // Show toast
            setTimeout(() => {
                toast.classList.remove('translate-y-full', 'opacity-0');
                toast.classList.add('translate-y-0', 'opacity-100');
            }, 100);
            
            // Hide toast after 4 seconds
            setTimeout(() => {
                toast.classList.add('translate-y-full', 'opacity-0');
                toast.classList.remove('translate-y-0', 'opacity-100');
            }, 4000);
        }

// ---- global exposures for inline onclick= handlers (shell chrome) ----
window.openSidebar = openSidebar;
window.closeSidebar = closeSidebar;
window.toggleDarkMode = toggleDarkMode;
window.generateFeesStatement = generateFeesStatement;

// ---- bootstrap (new): identity, then start the router ----
document.addEventListener('DOMContentLoaded', async () => {
    // Cookie-based auth: requireAuth bounces to /admin/login on no/expired session.
    if (window.AUTH && typeof window.AUTH.requireAuth === 'function') {
        const user = await window.AUTH.requireAuth('/admin/login');
        if (user) {
            const userName = document.getElementById('userName');
            const userAvatar = document.getElementById('userAvatar');
            const welcomeName = document.getElementById('welcomeName');
            if (user.name) {
                if (userName) userName.textContent = user.name;
                if (welcomeName) welcomeName.textContent = user.name;
                if (userAvatar) userAvatar.textContent = user.name.charAt(0).toUpperCase();
            }
        }
    }

    // Topbar logout button — finance role logs back into /admin/login.
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn && window.AUTH && typeof window.AUTH.logout === 'function') {
        logoutBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to logout?')) {
                await window.AUTH.logout({ role: 'admin' });
            }
        });
    }

    // Load the shared catalog (programs + departments) before any tab renders,
    // so sync Catalog lookups (formatCourseName, programByCode) resolve.
    if (window.Catalog) { await window.Catalog.ready(); }

    if (window.FinanceRouter) window.FinanceRouter.start();
});
