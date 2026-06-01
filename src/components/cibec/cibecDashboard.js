// CIBEC Dashboard JavaScript
const API_BASE = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : `${window.location.protocol}//${window.location.host}/api`;
// Authenticated fetch wrapper
const authFetch = async (url, options = {}) => {
    // Stage 2B-1B: delegate to the single shared auth helper (public/js/auth.js).
    // It attaches the Authorization header (and a JSON Content-Type for
    // non-FormData bodies) and handles token-expiry redirects. The wrapper
    // name is kept so existing call sites are unchanged.
    return window.AUTH.fetch(url, options);
};

// SEV-H-008: actor identity is sourced server-side from the verified JWT.
// No client-asserted CIBEC user id is sent in requests.

// State management
let currentFilters = {};
let allUploads = [];
let currentPage = 1;
const itemsPerPage = 20;

// Course + department display names come from the shared DB-backed catalog
// (Rule 7). These helpers keep a title-case fallback if the catalog failed to
// load, and route through Catalog.formatCourseName / Catalog.departmentName.
function _titleCase(s) {
    return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
function courseName(code) {
    return window.Catalog ? window.Catalog.formatCourseName(code) : _titleCase(code);
}
function deptName(key) {
    return window.Catalog ? window.Catalog.departmentName(key) : _titleCase(key);
}

// Initialize dashboard
// Fetch + show the current academic year in the topbar chip (best-effort).
async function loadAcademicYearChip() {
    const chip = document.getElementById('academic-year-chip');
    if (!chip) return;
    try {
        const res = await authFetch(`${API_BASE}/system-settings/current_academic_year`);
        if (!res.ok) return;
        const data = await res.json();
        const value = data && (data.value || data.current_academic_year);
        if (!value) return;
        const valEl = chip.querySelector('.ay-value');
        if (valEl) valEl.textContent = 'AY ' + value;
        chip.style.display = 'inline-flex';
    } catch (e) { /* best-effort: leave the chip hidden */ }
}

async function initializeDashboard() {
    console.log('Initializing CIBEC Dashboard...');

    // Load the shared programs/departments catalog before anything renders.
    if (window.Catalog) { await window.Catalog.ready(); }

    // Populate the department filter from the catalog (snake_case textCode
    // values — CIBEC sends `department` as a query param).
    const deptFilter = document.getElementById('filter-department');
    if (deptFilter && window.Catalog) {
        window.Catalog.populateDepartmentSelect(deptFilter, { includeAll: true, allLabel: 'All Departments' });
    }

    // Load statistics
    await loadStatistics();

    // Load all uploads (powers the Search tab)
    await loadUploads();

    // Setup event listeners
    setupEventListeners();

    // Academic-year chip in the topbar (best-effort; stays hidden on failure).
    loadAcademicYearChip();

    // Browse tab is the default view: load the tree root (level=course).
    loadTreeRoot();

    console.log('Dashboard initialized');
}

// ===================================================================
// TAB SWITCHING
// ===================================================================
const CBET_TABS = ['browse', 'search'];
function switchTab(tab) {
    if (!CBET_TABS.includes(tab)) return;
    CBET_TABS.forEach(t => {
        const panel = document.getElementById('tab-' + t);
        const btn = document.getElementById('nav-' + t);
        if (panel) panel.classList.toggle('hidden', t !== tab);
        if (btn) btn.classList.toggle('active', t === tab);
    });
}

// Load statistics
async function loadStatistics() {
    try {
        const response = await authFetch(`${API_BASE}/cibec/statistics`);
        if (!response.ok) throw new Error('Failed to load statistics');
        
        const data = await response.json();
        
        // Update stat cards
        document.getElementById('stat-total').textContent = data.statistics.totalUploads || 0;
        
        // API now returns byType entries keyed as `.key` (was `._id` pre-V2).
        const byType = data.statistics.byType || [];
        const assessments = byType.find(t => t.key === 'assessment')?.count || 0;
        const practicals = byType.find(t => t.key === 'practical')?.count || 0;
        const profiles = byType.filter(t => ['profile_photo', 'kcse_results', 'kcpe_results'].includes(t.key))
            .reduce((sum, t) => sum + t.count, 0);
        
        document.getElementById('stat-assessments').textContent = assessments;
        document.getElementById('stat-practicals').textContent = practicals;
        document.getElementById('stat-profiles').textContent = profiles;
        
    } catch (error) {
        console.error('Error loading statistics:', error);
        showToast('Failed to load statistics', 'error');
    }
}

// Load uploads with filters
async function loadUploads(filters = {}) {
    try {
        showLoading();
        
        // Build query string
        const queryParams = new URLSearchParams();
        if (filters.department) queryParams.append('department', filters.department);
        if (filters.uploadType) queryParams.append('uploadType', filters.uploadType);
        if (filters.module) queryParams.append('module', filters.module);
        if (filters.courseLevel) queryParams.append('courseLevel', filters.courseLevel);
        if (filters.studentId) queryParams.append('studentId', filters.studentId);
        if (filters.admissionNumber) queryParams.append('admissionNumber', filters.admissionNumber);

        const response = await authFetch(`${API_BASE}/cibec/uploads?${queryParams}`);
        if (!response.ok) throw new Error('Failed to load uploads');
        
        const data = await response.json();
        allUploads = data.uploads || [];
        
        // Update UI
        displayUploads();
        updateResultsCount();
        hideLoading();
        
    } catch (error) {
        console.error('Error loading uploads:', error);
        showToast('Failed to load uploads', 'error');
        hideLoading();
    }
}

// Display uploads
function displayUploads() {
    const container = document.getElementById('uploads-list');
    const emptyState = document.getElementById('empty-state');
    
    if (allUploads.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        document.getElementById('pagination').classList.add('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    
    // Calculate pagination
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, allUploads.length);
    const pageUploads = allUploads.slice(startIndex, endIndex);
    
    // Render uploads
    container.innerHTML = pageUploads.map(upload => createUploadCard(upload)).join('');
    
    // Update pagination
    updatePagination();
}

// Create upload card HTML
function createUploadCard(upload) {
    const uploadTypeLabels = {
        'profile_photo': 'Profile Photo',
        'kcse_results': 'KCSE Results',
        'kcpe_results': 'KCPE Results',
        'assessment': `Assessment ${upload.assessmentNumber || ''}`,
        'practical': 'Practical Work'
    };
    
    const uploadTypeIcons = {
        'profile_photo': 'ri-user-line',
        'kcse_results': 'ri-file-text-line',
        'kcpe_results': 'ri-file-text-line',
        'assessment': 'ri-file-list-line',
        'practical': 'ri-video-line'
    };
    
    const uploadTypeColors = {
        'profile_photo': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
        'kcse_results': 'bg-primary/10 text-primary dark:bg-primary/25 dark:text-red-200',
        'kcpe_results': 'bg-primary/10 text-primary dark:bg-primary/25 dark:text-red-200',
        'assessment': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
        'practical': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    };

    const courseLabel = courseName(upload.course);
    const departmentLabel = deptName(upload.department);

    // Extract level from course name
    const levelMatch = courseLabel.match(/Level (\d+)/);
    const levelBadge = levelMatch ? `<span class="px-2 py-0.5 bg-accent/20 text-amber-800 dark:bg-accent/25 dark:text-amber-200 text-xs rounded-full font-medium">Level ${levelMatch[1]}</span>` : '';

    return `
        <div class="upload-card border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-all">
            <div class="flex items-start justify-between">
                <div class="flex items-start space-x-4 flex-1">
                    <div class="p-3 ${uploadTypeColors[upload.uploadType]} rounded-lg">
                        <i class="${uploadTypeIcons[upload.uploadType]} text-2xl"></i>
                    </div>
                    <div class="flex-1">
                        <div class="flex items-center space-x-2 mb-1">
                            <h3 class="font-semibold text-gray-900 dark:text-gray-100">${escapeHtml(upload.studentName)}</h3>
                            <span class="px-2 py-0.5 bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 text-xs rounded-full">${escapeHtml(upload.admissionNumber)}</span>
                            ${levelBadge}
                        </div>
                        <p class="text-sm text-gray-600 dark:text-gray-300 mb-2">${escapeHtml(courseLabel)}</p>
                        <div class="flex items-center flex-wrap gap-2 text-xs">
                            <span class="px-2 py-1 ${uploadTypeColors[upload.uploadType]} rounded-full font-medium">
                                ${uploadTypeLabels[upload.uploadType]}
                            </span>
                            <span class="text-gray-500 dark:text-gray-400">${escapeHtml(departmentLabel)}</span>
                            <span class="text-gray-400 dark:text-gray-500">•</span>
                            <span class="text-gray-500 dark:text-gray-400">Module ${escapeHtml(upload.module)}</span>
                            ${upload.unitName ? `
                                <span class="text-gray-400 dark:text-gray-500">•</span>
                                <span class="text-gray-500 dark:text-gray-400">${escapeHtml(upload.unitName)}</span>
                            ` : ''}
                        </div>
                        <div class="mt-2 flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                            <span><i class="ri-file-line mr-1"></i>${escapeHtml(upload.originalFileName)}</span>
                            <span><i class="ri-calendar-line mr-1"></i>${new Date(upload.uploadedAt).toLocaleDateString()}</span>
                            <span><i class="ri-folder-line mr-1"></i>${(upload.fileSize / 1024).toFixed(1)} KB</span>
                            ${upload.version > 1 ? `<span class="text-amber-600 dark:text-amber-400"><i class="ri-refresh-line mr-1"></i>v${upload.version}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="flex items-center space-x-2">
                    <button onclick="viewFile('${escapeAttr(upload._id)}')" class="p-2 hover:bg-primary/10 text-primary dark:text-red-300 rounded-lg transition-colors" title="View File">
                        <i class="ri-eye-line text-lg"></i>
                    </button>
                    <button onclick="downloadFile('${escapeAttr(upload._id)}')" class="p-2 hover:bg-green-50 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg transition-colors" title="Download">
                        <i class="ri-download-line text-lg"></i>
                    </button>
                    <button onclick="viewStudentDetails('${escapeAttr(upload.studentId)}')" class="p-2 hover:bg-accent/15 text-amber-700 dark:text-amber-300 rounded-lg transition-colors" title="Student Details">
                        <i class="ri-user-search-line text-lg"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Update results count
function updateResultsCount() {
    const count = allUploads.length;
    const countEl = document.getElementById('results-count');
    countEl.textContent = `${count} result${count !== 1 ? 's' : ''}`;
}

// Update pagination
function updatePagination() {
    const totalPages = Math.ceil(allUploads.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, allUploads.length);
    
    document.getElementById('page-start').textContent = startIndex + 1;
    document.getElementById('page-end').textContent = endIndex;
    document.getElementById('page-total').textContent = allUploads.length;
    
    document.getElementById('prev-page').disabled = currentPage === 1;
    document.getElementById('next-page').disabled = currentPage >= totalPages;
    
    if (totalPages > 1) {
        document.getElementById('pagination').classList.remove('hidden');
    } else {
        document.getElementById('pagination').classList.add('hidden');
    }
}

// View file
async function viewFile(uploadId) {
    try {
        const response = await authFetch(`${API_BASE}/student-uploads/${uploadId}/download`);
        if (!response.ok) throw new Error('Failed to get download URL');

        const data = await response.json();
        window.open(data.url, '_blank');
        
        showToast('Opening file...', 'success');
    } catch (error) {
        console.error('Error viewing file:', error);
        showToast('Failed to open file', 'error');
    }
}

// Download file
async function downloadFile(uploadId) {
    try {
        const response = await authFetch(`${API_BASE}/student-uploads/${uploadId}/download`);
        if (!response.ok) throw new Error('Failed to get download URL');

        const data = await response.json();

        // Create download link
        const a = document.createElement('a');
        a.href = data.url;
        a.download = data.fileName;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        showToast('Download started', 'success');
    } catch (error) {
        console.error('Error downloading file:', error);
        showToast('Failed to download file', 'error');
    }
}

// View student details
async function viewStudentDetails(studentId) {
    try {
        showLoading();
        
        const response = await authFetch(`${API_BASE}/cibec/student/${studentId}/uploads`);
        if (!response.ok) throw new Error('Failed to load student details');
        
        const data = await response.json();
        
        // Update modal
        document.getElementById('modal-student-name').textContent = data.student.name;
        document.getElementById('modal-student-id').textContent = data.student.studentId;
        document.getElementById('modal-student-course').textContent = courseName(data.student.course);
        document.getElementById('modal-student-department').textContent = deptName(data.student.department);
        document.getElementById('modal-student-year').textContent = `Module ${data.student.module}`;
        
        // Display uploads
        const modalContent = document.getElementById('modal-content');
        if (data.uploads.length === 0) {
            modalContent.innerHTML = `
                <div class="text-center py-8">
                    <i class="ri-inbox-line text-4xl text-gray-300 dark:text-gray-600 mb-2"></i>
                    <p class="text-gray-600 dark:text-gray-300">No uploads found for this student</p>
                </div>
            `;
        } else {
            modalContent.innerHTML = `
                <div class="space-y-2">
                    ${data.uploads.map(upload => createModalUploadItem(upload)).join('')}
                </div>
            `;
        }
        
        // Show modal
        document.getElementById('student-modal').classList.remove('hidden');
        hideLoading();
        
    } catch (error) {
        console.error('Error viewing student details:', error);
        showToast('Failed to load student details', 'error');
        hideLoading();
    }
}

// Create modal upload item
function createModalUploadItem(upload) {
    const uploadTypeLabels = {
        'profile_photo': 'Profile Photo',
        'kcse_results': 'KCSE Results',
        'kcpe_results': 'KCPE Results',
        'assessment': `Assessment ${upload.assessmentNumber || ''}`,
        'practical': 'Practical Work'
    };
    
    return `
        <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <div class="flex-1">
                <div class="flex items-center space-x-2 mb-1">
                    <span class="font-medium text-gray-900 dark:text-gray-100">${escapeHtml(uploadTypeLabels[upload.uploadType])}</span>
                    ${upload.unitName ? `<span class="text-sm text-gray-500 dark:text-gray-400">• ${escapeHtml(upload.unitName)}</span>` : ''}
                </div>
                <p class="text-sm text-gray-600 dark:text-gray-300">${escapeHtml(upload.originalFileName)}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Uploaded: ${escapeHtml(new Date(upload.uploadedAt).toLocaleString())}</p>
            </div>
            <div class="flex items-center space-x-2">
                <button onclick="viewFile('${escapeAttr(upload._id)}')" class="p-2 hover:bg-primary/10 text-primary dark:text-red-300 rounded-lg transition-colors">
                    <i class="ri-eye-line"></i>
                </button>
                <button onclick="downloadFile('${escapeAttr(upload._id)}')" class="p-2 hover:bg-green-50 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg transition-colors">
                    <i class="ri-download-line"></i>
                </button>
            </div>
        </div>
    `;
}

// Close student modal
function closeStudentModal() {
    document.getElementById('student-modal').classList.add('hidden');
}

// Setup event listeners
function setupEventListeners() {
    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', () => {
        loadStatistics();
        loadUploads(currentFilters);
    });
    
    // Apply filters
    document.getElementById('apply-filters-btn').addEventListener('click', applyFilters);
    
    // Clear filters
    document.getElementById('clear-filters-btn').addEventListener('click', clearFilters);
    
    // Real-time filters: the dropdowns apply immediately on change; the search
    // box applies as you type (debounced) and on Enter.
    ['filter-department', 'filter-course-level', 'filter-upload-type', 'filter-year'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', applyFilters);
    });
    let cbetSearchDebounce;
    const searchEl = document.getElementById('search-student');
    if (searchEl) {
        searchEl.addEventListener('input', () => {
            clearTimeout(cbetSearchDebounce);
            cbetSearchDebounce = setTimeout(applyFilters, 300);
        });
        searchEl.addEventListener('keypress', (e) => { if (e.key === 'Enter') { clearTimeout(cbetSearchDebounce); applyFilters(); } });
    }
    
    // Pagination
    document.getElementById('prev-page').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            displayUploads();
        }
    });
    
    document.getElementById('next-page').addEventListener('click', () => {
        const totalPages = Math.ceil(allUploads.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            displayUploads();
        }
    });
    
    // Export button
    document.getElementById('export-btn').addEventListener('click', exportToExcel);

    // Sidebar nav (Browse / Search)
    CBET_TABS.forEach(t => {
        const btn = document.getElementById('nav-' + t);
        if (btn) btn.addEventListener('click', () => switchTab(t));
    });

    // Browse: reload tree root
    const treeReload = document.getElementById('tree-reload-btn');
    if (treeReload) treeReload.addEventListener('click', loadTreeRoot);
}

