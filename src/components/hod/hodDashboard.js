// HOD Dashboard JavaScript
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

// Initialize dashboard on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
});

// Initialize dashboard
async function initializeDashboard() {
    try {
        // Initialize theme first
        initializeTheme();
        
        // Setup UI interactions
        setupUI();
        
        // Check if HOD is logged in
        const hodData = localStorage.getItem('hodData');
        if (!hodData) {
            window.location.href = '/hod/login';
            return;
        }

        currentHOD = JSON.parse(hodData);
        console.log(`Current HOD data:`, currentHOD);
        
        // Update UI with HOD info
        updateHODInfo();
        
        // Check if profile update is needed
        checkProfileUpdate();
        
        // Load dashboard data
        await loadDashboardData();
        
        // Load students data
        await loadStudents();
        
        // Initialize tab switching
        switchTab('overview');
        
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showToast('Error loading dashboard data', 'error');
    }
}

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

// Show profile update modal
function showProfileUpdateModal(needsEmailUpdate, needsPhoneUpdate) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
    modal.id = 'profile-update-modal';
    
    let title, description;
    if (needsEmailUpdate && needsPhoneUpdate) {
        title = 'Update Contact Information';
        description = 'Please update your email address and phone number to keep your account secure and receive important notifications.';
    } else if (needsEmailUpdate) {
        title = 'Update Email Address';
        description = 'Please update your email address to keep your account secure and receive important notifications.';
    } else {
        title = 'Update Phone Number';
        description = 'Please add your phone number to receive important notifications.';
    }
    
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md transform transition-all duration-300 scale-95">
            <div class="p-6 border-b border-gray-200">
                <div class="flex items-center justify-between">
                    <h3 class="text-lg font-semibold text-gray-800">${title}</h3>
                    <button onclick="closeProfileUpdateModal()" class="p-2 hover:bg-gray-100 rounded-lg">
                        <i class="ri-close-line text-xl text-gray-600"></i>
                    </button>
                </div>
            </div>
            <form id="profile-update-form" class="p-6">
                <div class="space-y-4">
                    <p class="text-gray-600 text-sm">${description}</p>
                    
                    <div>
                        <label for="hod-email" class="block text-sm font-medium text-gray-700 mb-2">
                            <i class="ri-mail-line mr-2 text-blue-600"></i>Email Address
                        </label>
                        <input 
                            type="email" 
                            id="hod-email" 
                            value="${currentHOD.email || ''}"
                            placeholder="Enter your email address"
                            class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            ${needsEmailUpdate ? 'required' : ''}
                        >
                    </div>
                    
                    <div>
                        <label for="hod-phone" class="block text-sm font-medium text-gray-700 mb-2">
                            <i class="ri-phone-line mr-2 text-blue-600"></i>Phone Number
                        </label>
                        <input 
                            type="tel" 
                            id="hod-phone" 
                            value="${currentHOD.phone || ''}"
                            placeholder="Enter your phone number"
                            class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            ${needsPhoneUpdate ? 'required' : ''}
                        >
                    </div>
                    
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div class="flex items-start">
                            <i class="ri-information-line text-blue-600 mr-2 mt-0.5"></i>
                            <div class="text-sm text-blue-700">
                                <p class="font-medium mb-1">Important Notes:</p>
                                <ul class="list-disc list-inside space-y-1 text-xs">
                                    <li>Use a valid email address you have access to</li>
                                    <li>Phone number will be used for important notifications</li>
                                    <li>Make sure the information is spelled correctly</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flex gap-3 pt-6">
                    <button type="button" onclick="closeProfileUpdateModal()" class="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                        Skip for now
                    </button>
                    <button type="submit" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                        <span id="profile-update-btn-text">Update Profile</span>
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Handle form submission
    document.getElementById('profile-update-form').addEventListener('submit', handleProfileUpdate);
    
    // Make functions globally available
    window.closeProfileUpdateModal = function() {
        document.body.removeChild(modal);
        delete window.closeProfileUpdateModal;
    };
}

