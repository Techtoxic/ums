// portal-core.js — shared base + bootstrap for the dean portal SPA.
//
// Folds in API_BASE/authFetch + shared state + the TOOL_TYPE_LABELS map and the
// formatting/notification/logout utilities. Verbatim moves except the
// DOMContentLoaded bootstrap at the bottom (loads identity, then starts the
// router). The anchor-driven nav handler (setupNavigation) is replaced by
// portal-router.js.
//
// Load order: dashboard-theme.js -> auth.js -> portal-core.js -> portal-router.js
// -> tab modules.

// ---- API base, authFetch, shared state, tool-type labels (verbatim) ----
// Dean Dashboard JavaScript
const API_BASE = '/api';
// Authenticated fetch wrapper
const authFetch = async (url, options = {}) => {
    // Stage 2B-1B: delegate to the single shared auth helper (public/js/auth.js).
    // It attaches the Authorization header (and a JSON Content-Type for
    // non-FormData bodies) and handles token-expiry redirects. The wrapper
    // name is kept so existing call sites are unchanged.
    return window.AUTH.fetch(url, options);
};

let currentStudent = null;
let currentNoteFilter = 'all';
let allStudentNotes = [];

// Tools of Trade: id of the submission currently open in the review modal.
let currentReviewToolId = null;

// Friendly labels for tool types (mirrors the trainer-side tool types).
const TOOL_TYPE_LABELS = {
    course_outline: 'Course Outline',
    learning_plan: 'Learning Plan',
    record_of_work: 'Record of Work',
    session_plan: 'Session Plan',
    exam: 'Exam',
    tvet_license: 'TVET License'
};

// ---- formatting + notification + logout utils (verbatim) ----
// Format course name — delegate to the shared DB-backed catalog (Rule 7).
function formatCourseName(courseCode) {
    if (window.Catalog) return window.Catalog.formatCourseName(courseCode);
    // Fallback only if the catalog helper failed to load.
    return String(courseCode || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Format date
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Show notification
function showNotification(message, type = 'info') {
    const bgColors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        warning: 'bg-yellow-500',
        info: 'bg-blue-500'
    };
    
    const notification = document.createElement('div');
    notification.className = `fixed top-20 right-4 ${bgColors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in`;
    notification.innerHTML = `
        <div class="flex items-center space-x-2">
            <i class="ri-${type === 'success' ? 'check' : type === 'error' ? 'close' : 'information'}-circle-line text-xl"></i>
            <span>${escapeHtml(message)}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Logout
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        sessionStorage.clear();
        window.location.href = '/dean/login';
    }
}

// ---- bootstrap (new): identity, then start the router ----
// Fetch + show the current academic year in the topbar chip (best-effort).
async function loadAcademicYearChip() {
    const chip = document.getElementById('academic-year-chip');
    if (!chip) return;
    try {
        const res = await authFetch(`${API_BASE}/system-settings/current_academic_year`);
        if (!res.ok) return;
        const data = await res.json();
        const value = data && (data.value || data.current_academic_year);
        if (!value) return;
        const valEl = chip.querySelector('.ay-value');
        if (valEl) valEl.textContent = 'AY ' + value;
        chip.style.display = 'inline-flex';
    } catch (e) { /* best-effort: leave the chip hidden */ }
}

document.addEventListener('DOMContentLoaded', async () => {
    // The Dean Portal topbar always shows the office title ("Dean"), never the
    // signed-in officer's personal name.
    const nameEl = document.getElementById('dean-name');
    if (nameEl) nameEl.textContent = 'Dean';

    // Cookie-based auth: requireAuth bounces to /admin/login on no/expired session.
    if (window.AUTH && typeof window.AUTH.requireAuth === 'function') {
        await window.AUTH.requireAuth('/admin/login');
        if (nameEl) nameEl.textContent = 'Dean';
    }

    // Load the shared programs/departments catalog once before tabs render.
    if (window.Catalog) { await window.Catalog.ready(); }

    // Topbar logout button — dean role logs back into /admin/login.
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn && window.AUTH && typeof window.AUTH.logout === 'function') {
        logoutBtn.addEventListener('click', () => window.AUTH.logout({ role: 'admin' }));
    }

    // Academic-year chip in the topbar (best-effort; stays hidden on failure).
    loadAcademicYearChip();

    if (window.DeanRouter) window.DeanRouter.start();
});
