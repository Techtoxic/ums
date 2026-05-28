// tabs/management.js — student management: server-paginated table, search,
// view/edit. The viewStudentModal / editStudentModal markup ships inside
// management.html.
//
// Pagination + filters round-trip to GET /api/students?page=&limit=20&search=
// &department=&module=&intake= and render the returned slice. The frontend
// keeps a tiny `state` object only to drive the controls; the source of truth
// is always the server.
window.RegistrarTabs = window.RegistrarTabs || {};

// Department display labels for the table + modals (mirrors the server-side
// map in src/utils/courseCodes.js).
const departmentMapping = {
    applied_science: 'Applied Science Department',
    agriculture: 'Agriculture Department',
    building_civil: 'Building and Civil Department',
    electromechanical: 'Electromechanical Department',
    hospitality: 'Hospitality Department',
    business_liberal: 'Business and Liberal Studies',
    computing_informatics: 'Computing and Informatics',
};
window.departmentMapping = departmentMapping;

const STUDENTS_PAGE_SIZE = 20;

let managementState = {
    currentPage: 1,
    itemsPerPage: STUDENTS_PAGE_SIZE,
    total: 0,
    totalPages: 1,
    students: [],
    filters: {
        search: '',
        department: 'all',
        module: 'all',
        intake: 'all',
    },
};

function buildStudentsQuery({ page, limit, filters }) {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (filters.search && filters.search.trim() !== '') params.set('search', filters.search.trim());
    if (filters.department && filters.department !== 'all') params.set('department', filters.department);
    if (filters.module && filters.module !== 'all') params.set('module', filters.module);
    if (filters.intake && filters.intake !== 'all') params.set('intake', filters.intake);
    return params.toString();
}

async function fetchAndDisplayStudents(opts = {}) {
    if (opts && typeof opts === 'object') {
        if (Number.isFinite(opts.page)) managementState.currentPage = opts.page;
        if (Number.isFinite(opts.limit)) managementState.itemsPerPage = opts.limit;
    }
    try {
        const query = buildStudentsQuery({
            page: managementState.currentPage,
            limit: managementState.itemsPerPage,
            filters: managementState.filters,
        });
        const response = await window.AUTH.fetch(`${API_BASE_URL}/students?${query}`);
        if (!response.ok) {
            let errorMessage = 'Failed to fetch students';
            try { const errorData = await response.json(); errorMessage = errorData.message || errorMessage; }
            catch (e) { errorMessage += ` (Status: ${response.status})`; }
            throw new Error(errorMessage);
        }
        const body = await response.json();
        managementState.students = Array.isArray(body.students) ? body.students : [];
        managementState.total = body.total || 0;
        managementState.totalPages = body.totalPages || 1;
        managementState.currentPage = body.page || managementState.currentPage;
        managementState.itemsPerPage = body.limit || managementState.itemsPerPage;
        renderStudentsPage();
    } catch (error) {
        console.error('Error fetching students:', error);
        showToast(error.message, 'error');
    }
}

