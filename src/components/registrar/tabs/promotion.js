// tabs/promotion.js — student promotion: eligibility list + promote actions.
//
// Fetches the entire student list (all=1) so a registrar can quickly scan
// who is promotable; for very large tenants the load tab can be paginated
// later, but the use case today is "load the entire cohort, then promote in
// bulk". Module, level and department filters apply on top of the loaded set.
window.RegistrarTabs = window.RegistrarTabs || {};

let promotionStudents = [];

function showPromotionSection() { switchTab('promotion'); }

async function loadPromotionStudents() {
    try {
        const levelFilter = document.getElementById('levelFilter') ? document.getElementById('levelFilter').value : 'all';
        const deptFilter = document.getElementById('deptFilter') ? document.getElementById('deptFilter').value : 'all';
        const moduleFilter = document.getElementById('promotionModuleFilter') ? document.getElementById('promotionModuleFilter').value : 'all';

        // Server-side filtering for department + module reduces what we have
        // to scan client-side; level is computed from the course code, so we
        // still filter level client-side.
        const params = new URLSearchParams({ all: '1' });
        if (deptFilter && deptFilter !== 'all') params.set('department', deptFilter);
        if (moduleFilter && moduleFilter !== 'all') params.set('module', moduleFilter);

        const response = await window.AUTH.fetch(`${API_BASE_URL}/students?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch students');
        const body = await response.json();
        const students = Array.isArray(body.students) ? body.students : [];

        const filteredStudents = students.filter(student => {
            const level = extractLevelFromCourse(student.course);
            const levelMatch = levelFilter === 'all' || String(level) === String(levelFilter);
            return levelMatch;
        });

        promotionStudents = filteredStudents;
        displayPromotionStudents(filteredStudents);
        showToast(`Loaded ${filteredStudents.length} student${filteredStudents.length === 1 ? '' : 's'}`, 'success');
    } catch (error) {
        console.error('Error loading promotion students:', error);
        showToast('Failed to load students for promotion', 'error');
    }
}

function isStudentEligibleForPromotion(student) {
    const level = extractLevelFromCourse(student.course);
    const cap = MAX_MODULE_BY_LEVEL[level];
    if (!cap) return false;
    const currentModule = Number(student.module || 0);
    return currentModule >= 1 && currentModule < cap;
}

function displayPromotionStudents(students) {
    const tbody = document.getElementById('promotionTableBody');
    if (!tbody) return;

    if (!students.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="px-6 py-4 text-center text-gray-500">No students match the filters.</td>
            </tr>`;
        return;
    }

    tbody.innerHTML = students.map(student => {
        const level = extractLevelFromCourse(student.course);
        const cap = MAX_MODULE_BY_LEVEL[level];
        const currentModule = Number(student.module || 0);
        const isEligible = isStudentEligibleForPromotion(student);
        const courseDisplay = (window.Catalog ? window.Catalog.formatCourseName(student.course) : String(student.course || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
        const departmentDisplay = (window.Catalog ? window.Catalog.departmentName(student.department) : String(student.department || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
        const statusBadge = isEligible
            ? `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Eligible → Module ${currentModule + 1}</span>`
            : `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Max Module Reached</span>`;
        const actionBtn = isEligible
            ? `<button onclick="promoteSingleStudent('${escapeAttr(student._id)}', ${currentModule})" class="text-primary hover:text-secondary font-medium">Promote</button>`
            : `<button disabled class="text-gray-400 cursor-not-allowed font-medium" title="Student is at the level cap">Promote</button>`;

        return `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td class="px-6 py-4 whitespace-nowrap">
                    <input type="checkbox" class="student-checkbox rounded border-gray-300" value="${escapeAttr(student._id)}" ${isEligible ? '' : 'disabled'}>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center">
                        <div class="flex-shrink-0 h-10 w-10">
                            <div class="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <i class="ri-user-line text-primary"></i>
                            </div>
                        </div>
                        <div class="ml-4">
                            <div class="text-sm font-medium text-gray-900 dark:text-white">${escapeHtml(student.name)}</div>
                            <div class="text-sm text-gray-500 dark:text-gray-400 font-mono">${escapeHtml(student.admissionNumber)}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-900 dark:text-white">${escapeHtml(courseDisplay)}</div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">${escapeHtml(departmentDisplay)}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">Module ${currentModule || '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">Level ${level || 'Unknown'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">${cap || '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap">${statusBadge}</td>
                <td class="px-6 py-4 whitespace-nowrap">${actionBtn}</td>
            </tr>
        `;
    }).join('');
}

function toggleAllStudents() {
    const selectAll = document.getElementById('selectAll');
    const checkboxes = document.querySelectorAll('#promotionTableBody .student-checkbox:not([disabled])');
    checkboxes.forEach(checkbox => { checkbox.checked = selectAll.checked; });
}

async function promoteSingleStudent(studentId, currentModule) {
    const student = promotionStudents.find(s => s._id === studentId);
    if (!student) return;
    if (!isStudentEligibleForPromotion(student)) {
        showToast('Student is at the level cap and cannot be promoted further.', 'error');
        return;
    }
    try {
        const response = await window.AUTH.fetch(`${API_BASE_URL}/students/${studentId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ module: currentModule + 1 }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
            showToast(`Promoted ${student.name} to Module ${currentModule + 1}`, 'success');
            loadPromotionStudents();
        } else {
            throw new Error(data.message || 'Failed to promote student');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function promoteAllStudents() {
    const selectedCheckboxes = document.querySelectorAll('#promotionTableBody .student-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        showToast('Select at least one student to promote.', 'warning');
        return;
    }
    const selectedStudentIds = Array.from(selectedCheckboxes).map(cb => cb.value);
    const studentsToPromote = promotionStudents.filter(s => selectedStudentIds.includes(s._id) && isStudentEligibleForPromotion(s));

    const progressContainer = document.getElementById('promotionProgress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    progressContainer.classList.remove('hidden');

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < studentsToPromote.length; i++) {
        const student = studentsToPromote[i];
        const progress = ((i + 1) / studentsToPromote.length) * 100;
        progressBar.style.width = `${progress}%`;
        progressText.textContent = `${i + 1} of ${studentsToPromote.length} processed`;

        try {
            const response = await window.AUTH.fetch(`${API_BASE_URL}/students/${student._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ module: Number(student.module || 0) + 1 }),
            });
            if (response.ok) successCount++;
            else errorCount++;
        } catch (error) {
            console.error(`Error promoting ${student.name}:`, error);
            errorCount++;
        }
        await new Promise(resolve => setTimeout(resolve, 80));
    }

    progressContainer.classList.add('hidden');
    if (successCount > 0) showToast(`Successfully promoted ${successCount} student${successCount === 1 ? '' : 's'}`, 'success');
    if (errorCount > 0) showToast(`${errorCount} student${errorCount === 1 ? '' : 's'} failed to promote`, 'error');
    loadPromotionStudents();
}

window.loadPromotionStudents = loadPromotionStudents;
window.toggleAllStudents = toggleAllStudents;
window.promoteAllStudents = promoteAllStudents;
window.promoteSingleStudent = promoteSingleStudent;

window.RegistrarTabs.promotion = {
    init() {
        // Append department options from the DB-backed catalog (Rule 7); the
        // static "All Departments" (value="all") option stays first.
        const deptFilterEl = document.getElementById('deptFilter');
        if (deptFilterEl && window.Catalog && !deptFilterEl.dataset.catalogFilled) {
            for (const d of window.Catalog.getDepartments()) {
                const o = document.createElement('option');
                o.value = d.textCode || d.code;
                o.textContent = d.name;
                deptFilterEl.appendChild(o);
            }
            deptFilterEl.dataset.catalogFilled = '1';
        }
        loadPromotionStudents();
    },
};
