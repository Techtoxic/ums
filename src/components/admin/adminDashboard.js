// Admin Dashboard JavaScript
// Emurua Dikirr Technical Training Institute

// Use global config or fallback to same host
const API_BASE = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : `${window.location.protocol}//${window.location.host}/api`;

// State
let allStudents = [];
let allTrainers = [];
let allPayments = [];
let allPrograms = [];
let viewMode = 'list';

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    const adminData = sessionStorage.getItem('adminData');
    if (!adminData) {
        window.location.href = '/admin/login';
        return;
    }

    // Set admin name
    const admin = JSON.parse(adminData);
    const adminNameEl = document.getElementById('admin-name');
    if (adminNameEl) adminNameEl.textContent = admin.name || 'Administrator';

    // Initialize dashboard
    initializeDashboard();

    // Setup search shortcut (Ctrl+K)
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('global-search').focus();
        }
    });

    // Setup global search
    document.getElementById('global-search').addEventListener('input', handleGlobalSearch);
});

async function initializeDashboard() {
    try {
        showToast('Loading dashboard data...', 'info');
        
        // Load all data in parallel
        await Promise.all([
            loadStudents(),
            loadTrainers(),
            loadPayments(),
            loadPrograms()
        ]);

        // Calculate and display metrics
        calculateDashboardMetrics();
        
        // Create charts
        createEnrollmentChart();
        createRevenueChart();
        createDepartmentChart();
        
        // Load recent activity
        loadRecentActivity();
        loadSystemAlerts();

        showToast('Dashboard loaded successfully!', 'success');
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showToast('Error loading dashboard data', 'error');
    }
}

// ========================================
// DATA LOADING FUNCTIONS
// ========================================

async function loadStudents() {
    try {
        const response = await fetch(`${API_BASE}/students`);
        if (!response.ok) throw new Error('Failed to load students');
        
        allStudents = await response.json();
        console.log(`Loaded ${allStudents.length} students`);
        return allStudents;
    } catch (error) {
        console.error('Error loading students:', error);
        allStudents = [];
        throw error;
    }
}

async function loadTrainers() {
    try {
        const response = await fetch(`${API_BASE}/trainers/all-departments`);
        if (!response.ok) throw new Error('Failed to load trainers');
        
        const data = await response.json();
        allTrainers = data.trainers || [];
        console.log(`Loaded ${allTrainers.length} trainers`);
        return allTrainers;
    } catch (error) {
        console.error('Error loading trainers:', error);
        allTrainers = [];
        throw error;
    }
}

async function loadPayments() {
    try {
        const response = await fetch(`${API_BASE}/payments`);
        if (!response.ok) throw new Error('Failed to load payments');
        
        allPayments = await response.json();
        console.log(`Loaded ${allPayments.length} payments`);
        return allPayments;
    } catch (error) {
        console.error('Error loading payments:', error);
        allPayments = [];
        throw error;
    }
}

async function loadPrograms() {
    try {
        const response = await fetch(`${API_BASE}/programs`);
        if (!response.ok) throw new Error('Failed to load programs');
        
        allPrograms = await response.json();
        console.log(`Loaded ${allPrograms.length} programs`);
        return allPrograms;
    } catch (error) {
        console.error('Error loading programs:', error);
        allPrograms = [];
        throw error;
    }
}

// ========================================
// DASHBOARD METRICS
// ========================================

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
    const totalRevenue = allPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
    
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
        const program = allPrograms.find(p => p.programName === getCourseProgram(student.course));
        const programCost = program ? program.programCost : 67189;
        const totalFees = programCost * (student.year || 1);
        const studentPayments = allPayments.filter(p => p.studentId === student.admissionNumber);
        const totalPaid = studentPayments.reduce((pSum, p) => pSum + (p.amount || 0), 0);
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
        const program = allPrograms.find(p => p.programName === getCourseProgram(s.course));
        const programCost = program ? program.programCost : 67189;
        const totalFees = programCost * (s.year || 1);
        const studentPayments = allPayments.filter(p => p.studentId === s.admissionNumber);
        const totalPaid = studentPayments.reduce((pSum, p) => pSum + (p.amount || 0), 0);
        return (totalFees - totalPaid) > 0;
    }).length;
    const studentsOwingEl = document.getElementById('students-owing-count');
    if (studentsOwingEl) studentsOwingEl.textContent = `${studentsOwing} students`;

    // Collection Rate - based on total expected fees
    const totalExpected = allStudents.reduce((sum, student) => {
        const program = allPrograms.find(p => p.programName === getCourseProgram(student.course));
        const programCost = program ? program.programCost : 67189;
        return sum + (programCost * (student.year || 1));
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
        }).reduce((sum, p) => sum + (p.amount || 0), 0);
        
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

