// tabs/financial.js — admin financial overview.
window.AdminTabs = window.AdminTabs || {};

// (verbatim from adminDashboard.js)
async function displayFinancial() {
    const container = document.getElementById('financial-content');
    if (!container) {
        console.error('financial-content container not found');
        return;
    }

    try {
        // Calculate financial metrics with proper balance calculation
        const totalRevenue = allPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        
        const totalOutstanding = allStudents.reduce((sum, student) => {
            const program = allPrograms.find(p => p.name === getCourseProgram(student.course));
            const programCost = program ? program.programCost : 67189;
            const totalFees = programCost * (student.year || 1);
            const studentPayments = allPayments.filter(p => p.studentId === student.admissionNumber);
            const totalPaid = studentPayments.reduce((pSum, p) => pSum + Number(p.amount || 0), 0);
            const balance = totalFees - totalPaid;
            return sum + (balance > 0 ? balance : 0);
        }, 0);

        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                <div class="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-2 md:p-3 border border-green-200">
                    <div class="flex items-center justify-between mb-2">
                        <h4 class="text-xs md:text-sm font-bold text-green-800">Total Revenue</h4>
                        <i class="ri-money-dollar-circle-line text-lg md:text-xl text-green-600"></i>
                    </div>
                    <p class="text-base md:text-lg font-bold text-green-600">${formatCurrency(totalRevenue)}</p>
                    <p class="text-xs text-green-700 mt-1">${allPayments.length} transactions</p>
                </div>
                
                <div class="bg-gradient-to-br from-red-50 to-orange-50 rounded-lg p-2 md:p-3 border border-red-200">
                    <div class="flex items-center justify-between mb-2">
                        <h4 class="text-xs md:text-sm font-bold text-red-800">Outstanding Fees</h4>
                        <i class="ri-alert-line text-lg md:text-xl text-red-600"></i>
                    </div>
                    <p class="text-base md:text-lg font-bold text-red-600">${formatCurrency(totalOutstanding)}</p>
                    <p class="text-xs text-red-700 mt-1">${allStudents.filter(s => {
                        const program = allPrograms.find(p => p.name === getCourseProgram(s.course));
                        const programCost = program ? program.programCost : 67189;
                        const totalFees = programCost * (s.year || 1);
                        const studentPayments = allPayments.filter(p => p.studentId === s.admissionNumber);
                        const totalPaid = studentPayments.reduce((pSum, p) => pSum + Number(p.amount || 0), 0);
                        return (totalFees - totalPaid) > 0;
                    }).length} students owing</p>
                </div>
            </div>

            <h3 class="text-sm md:text-base font-bold text-gray-800 dark:text-white mb-2">Recent Payments</h3>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th class="px-2 py-1.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Date</th>
                            <th class="px-2 py-1.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Student</th>
                            <th class="px-2 py-1.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Amount</th>
                            <th class="px-2 py-1.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">Reference</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        ${allPayments.slice(0, 10).map(payment => `
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                                <td class="px-2 py-1.5 text-xs text-gray-600 dark:text-gray-400">${new Date(payment.paymentDate || payment.createdAt).toLocaleDateString()}</td>
                                <td class="px-2 py-1.5 text-xs font-medium text-gray-900 dark:text-white">${escapeHtml(payment.studentId)}</td>
                                <td class="px-2 py-1.5 text-xs font-semibold text-green-600">${formatCurrency(payment.amount)}</td>
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
