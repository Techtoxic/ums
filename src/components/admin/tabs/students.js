// tabs/students.js — admin students management.
window.AdminTabs = window.AdminTabs || {};

// (verbatim from adminDashboard.js)
async function displayStudents() {
    const container = document.getElementById('students-table');
    if (!container) {
        console.error('students-table container not found');
        return;
    }

    try {
        // Ensure students are loaded
        if (allStudents.length === 0) {
            await loadStudents();
        }

        // Calculate balance for each student
        const studentsWithBalance = allStudents.map(student => {
            const program = allPrograms.find(p => p.name === getCourseProgram(student.course));
            const programCost = program ? program.programCost : 67189;
            const totalFees = programCost * (student.module || 1);
            const studentPayments = allPayments.filter(p => p.studentId === student.admissionNumber);
            const totalPaid = studentPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
            const balance = totalFees - totalPaid;
            return { ...student, balance };
        });

        // Create responsive table - table on desktop, cards on mobile
        container.innerHTML = `
            <!-- Desktop Table View -->
            <div class="hidden md:block">
                <table class="w-full text-xs">
                    <thead class="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th class="px-2 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Admission</th>
                            <th class="px-2 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Name</th>
                            <th class="px-2 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Course</th>
                            <th class="px-2 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Year</th>
                            <th class="px-2 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Balance</th>
                            <th class="px-2 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        ${studentsWithBalance.map(student => `
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                                <td class="px-2 py-2 text-xs font-medium text-gray-900 dark:text-white">${escapeHtml(student.admissionNumber || 'N/A')}</td>
                                <td class="px-2 py-2">
                                    <div>
                                        <p class="text-xs font-semibold text-gray-900 dark:text-white">${escapeHtml(student.name)}</p>
                                        <p class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(student.phoneNumber || '')}</p>
                                    </div>
                                </td>
                                <td class="px-2 py-2 text-xs text-gray-600 dark:text-gray-300">${escapeHtml(formatCourseName(student.course))}</td>
                                <td class="px-2 py-2">
                                    <span class="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs rounded-full">M${student.module || 1}</span>
                                </td>
                                <td class="px-2 py-2 text-xs font-semibold ${student.balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}">
                                    ${formatCurrency(student.balance)}
                                </td>
                                <td class="px-2 py-2">
                                    <button onclick="viewStudent('${escapeAttr(student._id)}')" class="text-primary hover:text-secondary transition">
                                        <i class="ri-eye-line text-base"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            <!-- Mobile Card View -->
            <div class="md:hidden space-y-2">
                ${studentsWithBalance.map(student => `
                    <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-2 border border-gray-200 dark:border-gray-600">
                        <div class="flex justify-between items-start mb-1.5">
                            <div class="flex-1 min-w-0">
                                <p class="text-xs font-bold text-gray-900 dark:text-white truncate">${escapeHtml(student.name)}</p>
                                <p class="text-xs text-gray-600 dark:text-gray-400">${escapeHtml(student.admissionNumber || 'N/A')}</p>
                            </div>
                            <button onclick="viewStudent('${escapeAttr(student._id)}')" class="ml-2 text-primary hover:text-secondary p-1">
                                <i class="ri-eye-line text-sm"></i>
                            </button>
                        </div>
                        <div class="grid grid-cols-2 gap-1.5 text-xs">
                            <div>
                                <span class="text-gray-500 dark:text-gray-400">Course:</span>
                                <p class="font-medium text-gray-900 dark:text-white truncate">${escapeHtml(formatCourseName(student.course))}</p>
                            </div>
                            <div>
                                <span class="text-gray-500 dark:text-gray-400">Year:</span>
                                <p class="font-medium text-gray-900 dark:text-white">${student.module || 1}</p>
                            </div>
                            <div class="col-span-2">
                                <span class="text-gray-500 dark:text-gray-400">Balance:</span>
                                <p class="font-bold ${student.balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}">${formatCurrency(student.balance)}</p>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

    } catch (error) {
        console.error('Error displaying students:', error);
        container.innerHTML = '<p class="text-red-600 text-center py-8">Error loading students: ' + escapeHtml(error.message) + '</p>';
    }
}

function viewStudent(studentId) {
    const student = allStudents.find(s => s._id === studentId);
    if (!student) return;

    // For now, show an alert with student info
    // In production, this would open a detailed modal
    // Not a DOM/HTML sink — alert() renders plain text, so no escaping here.
    alert(`Student Details:\n\nName: ${student.name}\nAdmission: ${student.admissionNumber}\nCourse: ${formatCourseName(student.course)}\nModule: ${student.module}\nBalance: ${formatCurrency(student.balance || 0)}`);
}

function exportStudents() {
    showToast('Exporting students to Excel...', 'info');
    // In production, this would generate and download Excel file
    setTimeout(() => {
        showToast('Export complete!', 'success');
    }, 2000);
}

function openAddStudentModal() {
    alert('Add Student functionality coming soon!\n\nThis will open a form to register new students with admission letter generation.');
}

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
