// Admin Dashboard JavaScript

// API Base URL
const API_BASE_URL = 'http://localhost:5502/api';

// DOM Elements
let totalStudentsElement;
let totalTrainersElement;
let totalCoursesElement;
let totalRevenueElement;
let recentActivitiesTable;
let topStudentsTable;
let topUnitsTable;

// Charts
let enrollmentChart;
let performanceChart;
let courseDistributionChart;

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    totalStudentsElement = document.getElementById('total-students');
    totalTrainersElement = document.getElementById('total-trainers');
    totalCoursesElement = document.getElementById('total-courses');
    totalRevenueElement = document.getElementById('total-revenue');
    recentActivitiesTable = document.getElementById('recent-activities');
    topStudentsTable = document.getElementById('top-students');
    topUnitsTable = document.getElementById('top-units');

    // Mobile menu toggle
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const sidebar = document.querySelector('.sidebar');
    
    if (mobileMenuButton) {
        mobileMenuButton.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    }

    // Logout button
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', logout);
    }

    // Load dashboard data
    loadDashboardData();

    // Initialize charts
    initializeCharts();
});

// Load all dashboard data
async function loadDashboardData() {
    try {
        // Fetch counts and statistics
        const [students, trainers, units, payments] = await Promise.all([
            fetchStudents(),
            fetchTrainers(),
            fetchUnits(),
            fetchPayments()
        ]);

        // Update dashboard statistics
        updateDashboardStats(students, trainers, units, payments);

        // Load recent activities
        loadRecentActivities();

        // Load top performing students
        loadTopPerformingStudents();

        // Load unit performance data
        loadUnitPerformance();

        // Update charts with real data
        updateChartsWithRealData(students, units);
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showNotification('Failed to load dashboard data. Please try again later.', 'error');
    }
}

