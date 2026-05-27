// tabs/reports.js — admin reports & analytics.
window.AdminTabs = window.AdminTabs || {};

// (verbatim from adminDashboard.js)
function displayReports() {
    const container = document.getElementById('reports-container');
    if (!container) return;

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div class="border rounded-lg p-6 hover:shadow-lg transition cursor-pointer" onclick="generateReport('enrollment')">
                <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                    <i class="ri-user-follow-line text-2xl text-blue-600"></i>
                </div>
                <h4 class="font-bold text-gray-800 mb-2">Enrollment Report</h4>
                <p class="text-sm text-gray-600">Student enrollment statistics and trends</p>
            </div>

            <div class="border rounded-lg p-6 hover:shadow-lg transition cursor-pointer" onclick="generateReport('financial')">
                <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                    <i class="ri-money-dollar-circle-line text-2xl text-green-600"></i>
                </div>
                <h4 class="font-bold text-gray-800 mb-2">Financial Report</h4>
                <p class="text-sm text-gray-600">Revenue and payment analytics</p>
            </div>

            <div class="border rounded-lg p-6 hover:shadow-lg transition cursor-pointer" onclick="generateReport('department')">
                <div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                    <i class="ri-building-line text-2xl text-purple-600"></i>
                </div>
                <h4 class="font-bold text-gray-800 mb-2">Department Report</h4>
                <p class="text-sm text-gray-600">Department-wise breakdown</p>
            </div>
        </div>
    `;
}

function generateReport(type) {
    showToast(`Generating ${type} report...`, 'info');
    // In production, this would generate and download actual reports
    setTimeout(() => {
        showToast('Report generation complete!', 'success');
    }, 2000);
}

window.generateReport = generateReport;

window.AdminTabs.reports = {
    init() { displayReports(); }
};
