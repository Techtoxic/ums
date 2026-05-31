// tabs/students.js — deputy student management: server-paginated table.
window.DeputyTabs = window.DeputyTabs || {};

const DEPUTY_STUDENTS_PAGE_SIZE = 20;

// Pagination state
let studentsPagination = {
    currentPage: 1,
    itemsPerPage: DEPUTY_STUDENTS_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1,
    students: [],
    filters: { search: '', department: 'all', module: 'all', intake: 'all' },
};

function buildDeputyStudentsQuery() {
    const params = new URLSearchParams();
    params.set('page', String(studentsPagination.currentPage));
    params.set('limit', String(studentsPagination.itemsPerPage));
    const { search, department, module: m, intake } = studentsPagination.filters;
    if (search && search.trim() !== '') params.set('search', search.trim());
    if (department && department !== 'all') params.set('department', department);
    if (m && m !== 'all') params.set('module', m);
    if (intake && intake !== 'all') params.set('intake', intake);
    return params.toString();
}

// Load students data
async function loadStudents() {
    try {
        const response = await window.AUTH.fetch(`${API_BASE_URL}/students?${buildDeputyStudentsQuery()}`);
        if (!response.ok) throw new Error('Failed to fetch students');

        const body = await response.json();
        studentsPagination.students = Array.isArray(body.students) ? body.students : (Array.isArray(body) ? body : []);
        studentsPagination.totalItems = body.total != null ? body.total : studentsPagination.students.length;
        studentsPagination.totalPages = body.totalPages || 1;
        studentsPagination.currentPage = body.page || studentsPagination.currentPage;

        displayStudents();
        updatePagination('students');
    } catch (error) {
        console.error('Error loading students:', error);
        const tbody = document.getElementById('studentsTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-6 py-4 text-center text-gray-500">
                        Error loading students: ${error.message}
                    </td>
                </tr>
            `;
        }
    }
}

// Display students with pagination
function displayStudents(students = null) {
    const tbody = document.getElementById('studentsTableBody');
    if (!tbody) return;

    const list = students || studentsPagination.students || [];

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px">
                    No students found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = list.map(student => {
        const courseDisplay = student.courseName || student.course || '';
        const departmentDisplay = student.departmentName || student.department || '';
        const initial = escapeHtml((student.name || '?').trim().charAt(0).toUpperCase() || '?');
        const isKuccps = student.admissionType === 'KUCCPS';
        return `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:12px">
                    <div style="width:38px;height:38px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:var(--maroon);background:color-mix(in srgb, var(--maroon) 12%, transparent)">${initial}</div>
                    <div style="min-width:0">
                        <div class="td-strong">${escapeHtml(student.name)}</div>
                        <div style="color:var(--text-muted);font-size:12px">${escapeHtml(student.admissionNumber)}</div>
                    </div>
                </div>
            </td>
            <td>
                <div class="td-strong">${escapeHtml(courseDisplay)}</div>
                <div style="color:var(--text-muted);font-size:12px">${escapeHtml(departmentDisplay)}</div>
            </td>
            <td><span class="pill ${isKuccps ? 'pill--info' : 'pill--success'}">${isKuccps ? 'KUCCPS' : 'Walk-in'}</span></td>
            <td>
                <div class="td-strong">Module ${escapeHtml(String(student.module || ''))}</div>
                <div style="color:var(--text-muted);font-size:12px">${escapeHtml(student.intake || '')} ${escapeHtml(String(student.intakeYear || ''))}</div>
            </td>
            <td style="text-align:right"><span class="pill pill--success">Active</span></td>
        </tr>
    `;
    }).join('');
}

// Update pagination controls
function updatePagination(type) {
    const pagination = type === 'students' ? studentsPagination : (typeof trainersPagination !== 'undefined' ? trainersPagination : null);
    if (!pagination) return;
    const containerId = type === 'students' ? 'studentsPagination' : 'trainersPagination';
    const container = document.getElementById(containerId);

    if (!container) return;

    const totalPages = pagination.totalPages || Math.ceil(pagination.totalItems / pagination.itemsPerPage) || 1;
    const currentPage = pagination.currentPage;

    if (pagination.totalItems === 0) {
        container.innerHTML = '';
        return;
    }

    const startIndex = (currentPage - 1) * pagination.itemsPerPage + 1;
    const endIndex = Math.min(currentPage * pagination.itemsPerPage, pagination.totalItems);

    let paginationHTML = `
        <div class="flex items-center justify-between gap-3 flex-wrap">
            <div class="kpi__note">
                Showing ${startIndex}–${endIndex} of ${pagination.totalItems} · Page ${currentPage} of ${totalPages}
            </div>
            <div class="flex items-center" style="gap:6px">
                <button onclick="changePage('${escapeAttr(type)}', 'prev')" ${currentPage === 1 ? 'disabled' : ''}
                        class="adm-btn adm-btn--outline adm-btn--sm" ${currentPage === 1 ? 'style="opacity:.5;cursor:not-allowed"' : ''}>
                    <i class="ri-arrow-left-s-line"></i> Prev
                </button>
    `;

    const maxButtons = 5;
    let startPage; let endPage;
    if (totalPages <= maxButtons) { startPage = 1; endPage = totalPages; }
    else if (currentPage <= 3) { startPage = 1; endPage = maxButtons; }
    else if (currentPage >= totalPages - 2) { startPage = totalPages - maxButtons + 1; endPage = totalPages; }
    else { startPage = currentPage - 2; endPage = currentPage + 2; }

    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <button onclick="changePage('${escapeAttr(type)}', ${i})"
                    class="adm-btn adm-btn--sm ${i === currentPage ? 'adm-btn--primary' : 'adm-btn--ghost'}">
                ${i}
            </button>
        `;
    }

    paginationHTML += `
                <button onclick="changePage('${escapeAttr(type)}', 'next')" ${currentPage >= totalPages ? 'disabled' : ''}
                        class="adm-btn adm-btn--outline adm-btn--sm" ${currentPage >= totalPages ? 'style="opacity:.5;cursor:not-allowed"' : ''}>
                    Next <i class="ri-arrow-right-s-line"></i>
                </button>
            </div>
        </div>
    `;

    container.innerHTML = paginationHTML;
}

// Change page
function changePage(type, direction) {
    const pagination = type === 'students' ? studentsPagination : (typeof trainersPagination !== 'undefined' ? trainersPagination : null);
    if (!pagination) return;
    const totalPages = pagination.totalPages || Math.ceil(pagination.totalItems / pagination.itemsPerPage) || 1;

    if (direction === 'prev' && pagination.currentPage > 1) pagination.currentPage--;
    else if (direction === 'next' && pagination.currentPage < totalPages) pagination.currentPage++;
    else if (typeof direction === 'number' && direction >= 1 && direction <= totalPages) pagination.currentPage = direction;
    else return;

    if (type === 'students') loadStudents();
    else if (type === 'trainers' && typeof displayTrainers === 'function') {
        displayTrainers();
        updatePagination('trainers');
    }
}

window.loadStudents = loadStudents;
window.changePage = changePage;

window.DeputyTabs.students = {
    init() {
        loadStudents();
        if (window.__deputyStudentsWired) return;
        window.__deputyStudentsWired = true;
        const searchEl = document.getElementById('deputyStudentsSearch');
        const deptEl = document.getElementById('deputyStudentsDepartment');
        const moduleEl = document.getElementById('deputyStudentsModule');
        const intakeEl = document.getElementById('deputyStudentsIntake');
        let t;
        if (searchEl) searchEl.addEventListener('input', (e) => {
            clearTimeout(t);
            const v = e.target.value;
            t = setTimeout(() => { studentsPagination.filters.search = v; studentsPagination.currentPage = 1; loadStudents(); }, 250);
        });
        if (deptEl) deptEl.addEventListener('change', (e) => { studentsPagination.filters.department = e.target.value; studentsPagination.currentPage = 1; loadStudents(); });
        if (moduleEl) moduleEl.addEventListener('change', (e) => { studentsPagination.filters.module = e.target.value; studentsPagination.currentPage = 1; loadStudents(); });
        if (intakeEl) intakeEl.addEventListener('change', (e) => { studentsPagination.filters.intake = e.target.value; studentsPagination.currentPage = 1; loadStudents(); });
    },
};
