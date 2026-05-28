// tabs/students.js — dean student welfare list: search/filter + pagination +
// per-student actions.
window.DeanTabs = window.DeanTabs || {};

const DEAN_STUDENTS_PAGE_SIZE = 20;

let deanStudentsState = {
    currentPage: 1,
    itemsPerPage: DEAN_STUDENTS_PAGE_SIZE,
    total: 0,
    totalPages: 1,
    students: [],
    filters: { search: '', department: '', module: '', intake: '' },
};

// Load departments
async function loadDepartments() {
    try {
        const response = await authFetch(`${API_BASE}/programs`);
        if (!response.ok) throw new Error('Failed to load departments');

        const programs = await response.json();
        const departments = [...new Set(programs.map(p => p.departmentName).filter(Boolean))].sort();

        const select = document.getElementById('filter-department');
        if (!select) return;
        // Reset (avoid duplicating options if the partial is re-shown).
        const initialOption = select.querySelector('option[value=""]');
        select.innerHTML = '';
        if (initialOption) select.appendChild(initialOption);
        else select.innerHTML = '<option value="">All Departments</option>';
        departments.forEach(dept => {
            const option = document.createElement('option');
            option.value = dept;
            option.textContent = dept;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading departments:', error);
    }
}

function buildDeanStudentsQuery() {
    const params = new URLSearchParams();
    params.set('page', String(deanStudentsState.currentPage));
    params.set('limit', String(deanStudentsState.itemsPerPage));
    const { search, department, module: m, intake } = deanStudentsState.filters;
    if (search && search.trim() !== '') params.set('search', search.trim());
    if (department && department !== '') params.set('department', department);
    if (m && m !== '') params.set('module', m);
    if (intake && intake !== '') params.set('intake', intake);
    return params.toString();
}

async function loadStudents() {
    try {
        // Pull filter values directly so a load-on-mount also respects them.
        const searchEl = document.getElementById('search-student');
        const departmentEl = document.getElementById('filter-department');
        const moduleEl = document.getElementById('filter-module');
        const intakeEl = document.getElementById('filter-intake');
        if (searchEl) deanStudentsState.filters.search = searchEl.value.trim();
        if (departmentEl) deanStudentsState.filters.department = departmentEl.value;
        if (moduleEl) deanStudentsState.filters.module = moduleEl.value;
        if (intakeEl) deanStudentsState.filters.intake = intakeEl.value;

        const response = await authFetch(`${API_BASE}/dean/students?${buildDeanStudentsQuery()}`);
        if (!response.ok) throw new Error('Failed to load students');

        const body = await response.json();
        deanStudentsState.students = Array.isArray(body.students) ? body.students : [];
        deanStudentsState.total = body.total || 0;
        deanStudentsState.totalPages = body.totalPages || 1;
        deanStudentsState.currentPage = body.page || deanStudentsState.currentPage;
        deanStudentsState.itemsPerPage = body.limit || deanStudentsState.itemsPerPage;

        displayStudents(deanStudentsState.students);
        renderDeanPagination();
    } catch (error) {
        console.error('Error loading students:', error);
        if (typeof showNotification === 'function') showNotification('Failed to load students', 'error');
    }
}

// Display students in table
function displayStudents(students) {
    const tbody = document.getElementById('students-table-body');
    if (!tbody) return;

    if (!students.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-12 text-center text-gray-500">
                    <i class="ri-inbox-line text-4xl mb-4"></i>
                    <p>No students found</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = students.map(student => {
        const courseDisplay = student.courseName || (typeof formatCourseName === 'function' ? formatCourseName(student.course) : (student.course || ''));
        const departmentDisplay = student.departmentName || student.department || '';
        return `
        <tr class="hover:bg-gray-50 transition">
            <td class="px-6 py-4">
                <div class="flex items-center">
                    <div class="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center mr-3">
                        <i class="ri-user-line text-purple-600"></i>
                    </div>
                    <div>
                        <div class="font-medium text-gray-900">${escapeHtml(student.name)}</div>
                        <div class="text-sm text-gray-500">${escapeHtml(student.idNumber || '')}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${escapeHtml(student.admissionNumber || '')}</td>
            <td class="px-6 py-4">
                <div class="text-sm text-gray-900">${escapeHtml(courseDisplay)}</div>
                <div class="text-xs text-gray-500">${escapeHtml(departmentDisplay)}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                    Module ${escapeHtml(String(student.module ?? ''))}
                </span>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm text-gray-900">${escapeHtml(student.phoneNumber || '')}</div>
                <div class="text-xs text-gray-500">${escapeHtml(student.email || 'No email')}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                <button onclick='openAddNoteModal(${escapeAttr(JSON.stringify(student))})'
                    class="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition">
                    <i class="ri-add-line mr-1"></i>Add Note
                </button>
                <button onclick='viewStudentNotes("${escapeAttr(student.admissionNumber)}")'
                    class="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition">
                    <i class="ri-eye-line mr-1"></i>View Notes
                </button>
            </td>
        </tr>
    `;
    }).join('');
}

function renderDeanPagination() {
    const container = document.getElementById('dean-pagination-container');
    if (!container) return;
    const { currentPage, itemsPerPage, total, totalPages } = deanStudentsState;
    const startIndex = total === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const endIndex = Math.min(currentPage * itemsPerPage, total);

    if (total === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';

    let buttons = '';
    const maxButtons = 5;
    let startPage; let endPage;
    if (totalPages <= maxButtons) { startPage = 1; endPage = totalPages; }
    else if (currentPage <= 3) { startPage = 1; endPage = maxButtons; }
    else if (currentPage >= totalPages - 2) { startPage = totalPages - maxButtons + 1; endPage = totalPages; }
    else { startPage = currentPage - 2; endPage = currentPage + 2; }
    for (let i = startPage; i <= endPage; i++) {
        buttons += `<button onclick="deanNavigateStudentsPage(${i})" class="px-3 py-1 text-sm border rounded-lg ${i === currentPage ? 'bg-purple-600 text-white border-purple-600' : 'hover:bg-gray-50'}">${i}</button>`;
    }

    container.innerHTML = `
        <div class="flex items-center justify-between w-full">
            <div class="text-sm text-gray-700">
                Showing ${startIndex}-${endIndex} of ${total} student${total === 1 ? '' : 's'} · Page ${currentPage} of ${totalPages}
            </div>
            <div class="flex items-center gap-2">
                <button onclick="deanNavigateStudentsPage('prev')" ${currentPage === 1 ? 'disabled' : ''} class="px-3 py-1 text-sm border rounded-lg ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}">Previous</button>
                ${buttons}
                <button onclick="deanNavigateStudentsPage('next')" ${currentPage === totalPages ? 'disabled' : ''} class="px-3 py-1 text-sm border rounded-lg ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}">Next</button>
            </div>
        </div>
    `;
}

function deanNavigateStudentsPage(direction) {
    const { currentPage, totalPages } = deanStudentsState;
    if (direction === 'prev' && currentPage > 1) deanStudentsState.currentPage = currentPage - 1;
    else if (direction === 'next' && currentPage < totalPages) deanStudentsState.currentPage = currentPage + 1;
    else if (typeof direction === 'number' && direction >= 1 && direction <= totalPages) deanStudentsState.currentPage = direction;
    else return;
    loadStudents();
}

window.loadStudents = loadStudents;
window.deanNavigateStudentsPage = deanNavigateStudentsPage;

window.DeanTabs.students = {
    init() {
        loadStudents();
        loadDepartments();
        if (window.__deanStudentsWired) return;
        window.__deanStudentsWired = true;
        const searchEl = document.getElementById('search-student');
        if (searchEl) {
            let t;
            searchEl.addEventListener('input', (e) => {
                clearTimeout(t);
                const v = e.target.value;
                t = setTimeout(() => {
                    deanStudentsState.filters.search = v;
                    deanStudentsState.currentPage = 1;
                    loadStudents();
                }, 250);
            });
            searchEl.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    deanStudentsState.currentPage = 1;
                    loadStudents();
                }
            });
        }
        ['filter-department', 'filter-module', 'filter-intake'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => {
                deanStudentsState.currentPage = 1;
                loadStudents();
            });
        });
    },
};
