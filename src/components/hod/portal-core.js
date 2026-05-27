// portal-core.js — shared base + bootstrap for the HOD portal SPA.
//
// Folds in authFetch + state, identity, cross-tab data loaders, shell chrome,
// the (global) assign-units modal flow, pagination, and toast utils. Verbatim
// moves except the DOMContentLoaded bootstrap at the bottom (loads identity +
// department data once, then starts the router). The dead first switchTab()
// (line ~784) and the live one (~1806) are both replaced by portal-router.js.
//
// Load order: auth.js -> portal-core.js -> portal-router.js -> tab modules.

// ---- authFetch + shared state (verbatim top of hodDashboard.js) ----
// Authenticated fetch wrapper
const authFetch = async (url, options = {}) => {
    // Stage 2B-1B: delegate to the single shared auth helper (public/js/auth.js).
    // It attaches the Authorization header (and a JSON Content-Type for
    // non-FormData bodies) and handles token-expiry redirects. The wrapper
    // name is kept so existing call sites are unchanged.
    return window.AUTH.fetch(url, options);
};

let currentHOD = null;
let coursesData = [];
let trainersData = [];
let unitsData = [];
let assignmentsData = [];
let studentsData = {};
let studentsCourseStats = {};

// Common units data
let commonUnitsData = [];
let commonUnitAssignmentsData = [];
let allTrainersData = [];
let selectedTrainerForCommonUnit = null;

// Pagination variables
let currentPage = {
    courses: 1,
    trainers: 1,
    assignments: 1
};
const itemsPerPage = {
    courses: 6,
    trainers: 8,
    assignments: 10
};

// ---- identity (verbatim) ----
// Update HOD info in header and sidebar
function updateHODInfo() {
    // Update sidebar profile
    const sidebarHodName = document.getElementById('sidebarHodName');
    const sidebarDepartment = document.getElementById('sidebarDepartment');
    
    if (sidebarHodName) sidebarHodName.textContent = currentHOD.name;
    if (sidebarDepartment) sidebarDepartment.textContent = formatDepartmentName(currentHOD.department);
    
    // Update welcome card
    const welcomeHodName = document.getElementById('welcomeHodName');
    const welcomeDepartment = document.getElementById('welcomeDepartment');
    
    if (welcomeHodName) welcomeHodName.textContent = currentHOD.name;
    if (welcomeDepartment) welcomeDepartment.textContent = `Head of ${formatDepartmentName(currentHOD.department)}`;
    
    console.log('HOD info updated:', currentHOD);
}

// Check if profile update is needed
function checkProfileUpdate() {
    // Show update modal if phone or email needs updating
    const needsPhoneUpdate = !currentHOD.phone;
    const needsEmailUpdate = !currentHOD.email || currentHOD.email.includes('default') || currentHOD.email.includes('temp');
    
    if (needsPhoneUpdate || needsEmailUpdate) {
        setTimeout(() => {
            showProfileUpdateModal(needsEmailUpdate, needsPhoneUpdate);
        }, 2000);
    }
}

// ---- department data loaders + formatters (verbatim) ----
// Format department name for display
function formatDepartmentName(department) {
    const departmentNames = {
        'applied_science': 'Applied Science',
        'agriculture': 'Agriculture',
        'building_civil': 'Building & Civil Engineering',
        'electromechanical': 'Electromechanical Engineering',
        'hospitality': 'Hospitality',
        'business_liberal': 'Business & Liberal Studies',
        'computing_informatics': 'Computing & Informatics'
    };
    return departmentNames[department] || department;
}

// Load all dashboard data
async function loadDashboardData() {
    try {
        // Load courses, units, and trainers first
        await Promise.all([
            loadCoursesAndUnits(),
            loadTrainers()
        ]);
        
        // Then load assignments (which will update trainers display)
        await loadAssignments();
        
        updateStatsDisplay();
        updateAnalytics();
        
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showToast('Error loading some data', 'error');
    }
}

// Load students data for HOD department
async function loadStudents() {
    try {
        const response = await authFetch(`/api/students/department/${currentHOD.department}`);
        
        if (response.ok) {
            const data = await response.json();
            studentsData = data.students || {};
            studentsCourseStats = data.courseStats || {};
            
            // Update students display and stats
            updateStudentsStats(data);
            
        } else {
            console.log('No students found for department');
            studentsData = {};
            studentsCourseStats = {};
        }
    } catch (error) {
        console.error('Error loading students:', error);
        studentsData = {};
        studentsCourseStats = {};
    }
}

