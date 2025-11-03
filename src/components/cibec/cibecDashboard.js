// CIBEC Dashboard JavaScript
const API_BASE = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : `${window.location.protocol}//${window.location.host}/api`;
const CIBEC_USER_ID = 'cibec_admin'; // This should come from login

// State management
let currentFilters = {};
let allUploads = [];
let currentPage = 1;
const itemsPerPage = 20;

// Course mappings
const courseNames = {
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
    'information_science_6': 'Information Science Level 6'
};

const departmentNames = {
    'applied_science': 'Applied Science',
    'agriculture': 'Agriculture',
    'building_civil': 'Building & Civil',
    'electromechanical': 'Electromechanical',
    'hospitality': 'Hospitality',
    'business_liberal': 'Business & Liberal',
    'computing_informatics': 'Computing & Informatics'
};

// Initialize dashboard
async function initializeDashboard() {
    console.log('🚀 Initializing CIBEC Dashboard...');
    
    // Load statistics
    await loadStatistics();
    
    // Load all uploads
    await loadUploads();
    
    // Setup event listeners
    setupEventListeners();
    
    console.log('✅ Dashboard initialized');
}

// Load statistics
async function loadStatistics() {
    try {
        const response = await fetch(`${API_BASE}/cibec/statistics`);
        if (!response.ok) throw new Error('Failed to load statistics');
        
        const data = await response.json();
        
        // Update stat cards
        document.getElementById('stat-total').textContent = data.statistics.totalUploads || 0;
        
        const byType = data.statistics.byType || [];
        const assessments = byType.find(t => t._id === 'assessment')?.count || 0;
        const practicals = byType.find(t => t._id === 'practical')?.count || 0;
        const profiles = byType.filter(t => ['profile_photo', 'kcse_results', 'kcpe_results'].includes(t._id))
            .reduce((sum, t) => sum + t.count, 0);
        
        document.getElementById('stat-assessments').textContent = assessments;
        document.getElementById('stat-practicals').textContent = practicals;
        document.getElementById('stat-profiles').textContent = profiles;
        
    } catch (error) {
        console.error('Error loading statistics:', error);
        showToast('Failed to load statistics', 'error');
    }
}

// Load uploads with filters
async function loadUploads(filters = {}) {
    try {
        showLoading();
        
        // Build query string
        const queryParams = new URLSearchParams();
        if (filters.department) queryParams.append('department', filters.department);
        if (filters.uploadType) queryParams.append('uploadType', filters.uploadType);
        if (filters.year) queryParams.append('year', filters.year);
        if (filters.courseLevel) queryParams.append('courseLevel', filters.courseLevel);
        if (filters.studentId) queryParams.append('studentId', filters.studentId);
        if (filters.admissionNumber) queryParams.append('admissionNumber', filters.admissionNumber);
        queryParams.append('cibecUserId', CIBEC_USER_ID);
        
        const response = await fetch(`${API_BASE}/cibec/uploads?${queryParams}`);
        if (!response.ok) throw new Error('Failed to load uploads');
        
        const data = await response.json();
        allUploads = data.uploads || [];
        
        // Update UI
        displayUploads();
        updateResultsCount();
        hideLoading();
        
    } catch (error) {
        console.error('Error loading uploads:', error);
        showToast('Failed to load uploads', 'error');
        hideLoading();
    }
}

