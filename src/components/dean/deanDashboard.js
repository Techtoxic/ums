// Dean Dashboard JavaScript
const API_BASE = '/api';
let currentStudent = null;
let currentNoteFilter = 'all';
let allStudentNotes = [];

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    // Load dean info
    const deanData = JSON.parse(sessionStorage.getItem('deanData')) || {};
    document.getElementById('dean-name').textContent = deanData.name || 'Dean';
    
    // Load initial students
    loadStudents();
    
    // Setup navigation
    setupNavigation();
    
    // Setup search on Enter key
    document.getElementById('search-student').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') loadStudents();
    });
    
    // Load departments for filter
    loadDepartments();
});

// Setup navigation
function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.content-section');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            
            // Update active states
            navLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            
            sections.forEach(s => s.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
        });
    });
}

// Load departments
async function loadDepartments() {
    try {
        const response = await fetch(`${API_BASE}/programs`);
        if (!response.ok) throw new Error('Failed to load departments');
        
        const programs = await response.json();
        const departments = [...new Set(programs.map(p => p.department))].sort();
        
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
        const year = document.getElementById('filter-year').value;
        const intake = document.getElementById('filter-intake').value;
        
        let url = `${API_BASE}/dean/students?`;
        if (search) url += `search=${encodeURIComponent(search)}&`;
        if (department) url += `department=${encodeURIComponent(department)}&`;
        if (year) url += `year=${year}&`;
        if (intake) url += `intake=${intake}&`;
        
        const response = await fetch(url);
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
                        <div class="font-medium text-gray-900">${student.name}</div>
                        <div class="text-sm text-gray-500">${student.idNumber}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${student.admissionNumber}</td>
            <td class="px-6 py-4">
                <div class="text-sm text-gray-900">${formatCourseName(student.course)}</div>
                <div class="text-xs text-gray-500">${student.department}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                    Year ${student.year}
                </span>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm text-gray-900">${student.phoneNumber}</div>
                <div class="text-xs text-gray-500">${student.email || 'No email'}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                <button onclick='openAddNoteModal(${JSON.stringify(student)})' 
                    class="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition">
                    <i class="ri-add-line mr-1"></i>Add Note
                </button>
                <button onclick='viewStudentNotes("${student.admissionNumber}")' 
                    class="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition">
                    <i class="ri-eye-line mr-1"></i>View Notes
                </button>
            </td>
        </tr>
    `).join('');
}

// Open add note modal
function openAddNoteModal(student) {
    currentStudent = student;
    document.getElementById('modal-student-name').textContent = `${student.name} (${student.admissionNumber})`;
    
    // Reset form
    document.querySelector('input[name="noteType"][value="private"]').checked = true;
    document.getElementById('note-category').value = 'welfare';
    document.getElementById('note-priority').value = 'medium';
    document.getElementById('note-title').value = '';
    document.getElementById('note-content').value = '';
    
    document.getElementById('add-note-modal').classList.remove('hidden');
    document.getElementById('add-note-modal').classList.add('flex');
}

// Close add note modal
function closeAddNoteModal() {
    document.getElementById('add-note-modal').classList.add('hidden');
    document.getElementById('add-note-modal').classList.remove('flex');
    currentStudent = null;
}

// Save note
async function saveNote() {
    if (!currentStudent) return;
    
    const noteType = document.querySelector('input[name="noteType"]:checked').value;
    const title = document.getElementById('note-title').value.trim();
    const content = document.getElementById('note-content').value.trim();
    const category = document.getElementById('note-category').value;
    const priority = document.getElementById('note-priority').value;
    
    if (!title || !content) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    try {
        const deanData = JSON.parse(sessionStorage.getItem('deanData')) || {};
        
        const response = await fetch(`${API_BASE}/dean/students/${encodeURIComponent(currentStudent.admissionNumber)}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                noteType,
                title,
                content,
                category,
                priority,
                createdBy: {
                    userId: deanData.id || 'dean',
                    userName: deanData.name || 'Dean',
                    userRole: 'dean'
                }
            })
        });
        
        if (!response.ok) throw new Error('Failed to save note');
        
        const result = await response.json();
        showNotification(`${noteType === 'private' ? 'Private' : 'Public'} note added successfully`, 'success');
        closeAddNoteModal();
    } catch (error) {
        console.error('Error saving note:', error);
        showNotification('Failed to save note', 'error');
    }
}

