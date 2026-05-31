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
        owing: s.balance > 0,
        bal: formatCurrency(s.balance),
        id: escapeAttr(s._id),
    });

    container.innerHTML = `
        <div class="adm-card">
            <div class="adm-card__head">
                <div class="adm-card__title"><i class="ri-graduation-cap-line"></i> Student List</div>
                <span class="kpi__note">Showing ${rows.length} of ${(allStudents || []).length}</span>
            </div>
            <div class="adm-table-wrap">
                <table class="adm-table">
                    <thead>
                        <tr>
                            <th>Admission</th>
                            <th>Name</th>
                            <th>Course</th>
                            <th>Module</th>
                            <th>Balance</th>
                            <th style="text-align:right">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.length === 0 ? `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">No students match the current filters</td></tr>` : rows.map(s => { const c = cell(s); return `
                        <tr>
                            <td class="td-strong">${c.adm}</td>
                            <td>
                                <div class="td-strong">${c.name}</div>
                                <div style="color:var(--text-muted);font-size:12px">${c.phone}</div>
                            </td>
                            <td>${c.course}</td>
                            <td><span class="pill pill--info">M${c.module}</span></td>
                            <td>
                                <span class="pill ${c.owing ? 'pill--error' : 'pill--success'}">${c.owing ? 'Owing' : 'Cleared'}</span>
                                <span class="td-strong" style="margin-left:6px">${c.bal}</span>
                            </td>
                            <td style="text-align:right"><button onclick="viewStudent('${c.id}')" class="adm-btn adm-btn--ghost adm-btn--sm"><i class="ri-eye-line"></i> View</button></td>
                        </tr>`; }).join('')}
                    </tbody>
                </table>
            </div>
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
    init() {
        // Populate the program filter from the DB-backed catalog (Rule 7).
        // Catalog.ready() already awaited in the portal bootstrap.
        const programFilter = document.getElementById('program-filter');
        if (programFilter && window.Catalog) {
            Catalog.populateCourseSelect(programFilter, { includeBlank: true, blankLabel: 'All Programs' });
        }
        displayStudents();
    }
};
