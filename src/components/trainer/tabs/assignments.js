// tabs/assignments.js — trainer assignments list.
// NOTE: the /api/trainers/:id/assignments endpoint is a known pre-existing 500;
// this tab preserves that broken behaviour (error state shown). Not a regression.
window.TrainerTabs = window.TrainerTabs || {};

// Pagination state for the assignments list view.
let assignmentsPage = 1;
const ASSIGNMENTS_PAGE_SIZE = 10;

// (verbatim from trainerDashboard.js)
// Load trainer assignments
async function loadAssignments() {
    try {
        console.log('Loading assignments...');
        
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
        assignmentsPage = 1;

        console.log(`Successfully loaded ${assignmentsData.length} assignments`);
        
        // Update stats
        updateStats();
        
        // Display assignments if on assignments section
        if (currentSection === 'assignments') {
            displayAssignments();
        }
        
    } catch (error) {
        console.error('Error loading assignments:', error);
        if (currentSection === 'assignments') {
            showErrorState(error.message);
        }
        showToast(`Failed to load assignments: ${error.message}`, 'error');
    }
}

// Display assignments — paginated list view.
function displayAssignments() {
    const filter = document.getElementById('assignmentFilter')?.value || '';
    let filteredAssignments = [...assignmentsData];

    // Apply filter
    if (filter === 'current') {
        filteredAssignments = assignmentsData.filter(a => a.semester === 'current');
    } else if (filter === 'upcoming') {
        filteredAssignments = assignmentsData.filter(a => a.semester === 'upcoming');
    }

    // Validate assignments have complete data
    const validAssignments = filteredAssignments.filter(assignment => {
        return assignment &&
               assignment.unitId &&
               assignment.unitId.unitCode &&
               assignment.unitId.unitName &&
               assignment.status;
    });

    if (validAssignments.length === 0) {
        showEmptyState();
        return;
    }

    // Clamp the current page to the available range.
    const totalPages = Math.max(1, Math.ceil(validAssignments.length / ASSIGNMENTS_PAGE_SIZE));
    if (assignmentsPage > totalPages) assignmentsPage = totalPages;
    if (assignmentsPage < 1) assignmentsPage = 1;
    const start = (assignmentsPage - 1) * ASSIGNMENTS_PAGE_SIZE;
    const pageItems = validAssignments.slice(start, start + ASSIGNMENTS_PAGE_SIZE);

    const headCell = 'text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';
    const assignmentsGrid = document.getElementById('assignmentsGrid');
    assignmentsGrid.innerHTML = `
        <table class="min-w-full text-sm">
            <thead class="border-b border-gray-200 dark:border-gray-700">
                <tr>
                    <th class="${headCell}">Unit Code</th>
                    <th class="${headCell}">Unit Name</th>
                    <th class="${headCell}">Course</th>
                    <th class="${headCell}">Module</th>
                    <th class="${headCell}">Status</th>
                    <th class="${headCell}"></th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-700/60">
                ${pageItems.map(createAssignmentRow).join('')}
            </tbody>
        </table>`;

    renderListPagination('assignmentsPagination', validAssignments.length, assignmentsPage, totalPages, start, pageItems.length, 'assignmentsGoToPage');
    showAssignmentsGrid();
}

// One assignment as a table row.
function createAssignmentRow(assignment) {
    const unitCode = assignment.unitId?.unitCode || 'N/A';
    const unitName = assignment.unitId?.unitName || 'Unknown Unit';
    const courseCode = assignment.unitId?.courseCode || assignment.courseCode || 'N/A';
    const status = assignment.status || 'active';
    // "Module" is the unit's own module. What the DB calls "semester" = module.
    const moduleNo = assignment.unitId?.module ?? assignment.module ?? assignment.semester ?? 'N/A';
    const type = assignment.type || 'department';
    const isCommonUnit = type === 'common';

    const statusColors = {
        'active': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        'completed': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        'cancelled': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    };
    const cell = 'px-3 py-2 align-middle text-gray-900 dark:text-gray-100';

    return `
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
            <td class="${cell} font-medium">
                ${escapeHtml(unitCode)}
                ${isCommonUnit ? '<span class="ml-1 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">Common</span>' : ''}
            </td>
            <td class="${cell} text-gray-600 dark:text-gray-400">${escapeHtml(unitName)}</td>
            <td class="${cell}">${escapeHtml(formatCourseName(courseCode))}</td>
            <td class="${cell}">${escapeHtml(String(moduleNo))}</td>
            <td class="${cell}">
                <span class="px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[status] || statusColors.active}">
                    ${escapeHtml(status.charAt(0).toUpperCase() + status.slice(1))}
                </span>
            </td>
            <td class="${cell} text-right">
                <button onclick="viewUnitDetails('${escapeAttr(assignment._id)}')" class="text-primary hover:text-secondary text-sm font-medium transition-colors whitespace-nowrap">
                    <i class="ri-eye-line mr-1"></i>View
                </button>
            </td>
        </tr>
    `;
}

// Shared list pagination bar (Prev / range / Next). Used by assignments + students.
function renderListPagination(containerId, total, page, totalPages, start, pageCount, goToFnName) {
    const el = document.getElementById(containerId);
    if (!el) return;
    // Only show pagination when there's more than one page.
    if (total <= 0 || totalPages <= 1) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    const from = start + 1;
    const to = start + pageCount;
    const prevDisabled = page <= 1;
    const nextDisabled = page >= totalPages;
    const btn = (label, disabled, target) =>
        `<button ${disabled ? 'disabled' : ''} onclick="${goToFnName}(${target})" class="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-700'} text-gray-700 dark:text-gray-200">${label}</button>`;
    el.innerHTML = `
        <span class="text-gray-600 dark:text-gray-400">Showing ${from}–${to} of ${total}</span>
        <div class="flex items-center gap-2">
            ${btn('<i class="ri-arrow-left-s-line"></i> Prev', prevDisabled, page - 1)}
            <span class="text-gray-600 dark:text-gray-400">Page ${page} of ${totalPages}</span>
            ${btn('Next <i class="ri-arrow-right-s-line"></i>', nextDisabled, page + 1)}
        </div>`;
    el.classList.remove('hidden');
}

function assignmentsGoToPage(p) {
    assignmentsPage = p;
    displayAssignments();
}
window.assignmentsGoToPage = assignmentsGoToPage;

// Show loading state
function showLoadingState() {
    document.getElementById('loadingState')?.classList.remove('hidden');
    document.getElementById('assignmentsGrid')?.classList.add('hidden');
    document.getElementById('assignmentsPagination')?.classList.add('hidden');
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
    document.getElementById('assignmentsPagination')?.classList.add('hidden');
    document.getElementById('emptyState')?.classList.remove('hidden');
    document.getElementById('errorState')?.classList.add('hidden');
}

// Show error state
function showErrorState(message) {
    document.getElementById('loadingState')?.classList.add('hidden');
    document.getElementById('assignmentsGrid')?.classList.add('hidden');
    document.getElementById('assignmentsPagination')?.classList.add('hidden');
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
            if (f) f.addEventListener('change', () => { assignmentsPage = 1; displayAssignments(); });
        }
        loadAssignments();
    }
};
