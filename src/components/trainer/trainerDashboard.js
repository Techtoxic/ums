// Beautiful Trainer Dashboard - Matching Student Portal Design
let currentTrainer = null;
let assignmentsData = [];
let studentsData = [];
let toolsData = [];
let selectedToolType = null;
let selectedFile = null;
let bulkToolType = null;
let bulkFiles = [];
let currentSection = 'dashboard';

// Utility function to escape HTML and prevent XSS
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = text.toString();
    return div.innerHTML;
}

// Initialize dashboard on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
});

// Initialize dashboard
async function initializeDashboard() {
    try {
        console.log('🚀 Initializing beautiful trainer dashboard...');
        
        // Check if trainer is logged in
        const trainerData = localStorage.getItem('trainerData');
        if (!trainerData) {
            window.location.href = '/trainer/login';
            return;
        }

        currentTrainer = JSON.parse(trainerData);
        console.log('👤 Current trainer:', currentTrainer.name);
        
        // Initialize UI components
        initializeUI();
        
        // Update UI with trainer info
        updateTrainerInfo();
        
        // Load dashboard data
        await loadDashboardData();
        
        // Check if phone update is needed
        checkPhoneUpdate();
        
        console.log('✅ Beautiful dashboard initialization complete');
        
    } catch (error) {
        console.error('❌ Error initializing dashboard:', error);
        showToast('Error loading dashboard', 'error');
    }
}

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

// Load dashboard data
async function loadDashboardData() {
    try {
        console.log('📊 Loading dashboard data...');
        
        // Load assignments and students in parallel
        await Promise.all([
            loadAssignments(),
            loadStudents()
        ]);
        
        console.log('✅ Dashboard data loaded successfully');
        
    } catch (error) {
        console.error('❌ Error loading dashboard data:', error);
        showToast('Error loading some data', 'error');
    }
}

// Load trainer assignments
async function loadAssignments() {
    try {
        console.log('🔄 Loading assignments...');
        
        if (currentSection === 'assignments') {
            showLoadingState();
        }
        
        const response = await fetch(`/api/trainers/${currentTrainer._id}/assignments`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Failed to fetch assignments');
        }
        
        assignmentsData = data.assignments || [];
        
        console.log(`✅ Successfully loaded ${assignmentsData.length} assignments`);
        
        // Update stats
        updateStats();
        
        // Display assignments if on assignments section
        if (currentSection === 'assignments') {
            displayAssignments();
        }
        
    } catch (error) {
        console.error('❌ Error loading assignments:', error);
        if (currentSection === 'assignments') {
            showErrorState(error.message);
        }
        showToast(`Failed to load assignments: ${error.message}`, 'error');
    }
}

// Load students
async function loadStudents() {
    try {
        console.log('🔄 Loading students...');
        
        const response = await fetch(`/api/trainers/${currentTrainer._id}/students`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }
        
            const data = await response.json();
        
        // Handle the API response structure: { students: {courseCode: [student1, student2]}, totalStudents: X }
        if (data.students && typeof data.students === 'object') {
            // Flatten the students object into an array
            studentsData = [];
            for (const courseCode in data.students) {
                if (Array.isArray(data.students[courseCode])) {
                    studentsData.push(...data.students[courseCode]);
                }
            }
        } else {
            studentsData = Array.isArray(data) ? data : [];
        }
        
        console.log(`✅ Successfully loaded ${studentsData.length} students`);
        console.log('📊 Students data:', studentsData.map(s => ({ name: s.name, course: s.course })));
        
        // Update stats
        updateStats();
        
        // Display students if on students section
        if (currentSection === 'students') {
            displayStudents();
        }
        
    } catch (error) {
        console.error('❌ Error loading students:', error);
        studentsData = [];
        updateStats();
        if (currentSection === 'students') {
            displayStudents();
        }
    }
}

// Update dashboard stats
function updateStats() {
    // Units assigned
    const unitsCount = assignmentsData.length;
    document.getElementById('statsAssignments').textContent = unitsCount;
    document.getElementById('welcomeUnitsCount').textContent = unitsCount;
    
    // Students count
    document.getElementById('statsStudents').textContent = studentsData.length;
    
    // Count unique courses
    const uniqueCourses = new Set(assignmentsData.map(a => a.courseCode));
    document.getElementById('statsCourses').textContent = uniqueCourses.size;
}