// Display uploads
function displayUploads() {
    const container = document.getElementById('uploads-list');
    const emptyState = document.getElementById('empty-state');
    
    if (allUploads.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        document.getElementById('pagination').classList.add('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    
    // Calculate pagination
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, allUploads.length);
    const pageUploads = allUploads.slice(startIndex, endIndex);
    
    // Render uploads
    container.innerHTML = pageUploads.map(upload => createUploadCard(upload)).join('');
    
    // Update pagination
    updatePagination();
}

// Create upload card HTML
function createUploadCard(upload) {
    const uploadTypeLabels = {
        'profile_photo': 'Profile Photo',
        'kcse_results': 'KCSE Results',
        'kcpe_results': 'KCPE Results',
        'assessment': `Assessment ${upload.assessmentNumber || ''}`,
        'practical': 'Practical Work'
    };
    
    const uploadTypeIcons = {
        'profile_photo': 'ri-user-line',
        'kcse_results': 'ri-file-text-line',
        'kcpe_results': 'ri-file-text-line',
        'assessment': 'ri-file-list-line',
        'practical': 'ri-video-line'
    };
    
    const uploadTypeColors = {
        'profile_photo': 'bg-purple-100 text-purple-700',
        'kcse_results': 'bg-blue-100 text-blue-700',
        'kcpe_results': 'bg-blue-100 text-blue-700',
        'assessment': 'bg-green-100 text-green-700',
        'practical': 'bg-orange-100 text-orange-700'
    };
    
    const courseName = courseNames[upload.course] || upload.course;
    const departmentName = departmentNames[upload.department] || upload.department;
    
    // Extract level from course name
    const levelMatch = courseName.match(/Level (\d+)/);
    const levelBadge = levelMatch ? `<span class="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full font-medium">Level ${levelMatch[1]}</span>` : '';
    
    return `
        <div class="upload-card border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all">
            <div class="flex items-start justify-between">
                <div class="flex items-start space-x-4 flex-1">
                    <div class="p-3 ${uploadTypeColors[upload.uploadType]} rounded-lg">
                        <i class="${uploadTypeIcons[upload.uploadType]} text-2xl"></i>
                    </div>
                    <div class="flex-1">
                        <div class="flex items-center space-x-2 mb-1">
                            <h3 class="font-semibold text-gray-900">${upload.studentName}</h3>
                            <span class="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full">${upload.admissionNumber}</span>
                            ${levelBadge}
                        </div>
                        <p class="text-sm text-gray-600 mb-2">${courseName}</p>
                        <div class="flex items-center flex-wrap gap-2 text-xs">
                            <span class="px-2 py-1 ${uploadTypeColors[upload.uploadType]} rounded-full font-medium">
                                ${uploadTypeLabels[upload.uploadType]}
                            </span>
                            <span class="text-gray-500">${departmentName}</span>
                            <span class="text-gray-500">•</span>
                            <span class="text-gray-500">Year ${upload.year}</span>
                            ${upload.unitName ? `
                                <span class="text-gray-500">•</span>
                                <span class="text-gray-500">${upload.unitName}</span>
                            ` : ''}
                        </div>
                        <div class="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                            <span><i class="ri-file-line mr-1"></i>${upload.originalFileName}</span>
                            <span><i class="ri-calendar-line mr-1"></i>${new Date(upload.uploadedAt).toLocaleDateString()}</span>
                            <span><i class="ri-folder-line mr-1"></i>${(upload.fileSize / 1024).toFixed(1)} KB</span>
                            ${upload.version > 1 ? `<span class="text-orange-600"><i class="ri-refresh-line mr-1"></i>v${upload.version}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="flex items-center space-x-2">
                    <button onclick="viewFile('${upload._id}')" class="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors" title="View File">
                        <i class="ri-eye-line text-lg"></i>
                    </button>
                    <button onclick="downloadFile('${upload._id}')" class="p-2 hover:bg-green-50 text-green-600 rounded-lg transition-colors" title="Download">
                        <i class="ri-download-line text-lg"></i>
                    </button>
                    <button onclick="viewStudentDetails('${upload.studentId}')" class="p-2 hover:bg-purple-50 text-purple-600 rounded-lg transition-colors" title="Student Details">
                        <i class="ri-user-search-line text-lg"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Update results count
function updateResultsCount() {
    const count = allUploads.length;
    const countEl = document.getElementById('results-count');
    countEl.textContent = `${count} result${count !== 1 ? 's' : ''}`;
}

// Update pagination
function updatePagination() {
    const totalPages = Math.ceil(allUploads.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, allUploads.length);
    
    document.getElementById('page-start').textContent = startIndex + 1;
    document.getElementById('page-end').textContent = endIndex;
    document.getElementById('page-total').textContent = allUploads.length;
    
    document.getElementById('prev-page').disabled = currentPage === 1;
    document.getElementById('next-page').disabled = currentPage >= totalPages;
    
    if (totalPages > 1) {
        document.getElementById('pagination').classList.remove('hidden');
    } else {
        document.getElementById('pagination').classList.add('hidden');
    }
}

// View file
async function viewFile(uploadId) {
    try {
        const response = await fetch(`${API_BASE}/student-uploads/${uploadId}/download?userId=${CIBEC_USER_ID}&userType=cibec`);
        if (!response.ok) throw new Error('Failed to get download URL');
        
        const data = await response.json();
        window.open(data.url, '_blank');
        
        showToast('Opening file...', 'success');
    } catch (error) {
        console.error('Error viewing file:', error);
        showToast('Failed to open file', 'error');
    }
}

// Download file
async function downloadFile(uploadId) {
    try {
        const response = await fetch(`${API_BASE}/student-uploads/${uploadId}/download?userId=${CIBEC_USER_ID}&userType=cibec`);
        if (!response.ok) throw new Error('Failed to get download URL');
        
        const data = await response.json();
        
        // Create download link
        const a = document.createElement('a');
        a.href = data.url;
        a.download = data.fileName;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        showToast('Download started', 'success');
    } catch (error) {
        console.error('Error downloading file:', error);
        showToast('Failed to download file', 'error');
    }
}

// View student details
async function viewStudentDetails(studentId) {
    try {
        showLoading();
        
        const response = await fetch(`${API_BASE}/cibec/student/${studentId}/uploads?cibecUserId=${CIBEC_USER_ID}`);
        if (!response.ok) throw new Error('Failed to load student details');
        
        const data = await response.json();
        
        // Update modal
        document.getElementById('modal-student-name').textContent = data.student.name;
        document.getElementById('modal-student-id').textContent = data.student.studentId;
        document.getElementById('modal-student-course').textContent = courseNames[data.student.course] || data.student.course;
        document.getElementById('modal-student-department').textContent = departmentNames[data.student.department] || data.student.department;
        document.getElementById('modal-student-year').textContent = `Year ${data.student.year}`;
        
        // Display uploads
        const modalContent = document.getElementById('modal-content');
        if (data.uploads.length === 0) {
            modalContent.innerHTML = `
                <div class="text-center py-8">
                    <i class="ri-inbox-line text-4xl text-gray-300 mb-2"></i>
                    <p class="text-gray-600">No uploads found for this student</p>
                </div>
            `;
        } else {
            modalContent.innerHTML = `
                <div class="space-y-2">
                    ${data.uploads.map(upload => createModalUploadItem(upload)).join('')}
                </div>
            `;
        }
        
        // Show modal
        document.getElementById('student-modal').classList.remove('hidden');
        hideLoading();
        
    } catch (error) {
        console.error('Error viewing student details:', error);
        showToast('Failed to load student details', 'error');
        hideLoading();
    }
}

// Create modal upload item
function createModalUploadItem(upload) {
    const uploadTypeLabels = {
        'profile_photo': 'Profile Photo',
        'kcse_results': 'KCSE Results',
        'kcpe_results': 'KCPE Results',
        'assessment': `Assessment ${upload.assessmentNumber || ''}`,
        'practical': 'Practical Work'
    };
    
    return `
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
            <div class="flex-1">
                <div class="flex items-center space-x-2 mb-1">
                    <span class="font-medium text-gray-900">${uploadTypeLabels[upload.uploadType]}</span>
                    ${upload.unitName ? `<span class="text-sm text-gray-500">• ${upload.unitName}</span>` : ''}
                </div>
                <p class="text-sm text-gray-600">${upload.originalFileName}</p>
                <p class="text-xs text-gray-500 mt-1">Uploaded: ${new Date(upload.uploadedAt).toLocaleString()}</p>
            </div>
            <div class="flex items-center space-x-2">
                <button onclick="viewFile('${upload._id}')" class="p-2 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors">
                    <i class="ri-eye-line"></i>
                </button>
                <button onclick="downloadFile('${upload._id}')" class="p-2 hover:bg-green-100 text-green-600 rounded-lg transition-colors">
                    <i class="ri-download-line"></i>
                </button>
            </div>
        </div>
    `;
}

// Close student modal
function closeStudentModal() {
    document.getElementById('student-modal').classList.add('hidden');
}

// Setup event listeners
function setupEventListeners() {
    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', () => {
        loadStatistics();
        loadUploads(currentFilters);
    });
    
    // Apply filters
    document.getElementById('apply-filters-btn').addEventListener('click', applyFilters);
    
    // Clear filters
    document.getElementById('clear-filters-btn').addEventListener('click', clearFilters);
    
    // Search on enter
    document.getElementById('search-student').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            applyFilters();
        }
    });
    
    // Pagination
    document.getElementById('prev-page').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            displayUploads();
        }
    });
    
    document.getElementById('next-page').addEventListener('click', () => {
        const totalPages = Math.ceil(allUploads.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            displayUploads();
        }
    });
    
    // Export button
    document.getElementById('export-btn').addEventListener('click', exportToExcel);
}

