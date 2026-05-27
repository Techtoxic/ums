// tabs/trainers.js — HOD trainers listing + trainer select (assign-units modal).
window.HODTabs = window.HODTabs || {};

// (verbatim from hodDashboard.js)
// Populate trainers display
function populateTrainersDisplay() {
    const trainersGrid = document.getElementById('trainersGrid');
    if (!trainersGrid) return; // SPA: trainers partial not injected yet
    
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
                        ${escapeHtml(trainer.name.charAt(0))}
                    </div>
                    <div class="ml-4">
                        <h3 class="font-semibold text-gray-800 dark:text-gray-200">${escapeHtml(trainer.name)}</h3>
                        <p class="text-sm text-gray-600 dark:text-gray-400">${escapeHtml(trainer.email)}</p>
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
                                <div class="text-xs bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded px-2 py-1">
                                    ${escapeHtml(assignment.unitId ? assignment.unitId.unitCode : 'Unknown')} - ${escapeHtml(assignment.unitId ? assignment.unitId.unitName : 'Unknown Unit')}
                                </div>
                            `).join('')}
                            ${trainerAssignments.length > 3 ? `
                                <div class="text-xs text-gray-500 dark:text-gray-400">
                                    +${trainerAssignments.length - 3} more units
                                </div>
                            ` : ''}
                        </div>
                    ` : `
                        <p class="text-sm text-gray-500 dark:text-gray-400 italic">No units assigned</p>
                    `}
                </div>
                
                <div class="mt-4 pt-4 border-t border-gray-100">
                    <button 
                        onclick="assignUnitsToSpecificTrainer('${escapeAttr(trainer._id)}')" 
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
            <option value="${escapeAttr(trainer._id)}">${escapeHtml(trainer.name)}</option>
        `).join('');
    
    trainerSelect.addEventListener('change', updateAssignButtonState);
}

window.HODTabs.trainers = {
    init() {
        populateTrainersDisplay();
        populateTrainerSelect();
    }
};
