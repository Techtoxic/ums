// tabs/students.js — dean student welfare list: search/filter + per-student actions.
window.DeanTabs = window.DeanTabs || {};

// (verbatim from deanDashboard.js)
// Load departments
async function loadDepartments() {
    try {
        const response = await authFetch(`${API_BASE}/programs`);
        if (!response.ok) throw new Error('Failed to load departments');
        
        const programs = await response.json();
        const departments = [...new Set(programs.map(p => p.departmentName).filter(Boolean))].sort();
        
        const select = document.getElementById('filter-department');
        departments.forEach(dept => {
            const option = document.createElement('option');
            option.value = dept;
            option.textContent = dept;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading departments:', error);
    }
}

// Load students with filters
async function loadStudents() {
    try {
        const search = document.getElementById('search-student').value.trim();
        const department = document.getElementById('filter-department').value;
        const moduleFilter = document.getElementById('filter-module').value;
        const intake = document.getElementById('filter-intake').value;
        
        let url = `${API_BASE}/dean/students?`;
        if (search) url += `search=${encodeURIComponent(search)}&`;
        if (department) url += `department=${encodeURIComponent(department)}&`;
        if (moduleFilter) url += `module=${moduleFilter}&`;
        if (intake) url += `intake=${intake}&`;
        
        const response = await authFetch(url);
        if (!response.ok) throw new Error('Failed to load students');
        
        const students = await response.json();
        displayStudents(students);
    } catch (error) {
        console.error('Error loading students:', error);
        showNotification('Failed to load students', 'error');
    }
}

// Display students in table
function displayStudents(students) {
    const tbody = document.getElementById('students-table-body');
    
    if (students.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-12 text-center text-gray-500">
                    <i class="ri-inbox-line text-4xl mb-4"></i>
                    <p>No students found</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = students.map(student => `
        <tr class="hover:bg-gray-50 transition">
            <td class="px-6 py-4">
                <div class="flex items-center">
                    <div class="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center mr-3">
                        <i class="ri-user-line text-purple-600"></i>
                    </div>
                    <div>
                        <div class="font-medium text-gray-900">${escapeHtml(student.name)}</div>
                        <div class="text-sm text-gray-500">${escapeHtml(student.idNumber)}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${escapeHtml(student.admissionNumber)}</td>
            <td class="px-6 py-4">
                <div class="text-sm text-gray-900">${escapeHtml(formatCourseName(student.course))}</div>
                <div class="text-xs text-gray-500">${escapeHtml(student.department)}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                    Module ${escapeHtml(student.module)}
                </span>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm text-gray-900">${escapeHtml(student.phoneNumber)}</div>
                <div class="text-xs text-gray-500">${escapeHtml(student.email || 'No email')}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                <button onclick='openAddNoteModal(${escapeAttr(JSON.stringify(student))})'
                    class="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition">
                    <i class="ri-add-line mr-1"></i>Add Note
                </button>
                <button onclick='viewStudentNotes("${escapeAttr(student.admissionNumber)}")'
                    class="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition">
                    <i class="ri-eye-line mr-1"></i>View Notes
                </button>
            </td>
        </tr>
    `).join('');
}

window.DeanTabs.students = {
    init() {
        loadStudents();
        loadDepartments();
        // Wire the search box + refresh once (cached partial persists across revisits).
        if (window.__deanStudentsWired) return;
        window.__deanStudentsWired = true;
        const searchEl = document.getElementById('search-student');
        if (searchEl) searchEl.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') loadStudents();
        });
    }
};
