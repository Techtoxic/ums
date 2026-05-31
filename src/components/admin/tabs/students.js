// tabs/students.js — admin students management (filters + accurate balances).
// Balances come from the server-computed financials map (studentFinanceByAdm)
// built in portal-core, so they are correct regardless of the short code vs
// long course-key mismatch in the raw student records.
window.AdminTabs = window.AdminTabs || {};

let _adminStudentsWired = false;
let _admStudentsPage = 1;
const ADM_STUDENTS_PER_PAGE = 15;

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

// Filter changes reset to the first page before re-rendering.
function adminStudentsFilterChanged() { _admStudentsPage = 1; renderAdminStudents(); }

function wireAdminStudentFilters() {
    if (_adminStudentsWired) return;
    const search = document.getElementById('student-search');
    const moduleF = document.getElementById('module-filter');
    const programF = document.getElementById('program-filter');
    if (search) search.addEventListener('input', adminStudentsFilterChanged);
    if (moduleF) moduleF.addEventListener('change', adminStudentsFilterChanged);
    if (programF) programF.addEventListener('change', adminStudentsFilterChanged);
    _adminStudentsWired = true;
}

function renderAdminStudents() {
    const container = document.getElementById('students-table');
    if (!container) return;

    const allRows = applyAdminStudentFilters(allStudents || []).map(student => {
        const balance = adminStudentBalance(student);
        const paid = adminStudentPaid(student);
        return { ...student, balance, paid };
    });

    // Client-side pagination over the filtered set.
    const totalFiltered = allRows.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / ADM_STUDENTS_PER_PAGE));
    if (_admStudentsPage > totalPages) _admStudentsPage = totalPages;
    if (_admStudentsPage < 1) _admStudentsPage = 1;
    const startIdx = (_admStudentsPage - 1) * ADM_STUDENTS_PER_PAGE;
    const rows = allRows.slice(startIdx, startIdx + ADM_STUDENTS_PER_PAGE);
    const shownFrom = totalFiltered === 0 ? 0 : startIdx + 1;
    const shownTo = startIdx + rows.length;

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
                <span class="kpi__note">Showing ${shownFrom}–${shownTo} of ${totalFiltered}</span>
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
            ${admPaginationFooter(_admStudentsPage, totalPages, 'admStudentsSetPage')}
        </div>
    `;
}

function admStudentsSetPage(p) { _admStudentsPage = p; renderAdminStudents(); }
window.admStudentsSetPage = admStudentsSetPage;

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
    const student = (allStudents || []).find(s => s._id === studentId || s.id === studentId);
    if (!student) return;
    const f = studentFinanceByAdm[student.admissionNumber] || {};
    const balance = Number(f.balance || 0);
    const owing = balance > 0;
    const initial = escapeHtml((student.name || '?').trim().charAt(0).toUpperCase() || '?');

    const row = (label, value) => `
        <div style="display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:1px solid var(--border-default)">
            <span style="color:var(--text-muted);font-size:13px">${label}</span>
            <span class="td-strong" style="font-size:13.5px;text-align:right">${value}</span>
        </div>`;

    const modal = document.createElement('div');
    modal.id = 'view-student-modal';
    modal.className = 'adm-modal-overlay';
    modal.addEventListener('click', (e) => { if (e.target === modal) closeViewStudentModal(); });
    modal.innerHTML = `
        <div class="adm-modal">
            <div class="adm-modal__head">
                <span class="adm-modal__title">Student Details</span>
                <button class="admin-iconbtn" onclick="closeViewStudentModal()"><i class="ri-close-line"></i></button>
            </div>
            <div class="adm-modal__body">
                <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
                    <div style="width:52px;height:52px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:22px;color:var(--maroon);background:color-mix(in srgb, var(--maroon) 12%, transparent)">${initial}</div>
                    <div style="min-width:0">
                        <div class="td-strong" style="font-size:16px">${escapeHtml(student.name || '')}</div>
                        <div style="color:var(--text-muted);font-size:13px">${escapeHtml(student.admissionNumber || 'N/A')}</div>
                    </div>
                    <span class="pill ${owing ? 'pill--error' : 'pill--success'}" style="margin-left:auto">${owing ? 'Owing' : 'Cleared'}</span>
                </div>
                ${row('Course', escapeHtml(formatCourseName(student.course)))}
                ${row('Department', escapeHtml(formatDepartmentName(student.department)))}
                ${row('Module', `M${student.module || 1}`)}
                ${row('Phone', escapeHtml(student.phoneNumber || '—'))}
                ${row('Email', escapeHtml(student.email || '—'))}
                ${row('Expected', formatCurrency(f.expected || 0))}
                ${row('Paid', formatCurrency(f.paid || 0))}
                <div style="display:flex;justify-content:space-between;gap:16px;padding:11px 0 2px">
                    <span style="color:var(--text-muted);font-size:13px">Balance</span>
                    <span class="td-strong" style="font-size:15px;color:${owing ? 'var(--error)' : 'var(--success)'}">${formatCurrency(balance)}</span>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;padding-top:14px;border-top:1px solid var(--border-default)">
                    <button class="adm-btn adm-btn--outline" onclick="closeViewStudentModal()">Close</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

