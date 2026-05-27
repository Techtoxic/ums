// tabs/dashboard.js — trainer dashboard: welcome tiles + assignment/student stats.
window.TrainerTabs = window.TrainerTabs || {};

// (verbatim from trainerDashboard.js)
// Load dashboard data
async function loadDashboardData() {
    try {
        console.log('📊 Loading dashboard data...');
        
        // Load assignments and students in parallel
        await Promise.all([
            loadAssignments(),
            loadStudents()
        ]);
        
        console.log('✅ Dashboard data loaded successfully');
        
    } catch (error) {
        console.error('❌ Error loading dashboard data:', error);
        showToast('Error loading some data', 'error');
    }
}

// updateStats — adapted from the monolith with null guards. Its targets live in
// the dashboard partial, but it is invoked from loadAssignments()/loadStudents()
// (which run on the assignments/students tabs, where those tiles are not in the
// DOM under lazy partials). Output is identical when the dashboard pane is present.
function updateStats() {
    const unitsCount = assignmentsData.length;
    const elAssignments = document.getElementById('statsAssignments');
    if (elAssignments) elAssignments.textContent = unitsCount;
    const elWelcomeUnits = document.getElementById('welcomeUnitsCount');
    if (elWelcomeUnits) elWelcomeUnits.textContent = unitsCount;
    const elStudents = document.getElementById('statsStudents');
    if (elStudents) elStudents.textContent = studentsData.length;
    const uniqueCourses = new Set(assignmentsData.map(a => a.courseCode));
    const elCourses = document.getElementById('statsCourses');
    if (elCourses) elCourses.textContent = uniqueCourses.size;
}

window.TrainerTabs.dashboard = {
    init() {
        updateTrainerInfo();   // fill welcome/stats identity now the partial exists
        loadDashboardData();   // loads assignments + students -> updateStats fills tiles
    }
};
