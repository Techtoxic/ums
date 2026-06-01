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

    studentsGrid.innerHTML = pageItems.map(createStudentRow).join('');

    // renderListPagination is defined in tabs/assignments.js (loaded first).
    if (typeof renderListPagination === 'function') {
        renderListPagination('studentsPagination', filteredStudents.length, studentsPage, totalPages, start, pageItems.length, 'studentsGoToPage');
    }
}

// One student as a list row.
function createStudentRow(student) {
    const admissionNumber = student.admissionNumber || student.studentId || 'N/A';
    const moduleStr = student.module ? `Module ${student.module}` : 'N/A';
    const email = student.email || 'N/A';
    const intake = student.intake || 'N/A';

    return `
        <div class="flex items-center gap-4 py-3 px-1 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
            <div class="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                <i class="ri-user-line text-primary"></i>
            </div>
            <div class="flex-1 min-w-0">
                <div class="font-semibold text-gray-900 dark:text-white truncate">${escapeHtml(student.name)}</div>
                <div class="text-xs text-gray-500 dark:text-gray-500 truncate">
                    ${escapeHtml(admissionNumber)} · ${escapeHtml(formatCourseName(student.course))} · ${escapeHtml(moduleStr)} · Intake: ${escapeHtml(intake)}
                </div>
            </div>
            <div class="hidden sm:block text-xs text-gray-500 dark:text-gray-400 truncate max-w-[180px]">${escapeHtml(email)}</div>
        </div>
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
