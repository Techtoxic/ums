// portal-core.js — shared base + bootstrap for the trainer portal SPA.
//
// Folds in trainerDashboard.js's shared state, authFetch/API_BASE_URL, shell
// chrome (theme, sidebar toggles, clock, logout, toast), identity, and the
// phone-update modal. Every function below is a verbatim move (comments +
// indentation preserved); only updateIdentity wiring stayed in the tab inits and
// the DOMContentLoaded bootstrap at the bottom is new orchestration.
//
// Load order: auth.js -> portal-core.js -> portal-router.js -> tab modules.

// ---- shared state, authFetch, API_BASE_URL (verbatim top of trainerDashboard.js) ----
// Authenticated fetch wrapper
const authFetch = async (url, options = {}) => {
    // Stage 2B-1B: delegate to the single shared auth helper (public/js/auth.js).
    // It attaches the Authorization header (and a JSON Content-Type for
    // non-FormData bodies) and handles token-expiry redirects.
    return window.AUTH.fetch(url, options);
};

const API_BASE_URL = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : `${window.location.protocol}//${window.location.host}/api`;

let currentTrainer = null;
let assignmentsData = [];
let studentsData = [];
let toolsData = [];
let selectedToolType = null;
let selectedFile = null;
let selectedRequestId = null; // set when fulfilling a specific tool request; null = general upload
let bulkToolType = null;
let bulkFiles = [];
let currentSection = 'dashboard';

// ---- shell chrome + identity + utils (verbatim) ----
// Initialize UI components
function initializeUI() {
    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    const savedTheme = localStorage.getItem('theme') || 'light';
    
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
    }
    
    themeToggle?.addEventListener('click', toggleTheme);
    
    // Sidebar toggle
    const sidebarToggle = document.getElementById('sidebarToggle');
    const desktopSidebarToggle = document.getElementById('desktopSidebarToggle');
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const mobileOverlay = document.getElementById('mobileOverlay');
    
    sidebarToggle?.addEventListener('click', toggleSidebar);
    desktopSidebarToggle?.addEventListener('click', toggleSidebar);
    mobileMenuToggle?.addEventListener('click', toggleMobileSidebar);
    mobileOverlay?.addEventListener('click', closeMobileSidebar);
    
    // Update current time
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    
    // Profile form
    const profileForm = document.getElementById('profileForm');
    profileForm?.addEventListener('submit', handleProfileUpdate);
    
    // Phone update form
    const phoneUpdateForm = document.getElementById('phoneUpdateForm');
    phoneUpdateForm?.addEventListener('submit', handlePhoneUpdate);
    
    // Assignment filter
    const assignmentFilter = document.getElementById('assignmentFilter');
    assignmentFilter?.addEventListener('change', displayAssignments);
    
    // Students filter
    const studentsFilter = document.getElementById('studentsFilter');
    studentsFilter?.addEventListener('change', displayStudents);
    
    // Update last sync time
    updateLastSync();
    setInterval(updateLastSync, 60000); // Update every minute
}

// Toggle theme
function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// Toggle sidebar
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    const isCollapsed = sidebar.classList.contains('sidebar-collapsed');
    
    if (window.innerWidth >= 768) {
        // Desktop behavior
        if (isCollapsed) {
            sidebar.classList.remove('sidebar-collapsed');
            mainContent.classList.remove('md:ml-16');
            mainContent.classList.add('md:ml-64');
        } else {
            sidebar.classList.add('sidebar-collapsed');
            mainContent.classList.remove('md:ml-64');
            mainContent.classList.add('md:ml-16');
        }
    } else {
        // Mobile behavior - same as toggleMobileSidebar
        toggleMobileSidebar();
    }
}

// Toggle mobile sidebar
function toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobileOverlay');
    const mainContent = document.getElementById('mainContent');
    
    sidebar.classList.add('mobile-open');
    overlay.classList.remove('hidden');
    mainContent.classList.add('content-blur');
}

// Close mobile sidebar
function closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobileOverlay');
    const mainContent = document.getElementById('mainContent');
    
    sidebar.classList.remove('mobile-open');
    overlay.classList.add('hidden');
    mainContent.classList.remove('content-blur');
}

// Update trainer info
function updateTrainerInfo() {
    const elements = {
        sidebarTrainerName: currentTrainer.name,
        sidebarDepartment: formatDepartmentName(currentTrainer.department),
        headerTrainerName: currentTrainer.name,
        welcomeTrainerName: currentTrainer.name,
        welcomeDepartment: formatDepartmentName(currentTrainer.department),
        statsDepartment: formatDepartmentName(currentTrainer.department),
        profileName: currentTrainer.name,
        profileDepartment: formatDepartmentName(currentTrainer.department),
        profileEmail: currentTrainer.email,
        profilePhone: currentTrainer.phone || '',
        modalEmail: currentTrainer.email
    };
    
    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            if (element.tagName === 'INPUT') {
                element.value = value;
            } else {
                element.textContent = value;
            }
        }
    });
}

// Format department name for display
function formatDepartmentName(departmentCode) {
    const departmentNames = {
        'applied_science': 'Applied Science',
        'agriculture': 'Agriculture',
        'building_civil': 'Building & Civil',
        'electromechanical': 'Electromechanical',
        'hospitality': 'Hospitality',
        'business_liberal': 'Business & Liberal Studies',
        'computing_informatics': 'Computing & Informatics'
    };
    return departmentNames[departmentCode] || departmentCode;
}