// Fetch students from API
async function fetchStudents() {
    try {
        const response = await fetch(`${API_BASE_URL}/students`);
        if (!response.ok) {
            throw new Error('Failed to fetch students');
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching students:', error);
        return [];
    }
}

// Fetch trainers from API
async function fetchTrainers() {
    try {
        const response = await fetch(`${API_BASE_URL}/trainers`);
        if (!response.ok) {
            throw new Error('Failed to fetch trainers');
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching trainers:', error);
        return [];
    }
}

// Fetch units from API
async function fetchUnits() {
    try {
        const response = await fetch(`${API_BASE_URL}/units`);
        if (!response.ok) {
            throw new Error('Failed to fetch units');
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching units:', error);
        return [];
    }
}

// Fetch payments from API
async function fetchPayments() {
    try {
        const response = await fetch(`${API_BASE_URL}/payments`);
        if (!response.ok) {
            throw new Error('Failed to fetch payments');
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching payments:', error);
        return [];
    }
}

// Fetch transcripts from API
async function fetchTranscripts() {
    try {
        const response = await fetch(`${API_BASE_URL}/transcripts`);
        if (!response.ok) {
            throw new Error('Failed to fetch transcripts');
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching transcripts:', error);
        return [];
    }
}

// Update dashboard statistics
function updateDashboardStats(students, trainers, units, payments) {
    // Update total students
    if (totalStudentsElement) {
        totalStudentsElement.textContent = students.length;
    }

    // Update total trainers
    if (totalTrainersElement) {
        totalTrainersElement.textContent = trainers.length;
    }

    // Count unique courses
    const uniqueCourses = new Set();
    units.forEach(unit => uniqueCourses.add(unit.course));

    // Update total courses
    if (totalCoursesElement) {
        totalCoursesElement.textContent = uniqueCourses.size;
    }

    // Calculate total revenue
    const totalRevenue = payments.reduce((sum, payment) => sum + payment.amount, 0);

    // Update total revenue
    if (totalRevenueElement) {
        totalRevenueElement.textContent = `KES ${totalRevenue.toLocaleString()}`;
    }
}

// Load recent activities
function loadRecentActivities() {
    if (!recentActivitiesTable) return;

    // Sample activities (in a real app, these would come from the API)
    const activities = [
        { activity: 'New student registered', user: 'John Doe', time: '10 minutes ago' },
        { activity: 'Grade updated', user: 'Mr. Dickson', time: '30 minutes ago' },
        { activity: 'Payment received', user: 'Jane Smith', time: '1 hour ago' },
        { activity: 'Course added', user: 'Admin', time: '3 hours ago' },
        { activity: 'Unit assigned', user: 'Mr. Terer', time: '5 hours ago' }
    ];

    recentActivitiesTable.innerHTML = '';
    
    activities.forEach(activity => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">${activity.activity}</td>
            <td class="px-6 py-4 whitespace-nowrap">${activity.user}</td>
            <td class="px-6 py-4 whitespace-nowrap">${activity.time}</td>
        `;
        recentActivitiesTable.appendChild(row);
    });
}

// Load top performing students
function loadTopPerformingStudents() {
    if (!topStudentsTable) return;

    // Sample top students (in a real app, these would come from the API)
    const topStudents = [
        { name: 'Alice Johnson', course: 'Science Laboratory Technology', grade: 'A' },
        { name: 'Bob Smith', course: 'Science Laboratory Technology', grade: 'A' },
        { name: 'Carol Williams', course: 'Science Laboratory Technology', grade: 'B' },
        { name: 'David Brown', course: 'Science Laboratory Technology', grade: 'B' },
        { name: 'Eve Davis', course: 'Science Laboratory Technology', grade: 'B' }
    ];

    topStudentsTable.innerHTML = '';
    
    topStudents.forEach(student => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">${student.name}</td>
            <td class="px-6 py-4 whitespace-nowrap">${student.course}</td>
            <td class="px-6 py-4 whitespace-nowrap">${student.grade}</td>
        `;
        topStudentsTable.appendChild(row);
    });
}

// Load unit performance data
function loadUnitPerformance() {
    if (!topUnitsTable) return;

    // Sample unit performance data (in a real app, these would come from the API)
    const unitPerformance = [
        { unit: 'BIO TECH', course: 'Science Laboratory Technology', score: '78%' },
        { unit: 'DIGITAL LITERACY', course: 'Science Laboratory Technology', score: '82%' },
        { unit: 'W.P ETHICS', course: 'Science Laboratory Technology', score: '75%' },
        { unit: 'ENTERPRENEURIAL SKILLS', course: 'Science Laboratory Technology', score: '80%' },
        { unit: 'LABORATORY PRACTICE', course: 'Science Laboratory Technology', score: '76%' }
    ];

    topUnitsTable.innerHTML = '';
    
    unitPerformance.forEach(unit => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">${unit.unit}</td>
            <td class="px-6 py-4 whitespace-nowrap">${unit.course}</td>
            <td class="px-6 py-4 whitespace-nowrap">${unit.score}</td>
        `;
        topUnitsTable.appendChild(row);
    });
}

// Initialize charts
function initializeCharts() {
    // Enrollment Trends Chart
    const enrollmentCtx = document.getElementById('enrollment-chart');
    if (enrollmentCtx) {
        enrollmentChart = new Chart(enrollmentCtx, {
            type: 'line',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                datasets: [{
                    label: 'Student Enrollment 2023',
                    data: [65, 70, 75, 80, 85, 90, 95, 100, 110, 115, 120, 125],
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Students'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Month'
                        }
                    }
                }
            }
        });
    }

    // Performance Overview Chart
    const performanceCtx = document.getElementById('performance-chart');
    if (performanceCtx) {
        performanceChart = new Chart(performanceCtx, {
            type: 'bar',
            data: {
                labels: ['A', 'B', 'C', 'D', 'F'],
                datasets: [{
                    label: 'Grade Distribution',
                    data: [30, 40, 20, 8, 2],
                    backgroundColor: [
                        'rgba(34, 197, 94, 0.7)',  // Green for A
                        'rgba(59, 130, 246, 0.7)', // Blue for B
                        'rgba(245, 158, 11, 0.7)', // Yellow for C
                        'rgba(249, 115, 22, 0.7)', // Orange for D
                        'rgba(239, 68, 68, 0.7)'   // Red for F
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Students'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Grade'
                        }
                    }
                }
            }
        });
    }

    // Course Distribution Chart
    const courseDistributionCtx = document.getElementById('course-distribution-chart');
    if (courseDistributionCtx) {
        courseDistributionChart = new Chart(courseDistributionCtx, {
            type: 'doughnut',
            data: {
                labels: ['Science Laboratory Technology'],
                datasets: [{
                    data: [100],
                    backgroundColor: [
                        'rgba(37, 99, 235, 0.7)',  // Blue
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                    }
                }
            }
        });
    }
}

// Update charts with real data
function updateChartsWithRealData(students, units) {
    // In a real application, this function would process the data
    // and update the charts with actual values from the database
    console.log('Updating charts with real data...');
}

// Show notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg ${type === 'error' ? 'bg-red-500' : 'bg-green-500'} text-white`;
    notification.textContent = message;
    
    // Add to document
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Logout function
function logout() {
    // Clear session storage
    sessionStorage.removeItem('adminData');
    
    // Redirect to login page
    window.location.href = '/src/login.html';
}