// Show section
function showSection(sectionName) {
    console.log(`🔄 Showing section: ${sectionName}`);
    
    currentSection = sectionName;
    
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('bg-primary/10', 'text-primary', 'dark:bg-primary/20', 'dark:text-primary-light');
        item.classList.add('text-gray-600', 'dark:text-gray-400', 'hover:bg-gray-100', 'dark:hover:bg-gray-700', 'hover:text-gray-900', 'dark:hover:text-white');
    });
    
    const activeNav = document.getElementById(`nav-${sectionName}`);
    if (activeNav) {
        activeNav.classList.remove('text-gray-600', 'dark:text-gray-400', 'hover:bg-gray-100', 'dark:hover:bg-gray-700', 'hover:text-gray-900', 'dark:hover:text-white');
        activeNav.classList.add('bg-primary/10', 'text-primary', 'dark:bg-primary/20', 'dark:text-primary-light');
    }
    
    // Hide all sections
    document.querySelectorAll('[id^="section-"]').forEach(section => {
        section.classList.add('hidden');
    });
    
    // Show target section
    const targetSection = document.getElementById(`section-${sectionName}`);
    if (targetSection) {
        targetSection.classList.remove('hidden');
    }
    
    // Update page title
    const titles = {
        'dashboard': 'Dashboard',
        'assignments': 'My Assignments',
        'students': 'My Students',
        'tools-of-trade': 'Tools of Trade',
        'notifications': 'Notifications',
        'profile': 'Profile Settings'
    };
    
    document.getElementById('pageTitle').textContent = titles[sectionName] || sectionName;
    
    // Load section-specific data
    if (sectionName === 'assignments' && assignmentsData.length > 0) {
        displayAssignments();
    } else if (sectionName === 'students' && studentsData.length > 0) {
        displayStudents();
    } else if (sectionName === 'tools-of-trade') {
        loadToolsOfTrade();
    } else if (sectionName === 'notifications') {
        loadNotifications();
    }
    
    // Close mobile sidebar
    closeMobileSidebar();
}

// Display assignments
function displayAssignments() {
    console.log('🎨 Displaying assignments...');
    
    const filter = document.getElementById('assignmentFilter')?.value || '';
    let filteredAssignments = [...assignmentsData];
    
    // Apply filter
    if (filter === 'current') {
        filteredAssignments = assignmentsData.filter(a => a.semester === 'current');
    } else if (filter === 'upcoming') {
        filteredAssignments = assignmentsData.filter(a => a.semester === 'upcoming');
    }
    
    console.log(`📊 Filtered assignments: ${filteredAssignments.length} (filter: ${filter || 'none'})`);
    
    // Validate assignments have complete data
    const validAssignments = filteredAssignments.filter(assignment => {
        return assignment && 
               assignment.unitId && 
               assignment.unitId.unitCode && 
               assignment.unitId.unitName &&
               assignment.status;
    });
    
    console.log(`✅ Valid assignments: ${validAssignments.length}`);
    
    if (validAssignments.length === 0) {
        showEmptyState();
        return;
    }
    
    // Generate assignment cards
    const assignmentsGrid = document.getElementById('assignmentsGrid');
    assignmentsGrid.innerHTML = validAssignments.map(assignment => createAssignmentCard(assignment)).join('');
    
    // Show assignments grid
    showAssignmentsGrid();
    
    console.log('✅ Assignments displayed successfully');
}

// Create assignment card HTML
function createAssignmentCard(assignment) {
    const unitCode = assignment.unitId?.unitCode || 'N/A';
    const unitName = assignment.unitId?.unitName || 'Unknown Unit';
    const courseCode = assignment.unitId?.courseCode || assignment.courseCode || 'N/A';
    const level = assignment.unitId?.level || 'N/A';
    const status = assignment.status || 'active';
    const assignedAt = assignment.assignedAt ? new Date(assignment.assignedAt).toLocaleDateString() : 'N/A';
    const assignedBy = assignment.assignedBy || 'System';
    const semester = assignment.semester || 'Current';
    const notes = assignment.notes || '';
    const type = assignment.type || 'department';
    const isCommonUnit = type === 'common';
    
        const statusColors = {
        'active': 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
        'completed': 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
        'cancelled': 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
        };
        
        return `
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 card-hover ${isCommonUnit ? 'ring-2 ring-blue-200 dark:ring-blue-800' : ''}">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <h3 class="font-semibold text-gray-900 dark:text-white text-lg">${escapeHtml(unitCode)}</h3>
                            ${isCommonUnit ? '<span class="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">Common Unit</span>' : ''}
                        </div>
                        <p class="text-gray-600 dark:text-gray-400 text-sm">${escapeHtml(unitName)}</p>
                    </div>
                    <span class="px-3 py-1 rounded-full text-xs font-medium border ${statusColors[status] || statusColors.active}">
                        ${escapeHtml(status.charAt(0).toUpperCase() + status.slice(1))}
                    </span>
                </div>
                
                <div class="space-y-2 mb-4">
                    <div class="flex justify-between text-sm">
                    <span class="text-gray-600 dark:text-gray-400">Course:</span>
                    <span class="font-medium text-gray-900 dark:text-white">${escapeHtml(formatCourseName(courseCode))}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                    <span class="text-gray-600 dark:text-gray-400">Level:</span>
                    <span class="font-medium text-gray-900 dark:text-white">Level ${escapeHtml(level)}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                    <span class="text-gray-600 dark:text-gray-400">Assigned:</span>
                    <span class="font-medium text-gray-900 dark:text-white">${escapeHtml(assignedAt)}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                    <span class="text-gray-600 dark:text-gray-400">Semester:</span>
                    <span class="font-medium text-gray-900 dark:text-white">${escapeHtml(semester)}</span>
                    </div>
                    ${isCommonUnit && assignment.assignedByDepartment ? `
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-600 dark:text-gray-400">Assigned By:</span>
                        <span class="font-medium text-gray-900 dark:text-white">${escapeHtml(formatDepartmentName(assignment.assignedByDepartment))} HOD</span>
                    </div>
                    ` : ''}
                </div>
                
            ${notes ? `
                <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-4">
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                        <i class="ri-sticky-note-line mr-2 text-gray-400 dark:text-gray-500"></i>
                        ${escapeHtml(notes)}
                        </p>
                    </div>
                ` : ''}
                
            <div class="flex justify-between items-center pt-4 border-t border-gray-100 dark:border-gray-700">
                <div class="text-xs text-gray-500 dark:text-gray-500">
                    Assigned by: ${escapeHtml(assignedBy)}
                </div>
                <button onclick="viewUnitDetails('${assignment._id}')" class="text-primary hover:text-secondary text-sm font-medium transition-colors">
                    <i class="ri-eye-line mr-1"></i>View Details
                </button>
                </div>
            </div>
        `;
}

