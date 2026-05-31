// portal-core.js — shared base + bootstrap for the ILO portal SPA.
//
// Folds in authFetch/API_BASE_URL + shared state, the clock + toast utils, the
// status/course formatters, the (global) review-modal flow, and logout. Verbatim
// moves except the DOMContentLoaded bootstrap at the bottom (clock + identity,
// then starts the router). showTab() is replaced by portal-router.js.
//
// Load order: dashboard-theme.js -> auth.js -> portal-core.js -> portal-router.js
// -> tab modules.

// ---- authFetch, API base, shared state (verbatim) ----
// Authenticated fetch wrapper
const authFetch = async (url, options = {}) => {
    // Stage 2B-1B: delegate to the single shared auth helper (public/js/auth.js).
    // It attaches the Authorization header (and a JSON Content-Type for
    // non-FormData bodies) and handles token-expiry redirects.
    return window.AUTH.fetch(url, options);
};

console.log('ILO Dashboard JavaScript loading...');
const API_BASE_URL = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : `${window.location.protocol}//${window.location.host}/api`;
let currentApplicationType = '';
let currentApplicationId = '';
let graduationApplications = [];
let attachmentApplications = [];
console.log('Variables initialized, API_BASE_URL:', API_BASE_URL);

// ---- clock + toast (verbatim) ----
// Update current time
function updateCurrentTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    const dateString = now.toLocaleDateString();
    document.getElementById('current-time').textContent = timeString + ' - ' + dateString;
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    
    toastMessage.textContent = message;
    toast.className = 'fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg transform transition-transform duration-300 z-50 ' + 
        (type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white');
    
    toast.style.transform = 'translateY(0)';
    setTimeout(() => {
        toast.style.transform = 'translateY(100%)';
    }, 3000);
}

// ---- status/course formatters (verbatim) ----
// Get status class for styling
function getStatusClass(status) {
    switch (status) {
        case 'pending': return 'bg-yellow-100 text-yellow-800';
        case 'approved': return 'bg-green-100 text-green-800';
        case 'rejected': return 'bg-red-100 text-red-800';
        case 'under_review': return 'bg-blue-100 text-blue-800';
        default: return 'bg-gray-100 text-gray-800';
    }
}

// Format course name — delegate to the shared DB-backed catalog (Rule 7).
function formatCourseName(course) {
    if (!course) return 'N/A';
    if (window.Catalog) return window.Catalog.formatCourseName(course);
    // Fallback only if the catalog helper failed to load.
    return course.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// ---- review modal flow — global modal (verbatim) ----
// Review application
function reviewApplication(type, applicationId) {
    currentApplicationType = type;
    currentApplicationId = applicationId;
    
    const applications = type === 'graduation' ? graduationApplications : attachmentApplications;
    const app = applications.find(a => a.id === applicationId);

    if (!app) return;

    document.getElementById('modal-title').textContent = 'Review ' + type.charAt(0).toUpperCase() + type.slice(1) + ' Application';

    // Attachment endpoint sends createdAt; graduation sends appliedAt.
    const appliedDate = type === 'attachment' ? app.createdAt : app.appliedAt;
    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML =
        '<div class="space-y-4">' +
            '<div class="grid grid-cols-2 gap-4">' +
                '<div><strong>Name:</strong> ' + escapeHtml(app.studentName) + '</div>' +
                '<div><strong>Admission Number:</strong> ' + escapeHtml(app.admissionNumber) + '</div>' +
                '<div><strong>Course:</strong> ' + escapeHtml(formatCourseName(app.course)) + '</div>' +
                (type === 'attachment' ?
                    '<div><strong>County:</strong> ' + escapeHtml(app.county) + '</div>' +
                    '<div><strong>Nearest Town:</strong> ' + escapeHtml(app.nearestTown) + '</div>'
                : '') +
                '<div><strong>Application Date:</strong> ' + new Date(appliedDate).toLocaleDateString() + '</div>' +
                '<div><strong>Status:</strong> <span class="px-2 py-1 text-xs rounded-full ' + getStatusClass(app.status) + '">' + escapeHtml(app.status?.replace('_', ' ') || app.status) + '</span></div>' +
            '</div>' +
            (app.comments ? '<div class="mt-4"><strong>Comments:</strong><br>' + escapeHtml(app.comments) + '</div>' : '') +
            '<div class="mt-4">' +
                '<label class="block text-sm font-medium text-gray-700 mb-2">Add Comments:</label>' +
                '<textarea id="review-comments" class="w-full px-3 py-2 border border-gray-300 rounded-lg" rows="3" placeholder="Enter your review comments..."></textarea>' +
            '</div>' +
        '</div>';
    
    document.getElementById('review-modal').classList.remove('hidden');
}

// Close review modal
function closeReviewModal() {
    document.getElementById('review-modal').classList.add('hidden');
    document.getElementById('review-comments').value = '';
}

// Update application status
async function updateApplicationStatus(status) {
    try {
        const comments = document.getElementById('review-comments').value;
        
        const response = await authFetch(API_BASE_URL + '/ilo/applications/' + currentApplicationType + '/' + currentApplicationId + '/status', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: status,
                comments: comments
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || 'Failed to update status');
        }

        showToast('Application ' + status + ' successfully!');
        closeReviewModal();
        
        // Refresh the appropriate list
        if (currentApplicationType === 'graduation') {
            refreshGraduationApplications();
        } else {
            refreshAttachmentApplications();
        }
    } catch (error) {
        console.error('Error updating status:', error);
        showToast('Failed to update application status: ' + error.message, 'error');
    }
}

// ---- logout (verbatim) ----
// Logout function
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        window.location.href = '/student/login';
    }
}

// ---- global exposures for inline onclick= handlers ----
window.reviewApplication = reviewApplication;
window.closeReviewModal = closeReviewModal;
window.updateApplicationStatus = updateApplicationStatus;
window.logout = logout;

// ---- bootstrap (new): clock + identity, then start the router ----
// Fetch + show the current academic year in the topbar chip (best-effort).
async function loadAcademicYearChip() {
    const chip = document.getElementById('academic-year-chip');
    if (!chip) return;
    try {
        const res = await authFetch(`${API_BASE_URL}/system-settings/current_academic_year`);
        if (!res.ok) return;
        const data = await res.json();
        const value = data && (data.value || data.current_academic_year);
        if (!value) return;
        const valEl = chip.querySelector('.ay-value');
        if (valEl) valEl.textContent = 'AY ' + value;
        chip.style.display = 'inline-flex';
    } catch (e) { /* best-effort: leave the chip hidden */ }
}

document.addEventListener('DOMContentLoaded', async function () {
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);

    // Cookie-based auth: requireAuth bounces to /admin/login on no/expired session.
    if (window.AUTH && typeof window.AUTH.requireAuth === 'function') {
        await window.AUTH.requireAuth('/admin/login');
    }

    // Load the shared programs/departments catalog once before tabs render.
    if (window.Catalog) { await window.Catalog.ready(); }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn && window.AUTH && typeof window.AUTH.logout === 'function') {
        logoutBtn.addEventListener('click', () => window.AUTH.logout({ role: 'admin' }));
    }

    // Academic-year chip in the topbar (best-effort; stays hidden on failure).
    loadAcademicYearChip();

    if (window.ILORouter) window.ILORouter.start();
});