function renderStudentsPage() {
    const tbody = document.querySelector('#content-management table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const students = managementState.students;

    if (!students.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-3 py-6 text-center text-gray-500">No students match these filters.</td></tr>';
        updatePaginationControls();
        return;
    }

    students.forEach(student => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-700';

        const courseDisplay = student.courseName || (typeof formatCourseName === 'function' ? formatCourseName(student.course) : (student.course || ''));
        const departmentDisplay = student.departmentName || departmentMapping[student.department] || student.department || 'Not Assigned';
        const intakeDisplay = student.intake
            ? `${capitalize(student.intake)} ${student.intakeYear || ''}`.trim()
            : 'N/A';
        const statusDisplay = student.status ? student.status.charAt(0).toUpperCase() + student.status.slice(1) : 'Active';

        tr.innerHTML = `
            <td class="px-3 py-4 text-sm font-mono">${escapeHtml(student.admissionNumber || '')}</td>
            <td class="px-3 py-4 text-sm">
                <div class="font-medium">${escapeHtml(student.name || '')}</div>
                <div class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(courseDisplay)}</div>
            </td>
            <td class="px-3 py-4 text-sm">${escapeHtml(departmentDisplay)}</td>
            <td class="px-3 py-4 text-sm">${student.module != null ? `Module ${student.module}` : ''}</td>
            <td class="px-3 py-4 text-sm">${escapeHtml(intakeDisplay)}</td>
            <td class="px-3 py-4 text-sm">
                <span class="px-2 py-1 text-xs font-medium ${(statusDisplay === 'Active' || statusDisplay === 'active') ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'} rounded-full">
                    ${escapeHtml(statusDisplay)}
                </span>
            </td>
            <td class="px-3 py-4 text-sm space-x-2">
                <button onclick="viewStudent('${escapeAttr(student._id)}')" class="text-primary hover:text-secondary">View</button>
                <button onclick="editStudent('${escapeAttr(student._id)}')" class="text-primary hover:text-secondary">Edit</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    updatePaginationControls();
}

function capitalize(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function updatePaginationControls() {
    const { currentPage, itemsPerPage, total, totalPages } = managementState;
    const startIndex = total === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const endIndex = Math.min(currentPage * itemsPerPage, total);

    const paginationInfo = document.getElementById('pagination-info');
    if (paginationInfo) {
        paginationInfo.textContent = total === 0
            ? 'No students found'
            : `Showing ${startIndex}-${endIndex} of ${total} student${total === 1 ? '' : 's'} · Page ${currentPage} of ${totalPages}`;
    }
    const prevBtn = document.getElementById('prev-page-btn');
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    const nextBtn = document.getElementById('next-page-btn');
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

    const pageNumbersContainer = document.getElementById('page-numbers');
    if (pageNumbersContainer && totalPages > 1) {
        const maxButtons = 5;
        let startPage; let endPage;
        if (totalPages <= maxButtons) { startPage = 1; endPage = totalPages; }
        else if (currentPage <= 3) { startPage = 1; endPage = maxButtons; }
        else if (currentPage >= totalPages - 2) { startPage = totalPages - maxButtons + 1; endPage = totalPages; }
        else { startPage = currentPage - 2; endPage = currentPage + 2; }

        let pageButtonsHTML = '';
        for (let i = startPage; i <= endPage; i++) {
            const isActive = i === currentPage;
            pageButtonsHTML += `<button onclick="navigateStudentsPage(${i})" class="w-8 h-8 text-sm font-medium rounded-lg transition-colors ${isActive ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'}">${i}</button>`;
        }
        pageNumbersContainer.innerHTML = pageButtonsHTML;
    } else if (pageNumbersContainer) {
        pageNumbersContainer.innerHTML = '';
    }

    const paginationContainer = document.getElementById('pagination-container');
    if (paginationContainer) {
        paginationContainer.style.display = total > 0 ? 'flex' : 'none';
    }
}

function navigateStudentsPage(direction) {
    const { currentPage, totalPages } = managementState;
    if (direction === 'prev' && currentPage > 1) managementState.currentPage = currentPage - 1;
    else if (direction === 'next' && currentPage < totalPages) managementState.currentPage = currentPage + 1;
    else if (typeof direction === 'number' && direction >= 1 && direction <= totalPages) managementState.currentPage = direction;
    else return;
    fetchAndDisplayStudents();
}

function applyAllFilters() {
    // Going back to page 1 whenever filters change.
    managementState.currentPage = 1;
    fetchAndDisplayStudents();
}

// ---------- View student ----------
async function viewStudent(studentId) {
    try {
        const response = await window.AUTH.fetch(`${API_BASE_URL}/students/${studentId}`);
        if (!response.ok) throw new Error('Failed to fetch student details');
        const student = await response.json();

        const content = document.getElementById('studentDetailsContent');
        const courseName = student.courseName || (typeof formatCourseName === 'function' ? formatCourseName(student.course) : (student.course || ''));
        const departmentName = student.departmentName || departmentMapping[student.department] || student.department || 'Not Assigned';
        const intakeLine = student.intake ? `${capitalize(student.intake)} ${student.intakeYear || ''}`.trim() : 'N/A';

        content.innerHTML = `
            <div class="space-y-3">
                <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                    <h4 class="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-2 flex items-center">
                        <i class="ri-user-line mr-1"></i>Personal Information
                    </h4>
                    <div class="space-y-1 text-sm">
                        <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Name:</span> <span class="font-medium">${escapeHtml(student.name || '')}</span></div>
                        <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">ID Number:</span> <span class="font-medium">${escapeHtml(student.idNumber || '')}</span></div>
                        <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Phone:</span> <span class="font-medium">${escapeHtml(student.phoneNumber || '')}</span></div>
                        <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Email:</span> <span class="font-medium">${escapeHtml(student.email || '—')}</span></div>
                        <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">KCSE Grade:</span> <span class="font-medium">${escapeHtml(student.kcseGrade || '')}</span></div>
                    </div>
                </div>
                <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                    <h4 class="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-2 flex items-center">
                        <i class="ri-group-line mr-1"></i>Next of Kin
                    </h4>
                    <div class="space-y-1 text-sm">
                        <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Name:</span> <span class="font-medium">${escapeHtml(student.nextOfKinName || '—')}</span></div>
                        <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Phone:</span> <span class="font-medium">${escapeHtml(student.nextOfKinPhone || '—')}</span></div>
                    </div>
                </div>
                <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                    <h4 class="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-2 flex items-center">
                        <i class="ri-graduation-cap-line mr-1"></i>Academic Information
                    </h4>
                    <div class="space-y-1 text-sm">
                        <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Admission Number:</span> <span class="font-mono font-medium">${escapeHtml(student.admissionNumber || '')}</span></div>
                        <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Course:</span> <span class="font-medium">${escapeHtml(courseName)}</span></div>
                        <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Department:</span> <span class="font-medium">${escapeHtml(departmentName)}</span></div>
                        <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Module:</span> <span class="font-medium">Module ${escapeHtml(String(student.module ?? '—'))}</span></div>
                        <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Intake:</span> <span class="font-medium">${escapeHtml(intakeLine)}</span></div>
                        <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Admission Type:</span> <span class="font-medium">${escapeHtml(student.admissionType || '—')}</span></div>
                        <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Registered:</span> <span class="font-medium">${student.createdAt ? new Date(student.createdAt).toLocaleDateString() : '—'}</span></div>
                    </div>
                </div>
            </div>
        `;

        const modal = document.getElementById('viewStudentModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => {
            const t = modal.querySelector('.transform');
            if (t) { t.classList.remove('scale-95'); t.classList.add('scale-100'); }
        }, 10);
        document.body.classList.add('menu-open');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ---------- Edit student ----------
async function editStudent(studentId) {
    try {
        const response = await window.AUTH.fetch(`${API_BASE_URL}/students/${studentId}`);
        if (!response.ok) throw new Error('Failed to fetch student details');
        const student = await response.json();

        document.getElementById('editStudentId').value = student._id;
        document.getElementById('editName').value = student.name || '';
        document.getElementById('editIdNumber').value = student.idNumber || '';
        document.getElementById('editPhone').value = student.phoneNumber || '';
        document.getElementById('editNextOfKinName').value = student.nextOfKinName || '';
        document.getElementById('editNextOfKinPhone').value = student.nextOfKinPhone || '';
        document.getElementById('editModule').value = student.module || 1;
        document.getElementById('editCourse').value = student.courseName || (typeof formatCourseName === 'function' ? formatCourseName(student.course) : (student.course || ''));

        // Clamp the module dropdown to the course's level cap and explain.
        const level = (typeof extractLevelFromCourse === 'function') ? extractLevelFromCourse(student.course) : null;
        const cap = level ? (window.MAX_MODULE_BY_LEVEL ? window.MAX_MODULE_BY_LEVEL[level] : ({ 3: 1, 4: 2, 5: 4, 6: 6 })[level]) : null;
        const moduleSel = document.getElementById('editModule');
        const help = document.getElementById('editModuleHelp');
        if (moduleSel && cap) {
            Array.from(moduleSel.options).forEach(o => {
                const v = parseInt(o.value, 10);
                o.disabled = v > cap;
            });
        }
        if (help) help.textContent = level && cap ? `Level ${level} students cap at Module ${cap}.` : '';

        const modal = document.getElementById('editStudentModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => {
            const t = modal.querySelector('.transform');
            if (t) { t.classList.remove('scale-95'); t.classList.add('scale-100'); }
        }, 10);
        document.body.classList.add('menu-open');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function closeViewModal() {
    const modal = document.getElementById('viewStudentModal');
    const t = modal.querySelector('.transform');
    if (t) { t.classList.remove('scale-100'); t.classList.add('scale-95'); }
    setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 200);
    document.body.classList.remove('menu-open');
}

function closeEditModal() {
    const modal = document.getElementById('editStudentModal');
    const t = modal.querySelector('.transform');
    if (t) { t.classList.remove('scale-100'); t.classList.add('scale-95'); }
    setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 200);
    document.body.classList.remove('menu-open');
}

async function handleEditStudent(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const studentId = formData.get('studentId');

    const updateData = {
        name: formData.get('name'),
        idNumber: formData.get('idNumber'),
        phoneNumber: formData.get('phoneNumber'),
        module: parseInt(formData.get('module'), 10),
        nextOfKinName: formData.get('nextOfKinName') || null,
        nextOfKinPhone: formData.get('nextOfKinPhone') || null,
    };

    try {
        const response = await window.AUTH.fetch(`${API_BASE_URL}/students/${studentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData),
        });
        const data = await response.json();
        if (response.ok) {
            showToast('Student updated successfully!');
            closeEditModal();
            fetchAndDisplayStudents();
        } else {
            throw new Error(data.message || 'Failed to update student');
        }
    } catch (error) {
        showToast(error.message, 'error');
    }
}

