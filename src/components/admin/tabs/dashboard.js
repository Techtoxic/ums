// tabs/dashboard.js — admin dashboard: metric tiles, charts, recent activity, alerts.
window.AdminTabs = window.AdminTabs || {};

// (verbatim from adminDashboard.js)
function calculateDashboardMetrics() {
    // Update stat cards (these IDs exist in the HTML)
    const statStudentsEl = document.getElementById('stat-students');
    if (statStudentsEl) statStudentsEl.textContent = allStudents.length.toLocaleString();
    
    const statTrainersEl = document.getElementById('stat-trainers');
    if (statTrainersEl) statTrainersEl.textContent = allTrainers.length.toLocaleString();
    
    // Legacy IDs (may not exist)
    const totalStudentsEl = document.getElementById('total-students');
    if (totalStudentsEl) totalStudentsEl.textContent = allStudents.length.toLocaleString();
    
    const studentsThisMonthEl = document.getElementById('students-this-month');
    if (studentsThisMonthEl) {
        const thisMonth = new Date().getMonth();
        const thisYear = new Date().getFullYear();
        const studentsThisMonth = allStudents.filter(s => {
            const createdDate = new Date(s.createdAt);
            return createdDate.getMonth() === thisMonth && createdDate.getFullYear() === thisYear;
        }).length;
        studentsThisMonthEl.textContent = `+${studentsThisMonth}`;
    }

    const totalTrainersEl = document.getElementById('total-trainers');
    if (totalTrainersEl) totalTrainersEl.textContent = allTrainers.length.toLocaleString();

    // Accurate figures from the server-computed analytics + per-student financials.
    const totals = (financeAnalytics && financeAnalytics.totals) || {};
    const fin = Object.values(studentFinanceByAdm || {});
    const totalRevenue = Number(totals.totalRevenue != null ? totals.totalRevenue : allPayments.reduce((s, p) => s + Number(p.amount || 0), 0));
    const totalExpected = Number(totals.expectedRevenue || fin.reduce((s, f) => s + (Number(f.expected) || 0), 0));
    const tuitionRevenue = Number(totals.tuitionRevenue || 0);
    const totalOutstanding = fin.reduce((s, f) => s + Math.max(0, Number(f.balance) || 0), 0);
    const studentsOwing = fin.filter(f => (Number(f.balance) || 0) > 0).length;

    const statRevenueEl = document.getElementById('stat-revenue');
    if (statRevenueEl) statRevenueEl.textContent = formatCurrency(totalRevenue);
    const totalRevenueEl = document.getElementById('total-revenue');
    if (totalRevenueEl) totalRevenueEl.textContent = formatCurrency(totalRevenue);

    const statOutstandingEl = document.getElementById('stat-outstanding');
    if (statOutstandingEl) statOutstandingEl.textContent = formatCurrency(totalOutstanding);
    const outstandingBalanceEl = document.getElementById('outstanding-balance');
    if (outstandingBalanceEl) outstandingBalanceEl.textContent = formatCurrency(totalOutstanding);

    const studentsOwingEl = document.getElementById('students-owing-count');
    if (studentsOwingEl) studentsOwingEl.textContent = `${studentsOwing} students`;

    const collectionRate = totalExpected > 0 ? Math.min(100, (tuitionRevenue / totalExpected) * 100).toFixed(1) : 0;
    const collectionRateEl = document.getElementById('collection-rate');
    if (collectionRateEl) collectionRateEl.textContent = `${collectionRate}%`;
}

// Theme-aware chart colors.
function admIsDark() { return document.documentElement.classList.contains('dark'); }
function admTick() { return admIsDark() ? '#CBD5E1' : '#475569'; }
function admGrid() { return admIsDark() ? 'rgba(148,163,184,0.15)' : 'rgba(100,116,139,0.12)'; }

// ========================================
// CHARTS
// ========================================

function createEnrollmentChart() {
    const ctx = document.getElementById('enrollmentChart');
    if (!ctx) return;

    // Get enrollment data for last 6 months
    const months = [];
    const enrollmentData = [];
    
    for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthName = date.toLocaleDateString('en-US', { month: 'short' });
        months.push(monthName);
        
        const count = allStudents.filter(s => {
            const createdDate = new Date(s.createdAt);
            return createdDate.getMonth() === date.getMonth() && 
                   createdDate.getFullYear() === date.getFullYear();
        }).length;
        enrollmentData.push(count);
    }

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: 'New Students',
                data: enrollmentData,
                borderColor: '#7A0C0C',
                backgroundColor: 'rgba(122, 12, 12, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0,
                        color: admTick()
                    },
                    grid: { color: admGrid() }
                },
                x: { ticks: { color: admTick() }, grid: { display: false } }
            }
        }
    });
}

