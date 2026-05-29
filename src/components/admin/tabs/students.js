// tabs/students.js — admin students management (filters + accurate balances).
// Balances come from the server-computed financials map (studentFinanceByAdm)
// built in portal-core, so they are correct regardless of the short code vs
// long course-key mismatch in the raw student records.
window.AdminTabs = window.AdminTabs || {};

let _adminStudentsWired = false;

function getAdminStudentFilters() {
    return {
        search: (document.getElementById('student-search')?.value || '').trim().toLowerCase(),
        module: document.getElementById('module-filter')?.value || '',
        program: document.getElementById('program-filter')?.value || '',
    };
}

function applyAdminStudentFilters(students) {
    const { search, module, program } = getAdminStudentFilters();
    return students.filter(s => {
        if (module && String(s.module || 1) !== String(module)) return false;
        if (program && (formatCourseName(s.course) || '') !== program && (s.course || '') !== program) return false;
        if (search) {
            const hay = `${s.name || ''} ${s.admissionNumber || ''} ${formatCourseName(s.course) || ''} ${s.phoneNumber || ''} ${s.email || ''}`.toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    });
}

function populateAdminProgramFilter() {
    const sel = document.getElementById('program-filter');
    if (!sel || sel.dataset.filled === '1') return;
    // Build the option list from the course values that actually exist on students.
    const seen = new Map();
    (allStudents || []).forEach(s => {
        if (!s.course) return;
        const label = formatCourseName(s.course);
        if (!seen.has(label)) seen.set(label, label);
    });
    const opts = Array.from(seen.keys()).sort();
    sel.insertAdjacentHTML('beforeend', opts.map(o => `<option value="${escapeAttr(o)}">${escapeHtml(o)}</option>`).join(''));
    sel.dataset.filled = '1';
}

function wireAdminStudentFilters() {
    if (_adminStudentsWired) return;
    const search = document.getElementById('student-search');
    const moduleF = document.getElementById('module-filter');
    const programF = document.getElementById('program-filter');
    if (search) search.addEventListener('input', renderAdminStudents);
    if (moduleF) moduleF.addEventListener('change', renderAdminStudents);
    if (programF) programF.addEventListener('change', renderAdminStudents);
    _adminStudentsWired = true;
}

function renderAdminStudents() {
    const container = document.getElementById('students-table');
    if (!container) return;

    const rows = applyAdminStudentFilters(allStudents || []).map(student => {
        const balance = adminStudentBalance(student);
        const paid = adminStudentPaid(student);
        return { ...student, balance, paid };
    });

    const cell = (s) => ({
        adm: escapeHtml(s.admissionNumber || 'N/A'),
        name: escapeHtml(s.name || ''),
        phone: escapeHtml(s.phoneNumber || ''),
        course: escapeHtml(formatCourseName(s.course)),
        module: s.module || 1,
        balCls: s.balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400',
        bal: formatCurrency(s.balance),
        id: escapeAttr(s._id),
    });

    container.innerHTML = `
        <div class="flex items-center justify-between mb-2">
            <p class="text-xs text-gray-500 dark:text-gray-400">Showing <span class="font-semibold text-gray-700 dark:text-gray-200">${rows.length}</span> of ${(allStudents || []).length} students</p>
        </div>
        <div class="hidden md:block">
            <table class="w-full text-xs">
                <thead class="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th class="px-2 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Admission</th>
                        <th class="px-2 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Name</th>
                        <th class="px-2 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Course</th>
                        <th class="px-2 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Module</th>
                        <th class="px-2 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Balance</th>
                        <th class="px-2 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                    ${rows.length === 0 ? `<tr><td colspan="6" class="px-2 py-6 text-center text-gray-400">No students match the current filters</td></tr>` : rows.map(s => { const c = cell(s); return `
                        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                            <td class="px-2 py-2 text-xs font-medium text-gray-900 dark:text-white">${c.adm}</td>
                            <td class="px-2 py-2"><div><p class="text-xs font-semibold text-gray-900 dark:text-white">${c.name}</p><p class="text-xs text-gray-500 dark:text-gray-400">${c.phone}</p></div></td>
                            <td class="px-2 py-2 text-xs text-gray-600 dark:text-gray-300">${c.course}</td>
                            <td class="px-2 py-2"><span class="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs rounded-full">M${c.module}</span></td>
                            <td class="px-2 py-2 text-xs font-semibold ${c.balCls}">${c.bal}</td>
                            <td class="px-2 py-2"><button onclick="viewStudent('${c.id}')" class="text-primary hover:text-secondary transition"><i class="ri-eye-line text-base"></i></button></td>
                        </tr>`; }).join('')}
                </tbody>
            </table>
        </div>
        <div class="md:hidden space-y-2">
            ${rows.length === 0 ? `<p class="text-center text-gray-400 text-xs py-6">No students match the current filters</p>` : rows.map(s => { const c = cell(s); return `
                <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-2 border border-gray-200 dark:border-gray-600">
                    <div class="flex justify-between items-start mb-1.5">
                        <div class="flex-1 min-w-0"><p class="text-xs font-bold text-gray-900 dark:text-white truncate">${c.name}</p><p class="text-xs text-gray-600 dark:text-gray-400">${c.adm}</p></div>
                        <button onclick="viewStudent('${c.id}')" class="ml-2 text-primary hover:text-secondary p-1"><i class="ri-eye-line text-sm"></i></button>
                    </div>
                    <div class="grid grid-cols-2 gap-1.5 text-xs">
                        <div><span class="text-gray-500 dark:text-gray-400">Course:</span><p class="font-medium text-gray-900 dark:text-white truncate">${c.course}</p></div>
                        <div><span class="text-gray-500 dark:text-gray-400">Module:</span><p class="font-medium text-gray-900 dark:text-white">M${c.module}</p></div>
                        <div class="col-span-2"><span class="text-gray-500 dark:text-gray-400">Balance:</span><p class="font-bold ${c.balCls}">${c.bal}</p></div>
                    </div>
                </div>`; }).join('')}
        </div>
    `;
}

async function displayStudents() {
    const container = document.getElementById('students-table');
    if (!container) { console.error('students-table container not found'); return; }
    try {
        if ((allStudents || []).length === 0) await loadStudents();
        if (Object.keys(studentFinanceByAdm || {}).length === 0) await loadStudentFinancials();
        populateAdminProgramFilter();
        wireAdminStudentFilters();
        renderAdminStudents();
    } catch (error) {
        console.error('Error displaying students:', error);
        container.innerHTML = '<p class="text-red-600 text-center py-8">Error loading students: ' + escapeHtml(error.message) + '</p>';
    }
}

function viewStudent(studentId) {
    const student = (allStudents || []).find(s => s._id === studentId);
    if (!student) return;
    const f = studentFinanceByAdm[student.admissionNumber] || {};
    alert(`Student Details:\n\nName: ${student.name}\nAdmission: ${student.admissionNumber}\nCourse: ${formatCourseName(student.course)}\nModule: ${student.module}\nExpected: ${formatCurrency(f.expected || 0)}\nPaid: ${formatCurrency(f.paid || 0)}\nBalance: ${formatCurrency(f.balance || 0)}`);
}

// Real Excel export of the currently-filtered students (branded engine, no CSV).
function exportStudents() {
    const docs = window.EDTTIDocs || window.FinanceDocs;
    if (!docs) { showToast('Export engine not loaded', 'error'); return; }
    const rows = applyAdminStudentFilters(allStudents || []).map(s => {
        const f = studentFinanceByAdm[s.admissionNumber] || {};
        return [s.admissionNumber, s.name, formatCourseName(s.course), formatDepartmentName(s.department), s.module || 1, f.expected || 0, f.paid || 0, f.balance || 0];
    });
    docs.downloadExcel([
        ['EDTTI — Students Report'],
        ['Generated', new Date().toLocaleString()],
        ['Total', rows.length],
        [],
        ['Admission', 'Name', 'Course', 'Department', 'Module', 'Expected', 'Paid', 'Balance'],
        ...rows,
    ], `students_${new Date().toISOString().slice(0, 10)}`);
    showToast('Students exported to Excel', 'success');
}

function openAddStudentModal() {
    showToast('Use the Registrar portal to admit new students (admission letters included).', 'info');
}

window.viewStudent = viewStudent;
window.openAddStudentModal = openAddStudentModal;
window.exportStudents = exportStudents;

window.AdminTabs.students = {
    init() { displayStudents(); }
};
