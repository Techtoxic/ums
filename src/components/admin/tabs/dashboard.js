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

    // Calculate total revenue (needed for multiple calculations)
    const totalRevenue = allPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    
    // Update stat-revenue (actual HTML ID)
    const statRevenueEl = document.getElementById('stat-revenue');
    if (statRevenueEl) {
        statRevenueEl.textContent = formatCurrency(totalRevenue);
    }
    
    // Legacy ID
    const totalRevenueEl = document.getElementById('total-revenue');
    if (totalRevenueEl) {
        totalRevenueEl.textContent = formatCurrency(totalRevenue);
    }

    // Calculate outstanding balance
    const totalOutstanding = allStudents.reduce((sum, student) => {
        const program = allPrograms.find(p => p.name === getCourseProgram(student.course));
        const programCost = program ? program.programCost : 67189;
        const totalFees = programCost * (student.module || 1);
        const studentPayments = allPayments.filter(p => p.studentId === student.admissionNumber);
        const totalPaid = studentPayments.reduce((pSum, p) => pSum + Number(p.amount || 0), 0);
        const balance = totalFees - totalPaid;
        return sum + (balance > 0 ? balance : 0);
    }, 0);
    
    // Update stat-outstanding (actual HTML ID)
    const statOutstandingEl = document.getElementById('stat-outstanding');
    if (statOutstandingEl) {
        statOutstandingEl.textContent = formatCurrency(totalOutstanding);
    }
    
    // Legacy ID
    const outstandingBalanceEl = document.getElementById('outstanding-balance');
    if (outstandingBalanceEl) {
        outstandingBalanceEl.textContent = formatCurrency(totalOutstanding);
    }
    
    // Students owing
    const studentsOwing = allStudents.filter(s => {
        const program = allPrograms.find(p => p.name === getCourseProgram(s.course));
        const programCost = program ? program.programCost : 67189;
        const totalFees = programCost * (s.module || 1);
        const studentPayments = allPayments.filter(p => p.studentId === s.admissionNumber);
        const totalPaid = studentPayments.reduce((pSum, p) => pSum + Number(p.amount || 0), 0);
        return (totalFees - totalPaid) > 0;
    }).length;
    const studentsOwingEl = document.getElementById('students-owing-count');
    if (studentsOwingEl) studentsOwingEl.textContent = `${studentsOwing} students`;

    // Collection Rate - based on total expected fees
    const totalExpected = allStudents.reduce((sum, student) => {
        const program = allPrograms.find(p => p.name === getCourseProgram(student.course));
        const programCost = program ? program.programCost : 67189;
        return sum + (programCost * (student.module || 1));
    }, 0);
    
    const collectionRate = totalExpected > 0 ? ((totalRevenue / totalExpected) * 100).toFixed(1) : 0;
    const collectionRateEl = document.getElementById('collection-rate');
    if (collectionRateEl) collectionRateEl.textContent = `${collectionRate}%`;
}

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
                        precision: 0
                    }
                }
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
            const paymentDate = new Date(p.date || p.createdAt);
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
                        callback: function(value) {
                            return 'KES ' + value.toLocaleString();
                        }
                    }
                }
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
                borderColor: '#fff'
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
        <div class="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition">
            <div class="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white">
                <i class="ri-user-add-line"></i>
            </div>
            <div class="flex-1">
                <p class="text-sm font-semibold text-gray-800">${escapeHtml(student.name)}</p>
                <p class="text-xs text-gray-500">New student registered • ${getTimeAgo(student.createdAt)}</p>
            </div>
        </div>
    `).join('');
}

function loadSystemAlerts() {
    const container = document.getElementById('system-alerts');
    if (!container) return;

    const alerts = [];

    // Check for students with high balance
    const highBalanceStudents = allStudents.filter(s => (s.balance || 0) > 100000).length;
    if (highBalanceStudents > 0) {
        alerts.push({
            type: 'critical',
            icon: 'ri-alert-line',
            message: `${highBalanceStudents} students have balance exceeding KES 100,000`,
            color: 'red'
        });
    }

    // Check for recent payments
    const todayPayments = allPayments.filter(p => {
        const paymentDate = new Date(p.paymentDate || p.createdAt);
        const today = new Date();
        return paymentDate.toDateString() === today.toDateString();
    }).length;
    
    if (todayPayments > 0) {
        alerts.push({
            type: 'info',
            icon: 'ri-money-dollar-circle-line',
            message: `${todayPayments} payment${todayPayments > 1 ? 's' : ''} received today`,
            color: 'green'
        });
    }

    // System status
    alerts.push({
        type: 'success',
        icon: 'ri-checkbox-circle-line',
        message: 'All systems operational',
        color: 'green'
    });

    container.innerHTML = alerts.map(alert => `
        <div class="flex items-start space-x-3 p-3 bg-${alert.color}-50 border border-${alert.color}-200 rounded-lg">
            <i class="${alert.icon} text-${alert.color}-600 text-xl mt-0.5"></i>
            <p class="text-sm text-${alert.color}-800">${alert.message}</p>
        </div>
    `).join('');
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