// ========================================
// DARK MODE
// ========================================

function toggleDarkMode() {
    console.log('🌙 toggleDarkMode() called!');
    const html = document.documentElement;
    const icon = document.getElementById('dark-mode-icon');
    
    console.log('Current dark mode state:', html.classList.contains('dark'));
    console.log('Icon element found:', !!icon);
    
    if (html.classList.contains('dark')) {
        html.classList.remove('dark');
        localStorage.setItem('darkMode', 'false');
        if (icon) icon.className = 'ri-moon-line text-2xl';
        console.log('✅ Dark mode DISABLED - removed "dark" class');
    } else {
        html.classList.add('dark');
        localStorage.setItem('darkMode', 'true');
        if (icon) icon.className = 'ri-sun-line text-2xl';
        console.log('✅ Dark mode ENABLED - added "dark" class');
    }
    
    // Double-check the class is there
    console.log('HTML classes after toggle:', html.className);
    console.log('Has dark class:', html.classList.contains('dark'));
}

// Initialize dark mode from localStorage
function initDarkMode() {
    const darkMode = localStorage.getItem('darkMode');
    const icon = document.getElementById('dark-mode-icon');
    
    if (darkMode === 'true') {
        document.documentElement.classList.add('dark');
        if (icon) icon.className = 'ri-sun-line text-2xl';
    }
}

// Call on page load
document.addEventListener('DOMContentLoaded', initDarkMode);

// ========================================
// RECENT ACTIVITY & ALERTS
// ========================================

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
                <p class="text-sm font-semibold text-gray-800">${student.name}</p>
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

// ========================================
// NAVIGATION & UI
// ========================================

function showSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });

    // Show selected section
    const section = document.getElementById(`${sectionName}-section`);
    if (section) {
        section.classList.add('active');
    }

    // Update nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active', 'bg-primary', 'text-white');
        link.classList.add('text-gray-700');
    });

    const activeLink = document.querySelector(`.nav-link[data-section="${sectionName}"]`);
    if (activeLink) {
        activeLink.classList.add('active', 'bg-primary', 'text-white');
        activeLink.classList.remove('text-gray-700');
    }

    // Load section data
    loadSectionData(sectionName);

    // Close sidebar on mobile
    if (window.innerWidth < 1024) {
        toggleSidebar();
    }
}

async function loadSectionData(sectionName) {
    switch(sectionName) {
        case 'students':
            await displayStudents();
            break;
        case 'trainers':
            await displayTrainers();
            break;
        case 'financial':
            await displayFinancial();
            break;
        case 'programs':
            await displayPrograms();
            break;
        case 'reports':
            displayReports();
            break;
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    sidebar.classList.toggle('-translate-x-full');
    overlay.classList.toggle('hidden');
}

function toggleProfileMenu() {
    const menu = document.getElementById('profile-menu');
    menu.classList.toggle('hidden');
}

// Close profile menu when clicking outside
document.addEventListener('click', function(e) {
    const menu = document.getElementById('profile-menu');
    const button = menu?.previousElementSibling;
    
    if (menu && !menu.contains(e.target) && !button?.contains(e.target)) {
        menu.classList.add('hidden');
    }
});

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        sessionStorage.removeItem('adminData');
        window.location.href = '/admin/login';
    }
}

// ========================================
// STUDENTS MODULE
// ========================================