// Apply filters
function applyFilters() {
    const filters = {
        department: document.getElementById('filter-department').value,
        courseLevel: document.getElementById('filter-course-level').value,
        uploadType: document.getElementById('filter-upload-type').value,
        year: document.getElementById('filter-year').value,
        studentId: document.getElementById('search-student').value.trim()
    };
    
    // Remove empty filters
    Object.keys(filters).forEach(key => {
        if (!filters[key]) delete filters[key];
    });
    
    currentFilters = filters;
    currentPage = 1;
    
    // Update active filters display
    updateActiveFilters();
    
    // Load uploads with filters
    loadUploads(filters);
}

// Clear filters
function clearFilters() {
    document.getElementById('filter-department').value = '';
    document.getElementById('filter-course-level').value = '';
    document.getElementById('filter-upload-type').value = '';
    document.getElementById('filter-year').value = '';
    document.getElementById('search-student').value = '';
    
    currentFilters = {};
    currentPage = 1;
    
    updateActiveFilters();
    loadUploads();
}

// Update active filters display
function updateActiveFilters() {
    const container = document.getElementById('active-filters');
    const chipsContainer = document.getElementById('filter-chips');
    
    if (Object.keys(currentFilters).length === 0) {
        container.classList.add('hidden');
        return;
    }
    
    container.classList.remove('hidden');
    
    const filterLabels = {
        department: 'Department',
        courseLevel: 'Course Level',
        uploadType: 'Upload Type',
        year: 'Year',
        studentId: 'Student'
    };
    
    chipsContainer.innerHTML = Object.entries(currentFilters).map(([key, value]) => `
        <span class="filter-chip px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full flex items-center space-x-2">
            <span>${filterLabels[key]}: ${value}</span>
            <button onclick="removeFilter('${key}')" class="hover:bg-blue-200 rounded-full p-0.5">
                <i class="ri-close-line text-sm"></i>
            </button>
        </span>
    `).join('');
}

