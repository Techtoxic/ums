// tabs/dashboard.js — deputy dashboard: stat cards + charts.
// The chart functions already destroy() the prior Chart.js instance before
// re-creating, so revisiting is safe without a render-once guard.
window.DeputyTabs = window.DeputyTabs || {};

// (verbatim from the monolith inline scripts)
        // Load dashboard stats
        async function loadDashboardStats() {
            try {
                // Load students count
                const studentsResponse = await window.AUTH.fetch(`${API_BASE_URL}/students`);
                if (studentsResponse.ok) {
                    const students = await studentsResponse.json();
                    document.getElementById('totalStudents').textContent = students.length;
                }

                // Load trainers count
                const trainersResponse = await window.AUTH.fetch(`${API_BASE_URL}/trainers/all-departments`);
                if (trainersResponse.ok) {
                    const data = await trainersResponse.json();
                    const trainers = data.trainers || [];
                    document.getElementById('totalTrainers').textContent = trainers.length;
                }

                // Load courses count
                const coursesResponse = await window.AUTH.fetch(`${API_BASE_URL}/courses`);
                if (coursesResponse.ok) {
                    const courses = await coursesResponse.json();
                    document.getElementById('totalCourses').textContent = courses.length;
                }

                // Load units count
                const unitsResponse = await window.AUTH.fetch(`${API_BASE_URL}/units`);
                if (unitsResponse.ok) {
                    const data = await unitsResponse.json();
                    const totalUnits = data.pagination?.totalUnits || data.units?.length || 0;
                    document.getElementById('totalUnits').textContent = totalUnits;
                }

                // Load tools count
                const toolsResponse = await window.AUTH.fetch(`${API_BASE_URL}/tools`);
                if (toolsResponse.ok) {
                    const tools = await toolsResponse.json();
                    console.log('Tools loaded for dashboard:', tools);
                    document.getElementById('totalTools').textContent = tools.length;
                    
                    // Count pending tools
                    const pendingTools = tools.filter(tool => tool.status === 'submitted');
                    console.log('Pending tools:', pendingTools);
                    console.log('Pending tools count:', pendingTools.length);
                    document.getElementById('pendingTools').textContent = pendingTools.length;
                }

                // Load departments count
                const departments = ['applied_science', 'agriculture', 'building_civil', 'electromechanical', 'hospitality', 'business_liberal', 'computing_informatics'];
                document.getElementById('totalDepartments').textContent = departments.length;

                // Load notifications count
                const notificationsResponse = await window.AUTH.fetch(`${API_BASE_URL}/notifications`);
                if (notificationsResponse.ok) {
                    const notifications = await notificationsResponse.json();
                    document.getElementById('totalNotifications').textContent = notifications.length;
                }

                // Load charts
                await loadCharts();
            } catch (error) {
                console.error('Error loading dashboard stats:', error);
            }
        }

        // Load charts
        async function loadCharts() {
            try {
                // Students by Department Chart
                const studentsResponse = await window.AUTH.fetch(`${API_BASE_URL}/students`);
                if (studentsResponse.ok) {
                    const students = await studentsResponse.json();
                    const studentsByDept = {};
                    students.forEach(student => {
                        const dept = student.department || 'unknown';
                        studentsByDept[dept] = (studentsByDept[dept] || 0) + 1;
                    });
                    
                    const ctx1 = document.getElementById('studentsByDeptChart');
                    if (ctx1 && typeof Chart !== 'undefined') {
                        // Clear any existing chart
                        if (window.studentsChart) {
                            window.studentsChart.destroy();
                        }
                        
                        window.studentsChart = new Chart(ctx1, {
                            type: 'doughnut',
                            data: {
                                labels: Object.keys(studentsByDept),
                                datasets: [{
                                    data: Object.values(studentsByDept),
                                    backgroundColor: [
                                        '#7A0C0C',
                                        '#8B2A2A',
                                        '#10b981',
                                        '#f59e0b',
                                        '#ef4444',
                                        '#6366f1',
                                        '#8b5cf6'
                                    ]
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: {
                                        position: 'bottom'
                                    }
                                }
                            }
                        });
                    }
                }

                // Tools Status Chart
                const toolsResponse = await window.AUTH.fetch(`${API_BASE_URL}/tools`);
                if (toolsResponse.ok) {
                    const tools = await toolsResponse.json();
                    const statusCounts = {};
                    tools.forEach(tool => {
                        const status = tool.status || 'unknown';
                        statusCounts[status] = (statusCounts[status] || 0) + 1;
                    });
                    
                    const ctx2 = document.getElementById('toolsStatusChart');
                    if (ctx2 && typeof Chart !== 'undefined') {
                        // Clear any existing chart
                        if (window.toolsChart) {
                            window.toolsChart.destroy();
                        }
                        
                        window.toolsChart = new Chart(ctx2, {
                            type: 'bar',
                            data: {
                                labels: Object.keys(statusCounts),
                                datasets: [{
                                    label: 'Tools',
                                    data: Object.values(statusCounts),
                                    backgroundColor: '#7A0C0C'
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: {
                                        display: false
                                    }
                                },
                                scales: {
                                    y: {
                                        beginAtZero: true
                                    }
                                }
                            }
                        });
                    }
                }
            } catch (error) {
                console.error('Error loading charts:', error);
                // Show error message in chart containers
                const studentsChartDiv = document.getElementById('studentsByDeptChart').parentElement;
                const toolsChartDiv = document.getElementById('toolsStatusChart').parentElement;
                
                if (studentsChartDiv) {
                    studentsChartDiv.innerHTML = '<div class="flex items-center justify-center h-full text-red-500">Error loading chart</div>';
                }
                if (toolsChartDiv) {
                    toolsChartDiv.innerHTML = '<div class="flex items-center justify-center h-full text-red-500">Error loading chart</div>';
                }
            }
        }

window.DeputyTabs.dashboard = {
    init() { loadDashboardStats(); }
};
