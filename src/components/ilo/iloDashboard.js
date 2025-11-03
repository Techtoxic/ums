console.log('🚀 ILO Dashboard JavaScript loading...');
const API_BASE_URL = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : `${window.location.protocol}//${window.location.host}/api`;
let currentApplicationType = '';
let currentApplicationId = '';
let graduationApplications = [];
let attachmentApplications = [];
console.log('📊 Variables initialized, API_BASE_URL:', API_BASE_URL);

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎯 DOM Content Loaded - Initializing ILO Dashboard...');
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    console.log('⏰ Time update initialized');
    
    console.log('📋 Loading applications...');
    loadGraduationApplications();
    loadAttachmentApplications();
    
    // Add filter event listeners
    setupFilterEventListeners();
    console.log('✅ Dashboard initialization complete');
});

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

// Show tab function
function showTab(tabName) {
    console.log('🔧 showTab called with:', tabName);
    
    // Hide all tab contents
    const tabs = ['graduation-applications', 'attachment-applications'];
    tabs.forEach(tab => {
        const element = document.getElementById(tab);
        if (element) {
            element.classList.add('hidden');
            console.log('🔧 Hidden tab:', tab);
        }
    });
    
    // Remove active class from all tab buttons
    const buttons = document.querySelectorAll('.tab-button');
    buttons.forEach(button => {
        button.classList.remove('bg-blue-600', 'text-white');
        button.classList.add('bg-gray-200', 'text-gray-700');
    });
    
    // Show selected tab
    const selectedTab = document.getElementById(tabName);
    if (selectedTab) {
        selectedTab.classList.remove('hidden');
        console.log('🔧 Shown tab:', tabName);
    }
    
    // Add active class to selected button
    const activeButton = document.querySelector('[onclick*="' + tabName + '"]');
    if (activeButton) {
        activeButton.classList.remove('bg-gray-200', 'text-gray-700');
        activeButton.classList.add('bg-blue-600', 'text-white');
        console.log('🔧 Activated button for:', tabName);
    }
}

// Make showTab globally available
window.showTab = showTab;
console.log('🔧 showTab function defined and made globally available');

// Setup filter event listeners
function setupFilterEventListeners() {
    // Graduation filters
    const graduationStatusFilter = document.getElementById('graduation-status-filter');
    const graduationDepartmentFilter = document.getElementById('graduation-department-filter');
    
    if (graduationStatusFilter) {
        graduationStatusFilter.addEventListener('change', () => {
            console.log('🔍 Graduation status filter changed:', graduationStatusFilter.value);
            displayGraduationApplications(graduationApplications);
        });
    }
    
    if (graduationDepartmentFilter) {
        graduationDepartmentFilter.addEventListener('change', () => {
            console.log('🔍 Graduation department filter changed:', graduationDepartmentFilter.value);
            displayGraduationApplications(graduationApplications);
        });
    }
    
    // Attachment filters
    const attachmentStatusFilter = document.getElementById('attachment-status-filter');
    const attachmentCountyFilter = document.getElementById('attachment-county-filter');
    
    if (attachmentStatusFilter) {
        attachmentStatusFilter.addEventListener('change', () => {
            console.log('🔍 Attachment status filter changed:', attachmentStatusFilter.value);
            displayAttachmentApplications(attachmentApplications);
        });
    }
    
    if (attachmentCountyFilter) {
        attachmentCountyFilter.addEventListener('change', () => {
            console.log('🔍 Attachment county filter changed:', attachmentCountyFilter.value);
            displayAttachmentApplications(attachmentApplications);
        });
    }
    
    console.log('🔧 Filter event listeners setup complete');
}

// Load graduation applications
async function loadGraduationApplications() {
    try {
        console.log('🎓 Loading graduation applications from:', API_BASE_URL + '/ilo/graduation-applications');
        const response = await fetch(API_BASE_URL + '/ilo/graduation-applications');
        console.log('🎓 Response status:', response.status);
        
        if (!response.ok) {
            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }
        
        const data = await response.json();
        graduationApplications = data.applications || [];
        console.log('🎓 Found', graduationApplications.length, 'graduation applications');
        
        displayGraduationApplications(graduationApplications);
    } catch (error) {
        console.error('❌ Error loading graduation applications:', error);
        showToast('Failed to load graduation applications: ' + error.message, 'error');
    }
}