// ===================================================================
// BROWSE — lazy tree browser
// ===================================================================
// The tree spine is fixed: course → intake → module → unit → student → slot.
// To fetch the children of a node we call /cibec/tree with level = the CHILD
// level and ALL accumulated ancestor branch params. Each rendered node stores
// the branch-param object that should be passed to its children (its own
// ancestors + the param it contributes) so expansion accumulates naturally.
const TREE_CHILD_LEVEL = {
    academicYear: 'course',
    course: 'intake',
    intake: 'module',
    module: 'unit',
    unit: 'student',
    student: 'slot'
};
const TREE_ICONS = {
    academicYear: 'ri-calendar-2-line',
    course: 'ri-graduation-cap-line',
    intake: 'ri-calendar-line',
    module: 'ri-stack-line',
    unit: 'ri-book-2-line',
    student: 'ri-user-line',
    slot: 'ri-file-line'
};
const TREE_TITLES = {
    academicYear: 'Academic Year',
    course: 'Course',
    intake: 'Intake',
    module: 'Module',
    unit: 'Unit',
    student: 'Student',
    slot: 'Documents'
};

// The branch param a node contributes to its children's fetch.
function nodeBranchParam(node) {
    switch (node.level) {
        case 'academicYear': return { academicYear: node.academicYear };
        case 'course':       return { course: node.key };
        case 'intake':       return { intakeYear: node.intakeYear };
        case 'module':       return { module: node.key };
        case 'unit':         return { unitId: node.unitId };
        case 'student':      return { admissionNumber: node.admissionNumber };
        default:             return {};
    }
}