async function displayStudents() {
    const container = document.getElementById('students-table');
    if (!container) {
        console.error('students-table container not found');
        return;
    }

    try {
        // Ensure students are loaded
        if (allStudents.length === 0) {
            await loadStudents();
        }

        // Calculate balance for each student
        const studentsWithBalance = allStudents.map(student => {
            const program = allPrograms.find(p => p.programName === getCourseProgram(student.course));
            const programCost = program ? program.programCost : 67189;
            const totalFees = programCost * (student.year || 1);
            const studentPayments = allPayments.filter(p => p.studentId === student.admissionNumber);
            const totalPaid = studentPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
            const balance = totalFees - totalPaid;
            return { ...student, balance };
        });

        // Create table
        container.innerHTML = `
            <table class="w-full">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Admission No.</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Name</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Course</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Year</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Balance</th>
                        <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    ${studentsWithBalance.map(student => `
                        <tr class="hover:bg-gray-50 transition">
                            <td class="px-4 py-3 text-sm font-medium text-gray-900">${student.admissionNumber || 'N/A'}</td>
                            <td class="px-4 py-3">
                                <div>
                                    <p class="text-sm font-semibold text-gray-900">${student.name}</p>
                                    <p class="text-xs text-gray-500">${student.phoneNumber || ''}</p>
                                </div>
                            </td>
                            <td class="px-4 py-3 text-sm text-gray-600">${formatCourseName(student.course)}</td>
                            <td class="px-4 py-3">
                                <span class="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">Year ${student.year || 1}</span>
                            </td>
                            <td class="px-4 py-3 text-sm font-semibold ${student.balance > 0 ? 'text-red-600' : 'text-green-600'}">
                                ${formatCurrency(student.balance)}
                            </td>
                            <td class="px-4 py-3">
                                <button onclick="viewStudent('${student._id}')" class="text-primary hover:text-secondary transition">
                                    <i class="ri-eye-line text-lg"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

    } catch (error) {
        console.error('Error displaying students:', error);
        container.innerHTML = '<p class="text-red-600 text-center py-8">Error loading students: ' + error.message + '</p>';
    }
}

function viewStudent(studentId) {
    const student = allStudents.find(s => s._id === studentId);
    if (!student) return;

    // For now, show an alert with student info
    // In production, this would open a detailed modal
    alert(`Student Details:\n\nName: ${student.name}\nAdmission: ${student.admissionNumber}\nCourse: ${formatCourseName(student.course)}\nYear: ${student.year}\nBalance: ${formatCurrency(student.balance || 0)}`);
}

// ========================================
// TRAINERS MODULE
// ========================================