// Remove filter
function removeFilter(key) {
    delete currentFilters[key];
    
    // Clear corresponding input
    const inputMap = {
        department: 'filter-department',
        courseLevel: 'filter-course-level',
        uploadType: 'filter-upload-type',
        year: 'filter-year',
        studentId: 'search-student'
    };
    
    if (inputMap[key]) {
        document.getElementById(inputMap[key]).value = '';
    }
    
    updateActiveFilters();
    loadUploads(currentFilters);
}

// Export to Excel
function exportToExcel() {
    if (allUploads.length === 0) {
        showToast('No data to export', 'warning');
        return;
    }
    
    // Create CSV content
    const headers = ['Student Name', 'Admission No', 'Course', 'Department', 'Year', 'Upload Type', 'Unit', 'File Name', 'Upload Date', 'File Size'];
    const rows = allUploads.map(upload => [
        upload.studentName,
        upload.admissionNumber,
        courseNames[upload.course] || upload.course,
        departmentNames[upload.department] || upload.department,
        upload.year,
        upload.uploadType,
        upload.unitName || '-',
        upload.originalFileName,
        new Date(upload.uploadedAt).toLocaleDateString(),
        `${(upload.fileSize / 1024).toFixed(1)} KB`
    ]);
    
    const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');
    
    // Download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cibec-uploads-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Export successful', 'success');
}

// Show loading
function showLoading() {
    document.getElementById('loading-state').classList.remove('hidden');
    document.getElementById('uploads-list').classList.add('hidden');
    document.getElementById('empty-state').classList.add('hidden');
}

// Hide loading
function hideLoading() {
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('uploads-list').classList.remove('hidden');
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    const toastIcon = document.getElementById('toast-icon');
    
    toastMessage.textContent = message;
    
    const icons = {
        success: 'ri-check-line',
        error: 'ri-error-warning-line',
        warning: 'ri-alert-line',
        info: 'ri-information-line'
    };
    
    toastIcon.className = icons[type] || icons.info;
    
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', initializeDashboard);