// Fetch children at a given level with accumulated branch params.
async function loadTreeChildren(level, branchParams) {
    const qs = new URLSearchParams();
    qs.append('level', level);
    Object.keys(branchParams || {}).forEach(k => {
        if (branchParams[k] !== undefined && branchParams[k] !== null && branchParams[k] !== '') {
            qs.append(k, branchParams[k]);
        }
    });
    const res = await authFetch(`${API_BASE}/cibec/tree?${qs}`);
    if (!res.ok) throw new Error('Failed to load tree');
    const data = await res.json();
    return data.nodes || [];
}

// ── Evidence browser — single-panel breadcrumb drill-down ───────────────────
// One level at a time, full width, no horizontal scroll. Spine: academicYear →
// course → intake → module → unit → student → slot (documents). frames[] is the
// trail; the LAST frame is what's shown. Each frame caches its level's nodes.
let cbetFrames = []; // [{ level, params, nodes, pickedLabel, loading? }]

function cbetCurrentFrame() { return cbetFrames[cbetFrames.length - 1]; }

// Entry point (kept name for init + Reload): reset to the root level.
async function loadTreeRoot() {
    const list = document.getElementById('cbet-list');
    if (list) list.innerHTML = `<div class="flex items-center text-gray-500 dark:text-gray-400 text-sm px-4 py-6"><i class="ri-loader-4-line animate-spin mr-2"></i>Loading…</div>`;
    try {
        const nodes = await loadTreeChildren('academicYear', {});
        cbetFrames = [{ level: 'academicYear', params: {}, nodes, pickedLabel: null }];
        renderCbetBrowse();
    } catch (e) {
        console.error('Error loading evidence browser:', e);
        if (list) list.innerHTML = `<p class="text-danger px-4 py-6">Failed to load.</p>`;
        showToast('Failed to load evidence browser', 'error');
    }
}