// Format course name
function formatCourseName(courseCode) {
    if (!courseCode) return 'N/A';
    return courseCode.replace(/_/g, ' ').toUpperCase();
}

// Profile management
function checkPhoneUpdate() {
    // Show update modal if phone or email needs updating
    const needsPhoneUpdate = !currentTrainer.phone;
    const needsEmailUpdate = !currentTrainer.email || currentTrainer.email.includes('default') || currentTrainer.email.includes('temp');
    
    if (needsPhoneUpdate || needsEmailUpdate) {
        setTimeout(() => {
            // Pre-fill email if available
            if (currentTrainer.email && !needsEmailUpdate) {
                document.getElementById('modalEmail').value = currentTrainer.email;
            }
            
            // Show the modal
            document.getElementById('phoneUpdateModal').classList.remove('hidden');
            
            // Show appropriate message based on what needs updating
            const modalTitle = document.querySelector('#phoneUpdateModal h3');
            const modalDescription = document.querySelector('#phoneUpdateModal p');
            
            if (needsEmailUpdate && needsPhoneUpdate) {
                modalTitle.textContent = 'Update Contact Information';
                modalDescription.textContent = 'Please update your email address and phone number to keep your account secure and receive important notifications.';
            } else if (needsEmailUpdate) {
                modalTitle.textContent = 'Update Email Address';
                modalDescription.textContent = 'Please update your email address to keep your account secure and receive important notifications.';
            } else {
                modalTitle.textContent = 'Update Phone Number';
                modalDescription.textContent = 'Please add your phone number to receive important notifications.';
            }
        }, 2000);
    }
}

function closePhoneModal() {
    document.getElementById('phoneUpdateModal').classList.add('hidden');
}

async function handlePhoneUpdate(event) {
    event.preventDefault();
    
    const phone = document.getElementById('modalPhone').value.trim();
    const email = document.getElementById('modalEmail').value.trim();
    
    if (!phone && !email) {
        closePhoneModal();
        return;
    }
    
    try {
        const response = await authFetch(`${API_BASE_URL}/trainers/${currentTrainer._id}/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ phone, email })
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Failed to update profile');
        }
        
        // Update current trainer data — re-fetch from server so cookie-backed identity stays authoritative
        currentTrainer = (await window.AUTH.me({ force: true })) || { ...currentTrainer, ...data.trainer };

        // Update UI
        updateTrainerInfo();

        closePhoneModal();
        showToast('Contact information updated successfully', 'success');
        
    } catch (error) {
        console.error('❌ Error updating contact info:', error);
        showToast(`Failed to update: ${error.message}`, 'error');
    }
}

function updateLastSync() {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const lastSyncEl = document.getElementById('lastSync');
    if (lastSyncEl) {
        lastSyncEl.textContent = timeString;
    }
}

function updateCurrentTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const currentTimeEl = document.getElementById('currentTime');
    if (currentTimeEl) {
        currentTimeEl.textContent = timeString;
    }
}

async function logout() {
    await window.AUTH.logout({ role: 'trainer' });
}

// Toast notification system
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    
    const colors = {
        'success': 'bg-green-500 dark:bg-green-600',
        'error': 'bg-red-500 dark:bg-red-600',
        'warning': 'bg-yellow-500 dark:bg-yellow-600',
        'info': 'bg-blue-500 dark:bg-blue-600'
    };
    
    const icons = {
        'success': 'ri-check-circle-line',
        'error': 'ri-error-warning-line',
        'warning': 'ri-alert-line',
        'info': 'ri-information-line'
    };
    
    toast.className = `${colors[type]} text-white px-6 py-3 rounded-xl shadow-lg flex items-center space-x-3 transform transition-all duration-300 translate-x-full animate-fade-in`;
    toast.innerHTML = `
        <i class="${icons[type]} text-lg"></i>
        <span class="flex-1">${escapeHtml(message)}</span>
        <button onclick="this.parentElement.remove()" class="ml-4 text-white hover:text-gray-200 transition-colors">
            <i class="ri-close-line"></i>
        </button>
    `;
    
    toastContainer.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.remove('translate-x-full'), 100);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentElement) {
    toast.classList.add('translate-x-full');
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);
}

// Get time ago string
function getTimeAgo(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    
    return date.toLocaleDateString();
}

// ---- bootstrap (new): identity once, then start the router ----
async function initializeDashboard() {
    try {
        // Cookie-based auth: requireAuth bounces to /trainer/login if no session.
        const trainer = await window.AUTH.requireAuth('/trainer/login');
        if (!trainer) return;
        currentTrainer = trainer;

        initializeUI();        // shell wiring (theme, sidebar, clock, phone modal, lastSync)
        updateTrainerInfo();   // paint the sidebar identity (other fields filled by tab inits)
        checkPhoneUpdate();    // global phone-update modal, if needed

        // Hand off to the History-API router: shows the tab for the current URL
        // (or dashboard), injects its partial, and calls that tab's init().
        if (window.TrainerRouter) window.TrainerRouter.start();
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showToast('Error loading dashboard', 'error');
    }
}

document.addEventListener('DOMContentLoaded', initializeDashboard);