function createRevenueChart() {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    // Get revenue data for last 6 months
    const months = [];
    const revenueData = [];
    
    for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthName = date.toLocaleDateString('en-US', { month: 'short' });
        months.push(monthName);
        
        const monthRevenue = allPayments.filter(p => {
            const paymentDate = new Date(p.paymentDate || p.date || p.createdAt);
            return paymentDate.getMonth() === date.getMonth() && 
                   paymentDate.getFullYear() === date.getFullYear();
        }).reduce((sum, p) => sum + Number(p.amount || 0), 0);
        
        revenueData.push(monthRevenue);
    }

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [{
                label: 'Revenue (KES)',
                data: revenueData,
                backgroundColor: '#10b981',
                borderColor: '#059669',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: admTick(),
                        callback: function(value) {
                            return 'KES ' + value.toLocaleString();
                        }
                    },
                    grid: { color: admGrid() }
                },
                x: { ticks: { color: admTick() }, grid: { display: false } }
            }
        }
    });
}

function createDepartmentChart() {
    const ctx = document.getElementById('departmentChart');
    if (!ctx) return;

    // Count students by department
    const departments = {
        'applied_science': 0,
        'agriculture': 0,
        'building_civil': 0,
        'electromechanical': 0,
        'hospitality': 0,
        'business_liberal': 0,
        'computing_informatics': 0
    };

    allStudents.forEach(student => {
        if (student.department && departments.hasOwnProperty(student.department)) {
            departments[student.department]++;
        }
    });

    const labels = Object.keys(departments).map(dept => formatDepartmentName(dept));
    const data = Object.values(departments);

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#7A0C0C',  // Applied Science (maroon)
                    '#8B2A2A',  // Agriculture
                    '#3b82f6',  // Building & Civil (blue)
                    '#10b981',  // Electromechanical (green)
                    '#f59e0b',  // Hospitality (yellow)
                    '#8b5cf6',  // Business & Liberal (purple)
                    '#ec4899'   // Computing & Informatics (pink)
                ],
                borderWidth: 2,
                borderColor: admIsDark() ? '#1F2937' : '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        color: admTick(),
                        font: {
                            size: 11
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function loadRecentActivity() {
    const container = document.getElementById('recent-activity');
    if (!container) return;

    // Get recent students (last 5)
    const recentStudents = allStudents
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5);

    if (recentStudents.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No recent activity</p>';
        return;
    }

    container.innerHTML = recentStudents.map(student => `
        <div class="flex items-center space-x-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition">
            <div class="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white">
                <i class="ri-user-add-line"></i>
            </div>
            <div class="flex-1">
                <p class="text-sm font-semibold text-gray-800 dark:text-gray-100">${escapeHtml(student.name)}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">New student registered • ${getTimeAgo(student.createdAt)}</p>
            </div>
        </div>
    `).join('');
}

function loadSystemAlerts() {
    const container = document.getElementById('system-alerts');
    if (!container) return;

    // Static class maps so Tailwind classes are always present (dynamic
    // `bg-${color}-50` strings are not reliably generated).
    const styles = {
        red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-red-600',
        green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300 text-green-600',
        blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 text-blue-600',
    };
    const alerts = [];

    // Accurate high-balance count from server-computed financials.
    const fin = Object.values(studentFinanceByAdm || {});
    const highBalanceStudents = fin.filter(f => (Number(f.balance) || 0) > 100000).length;
    if (highBalanceStudents > 0) {
        alerts.push({ icon: 'ri-alert-line', message: `${highBalanceStudents} students have balance exceeding KES 100,000`, color: 'red' });
    }

    const todayPayments = allPayments.filter(p => {
        const paymentDate = new Date(p.paymentDate || p.createdAt);
        return paymentDate.toDateString() === new Date().toDateString();
    }).length;
    if (todayPayments > 0) {
        alerts.push({ icon: 'ri-money-dollar-circle-line', message: `${todayPayments} payment${todayPayments > 1 ? 's' : ''} received today`, color: 'green' });
    }

    alerts.push({ icon: 'ri-checkbox-circle-line', message: 'All systems operational', color: 'green' });

    container.innerHTML = alerts.map(alert => {
        const parts = styles[alert.color].split(' ');
        const iconColor = parts[parts.length - 1];
        const boxClasses = parts.slice(0, -1).join(' ');
        return `
        <div class="flex items-start space-x-3 p-3 border rounded-lg ${boxClasses}">
            <i class="${alert.icon} ${iconColor} text-xl mt-0.5"></i>
            <p class="text-sm">${escapeHtml(alert.message)}</p>
        </div>`;
    }).join('');
}

window.AdminTabs.dashboard = {
    // Render once. The monolith built these at bootstrap (loadSectionData has no
    // 'dashboard' case, so switching back never re-rendered) and the cached pane
    // keeps the charts; re-running createXChart() would hit Chart.js's
    // "Canvas is already in use" error. Idempotent: subsequent calls no-op.
    init() {
        if (window.__adminDashRendered) return;
        window.__adminDashRendered = true;
        calculateDashboardMetrics();
        createEnrollmentChart();
        createRevenueChart();
        createDepartmentChart();
        loadRecentActivity();
        loadSystemAlerts();
    }
};