async function displayTrainers() {
    const container = document.getElementById('trainers-list');
    if (!container) {
        console.error('trainers-list container not found');
        return;
    }

    try {
        if (allTrainers.length === 0) {
            await loadTrainers();
        }

        // Filter only active trainers
        const activeTrainers = allTrainers.filter(t => t.isActive !== false);

        container.innerHTML = activeTrainers.map(trainer => `
            <div class="border rounded-lg p-4 hover:shadow-lg transition">
                <div class="flex items-center space-x-3 mb-3">
                    <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                        <i class="ri-user-line text-2xl text-green-600"></i>
                    </div>
                    <div>
                        <h4 class="font-semibold text-gray-800">${trainer.name}</h4>
                        <p class="text-xs text-gray-500">${trainer.email}</p>
                    </div>
                </div>
                <div class="space-y-2 text-sm">
                    <p class="text-gray-600">
                        <i class="ri-building-line mr-2"></i>${formatDepartmentName(trainer.department)}
                    </p>
                    ${trainer.specialization ? `<p class="text-gray-600"><i class="ri-star-line mr-2"></i>${trainer.specialization}</p>` : ''}
                    <span class="inline-block px-2 py-1 ${trainer.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} text-xs rounded-full">
                        ${trainer.isActive ? 'Active' : 'Inactive'}
                    </span>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error displaying trainers:', error);
        container.innerHTML = '<p class="text-red-600 text-center py-8">Error loading trainers: ' + error.message + '</p>';
    }
}

// ========================================
// FINANCIAL MODULE
// ========================================

async function displayFinancial() {
    const container = document.getElementById('financial-content');
    if (!container) {
        console.error('financial-content container not found');
        return;
    }

    try {
        // Calculate financial metrics with proper balance calculation
        const totalRevenue = allPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        
        const totalOutstanding = allStudents.reduce((sum, student) => {
            const program = allPrograms.find(p => p.programName === getCourseProgram(student.course));
            const programCost = program ? program.programCost : 67189;
            const totalFees = programCost * (student.year || 1);
            const studentPayments = allPayments.filter(p => p.studentId === student.admissionNumber);
            const totalPaid = studentPayments.reduce((pSum, p) => pSum + (p.amount || 0), 0);
            const balance = totalFees - totalPaid;
            return sum + (balance > 0 ? balance : 0);
        }, 0);

        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div class="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-6 border border-green-200">
                    <div class="flex items-center justify-between mb-4">
                        <h4 class="text-lg font-bold text-green-800">Total Revenue</h4>
                        <i class="ri-money-dollar-circle-line text-3xl text-green-600"></i>
                    </div>
                    <p class="text-3xl font-bold text-green-600">${formatCurrency(totalRevenue)}</p>
                    <p class="text-sm text-green-700 mt-2">${allPayments.length} transactions</p>
                </div>
                
                <div class="bg-gradient-to-br from-red-50 to-orange-50 rounded-lg p-6 border border-red-200">
                    <div class="flex items-center justify-between mb-4">
                        <h4 class="text-lg font-bold text-red-800">Outstanding Fees</h4>
                        <i class="ri-alert-line text-3xl text-red-600"></i>
                    </div>
                    <p class="text-3xl font-bold text-red-600">${formatCurrency(totalOutstanding)}</p>
                    <p class="text-sm text-red-700 mt-2">${allStudents.filter(s => {
                        const program = allPrograms.find(p => p.programName === getCourseProgram(s.course));
                        const programCost = program ? program.programCost : 67189;
                        const totalFees = programCost * (s.year || 1);
                        const studentPayments = allPayments.filter(p => p.studentId === s.admissionNumber);
                        const totalPaid = studentPayments.reduce((pSum, p) => pSum + (p.amount || 0), 0);
                        return (totalFees - totalPaid) > 0;
                    }).length} students owing</p>
                </div>
            </div>

            <h3 class="text-lg font-bold text-gray-800 mb-4">Recent Payments</h3>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600">Date</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600">Student</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600">Amount</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600">Reference</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200">
                        ${allPayments.slice(0, 10).map(payment => `
                            <tr class="hover:bg-gray-50">
                                <td class="px-4 py-3 text-sm text-gray-600">${new Date(payment.paymentDate || payment.createdAt).toLocaleDateString()}</td>
                                <td class="px-4 py-3 text-sm font-medium text-gray-900">${payment.studentId}</td>
                                <td class="px-4 py-3 text-sm font-semibold text-green-600">${formatCurrency(payment.amount)}</td>
                                <td class="px-4 py-3 text-sm text-gray-600">${payment.referenceNumber || 'N/A'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Error displaying financial data:', error);
        container.innerHTML = '<p class="text-red-600 text-center py-8">Error loading financial data: ' + error.message + '</p>';
    }
}

// ========================================
// PROGRAMS MODULE
// ========================================

async function displayPrograms() {
    const container = document.getElementById('programs-list');
    if (!container) {
        console.error('programs-list container not found');
        return;
    }

    try {
        if (allPrograms.length === 0) {
            await loadPrograms();
        }

        container.innerHTML = `
            <div class="flex items-center justify-between mb-6">
                <h3 class="text-lg font-bold text-gray-800">All Programs (${allPrograms.length})</h3>
                <button class="bg-primary text-white px-4 py-2 rounded-lg hover:bg-secondary transition">
                    <i class="ri-add-line mr-2"></i>Add Program
                </button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${allPrograms.map(program => `
                    <div class="border rounded-lg p-4 hover:shadow-lg transition">
                        <h4 class="font-bold text-gray-800 mb-2">${program.programName}</h4>
                        <p class="text-sm text-gray-600 mb-3">${formatDepartmentName(program.department)}</p>
                        <div class="flex items-center justify-between">
                            <span class="text-lg font-bold text-primary">${formatCurrency(program.programCost)}</span>
                            <span class="text-xs text-gray-500">per year</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Error displaying programs:', error);
        container.innerHTML = '<p class="text-red-600 text-center py-8">Error loading programs</p>';
    }
}

// ========================================
// REPORTS MODULE
// ========================================

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

// ========================================
// UTILITY FUNCTIONS
// ========================================

function formatCurrency(amount) {
    return `KES ${(amount || 0).toLocaleString()}`;
}

function formatDepartmentName(code) {
    const names = {
        'applied_science': 'Applied Science',
        'agriculture': 'Agriculture',
        'building_civil': 'Building & Civil',
        'electromechanical': 'Electromechanical',
        'hospitality': 'Hospitality',
        'business_liberal': 'Business & Liberal',
        'computing_informatics': 'Computing & Informatics'
    };
    return names[code] || code;
}

function formatCourseName(courseCode) {
    if (!courseCode) return 'N/A';
    return courseCode.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

function getCourseProgram(courseCode) {
    const mapping = {
        'applied_biology_6': 'Applied Biology Level 6',
        'analytical_chemistry_6': 'Analytical Chemistry Level 6',
        'science_lab_technology_5': 'Science Lab Technology Level 5',
        // Add more mappings as needed
    };
    return mapping[courseCode] || 'Unknown Program';
}

function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500',
        warning: 'bg-yellow-500'
    };

    const icons = {
        success: 'ri-checkbox-circle-line',
        error: 'ri-error-warning-line',
        info: 'ri-information-line',
        warning: 'ri-alert-line'
    };

    const toast = document.createElement('div');
    toast.className = `${colors[type]} text-white px-6 py-4 rounded-lg shadow-xl flex items-center space-x-3 transform transition-all duration-300`;
    toast.innerHTML = `
        <i class="${icons[type]} text-2xl"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function handleGlobalSearch(e) {
    const query = e.target.value.toLowerCase();
    if (query.length < 2) return;

    // Search students
    const studentResults = allStudents.filter(s => 
        s.name.toLowerCase().includes(query) ||
        (s.admissionNumber && s.admissionNumber.toLowerCase().includes(query))
    );

    console.log(`Found ${studentResults.length} students matching "${query}"`);
    // In production, show search results in a dropdown
}

function exportStudents() {
    showToast('Exporting students to Excel...', 'info');
    // In production, this would generate and download Excel file
    setTimeout(() => {
        showToast('Export complete!', 'success');
    }, 2000);
}

function openAddStudentModal() {
    alert('Add Student functionality coming soon!\n\nThis will open a form to register new students with admission letter generation.');
}

// ========================================
// ADD TRAINER MODAL
// ========================================

function openAddTrainerModal() {
    const modal = document.createElement('div');
    modal.id = 'add-trainer-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div class="bg-primary p-6">
                <div class="flex items-center justify-between">
                    <h2 class="text-2xl font-bold text-white">Add New Trainer</h2>
                    <button onclick="closeAddTrainerModal()" class="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-full transition">
                        <i class="ri-close-line text-2xl"></i>
                    </button>
                </div>
            </div>
            
            <form id="add-trainer-form" class="p-6 space-y-4">
                <!-- Name -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Full Name *
                    </label>
                    <input 
                        type="text" 
                        name="name" 
                        required
                        placeholder="e.g., Madam Nelly Chepkwony"
                        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                </div>

                <!-- Email -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Email Address *
                    </label>
                    <input 
                        type="email" 
                        name="email" 
                        required
                        placeholder="e.g., nelly.chepkwony@ace.ac.ke"
                        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                </div>

                <!-- Phone -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Phone Number
                    </label>
                    <input 
                        type="tel" 
                        name="phone" 
                        placeholder="e.g., 0712345678"
                        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                </div>

                <!-- Department -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Department *
                    </label>
                    <select 
                        name="department" 
                        required
                        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                        <option value="">Select Department</option>
                        <option value="applied_science">Applied Science</option>
                        <option value="agriculture">Agriculture</option>
                        <option value="building_civil">Building & Civil Engineering</option>
                        <option value="electromechanical">Electromechanical Engineering</option>
                        <option value="hospitality">Hospitality</option>
                        <option value="business_liberal">Business & Liberal Studies</option>
                        <option value="computing_informatics">Computing & Informatics</option>
                    </select>
                </div>

                <!-- Specialization -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Specialization
                    </label>
                    <input 
                        type="text" 
                        name="specialization" 
                        placeholder="e.g., Chemistry, Mathematics"
                        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                </div>

                <!-- Qualifications -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Qualifications
                    </label>
                    <textarea 
                        name="qualifications" 
                        rows="3"
                        placeholder="e.g., MSc Chemistry, BSc Education"
                        class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    ></textarea>
                </div>

                <!-- Password -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Default Password
                    </label>
                    <input 
                        type="text" 
                        name="password" 
                        value="trainer123"
                        readonly
                        class="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100"
                    >
                    <p class="text-xs text-gray-500 mt-1">Default password: trainer123 (can be changed after first login)</p>
                </div>

                <!-- Buttons -->
                <div class="flex items-center justify-end space-x-3 pt-4 border-t">
                    <button 
                        type="button"
                        onclick="closeAddTrainerModal()"
                        class="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit"
                        class="px-6 py-2 bg-primary text-white rounded-lg hover:bg-secondary transition"
                    >
                        <i class="ri-save-line mr-2"></i>Add Trainer
                    </button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

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
        
        const response = await fetch(`${API_BASE}/trainers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

// ========================================
// MAKE FUNCTIONS GLOBALLY AVAILABLE
// ========================================

window.showSection = showSection;
window.toggleSidebar = toggleSidebar;
window.toggleProfileMenu = toggleProfileMenu;
window.toggleDarkMode = toggleDarkMode;
window.logout = logout;
window.openAddTrainerModal = openAddTrainerModal;
window.closeAddTrainerModal = closeAddTrainerModal;
window.handleAddTrainer = handleAddTrainer;
window.openAddStudentModal = openAddStudentModal;
window.exportStudents = exportStudents;