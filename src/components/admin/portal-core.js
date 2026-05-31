// portal-core.js — shared base + bootstrap for the admin portal SPA.
//
// Folds in adminDashboard.js's shared state, authFetch/API_BASE, the cross-tab
// data loaders, shell chrome (dark mode, sidebar, profile menu, logout, search,
// mobile search) and formatting/toast utils. Every function is a verbatim move
// (comments/indentation preserved); only the DOMContentLoaded bootstrap at the
// bottom is new orchestration (it loads all data once, then starts the router).
//
// Load order: auth.js -> config.js -> portal-core.js -> portal-router.js -> tabs.

// ---- API base, authFetch, shared state (verbatim top of adminDashboard.js) ----
// Use global config or fallback to same host
const API_BASE = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : `${window.location.protocol}//${window.location.host}/api`;

// Authenticated fetch wrapper
const authFetch = async (url, options = {}) => {
    // Stage 2B-1B: delegate to the single shared auth helper (public/js/auth.js).
    // It attaches the Authorization header (and a JSON Content-Type for
    // non-FormData bodies) and handles token-expiry redirects. The wrapper
    // name is kept so existing call sites are unchanged.
    return window.AUTH.fetch(url, options);
};

// State
let allStudents = [];
let allTrainers = [];
let allPayments = [];
let allPrograms = [];
let viewMode = 'list';

// ---- cross-tab data loaders (verbatim) ----
async function loadStudents() {
    try {
        // The students endpoint switched to the paginated `{ students, total, ... }`
        // envelope. Request `?all=1` here because the admin portal aggregates
        // financial/students/dashboard stats across the full cohort.
        const response = await authFetch(`${API_BASE}/students?all=1`);
        if (!response.ok) throw new Error('Failed to load students');

        const body = await response.json();
        allStudents = Array.isArray(body) ? body : (Array.isArray(body.students) ? body.students : []);
        console.log(`Loaded ${allStudents.length} students`);
        return allStudents;
    } catch (error) {
        console.error('Error loading students:', error);
        allStudents = [];
        throw error;
    }
}

async function loadTrainers() {
    try {
        const response = await authFetch(`${API_BASE}/trainers/all-departments`);
        if (!response.ok) throw new Error('Failed to load trainers');
        
        const data = await response.json();
        allTrainers = data.trainers || [];
        console.log(`Loaded ${allTrainers.length} trainers`);
        return allTrainers;
    } catch (error) {
        console.error('Error loading trainers:', error);
        allTrainers = [];
        throw error;
    }
}

async function loadPayments() {
    try {
        const response = await authFetch(`${API_BASE}/payments`);
        if (!response.ok) throw new Error('Failed to load payments');
        
        allPayments = await response.json();
        console.log(`Loaded ${allPayments.length} payments`);
        return allPayments;
    } catch (error) {
        console.error('Error loading payments:', error);
        allPayments = [];
        throw error;
    }
}

async function loadPrograms() {
    try {
        const response = await authFetch(`${API_BASE}/programs`);
        if (!response.ok) throw new Error('Failed to load programs');
        
        allPrograms = await response.json();
        console.log(`Loaded ${allPrograms.length} programs`);
        return allPrograms;
    } catch (error) {
        console.error('Error loading programs:', error);
        allPrograms = [];
        throw error;
    }
}

// Accurate per-student financials, computed server-side (robust to the short
// code vs long course-key mismatch). Keyed by admission number for the tables.
let studentFinanceByAdm = {};
let financeAnalytics = null;

async function loadStudentFinancials() {
    try {
        const response = await authFetch(`${API_BASE}/finance/reports/students`);
        if (!response.ok) throw new Error('Failed to load student financials');
        const body = await response.json();
        studentFinanceByAdm = {};
        (body.students || []).forEach(s => { studentFinanceByAdm[s.admissionNumber] = s; });
        console.log(`Loaded financials for ${Object.keys(studentFinanceByAdm).length} students`);
        return studentFinanceByAdm;
    } catch (error) {
        console.error('Error loading student financials:', error);
        studentFinanceByAdm = {};
        return {};
    }
}

async function loadFinanceAnalytics() {
    try {
        const response = await authFetch(`${API_BASE}/finance/analytics`);
        if (!response.ok) throw new Error('Failed to load finance analytics');
        financeAnalytics = await response.json();
        return financeAnalytics;
    } catch (error) {
        console.error('Error loading finance analytics:', error);
        financeAnalytics = null;
        return null;
    }
}

// Accurate balance for a student row (server-computed; falls back to 0).
function adminStudentBalance(student) {
    const f = student && student.admissionNumber ? studentFinanceByAdm[student.admissionNumber] : null;
    return f ? Number(f.balance) || 0 : 0;
}
function adminStudentPaid(student) {
    const f = student && student.admissionNumber ? studentFinanceByAdm[student.admissionNumber] : null;
    return f ? Number(f.paid) || 0 : 0;
}
function adminStudentExpected(student) {
    const f = student && student.admissionNumber ? studentFinanceByAdm[student.admissionNumber] : null;
    return f ? Number(f.expected) || 0 : 0;
}