// Pick an item: drill into its level (or open the document leaf).
async function cbetPick(node) {
    if (node.level === 'slot') {
        if (node.uploadId) viewFile(node.uploadId);
        else showToast('No file attached to this document', 'warning');
        return;
    }
    const cur = cbetCurrentFrame();
    const childLevel = TREE_CHILD_LEVEL[node.level];
    const childParams = Object.assign({}, cur.params, nodeBranchParam(node));
    cbetFrames.push({ level: childLevel, params: childParams, nodes: [], pickedLabel: node.label, loading: true });
    renderCbetBrowse();
    try {
        const nodes = await loadTreeChildren(childLevel, childParams);
        cbetFrames[cbetFrames.length - 1] = { level: childLevel, params: childParams, nodes, pickedLabel: node.label };
        renderCbetBrowse();
    } catch (e) {
        console.error('Error loading level:', e);
        cbetFrames.pop();
        renderCbetBrowse();
        showToast('Failed to load', 'error');
    }
}

// Jump back to a frame via the breadcrumb.
function cbetGoTo(frameIndex) {
    if (frameIndex < 0 || frameIndex >= cbetFrames.length) return;
    cbetFrames = cbetFrames.slice(0, frameIndex + 1);
    renderCbetBrowse();
}
window.cbetGoTo = cbetGoTo;

