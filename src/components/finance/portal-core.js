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

// ---- authFetch, courseToProgram map, formatCourseName (verbatim financeDashboard.js) ----
// Authenticated fetch wrapper — guarded against double-declaration.
// financeAnalytics.js also defines this; both load as classic scripts so a
// bare top-level `const` collides in global scope. window assignment is
// idempotent. Bare authFetch(...) call sites resolve to window.authFetch via
// global-scope lookup, so they stay unchanged.
window.authFetch = window.authFetch || (async (url, options = {}) => {
    return window.AUTH.fetch(url, options);
});

const courseToProgram = {
    'applied_biology_6': 'Applied Biology Level 6',
    'analytical_chemistry_6': 'Analytical Chemistry Level 6',
    'science_lab_technology_5': 'Science Lab Technology Level 5',
    'general_agriculture_4': 'General Agriculture Level 4',
    'sustainable_agriculture_5': 'Sustainable Agriculture Level 5',
    'agricultural_extension_6': 'Agricultural Extension Level 6',
    'building_technician_4': 'Building Technician Level 4',
    'building_technician_6': 'Building Technician Level 6',
    'civil_engineering_6': 'Civil Engineering Level 6',
    'plumbing_4': 'Plumbing Level 4',
    'plumbing_5': 'Plumbing Level 5',
    'electrical_engineering_4': 'Electrical Engineering Level 4',
    'electrical_engineering_5': 'Electrical Engineering Level 5',
    'electrical_engineering_6': 'Electrical Engineering Level 6',
    'automotive_engineering_5': 'Automotive Engineering Level 5',
    'automotive_engineering_6': 'Automotive Engineering Level 6',
    'food_beverage_4': 'Food and Beverage Level 4',
    'food_beverage_5': 'Food & Beverage Level 5',
    'food_beverage_6': 'Food & Beverage Level 6',
    'food_and_beverage_4': 'Food and Beverage Level 4',
    'food_and_beverage_5': 'Food & Beverage Level 5',
    'food_and_beverage_6': 'Food & Beverage Level 6',
    'fashion_design_4': 'Fashion & Design Level 4',
    'fashion_design_5': 'Fashion and Design Level 5',
    'fashion_design_6': 'Fashion and Design Level 6',
    'fashion_and_design_4': 'Fashion & Design Level 4',
    'fashion_and_design_5': 'Fashion and Design Level 5',
    'fashion_and_design_6': 'Fashion and Design Level 6',
    'hairdressing_4': 'Hairdressing Level 4',
    'hairdressing_5': 'Hairdressing Level 5',
    'hairdressing_6': 'Hairdressing Level 6',
    'tourism_management_5': 'Tourism Management Level 5',
    'tourism_management_6': 'Tourism Management Level 6',
    'social_work_5': 'Social Work Level 5',
    'social_work_6': 'Social Work Level 6',
    'office_administration_5': 'Office Administration Level 5',
    'office_administration_6': 'Office Administration Level 6',
    'ict_5': 'ICT Level 5',
    'ict_6': 'ICT Level 6',
    'information_science_5': 'Information Science Level 5',
    'information_science_6': 'Information Science Level 6',
    // Additional variations for comprehensive mapping
    'science_lab_tech_5': 'Science Lab Technology Level 5',
    'science_laboratory_technology_5': 'Science Lab Technology Level 5',
    'applied_bio_6': 'Applied Biology Level 6',
    'analytical_chem_6': 'Analytical Chemistry Level 6',
    'general_agric_4': 'General Agriculture Level 4',
    'sustainable_agric_5': 'Sustainable Agriculture Level 5',
    'agricultural_ext_6': 'Agricultural Extension Level 6',
    'building_tech_4': 'Building Technician Level 4',
    'building_tech_6': 'Building Technician Level 6',
    'civil_eng_6': 'Civil Engineering Level 6',
    'electrical_eng_4': 'Electrical Engineering Level 4',
    'electrical_eng_5': 'Electrical Engineering Level 5',
    'electrical_eng_6': 'Electrical Engineering Level 6',
    'automotive_eng_5': 'Automotive Engineering Level 5',
    'automotive_eng_6': 'Automotive Engineering Level 6',
    'tourism_mgmt_5': 'Tourism Management Level 5',
    'tourism_mgmt_6': 'Tourism Management Level 6',
    'office_admin_5': 'Office Administration Level 5',
    'office_admin_6': 'Office Administration Level 6',
    'info_science_5': 'Information Science Level 5',
    'info_science_6': 'Information Science Level 6',
    // Additional course code variations to ensure all formats work
    'agricultural_extension_6': 'Agricultural Extension Level 6',
    'agricultural_ext_6': 'Agricultural Extension Level 6',
    'agric_extension_6': 'Agricultural Extension Level 6',
    'building_technician_4': 'Building Technician Level 4',
    'building_technician_6': 'Building Technician Level 6',
    'building_tech_4': 'Building Technician Level 4',
    'building_tech_6': 'Building Technician Level 6'
};

// Function to format course names for display
function formatCourseName(courseCode) {
    // First try to get the proper program name from our mapping
    const programName = courseToProgram[courseCode];
    if (programName) {
        return programName;
    }
    
    // If not found in mapping, format the course code nicely
    if (!courseCode) return 'Unknown Course';
    
    // Replace underscores with spaces and capitalize
    return courseCode
        .split('_')
        .map(word => {
            // Handle numbers at the end (convert to "Level X")
            if (/^\d+$/.test(word)) {
                return `Level ${word}`;
            }
            // Capitalize first letter of each word
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

    // Academic year is dynamic (Sept–Aug); never hard-code it in the header.
    const acadYearEl = document.getElementById('academicYear');
    if (acadYearEl) {
        const now = new Date();
        const y = now.getFullYear();
        acadYearEl.textContent = now.getMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
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

    if (window.FinanceRouter) window.FinanceRouter.start();
});
