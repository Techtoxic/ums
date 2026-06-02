// tabs/notes.js — dean notes: add-note + view-notes flows (both shell modals,
// triggered from the students tab). The "All Notes" tab itself is a static
// placeholder in the monolith (#all-notes-container is never populated by JS),
// so init() is a no-op.
window.DeanTabs = window.DeanTabs || {};

// (verbatim from deanDashboard.js)
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
        
        const response = await authFetch(`${API_BASE}/dean/students/${encodeURIComponent(currentStudent.admissionNumber)}/notes`, {
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
        const response = await authFetch(`${API_BASE}/dean/students/${encodeURIComponent(studentId)}/notes`);
        if (!response.ok) throw new Error('Failed to load notes');
        
        const notes = await response.json();
        allStudentNotes = notes;
        
        // Get student info
        const studentsResponse = await authFetch(`${API_BASE}/dean/students?search=${encodeURIComponent(studentId)}`);
        const students = await studentsResponse.json();
        const student = students[0];
        
        if (student) {
            document.getElementById('view-notes-student-name').textContent = student.name;
            document.getElementById('view-notes-student-info').textContent = 
                `${student.admissionNumber} | ${formatCourseName(student.course)} | Module ${student.module}`;
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
            <div class="text-center py-12 text-gray-500 dark:text-gray-400 dark:text-gray-400">
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
            <div class="bg-gray-50 dark:bg-gray-700/40 rounded-lg p-4 mb-4 border-l-4 ${note.noteType === 'private' ? 'border-primary' : 'border-green-500'}">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center space-x-2">
                        <span class="px-2 py-1 text-xs font-semibold rounded ${note.noteType === 'private' ? 'bg-primary/10 text-primary' : 'bg-green-100 text-green-700'}">
                            ${escapeHtml(String(note.noteType).toUpperCase())}
                        </span>
                        <span class="px-2 py-1 text-xs font-semibold rounded ${priorityColors[note.priority]}">
                            ${escapeHtml(String(note.priority).toUpperCase())}
                        </span>
                        <span class="text-xs text-gray-500 dark:text-gray-400">
                            <i class="${categoryIcons[note.category]} mr-1"></i>${escapeHtml(note.category)}
                        </span>
                    </div>
                    <span class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(formatDate(note.createdAt))}</span>
                </div>
                <h4 class="font-semibold text-gray-900 dark:text-gray-100 mb-2">${escapeHtml(note.title)}</h4>
                <p class="text-sm text-gray-700 dark:text-gray-300 mb-2">${escapeHtml(note.content)}</p>
                <div class="text-xs text-gray-500 dark:text-gray-400">
                    By: ${escapeHtml((note.createdBy && note.createdBy.userName) || note.authorName || note.createdByName || 'Staff')} | ${note.isRead ? `Read on ${escapeHtml(formatDate(note.readAt))}` : 'Unread'}
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
        btn.classList.remove('active', 'bg-primary/10', 'text-primary');
        btn.classList.add('bg-gray-100', 'text-gray-700');
    });
    
    event.target.classList.remove('bg-gray-100', 'text-gray-700');
    event.target.classList.add('active', 'bg-primary/10', 'text-primary');
    
    displayStudentNotes();
}

// Close view notes modal
function closeViewNotesModal() {
    document.getElementById('view-notes-modal').classList.add('hidden');
    document.getElementById('view-notes-modal').classList.remove('flex');
    currentNoteFilter = 'all';
}

window.DeanTabs.notes = {
    init() {}
};
