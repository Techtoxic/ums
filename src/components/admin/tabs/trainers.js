// tabs/trainers.js — admin trainers management (incl. add-trainer modal).
window.AdminTabs = window.AdminTabs || {};

// (verbatim from adminDashboard.js)
let _adminTrainersWired = false;

function wireAdminTrainerFilters() {
    if (_adminTrainersWired) return;
    const search = document.getElementById('trainer-search');
    const dept = document.getElementById('trainer-dept-filter');
    if (search) search.addEventListener('input', renderAdminTrainers);
    if (dept) dept.addEventListener('change', renderAdminTrainers);
    _adminTrainersWired = true;
}

function renderAdminTrainers() {
    const container = document.getElementById('trainers-list');
    if (!container) return;

    const search = (document.getElementById('trainer-search')?.value || '').trim().toLowerCase();
    const deptFilter = document.getElementById('trainer-dept-filter')?.value || '';

    const list = (allTrainers || []).filter(t => {
        if (deptFilter && t.department !== deptFilter) return false;
        if (search) {
            const hay = `${t.name || ''} ${t.email || ''}`.toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    });

    if (list.length === 0) {
        container.innerHTML = '<p class="col-span-full text-center text-gray-400 text-xs py-6">No trainers match the current filters</p>';
        return;
    }

    container.innerHTML = list.map(trainer => {
        const isActive = trainer.isActive !== false; // endpoint may omit the flag
        return `
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-lg transition bg-white dark:bg-gray-800">
                <div class="flex items-center space-x-3 mb-3">
                    <div class="w-12 h-12 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center">
                        <i class="ri-user-line text-2xl text-green-600 dark:text-green-400"></i>
                    </div>
                    <div class="min-w-0">
                        <h4 class="font-semibold text-gray-800 dark:text-white truncate">${escapeHtml(trainer.name)}</h4>
                        <p class="text-xs text-gray-500 dark:text-gray-400 truncate">${escapeHtml(trainer.email || '')}</p>
                    </div>
                </div>
                <div class="space-y-2 text-sm">
                    <p class="text-gray-600 dark:text-gray-300">
                        <i class="ri-building-line mr-2"></i>${escapeHtml(formatDepartmentName(trainer.department))}
                    </p>
                    ${trainer.specialization ? `<p class="text-gray-600 dark:text-gray-300"><i class="ri-star-line mr-2"></i>${escapeHtml(trainer.specialization)}</p>` : ''}
                    <span class="inline-block px-2 py-1 ${isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'} text-xs rounded-full">
                        ${isActive ? 'Active' : 'Inactive'}
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

async function displayTrainers() {
    const container = document.getElementById('trainers-list');
    if (!container) {
        console.error('trainers-list container not found');
        return;
    }

    try {
        if ((allTrainers || []).length === 0) {
            await loadTrainers();
        }
        wireAdminTrainerFilters();
        renderAdminTrainers();
    } catch (error) {
        console.error('Error displaying trainers:', error);
        container.innerHTML = '<p class="text-red-600 text-center py-8">Error loading trainers: ' + escapeHtml(error.message) + '</p>';
    }
}

function openAddTrainerModal() {
    const modal = document.createElement('div');
    modal.id = 'add-trainer-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div class="bg-primary p-6">
                <div class="flex items-center justify-between">
                    <h2 class="text-2xl font-bold text-white">Add New Trainer</h2>
                    <button onclick="closeAddTrainerModal()" class="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-full transition">
                        <i class="ri-close-line text-2xl"></i>
                    </button>
                </div>
            </div>
            
            <form id="add-trainer-form" class="p-6 space-y-4">
                <!-- Name -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Full Name *
                    </label>
                    <input 
                        type="text" 
                        name="name" 
                        required
                        placeholder="e.g., Madam Nelly Chepkwony"
                        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                </div>

                <!-- Email -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Email Address *
                    </label>
                    <input 
                        type="email" 
                        name="email" 
                        required
                        placeholder="e.g., nelly.chepkwony@ace.ac.ke"
                        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                </div>

                <!-- Phone -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Phone Number
                    </label>
                    <input 
                        type="tel" 
                        name="phone" 
                        placeholder="e.g., 0712345678"
                        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                </div>

                <!-- Department -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Department *
                    </label>
                    <select 
                        name="department" 
                        required
                        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                        <option value="">Select Department</option>
                        <option value="applied_science">Applied Science</option>
                        <option value="agriculture">Agriculture</option>
                        <option value="building_civil">Building & Civil Engineering</option>
                        <option value="electromechanical">Electromechanical Engineering</option>
                        <option value="hospitality">Hospitality</option>
                        <option value="business_liberal">Business & Liberal Studies</option>
                        <option value="computing_informatics">Computing & Informatics</option>
                    </select>
                </div>

                <!-- Specialization -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Specialization
                    </label>
                    <input 
                        type="text" 
                        name="specialization" 
                        placeholder="e.g., Chemistry, Mathematics"
                        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                </div>

                <!-- Qualifications -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Qualifications
                    </label>
                    <textarea 
                        name="qualifications" 
                        rows="3"
                        placeholder="e.g., MSc Chemistry, BSc Education"
                        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    ></textarea>
                </div>

                <!-- Password -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Default Password
                    </label>
                    <input 
                        type="text" 
                        name="password" 
                        value="trainer123"
                        readonly
                        class="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100"
                    >
                    <p class="text-xs text-gray-500 mt-1">Default password: trainer123 (can be changed after first login)</p>
                </div>

                <!-- Buttons -->
                <div class="flex items-center justify-end space-x-3 pt-4 border-t">
                    <button 
                        type="button"
                        onclick="closeAddTrainerModal()"
                        class="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit"
                        class="px-6 py-2 bg-primary text-white rounded-lg hover:bg-secondary transition"
                    >
                        <i class="ri-save-line mr-2"></i>Add Trainer
                    </button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    // Add form submit handler
    document.getElementById('add-trainer-form').addEventListener('submit', handleAddTrainer);
}

function closeAddTrainerModal() {
    const modal = document.getElementById('add-trainer-modal');
    if (modal) {
        modal.remove();
    }
}

async function handleAddTrainer(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const trainerData = {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        department: formData.get('department'),
        specialization: formData.get('specialization'),
        qualifications: formData.get('qualifications'),
        password: formData.get('password') || 'trainer123',
        isActive: true
    };

    try {
        showToast('Adding trainer...', 'info');
        
        const response = await authFetch(`${API_BASE}/trainers`, {
            method: 'POST',
            body: JSON.stringify(trainerData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to add trainer');
        }

        const result = await response.json();
        showToast('Trainer added successfully!', 'success');
        
        closeAddTrainerModal();
        
        // Reload trainers
        await loadTrainers();
        await displayTrainers();
        
    } catch (error) {
        console.error('Error adding trainer:', error);
        showToast(error.message || 'Failed to add trainer', 'error');
    }
}

window.openAddTrainerModal = openAddTrainerModal;
window.closeAddTrainerModal = closeAddTrainerModal;
window.handleAddTrainer = handleAddTrainer;

window.AdminTabs.trainers = {
    init() { displayTrainers(); }
};
