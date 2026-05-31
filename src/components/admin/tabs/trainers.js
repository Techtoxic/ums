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
        container.innerHTML = '<p class="col-span-full" style="text-align:center;color:var(--text-muted);font-size:13px;padding:24px">No trainers match the current filters</p>';
        return;
    }

    container.innerHTML = list.map(trainer => {
        const isActive = trainer.isActive !== false; // endpoint may omit the flag
        const initial = escapeHtml((trainer.name || '?').trim().charAt(0).toUpperCase() || '?');
        return `
            <div class="adm-card">
                <div class="adm-card__body">
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
                        <div style="width:44px;height:44px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;color:var(--maroon);background:color-mix(in srgb, var(--maroon) 12%, transparent)">${initial}</div>
                        <div style="min-width:0">
                            <div class="td-strong" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(trainer.name)}</div>
                            <div style="color:var(--text-muted);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(trainer.email || '')}</div>
                        </div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--text-secondary)">
                        ${trainer.phoneNumber || trainer.phone ? `<div><i class="ri-phone-line" style="color:var(--text-muted);margin-right:8px"></i>${escapeHtml(trainer.phoneNumber || trainer.phone)}</div>` : ''}
                        <div><i class="ri-building-line" style="color:var(--text-muted);margin-right:8px"></i>${escapeHtml(formatDepartmentName(trainer.department))}</div>
                        ${trainer.specialization ? `<div><i class="ri-star-line" style="color:var(--text-muted);margin-right:8px"></i>${escapeHtml(trainer.specialization)}</div>` : ''}
                    </div>
                    <div style="margin-top:14px">
                        <span class="pill ${isActive ? 'pill--success' : 'pill--neutral'}">${isActive ? 'Active' : 'Inactive'}</span>
                    </div>
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
    modal.className = 'adm-modal-overlay';
    modal.innerHTML = `
        <div class="adm-modal">
            <div class="adm-modal__head">
                <span class="adm-modal__title">Add New Trainer</span>
                <button class="admin-iconbtn" onclick="closeAddTrainerModal()"><i class="ri-close-line"></i></button>
            </div>
            <div class="adm-modal__body">
                <form id="add-trainer-form" style="display:flex;flex-direction:column;gap:14px">
                    <div>
                        <label class="adm-label">Full Name *</label>
                        <input type="text" name="name" required placeholder="e.g., Madam Nelly Chepkwony" class="adm-input">
                    </div>
                    <div>
                        <label class="adm-label">Email Address *</label>
                        <input type="email" name="email" required placeholder="e.g., nelly.chepkwony@ace.ac.ke" class="adm-input">
                    </div>
                    <div>
                        <label class="adm-label">Phone Number</label>
                        <input type="tel" name="phone" placeholder="e.g., 0712345678" class="adm-input">
                    </div>
                    <div>
                        <label class="adm-label">Department *</label>
                        <select name="department" required class="adm-select">
                            <option value="">Select Department</option>
                        </select>
                    </div>
                    <div>
                        <label class="adm-label">Specialization</label>
                        <input type="text" name="specialization" placeholder="e.g., Chemistry, Mathematics" class="adm-input">
                    </div>
                    <div>
                        <label class="adm-label">Qualifications</label>
                        <textarea name="qualifications" rows="3" placeholder="e.g., MSc Chemistry, BSc Education" class="adm-textarea"></textarea>
                    </div>
                    <div>
                        <label class="adm-label">Default Password</label>
                        <input type="text" name="password" value="trainer123" readonly class="adm-input">
                        <p class="kpi__note" style="margin-top:6px">Default password: trainer123 (can be changed after first login)</p>
                    </div>
                    <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;padding-top:8px;border-top:1px solid var(--border-default)">
                        <button type="button" onclick="closeAddTrainerModal()" class="adm-btn adm-btn--outline">Cancel</button>
                        <button type="submit" class="adm-btn adm-btn--primary"><i class="ri-save-line"></i> Add Trainer</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Populate the department dropdown from the DB-backed catalog (Rule 7).
    // Option values stay snake textCodes (Rule 2). Keep "Select Department" first.
    const deptSelect = modal.querySelector('select[name="department"]');
    if (deptSelect && window.Catalog) {
        Catalog.populateDepartmentSelect(deptSelect, { includeAll: true, allLabel: 'Select Department' });
    }

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
