// tabs/payslips.js — trainer payslips: generate, list, filter.
window.FinanceTabs = window.FinanceTabs || {};

// (verbatim financeDashboard.js)
let allPayslips = [];
let filteredPayslips = [];

// Trainer selection for the generate form.
let payslipTrainers = [];               // [{ id, name, department }]
let payslipSelected = new Set();        // selected trainer ids (survives search filtering)

// Initialize payslips on section load
async function initializePayslips() {
    await loadPayslips();
    setupPayslipPeriod();
    loadTrainersForSelection();

    // Add form submit listener
    const form = document.getElementById('generate-payslip-form');
    if (form) {
        form.addEventListener('submit', handleGeneratePayslips);
    }
    // Live trainer search
    const search = document.getElementById('payslip-trainer-search');
    if (search) search.addEventListener('input', () => renderPayslipTrainers(search.value));
}

// Department display via the shared catalog (falls back to the raw key).
function payslipDept(key) {
    if (window.Catalog && typeof Catalog.departmentName === 'function') return Catalog.departmentName(key);
    return String(key || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Load active trainers into the selectable checkbox list.
async function loadTrainersForSelection() {
    const list = document.getElementById('payslip-trainers-list');
    if (!list) return;
    try {
        const res = await authFetch(`${API_BASE_URL}/trainers/all-departments`);
        if (!res.ok) throw new Error('Failed to load trainers');
        const data = await res.json();
        payslipTrainers = (data.trainers || []).filter(t => t && t.id);
        renderPayslipTrainers('');
    } catch (err) {
        console.error('Error loading trainers for selection:', err);
        list.innerHTML = '<p class="text-sm text-red-500 p-2">Failed to load trainers. Refresh and try again.</p>';
    }
}

// Render the trainer checkbox list, optionally filtered by a search term.
// Selection state is held in payslipSelected so it persists across searches.
function renderPayslipTrainers(filter) {
    const list = document.getElementById('payslip-trainers-list');
    if (!list) return;
    const q = (filter || '').trim().toLowerCase();
    const rows = payslipTrainers.filter(t => {
        if (!q) return true;
        return (t.name || '').toLowerCase().includes(q) || payslipDept(t.department).toLowerCase().includes(q);
    });

    if (!payslipTrainers.length) {
        list.innerHTML = '<p class="text-sm text-slate-500 dark:text-slate-400 p-2">No active trainers found.</p>';
        updatePayslipSelectedCount();
        return;
    }
    if (!rows.length) {
        list.innerHTML = '<p class="text-sm text-slate-500 dark:text-slate-400 p-2">No trainers match your search.</p>';
        updatePayslipSelectedCount();
        return;
    }

    list.innerHTML = rows.map(t => `
        <label class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer">
            <input type="checkbox" class="payslip-trainer-cb rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                value="${escapeAttr(t.id)}" ${payslipSelected.has(t.id) ? 'checked' : ''}>
            <span class="text-sm text-slate-800 dark:text-slate-100">${escapeHtml(t.name || 'Unnamed')}</span>
            <span class="ml-auto text-xs text-slate-500 dark:text-slate-400">${escapeHtml(payslipDept(t.department))}</span>
        </label>
    `).join('');

    list.querySelectorAll('.payslip-trainer-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) payslipSelected.add(cb.value);
            else payslipSelected.delete(cb.value);
            updatePayslipSelectedCount();
        });
    });
    updatePayslipSelectedCount();
}

// Select or clear all trainers currently shown by the search filter.
function selectAllPayslipTrainers(check) {
    const list = document.getElementById('payslip-trainers-list');
    if (!list) return;
    list.querySelectorAll('.payslip-trainer-cb').forEach(cb => {
        cb.checked = !!check;
        if (check) payslipSelected.add(cb.value);
        else payslipSelected.delete(cb.value);
    });
    updatePayslipSelectedCount();
}
window.selectAllPayslipTrainers = selectAllPayslipTrainers;

function updatePayslipSelectedCount() {
    const el = document.getElementById('payslip-selected-count');
    if (el) el.textContent = `(${payslipSelected.size} selected)`;
}

// Set up the generate form's period to mirror the backend rule: ANY month of the
// CURRENT YEAR up to the current month. The year is read-only (current year);
// the month is selectable but future months are disabled (you can't pay ahead),
// and it defaults to the current month.
function setupPayslipPeriod() {
    const now = new Date();
    const currentYear = String(now.getFullYear());
    const currentMonthNum = now.getMonth() + 1;
    const currentMonth = String(currentMonthNum).padStart(2, '0'); // "01".."12"

    const yearSel = document.getElementById('payslip-year');
    if (yearSel) {
        // Current year is the only selectable option.
        yearSel.innerHTML = `<option value="${currentYear}">${currentYear}</option>`;
        yearSel.value = currentYear;
        yearSel.setAttribute('disabled', 'disabled');      // read-only
        yearSel.title = 'Payslips can only be generated for the current year';
    }

    const monthSel = document.getElementById('payslip-month');
    if (monthSel) {
        monthSel.removeAttribute('disabled');              // month is now selectable
        monthSel.title = 'Select any month of the current year up to the current month';
        // Grey out future months — payroll can't be generated ahead of time.
        Array.from(monthSel.options).forEach(opt => {
            if (!opt.value) return; // keep the "Select Month" placeholder enabled
            opt.disabled = parseInt(opt.value, 10) > currentMonthNum;
        });
        monthSel.value = currentMonth;                     // default to current month
    }
}

