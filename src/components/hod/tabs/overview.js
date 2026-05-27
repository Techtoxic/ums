// tabs/overview.js — HOD overview: department stats + student stats.
window.HODTabs = window.HODTabs || {};

// (verbatim from hodDashboard.js)
// Update stats display
function updateStatsDisplay() {
    const totalCourses = coursesData.length || 0;
    const totalUnits = unitsData.length || 0;
    const totalTrainers = trainersData.length || 0;
    const assignedUnits = assignmentsData.length || 0;
    
    // Update main stats
    const totalCoursesEl = document.getElementById('totalCourses');
    const totalUnitsEl = document.getElementById('totalUnits');
    const totalTrainersEl = document.getElementById('totalTrainers');
    const assignedUnitsEl = document.getElementById('assignedUnits');
    
    if (totalCoursesEl) totalCoursesEl.textContent = totalCourses;
    if (totalUnitsEl) totalUnitsEl.textContent = totalUnits;
    if (totalTrainersEl) totalTrainersEl.textContent = totalTrainers;
    if (assignedUnitsEl) assignedUnitsEl.textContent = assignedUnits;
    
    // Update welcome card trainer count
    const welcomeTrainersCount = document.getElementById('welcomeTrainersCount');
    if (welcomeTrainersCount) welcomeTrainersCount.textContent = totalTrainers;
    
    // Update overview stats (if elements exist)
    const assignmentRate = totalUnits > 0 ? Math.round((assignedUnits / totalUnits) * 100) : 0;
    const assignmentRateEl = document.getElementById('assignmentRate');
    const assignmentProgressEl = document.getElementById('assignmentProgress');
    const activeTrainersEl = document.getElementById('activeTrainers');
    
    if (assignmentRateEl) assignmentRateEl.textContent = `${assignmentRate}%`;
    if (assignmentProgressEl) assignmentProgressEl.style.width = `${assignmentRate}%`;
    if (activeTrainersEl) {
        // Count unique trainers who have at least one unit assignment.
        // V2 doesn't decorate each trainer with assignedUnits; derive from assignmentsData instead.
        const activeIds = new Set(assignmentsData.map(a => a.trainerId && a.trainerId._id).filter(Boolean));
        activeTrainersEl.textContent = activeIds.size;
    }
    
    console.log('Stats updated:', { totalCourses, totalUnits, totalTrainers, assignedUnits });
}

// Update students statistics
function updateStudentsStats(data) {
    const totalStudents = data.totalStudents || 0;
    const totalCourses = data.totalCourses || 0;
    
    // Update total students count in overview
    const totalStudentsElement = document.getElementById('totalStudents');
    if (totalStudentsElement) {
        totalStudentsElement.textContent = totalStudents;
    }
    
    // Update students per course average
    const avgStudentsPerCourse = totalCourses > 0 ? Math.round(totalStudents / totalCourses) : 0;
    const avgStudentsElement = document.getElementById('avgStudentsPerCourse');
    if (avgStudentsElement) {
        avgStudentsElement.textContent = avgStudentsPerCourse;
    }
    
    // Update department student stats in overview cards
    const departmentStudentsElement = document.getElementById('departmentStudents');
    if (departmentStudentsElement) {
        departmentStudentsElement.textContent = totalStudents;
    }
    
    console.log(`Updated students stats: ${totalStudents} students across ${totalCourses} courses`);
}

window.HODTabs.overview = {
    init() {
        updateHODInfo();        // fill the welcome card now that the partial exists
        updateStatsDisplay();   // render stats from the globals loaded at bootstrap
        loadStudents();         // fetch + render student stats
    }
};