// ---- dark mode (verbatim) ----
function toggleDarkMode() {
    console.log('toggleDarkMode() called!');
    const html = document.documentElement;
    const icon = document.getElementById('dark-mode-icon');
    
    console.log('Current dark mode state:', html.classList.contains('dark'));
    console.log('Icon element found:', !!icon);
    
    if (html.classList.contains('dark')) {
        html.classList.remove('dark');
        localStorage.setItem('darkMode', 'false');
        if (icon) icon.className = 'ri-moon-line text-lg';
    } else {
        html.classList.add('dark');
        localStorage.setItem('darkMode', 'true');
        if (icon) icon.className = 'ri-sun-line text-lg';
    }
    
    // Double-check the class is there
    console.log('HTML classes after toggle:', html.className);
    console.log('Has dark class:', html.classList.contains('dark'));
}

// Initialize dark mode from localStorage
function initDarkMode() {
    const darkMode = localStorage.getItem('darkMode');
    const icon = document.getElementById('dark-mode-icon');
    
    if (darkMode === 'true') {
        document.documentElement.classList.add('dark');
        if (icon) icon.className = 'ri-sun-line text-lg';
    }
}

// Call on page load
document.addEventListener('DOMContentLoaded', initDarkMode);

// ---- sidebar / profile menu / logout ----
// One toggle for both modes: on mobile (<1024) it slides the off-canvas sidebar
// in/out; on desktop it collapses the wide sidebar to an icon rail and persists
// that choice. Styling is driven by classes on #admin-shell (see admin-portal.css).
function toggleSidebar() {
    const shell = document.getElementById('admin-shell');
    if (!shell) return;
    if (window.innerWidth < 1024) {
        shell.classList.toggle('sidebar-open');
    } else {
        const collapsed = shell.classList.toggle('sidebar-collapsed');
        try { localStorage.setItem('admin-sidebar-collapsed', collapsed ? '1' : '0'); } catch (e) { /* ignore */ }
    }
}

// Restore the persisted desktop collapse state on load.
function applySidebarState() {
    const shell = document.getElementById('admin-shell');
    if (shell && localStorage.getItem('admin-sidebar-collapsed') === '1') {
        shell.classList.add('sidebar-collapsed');
    }
}
document.addEventListener('DOMContentLoaded', applySidebarState);

function toggleProfileMenu() {
    const menu = document.getElementById('profile-menu');
    menu.classList.toggle('hidden');
}

// Close profile menu when clicking outside
document.addEventListener('click', function(e) {
    const menu = document.getElementById('profile-menu');
    const button = menu?.previousElementSibling;
    
    if (menu && !menu.contains(e.target) && !button?.contains(e.target)) {
        menu.classList.add('hidden');
    }
});

async function logout() {
    if (confirm('Are you sure you want to logout?')) {
        await window.AUTH.logout({ role: 'admin' });
    }
}

// ---- formatting + toast + global search utils (verbatim) ----
function formatCurrency(amount) {
    return `KES ${Number(amount || 0).toLocaleString()}`;
}