// Render the current level as a full-width list.
function renderCbetBrowse() {
    renderCbetBreadcrumb();
    const list = document.getElementById('cbet-list');
    const frame = cbetCurrentFrame();
    if (!list || !frame) return;

    const countLabel = (!frame.loading && Array.isArray(frame.nodes))
        ? `<span class="ml-auto font-normal normal-case text-gray-400">${frame.nodes.length} item${frame.nodes.length === 1 ? '' : 's'}</span>` : '';
    const header = `<div class="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/40 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2"><i class="${TREE_ICONS[frame.level] || 'ri-folder-line'}"></i>${escapeHtml(TREE_TITLES[frame.level] || frame.level)}${countLabel}</div>`;

    if (frame.loading) {
        list.innerHTML = header + `<div class="flex items-center text-gray-500 dark:text-gray-400 text-sm px-4 py-6"><i class="ri-loader-4-line animate-spin mr-2"></i>Loading…</div>`;
        return;
    }
    if (!frame.nodes.length) {
        list.innerHTML = header + `<p class="text-gray-400 dark:text-gray-500 text-sm px-4 py-6">— nothing here —</p>`;
        return;
    }

    const rows = frame.nodes.map(node => {
        const isSlot = node.level === 'slot';
        const trail = isSlot
            ? `<span class="ml-auto text-primary dark:text-red-300 text-sm font-medium flex items-center gap-1"><i class="ri-external-link-line"></i>Open</span>`
            : `<span class="ml-auto px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">${typeof node.count === 'number' ? node.count : ''}</span><i class="ri-arrow-right-s-line text-gray-400 ml-1"></i>`;
        return `<div class="cbet-row flex items-center gap-3 px-4 py-3" data-key="${escapeAttr(String(node.key))}">
            <i class="${TREE_ICONS[node.level] || 'ri-circle-line'} text-primary dark:text-red-300 text-lg"></i>
            <span class="text-sm text-gray-800 dark:text-gray-100 truncate">${escapeHtml(node.label || node.key || '')}</span>
            ${trail}
        </div>`;
    }).join('');
    list.innerHTML = header + `<div class="divide-y divide-gray-100 dark:divide-gray-700/60 max-h-[60vh] overflow-y-auto">${rows}</div>`;

    list.querySelectorAll('[data-key]').forEach(el => {
        el.addEventListener('click', () => {
            const node = frame.nodes.find(n => String(n.key) === el.getAttribute('data-key'));
            if (node) cbetPick(node);
        });
    });
}

