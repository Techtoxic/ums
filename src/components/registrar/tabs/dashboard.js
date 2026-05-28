// tabs/dashboard.js — registrar dashboard: stat cards + course overview.
//
// Uses the new GET /api/students/stats endpoint to fetch aggregate counts in
// a single round-trip instead of streaming the whole students list. The
// previous implementation set the tiles to "0" inside the catch block, which
// caused the registrar dashboard to flash "0" on first load when the auth
// cookie hadn't fully settled by the time the fetch fired — we now leave the
// loading placeholder ("—") and retry on error instead.
window.RegistrarTabs = window.RegistrarTabs || {};

const REGISTRAR_DASHBOARD_RETRY_MS = 750;
const REGISTRAR_DASHBOARD_RETRY_MAX = 3;

async function loadDashboardStats(attempt = 0) {
    const totalEl = document.getElementById('totalStudents');
    const newAdmissionsEl = document.getElementById('newAdmissions');
    const activeCoursesEl = document.getElementById('activeCourses');

    try {
        // 1) Aggregate counts come from /students/stats (cheap, single query).
        const statsRes = await window.AUTH.fetch(`${API_BASE_URL}/students/stats`);
        if (!statsRes.ok) throw new Error(`stats fetch failed (${statsRes.status})`);
        const stats = await statsRes.json();

        if (totalEl) totalEl.textContent = (stats.totalStudents || 0).toLocaleString();
        if (activeCoursesEl) activeCoursesEl.textContent = (stats.activeCourses || 0).toLocaleString();
        if (newAdmissionsEl) newAdmissionsEl.textContent = (stats.studentsAdmittedThisMonth || 0).toLocaleString();

        // 2) Department overview uses the precomputed distribution from /stats.
        renderDepartmentOverviewFromStats(stats.departmentDistribution || []);
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        // Do NOT zero out the tiles on error — keep the loading placeholder
        // and quietly retry a few times. This matches the original v2-postgres
        // behaviour (which never wrote "0") and avoids the brief flash of
        // zeros the user reported after the v2-test refactor.
        if (attempt < REGISTRAR_DASHBOARD_RETRY_MAX) {
            setTimeout(() => loadDashboardStats(attempt + 1), REGISTRAR_DASHBOARD_RETRY_MS);
        }
    }
}

function renderDepartmentOverviewFromStats(distribution) {
    const grid = document.getElementById('courseOverviewGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!Array.isArray(distribution) || !distribution.length) {
        grid.innerHTML = '<div class="text-sm text-gray-500">No department data yet.</div>';
        return;
    }

    distribution.forEach((d) => {
        const card = document.createElement('div');
        card.className = 'bg-gray-50 dark:bg-gray-700 p-6 rounded-xl hover:shadow-md transition-shadow';
        card.innerHTML = `
            <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-2">${escapeHtml(d.departmentName || d.department || '')}</h3>
            <p class="text-gray-600 dark:text-gray-400 mb-4">Various programs and levels</p>
            <div class="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                <span class="flex items-center gap-1">
                    <i class="ri-user-line"></i>
                    ${(d.count || 0).toLocaleString()} Students
                </span>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Legacy fallback (kept exported for any external caller). When given the
// raw students array, it computes the same department breakdown the old
// implementation did. New callers should prefer renderDepartmentOverviewFromStats.
function loadCourseOverview(students) {
    const departmentStats = {};

    students.forEach(student => {
        const dept = student.department;
        if (!departmentStats[dept]) {
            departmentStats[dept] = {
                name: (window.departmentMapping && window.departmentMapping[dept]) || dept,
                students: 0,
                courses: new Set(),
            };
        }
        departmentStats[dept].students++;
        if (student.course) departmentStats[dept].courses.add(student.course);
    });

    const grid = document.getElementById('courseOverviewGrid');
    if (!grid) return;
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

window.loadDashboardStats = loadDashboardStats;
window.loadCourseOverview = loadCourseOverview;

window.RegistrarTabs.dashboard = {
    init() {
        if (typeof updateIdentityUI === 'function') updateIdentityUI(); // fills #welcomeName
        loadDashboardStats();
    },
};
