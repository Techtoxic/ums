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
                <td colspan="5" class="px-6 py-4 text-center text-gray-500">
                    No students found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = list.map(student => {
        const courseDisplay = student.courseName || student.course || '';
        const departmentDisplay = student.departmentName || student.department || '';
        return `
        <tr class="hover:bg-slate-50 dark:hover:bg-gray-700/50">
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <div class="flex-shrink-0 h-10 w-10">
                        <div class="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <i class="ri-user-line text-primary"></i>
                        </div>
                    </div>
                    <div class="ml-4">
                        <div class="text-sm font-medium">${escapeHtml(student.name)}</div>
                        <div class="text-sm text-slate-500 dark:text-slate-400">${escapeHtml(student.admissionNumber)}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm">${escapeHtml(courseDisplay)}</div>
                <div class="text-sm text-slate-500 dark:text-slate-400">${escapeHtml(departmentDisplay)}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    student.admissionType === 'KUCCPS'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                }">
                    ${student.admissionType === 'KUCCPS' ? 'KUCCPS' : 'Walk-in'}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm">Module ${student.module}</div>
                <div class="text-sm text-slate-500 dark:text-slate-400">${escapeHtml(student.intake || '')} ${escapeHtml(String(student.intakeYear || ''))}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-success/10 text-success">
                    Active
                </span>
            </td>
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
        <div class="flex items-center justify-between">
            <div class="text-sm text-gray-700 dark:text-gray-300">
                Showing ${startIndex} to ${endIndex} of ${pagination.totalItems} results · Page ${currentPage} of ${totalPages}
            </div>
            <div class="flex items-center space-x-2">
                <button onclick="changePage('${type}', 'prev')" ${currentPage === 1 ? 'disabled' : ''}
                        class="px-3 py-1 text-sm border rounded-lg ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}">
                    Previous
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
                    class="px-3 py-1 text-sm border rounded-lg ${i === currentPage ? 'bg-primary text-white border-primary' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}">
                ${i}
            </button>
        `;
    }

    paginationHTML += `
                <button onclick="changePage('${type}', 'next')" ${currentPage >= totalPages ? 'disabled' : ''}
                        class="px-3 py-1 text-sm border rounded-lg ${currentPage >= totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}">
                    Next
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
