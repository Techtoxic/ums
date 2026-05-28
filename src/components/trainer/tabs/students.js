// tabs/students.js — trainer students list.
// NOTE: the /api/trainers/:id/students endpoint is a known pre-existing 500;
// this tab preserves that broken behaviour. Not a regression.
window.TrainerTabs = window.TrainerTabs || {};

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
        
        console.log(`Successfully loaded ${studentsData.length} students`);
        console.log('Students data:', studentsData.map(s => ({ name: s.name, course: s.course })));
        
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

// Display students
function displayStudents() {
    console.log('Displaying students...');
    
    const filter = document.getElementById('studentsFilter')?.value || '';
    let filteredStudents = [...studentsData];
    
    // Apply filter
    if (filter === 'module1') {
        filteredStudents = studentsData.filter(s => s.module === 1);
    } else if (filter === 'module2') {
        filteredStudents = studentsData.filter(s => s.module === 2);
    } else if (filter === 'module3') {
        filteredStudents = studentsData.filter(s => s.module === 3);
    } else if (filter === 'module4') {
        filteredStudents = studentsData.filter(s => s.module === 4);
    } else if (filter === 'module5') {
        filteredStudents = studentsData.filter(s => s.module === 5);
    } else if (filter === 'module6') {
        filteredStudents = studentsData.filter(s => s.module === 6);
    }
    
    const studentsGrid = document.getElementById('studentsGrid');
    const studentsEmptyState = document.getElementById('studentsEmptyState');
    
    if (filteredStudents.length === 0) {
        studentsGrid.classList.add('hidden');
        studentsEmptyState.classList.remove('hidden');
        return;
    }
    
    studentsGrid.classList.remove('hidden');
    studentsEmptyState.classList.add('hidden');
    
    studentsGrid.innerHTML = filteredStudents.map(student => createStudentCard(student)).join('');
    
    console.log(`Displayed ${filteredStudents.length} students`);
}

// Create student card HTML
function createStudentCard(student) {
    const admissionNumber = student.admissionNumber || student.studentId || 'N/A';
    const moduleStr = student.module ? `Module ${student.module}` : 'N/A';
    const email = student.email || 'N/A';
    const intake = student.intake || 'N/A';
    
    return `
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 card-hover">
            <div class="flex items-center space-x-4 mb-4">
                <div class="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <i class="ri-user-line text-primary text-xl"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-gray-900 dark:text-white truncate">${escapeHtml(student.name)}</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-400 truncate">${escapeHtml(formatCourseName(student.course))}</p>
                        </div>
                    </div>
                    
                        <div class="space-y-2">
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600 dark:text-gray-400">Admission No:</span>
                    <span class="font-medium text-gray-900 dark:text-white">${escapeHtml(admissionNumber)}</span>
                        </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600 dark:text-gray-400">Module:</span>
                    <span class="font-medium text-gray-900 dark:text-white">${escapeHtml(moduleStr)}</span>
                    </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600 dark:text-gray-400">Intake:</span>
                    <span class="font-medium text-gray-900 dark:text-white">${escapeHtml(intake)}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600 dark:text-gray-400">Email:</span>
                    <span class="font-medium text-gray-900 dark:text-white text-xs truncate">${escapeHtml(email)}</span>
                        </div>
                    </div>
            
            <div class="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                <div class="text-xs text-gray-500 dark:text-gray-500 truncate">
                    Course: ${escapeHtml(formatCourseName(student.course))}
                </div>
            </div>
        </div>
    `;
}

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
            if (f) f.addEventListener('change', displayStudents);
        }
        loadStudents();
    }
};
