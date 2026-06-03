// tabs/students.js — trainer students list + attendance-sheet export.
// Sources students from /api/trainers/:id/attendance-roster, which matches
// students to the trainer's units by cohort (program code + module) since
// unit_registrations is not reliably populated. Supports filtering by Unit
// and/or Module and exporting a printable attendance register (5 P/A columns).
window.TrainerTabs = window.TrainerTabs || {};

// Pagination state for the students list view.
let studentsPage = 1;
const STUDENTS_PAGE_SIZE = 10;

// Attendance-export state: per-unit roster (unitId -> [studentId]) and the
// trainer's units (for the Unit filter dropdown + export labels).
let trainerRegByUnit = {};
let trainerUnitsList = [];

// (verbatim from trainerDashboard.js)
// Load students
async function loadStudents() {
    try {
        console.log('Loading students...');

        // Attendance roster: students matched to the trainer's units by cohort
        // (program code + module). Returns a flat student list, the trainer's
        // units, and a unitId -> [studentId] map for the Unit filter.
        const response = await authFetch(`${API_BASE_URL}/trainers/${currentTrainer._id}/attendance-roster`);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        studentsData = Array.isArray(data.students) ? data.students : [];
        trainerRegByUnit = (data && data.byUnit) || {};
        trainerUnitsList = (data && data.units) || [];
        renderStudentsUnitFilter();

        studentsPage = 1;
        console.log(`Successfully loaded ${studentsData.length} students`);

        // Update stats
        updateStats();

        // Display students if on students section
        if (currentSection === 'students') {
            displayStudents();
        }

    } catch (error) {
        console.error('Error loading students:', error);
        studentsData = [];
        trainerRegByUnit = {};
        updateStats();
        if (currentSection === 'students') {
            displayStudents();
        }
    }
}

// Apply the active Unit + Module filters. Shared by the list view and the
// attendance export so both always agree.
//   - Unit filter (studentsUnitFilter): value is a unitId; keep only students in
//     that unit's roster (trainerRegByUnit, from the attendance-roster endpoint).
//   - Module filter (studentsFilter): value is module1..module6.
// With neither set, returns every student (mixed units/modules).
function getFilteredStudents() {
    const unitId = document.getElementById('studentsUnitFilter')?.value || '';
    const moduleFilter = document.getElementById('studentsFilter')?.value || '';
    let list = [...studentsData];

    if (unitId) {
        const ids = new Set(trainerRegByUnit[unitId] || []);
        list = list.filter(s => ids.has(s.id));
    }
    const m = /^module(\d+)$/.exec(moduleFilter);
    if (m) {
        const moduleNo = Number(m[1]);
        list = list.filter(s => s.module === moduleNo);
    }
    return list;
}

// Display students — paginated list view.
function displayStudents() {
    const filteredStudents = getFilteredStudents();

    const studentsGrid = document.getElementById('studentsGrid');
    const studentsEmptyState = document.getElementById('studentsEmptyState');
    const pagination = document.getElementById('studentsPagination');

    if (filteredStudents.length === 0) {
        studentsGrid.classList.add('hidden');
        pagination?.classList.add('hidden');
        studentsEmptyState.classList.remove('hidden');
        return;
    }

    studentsGrid.classList.remove('hidden');
    studentsEmptyState.classList.add('hidden');

    // Clamp page + slice.
    const totalPages = Math.max(1, Math.ceil(filteredStudents.length / STUDENTS_PAGE_SIZE));
    if (studentsPage > totalPages) studentsPage = totalPages;
    if (studentsPage < 1) studentsPage = 1;
    const start = (studentsPage - 1) * STUDENTS_PAGE_SIZE;
    const pageItems = filteredStudents.slice(start, start + STUDENTS_PAGE_SIZE);

    const headCell = 'text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';
    studentsGrid.innerHTML = `
        <table class="min-w-full text-sm">
            <thead class="border-b border-gray-200 dark:border-gray-700">
                <tr>
                    <th class="${headCell}">Name</th>
                    <th class="${headCell}">Admission No.</th>
                    <th class="${headCell}">Course</th>
                    <th class="${headCell}">Module</th>
                    <th class="${headCell}">Phone Number</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-700/60">
                ${pageItems.map(createStudentRow).join('')}
            </tbody>
        </table>`;

    // renderListPagination is defined in tabs/assignments.js (loaded first).
    if (typeof renderListPagination === 'function') {
        renderListPagination('studentsPagination', filteredStudents.length, studentsPage, totalPages, start, pageItems.length, 'studentsGoToPage');
    }
}

// One student as a table row.
function createStudentRow(student) {
    const admissionNumber = student.admissionNumber || student.studentId || 'N/A';
    const moduleStr = student.module ? `Module ${student.module}` : 'N/A';
    const phone = student.phoneNumber || student.phone || 'N/A';
    const cell = 'px-3 py-2 align-middle text-gray-900 dark:text-gray-100';
    return `
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
            <td class="${cell} font-medium">${escapeHtml(student.name)}</td>
            <td class="${cell} text-gray-600 dark:text-gray-400">${escapeHtml(admissionNumber)}</td>
            <td class="${cell}">${escapeHtml(formatCourseName(student.course))}</td>
            <td class="${cell}">${escapeHtml(moduleStr)}</td>
            <td class="${cell} text-gray-600 dark:text-gray-400">${escapeHtml(phone)}</td>
        </tr>
    `;
}