// Handle profile update
async function handleProfileUpdate(e) {
    e.preventDefault();
    
    const emailInput = document.getElementById('hod-email');
    const phoneInput = document.getElementById('hod-phone');
    const submitBtn = document.querySelector('#profile-update-btn-text');
    
    const email = emailInput.value.trim();
    const phone = phoneInput.value.trim();
    
    if (!email && !phone) {
        closeProfileUpdateModal();
        return;
    }
    
    try {
        // Update button state
        submitBtn.textContent = 'Updating...';
        
        const response = await fetch(`/api/hod/${currentHOD._id}/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, phone })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Update current HOD data
            currentHOD = { ...currentHOD, ...data.hod };
            localStorage.setItem('hodData', JSON.stringify(currentHOD));
            
            // Update UI
            updateHODInfo();
            
            closeProfileUpdateModal();
            showToast('Profile updated successfully', 'success');
        } else {
            showToast(data.message || 'Failed to update profile', 'error');
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        showToast('Error updating profile. Please try again.', 'error');
    } finally {
        // Reset button state
        submitBtn.textContent = 'Update Profile';
    }
}

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
        const response = await fetch(`/api/students/department/${currentHOD.department}`);
        
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
        const response = await fetch(`/api/units/department/${currentHOD.department}`);
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
        const response = await fetch(`/api/trainers/department/${currentHOD.department}`);
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
        const response = await fetch(`/api/assignments/department/${currentHOD.department}`);
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

// Update stats display
function updateStatsDisplay() {
    const totalCourses = coursesData.length || 0;
    const totalUnits = unitsData.length || 0;
    const totalTrainers = trainersData.length || 0;
    const assignedUnits = assignmentsData.length || 0;
    
    // Update main stats
    const totalCoursesEl = document.getElementById('totalCourses');
    const totalUnitsEl = document.getElementById('totalUnits');
    const totalTrainersEl = document.getElementById('totalTrainers');
    const assignedUnitsEl = document.getElementById('assignedUnits');
    
    if (totalCoursesEl) totalCoursesEl.textContent = totalCourses;
    if (totalUnitsEl) totalUnitsEl.textContent = totalUnits;
    if (totalTrainersEl) totalTrainersEl.textContent = totalTrainers;
    if (assignedUnitsEl) assignedUnitsEl.textContent = assignedUnits;
    
    // Update welcome card trainer count
    const welcomeTrainersCount = document.getElementById('welcomeTrainersCount');
    if (welcomeTrainersCount) welcomeTrainersCount.textContent = totalTrainers;
    
    // Update overview stats (if elements exist)
    const assignmentRate = totalUnits > 0 ? Math.round((assignedUnits / totalUnits) * 100) : 0;
    const assignmentRateEl = document.getElementById('assignmentRate');
    const assignmentProgressEl = document.getElementById('assignmentProgress');
    const activeTrainersEl = document.getElementById('activeTrainers');
    
    if (assignmentRateEl) assignmentRateEl.textContent = `${assignmentRate}%`;
    if (assignmentProgressEl) assignmentProgressEl.style.width = `${assignmentRate}%`;
    if (activeTrainersEl) activeTrainersEl.textContent = trainersData.filter(t => t.assignedUnits && t.assignedUnits.length > 0).length || totalTrainers;
    
    console.log('Stats updated:', { totalCourses, totalUnits, totalTrainers, assignedUnits });
}

// Update students statistics
function updateStudentsStats(data) {
    const totalStudents = data.totalStudents || 0;
    const totalCourses = data.totalCourses || 0;
    
    // Update total students count in overview
    const totalStudentsElement = document.getElementById('totalStudents');
    if (totalStudentsElement) {
        totalStudentsElement.textContent = totalStudents;
    }
    
    // Update students per course average
    const avgStudentsPerCourse = totalCourses > 0 ? Math.round(totalStudents / totalCourses) : 0;
    const avgStudentsElement = document.getElementById('avgStudentsPerCourse');
    if (avgStudentsElement) {
        avgStudentsElement.textContent = avgStudentsPerCourse;
    }
    
    // Update department student stats in overview cards
    const departmentStudentsElement = document.getElementById('departmentStudents');
    if (departmentStudentsElement) {
        departmentStudentsElement.textContent = totalStudents;
    }
    
    console.log(`Updated students stats: ${totalStudents} students across ${totalCourses} courses`);
}

// Populate courses display
function populateCoursesDisplay() {
    const coursesList = document.getElementById('coursesList');
    const selectedCourse = document.getElementById('courseFilter').value;
    
    let displayCourses = coursesData;
    if (selectedCourse) {
        displayCourses = coursesData.filter(course => course.courseCode === selectedCourse);
    }
    
    // Pagination logic
    const totalCourses = displayCourses.length;
    const totalPages = Math.ceil(totalCourses / itemsPerPage.courses);
    const startIndex = (currentPage.courses - 1) * itemsPerPage.courses;
    const endIndex = startIndex + itemsPerPage.courses;
    const paginatedCourses = displayCourses.slice(startIndex, endIndex);
    
    if (totalCourses === 0) {
        coursesList.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-book text-4xl text-gray-400 dark:text-gray-600 mb-4"></i>
                <h3 class="text-lg font-medium text-gray-500 dark:text-gray-400 mb-2">No Courses Found</h3>
                <p class="text-gray-400 dark:text-gray-500">No courses available for this department.</p>
            </div>
        `;
        updatePaginationControls('courses', 0, 0);
        return;
    }
    
    coursesList.innerHTML = paginatedCourses.map(course => `
        <div class="border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">${course.courseName}</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-400">Level ${course.level} • ${course.units.length} units</p>
                </div>
                <span class="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-sm font-medium">
                    ${course.courseCode.toUpperCase()}
                </span>
            </div>
            
            <div class="space-y-2">
                ${course.units.map(unit => {
                    const assignment = assignmentsData.find(a => a.unitId && a.unitId._id === unit._id);
                    return `
                        <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                            <div>
                                <p class="font-medium text-gray-800">${unit.unitCode}</p>
                                <p class="text-sm text-gray-600">${unit.unitName}</p>
                            </div>
                            <div class="flex items-center space-x-3">
                                ${assignment && assignment.trainerId ? `
                                    <span class="text-sm text-green-600 font-medium">
                                        <i class="fas fa-user mr-1"></i>${assignment.trainerId.name || 'Unknown Trainer'}
                                    </span>
                                ` : `
                                    <span class="text-sm text-gray-500">Unassigned</span>
                                `}
                                <button 
                                    onclick="assignUnitToTrainer('${unit._id}')" 
                                    class="text-blue-600 hover:text-blue-700 transition-colors"
                                    title="Assign Trainer"
                                >
                                    <i class="fas fa-user-plus"></i>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `).join('');
    
    // Update pagination controls
    updatePaginationControls('courses', totalCourses, totalPages);
}

// Populate course filter
function populateCourseFilter() {
    const courseFilter = document.getElementById('courseFilter');
    
    courseFilter.innerHTML = '<option value="">All Courses</option>' +
        coursesData.map(course => `
            <option value="${course.courseCode}">${course.courseName}</option>
        `).join('');
    
    courseFilter.addEventListener('change', populateCoursesDisplay);
}

// Populate trainers display
function populateTrainersDisplay() {
    const trainersGrid = document.getElementById('trainersGrid');
    
    trainersGrid.innerHTML = trainersData.map(trainer => {
        const trainerAssignments = assignmentsData.filter(a => 
            a.trainerId && 
            a.trainerId._id && 
            a.trainerId._id.toString() === trainer._id.toString()
        );
        
        return `
            <div class="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-6">
                <div class="flex items-center mb-4">
                    <div class="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                        ${trainer.name.charAt(0)}
                    </div>
                    <div class="ml-4">
                        <h3 class="font-semibold text-gray-800 dark:text-gray-200">${trainer.name}</h3>
                        <p class="text-sm text-gray-600 dark:text-gray-400">${trainer.email}</p>
                    </div>
                </div>
                
                <div class="space-y-3">
                    <div class="flex justify-between items-center">
                        <span class="text-sm text-gray-600">Assigned Units</span>
                        <span class="font-medium text-gray-800">${trainerAssignments.length}</span>
                    </div>
                    
                    ${trainerAssignments.length > 0 ? `
                        <div class="space-y-1">
                            ${trainerAssignments.slice(0, 3).map(assignment => `
                                <div class="text-xs bg-gray-50 rounded px-2 py-1">
                                    ${assignment.unitId ? assignment.unitId.unitCode : 'Unknown'} - ${assignment.unitId ? assignment.unitId.unitName : 'Unknown Unit'}
                                </div>
                            `).join('')}
                            ${trainerAssignments.length > 3 ? `
                                <div class="text-xs text-gray-500">
                                    +${trainerAssignments.length - 3} more units
                                </div>
                            ` : ''}
                        </div>
                    ` : `
                        <p class="text-sm text-gray-500 italic">No units assigned</p>
                    `}
                </div>
                
                <div class="mt-4 pt-4 border-t border-gray-100">
                    <button 
                        onclick="assignUnitsToSpecificTrainer('${trainer._id}')" 
                        class="w-full bg-blue-50 hover:bg-blue-100 text-blue-600 py-2 px-4 rounded-lg transition-colors text-sm font-medium"
                    >
                        <i class="fas fa-plus mr-2"></i>Assign Units
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Populate trainer select dropdown
function populateTrainerSelect() {
    const trainerSelect = document.getElementById('modalTrainerSelect');
    
    trainerSelect.innerHTML = '<option value="">Choose a trainer...</option>' +
        trainersData.map(trainer => `
            <option value="${trainer._id}">${trainer.name}</option>
        `).join('');
    
    trainerSelect.addEventListener('change', updateAssignButtonState);
}

// Populate assignments display
function populateAssignmentsDisplay() {
    const tableBody = document.getElementById('assignmentsTableBody');
    const filter = document.getElementById('assignmentFilter').value;
    
    let displayAssignments = assignmentsData;
    
    if (filter === 'assigned') {
        // Show only assigned units
        displayAssignments = assignmentsData;
    } else if (filter === 'unassigned') {
        // Show unassigned units
        const assignedUnitIds = assignmentsData.map(a => a.unitId._id);
        const unassignedUnits = unitsData.filter(unit => !assignedUnitIds.includes(unit._id));
        
        tableBody.innerHTML = unassignedUnits.map(unit => `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap">
                    <input type="checkbox" class="assignment-checkbox rounded border-gray-300 text-blue-600 focus:ring-blue-500" value="${unit._id}">
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div>
                        <div class="text-sm font-medium text-gray-900">${unit.unitCode}</div>
                        <div class="text-sm text-gray-500">${unit.unitName}</div>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${formatCourseName(unit.courseCode)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        Unassigned
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button 
                        onclick="assignUnitToTrainer('${unit._id}')" 
                        class="text-blue-600 hover:text-blue-900"
                    >
                        Assign
                    </button>
                </td>
            </tr>
        `).join('');
        return;
    }
    
    tableBody.innerHTML = displayAssignments.map(assignment => `
        <tr>
            <td class="px-6 py-4 whitespace-nowrap">
                <input type="checkbox" class="assignment-checkbox rounded border-gray-300 text-blue-600 focus:ring-blue-500" value="${assignment.unitId ? assignment.unitId._id : ''}">
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div>
                    <div class="text-sm font-medium text-gray-900">${assignment.unitId ? assignment.unitId.unitCode : 'Unknown Unit'}</div>
                    <div class="text-sm text-gray-500">${assignment.unitId ? assignment.unitId.unitName : 'No unit name'}</div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                ${assignment.unitId ? formatCourseName(assignment.unitId.courseCode) : 'Unknown Course'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">${assignment.trainerId ? assignment.trainerId.name : 'Unknown Trainer'}</div>
                <div class="text-sm text-gray-500">${assignment.trainerId ? assignment.trainerId.email : 'No email'}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${new Date(assignment.assignedAt).toLocaleDateString()}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button 
                    onclick="unassignUnit('${assignment.unitId ? assignment.unitId._id : ''}')" 
                    class="text-red-600 hover:text-red-900"
                    ${!assignment.unitId ? 'disabled' : ''}
                >
                    Unassign
                </button>
            </td>
        </tr>
    `).join('');
    
    setupAssignmentFilters();
}

// Setup assignment filters and bulk actions
function setupAssignmentFilters() {
    const filterSelect = document.getElementById('assignmentFilter');
    const selectAllCheckbox = document.getElementById('selectAllAssignments');
    const bulkUnassignBtn = document.getElementById('bulkUnassignBtn');
    
    filterSelect.addEventListener('change', populateAssignmentsDisplay);
    
    selectAllCheckbox.addEventListener('change', function() {
        const checkboxes = document.querySelectorAll('.assignment-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
        });
        updateBulkActionButtons();
    });
    
    // Update bulk action buttons when individual checkboxes change
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('assignment-checkbox')) {
            updateBulkActionButtons();
        }
    });
}