// Generate payslips for all trainers
async function handleGeneratePayslips(e) {
    e.preventDefault();
    
    const month = document.getElementById('payslip-month').value;
    const year = document.getElementById('payslip-year').value;
    const amount = document.getElementById('payslip-amount').value;
    const description = document.getElementById('payslip-description').value;
    
    if (!month || !year || !amount) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    if (parseFloat(amount) <= 0) {
        showNotification('Amount must be greater than 0', 'error');
        return;
    }

    // Only the trainers the finance officer selected get a payslip + notification.
    const trainerIds = [...payslipSelected];
    if (trainerIds.length === 0) {
        showNotification('Select at least one trainer to generate payslips for', 'error');
        return;
    }

    try {
        // SEV-H-008: actor identity is sourced server-side from the JWT.
        showNotification(`Generating payslips for ${trainerIds.length} trainer${trainerIds.length === 1 ? '' : 's'}...`, 'info');
        
        const response = await authFetch(`${API_BASE_URL}/payslips/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                trainerIds,
                month,
                year: parseInt(year),
                amount: parseFloat(amount),
                description
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to generate payslips');
        }
        
        const result = await response.json();
        showNotification(`Successfully generated ${result.payslips.length} payslips`, 'success');
        
        // Reset form and reload payslips
        e.target.reset();
        setupPayslipPeriod();      // form.reset() clears the selects — re-apply year lock + month options
        payslipSelected.clear();   // start the next batch (e.g. next pay grade) with a clean selection
        renderPayslipTrainers('');
        await loadPayslips();
        
    } catch (error) {
        console.error('Error generating payslips:', error);
        showNotification(error.message, 'error');
    }
}

// Load all payslips
async function loadPayslips() {
    try {
        showPayslipsLoading();
        
        const response = await authFetch(`${API_BASE_URL}/payslips`);
        if (!response.ok) throw new Error('Failed to load payslips');
        
        const data = await response.json();
        allPayslips = data.payslips || [];
        filteredPayslips = allPayslips;
        
        displayPayslips();
        hidePayslipsLoading();
        
    } catch (error) {
        console.error('Error loading payslips:', error);
        hidePayslipsLoading();
        showPayslipsEmpty();
    }
}

// Display payslips in table
function displayPayslips() {
    const tbody = document.getElementById('payslips-table-body');
    const empty = document.getElementById('payslips-empty');
    const tableContainer = document.getElementById('payslips-table-container');
    
    if (!tbody) return;
    
    if (filteredPayslips.length === 0) {
        tableContainer.style.display = 'none';
        empty.classList.remove('hidden');
        return;
    }
    
    empty.classList.add('hidden');
    tableContainer.style.display = 'block';
    
    // Group payslips by month/year/amount
    const grouped = {};
    filteredPayslips.forEach(payslip => {
        const key = `${payslip.month}-${payslip.year}-${payslip.amount}`;
        if (!grouped[key]) {
            grouped[key] = {
                month: payslip.month,
                year: payslip.year,
                amount: payslip.amount,
                generatedByName: payslip.generatedByName,
                createdAt: payslip.createdAt,
                trainers: []
            };
        }
        grouped[key].trainers.push(payslip);
    });
    
    // Convert to array and sort by date (newest first)
    const groupedArray = Object.values(grouped).sort((a, b) => 
        new Date(b.createdAt) - new Date(a.createdAt)
    );
    
    tbody.innerHTML = groupedArray.map(group => {
        const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
        const monthName = monthNames[parseInt(group.month)];
        
        const viewedCount = group.trainers.filter(p => p.isViewed).length;
        const totalCount = group.trainers.length;
        
        const generatedByName = group.generatedByName || 'System';
        
        return `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                <td class="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">${monthName} ${group.year}</td>
                <td class="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white">KES ${Number(group.amount).toLocaleString()}</td>
                <td class="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">${totalCount} trainers</td>
                <td class="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">${escapeHtml(generatedByName)}</td>
                <td class="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">${new Date(group.createdAt).toLocaleDateString()}</td>
                <td class="px-4 py-3">
                    <span class="px-2 py-1 text-xs font-medium rounded-full ${viewedCount === totalCount ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}">
                        ${viewedCount}/${totalCount} viewed
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

// Filter payslips
function filterPayslips() {
    const month = document.getElementById('filter-payslip-month').value;
    const year = document.getElementById('filter-payslip-year').value;
    
    filteredPayslips = allPayslips.filter(payslip => {
        if (month && payslip.month !== month) return false;
        if (year && payslip.year !== year) return false;
        return true;
    });
    
    displayPayslips();
}

// Refresh payslips
async function refreshPayslips() {
    await loadPayslips();
    showNotification('Payslips refreshed', 'success');
}

// Show/hide loading
function showPayslipsLoading() {
    const loading = document.getElementById('payslips-loading');
    const table = document.getElementById('payslips-table-container');
    const empty = document.getElementById('payslips-empty');
    
    if (loading) loading.classList.remove('hidden');
    if (table) table.style.display = 'none';
    if (empty) empty.classList.add('hidden');
}

function hidePayslipsLoading() {
    const loading = document.getElementById('payslips-loading');
    if (loading) loading.classList.add('hidden');
}

function showPayslipsEmpty() {
    const empty = document.getElementById('payslips-empty');
    if (empty) empty.classList.remove('hidden');
}

window.FinanceTabs.payslips = {
    init() { if (typeof initializePayslips === 'function') initializePayslips(); }
};
