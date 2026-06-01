// tabs/students.js — trainer students list.
// NOTE: the /api/trainers/:id/students endpoint is a known pre-existing 500;
// this tab preserves that broken behaviour. Not a regression.
window.TrainerTabs = window.TrainerTabs || {};

// Pagination state for the students list view.
let studentsPage = 1;
const STUDENTS_PAGE_SIZE = 10;

// (verbatim from trainerDashboard.js)
// Load students
async function loadStudents() {
    try {
        console.log('Loading students...');
        
        const response = await authFetch(`${API_BASE_URL}/trainers/${currentTrainer._id}/students`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }
        
            const data = await response.json();
        
        // Handle the API response structure: { students: {courseCode: [student1, student2]}, totalStudents: X }
        if (data.students && typeof data.students === 'object') {
            // Flatten the students object into an array
            studentsData = [];
            for (const courseCode in data.students) {
                if (Array.isArray(data.students[courseCode])) {
                    studentsData.push(...data.students[courseCode]);
                }
            }
        } else {
            studentsData = Array.isArray(data) ? data : [];
        }
        
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
        updateStats();
        if (currentSection === 'students') {
            displayStudents();
        }
    }
}

// Display students — paginated list view.
function displayStudents() {
    const filter = document.getElementById('studentsFilter')?.value || '';
    let filteredStudents = [...studentsData];

    // Apply module filter (values are module1..module6).
    const m = /^module(\d+)$/.exec(filter);
    if (m) {
        const moduleNo = Number(m[1]);
        filteredStudents = studentsData.filter(s => s.module === moduleNo);
    }

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

window.TrainerTabs.students = {
    init() {
        currentSection = 'students';
        if (!window.__trStudentsWired) {
            window.__trStudentsWired = true;
            const f = document.getElementById('studentsFilter');
            if (f) f.addEventListener('change', () => { studentsPage = 1; displayStudents(); });
        }
        loadStudents();
    }
};