// Display students
function displayStudents() {
    console.log('🎨 Displaying students...');
    
    const filter = document.getElementById('studentsFilter')?.value || '';
    let filteredStudents = [...studentsData];
    
    // Apply filter
    if (filter === 'year1') {
        filteredStudents = studentsData.filter(s => s.year === 1);
    } else if (filter === 'year2') {
        filteredStudents = studentsData.filter(s => s.year === 2);
    } else if (filter === 'year3') {
        filteredStudents = studentsData.filter(s => s.year === 3);
    }
    
    const studentsGrid = document.getElementById('studentsGrid');
    const studentsEmptyState = document.getElementById('studentsEmptyState');
    
    if (filteredStudents.length === 0) {
        studentsGrid.classList.add('hidden');
        studentsEmptyState.classList.remove('hidden');
        return;
    }
    
    studentsGrid.classList.remove('hidden');
    studentsEmptyState.classList.add('hidden');
    
    studentsGrid.innerHTML = filteredStudents.map(student => createStudentCard(student)).join('');
    
    console.log(`✅ Displayed ${filteredStudents.length} students`);
}

// Create student card HTML
function createStudentCard(student) {
    const admissionNumber = student.admissionNumber || student.studentId || 'N/A';
    const year = student.year || 'N/A';
    const email = student.email || 'N/A';
    const intake = student.intake || 'N/A';
    
    return `
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 card-hover">
            <div class="flex items-center space-x-4 mb-4">
                <div class="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <i class="ri-user-line text-primary text-xl"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-gray-900 dark:text-white truncate">${escapeHtml(student.name)}</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-400 truncate">${escapeHtml(formatCourseName(student.course))}</p>
                        </div>
                    </div>
                    
                        <div class="space-y-2">
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600 dark:text-gray-400">Admission No:</span>
                    <span class="font-medium text-gray-900 dark:text-white">${escapeHtml(admissionNumber)}</span>
                        </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600 dark:text-gray-400">Year:</span>
                    <span class="font-medium text-gray-900 dark:text-white">Year ${escapeHtml(year)}</span>
                    </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600 dark:text-gray-400">Intake:</span>
                    <span class="font-medium text-gray-900 dark:text-white">${escapeHtml(intake)}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600 dark:text-gray-400">Email:</span>
                    <span class="font-medium text-gray-900 dark:text-white text-xs truncate">${escapeHtml(email)}</span>
                        </div>
                    </div>
            
            <div class="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                <div class="text-xs text-gray-500 dark:text-gray-500 truncate">
                    Course: ${escapeHtml(formatCourseName(student.course))}
                </div>
            </div>
        </div>
    `;
}

// Format course name
function formatCourseName(courseCode) {
    if (!courseCode) return 'N/A';
    return courseCode.replace(/_/g, ' ').toUpperCase();
}

// Show loading state
function showLoadingState() {
    document.getElementById('loadingState')?.classList.remove('hidden');
    document.getElementById('assignmentsGrid')?.classList.add('hidden');
    document.getElementById('emptyState')?.classList.add('hidden');
    document.getElementById('errorState')?.classList.add('hidden');
}

// Show assignments grid
function showAssignmentsGrid() {
    document.getElementById('loadingState')?.classList.add('hidden');
    document.getElementById('assignmentsGrid')?.classList.remove('hidden');
    document.getElementById('emptyState')?.classList.add('hidden');
    document.getElementById('errorState')?.classList.add('hidden');
}

