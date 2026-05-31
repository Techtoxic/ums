// tabs/courses.js — deputy course management: adm-card grid grouped by
// department, each course a tile with a code pill. Adds a department filter.
window.DeputyTabs = window.DeputyTabs || {};

let _deputyCoursesCache = [];

// Load courses data (once), then render with the active filter.
async function loadCoursesData() {
    try {
        const response = await window.AUTH.fetch(`${API_BASE_URL}/courses`);
        if (!response.ok) {
            throw new Error('Failed to fetch courses');
        }

        _deputyCoursesCache = await response.json() || [];
        displayCourses();
    } catch (error) {
        console.error('Error loading courses:', error);
    }
}

// Display courses grouped by department, applying the dept filter.
function displayCourses() {
    const content = document.getElementById('coursesContent');
    if (!content) return;

    const deptFilter = (document.getElementById('deputyCoursesDepartment') || {}).value || 'all';
    const fmtDept = (window.formatDepartmentName)
        ? window.formatDepartmentName
        : (window.Catalog ? (c) => window.Catalog.departmentName(c) : (c) => (c || '').replace(/_/g, ' '));

    const courses = (_deputyCoursesCache || []).filter(c => deptFilter === 'all' || c.department === deptFilter);

    const coursesByDept = {};
    courses.forEach(course => {
        const dept = course.department || 'unknown';
        if (!coursesByDept[dept]) coursesByDept[dept] = [];
        coursesByDept[dept].push(course);
    });

    const deptKeys = Object.keys(coursesByDept);
    if (deptKeys.length === 0) {
        content.innerHTML = `
            <div class="adm-card"><div class="adm-card__body" style="text-align:center;padding:40px 0;color:var(--text-muted)">
                <i class="ri-book-2-line" style="font-size:32px;display:block;margin-bottom:8px;color:var(--text-tertiary)"></i>
                <p style="font-size:13px">No courses found</p>
            </div></div>`;
        return;
    }

    content.innerHTML = deptKeys.map(dept => `
        <div class="adm-card" style="margin-bottom:16px">
            <div class="adm-card__head">
                <div class="adm-card__title"><i class="ri-building-line"></i> ${escapeHtml(fmtDept(dept) || dept)}</div>
                <span class="kpi__note">${coursesByDept[dept].length} course${coursesByDept[dept].length === 1 ? '' : 's'}</span>
            </div>
            <div class="adm-card__body">
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    ${coursesByDept[dept].map(course => `
                        <div class="adm-card"><div class="adm-card__body">
                            <div class="flex items-start justify-between gap-2" style="margin-bottom:6px">
                                <div class="td-strong" style="font-size:14px">${escapeHtml(course.name)}</div>
                                <span class="pill pill--neutral" style="flex-shrink:0">${escapeHtml(course.code || '')}</span>
                            </div>
                            <p class="kpi__note">Level ${escapeHtml(String(course.level || ''))}</p>
                        </div></div>
                    `).join('')}
                </div>
            </div>
        </div>
    `).join('');
}

window.DeputyTabs.courses = {
    init() {
        loadCoursesData();
        if (window.__deputyCoursesWired) return;
        window.__deputyCoursesWired = true;
        const deptEl = document.getElementById('deputyCoursesDepartment');
        if (deptEl) deptEl.addEventListener('change', displayCourses);
    }
};
