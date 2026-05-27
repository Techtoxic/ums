// tabs/courses.js — HOD courses & units listing.
window.HODTabs = window.HODTabs || {};

// (verbatim from hodDashboard.js)
// Populate courses display
function populateCoursesDisplay() {
    const coursesList = document.getElementById('coursesList');
    if (!coursesList) return; // SPA: courses partial not injected yet
    const selectedCourse = document.getElementById('courseFilter').value;
    
    let displayCourses = coursesData;
    if (selectedCourse) {
        displayCourses = coursesData.filter(course => course.courseCode === selectedCourse);
    }
    
    // Pagination logic
    const totalCourses = displayCourses.length;
    const totalPages = Math.ceil(totalCourses / itemsPerPage.courses);
    const startIndex = (currentPage.courses - 1) * itemsPerPage.courses;
    const endIndex = startIndex + itemsPerPage.courses;
    const paginatedCourses = displayCourses.slice(startIndex, endIndex);
    
    if (totalCourses === 0) {
        coursesList.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-book text-4xl text-gray-400 dark:text-gray-600 mb-4"></i>
                <h3 class="text-lg font-medium text-gray-500 dark:text-gray-400 mb-2">No Courses Found</h3>
                <p class="text-gray-400 dark:text-gray-500">No courses available for this department.</p>
            </div>
        `;
        updatePaginationControls('courses', 0, 0);
        return;
    }
    
    coursesList.innerHTML = paginatedCourses.map(course => `
        <div class="border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">${escapeHtml(course.courseName)}</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-400">Level ${escapeHtml(course.level)} • ${course.units.length} units</p>
                </div>
                <span class="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-sm font-medium">
                    ${escapeHtml(course.courseCode.toUpperCase())}
                </span>
            </div>
            
            <div class="space-y-2">
                ${course.units.map(unit => {
                    const assignment = assignmentsData.find(a => a.unitId && a.unitId._id === unit._id);
                    return `
                        <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                            <div>
                                <p class="font-medium text-gray-800">${escapeHtml(unit.unitCode)}</p>
                                <p class="text-sm text-gray-600">${escapeHtml(unit.unitName)}</p>
                            </div>
                            <div class="flex items-center space-x-3">
                                ${assignment && assignment.trainerId ? `
                                    <span class="text-sm text-green-600 font-medium">
                                        <i class="fas fa-user mr-1"></i>${escapeHtml(assignment.trainerId.name || 'Unknown Trainer')}
                                    </span>
                                ` : `
                                    <span class="text-sm text-gray-500">Unassigned</span>
                                `}
                                <button 
                                    onclick="assignUnitToTrainer('${escapeAttr(unit._id)}')" 
                                    class="text-blue-600 hover:text-blue-700 transition-colors"
                                    title="Assign Trainer"
                                >
                                    <i class="fas fa-user-plus"></i>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `).join('');
    
    // Update pagination controls
    updatePaginationControls('courses', totalCourses, totalPages);
}

// Populate course filter
function populateCourseFilter() {
    const courseFilter = document.getElementById('courseFilter');
    if (!courseFilter) return; // SPA: courses partial not injected yet
    
    courseFilter.innerHTML = '<option value="">All Courses</option>' +
        coursesData.map(course => `
            <option value="${escapeAttr(course.courseCode)}">${escapeHtml(course.courseName)}</option>
        `).join('');
    
    courseFilter.addEventListener('change', populateCoursesDisplay);
}

window.HODTabs.courses = {
    init() {
        populateCoursesDisplay();
        populateCourseFilter();
    }
};