function studentsGoToPage(p) {
    studentsPage = p;
    displayStudents();
}
window.studentsGoToPage = studentsGoToPage;

async function refreshStudents() {
    await loadStudents();
    showToast('Students refreshed successfully', 'success');
}

// Render the Unit filter from the roster's units (loaded by loadStudents).
function renderStudentsUnitFilter() {
    const sel = document.getElementById('studentsUnitFilter');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">All Units</option>' + (trainerUnitsList || []).map(u => {
        const label = (u.code ? u.code + ' — ' : '') + u.name + (u.module ? ` (Module ${u.module})` : '');
        return `<option value="${escapeAttr(u.id)}">${escapeHtml(label)}</option>`;
    }).join('');
    if (current) sel.value = current;
}

// Export the currently-filtered students as a printable attendance register:
// branded letterhead, then a table with 5 blank lesson columns (L1..L5) for
// manual P/A marking. Honors the Unit + Module filters (or all students).
async function exportAttendancePDF() {
    if (!window.EDTTIDocs || !window.jspdf) {
        showToast('PDF library not loaded yet — please retry in a moment', 'error');
        return;
    }
    const list = getFilteredStudents().slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (!list.length) {
        showToast('No students match the current filters', 'error');
        return;
    }

    const unitId = document.getElementById('studentsUnitFilter')?.value || '';
    const moduleFilter = document.getElementById('studentsFilter')?.value || '';
    const unit = trainerUnitsList.find(u => u.id === unitId);
    const mMatch = /^module(\d+)$/.exec(moduleFilter);
    const moduleNo = mMatch ? Number(mMatch[1]) : null;

    const trainerName = (typeof currentTrainer !== 'undefined' && currentTrainer && currentTrainer.name) || '';
    const scopeUnit = unit ? ((unit.code ? unit.code + ' — ' : '') + unit.name) : 'All Units';
    const scopeModule = moduleNo ? `Module ${moduleNo}` : 'All Modules';

    try {
        await window.EDTTIDocs.loadLogo();
        const doc = window.EDTTIDocs.newDoc(true); // landscape — room to mark
        doc.setProperties({ title: 'Class Attendance Register', author: 'EDTTI UMS', creator: 'EDTTI UMS' });
        let y = window.EDTTIDocs.letterhead(doc, {
            title: 'Class Attendance Register',
            subtitle: `Trainer: ${trainerName || 'N/A'}`,
            landscape: true,
        });

        // Context band.
        doc.autoTable({
            body: [
                ['Unit', scopeUnit],
                ['Module', scopeModule],
                ['Total Students', String(list.length)],
                ['Generated', new Date().toLocaleString()],
            ],
            startY: y,
            theme: 'plain',
            styles: { fontSize: 9, cellPadding: 1.2 },
            columnStyles: { 0: { fontStyle: 'bold', textColor: window.EDTTIDocs.MAROON, cellWidth: 40 } },
            margin: { left: 12, right: 12 },
        });
        y = doc.lastAutoTable.finalY + 5;

        const rows = list.map((s, i) => [
            String(i + 1),
            s.name || '',
            s.admissionNumber || s.studentId || '',
            s.module != null ? String(s.module) : '',
            '', '', '', '', '',
        ]);

        doc.autoTable({
            head: [['#', 'Student Name', 'Admission No.', 'Module', 'L1', 'L2', 'L3', 'L4', 'L5']],
            body: rows,
            startY: y,
            theme: 'grid',
            styles: { fontSize: 9, cellPadding: 2.5, valign: 'middle' },
            headStyles: { fillColor: window.EDTTIDocs.MAROON, textColor: 255, fontStyle: 'bold', halign: 'center' },
            alternateRowStyles: { fillColor: window.EDTTIDocs.CREAM },
            columnStyles: {
                0: { cellWidth: 10, halign: 'center' },
                1: { cellWidth: 62 },
                2: { cellWidth: 34 },
                3: { cellWidth: 18, halign: 'center' },
                4: { cellWidth: 22, halign: 'center' },
                5: { cellWidth: 22, halign: 'center' },
                6: { cellWidth: 22, halign: 'center' },
                7: { cellWidth: 22, halign: 'center' },
                8: { cellWidth: 22, halign: 'center' },
            },
            margin: { left: 12, right: 12 },
        });

        window.EDTTIDocs.decorate(doc, { footer: 'EDTTI UMS — Attendance Register · mark P = Present, A = Absent · L1–L5 = lessons' });
        window.EDTTIDocs.lockDocument(doc);
        const tag = unit ? (unit.code || 'unit') : (moduleNo ? `module${moduleNo}` : 'all');
        doc.save(`attendance_${tag}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
        console.error('attendance export failed:', err);
        showToast('Failed to export attendance: ' + err.message, 'error');
    }
}
window.exportAttendancePDF = exportAttendancePDF;

window.TrainerTabs.students = {
    init() {
        currentSection = 'students';
        if (!window.__trStudentsWired) {
            window.__trStudentsWired = true;
            const f = document.getElementById('studentsFilter');
            if (f) f.addEventListener('change', () => { studentsPage = 1; displayStudents(); });
            const u = document.getElementById('studentsUnitFilter');
            if (u) u.addEventListener('change', () => { studentsPage = 1; displayStudents(); });
        }
        loadStudents();
    }
};
