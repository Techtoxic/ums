// tabs/common-units.js — HOD common-unit assignments (+ assign-common-units modal).
window.HODTabs = window.HODTabs || {};

// (verbatim from hodDashboard.js)
// Load common units data
async function loadCommonUnits() {
    try {
        console.log('Loading common units...');
        const response = await authFetch('/api/common-units');
        
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
        const response = await authFetch(`/api/common-unit-assignments?department=${currentHOD.department}`);
        
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
        const response = await authFetch('/api/trainers/all-departments');
        
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
        const assignedDate = assignment.createdAt ? new Date(assignment.createdAt).toLocaleDateString() : 'N/A';
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
                        ${escapeHtml(formatDepartmentName(assignment.trainerDepartment))}
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
                        onclick="removeCommonUnitAssignment('${escapeAttr(assignment._id)}')"
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
             onclick="selectTrainerForCommonUnit('${escapeAttr(trainer._id)}', '${escapeAttr(trainer.name)}', '${escapeAttr(trainer.department)}')">
            <div class="flex items-center justify-between">
                <div class="flex-1">
                    <h4 class="font-medium text-gray-800 dark:text-gray-200 text-sm">${escapeHtml(trainer.name)}</h4>
                    <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">${escapeHtml(trainer.email)}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-500 mt-1">${escapeHtml(formatDepartmentName(trainer.department))}</p>
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
        // Try to reload HOD data from the cookie-backed /api/me endpoint
        try {
            const refreshed = await window.AUTH.me({ force: true });
            if (refreshed) {
                currentHOD = refreshed;
                console.log('🔄 Reloaded HOD data from /api/me:', currentHOD);
            }
        } catch (e) {
            console.error('❌ Error refreshing HOD data from /api/me:', e);
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
        
        const response = await authFetch('/api/common-unit-assignments', {
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
        const response = await authFetch(`/api/common-unit-assignments/${assignmentId}`, {
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

window.HODTabs['common-units'] = {
    init() { loadCommonUnitsData(); }
};