// Update bulk action buttons
function updateBulkActionButtons() {
    const checkedBoxes = document.querySelectorAll('.assignment-checkbox:checked');
    const bulkUnassignBtn = document.getElementById('bulkUnassignBtn');
    
    if (checkedBoxes.length > 0) {
        bulkUnassignBtn.classList.remove('hidden');
    } else {
        bulkUnassignBtn.classList.add('hidden');
    }
}

// Tab switching functionality
function switchTab(tabName) {
    // Update sidebar navigation
    document.querySelectorAll('.nav-item').forEach(button => {
        button.classList.remove('bg-blue-50', 'dark:bg-blue-900/20', 'text-blue-600', 'dark:text-blue-400', 'border-l-4', 'border-blue-500');
        button.classList.add('text-gray-700', 'dark:text-gray-300', 'hover:bg-gray-100', 'dark:hover:bg-gray-700');
    });
    
    const activeNav = document.getElementById(`nav-${tabName}`);
    if (activeNav) {
        activeNav.classList.remove('text-gray-700', 'dark:text-gray-300', 'hover:bg-gray-100', 'dark:hover:bg-gray-700');
        activeNav.classList.add('bg-blue-50', 'dark:bg-blue-900/20', 'text-blue-600', 'dark:text-blue-400', 'border-l-4', 'border-blue-500');
    }
    
    // Update page title
    const titles = {
        'overview': 'Overview',
        'courses': 'Courses & Units',
        'trainers': 'Trainers',
        'assignments': 'Unit Assignments',
        'analytics': 'Analytics',
        'profile': 'My Profile'
    };
    document.getElementById('pageTitle').textContent = titles[tabName] || 'Dashboard';
    
    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    
    const targetContent = document.getElementById(`content-${tabName}`);
    if (targetContent) {
        targetContent.classList.remove('hidden');
    }
    
    // Initialize analytics if switching to analytics tab
    if (tabName === 'analytics') {
        setTimeout(() => updateAnalytics(), 100);
    }
}

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
        <label class="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded">
            <input type="checkbox" class="modal-unit-checkbox rounded border-gray-300 text-blue-600 focus:ring-blue-500" value="${unit._id}">
            <div class="flex-1">
                <div class="text-sm font-medium text-gray-900">${unit.unitCode}</div>
                <div class="text-sm text-gray-500">${unit.unitName}</div>
                <div class="text-xs text-gray-400">${formatCourseName(unit.courseCode)}</div>
            </div>
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
    const selectedUnits = Array.from(document.querySelectorAll('.modal-unit-checkbox:checked')).map(cb => cb.value);
    
    if (!trainerId || selectedUnits.length === 0) {
        showToast('Please select a trainer and at least one unit', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/assignments/assign', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                trainerId: trainerId,
                unitIds: selectedUnits,
                assignedBy: currentHOD.email,
                department: currentHOD.department
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
        const response = await fetch('/api/assignments/unassign', {
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
        const response = await fetch('/api/assignments/unassign', {
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

// Update analytics charts
function updateAnalytics() {
    updateAssignmentChart();
    updateWorkloadChart();
}

// Update assignment status chart
function updateAssignmentChart() {
    const ctx = document.getElementById('assignmentChart').getContext('2d');
    
    const assignedCount = assignmentsData.length;
    const unassignedCount = unitsData.length - assignedCount;
    
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Assigned', 'Unassigned'],
            datasets: [{
                data: [assignedCount, unassignedCount],
                backgroundColor: ['#10B981', '#EF4444'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// Global chart instances to manage destruction
let workloadChart = null;

// Update trainer workload chart
function updateWorkloadChart() {
    const ctx = document.getElementById('workloadChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (workloadChart) {
        workloadChart.destroy();
    }
    
    const trainerWorkloads = trainersData.map(trainer => {
        const assignmentCount = assignmentsData.filter(a => 
            a.trainerId && 
            a.trainerId._id && 
            trainer._id && 
            a.trainerId._id.toString() === trainer._id.toString()
        ).length;
        return {
            name: trainer.name ? trainer.name.split(' ')[0] : 'Unknown', // First name only
            assignments: assignmentCount
        };
    });
    
    workloadChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: trainerWorkloads.map(t => t.name),
            datasets: [{
                label: 'Assigned Units',
                data: trainerWorkloads.map(t => t.assignments),
                backgroundColor: '#3B82F6',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

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

// Logout function
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('hodData');
        window.location.href = '/hod/login';
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
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

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

// ========================================
// COMMON UNITS FUNCTIONALITY
// ========================================

// Load common units data
async function loadCommonUnits() {
    try {
        console.log('Loading common units...');
        const response = await fetch('/api/common-units');
        
        if (response.ok) {
            const data = await response.json();
            commonUnitsData = data.commonUnits || [];
            console.log('Common units loaded:', commonUnitsData.length);
            populateCommonUnitsDisplay();
        } else {
            console.error('Failed to load common units:', response.status);
        }
    } catch (error) {
        console.error('Error loading common units:', error);
    }
}

// Load common unit assignments
async function loadCommonUnitAssignments() {
    try {
        console.log('Loading common unit assignments...');
        const response = await fetch(`/api/common-unit-assignments?department=${currentHOD.department}`);
        
        if (response.ok) {
            const data = await response.json();
            commonUnitAssignmentsData = data.assignments || [];
            console.log('Common unit assignments loaded:', commonUnitAssignmentsData.length);
            populateCommonUnitAssignmentsDisplay();
            updateCommonUnitsStats();
        } else {
            console.error('Failed to load common unit assignments:', response.status);
        }
    } catch (error) {
        console.error('Error loading common unit assignments:', error);
    }
}

// Load all trainers for common unit assignment
async function loadAllTrainers() {
    try {
        console.log('Loading all trainers...');
        const response = await fetch('/api/trainers/all-departments');
        
        if (response.ok) {
            const data = await response.json();
            allTrainersData = data.trainers || [];
            console.log('All trainers loaded:', allTrainersData.length);
        } else {
            console.error('Failed to load all trainers:', response.status);
        }
    } catch (error) {
        console.error('Error loading all trainers:', error);
    }
}

// Populate common units display
function populateCommonUnitsDisplay() {
    const commonUnitsList = document.getElementById('commonUnitsList');
    if (!commonUnitsList) return;
    
    if (commonUnitsData.length === 0) {
        commonUnitsList.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-sm italic">No common units found</p>';
        return;
    }
    
    const unitsHtml = commonUnitsData.map(unit => `
        <div class="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-600">
            <div class="flex justify-between items-start">
                <div class="flex-1">
                    <h4 class="font-medium text-gray-800 dark:text-gray-200 text-sm">${escapeHtml(unit.unitName)}</h4>
                    <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">${escapeHtml(unit.unitCode)}</p>
                </div>
                <span class="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded">
                    Common
                </span>
            </div>
        </div>
    `).join('');
    
    commonUnitsList.innerHTML = unitsHtml;
}

// Populate common unit assignments table
function populateCommonUnitAssignmentsDisplay() {
    const tableBody = document.getElementById('commonUnitsAssignmentsTableBody');
    if (!tableBody) return;
    
    if (commonUnitAssignmentsData.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    <i class="ri-folder-open-line text-2xl mb-2 block"></i>
                    No common unit assignments found
                </td>
            </tr>
        `;
        return;
    }
    
    const assignmentsHtml = commonUnitAssignmentsData.map(assignment => {
        const assignedDate = new Date(assignment.assignedAt).toLocaleDateString();
        const statusBadge = getStatusBadge(assignment.status);
        
        return `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-medium text-gray-900 dark:text-gray-100">
                        ${escapeHtml(assignment.commonUnitId?.unitName || 'N/A')}
                    </div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">
                        ${escapeHtml(assignment.commonUnitId?.unitCode || 'N/A')}
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-900 dark:text-gray-100">
                        ${escapeHtml(assignment.trainerId?.name || 'N/A')}
                    </div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">
                        ${escapeHtml(assignment.trainerId?.email || 'N/A')}
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="text-sm text-gray-900 dark:text-gray-100">
                        ${formatDepartmentName(assignment.trainerDepartment)}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    ${statusBadge}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    ${assignedDate}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button 
                        onclick="removeCommonUnitAssignment('${assignment._id}')"
                        class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                        title="Remove Assignment"
                    >
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    tableBody.innerHTML = assignmentsHtml;
}

// Update common units statistics
function updateCommonUnitsStats() {
    const statsContainer = document.getElementById('commonUnitsStats');
    if (!statsContainer) return;
    
    const totalAssignments = commonUnitAssignmentsData.length;
    const activeAssignments = commonUnitAssignmentsData.filter(a => a.status === 'active').length;
    const assignedUnits = new Set(commonUnitAssignmentsData.map(a => a.commonUnitId?._id)).size;
    const totalCommonUnits = commonUnitsData.length;
    
    statsContainer.innerHTML = `
        <div class="flex justify-between">
            <span class="text-gray-600 dark:text-gray-400 text-sm">Total Assignments</span>
            <span class="font-medium text-gray-800 dark:text-gray-200">${totalAssignments}</span>
        </div>
        <div class="flex justify-between">
            <span class="text-gray-600 dark:text-gray-400 text-sm">Active Assignments</span>
            <span class="font-medium text-gray-800 dark:text-gray-200">${activeAssignments}</span>
        </div>
        <div class="flex justify-between">
            <span class="text-gray-600 dark:text-gray-400 text-sm">Units Assigned</span>
            <span class="font-medium text-gray-800 dark:text-gray-200">${assignedUnits}/${totalCommonUnits}</span>
        </div>
        <div class="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 mt-2">
            <div class="bg-blue-600 h-2 rounded-full" style="width: ${totalCommonUnits > 0 ? (assignedUnits / totalCommonUnits) * 100 : 0}%"></div>
        </div>
    `;
}

// Show assign common units modal
async function showAssignCommonUnitsModal() {
    const modal = document.getElementById('assignCommonUnitsModal');
    if (!modal) return;
    
    // Debug HOD information
    console.log('🔍 Current HOD when opening modal:', currentHOD);
    console.log('🔍 HOD from localStorage:', localStorage.getItem('hodData'));
    
    // Load data if not already loaded
    if (commonUnitsData.length === 0) await loadCommonUnits();
    if (allTrainersData.length === 0) await loadAllTrainers();
    
    // Populate common units dropdown
    const commonUnitSelect = document.getElementById('commonUnitSelect');
    if (commonUnitSelect) {
        commonUnitSelect.innerHTML = '<option value="">Choose a common unit...</option>' +
            commonUnitsData.map(unit => `
                <option value="${unit._id}">${escapeHtml(unit.unitName)} (${escapeHtml(unit.unitCode)})</option>
            `).join('');
    }
    
    
    // Load trainers list
    populateTrainersForCommonUnit();
    
    // Setup event listeners
    setupCommonUnitModalEventListeners();
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// Close assign common units modal
function closeAssignCommonUnitsModal() {
    const modal = document.getElementById('assignCommonUnitsModal');
    if (!modal) return;
    
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    
    // Reset form
    selectedTrainerForCommonUnit = null;
    document.getElementById('commonUnitSelect').value = '';
    document.getElementById('trainerDepartmentFilter').value = '';
    document.getElementById('commonUnitNotes').value = '';
    
    // Reset button state
    const assignBtn = document.getElementById('assignCommonUnitBtn');
    if (assignBtn) {
        assignBtn.disabled = true;
    }
}

// Setup common unit modal event listeners
function setupCommonUnitModalEventListeners() {
    // Department filter change
    const departmentFilter = document.getElementById('trainerDepartmentFilter');
    if (departmentFilter) {
        departmentFilter.addEventListener('change', populateTrainersForCommonUnit);
    }
    
    // Form validation
    const requiredFields = ['commonUnitSelect'];
    requiredFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('change', validateCommonUnitForm);
            field.addEventListener('input', validateCommonUnitForm);
        }
    });
}

// Populate trainers list for common unit assignment
function populateTrainersForCommonUnit() {
    const trainersList = document.getElementById('trainersList');
    const departmentFilter = document.getElementById('trainerDepartmentFilter');
    if (!trainersList || !departmentFilter) return;
    
    const selectedDepartment = departmentFilter.value;
    let filteredTrainers = allTrainersData;
    
    if (selectedDepartment) {
        filteredTrainers = allTrainersData.filter(trainer => trainer.department === selectedDepartment);
    }
    
    if (filteredTrainers.length === 0) {
        trainersList.innerHTML = `
            <div class="p-4 text-center text-gray-500 dark:text-gray-400">
                No trainers found${selectedDepartment ? ' in selected department' : ''}
            </div>
        `;
        return;
    }
    
    const trainersHtml = filteredTrainers.map(trainer => `
        <div class="trainer-item p-3 border-b border-gray-200 dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${selectedTrainerForCommonUnit?.id === trainer._id ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : ''}"
             onclick="selectTrainerForCommonUnit('${trainer._id}', '${escapeHtml(trainer.name)}', '${escapeHtml(trainer.department)}')">
            <div class="flex items-center justify-between">
                <div class="flex-1">
                    <h4 class="font-medium text-gray-800 dark:text-gray-200 text-sm">${escapeHtml(trainer.name)}</h4>
                    <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">${escapeHtml(trainer.email)}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-500 mt-1">${formatDepartmentName(trainer.department)}</p>
                </div>
                <div class="text-right">
                    <i class="ri-user-line text-gray-400 dark:text-gray-500"></i>
                </div>
            </div>
        </div>
    `).join('');
    
    trainersList.innerHTML = trainersHtml;
}

// Select trainer for common unit assignment
function selectTrainerForCommonUnit(trainerId, trainerName, trainerDepartment) {
    selectedTrainerForCommonUnit = {
        id: trainerId,
        name: trainerName,
        department: trainerDepartment
    };
    
    // Update visual selection
    document.querySelectorAll('.trainer-item').forEach(item => {
        item.classList.remove('bg-blue-50', 'dark:bg-blue-900/20', 'border-blue-200', 'dark:border-blue-800');
    });
    
    event.currentTarget.classList.add('bg-blue-50', 'dark:bg-blue-900/20', 'border-blue-200', 'dark:border-blue-800');
    
    validateCommonUnitForm();
}

// Validate common unit form
function validateCommonUnitForm() {
    const commonUnitSelect = document.getElementById('commonUnitSelect');
    const assignBtn = document.getElementById('assignCommonUnitBtn');
    
    if (!commonUnitSelect || !assignBtn) return;
    
    const isValid = commonUnitSelect.value && selectedTrainerForCommonUnit;
    
    assignBtn.disabled = !isValid;
}

// Assign common unit
async function assignCommonUnit() {
    const assignBtn = document.getElementById('assignCommonUnitBtn');
    if (!assignBtn || assignBtn.disabled) return;
    
    const commonUnitId = document.getElementById('commonUnitSelect').value;
    const notes = document.getElementById('commonUnitNotes').value.trim();
    
    if (!commonUnitId || !selectedTrainerForCommonUnit) {
        showToast('Please fill in all required fields', 'error');
        return;
    }
    
    if (!currentHOD || !currentHOD._id) {
        // Try to reload HOD data from localStorage
        const hodData = localStorage.getItem('hodData');
        if (hodData) {
            try {
                currentHOD = JSON.parse(hodData);
                console.log('🔄 Reloaded HOD data from localStorage:', currentHOD);
            } catch (e) {
                console.error('❌ Error parsing HOD data from localStorage:', e);
            }
        }
        
        // Check again after attempting to reload
        if (!currentHOD || !currentHOD._id) {
            showToast('HOD information not available. Please log in again.', 'error');
            // Redirect to login after a short delay
            setTimeout(() => {
                window.location.href = '/src/components/hod/HODLogin.html';
            }, 2000);
            return;
        }
    }
    
    // Disable button and show loading
    const originalText = assignBtn.innerHTML;
    assignBtn.disabled = true;
    assignBtn.innerHTML = '<i class="ri-loader-4-line animate-spin mr-2"></i>Assigning...';
    
    try {
        const assignmentData = {
            commonUnitId: commonUnitId,
            trainerId: selectedTrainerForCommonUnit.id,
            assignedBy: currentHOD._id,
            assignedByDepartment: currentHOD.department,
            trainerDepartment: selectedTrainerForCommonUnit.department,
            notes: notes
        };
        
        console.log('Assigning common unit:', assignmentData);
        console.log('Current HOD:', currentHOD);
        console.log('Selected Trainer:', selectedTrainerForCommonUnit);
        
        const response = await fetch('/api/common-unit-assignments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(assignmentData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showToast('Common unit assigned successfully!', 'success');
            closeAssignCommonUnitsModal();
            await loadCommonUnitAssignments(); // Reload assignments
        } else {
            showToast(result.message || 'Failed to assign common unit', 'error');
        }
    } catch (error) {
        console.error('Error assigning common unit:', error);
        showToast('Error assigning common unit', 'error');
    } finally {
        // Restore button
        assignBtn.disabled = false;
        assignBtn.innerHTML = originalText;
    }
}

// Remove common unit assignment
async function removeCommonUnitAssignment(assignmentId) {
    if (!confirm('Are you sure you want to remove this common unit assignment?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/common-unit-assignments/${assignmentId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showToast('Common unit assignment removed successfully!', 'success');
            await loadCommonUnitAssignments(); // Reload assignments
        } else {
            showToast(result.message || 'Failed to remove assignment', 'error');
        }
    } catch (error) {
        console.error('Error removing common unit assignment:', error);
        showToast('Error removing assignment', 'error');
    }
}

// Update the main switchTab function to handle common-units tab
function switchTab(tabName) {
    console.log('Switching to tab:', tabName);
    
    // Hide all content sections
    const allContents = document.querySelectorAll('.tab-content');
    allContents.forEach(content => {
        content.classList.add('hidden');
    });
    
    // Remove active state from all nav items
    const allNavItems = document.querySelectorAll('.nav-item');
    allNavItems.forEach(item => {
        item.classList.remove('bg-primary/10', 'text-primary', 'dark:bg-primary/20', 'dark:text-primary-light');
        item.classList.add('text-gray-600', 'dark:text-gray-400');
    });
    
    // Show selected content
    const targetContent = document.getElementById(`content-${tabName}`);
    if (targetContent) {
        targetContent.classList.remove('hidden');
    }
    
    // Update active nav item
    const activeNavItem = document.getElementById(`nav-${tabName}`);
    if (activeNavItem) {
        activeNavItem.classList.add('bg-primary/10', 'text-primary', 'dark:bg-primary/20', 'dark:text-primary-light');
        activeNavItem.classList.remove('text-gray-600', 'dark:text-gray-400');
    }
    
    // Update page title
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
        const titles = {
            'overview': 'Dashboard',
            'courses': 'Courses & Units',
            'trainers': 'Trainers',
            'common-units': 'Common Units',
            'assignments': 'Unit Assignments',
            'analytics': 'Analytics',
            'profile': 'My Profile'
        };
        pageTitle.textContent = titles[tabName] || 'Dashboard';
    }
    
    // Load data for specific tabs
    if (tabName === 'common-units') {
        loadCommonUnitsData();
    } else if (tabName === 'profile') {
        loadProfileData();
    }
}

// Load common units data when tab is accessed
async function loadCommonUnitsData() {
    console.log('Loading common units data...');
    
    try {
        // Load common units and assignments in parallel
        await Promise.all([
            loadCommonUnits(),
            loadCommonUnitAssignments(),
            loadAllTrainers()
        ]);
        
        console.log('Common units data loaded successfully');
    } catch (error) {
        console.error('Error loading common units data:', error);
        showToast('Error loading common units data', 'error');
    }
}

// Load profile data when profile tab is accessed
function loadProfileData() {
    console.log('Loading profile data...');
    
    if (!currentHOD) {
        console.error('No HOD data available');
        return;
    }
    
    try {
        // Update profile information
        document.getElementById('profile-name').textContent = currentHOD.name || 'N/A';
        document.getElementById('profile-department').textContent = formatDepartmentName(currentHOD.department) || 'N/A';
        document.getElementById('profile-full-name').textContent = currentHOD.name || 'N/A';
        document.getElementById('profile-email').textContent = currentHOD.email || 'Not set';
        document.getElementById('profile-phone').textContent = currentHOD.phone || 'Not set';
        document.getElementById('profile-department-full').textContent = formatDepartmentName(currentHOD.department) || 'N/A';
        
        // Format and display dates
        if (currentHOD.createdAt) {
            const createdDate = new Date(currentHOD.createdAt);
            document.getElementById('profile-created').textContent = createdDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        if (currentHOD.updatedAt) {
            const updatedDate = new Date(currentHOD.updatedAt);
            document.getElementById('profile-updated').textContent = updatedDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        if (currentHOD.lastLogin) {
            const lastLoginDate = new Date(currentHOD.lastLogin);
            document.getElementById('profile-last-login').textContent = lastLoginDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } else {
            document.getElementById('profile-last-login').textContent = 'Never';
        }
        
        // Display user ID
        document.getElementById('profile-id').textContent = currentHOD._id || 'N/A';
        
        // Update account status
        const statusElement = document.getElementById('profile-status');
        if (currentHOD.isActive !== false) {
            statusElement.innerHTML = '<i class="ri-check-circle-line mr-1"></i>Active';
            statusElement.className = 'px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
        } else {
            statusElement.innerHTML = '<i class="ri-close-circle-line mr-1"></i>Inactive';
            statusElement.className = 'px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
        }
        
        console.log('Profile data loaded successfully');
    } catch (error) {
        console.error('Error loading profile data:', error);
        showToast('Error loading profile data', 'error');
    }
}