// Show empty state
function showEmptyState() {
    document.getElementById('loadingState')?.classList.add('hidden');
    document.getElementById('assignmentsGrid')?.classList.add('hidden');
    document.getElementById('emptyState')?.classList.remove('hidden');
    document.getElementById('errorState')?.classList.add('hidden');
}

// Show error state
function showErrorState(message) {
    document.getElementById('loadingState')?.classList.add('hidden');
    document.getElementById('assignmentsGrid')?.classList.add('hidden');
    document.getElementById('emptyState')?.classList.add('hidden');
    document.getElementById('errorState')?.classList.remove('hidden');
    const errorMessageEl = document.getElementById('errorMessage');
    if (errorMessageEl) {
        errorMessageEl.textContent = message;
    }
}

// Refresh functions
async function refreshAssignments() {
    await loadAssignments();
    showToast('Assignments refreshed successfully', 'success');
}

async function refreshStudents() {
    await loadStudents();
    showToast('Students refreshed successfully', 'success');
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
        const response = await fetch(`/api/trainers/${currentTrainer._id}/profile`, {
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
        
        // Update current trainer data
        currentTrainer = { ...currentTrainer, ...data.trainer };
        localStorage.setItem('trainerData', JSON.stringify(currentTrainer));
        
        // Update UI
        updateTrainerInfo();
        
        closePhoneModal();
        showToast('Contact information updated successfully', 'success');
        
    } catch (error) {
        console.error('❌ Error updating contact info:', error);
        showToast(`Failed to update: ${error.message}`, 'error');
    }
}

async function handleProfileUpdate(event) {
    event.preventDefault();
    
    const email = document.getElementById('profileEmail').value.trim();
    const phone = document.getElementById('profilePhone').value.trim();
    
    try {
        const response = await fetch(`/api/trainers/${currentTrainer._id}/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, phone })
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Failed to update profile');
        }
        
        // Update current trainer data
        currentTrainer = { ...currentTrainer, ...data.trainer };
        localStorage.setItem('trainerData', JSON.stringify(currentTrainer));
        
        // Update UI
        updateTrainerInfo();
        
        showToast('Profile updated successfully', 'success');
        
    } catch (error) {
        console.error('❌ Error updating profile:', error);
        showToast(`Failed to update profile: ${error.message}`, 'error');
    }
}

function resetProfileForm() {
    updateTrainerInfo();
    showToast('Form reset to original values', 'info');
}

// Utility functions
function viewUnitDetails(assignmentId) {
    const assignment = assignmentsData.find(a => a._id === assignmentId);
    if (assignment) {
        showToast(`Unit Details: ${assignment.unitId?.unitName || 'Unknown Unit'}`, 'info');
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

function logout() {
        localStorage.removeItem('trainerData');
    localStorage.removeItem('theme');
        window.location.href = '/trainer/login';
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

// Tools of Trade Functions

// Load Tools of Trade data
async function loadToolsOfTrade() {
    try {
        console.log('🔄 Loading tools of trade...');
        
        showToolsLoadingState();
        
        // Load units for dropdown
        await loadUnitsForTools();
        
        // Load submitted tools
        const response = await fetch(`/api/tools/trainer/${currentTrainer._id}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        toolsData = await response.json();
        
        console.log(`✅ Successfully loaded ${toolsData.length} tools`);
        
        displayTools();
        
    } catch (error) {
        console.error('❌ Error loading tools:', error);
        showToolsEmptyState();
        showToast(`Failed to load tools: ${error.message}`, 'error');
    }
}

// Load units for tools dropdown
async function loadUnitsForTools() {
    try {
        const response = await fetch(`/api/trainers/${currentTrainer._id}/assignments`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        const assignments = data.assignments || [];
        
        const unitSelect = document.getElementById('unitSelect');
        unitSelect.innerHTML = '<option value="">Choose a unit to upload tools for...</option>';
        
        assignments.forEach(assignment => {
            if (assignment.unitId && assignment.unitId.unitCode) {
                const option = document.createElement('option');
                option.value = assignment.unitId._id;
                option.textContent = `${assignment.unitId.unitCode} - ${assignment.unitId.unitName}`;
                unitSelect.appendChild(option);
            }
        });
        
    } catch (error) {
        console.error('❌ Error loading units for tools:', error);
    }
}

// Select tool type
function selectToolType(toolType) {
    selectedToolType = toolType;
    
    // Update UI
    document.querySelectorAll('.tool-type-btn').forEach(btn => {
        btn.classList.remove('border-primary', 'bg-primary/5');
        btn.classList.add('border-gray-200', 'dark:border-gray-600');
    });
    
    event.target.closest('.tool-type-btn').classList.remove('border-gray-200', 'dark:border-gray-600');
    event.target.closest('.tool-type-btn').classList.add('border-primary', 'bg-primary/5');
    
    // Enable upload button if file is selected
    updateUploadButton();
}

// Handle file selection
function handleFileSelect(event) {
    const file = event.target.files[0];
    
    if (!file) {
        clearFileSelection();
        return;
    }
    
    // Validate file type
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
        showToast('Please select a PDF, DOC, or DOCX file', 'error');
        return;
    }
    
    // Validate file size (1MB = 1024 * 1024 bytes)
    if (file.size > 1024 * 1024) {
        showToast('File size must be less than 1MB', 'error');
        return;
    }
    
    selectedFile = file;
    
    // Update UI
    document.getElementById('selectedFileName').textContent = file.name;
    document.getElementById('selectedFileSize').textContent = formatFileSize(file.size);
    document.getElementById('selectedFileInfo').classList.remove('hidden');
    
    updateUploadButton();
}

// Clear file selection
function clearFileSelection() {
    selectedFile = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('selectedFileInfo').classList.add('hidden');
    updateUploadButton();
}

// Update upload button state
function updateUploadButton() {
    const uploadBtn = document.getElementById('uploadBtn');
    const unitSelect = document.getElementById('unitSelect');
    
    const canUpload = selectedFile && selectedToolType && unitSelect.value;
    uploadBtn.disabled = !canUpload;
}

// Upload tool
async function uploadTool() {
    if (!selectedFile || !selectedToolType) {
        showToast('Please select a file and tool type', 'error');
        return;
    }
    
    const unitSelect = document.getElementById('unitSelect');
    if (!unitSelect.value) {
        showToast('Please select a unit', 'error');
        return;
    }
    
    try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('trainerId', currentTrainer._id);
        formData.append('unitId', unitSelect.value);
        formData.append('toolType', selectedToolType);
        formData.append('academicYear', '2024/2025');
        formData.append('semester', '1');
        
        const uploadBtn = document.getElementById('uploadBtn');
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<i class="ri-loader-4-line animate-spin mr-2"></i>Uploading...';
        
        const response = await fetch('/api/tools/upload', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Upload failed');
        }
        
        showToast('Tool uploaded successfully!', 'success');
        
        // Reset form
        clearFileSelection();
        selectedToolType = null;
        document.querySelectorAll('.tool-type-btn').forEach(btn => {
            btn.classList.remove('border-primary', 'bg-primary/5');
            btn.classList.add('border-gray-200', 'dark:border-gray-600');
        });
        unitSelect.value = '';
        updateUploadButton();
        
        // Reload tools
        await loadToolsOfTrade();
        
    } catch (error) {
        console.error('❌ Error uploading tool:', error);
        showToast(`Upload failed: ${error.message}`, 'error');
    } finally {
        const uploadBtn = document.getElementById('uploadBtn');
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="ri-upload-line mr-2"></i>Upload Tool';
    }
}

// Display tools
function displayTools() {
    const toolsGrid = document.getElementById('toolsGrid');
    const toolsEmptyState = document.getElementById('toolsEmptyState');
    const toolsLoadingState = document.getElementById('toolsLoadingState');
    
    toolsLoadingState.classList.add('hidden');
    
    if (toolsData.length === 0) {
        toolsGrid.classList.add('hidden');
        toolsEmptyState.classList.remove('hidden');
        return;
    }
    
    toolsGrid.classList.remove('hidden');
    toolsEmptyState.classList.add('hidden');
    
    toolsGrid.innerHTML = toolsData.map(tool => createToolCard(tool)).join('');
}

// Create tool card HTML
function createToolCard(tool) {
    const statusColors = {
        'submitted': 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
        'under_review': 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800',
        'approved': 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
        'rejected': 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
        'needs_revision': 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800'
    };
    
    const toolTypeNames = {
        'course_outline': 'Course Outline',
        'learning_plan': 'Learning Plan',
        'record_of_work': 'Record of Work',
        'session_plan': 'Session Plan',
        'exam': 'Exam'
    };
    
    const unitName = tool.unitId?.unitName || tool.commonUnitId?.unitName || 'Unknown Unit';
    const unitCode = tool.unitId?.unitCode || tool.commonUnitId?.unitCode || 'N/A';
    const submittedAt = new Date(tool.submittedAt).toLocaleDateString();
    const fileSize = formatFileSize(tool.fileSize);
    
    return `
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 card-hover">
            <div class="flex justify-between items-start mb-4">
                <div class="flex-1">
                    <h3 class="font-semibold text-gray-900 dark:text-white text-lg">${escapeHtml(toolTypeNames[tool.toolType] || tool.toolType)}</h3>
                    <p class="text-gray-600 dark:text-gray-400 text-sm">${escapeHtml(unitCode)} - ${escapeHtml(unitName)}</p>
                </div>
                <span class="px-3 py-1 rounded-full text-xs font-medium border ${statusColors[tool.status] || statusColors.submitted}">
                    ${escapeHtml(tool.status.replace('_', ' ').toUpperCase())}
                </span>
            </div>
            
            <div class="space-y-2 mb-4">
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600 dark:text-gray-400">File:</span>
                    <span class="font-medium text-gray-900 dark:text-white truncate">${escapeHtml(tool.originalFileName)}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600 dark:text-gray-400">Size:</span>
                    <span class="font-medium text-gray-900 dark:text-white">${fileSize}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600 dark:text-gray-400">Submitted:</span>
                    <span class="font-medium text-gray-900 dark:text-white">${submittedAt}</span>
                </div>
            </div>
            
            ${tool.feedback ? `
                <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-4">
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                        <i class="ri-message-line mr-2 text-gray-400 dark:text-gray-500"></i>
                        ${escapeHtml(tool.feedback)}
                    </p>
                </div>
            ` : ''}
            
            <div class="flex justify-between items-center pt-4 border-t border-gray-100 dark:border-gray-700">
                <div class="text-xs text-gray-500 dark:text-gray-500">
                    ${escapeHtml(tool.academicYear)} - Semester ${escapeHtml(tool.semester)}
                </div>
                <div class="flex space-x-2">
                    <button onclick="downloadTool('${tool._id}')" class="text-primary hover:text-secondary text-sm font-medium transition-colors">
                        <i class="ri-download-line mr-1"></i>Download
                    </button>
                    <button onclick="deleteTool('${tool._id}')" class="text-red-500 hover:text-red-700 text-sm font-medium transition-colors">
                        <i class="ri-delete-bin-line mr-1"></i>Delete
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Download tool
async function downloadTool(toolId) {
    try {
        const tool = toolsData.find(t => t._id === toolId);
        if (!tool) {
            showToast('Tool not found', 'error');
            return;
        }
        
        const response = await fetch(`/uploads/tools-of-trade/${tool.toolType}/${tool.fileName}`);
        
        if (!response.ok) {
            throw new Error('File not found');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = tool.originalFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showToast('File downloaded successfully', 'success');
        
    } catch (error) {
        console.error('❌ Error downloading tool:', error);
        showToast(`Download failed: ${error.message}`, 'error');
    }
}

// Delete tool
async function deleteTool(toolId) {
    if (!confirm('Are you sure you want to delete this tool? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/tools/${toolId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        showToast('Tool deleted successfully', 'success');
        
        // Reload tools
        await loadToolsOfTrade();
        
    } catch (error) {
        console.error('❌ Error deleting tool:', error);
        showToast(`Delete failed: ${error.message}`, 'error');
    }
}

// Refresh tools
async function refreshTools() {
    await loadToolsOfTrade();
    showToast('Tools refreshed successfully', 'success');
}

// Show tools loading state
function showToolsLoadingState() {
    document.getElementById('toolsLoadingState')?.classList.remove('hidden');
    document.getElementById('toolsGrid')?.classList.add('hidden');
    document.getElementById('toolsEmptyState')?.classList.add('hidden');
}

// Show tools empty state
function showToolsEmptyState() {
    document.getElementById('toolsLoadingState')?.classList.add('hidden');
    document.getElementById('toolsGrid')?.classList.add('hidden');
    document.getElementById('toolsEmptyState')?.classList.remove('hidden');
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Bulk Upload Functions

// Show bulk upload modal
function showBulkUploadModal() {
    document.getElementById('bulkUploadModal').classList.remove('hidden');
    document.getElementById('bulkUploadModal').classList.add('flex');
}

// Close bulk upload modal
function closeBulkUploadModal() {
    document.getElementById('bulkUploadModal').classList.add('hidden');
    document.getElementById('bulkUploadModal').classList.remove('flex');
    
    // Reset form
    bulkToolType = null;
    bulkFiles = [];
    document.querySelectorAll('.bulk-tool-type-btn').forEach(btn => {
        btn.classList.remove('border-primary', 'bg-primary/5');
        btn.classList.add('border-gray-200', 'dark:border-gray-600');
    });
    document.getElementById('bulkFilesList').classList.add('hidden');
    document.getElementById('bulkUploadProgress').classList.add('hidden');
    document.getElementById('bulkUploadBtn').disabled = true;
}

// Select bulk tool type
function selectBulkToolType(toolType) {
    bulkToolType = toolType;
    
    // Update UI
    document.querySelectorAll('.bulk-tool-type-btn').forEach(btn => {
        btn.classList.remove('border-primary', 'bg-primary/5');
        btn.classList.add('border-gray-200', 'dark:border-gray-600');
    });
    
    event.target.closest('.bulk-tool-type-btn').classList.remove('border-gray-200', 'dark:border-gray-600');
    event.target.closest('.bulk-tool-type-btn').classList.add('border-primary', 'bg-primary/5');
    
    updateBulkUploadButton();
}

// Handle bulk file selection
function handleBulkFileSelect(event) {
    const files = Array.from(event.target.files);
    
    if (files.length === 0) {
        clearBulkFileSelection();
        return;
    }
    
    // Validate files
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const validFiles = [];
    const errors = [];
    
    files.forEach((file, index) => {
        if (!allowedTypes.includes(file.type)) {
            errors.push(`${file.name}: Invalid file type`);
        } else if (file.size > 1024 * 1024) {
            errors.push(`${file.name}: File size exceeds 1MB`);
        } else {
            validFiles.push(file);
        }
    });
    
    if (errors.length > 0) {
        showToast(`Some files were rejected: ${errors.join(', ')}`, 'error');
    }
    
    if (validFiles.length === 0) {
        clearBulkFileSelection();
        return;
    }
    
    // Accumulate files instead of replacing them
    bulkFiles = [...bulkFiles, ...validFiles];
    displayBulkFiles();
    updateBulkUploadButton();
}

// Display selected bulk files
function displayBulkFiles() {
    const filesList = document.getElementById('bulkFilesList');
    const filesContainer = document.getElementById('bulkFilesContainer');
    
    filesContainer.innerHTML = bulkFiles.map((file, index) => `
        <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div class="flex items-center space-x-3">
                <i class="ri-file-line text-2xl text-primary"></i>
                <div>
                    <p class="font-medium text-gray-900 dark:text-white">${escapeHtml(file.name)}</p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">${formatFileSize(file.size)} - ${bulkToolType || 'No tool type selected'}</p>
                </div>
            </div>
            <button onclick="removeBulkFile(${index})" class="text-red-500 hover:text-red-700">
                <i class="ri-close-line text-xl"></i>
            </button>
        </div>
    `).join('');
    
    filesList.classList.remove('hidden');
}

// Remove file from bulk selection
function removeBulkFile(index) {
    bulkFiles.splice(index, 1);
    
    if (bulkFiles.length === 0) {
        clearBulkFileSelection();
    } else {
        displayBulkFiles();
    }
    
    updateBulkUploadButton();
}

// Clear bulk file selection
function clearBulkFileSelection() {
    bulkFiles = [];
    document.getElementById('bulkFileInput').value = '';
    document.getElementById('bulkFilesList').classList.add('hidden');
    updateBulkUploadButton();
}

// Update bulk upload button state
function updateBulkUploadButton() {
    const uploadBtn = document.getElementById('bulkUploadBtn');
    const canUpload = bulkFiles.length > 0 && bulkToolType;
    uploadBtn.disabled = !canUpload;
}

// Upload bulk tools
async function uploadBulkTools() {
    if (bulkFiles.length === 0 || !bulkToolType) {
        showToast('Please select files and tool type', 'error');
        return;
    }
    
    try {
        const uploadBtn = document.getElementById('bulkUploadBtn');
        const progressContainer = document.getElementById('bulkUploadProgress');
        const progressBar = document.getElementById('bulkProgressBar');
        const progressText = document.getElementById('bulkProgressText');
        
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<i class="ri-loader-4-line animate-spin mr-2"></i>Uploading...';
        progressContainer.classList.remove('hidden');
        
        let successCount = 0;
        let errorCount = 0;
        
        // Get selected unit
        const unitSelect = document.getElementById('unitSelect');
        const selectedUnitId = unitSelect.value;
        
        if (!selectedUnitId) {
            showToast('Please select a unit first', 'error');
            return;
        }
        
        for (let i = 0; i < bulkFiles.length; i++) {
            const file = bulkFiles[i];
            const progress = ((i + 1) / bulkFiles.length) * 100;
            
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `Uploading ${file.name} (${i + 1}/${bulkFiles.length})`;
            
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('trainerId', currentTrainer._id);
                formData.append('unitId', selectedUnitId); // Use selected unit
                formData.append('toolType', bulkToolType);
                formData.append('academicYear', '2024/2025');
                formData.append('semester', '1');
                
                const response = await fetch('/api/tools/upload', {
                    method: 'POST',
                    body: formData
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.success) {
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } else {
                    errorCount++;
                }
            } catch (error) {
                console.error(`Error uploading ${file.name}:`, error);
                errorCount++;
            }
        }
        
        // Show results
        if (successCount > 0) {
            showToast(`Successfully uploaded ${successCount} files`, 'success');
        }
        if (errorCount > 0) {
            showToast(`${errorCount} files failed to upload`, 'error');
        }
        
        // Reset form
        closeBulkUploadModal();
        
        // Reload tools
        await loadToolsOfTrade();
        
    } catch (error) {
        console.error('❌ Error in bulk upload:', error);
        showToast(`Bulk upload failed: ${error.message}`, 'error');
    } finally {
        const uploadBtn = document.getElementById('bulkUploadBtn');
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="ri-upload-2-line mr-2"></i>Upload All Files';
        document.getElementById('bulkUploadProgress').classList.add('hidden');
    }
}

// Notifications Functions

// Load notifications
async function loadNotifications() {
    try {
        if (!currentTrainer || !currentTrainer._id) {
            console.error('No trainer data available');
            return;
        }

        showNotificationsLoadingState();

        const response = await fetch(`http://localhost:5502/api/notifications/${currentTrainer._id}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const notifications = await response.json();
        
        console.log(`✅ Successfully loaded ${notifications.length} notifications`);

        displayNotifications(notifications);
        updateNotificationBadge(notifications);

    } catch (error) {
        console.error('❌ Error loading notifications:', error);
        showNotificationsEmptyState();
        showToast(`Failed to load notifications: ${error.message}`, 'error');
    }
}