// Breadcrumb: Home + each picked item; clicking a crumb jumps back to that level.
function renderCbetBreadcrumb() {
    const el = document.getElementById('cbet-breadcrumb');
    if (!el) return;
    const parts = [`<button onclick="cbetGoTo(0)" class="text-primary hover:underline dark:text-red-300 font-medium">Home</button>`];
    for (let i = 1; i < cbetFrames.length; i++) {
        const label = cbetFrames[i].pickedLabel || cbetFrames[i].level;
        parts.push(`<i class="ri-arrow-right-s-line text-gray-300 dark:text-gray-600"></i>`);
        if (i === cbetFrames.length - 1) {
            parts.push(`<span class="text-gray-700 dark:text-gray-200 font-medium">${escapeHtml(label)}</span>`);
        } else {
            parts.push(`<button onclick="cbetGoTo(${i})" class="text-primary hover:underline dark:text-red-300">${escapeHtml(label)}</button>`);
        }
    }
    el.innerHTML = parts.join(' ');
}

// Apply filters
function applyFilters() {
    const filters = {
        department: document.getElementById('filter-department').value,
        courseLevel: document.getElementById('filter-course-level').value,
        uploadType: document.getElementById('filter-upload-type').value,
        module: document.getElementById('filter-year').value,
        studentId: document.getElementById('search-student').value.trim()
    };
    
    // Remove empty filters
    Object.keys(filters).forEach(key => {
        if (!filters[key]) delete filters[key];
    });
    
    currentFilters = filters;
    currentPage = 1;
    
    // Update active filters display
    updateActiveFilters();
    
    // Load uploads with filters
    loadUploads(filters);
}