// Load courses and units for the department
async function loadCoursesAndUnits() {
    try {
        const response = await authFetch(`/api/units/department/${currentHOD.department}`);
        if (!response.ok) throw new Error('Failed to fetch units');
        
        const data = await response.json();
        
        // Extract units array from the response
        unitsData = data.units || [];
        
        // Group units by course
        coursesData = groupUnitsByCourse(unitsData);
        
        populateCoursesDisplay();
        populateCourseFilter();
        
    } catch (error) {
        console.error('Error loading courses and units:', error);
        throw error;
    }
}

// Load trainers for the department
async function loadTrainers() {
    try {
        console.log(`Loading trainers for department: ${currentHOD.department}`);
        const response = await authFetch(`/api/trainers/department/${currentHOD.department}`);
        if (!response.ok) throw new Error('Failed to fetch trainers');
        
        const data = await response.json();
        console.log(`Received trainers data:`, data);
        
        // Handle both direct array response and structured response
        trainersData = Array.isArray(data) ? data : (data.trainers || []);
        console.log(`Final trainersData:`, trainersData);
        
        populateTrainersDisplay();
        populateTrainerSelect();
        
    } catch (error) {
        console.error('Error loading trainers:', error);
        throw error;
    }
}

// Load unit assignments for the department
async function loadAssignments() {
    try {
        console.log(`Loading assignments for department: ${currentHOD.department}`);
        const response = await authFetch(`/api/assignments/department/${currentHOD.department}`);
        if (!response.ok) throw new Error('Failed to fetch assignments');
        
        const data = await response.json();
        console.log(`Received assignments data:`, data);
        
        // Handle both direct array response and structured response
        assignmentsData = Array.isArray(data) ? data : (data.assignments || []);
        console.log(`Final assignmentsData:`, assignmentsData);
        
        populateAssignmentsDisplay();
        
        // Update trainers display after assignments are loaded
        populateTrainersDisplay();
        
    } catch (error) {
        console.error('Error loading assignments:', error);
        throw error;
    }
}

// Group units by course code
function groupUnitsByCourse(units) {
    if (!Array.isArray(units)) {
        console.error('groupUnitsByCourse: Expected array, got:', typeof units, units);
        return [];
    }
    
    const grouped = {};
    
    units.forEach(unit => {
        if (!unit || !unit.courseCode) {
            console.warn('Invalid unit data:', unit);
            return;
        }
        
        if (!grouped[unit.courseCode]) {
            grouped[unit.courseCode] = {
                courseCode: unit.courseCode,
                courseName: formatCourseName(unit.courseCode),
                level: unit.level,
                units: []
            };
        }
        grouped[unit.courseCode].units.push(unit);
    });
    
    return Object.values(grouped);
}

// Format course name
function formatCourseName(courseCode) {
    return courseCode
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// ---- shell chrome (verbatim) ----
// Setup UI interactions
function setupUI() {
    // Mobile menu toggle
    const mobileMenuBtn = document.getElementById('mobileMenuToggle');
    const sidebar = document.getElementById('sidebar');
    const mobileOverlay = document.getElementById('mobileOverlay');

    mobileMenuBtn?.addEventListener('click', () => {
        sidebar.classList.add('mobile-open');
        mobileOverlay.classList.remove('hidden');
    });

    mobileOverlay?.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
        mobileOverlay.classList.add('hidden');
    });

    // Desktop sidebar toggle
    const desktopSidebarToggle = document.getElementById('desktopSidebarToggle');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const mainContent = document.getElementById('main-content');
    let sidebarCollapsed = false;

    const toggleSidebar = () => {
        sidebarCollapsed = !sidebarCollapsed;
        if (sidebarCollapsed) {
            sidebar.classList.add('sidebar-collapsed');
            mainContent.classList.remove('md:ml-64');
            mainContent.classList.add('md:ml-16');
        } else {
            sidebar.classList.remove('sidebar-collapsed');
            mainContent.classList.remove('md:ml-16');
            mainContent.classList.add('md:ml-64');
        }
    };

    desktopSidebarToggle?.addEventListener('click', toggleSidebar);
    sidebarToggle?.addEventListener('click', toggleSidebar);

    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    themeToggle?.addEventListener('click', toggleTheme);

    // Update current time
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);

    // Navigation events
    setupNavigation();
}

