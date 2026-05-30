// tabs/financial.js — admin financial overview (accurate, server-backed).
// Totals come from /api/finance/analytics + the per-student financials map; the
// recent-payments table resolves the student UUID to a real name.
window.AdminTabs = window.AdminTabs || {};

function adminStudentNameById(uuid) {
    const s = (allStudents || []).find(st => st._id === uuid || st.id === uuid);
    return s ? s.name : (uuid || 'N/A');
}

async function displayFinancial() {
    const container = document.getElementById('financial-content');
    if (!container) { console.error('financial-content container not found'); return; }

    try {
        if (!financeAnalytics) await loadFinanceAnalytics();
        if (Object.keys(studentFinanceByAdm || {}).length === 0) await loadStudentFinancials();

        const totals = (financeAnalytics && financeAnalytics.totals) || {};
        const totalRevenue = Number(totals.totalRevenue || 0);
        const tuitionRevenue = Number(totals.tuitionRevenue || 0);
        const otherRevenue = Number(totals.otherRevenue || 0);
        const fin = Object.values(studentFinanceByAdm || {});
        const totalOutstanding = fin.reduce((sum, f) => sum + Math.max(0, Number(f.balance) || 0), 0);
        const studentsOwing = fin.filter(f => (Number(f.balance) || 0) > 0).length;
        const expected = Number(totals.expectedRevenue || 0);
        const collectionRate = expected > 0 ? Math.min(100, Math.round((tuitionRevenue / expected) * 100)) : 0;

        container.innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
                <div class="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-gray-800 rounded-lg p-3 border border-green-200 dark:border-green-800">
                    <div class="flex items-center justify-between mb-1"><h4 class="text-xs font-bold text-green-800 dark:text-green-300">Total Revenue</h4><i class="ri-money-dollar-circle-line text-xl text-green-600"></i></div>
                    <p class="text-lg font-bold text-green-600 dark:text-green-400">${formatCurrency(totalRevenue)}</p>
                    <p class="text-xs text-green-700 dark:text-green-300/70 mt-1">Tuition ${formatCurrency(tuitionRevenue)} · Other ${formatCurrency(otherRevenue)}</p>
                </div>
                <div class="bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-gray-800 rounded-lg p-3 border border-red-200 dark:border-red-800">
                    <div class="flex items-center justify-between mb-1"><h4 class="text-xs font-bold text-red-800 dark:text-red-300">Outstanding Fees</h4><i class="ri-alert-line text-xl text-red-600"></i></div>
                    <p class="text-lg font-bold text-red-600 dark:text-red-400">${formatCurrency(totalOutstanding)}</p>
                    <p class="text-xs text-red-700 dark:text-red-300/70 mt-1">${studentsOwing} students owing</p>
                </div>
                <div class="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-gray-800 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                    <div class="flex items-center justify-between mb-1"><h4 class="text-xs font-bold text-blue-800 dark:text-blue-300">Expected Tuition</h4><i class="ri-bank-line text-xl text-blue-600"></i></div>
                    <p class="text-lg font-bold text-blue-600 dark:text-blue-400">${formatCurrency(expected)}</p>
                    <p class="text-xs text-blue-700 dark:text-blue-300/70 mt-1">${(allStudents || []).length} students</p>
                </div>
                <div class="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-gray-800 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
                    <div class="flex items-center justify-between mb-1"><h4 class="text-xs font-bold text-amber-800 dark:text-amber-300">Collection Rate</h4><i class="ri-line-chart-line text-xl text-amber-600"></i></div>
                    <p class="text-lg font-bold text-amber-600 dark:text-amber-400">${collectionRate}%</p>
                    <div class="w-full h-1.5 rounded-full bg-amber-200 dark:bg-amber-900/40 mt-2 overflow-hidden"><div class="h-1.5 rounded-full bg-amber-500" style="width:${collectionRate}%"></div></div>
                </div>
            </div>

            <h3 class="text-sm md:text-base font-bold text-gray-800 dark:text-white mb-2">Recent Payments</h3>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th class="px-2 py-1.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Date</th>
                            <th class="px-2 py-1.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Student</th>
                            <th class="px-2 py-1.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Mode</th>
                            <th class="px-2 py-1.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Amount</th>
                            <th class="px-2 py-1.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Reference</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        ${(allPayments || []).slice(0, 12).map(payment => `
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                                <td class="px-2 py-1.5 text-xs text-gray-600 dark:text-gray-400">${new Date(payment.paymentDate || payment.createdAt).toLocaleDateString()}</td>
                                <td class="px-2 py-1.5 text-xs font-medium text-gray-900 dark:text-white">${escapeHtml(adminStudentNameById(payment.studentId))}</td>
                                <td class="px-2 py-1.5 text-xs text-gray-600 dark:text-gray-400 capitalize">${escapeHtml(payment.paymentMode || '')}</td>
                                <td class="px-2 py-1.5 text-xs font-semibold text-green-600 dark:text-green-400">${formatCurrency(payment.amount)}</td>
                                <td class="px-2 py-1.5 text-xs text-gray-600 dark:text-gray-400">${escapeHtml(payment.referenceNumber || 'N/A')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Error displaying financial data:', error);
        container.innerHTML = '<p class="text-red-600 text-center py-8">Error loading financial data: ' + escapeHtml(error.message) + '</p>';
    }
}

window.AdminTabs.financial = {
    init() { displayFinancial(); }
};
