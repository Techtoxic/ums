// tabs/payslips.js — trainer payslips: generate, list, filter.
window.FinanceTabs = window.FinanceTabs || {};

// (verbatim financeDashboard.js)
let allPayslips = [];
let filteredPayslips = [];

// Initialize payslips on section load
async function initializePayslips() {
    await loadPayslips();
    
    // Add form submit listener
    const form = document.getElementById('generate-payslip-form');
    if (form) {
        form.addEventListener('submit', handleGeneratePayslips);
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
    
    try {
        // First, fetch all trainers to get their IDs
        showNotification('Fetching trainers...', 'info');
        const trainersResponse = await authFetch(`${API_BASE_URL}/trainers/all-departments`);
        if (!trainersResponse.ok) throw new Error('Failed to fetch trainers');
        
        const trainersData = await trainersResponse.json();
        const trainers = trainersData.trainers || [];
        
        if (trainers.length === 0) {
            showNotification('No trainers found to generate payslips for', 'error');
            return;
        }
        
        // Extract trainer IDs — /api/trainers/all-departments returns each trainer with `id`
        const trainerIds = trainers.map(trainer => trainer.id).filter(Boolean);
        
        // SEV-H-008: actor identity is sourced server-side from the JWT.
        showNotification(`Generating payslips for ${trainerIds.length} trainers...`, 'info');
        
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
