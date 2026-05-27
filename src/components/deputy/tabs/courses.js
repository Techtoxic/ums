// tabs/courses.js — deputy course management.
window.DeputyTabs = window.DeputyTabs || {};

// (verbatim from the monolith inline scripts)
        // Load courses data
        async function loadCoursesData() {
            try {
                const response = await window.AUTH.fetch(`${API_BASE_URL}/courses`);
                if (!response.ok) {
                    throw new Error('Failed to fetch courses');
                }
                
                const courses = await response.json();
                displayCourses(courses);
            } catch (error) {
                console.error('Error loading courses:', error);
            }
        }

        // Display courses
        function displayCourses(courses) {
            const content = document.getElementById('content-courses');
            if (!content) return;

            const coursesByDept = {};
            courses.forEach(course => {
                if (!coursesByDept[course.department]) {
                    coursesByDept[course.department] = [];
                }
                coursesByDept[course.department].push(course);
            });

            content.innerHTML = `
                <div class="space-y-6">
                    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                        <h2 class="text-xl font-semibold mb-6">All Courses by Department</h2>
                        ${Object.keys(coursesByDept).map(dept => `
                            <div class="mb-8">
                                <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4 capitalize">${escapeHtml(dept.replace('_', ' '))}</h3>
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    ${coursesByDept[dept].map(course => `
                                        <div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary/50 transition-colors">
                                            <h4 class="font-medium text-gray-900 dark:text-white">${escapeHtml(course.name)}</h4>
                                            <p class="text-sm text-gray-500 dark:text-gray-400">Level ${escapeHtml(course.level)}</p>
                                            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">${escapeHtml(course.code)}</p>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

window.DeputyTabs.courses = {
    init() { loadCoursesData(); }
};