// Display notifications
function displayNotifications(notifications) {
    const notificationsList = document.getElementById('notificationsList');
    const notificationsEmptyState = document.getElementById('notificationsEmptyState');
    const notificationsLoadingState = document.getElementById('notificationsLoadingState');

    notificationsLoadingState.classList.add('hidden');

    if (notifications.length === 0) {
        notificationsList.classList.add('hidden');
        notificationsEmptyState.classList.remove('hidden');
        return;
    }

    notificationsList.classList.remove('hidden');
    notificationsEmptyState.classList.add('hidden');

    notificationsList.innerHTML = notifications.map(notification => createNotificationCard(notification)).join('');
}

// Create notification card HTML
function createNotificationCard(notification) {
    const isRead = notification.isRead;
    const timeAgo = getTimeAgo(notification.createdAt);
    
    return `
        <div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary/50 transition-all ${!isRead ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-white dark:bg-gray-800'}">
            <div class="flex items-start justify-between">
                <div class="flex-1">
                    <div class="flex items-center space-x-2 mb-2">
                        <h3 class="font-semibold text-gray-900 dark:text-white">${escapeHtml(notification.title)}</h3>
                        ${!isRead ? '<span class="w-2 h-2 bg-red-500 rounded-full"></span>' : ''}
                    </div>
                    <p class="text-gray-600 dark:text-gray-400 text-sm mb-2">${escapeHtml(notification.message)}</p>
                    <div class="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-500">
                        <span>${timeAgo}</span>
                        <span class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full">${escapeHtml(notification.type.replace('_', ' '))}</span>
                    </div>
                </div>
                <div class="flex items-center space-x-2 ml-4">
                    ${!isRead ? `
                        <button onclick="markAsRead('${notification._id}')" class="text-primary hover:text-secondary text-sm font-medium transition-colors">
                            Mark as Read
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

// Mark notification as read
async function markAsRead(notificationId) {
    try {
        const response = await fetch(`http://localhost:5502/api/notifications/${notificationId}/read`, {
            method: 'PATCH'
        });

        if (!response.ok) {
            throw new Error('Failed to mark notification as read');
        }

        // Reload notifications
        await loadNotifications();
        showToast('Notification marked as read', 'success');

    } catch (error) {
        console.error('❌ Error marking notification as read:', error);
        showToast(`Failed to mark as read: ${error.message}`, 'error');
    }
}

// Mark all notifications as read
async function markAllAsRead() {
    try {
        if (!currentTrainer || !currentTrainer._id) {
            showToast('No trainer data available', 'error');
            return;
        }

        const response = await fetch(`http://localhost:5502/api/notifications/${currentTrainer._id}/read-all`, {
            method: 'PATCH'
        });

        if (!response.ok) {
            throw new Error('Failed to mark all notifications as read');
        }

        // Reload notifications
        await loadNotifications();
        showToast('All notifications marked as read', 'success');

    } catch (error) {
        console.error('❌ Error marking all notifications as read:', error);
        showToast(`Failed to mark all as read: ${error.message}`, 'error');
    }
}

// Refresh notifications
async function refreshNotifications() {
    await loadNotifications();
    showToast('Notifications refreshed', 'success');
}

// Update notification badge
function updateNotificationBadge(notifications) {
    const badge = document.getElementById('notification-badge');
    const unreadCount = notifications.filter(n => !n.isRead).length;
    
    if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// Show notifications loading state
function showNotificationsLoadingState() {
    document.getElementById('notificationsLoadingState')?.classList.remove('hidden');
    document.getElementById('notificationsList')?.classList.add('hidden');
    document.getElementById('notificationsEmptyState')?.classList.add('hidden');
}

// Show notifications empty state
function showNotificationsEmptyState() {
    document.getElementById('notificationsLoadingState')?.classList.add('hidden');
    document.getElementById('notificationsList')?.classList.add('hidden');
    document.getElementById('notificationsEmptyState')?.classList.remove('hidden');
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

// Initialize with dashboard section
setTimeout(() => showSection('dashboard'), 100);