// Clear filters
function clearFilters() {
    document.getElementById('filter-department').value = '';
    document.getElementById('filter-course-level').value = '';
    document.getElementById('filter-upload-type').value = '';
    document.getElementById('filter-year').value = '';
    document.getElementById('search-student').value = '';
    
    currentFilters = {};
    currentPage = 1;
    
    updateActiveFilters();
    loadUploads();
}

// Update active filters display
function updateActiveFilters() {
    const container = document.getElementById('active-filters');
    const chipsContainer = document.getElementById('filter-chips');
    
    if (Object.keys(currentFilters).length === 0) {
        container.classList.add('hidden');
        return;
    }
    
    container.classList.remove('hidden');
    
    const filterLabels = {
        department: 'Department',
        courseLevel: 'Course Level',
        uploadType: 'Upload Type',
        module: 'Module',
        studentId: 'Student'
    };
    
    chipsContainer.innerHTML = Object.entries(currentFilters).map(([key, value]) => `
        <span class="filter-chip px-3 py-1 bg-primary/10 text-primary dark:bg-primary/25 dark:text-red-200 text-sm rounded-full flex items-center space-x-2">
            <span>${filterLabels[key]}: ${escapeHtml(value)}</span>
            <button onclick="removeFilter('${escapeAttr(key)}')" class="hover:bg-primary/20 dark:hover:bg-primary/40 rounded-full p-0.5">
                <i class="ri-close-line text-sm"></i>
            </button>
        </span>
    `).join('');
}

// Remove filter
function removeFilter(key) {
    delete currentFilters[key];
    
    // Clear corresponding input
    const inputMap = {
        department: 'filter-department',
        courseLevel: 'filter-course-level',
        uploadType: 'filter-upload-type',
        module: 'filter-year',
        studentId: 'search-student'
    };
    
    if (inputMap[key]) {
        document.getElementById(inputMap[key]).value = '';
    }
    
    updateActiveFilters();
    loadUploads(currentFilters);
}

// Export to Excel
function exportToExcel() {
    if (allUploads.length === 0) {
        showToast('No data to export', 'warning');
        return;
    }
    
    // Create CSV content
    const headers = ['Student Name', 'Admission No', 'Course', 'Department', 'Year', 'Upload Type', 'Unit', 'File Name', 'Upload Date', 'File Size'];
    const rows = allUploads.map(upload => [
        upload.studentName,
        upload.admissionNumber,
        courseName(upload.course),
        deptName(upload.department),
        upload.module,
        upload.uploadType,
        upload.unitName || '-',
        upload.originalFileName,
        new Date(upload.uploadedAt).toLocaleDateString(),
        `${(upload.fileSize / 1024).toFixed(1)} KB`
    ]);
    
    const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');
    
    // Download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cibec-uploads-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Export successful', 'success');
}

// Show loading
function showLoading() {
    document.getElementById('loading-state').classList.remove('hidden');
    document.getElementById('uploads-list').classList.add('hidden');
    document.getElementById('empty-state').classList.add('hidden');
}

// Hide loading
function hideLoading() {
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('uploads-list').classList.remove('hidden');
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    const toastIcon = document.getElementById('toast-icon');
    
    toastMessage.textContent = message;
    
    const icons = {
        success: 'ri-check-line',
        error: 'ri-error-warning-line',
        warning: 'ri-alert-line',
        info: 'ri-information-line'
    };
    
    toastIcon.className = icons[type] || icons.info;
    
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', initializeDashboard);


