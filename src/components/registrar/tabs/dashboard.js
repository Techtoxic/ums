// tabs/dashboard.js — registrar dashboard: stat cards + course overview.
window.RegistrarTabs = window.RegistrarTabs || {};

// (verbatim from the monolith inline scripts)
        // Function to load dashboard stats
        async function loadDashboardStats() {
            try {
                const response = await window.AUTH.fetch(`${API_BASE_URL}/students`);
                if (!response.ok) throw new Error('Failed to fetch students');
                const students = await response.json();
                
                // Total students
                document.getElementById('totalStudents').textContent = students.length;
                
                // New admissions (students with S25 in admission number - this year)
                const newAdmissions = students.filter(student => 
                    student.admissionNumber && student.admissionNumber.includes('/S25')
                ).length;
                document.getElementById('newAdmissions').textContent = newAdmissions;
                
                // Active courses (count unique courses)
                const uniqueCourses = new Set(students.map(student => student.course));
                document.getElementById('activeCourses').textContent = uniqueCourses.size;
                
                // Load course overview
                loadCourseOverview(students);
                
            } catch (error) {
                console.error('Error loading dashboard stats:', error);
                document.getElementById('totalStudents').textContent = '0';
                document.getElementById('newAdmissions').textContent = '0';
                document.getElementById('activeCourses').textContent = '0';
            }
        }

        // Function to load course overview
        function loadCourseOverview(students) {
            const departmentStats = {};
            
            // Group students by department
            students.forEach(student => {
                const dept = student.department;
                if (!departmentStats[dept]) {
                    departmentStats[dept] = {
                        name: departmentMapping[dept] || dept,
                        students: 0,
                        courses: new Set()
                    };
                }
                departmentStats[dept].students++;
                departmentStats[dept].courses.add(student.course);
            });

            const grid = document.getElementById('courseOverviewGrid');
            grid.innerHTML = '';

            Object.entries(departmentStats).forEach(([deptKey, stats]) => {
                const courseCount = stats.courses.size;
                const card = document.createElement('div');
                card.className = 'bg-gray-50 dark:bg-gray-700 p-6 rounded-xl hover:shadow-md transition-shadow';
                card.innerHTML = `
                    <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">${escapeHtml(stats.name)}</h3>
                    <p class="text-gray-600 dark:text-gray-400 mb-4">Various programs and levels</p>
                    <div class="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                        <span class="flex items-center gap-1">
                            <i class="ri-user-line"></i>
                            ${stats.students} Students
                        </span>
                        <span class="flex items-center gap-1">
                            <i class="ri-book-line"></i>
                            ${courseCount} Courses
                        </span>
                    </div>
                `;
                grid.appendChild(card);
            });
        }

window.RegistrarTabs.dashboard = {
    init() {
        if (typeof updateIdentityUI === 'function') updateIdentityUI(); // fills #welcomeName
        loadDashboardStats();
    }
};
