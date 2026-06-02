// tabs/assignments.js — HOD unit assignments table + bulk actions.
window.HODTabs = window.HODTabs || {};

// (verbatim from hodDashboard.js)
// Populate assignments display
function populateAssignmentsDisplay() {
    const tableBody = document.getElementById('assignmentsTableBody');
    if (!tableBody) return; // SPA: assignments partial not injected yet
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
                    <input type="checkbox" class="assignment-checkbox rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500" value="${escapeAttr(unit._id)}">
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div>
                        <div class="text-sm font-medium text-gray-900 dark:text-gray-100">${escapeHtml(unit.unitCode)}</div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">${escapeHtml(unit.unitName)}</div>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    ${escapeHtml(formatCourseName(unit.courseCode))}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        Unassigned
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">-</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">—</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                        onclick="assignUnitToTrainer('${escapeAttr(unit._id)}')"
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
                <input type="checkbox" class="assignment-checkbox rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500" value="${escapeAttr(assignment.unitId ? assignment.unitId._id : '')}">
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div>
                    <div class="text-sm font-medium text-gray-900 dark:text-gray-100">${escapeHtml(assignment.unitId ? assignment.unitId.unitCode : 'Unknown Unit')}</div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">${escapeHtml(assignment.unitId ? assignment.unitId.unitName : 'No unit name')}</div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                ${escapeHtml(assignment.unitId ? formatCourseName(assignment.unitId.courseCode) : 'Unknown Course')}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900 dark:text-gray-100">${escapeHtml(assignment.trainerId ? assignment.trainerId.name : 'Unknown Trainer')}</div>
                <div class="text-sm text-gray-500 dark:text-gray-400">${escapeHtml(assignment.trainerId ? assignment.trainerId.email : 'No email')}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                ${assignment.assignedAt ? new Date(assignment.assignedAt).toLocaleDateString() : 'N/A'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                ${assignment.hours != null ? assignment.hours : '—'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button
                    onclick="unassignUnit('${escapeAttr(assignment.unitId ? assignment.unitId._id : '')}')"
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
    if (!filterSelect || !selectAllCheckbox) return; // SPA: assignments partial not injected yet
    
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

// Export the current assignments view as a branded PDF — same letterhead/layout
// as the other portal reports (EDTTIDocs), with the Department + HOD highlighted
// in the summary band. Respects the active filter (All / Assigned / Unassigned).
async function exportAssignmentsPDF() {
    if (!window.EDTTIDocs || !window.jspdf) {
        if (typeof showToast === 'function') showToast('PDF library not loaded yet — please retry in a moment', 'error');
        else alert('PDF library not loaded yet — please retry in a moment');
        return;
    }

    const filterEl = document.getElementById('assignmentFilter');
    const filter = filterEl ? filterEl.value : '';

    // A "Unit" cell that mirrors the table: name as the primary label, code in
    // parentheses when it adds information.
    const unitLabel = (code, name) => {
        const n = (name || '').trim();
        const c = (code || '').trim();
        if (n && c && c.toUpperCase() !== n.toUpperCase()) return `${n} (${c})`;
        return n || c || 'Unknown Unit';
    };

    let rows;
    if (filter === 'unassigned') {
        const assignedUnitIds = (assignmentsData || []).map(a => a.unitId && a.unitId._id);
        rows = (unitsData || [])
            .filter(unit => !assignedUnitIds.includes(unit._id))
            .map(unit => [
                unitLabel(unit.unitCode, unit.unitName),
                formatCourseName(unit.courseCode) || '',
                'Unassigned',
                '—',
                '—',
            ]);
    } else {
        rows = (assignmentsData || []).map(a => [
            unitLabel(a.unitId && a.unitId.unitCode, a.unitId && a.unitId.unitName),
            a.unitId ? (formatCourseName(a.unitId.courseCode) || '') : 'Unknown Course',
            a.trainerId ? (a.trainerId.name || 'Unknown Trainer') : 'Unassigned',
            a.assignedAt ? new Date(a.assignedAt).toLocaleDateString() : '—',
            a.hours != null ? String(a.hours) : '—',
        ]);
    }

    const deptName = (typeof formatDepartmentName === 'function' && currentHOD)
        ? formatDepartmentName(currentHOD.department)
        : (currentHOD ? currentHOD.department : '');
    const hodName = currentHOD ? currentHOD.name : '';
    const scope = filter === 'unassigned' ? 'Unassigned Units'
        : (filter === 'assigned' ? 'Assigned Units' : 'All Assignments');

    try {
        await window.EDTTIDocs.tablePDF({
            title: 'Unit Assignments Report',
            subtitle: 'Head of Department · Unit Assignments',
            summary: [
                ['Department', deptName || 'N/A'],
                ['Head of Department', hodName || 'N/A'],
                ['Scope', scope],
                ['Total Records', String(rows.length)],
                ['Generated', new Date().toLocaleString()],
            ],
            columns: ['Unit', 'Course', 'Trainer', 'Assigned Date', 'Hrs/week'],
            rows,
            filename: `unit_assignments_${(deptName || 'department').replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().slice(0, 10)}.pdf`,
            footer: 'EDTTI UMS — HOD · Unit Assignments',
        });
    } catch (err) {
        console.error('Export assignments PDF failed:', err);
        if (typeof showToast === 'function') showToast('Failed to export PDF: ' + err.message, 'error');
    }
}

window.exportAssignmentsPDF = exportAssignmentsPDF;

window.HODTabs.assignments = {
    init() {
        populateAssignmentsDisplay();
    }
};