// Load attachment applications
async function loadAttachmentApplications() {
    try {
        console.log('📎 Loading attachment applications from:', API_BASE_URL + '/ilo/attachment-applications');
        const response = await fetch(API_BASE_URL + '/ilo/attachment-applications');
        console.log('📎 Response status:', response.status);
        
        if (!response.ok) {
            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }
        
        const data = await response.json();
        attachmentApplications = data.applications || [];
        console.log('📎 Found', attachmentApplications.length, 'attachment applications');
        
        displayAttachmentApplications(attachmentApplications);
    } catch (error) {
        console.error('❌ Error loading attachment applications:', error);
        showToast('Failed to load attachment applications: ' + error.message, 'error');
    }
}

// Display graduation applications
function displayGraduationApplications(applications) {
    const container = document.getElementById('graduation-applications-list');
    const empty = document.getElementById('graduation-empty');
    
    // Apply filters
    const statusFilter = document.getElementById('graduation-status-filter').value;
    const departmentFilter = document.getElementById('graduation-department-filter').value;
    
    const filteredApplications = applications.filter(app => {
        const statusMatch = !statusFilter || app.status === statusFilter;
        const departmentMatch = !departmentFilter || app.department === departmentFilter;
        return statusMatch && departmentMatch;
    });
    
    if (!filteredApplications || filteredApplications.length === 0) {
        container.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    container.classList.remove('hidden');

    container.innerHTML = filteredApplications.map(app => 
        '<div class="border border-gray-200 rounded-lg p-4 mb-4">' +
            '<div class="flex justify-between items-start">' +
                '<div class="flex-1">' +
                    '<div class="flex items-center mb-2">' +
                        '<h4 class="text-lg font-semibold text-gray-900">' + app.name + '</h4>' +
                        '<span class="ml-3 px-2 py-1 text-xs font-medium rounded-full ' + getStatusClass(app.status) + '">' + app.status.replace('_', ' ') + '</span>' +
                    '</div>' +
                    '<div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">' +
                        '<div><strong>Admission:</strong> ' + app.admissionNumber + '</div>' +
                        '<div><strong>Course:</strong> ' + formatCourseName(app.course) + '</div>' +
                        '<div><strong>Level:</strong> ' + app.level + '</div>' +
                        '<div><strong>Year:</strong> ' + app.yearOfStudy + '</div>' +
                        '<div><strong>Department:</strong> ' + app.department.replace('_', ' ') + '</div>' +
                        '<div><strong>Applied:</strong> ' + new Date(app.applicationDate).toLocaleDateString() + '</div>' +
                        '<div><strong>Academic Year:</strong> ' + app.academicYear + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="ml-4 flex space-x-2">' +
                    '<button onclick="reviewApplication(\'graduation\', \'' + app._id + '\')" class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">' +
                        '<i class="ri-eye-line mr-1"></i>Review' +
                    '</button>' +
                '</div>' +
            '</div>' +
        '</div>'
    ).join('');
}

// Display attachment applications
function displayAttachmentApplications(applications) {
    const container = document.getElementById('attachment-applications-list');
    const empty = document.getElementById('attachment-empty');
    
    // Apply filters
    const statusFilter = document.getElementById('attachment-status-filter').value;
    const countyFilter = document.getElementById('attachment-county-filter').value;
    
    const filteredApplications = applications.filter(app => {
        const statusMatch = !statusFilter || app.status === statusFilter;
        const countyMatch = !countyFilter || app.county === countyFilter;
        return statusMatch && countyMatch;
    });
    
    if (!filteredApplications || filteredApplications.length === 0) {
        container.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    container.classList.remove('hidden');

    container.innerHTML = filteredApplications.map(app => 
        '<div class="border border-gray-200 rounded-lg p-4 mb-4">' +
            '<div class="flex justify-between items-start">' +
                '<div class="flex-1">' +
                    '<div class="flex items-center mb-2">' +
                        '<h4 class="text-lg font-semibold text-gray-900">' + app.name + '</h4>' +
                        '<span class="ml-3 px-2 py-1 text-xs font-medium rounded-full ' + getStatusClass(app.status) + '">' + app.status.replace('_', ' ') + '</span>' +
                    '</div>' +
                    '<div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">' +
                        '<div><strong>Admission:</strong> ' + app.admissionNumber + '</div>' +
                        '<div><strong>Course:</strong> ' + formatCourseName(app.course) + '</div>' +
                        '<div><strong>Location:</strong> ' + app.county + ', ' + app.nearestTown + '</div>' +
                        '<div><strong>Year:</strong> ' + app.yearOfStudy + '</div>' +
                        '<div><strong>Department:</strong> ' + app.department.replace('_', ' ') + '</div>' +
                        '<div><strong>Applied:</strong> ' + new Date(app.applicationDate).toLocaleDateString() + '</div>' +
                        '<div><strong>Academic Year:</strong> ' + app.academicYear + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="ml-4 flex space-x-2">' +
                    '<button onclick="reviewApplication(\'attachment\', \'' + app._id + '\')" class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">' +
                        '<i class="ri-eye-line mr-1"></i>Review' +
                    '</button>' +
                '</div>' +
            '</div>' +
        '</div>'
    ).join('');
}

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

// Format course name
function formatCourseName(course) {
    if (!course) return 'N/A';
    
    const courseMap = {
        'science_laboratory_technology_5': 'Science Laboratory Technology',
        'information_communication_technology_5': 'Information Communication Technology',
        'electrical_installation_5': 'Electrical Installation',
        'plumbing_5': 'Plumbing',
        'motor_vehicle_mechanics_5': 'Motor Vehicle Mechanics',
        'building_construction_5': 'Building Construction',
        'welding_fabrication_5': 'Welding & Fabrication'
    };
    
    return courseMap[course] || course.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Review application
function reviewApplication(type, applicationId) {
    currentApplicationType = type;
    currentApplicationId = applicationId;
    
    const applications = type === 'graduation' ? graduationApplications : attachmentApplications;
    const app = applications.find(a => a._id === applicationId);
    
    if (!app) return;
    
    document.getElementById('modal-title').textContent = 'Review ' + type.charAt(0).toUpperCase() + type.slice(1) + ' Application';
    
    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = 
        '<div class="space-y-4">' +
            '<div class="grid grid-cols-2 gap-4">' +
                '<div><strong>Name:</strong> ' + app.name + '</div>' +
                '<div><strong>Admission Number:</strong> ' + app.admissionNumber + '</div>' +
                '<div><strong>ID Number:</strong> ' + app.idNumber + '</div>' +
                '<div><strong>Phone:</strong> ' + app.phoneNumber + '</div>' +
                '<div><strong>Course:</strong> ' + formatCourseName(app.course) + '</div>' +
                '<div><strong>Department:</strong> ' + app.department.replace('_', ' ') + '</div>' +
                '<div><strong>Level:</strong> ' + app.level + '</div>' +
                '<div><strong>Year of Study:</strong> ' + app.yearOfStudy + '</div>' +
                '<div><strong>KCSE Grade:</strong> ' + app.kcseGrade + '</div>' +
                '<div><strong>Admission Type:</strong> ' + app.admissionType + '</div>' +
                (type === 'attachment' ? 
                    '<div><strong>County:</strong> ' + app.county + '</div>' +
                    '<div><strong>Nearest Town:</strong> ' + app.nearestTown + '</div>'
                : '') +
                '<div><strong>Application Date:</strong> ' + new Date(app.applicationDate).toLocaleDateString() + '</div>' +
                '<div><strong>Status:</strong> <span class="px-2 py-1 text-xs rounded-full ' + getStatusClass(app.status) + '">' + app.status.replace('_', ' ') + '</span></div>' +
            '</div>' +
            (app.comments ? '<div class="mt-4"><strong>Comments:</strong><br>' + app.comments + '</div>' : '') +
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
        
        const response = await fetch(API_BASE_URL + '/ilo/applications/' + currentApplicationType + '/' + currentApplicationId + '/status', {
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

// Refresh functions
function refreshGraduationApplications() {
    loadGraduationApplications();
}

function refreshAttachmentApplications() {
    loadAttachmentApplications();
}

// Print graduation list
function printGraduationList() {
    const printWindow = window.open('', '_blank');
    
    // Apply same filters as display
    const statusFilter = document.getElementById('graduation-status-filter').value;
    const departmentFilter = document.getElementById('graduation-department-filter').value;
    
    const applications = graduationApplications.filter(app => {
        const statusMatch = !statusFilter || app.status === statusFilter;
        const departmentMatch = !departmentFilter || app.department === departmentFilter;
        return statusMatch && departmentMatch;
    });

    const tableRows = applications.map(app => 
        '<tr>' +
            '<td>' + app.name + '</td>' +
            '<td>' + app.admissionNumber + '</td>' +
            '<td>' + formatCourseName(app.course) + '</td>' +
            '<td>' + app.level + '</td>' +
            '<td>' + app.yearOfStudy + '</td>' +
            '<td>' + app.status + '</td>' +
            '<td>' + new Date(app.applicationDate).toLocaleDateString() + '</td>' +
        '</tr>'
    ).join('');

    printWindow.document.write(
        '<html>' +
            '<head>' +
                '<title>Graduation Applications Report</title>' +
                '<style>table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background-color:#f2f2f2}</style>' +
            '</head>' +
            '<body>' +
                '<h1>Graduation Applications Report</h1>' +
                '<table>' +
                    '<thead>' +
                        '<tr>' +
                            '<th>Name</th>' +
                            '<th>Admission Number</th>' +
                            '<th>Course</th>' +
                            '<th>Level</th>' +
                            '<th>Year</th>' +
                            '<th>Status</th>' +
                            '<th>Application Date</th>' +
                        '</tr>' +
                    '</thead>' +
                    '<tbody>' +
                        tableRows +
                    '</tbody>' +
                '</table>' +
                '<p>Generated on: ' + new Date().toLocaleString() + '</p>' +
            '</body>' +
        '</html>'
    );
    printWindow.document.close();
    printWindow.print();
}

// Print attachment list
function printAttachmentList() {
    const printWindow = window.open('', '_blank');
    
    // Apply same filters as display
    const statusFilter = document.getElementById('attachment-status-filter').value;
    const countyFilter = document.getElementById('attachment-county-filter').value;
    
    const applications = attachmentApplications.filter(app => {
        const statusMatch = !statusFilter || app.status === statusFilter;
        const countyMatch = !countyFilter || app.county === countyFilter;
        return statusMatch && countyMatch;
    });

    const tableRows = applications.map(app => 
        '<tr>' +
            '<td>' + app.name + '</td>' +
            '<td>' + app.admissionNumber + '</td>' +
            '<td>' + formatCourseName(app.course) + '</td>' +
            '<td>' + app.county + ', ' + app.nearestTown + '</td>' +
            '<td>' + app.status + '</td>' +
            '<td>' + new Date(app.applicationDate).toLocaleDateString() + '</td>' +
        '</tr>'
    ).join('');

    printWindow.document.write(
        '<html>' +
            '<head>' +
                '<title>Attachment Applications Report</title>' +
                '<style>table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background-color:#f2f2f2}</style>' +
            '</head>' +
            '<body>' +
                '<h1>Attachment Applications Report</h1>' +
                '<table>' +
                    '<thead>' +
                        '<tr>' +
                            '<th>Name</th>' +
                            '<th>Admission Number</th>' +
                            '<th>Course</th>' +
                            '<th>Location</th>' +
                            '<th>Status</th>' +
                            '<th>Application Date</th>' +
                        '</tr>' +
                    '</thead>' +
                    '<tbody>' +
                        tableRows +
                    '</tbody>' +
                '</table>' +
                '<p>Generated on: ' + new Date().toLocaleString() + '</p>' +
            '</body>' +
        '</html>'
    );
    printWindow.document.close();
    printWindow.print();
}

// Logout function
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        window.location.href = '/student/login';
    }
}

// Make functions globally available
window.reviewApplication = reviewApplication;
window.closeReviewModal = closeReviewModal;
window.updateApplicationStatus = updateApplicationStatus;
window.printGraduationList = printGraduationList;
window.printAttachmentList = printAttachmentList;
window.logout = logout;
