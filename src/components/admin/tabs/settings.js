// tabs/settings.js — admin settings: dynamic academic year + editable intake,
// fee threshold and registration toggle (persisted via /api/system-settings).
window.AdminTabs = window.AdminTabs || {};

function computeAcademicYearLabel() {
    const now = new Date();
    const y = now.getFullYear();
    return now.getMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

async function loadAdminSettings() {
    const yearEl = document.getElementById('set-academic-year');
    if (yearEl) yearEl.textContent = computeAcademicYearLabel();
    try {
        const res = await authFetch(`${API_BASE}/system-settings`);
        if (!res.ok) return;
        const settings = await res.json();
        const get = (k) => (settings.find(s => s.key === k) || {}).value;

        const intake = get('current_intake');
        const intakeSel = document.getElementById('set-current-intake');
        if (intakeSel && intake) intakeSel.value = intake;

        const threshold = get('fee_threshold');
        const thrInput = document.getElementById('set-fee-threshold');
        if (thrInput && threshold != null) thrInput.value = threshold;

        const reg = get('registration_enabled');
        const regSel = document.getElementById('set-registration-enabled');
        if (regSel && reg != null) regSel.value = String(reg);

        const yr = get('current_academic_year');
        if (yearEl && yr) yearEl.textContent = yr;
    } catch (e) {
        console.error('Error loading admin settings:', e);
    }
}

async function adminSaveSetting(key, value, statusElId) {
    const statusEl = document.getElementById(statusElId);
    try {
        const res = await authFetch(`${API_BASE}/system-settings/${key}`, {
            method: 'PUT',
            body: JSON.stringify({ value }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
            if (statusEl) { statusEl.textContent = 'Saved ✓'; statusEl.className = 'text-[11px] text-green-600 dark:text-green-400 mt-1'; }
            showToast('Setting updated', 'success');
        } else {
            if (statusEl) { statusEl.textContent = body.message || 'Update failed'; statusEl.className = 'text-[11px] text-red-600 dark:text-red-400 mt-1'; }
            showToast(body.message || 'Update failed', 'error');
        }
    } catch (e) {
        console.error('Error saving setting:', e);
        showToast('Update failed', 'error');
    }
}

function adminSaveIntake() {
    const v = document.getElementById('set-current-intake')?.value;
    if (v) adminSaveSetting('current_intake', v, 'set-intake-status');
}
function adminSaveThreshold() {
    const v = document.getElementById('set-fee-threshold')?.value;
    if (v === '' || v == null || Number(v) < 0) { showToast('Enter a valid threshold', 'error'); return; }
    adminSaveSetting('fee_threshold', String(v), 'set-threshold-status');
}
function adminSaveRegistration() {
    const v = document.getElementById('set-registration-enabled')?.value;
    adminSaveSetting('registration_enabled', v, 'set-registration-status');
}

window.adminSaveIntake = adminSaveIntake;
window.adminSaveThreshold = adminSaveThreshold;
window.adminSaveRegistration = adminSaveRegistration;

window.AdminTabs.settings = {
    init() { loadAdminSettings(); }
};