// View student notes
async function viewStudentNotes(studentId) {
    try {
        const response = await fetch(`${API_BASE}/dean/students/${encodeURIComponent(studentId)}/notes`);
        if (!response.ok) throw new Error('Failed to load notes');
        
        const notes = await response.json();
        allStudentNotes = notes;
        
        // Get student info
        const studentsResponse = await fetch(`${API_BASE}/dean/students?search=${encodeURIComponent(studentId)}`);
        const students = await studentsResponse.json();
        const student = students[0];
        
        if (student) {
            document.getElementById('view-notes-student-name').textContent = student.name;
            document.getElementById('view-notes-student-info').textContent = 
                `${student.admissionNumber} | ${formatCourseName(student.course)} | Year ${student.year}`;
        }
        
        displayStudentNotes();
        
        document.getElementById('view-notes-modal').classList.remove('hidden');
        document.getElementById('view-notes-modal').classList.add('flex');
    } catch (error) {
        console.error('Error loading notes:', error);
        showNotification('Failed to load notes', 'error');
    }
}

// Display student notes
function displayStudentNotes() {
    const container = document.getElementById('student-notes-container');
    
    let filteredNotes = allStudentNotes;
    if (currentNoteFilter !== 'all') {
        filteredNotes = allStudentNotes.filter(note => note.noteType === currentNoteFilter);
    }
    
    if (filteredNotes.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-500">
                <i class="ri-file-list-line text-4xl mb-4"></i>
                <p>No ${currentNoteFilter === 'all' ? '' : currentNoteFilter} notes found</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredNotes.map(note => {
        const priorityColors = {
            low: 'bg-gray-100 text-gray-700',
            medium: 'bg-blue-100 text-blue-700',
            high: 'bg-orange-100 text-orange-700',
            urgent: 'bg-red-100 text-red-700'
        };
        
        const categoryIcons = {
            welfare: 'ri-heart-line',
            academic: 'ri-book-line',
            disciplinary: 'ri-alarm-warning-line',
            health: 'ri-health-book-line',
            financial: 'ri-money-dollar-circle-line',
            general: 'ri-file-list-line'
        };
        
        return `
            <div class="bg-gray-50 rounded-lg p-4 mb-4 border-l-4 ${note.noteType === 'private' ? 'border-purple-500' : 'border-green-500'}">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center space-x-2">
                        <span class="px-2 py-1 text-xs font-semibold rounded ${note.noteType === 'private' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}">
                            ${note.noteType.toUpperCase()}
                        </span>
                        <span class="px-2 py-1 text-xs font-semibold rounded ${priorityColors[note.priority]}">
                            ${note.priority.toUpperCase()}
                        </span>
                        <span class="text-xs text-gray-500">
                            <i class="${categoryIcons[note.category]} mr-1"></i>${note.category}
                        </span>
                    </div>
                    <span class="text-xs text-gray-500">${formatDate(note.createdAt)}</span>
                </div>
                <h4 class="font-semibold text-gray-900 mb-2">${note.title}</h4>
                <p class="text-sm text-gray-700 mb-2">${note.content}</p>
                <div class="text-xs text-gray-500">
                    By: ${note.createdBy.userName} | ${note.isRead ? `Read on ${formatDate(note.readAt)}` : 'Unread'}
                </div>
            </div>
        `;
    }).join('');
}

// Filter notes
function filterNotes(type) {
    currentNoteFilter = type;
    
    // Update button styles
    document.querySelectorAll('.note-filter-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-purple-100', 'text-purple-700');
        btn.classList.add('bg-gray-100', 'text-gray-700');
    });
    
    event.target.classList.remove('bg-gray-100', 'text-gray-700');
    event.target.classList.add('active', 'bg-purple-100', 'text-purple-700');
    
    displayStudentNotes();
}

// Close view notes modal
function closeViewNotesModal() {
    document.getElementById('view-notes-modal').classList.add('hidden');
    document.getElementById('view-notes-modal').classList.remove('flex');
    currentNoteFilter = 'all';
}

// Format course name
function formatCourseName(courseCode) {
    const courseNames = {
        'analytical_chemistry_6': 'Analytical Chemistry Level 6',
        'applied_chemistry_6': 'Applied Chemistry Level 6',
        'biochemistry_5': 'Biochemistry Level 5',
        'industrial_chemistry_6': 'Industrial Chemistry Level 6',
        'organic_chemistry_5': 'Organic Chemistry Level 5',
        'physical_chemistry_6': 'Physical Chemistry Level 6'
    };
    return courseNames[courseCode] || courseCode.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Format date
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Show notification
function showNotification(message, type = 'info') {
    const bgColors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        warning: 'bg-yellow-500',
        info: 'bg-blue-500'
    };
    
    const notification = document.createElement('div');
    notification.className = `fixed top-20 right-4 ${bgColors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in`;
    notification.innerHTML = `
        <div class="flex items-center space-x-2">
            <i class="ri-${type === 'success' ? 'check' : type === 'error' ? 'close' : 'information'}-circle-line text-xl"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Logout
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        sessionStorage.clear();
        window.location.href = '/dean/login';
    }
}