window.viewStudent = viewStudent;
window.editStudent = editStudent;
window.closeViewModal = closeViewModal;
window.closeEditModal = closeEditModal;
window.handleEditStudent = handleEditStudent;
window.navigateStudentsPage = navigateStudentsPage;
window.fetchAndDisplayStudents = fetchAndDisplayStudents;

window.RegistrarTabs.management = {
    init() {
        fetchAndDisplayStudents({ page: 1 });
        if (window.__regMgmtWired) return;
        window.__regMgmtWired = true;
        const departmentFilter = document.getElementById('departmentFilter');
        const moduleFilter = document.getElementById('moduleFilter');
        const intakeFilter = document.getElementById('intakeFilter');
        const searchInput = document.getElementById('studentSearchInput');
        let searchDebounce;
        if (departmentFilter) departmentFilter.addEventListener('change', (e) => { managementState.filters.department = e.target.value; applyAllFilters(); });
        if (moduleFilter) moduleFilter.addEventListener('change', (e) => { managementState.filters.module = e.target.value; applyAllFilters(); });
        if (intakeFilter) intakeFilter.addEventListener('change', (e) => { managementState.filters.intake = e.target.value; applyAllFilters(); });
        if (searchInput) searchInput.addEventListener('input', (e) => {
            const value = e.target.value;
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => {
                managementState.filters.search = value;
                applyAllFilters();
            }, 250);
        });
    },
};
