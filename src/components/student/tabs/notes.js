// tabs/notes.js — notes & messages tab: public Dean notes, filters, read tracking.

window.StudentTabs = window.StudentTabs || {};

// (verbatim from studentPortal.js — state + all note functions + initializeNotes)
// ========================================
// DEAN NOTES & MESSAGES FUNCTIONALITY
// ========================================

let allNotes = [];
let currentNotesFilter = 'all';

// Load public notes from Dean
async function loadPublicNotes() {
    try {
        showNotesLoading();
        
        const response = await authFetch(`${API_BASE_URL}/students/${encodeURIComponent(studentData.admissionNumber)}/public-notes`);
        if (!response.ok) throw new Error('Failed to load notes');
        
        const data = await response.json();
        allNotes = data.notes || [];
        
        displayNotes();
        updateNotesCount();
        hideNotesLoading();
        
    } catch (error) {
        console.error('Error loading public notes:', error);
        hideNotesLoading();
        showNotesEmpty();
    }
}

// Display notes based on current filter
function displayNotes() {
    const container = document.getElementById('notes-list');
    const emptyState = document.getElementById('notes-empty');
    
    if (!container) return;
    
    // Filter notes
    let filteredNotes = allNotes;
    if (currentNotesFilter === 'unread') {
        filteredNotes = allNotes.filter(note => !note.isRead);
    } else if (currentNotesFilter === 'read') {
        filteredNotes = allNotes.filter(note => note.isRead);
    }
    
    if (filteredNotes.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    
    // Create note cards
    container.innerHTML = filteredNotes.map(note => createNoteCard(note)).join('');
}

// Create note card HTML
function createNoteCard(note) {
    const priorityColors = {
        urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
        normal: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        low: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
    };
    
    const categoryIcons = {
        academic: 'ri-book-line',
        welfare: 'ri-heart-line',
        administrative: 'ri-file-list-line',
        general: 'ri-information-line'
    };
    
    const priorityColor = priorityColors[note.priority] || priorityColors.normal;
    const categoryIcon = categoryIcons[note.category] || categoryIcons.general;
    
    const unreadIndicator = !note.isRead ? `
        <span class="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
    ` : '';
    
    return `
        <div class="note-card relative bg-white dark:bg-gray-800 border ${!note.isRead ? 'border-primary' : 'border-gray-200 dark:border-gray-700'} rounded-lg p-4 hover:shadow-md transition-all cursor-pointer"
             onclick="viewNote('${escapeAttr(note._id)}')">
            ${unreadIndicator}
            <div class="flex items-start justify-between mb-2">
                <div class="flex items-center space-x-2">
                    <i class="${categoryIcon} text-xl text-gray-600 dark:text-gray-400"></i>
                    <h3 class="font-semibold text-gray-900 dark:text-white ${!note.isRead ? 'font-bold' : ''}">${escapeHtml(note.title)}</h3>
                </div>
                <span class="px-2 py-1 text-xs font-medium rounded-full ${priorityColor}">
                    ${escapeHtml(note.priority)}
                </span>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">${escapeHtml(note.content)}</p>
            <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500">
                <div class="flex items-center space-x-3">
                    <span class="flex items-center">
                        <i class="ri-calendar-line mr-1"></i>
                        ${new Date(note.createdAt).toLocaleDateString()}
                    </span>
                    <span class="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded capitalize">${escapeHtml(note.category)}</span>
                </div>
                ${!note.isRead ? '<span class="text-primary font-medium">New</span>' : ''}
            </div>
        </div>
    `;
}

// View note details
async function viewNote(noteId) {
    const note = allNotes.find(n => n._id === noteId);
    if (!note) return;
    
    // Show modal with note details
    showNoteModal(note);
    
    // Mark as read if unread
    if (!note.isRead) {
        await markNoteAsRead(noteId);
    }
}

// Show note modal
function showNoteModal(note) {
    const priorityColors = {
        urgent: 'bg-red-600',
        high: 'bg-orange-600',
        normal: 'bg-blue-600',
        low: 'bg-gray-600'
    };
    
    const modal = document.createElement('div');
    modal.id = 'note-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div class="${priorityColors[note.priority]} text-white p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-2xl font-bold">${escapeHtml(note.title)}</h2>
                        <p class="text-blue-100 mt-1 text-sm">From Dean's Office</p>
                    </div>
                    <button onclick="closeNoteModal()" class="p-2 hover:bg-white/20 rounded-full transition-colors">
                        <i class="ri-close-line text-2xl"></i>
                    </button>
                </div>
                <div class="flex items-center space-x-4 mt-4 text-sm">
                    <span class="flex items-center">
                        <i class="ri-calendar-line mr-2"></i>
                        ${new Date(note.createdAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                    <span class="px-3 py-1 bg-white/20 rounded-full capitalize">${escapeHtml(note.category)}</span>
                    <span class="px-3 py-1 bg-white/20 rounded-full capitalize">${escapeHtml(note.priority)} Priority</span>
                </div>
            </div>
            <div class="p-6 overflow-y-auto max-h-[60vh]">
                <div class="prose dark:prose-invert max-w-none">
                    <p class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">${escapeHtml(note.content)}</p>
                </div>
            </div>
            <div class="bg-gray-50 dark:bg-gray-900 p-4 flex items-center justify-between">
                <p class="text-sm text-gray-600 dark:text-gray-400">
                    Posted: ${new Date(note.createdAt).toLocaleString()}
                </p>
                <button onclick="closeNoteModal()" class="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors">
                    Close
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Close note modal
window.closeNoteModal = function() {
    const modal = document.getElementById('note-modal');
    if (modal) {
        modal.remove();
    }
};

// Mark note as read
async function markNoteAsRead(noteId) {
    try {
        const response = await authFetch(`${API_BASE_URL}/students/${encodeURIComponent(studentData.admissionNumber)}/notes/${noteId}/read`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) throw new Error('Failed to mark note as read');
        
        // Update local note status
        const note = allNotes.find(n => n._id === noteId);
        if (note) {
            note.isRead = true;
            note.readAt = new Date();
        }
        
        // Refresh display
        displayNotes();
        updateNotesCount();
        
    } catch (error) {
        console.error('Error marking note as read:', error);
    }
}

// Update notes count
function updateNotesCount() {
    const unreadCount = allNotes.filter(n => !n.isRead).length;
    
    // Update badge in sidebar
    const notesBadge = document.getElementById('notes-badge');
    if (notesBadge) {
        if (unreadCount > 0) {
            notesBadge.textContent = unreadCount;
            notesBadge.classList.remove('hidden');
        } else {
            notesBadge.classList.add('hidden');
        }
    }
    
    // Update unread tab badge
    const unreadCountEl = document.getElementById('unread-count');
    if (unreadCountEl) {
        if (unreadCount > 0) {
            unreadCountEl.textContent = unreadCount;
            unreadCountEl.classList.remove('hidden');
        } else {
            unreadCountEl.classList.add('hidden');
        }
    }
}

// Show/hide loading state
function showNotesLoading() {
    const loading = document.getElementById('notes-loading');
    const list = document.getElementById('notes-list');
    const empty = document.getElementById('notes-empty');
    
    if (loading) loading.classList.remove('hidden');
    if (list) list.classList.add('hidden');
    if (empty) empty.classList.add('hidden');
}

function hideNotesLoading() {
    const loading = document.getElementById('notes-loading');
    const list = document.getElementById('notes-list');
    
    if (loading) loading.classList.add('hidden');
    if (list) list.classList.remove('hidden');
}

function showNotesEmpty() {
    const empty = document.getElementById('notes-empty');
    if (empty) empty.classList.remove('hidden');
}

// Initialize notes section
function initializeNotes() {
    // Load notes
    loadPublicNotes();
    
    // Refresh button
    const refreshBtn = document.getElementById('refresh-notes-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadPublicNotes);
    }
    
    // Filter tabs
    const filterTabs = document.querySelectorAll('.notes-filter-tab');
    filterTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // Remove active state from all tabs
            filterTabs.forEach(t => {
                t.classList.remove('border-primary', 'text-primary');
                t.classList.add('border-transparent', 'text-gray-600', 'dark:text-gray-400');
            });
            
            // Add active state to clicked tab
            this.classList.remove('border-transparent', 'text-gray-600', 'dark:text-gray-400');
            this.classList.add('border-primary', 'text-primary');
            
            // Update filter
            currentNotesFilter = this.dataset.filter;
            displayNotes();
        });
    });
    
    // Poll for new notes every 5 minutes
    setInterval(loadPublicNotes, 5 * 60 * 1000);
}

window.StudentTabs.notes = {
    // initializeNotes() wires the refresh button + filter tabs + a 5-min poll and
    // does the first load. On revisit (cached partial, same nodes) re-wiring would
    // duplicate listeners + intervals, so wire once and just refresh thereafter.
    init() {
        if (window.__studentNotesWired) {
            loadPublicNotes();
            return;
        }
        window.__studentNotesWired = true;
        initializeNotes();
    }
};
