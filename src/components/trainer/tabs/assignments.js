// tabs/assignments.js — trainer assignments list.
// NOTE: the /api/trainers/:id/assignments endpoint is a known pre-existing 500;
// this tab preserves that broken behaviour (error state shown). Not a regression.
window.TrainerTabs = window.TrainerTabs || {};

// (verbatim from trainerDashboard.js)
// Load trainer assignments
async function loadAssignments() {
    try {
        console.log('🔄 Loading assignments...');
        
        if (currentSection === 'assignments') {
            showLoadingState();
        }
        
        const response = await authFetch(`${API_BASE_URL}/trainers/${currentTrainer._id}/assignments`);
        
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
    const assignedAt = assignment.createdAt ? new Date(assignment.createdAt).toLocaleDateString() : 'N/A';
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
                <button onclick="viewUnitDetails('${escapeAttr(assignment._id)}')" class="text-primary hover:text-secondary text-sm font-medium transition-colors">
                    <i class="ri-eye-line mr-1"></i>View Details
                </button>
                </div>
            </div>
        `;
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

// Utility functions
function viewUnitDetails(assignmentId) {
    const assignment = assignmentsData.find(a => a._id === assignmentId);
    if (assignment) {
        showToast(`Unit Details: ${assignment.unitId?.unitName || 'Unknown Unit'}`, 'info');
    }
}

window.TrainerTabs.assignments = {
    init() {
        currentSection = 'assignments';
        // Wire the filter once (cached partial persists across revisits).
        if (!window.__trAssignmentsWired) {
            window.__trAssignmentsWired = true;
            const f = document.getElementById('assignmentFilter');
            if (f) f.addEventListener('change', displayAssignments);
        }
        loadAssignments();
    }
};
