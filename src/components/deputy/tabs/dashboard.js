// tabs/dashboard.js — deputy dashboard: stat cards + charts.
// The chart functions already destroy() the prior Chart.js instance before
// re-creating, so revisiting is safe without a render-once guard.
window.DeputyTabs = window.DeputyTabs || {};

// Theme-aware chart colors (admin parity).
function admIsDark() { return document.documentElement.classList.contains('dark'); }
function admTick() { return admIsDark() ? '#CBD5E1' : '#475569'; }
function admGrid() { return admIsDark() ? 'rgba(148,163,184,0.15)' : 'rgba(100,116,139,0.12)'; }

// Greeting header: time-of-day.
function deputySetGreeting() {
    const h = new Date().getHours();
    const g = h < 12 ? 'Good morning' : (h < 17 ? 'Good afternoon' : 'Good evening');
    const gEl = document.getElementById('dash-greeting');
    if (gEl) gEl.textContent = g;
    // The welcome name lives in the dashboard partial (injected after bootstrap),
    // so populate it here from the sidebar name / auth user.
    const user = (window.AUTH && typeof window.AUTH.getUser === 'function') ? window.AUTH.getUser() : null;
    const name = (user && user.name) || (document.getElementById('userName') || {}).textContent || 'Deputy';
    const nEl = document.getElementById('welcomeName');
    if (nEl) nEl.textContent = name;
}

// (verbatim from the monolith inline scripts)
        // Load dashboard stats
        async function loadDashboardStats() {
            try {
                // Load students count. /students now returns the paginated
                // envelope { students, total, ... }; we only need the total
                // here, so request the cheapest possible page.
                const studentsResponse = await window.AUTH.fetch(`${API_BASE_URL}/students?page=1&limit=1`);
                if (studentsResponse.ok) {
                    const body = await studentsResponse.json();
                    const total = body && body.total != null ? body.total : (Array.isArray(body) ? body.length : (body.students || []).length);
                    document.getElementById('totalStudents').textContent = total;
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

                // Load departments count from the shared catalog (Rule 7).
                const departmentCount = window.Catalog ? window.Catalog.getDepartments().length : 0;
                document.getElementById('totalDepartments').textContent = departmentCount;

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
                // Students by Department Chart — needs the full set so we
                // ask for ?all=1 explicitly.
                const studentsResponse = await window.AUTH.fetch(`${API_BASE_URL}/students?all=1`);
                if (studentsResponse.ok) {
                    const body = await studentsResponse.json();
                    const students = Array.isArray(body) ? body : (Array.isArray(body.students) ? body.students : []);
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

                        // Sort departments by headcount (descending) — a horizontal
                        // bar reads far better than a doughnut for long labels and
                        // needs no legend (admin createDepartmentChart approach).
                        const fmt = (window.formatDepartmentName)
                            ? window.formatDepartmentName
                            : (window.Catalog ? (c) => window.Catalog.departmentName(c) : (c) => c);
                        const pairs = Object.entries(studentsByDept)
                            .map(([k, v]) => ({ label: fmt(k) || k, value: v }))
                            .sort((a, b) => b.value - a.value);
                        const labels = pairs.map(p => p.label);
                        const data = pairs.map(p => p.value);
                        const total = data.reduce((a, b) => a + b, 0) || 1;

                        // Maroon→gold horizontal gradient so the bars carry the brand.
                        const c = ctx1.getContext('2d');
                        const grad = c.createLinearGradient(0, 0, ctx1.width || 360, 0);
                        grad.addColorStop(0, '#7A0C0C');
                        grad.addColorStop(1, '#D4A017');

                        window.studentsChart = new Chart(ctx1, {
                            type: 'bar',
                            data: {
                                labels: labels,
                                datasets: [{
                                    data: data,
                                    backgroundColor: grad,
                                    borderRadius: 6,
                                    borderSkipped: false,
                                    barThickness: 'flex',
                                    maxBarThickness: 26,
                                }]
                            },
                            options: {
                                indexAxis: 'y',
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: { display: false },
                                    tooltip: {
                                        callbacks: {
                                            label: function (context) {
                                                const value = context.parsed.x || 0;
                                                const pct = ((value / total) * 100).toFixed(1);
                                                return `${value} student${value === 1 ? '' : 's'} (${pct}%)`;
                                            }
                                        }
                                    }
                                },
                                scales: {
                                    x: { beginAtZero: true, ticks: { precision: 0, color: admTick() }, grid: { color: admGrid() } },
                                    y: { ticks: { color: admTick(), font: { size: 12 } }, grid: { display: false } }
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
                                labels: Object.keys(statusCounts).map(s => s.replace('_', ' ')),
                                datasets: [{
                                    label: 'Tools',
                                    data: Object.values(statusCounts),
                                    backgroundColor: '#7A0C0C',
                                    borderRadius: 6,
                                    borderSkipped: false,
                                    maxBarThickness: 48,
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
                                    y: { beginAtZero: true, ticks: { precision: 0, color: admTick() }, grid: { color: admGrid() } },
                                    x: { ticks: { color: admTick() }, grid: { display: false } }
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
    init() { deputySetGreeting(); loadDashboardStats(); }
};