// Toggle sidebar for mobile (legacy function)
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobileOverlay');
    const isOpen = !sidebar.classList.contains('-translate-x-full');
    
    if (isOpen) {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    } else {
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
    }
}

// Toggle dark mode
// Legacy function - replaced by toggleTheme()
function toggleDarkMode() {
    // This function is deprecated, use toggleTheme() instead
    toggleTheme();
}

// Initialize theme on load
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    
    if (shouldBeDark) {
        document.documentElement.classList.add('dark');
    }
}

// Toggle theme
function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// Update current time
function updateCurrentTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const currentTimeEl = document.getElementById('currentTime');
    if (currentTimeEl) {
        currentTimeEl.textContent = timeString;
    }
}

// Setup navigation events
function setupNavigation() {
    // Add click events to navigation items if needed
    console.log('Navigation setup complete');
}

// ---- assign-units modal flow — global modal, used by overview/trainers/courses/assignments (verbatim) ----
// Show assign units modal
function showAssignUnitsModal() {
    document.getElementById('assignUnitsModal').classList.remove('hidden');
    document.getElementById('assignUnitsModal').classList.add('flex');
    populateModalUnits();
}

// Close assign units modal
function closeAssignUnitsModal() {
    document.getElementById('assignUnitsModal').classList.add('hidden');
    document.getElementById('assignUnitsModal').classList.remove('flex');
    
    // Reset form
    document.getElementById('modalTrainerSelect').value = '';
    document.getElementById('modalUnitsList').innerHTML = '';
    updateAssignButtonState();
}

// Populate units in modal
function populateModalUnits() {
    const unitsList = document.getElementById('modalUnitsList');
    console.log('populateModalUnits - unitsData:', unitsData);
    console.log('populateModalUnits - assignmentsData:', assignmentsData);
    
    const assignedUnitIds = assignmentsData
        .filter(a => a.unitId && a.unitId._id)
        .map(a => a.unitId._id);
    const unassignedUnits = unitsData.filter(unit => !assignedUnitIds.includes(unit._id));
    
    console.log('populateModalUnits - unassignedUnits:', unassignedUnits);
    
    unitsList.innerHTML = unassignedUnits.map(unit => `
        <label class="flex items-center space-x-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
            <input type="checkbox" class="modal-unit-checkbox rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500" value="${escapeAttr(unit._id)}">
            <div class="flex-1">
                <div class="text-sm font-medium text-gray-900 dark:text-gray-100">${escapeHtml(unit.unitCode)}</div>
                <div class="text-sm text-gray-500 dark:text-gray-400">${escapeHtml(unit.unitName)}</div>
                <div class="text-xs text-gray-400 dark:text-gray-500">${escapeHtml(formatCourseName(unit.courseCode))}</div>
            </div>
            <input type="number" min="1" placeholder="Hrs/wk" class="modal-unit-hours w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400" data-unit-id="${escapeAttr(unit._id)}">
        </label>
    `).join('');
    
    // Add event listeners for unit checkboxes
    document.querySelectorAll('.modal-unit-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updateAssignButtonState);
    });
}

// Update assign button state
function updateAssignButtonState() {
    const trainerSelected = document.getElementById('modalTrainerSelect').value;
    const unitsSelected = document.querySelectorAll('.modal-unit-checkbox:checked').length > 0;
    const assignBtn = document.getElementById('assignUnitsBtn');
    
    assignBtn.disabled = !trainerSelected || !unitsSelected;
}