function formatDepartmentName(code) {
    // DB-backed catalog (Rule 7). Title-case fallback only if catalog absent.
    if (window.Catalog) return Catalog.departmentName(code);
    if (!code) return code;
    return code.split('_').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

function formatCourseName(courseCode) {
    // student.course holds the program CODE (e.g. 'GA5'); resolve via catalog.
    if (window.Catalog) return Catalog.formatCourseName(courseCode) || 'N/A';
    if (!courseCode) return 'N/A';
    return courseCode.split('_').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

function getCourseProgram(courseCode) {
    // Resolve a course CODE to its program display name via the catalog.
    if (window.Catalog) {
        const p = Catalog.programByCode(courseCode);
        return p ? p.name : Catalog.formatCourseName(courseCode);
    }
    return formatCourseName(courseCode);
}

function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500',
        warning: 'bg-yellow-500'
    };

    const icons = {
        success: 'ri-checkbox-circle-line',
        error: 'ri-error-warning-line',
        info: 'ri-information-line',
        warning: 'ri-alert-line'
    };

    const toast = document.createElement('div');
    toast.className = `${colors[type]} text-white px-6 py-4 rounded-lg shadow-xl flex items-center space-x-3 transform transition-all duration-300`;
    toast.innerHTML = `
        <i class="${icons[type]} text-2xl"></i>
        <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Shared client-side pagination footer. Renders Prev / "Page x of n" / Next;
// the buttons call a global navigation function (fnName) with the target page.
// Returns '' when there is only one page so it stays out of the way.
function admPaginationFooter(page, totalPages, fnName) {
    if (totalPages <= 1) return '';
    return `<div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:14px 2px 2px">
        <button class="adm-btn adm-btn--outline adm-btn--sm" ${page <= 1 ? 'disabled' : ''} onclick="${fnName}(${page - 1})"><i class="ri-arrow-left-s-line"></i> Prev</button>
        <span class="kpi__note">Page ${page} of ${totalPages}</span>
        <button class="adm-btn adm-btn--outline adm-btn--sm" ${page >= totalPages ? 'disabled' : ''} onclick="${fnName}(${page + 1})">Next <i class="ri-arrow-right-s-line"></i></button>
    </div>`;
}

function handleGlobalSearch(e) {
    const query = e.target.value.toLowerCase();
    if (query.length < 2) return;

    // Search students
    const studentResults = allStudents.filter(s => 
        s.name.toLowerCase().includes(query) ||
        (s.admissionNumber && s.admissionNumber.toLowerCase().includes(query))
    );

    console.log(`Found ${studentResults.length} students matching "${query}"`);
    // In production, show search results in a dropdown
}

// ---- mobile search (verbatim) ----
// Setup mobile search toggle
document.addEventListener('DOMContentLoaded', function() {
    const mobileSearchToggle = document.getElementById('mobile-search-toggle');
    if (mobileSearchToggle) {
        mobileSearchToggle.addEventListener('click', openMobileSearch);
    }
    
    const mobileSearchInput = document.getElementById('mobile-search-input');
    if (mobileSearchInput) {
        mobileSearchInput.addEventListener('input', function(e) {
            handleGlobalSearch(e);
        });
    }
});

function openMobileSearch() {
    const modal = document.getElementById('mobile-search-modal');
    if (modal) {
        modal.classList.remove('hidden');
        const input = document.getElementById('mobile-search-input');
        if (input) {
            setTimeout(() => input.focus(), 100);
        }
    }
}

function closeMobileSearch() {
    const modal = document.getElementById('mobile-search-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ---- global exposures for inline onclick= handlers (shell chrome) ----
window.toggleSidebar = toggleSidebar;
window.toggleProfileMenu = toggleProfileMenu;
window.toggleDarkMode = toggleDarkMode;
window.logout = logout;
window.openMobileSearch = openMobileSearch;
window.closeMobileSearch = closeMobileSearch;

// Fetch + show the current academic year in the topbar chip.
async function loadAcademicYearChip() {
    const chip = document.getElementById('academic-year-chip');
    if (!chip) return;
    try {
        const res = await authFetch(`${API_BASE}/system-settings/current_academic_year`);
        if (!res.ok) return;
        const data = await res.json();
        const value = data && (data.value || data.current_academic_year);
        if (value) {
            chip.textContent = `AY ${value}`;
            chip.classList.remove('hidden');
        }
    } catch (e) { /* best-effort: leave hidden */ }
}

// ---- bootstrap (new): identity + load all data once, then start the router ----
document.addEventListener('DOMContentLoaded', async function () {
    // Cookie-based auth: requireAuth bounces to /admin/login if no valid session.
    const admin = await window.AUTH.requireAuth('/admin/login');
    if (!admin) return;

    // First login → setup flow (unchanged).
    if (admin.isFirstLogin === true) {
        window.location.href = '/admin/first-login';
        return;
    }

    // Load the shared course/department catalog before any tab renders (Rule 7).
    if (window.Catalog) { await window.Catalog.ready(); }

    // Academic-year chip in the topbar (current_academic_year is computed
    // server-side; admin is authorized to read it). Best-effort — stays hidden
    // if the lookup fails.
    loadAcademicYearChip();

    const adminNameEl = document.getElementById('admin-name');
    if (adminNameEl) adminNameEl.textContent = admin.name || 'Administrator';
    const avatarEl = document.getElementById('admin-avatar-initial');
    if (avatarEl) avatarEl.textContent = (admin.name || 'A').trim().charAt(0).toUpperCase();

    // Search shortcut (Ctrl+K) + global search input (both in the shell topbar).
    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const gs = document.getElementById('global-search');
            if (gs) gs.focus();
        }
    });
    const globalSearch = document.getElementById('global-search');
    if (globalSearch) globalSearch.addEventListener('input', handleGlobalSearch);

    // Load all data once (fills the cross-tab globals), then hand off to the
    // router (it shows the tab for the current URL and calls that tab's init()).
    try {
        showToast('Loading dashboard data...', 'info');
        await Promise.all([loadStudents(), loadTrainers(), loadPayments(), loadPrograms(), loadStudentFinancials(), loadFinanceAnalytics()]);
        showToast('Dashboard loaded successfully!', 'success');
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showToast('Error loading dashboard data', 'error');
    }

    if (window.AdminRouter) window.AdminRouter.start();
});
