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

    const rowsHtml = list.map(trainer => {
        const isActive = trainer.isActive !== false; // endpoint may omit the flag
        const initial = escapeHtml((trainer.name || '?').trim().charAt(0).toUpperCase() || '?');
        const units = Number(trainer.unitsAssigned || 0);
        const students = Number(trainer.studentsAssigned || 0);
        return `
            <tr>
                <td>
                    <div style="display:flex;align-items:center;gap:12px">
                        <div style="width:38px;height:38px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:var(--maroon);background:color-mix(in srgb, var(--maroon) 12%, transparent)">${initial}</div>
                        <div style="min-width:0">
                            <div class="td-strong">${escapeHtml(trainer.name)}</div>
                            <div style="color:var(--text-muted);font-size:12px">${escapeHtml(trainer.email || '')}</div>
                        </div>
                    </div>
                </td>
                <td>${escapeHtml(formatDepartmentName(trainer.department))}</td>
                <td>${escapeHtml(trainer.phoneNumber || trainer.phone || '—')}</td>
                <td><span class="pill pill--info">${units} unit${units === 1 ? '' : 's'}</span></td>
                <td><span class="pill pill--neutral">${students} student${students === 1 ? '' : 's'}</span></td>
                <td style="text-align:right"><span class="pill ${isActive ? 'pill--success' : 'pill--neutral'}">${isActive ? 'Active' : 'Inactive'}</span></td>
            </tr>`;
    }).join('');

    container.innerHTML = `
        <div class="adm-card">
            <div class="adm-card__head">
                <div class="adm-card__title"><i class="ri-user-star-line"></i> Trainer List</div>
                <span class="kpi__note">Showing ${list.length} of ${(allTrainers || []).length}</span>
            </div>
            <div class="adm-table-wrap">
                <table class="adm-table">
                    <thead>
                        <tr>
                            <th>Trainer</th>
                            <th>Department</th>
                            <th>Phone</th>
                            <th>Units Assigned</th>
                            <th>Students Assigned</th>
                            <th style="text-align:right">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${list.length === 0 ? `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">No trainers match the current filters</td></tr>` : rowsHtml}
                    </tbody>
                </table>
            </div>
        </div>`;
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
                    <p class="kpi__note">The trainer signs in with the default password <strong>trainer123</strong> and is prompted to change it on first login.</p>
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
        phone: formData.get('phone') || null,
        department: formData.get('department'),
    };

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="ri-loader-4-line"></i> Adding…'; }
    try {
        const response = await authFetch(`${API_BASE}/trainers`, {
            method: 'POST',
            body: JSON.stringify(trainerData)
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || 'Failed to add trainer');

        showToast('Trainer added successfully!', 'success');
        closeAddTrainerModal();

        // Reload trainers + re-render the list.
        await loadTrainers();
        renderAdminTrainers();
    } catch (error) {
        console.error('Error adding trainer:', error);
        showToast(error.message || 'Failed to add trainer', 'error');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="ri-save-line"></i> Add Trainer'; }
    }
}

window.openAddTrainerModal = openAddTrainerModal;
window.closeAddTrainerModal = closeAddTrainerModal;
window.handleAddTrainer = handleAddTrainer;

window.AdminTabs.trainers = {
    init() { displayTrainers(); }
};