// Assign selected units
async function assignSelectedUnits() {
    const trainerId = document.getElementById('modalTrainerSelect').value;
    const checkedBoxes = Array.from(document.querySelectorAll('.modal-unit-checkbox:checked'));

    if (!trainerId || checkedBoxes.length === 0) {
        showToast('Please select a trainer and at least one unit', 'error');
        return;
    }

    // Pair each checked unit with its Hrs/week input. Empty or non-positive-integer
    // hours are sent as null (the server coerces too, but send clean data).
    const units = checkedBoxes.map(cb => {
        const unitId = cb.value;
        const hoursInput = document.querySelector(`.modal-unit-hours[data-unit-id="${cb.value}"]`);
        const raw = hoursInput ? hoursInput.value.trim() : '';
        const num = Number(raw);
        const hours = (raw !== '' && Number.isInteger(num) && num > 0) ? num : null;
        return { unitId, hours };
    });

    try {
        const response = await authFetch('/api/assignments/assign', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                trainerId: trainerId,
                units: units
            })
        });
        
        if (!response.ok) throw new Error('Failed to assign units');
        
        showToast('Units assigned successfully', 'success');
        closeAssignUnitsModal();
        await loadAssignments();
        populateCoursesDisplay();
        populateTrainersDisplay();
        populateAssignmentsDisplay();
        updateStatsDisplay();
        
    } catch (error) {
        console.error('Error assigning units:', error);
        showToast('Error assigning units', 'error');
    }
}

// Assign unit to trainer (single unit)
function assignUnitToTrainer(unitId) {
    // Pre-select the unit in the modal
    showAssignUnitsModal();
    
    setTimeout(() => {
        const checkbox = document.querySelector(`.modal-unit-checkbox[value="${unitId}"]`);
        if (checkbox) {
            checkbox.checked = true;
            updateAssignButtonState();
        }
    }, 100);
}

// Assign units to specific trainer
function assignUnitsToSpecificTrainer(trainerId) {
    showAssignUnitsModal();
    
    setTimeout(() => {
        document.getElementById('modalTrainerSelect').value = trainerId;
        updateAssignButtonState();
    }, 100);
}

// Unassign single unit
async function unassignUnit(unitId) {
    if (!confirm('Are you sure you want to unassign this unit?')) return;
    
    try {
        const response = await authFetch('/api/assignments/unassign', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                unitIds: [unitId]
            })
        });
        
        if (!response.ok) throw new Error('Failed to unassign unit');
        
        showToast('Unit unassigned successfully', 'success');
        await loadAssignments();
        populateCoursesDisplay();
        populateTrainersDisplay();
        populateAssignmentsDisplay();
        updateStatsDisplay();
        
    } catch (error) {
        console.error('Error unassigning unit:', error);
        showToast('Error unassigning unit', 'error');
    }
}