function closeViewStudentModal() {
    const m = document.getElementById('view-student-modal');
    if (m) m.remove();
}
window.closeViewStudentModal = closeViewStudentModal;

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

// ─────────────────────────────────────────────────────────────────────────
// Add Student — a faithful port of the registrar admission flow (same fields,
// same DB-backed Catalog course/department wiring, same grade/module rules,
// same POST /students/register endpoint). Restyled with the admin .adm-* layer.
// ─────────────────────────────────────────────────────────────────────────
const AS_MAX_MODULE_BY_LEVEL = { 3: 1, 4: 2, 5: 4, 6: 6 };
const AS_GRADE_DROPDOWN_ORDER = ['E', 'KCPE', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+'];
const AS_ALLOWED_GRADES_BY_LEVEL = { 3: ['KCPE'], 4: ['E', 'D-'], 5: ['D', 'D+'], 6: ['C-', 'C', 'C+', 'B-', 'B', 'B+'] };

function asExtractLevel(course) {
    if (!course) return null;
    const m = String(course).match(/(\d+)$/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
}
function asAllowedGrades(level) {
    const list = AS_ALLOWED_GRADES_BY_LEVEL[Number(level)];
    return list ? list.slice() : [];
}

function openAddStudentModal() {
    if (document.getElementById('add-student-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'add-student-modal';
    modal.className = 'adm-modal-overlay';
    modal.addEventListener('click', (e) => { if (e.target === modal) closeAddStudentModal(); });
    modal.innerHTML = `
        <div class="adm-modal" style="max-width:680px">
            <div class="adm-modal__head">
                <span class="adm-modal__title">New Student Admission</span>
                <button class="admin-iconbtn" onclick="closeAddStudentModal()"><i class="ri-close-line"></i></button>
            </div>
            <div class="adm-modal__body">
                <form id="add-student-form" onsubmit="handleAdminAdmission(event)" class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label class="adm-label">Full Name *</label>
                        <input type="text" name="name" required class="adm-input">
                    </div>
                    <div>
                        <label class="adm-label">ID / Birth Certificate Number *</label>
                        <input type="text" name="idNumber" required class="adm-input">
                    </div>
                    <div>
                        <label class="adm-label">Phone Number *</label>
                        <input type="tel" name="phonenumber" required pattern="[0-9]{10}" placeholder="0712345678" class="adm-input">
                    </div>
                    <div>
                        <label class="adm-label">Email (optional)</label>
                        <input type="email" name="email" placeholder="student@example.com" class="adm-input">
                    </div>
                    <div>
                        <label class="adm-label">Admission Type *</label>
                        <select name="admissionType" required class="adm-select">
                            <option value="">Select Admission Type</option>
                            <option value="walk-in">Walk-in</option>
                            <option value="KUCCPS">KUCCPS</option>
                        </select>
                    </div>
                    <div>
                        <label class="adm-label">Module *</label>
                        <select name="module" id="as-module" required class="adm-select">
                            <option value="1" selected>Module 1</option>
                            <option value="2">Module 2</option>
                            <option value="3">Module 3</option>
                            <option value="4">Module 4</option>
                            <option value="5">Module 5</option>
                            <option value="6">Module 6</option>
                        </select>
                    </div>
                    <div>
                        <label class="adm-label">Intake *</label>
                        <select name="intake" id="as-intake" required class="adm-select" onchange="asUpdateIntakeYear()">
                            <option value="">Select Intake</option>
                            <option value="january">January</option>
                            <option value="may">May</option>
                            <option value="september">September</option>
                        </select>
                    </div>
                    <div>
                        <label class="adm-label">Intake Year *</label>
                        <input type="number" name="intakeYear" id="as-intake-year" class="adm-input" readonly required>
                    </div>
                    <div>
                        <label class="adm-label">Course *</label>
                        <select name="course" id="as-course" required onchange="asHandleCourseSelection()" class="adm-select">
                            <option value="">Select Course</option>
                        </select>
                    </div>
                    <div>
                        <label class="adm-label">Department</label>
                        <select name="department" id="as-department" required class="adm-select" disabled>
                            <option value="">Auto-selected from course</option>
                        </select>
                    </div>
                    <div>
                        <label class="adm-label">KCSE Grade *</label>
                        <select name="kcseGrade" id="as-grade" required class="adm-select" disabled>
                            <option value="">Select a course first</option>
                        </select>
                        <p id="as-grade-help" class="kpi__note" style="margin-top:5px"></p>
                    </div>
                    <div>
                        <label class="adm-label">Next of Kin Name</label>
                        <input type="text" name="nextOfKinName" placeholder="Parent/Guardian name" class="adm-input">
                    </div>
                    <div>
                        <label class="adm-label">Next of Kin Phone</label>
                        <input type="tel" name="nextOfKinPhone" pattern="[0-9]{10}" placeholder="0712345678" class="adm-input">
                    </div>
                    <div class="md:col-span-2">
                        <label class="adm-label">Admission Number (auto-assigned)</label>
                        <input type="text" id="as-admission-number" readonly class="adm-input" placeholder="Will be allocated on submit" style="background:var(--bg-muted)">
                    </div>
                    <div class="md:col-span-2" style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px;padding-top:14px;border-top:1px solid var(--border-default)">
                        <button type="button" onclick="closeAddStudentModal()" class="adm-btn adm-btn--outline">Cancel</button>
                        <button type="submit" class="adm-btn adm-btn--primary"><i class="ri-user-add-line"></i> Register Student</button>
                    </div>
                </form>
            </div>
        </div>`;
    document.body.appendChild(modal);

    // Populate course + department dropdowns from the DB-backed catalog (Rule 7).
    if (window.Catalog) {
        window.Catalog.ready().then(() => {
            window.Catalog.populateCourseSelect(document.getElementById('as-course'), { grouped: true, blankLabel: 'Select Course' });
            window.Catalog.populateDepartmentSelect(document.getElementById('as-department'), { includeAll: true, allLabel: 'Auto-selected from course' });
        });
    }
    asPopulateGradeDropdown(null);
}

function closeAddStudentModal() {
    const m = document.getElementById('add-student-modal');
    if (m) m.remove();
}

function asHandleCourseSelection() {
    const courseSelect = document.getElementById('as-course');
    const departmentSelect = document.getElementById('as-department');
    const selectedCourse = courseSelect.value;
    const program = (window.Catalog && selectedCourse) ? window.Catalog.programByCode(selectedCourse) : null;
    if (program) {
        departmentSelect.value = program.departmentCode || '';
        asPopulateGradeDropdown(program.level || asExtractLevel(selectedCourse));
        asRefreshAdmissionPreview();
    } else {
        departmentSelect.value = '';
        asPopulateGradeDropdown(null);
        const f = document.getElementById('as-admission-number');
        if (f) f.value = '';
    }
}

function asPopulateGradeDropdown(level) {
    const select = document.getElementById('as-grade');
    const help = document.getElementById('as-grade-help');
    if (!select) return;
    if (!level) {
        select.innerHTML = '<option value="">Select a course first</option>';
        select.disabled = true;
        if (help) help.textContent = '';
        return;
    }
    const allowed = asAllowedGrades(level);
    const previous = select.value;
    const optionGrades = AS_GRADE_DROPDOWN_ORDER.filter(g => allowed.includes(g));
    const parts = ['<option value="">Select Grade</option>'];
    for (const g of optionGrades) parts.push(`<option value="${escapeAttr(g)}">${escapeHtml(g)}</option>`);
    select.innerHTML = parts.join('');
    select.disabled = false;
    select.value = (previous && optionGrades.includes(previous)) ? previous : '';
    if (help) help.textContent = `Level ${level} accepts: ${optionGrades.join(', ')}.`;
}

function asUpdateIntakeYear() {
    const intakeSelect = document.getElementById('as-intake');
    const intakeYearInput = document.getElementById('as-intake-year');
    if (!intakeSelect.value) { intakeYearInput.value = ''; asRefreshAdmissionPreview(); return; }
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    let intakeYear = currentYear;
    if (intakeSelect.value === 'january' && currentMonth > 1) intakeYear = currentYear + 1;
    else if (intakeSelect.value === 'may' && currentMonth > 5) intakeYear = currentYear + 1;
    else if (intakeSelect.value === 'september' && currentMonth > 9) intakeYear = currentYear + 1;
    intakeYearInput.value = intakeYear;
    asRefreshAdmissionPreview();
}

async function asRefreshAdmissionPreview() {
    const field = document.getElementById('as-admission-number');
    if (!field) return;
    try {
        const course = document.getElementById('as-course')?.value || '';
        const intake = document.getElementById('as-intake')?.value || '';
        const intakeYear = document.getElementById('as-intake-year')?.value || '';
        const params = new URLSearchParams();
        if (course) params.set('course', course);
        if (intake) params.set('intake', intake);
        if (intakeYear) params.set('intakeYear', intakeYear);
        const url = `${API_BASE}/students/next-admission-number${params.toString() ? '?' + params.toString() : ''}`;
        const res = await authFetch(url);
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const data = await res.json();
        field.value = data.nextAdmissionNumber || '';
    } catch (err) {
        console.error('Error fetching next admission number:', err);
        field.value = '';
    }
}

async function handleAdminAdmission(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const courseValue = formData.get('course');
    const program = (window.Catalog && courseValue) ? window.Catalog.programByCode(courseValue) : null;
    const grade = formData.get('kcseGrade');
    const level = (program && program.level) || asExtractLevel(courseValue);

    if (!grade) { showToast('Please select a KCSE grade.', 'error'); return; }
    const allowed = asAllowedGrades(level);
    if (!allowed.includes(grade)) {
        showToast(`Grade ${grade} is not allowed for a Level ${level} course. Allowed: ${allowed.join(', ')}`, 'error');
        return;
    }
    const moduleInt = parseInt(formData.get('module') || '1', 10);
    const cap = AS_MAX_MODULE_BY_LEVEL[level];
    if (cap && moduleInt > cap) { showToast(`Module ${moduleInt} exceeds Level ${level} max (${cap}).`, 'error'); return; }

    const studentData = {
        name: formData.get('name'),
        idNumber: formData.get('idNumber'),
        kcseGrade: grade,
        course: courseValue,
        department: program ? (program.departmentCode || '') : '',
        module: moduleInt,
        intake: formData.get('intake'),
        intakeYear: formData.get('intakeYear') ? parseInt(formData.get('intakeYear'), 10) : new Date().getFullYear(),
        phoneNumber: formData.get('phonenumber'),
        admissionType: formData.get('admissionType'),
        nextOfKinName: formData.get('nextOfKinName') || null,
        nextOfKinPhone: formData.get('nextOfKinPhone') || null,
        email: formData.get('email') || null,
        role: 'student'
    };

    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="ri-loader-4-line"></i> Registering…'; }
    try {
        const response = await authFetch(`${API_BASE}/students/register`, {
            method: 'POST',
            body: JSON.stringify(studentData)
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || 'Failed to register student');
        const adm = (body.student && body.student.admissionNumber) || '';
        showToast(`Student registered${adm ? ` — ${adm}` : ''}`, 'success');
        closeAddStudentModal();
        // Refresh the cohort + financials so the new row + balances appear.
        await loadStudents();
        await loadStudentFinancials();
        renderAdminStudents();
    } catch (err) {
        console.error('Error registering student:', err);
        showToast(err.message || 'Failed to register student', 'error');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="ri-user-add-line"></i> Register Student'; }
    }
}

window.viewStudent = viewStudent;
window.openAddStudentModal = openAddStudentModal;
window.closeAddStudentModal = closeAddStudentModal;
window.asHandleCourseSelection = asHandleCourseSelection;
window.asUpdateIntakeYear = asUpdateIntakeYear;
window.handleAdminAdmission = handleAdminAdmission;
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