// Bulk unassign units
async function bulkUnassignUnits() {
    const selectedUnits = Array.from(document.querySelectorAll('.assignment-checkbox:checked')).map(cb => cb.value);
    
    if (selectedUnits.length === 0) {
        showToast('Please select units to unassign', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to unassign ${selectedUnits.length} unit(s)?`)) return;
    
    try {
        const response = await authFetch('/api/assignments/unassign', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                unitIds: selectedUnits
            })
        });
        
        if (!response.ok) throw new Error('Failed to unassign units');
        
        showToast(`${selectedUnits.length} units unassigned successfully`, 'success');
        await loadAssignments();
        populateCoursesDisplay();
        populateTrainersDisplay();
        populateAssignmentsDisplay();
        updateStatsDisplay();
        
    } catch (error) {
        console.error('Error unassigning units:', error);
        showToast('Error unassigning units', 'error');
    }
}

// ---- pagination (verbatim) ----
// Pagination functions
function changePage(section, direction) {
    const totalItems = getTotalItems(section);
    const totalPages = Math.ceil(totalItems / itemsPerPage[section]);
    
    currentPage[section] += direction;
    
    // Ensure page stays within bounds
    if (currentPage[section] < 1) currentPage[section] = 1;
    if (currentPage[section] > totalPages) currentPage[section] = totalPages;
    
    // Refresh the appropriate display
    switch(section) {
        case 'courses':
            populateCoursesDisplay();
            break;
        case 'trainers':
            populateTrainersDisplay();
            break;
        case 'assignments':
            populateAssignmentsDisplay();
            break;
    }
}

function getTotalItems(section) {
    switch(section) {
        case 'courses':
            const selectedCourse = document.getElementById('courseFilter')?.value;
            return selectedCourse ? 
                coursesData.filter(course => course.courseCode === selectedCourse).length :
                coursesData.length;
        case 'trainers':
            return trainersData.length;
        case 'assignments':
            return assignmentsData.length;
        default:
            return 0;
    }
}

function updatePaginationControls(section, totalItems, totalPages) {
    const pageInfo = document.getElementById(`${section}PageInfo`);
    const pageNumbers = document.getElementById(`${section}PageNumbers`);
    const prevBtn = document.getElementById(`${section}PrevBtn`);
    const nextBtn = document.getElementById(`${section}NextBtn`);
    
    if (!pageInfo || !pageNumbers || !prevBtn || !nextBtn) return;
    
    const startItem = totalItems === 0 ? 0 : (currentPage[section] - 1) * itemsPerPage[section] + 1;
    const endItem = Math.min(currentPage[section] * itemsPerPage[section], totalItems);
    
    // Update page info
    pageInfo.textContent = `Showing ${startItem}-${endItem} of ${totalItems} ${section}`;
    pageNumbers.textContent = `Page ${currentPage[section]} of ${totalPages || 1}`;
    
    // Update button states
    prevBtn.disabled = currentPage[section] <= 1;
    nextBtn.disabled = currentPage[section] >= totalPages || totalPages <= 1;
    
    // Update button classes for disabled state
    if (prevBtn.disabled) {
        prevBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        prevBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    
    if (nextBtn.disabled) {
        nextBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        nextBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

// ---- logout + toast + status badge (verbatim) ----
// Logout function
async function logout() {
    if (confirm('Are you sure you want to logout?')) {
        await window.AUTH.logout({ role: 'hod' });
    }
}

// Toast notification system
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toastIcon');
    const toastMessage = document.getElementById('toastMessage');
    
    const configs = {
        success: {
            icon: 'fas fa-check-circle text-green-500',
            borderColor: 'border-l-green-500'
        },
        error: {
            icon: 'fas fa-exclamation-circle text-red-500',
            borderColor: 'border-l-red-500'
        },
        info: {
            icon: 'fas fa-info-circle text-blue-500',
            borderColor: 'border-l-blue-500'
        }
    };
    
    const config = configs[type] || configs.info;
    
    toastIcon.className = config.icon;
    toast.querySelector('.bg-white').className = `bg-white rounded-lg shadow-lg border-l-4 ${config.borderColor} p-4 min-w-[300px]`;
    toastMessage.textContent = message;
    
    toast.classList.remove('translate-x-full');
    toast.classList.add('translate-x-0');
    
    setTimeout(hideToast, 5000);
}

function hideToast() {
    const toast = document.getElementById('toast');
    toast.classList.add('translate-x-full');
    toast.classList.remove('translate-x-0');
}

// Utility function to escape HTML
// Stage 2B-2A: local escapeHtml removed — use the centralized window.escapeHtml
// (defined in public/js/auth.js, stricter: also escapes '/'). escapeHtml/
// escapeAttr resolve to the globals on window.

function getStatusBadge(status) {
    const statusClasses = {
        'active': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
        'inactive': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
        'completed': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    };
    
    const statusText = {
        'active': 'Active',
        'inactive': 'Inactive', 
        'completed': 'Completed'
    };
    
    const classes = statusClasses[status] || statusClasses['inactive'];
    const text = statusText[status] || status;
    
    return `<span class="inline-flex px-2 py-1 text-xs font-medium rounded-full ${classes}">${text}</span>`;
}

// ---- bootstrap (new): theme + shell + identity + department data, then router ----
document.addEventListener('DOMContentLoaded', async function () {
    try {
        initializeTheme();
        setupUI();

        // Cookie-based auth: requireAuth bounces to /hod/login on no/expired session.
        const user = await window.AUTH.requireAuth('/hod/login');
        if (!user) return;
        currentHOD = user;

        updateHODInfo();        // sidebar identity (welcome line is re-filled by overview init)
        checkProfileUpdate();   // global profile-update modal, if needed

        // Load department data once (courses/units/trainers/assignments) into the
        // shared globals. The render calls inside no-op while their partials are
        // absent (null-guarded); each tab init() re-renders from the globals.
        await loadDashboardData();
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showToast('Error loading dashboard data', 'error');
    }

    if (window.HODRouter) window.HODRouter.start();
});
