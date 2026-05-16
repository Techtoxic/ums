// ========================================
// STUDENT UPLOAD SECTION
// ========================================

// API Base - use relative URL to avoid hardcoding port
const UPLOAD_API_BASE = '/api';

// Get current student data
function getStudentData() {
    const data = JSON.parse(sessionStorage.getItem('studentData')) || {};
    console.log('Student data:', data);
    return data;
}

// Get current academic settings
let currentAcademicYear = '2024/2025';
let currentSemester = '1';

// Upload states
const uploadStates = {
    profile: null,
    kcse: null,
    kcpe: null,
    units: {}
};

// Initialize uploads section (exposed globally)
window.initializeUploadsSection = async function initializeUploadsSection() {
    try {
        // Fetch current academic settings
        const settings = await fetchAcademicSettings();
        currentAcademicYear = settings.academicYear;
        currentSemester = settings.semester;

        // Load student's uploads
        await loadStudentUploads();

        // Load registered units with upload capabilities
        await loadRegisteredUnitsForUploads();

        // Setup event listeners
        setupUploadEventListeners();

    } catch (error) {
        console.error('Error initializing uploads section:', error);
        if (typeof showToast === 'function') {
            showToast('Failed to initialize uploads section', 'error');
        }
    }
};

// Fetch academic settings
async function fetchAcademicSettings() {
    try {
        const response = await fetch(`${UPLOAD_API_BASE}/system-settings`);
        if (response.ok) {
            const settings = await response.json();
            return {
                academicYear: settings.find(s => s.key === 'current_academic_year')?.value || '2024/2025',
                semester: settings.find(s => s.key === 'current_semester')?.value || '1'
            };
        }
    } catch (error) {
        console.error('Error fetching academic settings:', error);
    }
    return { academicYear: '2024/2025', semester: '1' };
}

// Load student's existing uploads
async function loadStudentUploads() {
    try {
        const studentData = getStudentData();
        const studentId = studentData.admissionNumber;
        if (!studentId) {
            console.error('No student data found');
            return;
        }

        // URL encode the studentId to handle slashes
        const encodedStudentId = encodeURIComponent(studentId);
        const response = await fetch(`${UPLOAD_API_BASE}/student-uploads/${encodedStudentId}`);
        if (!response.ok) throw new Error('Failed to load uploads');

        const uploads = await response.json();

        // Organize uploads by type
        uploads.forEach(upload => {
            if (upload.uploadType === 'profile_photo') {
                uploadStates.profile = upload;
            } else if (upload.uploadType === 'kcse_results') {
                uploadStates.kcse = upload;
            } else if (upload.uploadType === 'kcpe_results') {
                uploadStates.kcpe = upload;
            } else if (upload.uploadType === 'assessment' || upload.uploadType === 'practical' || upload.uploadType === 'combined_video') {
                const unitKey = upload.unitId?._id || upload.unitId;
                if (!uploadStates.units[unitKey]) {
                    uploadStates.units[unitKey] = {};
                }
                if (upload.uploadType === 'assessment') {
                    uploadStates.units[unitKey][`assessment${upload.assessmentNumber}`] = upload;
                } else if (upload.uploadType === 'practical') {
                    uploadStates.units[unitKey][`practical${upload.practicalNumber}`] = upload;
                } else if (upload.uploadType === 'combined_video') {
                    uploadStates.units[unitKey].combinedVideo = upload;
                }
            }
        });

        // Update UI
        updateProfileUploadsUI();

    } catch (error) {
        console.error('Error loading student uploads:', error);
    }
}

// Load registered units for uploads
async function loadRegisteredUnitsForUploads() {
    try {
        const studentData = getStudentData();
        const studentId = studentData.admissionNumber;
        if (!studentId) {
            console.error('No student data found');
            return;
        }

        console.log('Fetching registrations for student:', studentId);
        // URL encode the studentId to handle slashes
        const encodedStudentId = encodeURIComponent(studentId);
        const response = await fetch(`${UPLOAD_API_BASE}/students/${encodedStudentId}/registrations?status=registered`);
        if (!response.ok) {
            throw new Error(`Failed to load registrations: ${response.status}`);
        }

        const registrations = await response.json();
        console.log('Fetched registrations:', registrations);

        // Allow uploads for all registered units (both department and common units)
        console.log('All registered units:', registrations);

        // Display unit upload cards
        displayUnitUploadCards(registrations);

    } catch (error) {
        console.error('Error loading registered units:', error);
        const container = document.getElementById('unit-uploads-container');
        if (container) {
            container.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <i class="ri-error-warning-line text-4xl text-red-400 mb-4"></i>
                    <p class="text-red-600 dark:text-red-400">Failed to load units: ${error.message}</p>
                </div>
            `;
        }
    }
}

// Update profile uploads UI
function updateProfileUploadsUI() {
    updateUploadCard('profile-photo-card', uploadStates.profile);
    updateUploadCard('kcse-card', uploadStates.kcse);
    updateUploadCard('kcpe-card', uploadStates.kcpe);
}

// Update upload card status
function updateUploadCard(cardId, uploadData) {
    const card = document.getElementById(cardId);
    if (!card) return;

    const statusBadge = card.querySelector('.upload-status-badge');
    const uploadBtn = card.querySelector('.upload-btn');
    const viewBtn = card.querySelector('.view-btn');
    const replaceBtn = card.querySelector('.replace-btn');
    const uploadInfo = card.querySelector('.upload-info');

    if (uploadData && uploadData.status === 'uploaded') {
        // File uploaded
        statusBadge.textContent = uploadData.version > 1 ? 'Replaced' : 'Uploaded';
        statusBadge.className = 'upload-status-badge px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700';
        
        uploadBtn?.classList.add('hidden');
        viewBtn?.classList.remove('hidden');
        replaceBtn?.classList.remove('hidden');

        if (uploadInfo) {
            uploadInfo.innerHTML = `
                <p class="text-xs text-gray-600 dark:text-gray-400">
                    ${uploadData.originalFileName}<br>
                    Uploaded: ${new Date(uploadData.uploadedAt).toLocaleDateString()}<br>
                    Version: ${uploadData.version}
                </p>
            `;
        }
    } else {
        // No file uploaded
        statusBadge.textContent = 'Not Uploaded';
        statusBadge.className = 'upload-status-badge px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700';
        
        uploadBtn?.classList.remove('hidden');
        viewBtn?.classList.add('hidden');
        replaceBtn?.classList.add('hidden');

        if (uploadInfo) {
            uploadInfo.innerHTML = '<p class="text-xs text-gray-500">No file uploaded yet</p>';
        }
    }
}

// Display unit upload cards
function displayUnitUploadCards(units) {
    const container = document.getElementById('unit-uploads-container');
    if (!container) return;

    if (units.length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center py-12">
                <i class="ri-file-upload-line text-4xl text-gray-400 mb-4"></i>
                <p class="text-gray-600 dark:text-gray-400">You have no registered units.</p>
                <p class="text-sm text-gray-500 dark:text-gray-500 mt-2">Register for units to start uploading assessments.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = units.map(unit => createUnitUploadCard(unit)).join('');
}

// Create unit upload card HTML
function createUnitUploadCard(unit) {
    const unitId = unit.unitId?._id || unit.unitId;
    const unitUploads = uploadStates.units[unitId] || {};

    return `
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border border-gray-200 dark:border-gray-700">
            <div class="flex items-start justify-between mb-4">
                <div class="flex-1">
                    <h3 class="font-semibold text-gray-900 dark:text-white">${unit.unitName}</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-400">${unit.unitCode}</p>
                </div>
                <span class="px-2 py-1 ${unit.unitType === 'common' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'} text-xs rounded-full">${unit.unitType === 'common' ? 'Common Unit' : 'Department Unit'}</span>
            </div>

            <div class="space-y-3">
                ${['1', '2', '3'].map(num => createAssessmentUploadSlot(unitId, num, unitUploads[`assessment${num}`])).join('')}
                ${unit.unitType === 'department' ? ['1', '2', '3'].map(num => createPracticalUploadSlot(unitId, num, unitUploads[`practical${num}`])).join('') : ''}
                ${unit.unitType === 'department' ? createCombinedVideoUploadSlot(unitId, unitUploads.combinedVideo) : ''}
            </div>
        </div>
    `;
}

// Create assessment upload slot
function createAssessmentUploadSlot(unitId, assessmentNum, uploadData) {
    const status = uploadData ? (uploadData.version > 1 ? 'Replaced' : 'Uploaded') : 'Not Uploaded';
    const statusClass = uploadData ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700';

    return `
        <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded">
            <div class="flex-1">
                <div class="flex items-center gap-2">
                    <i class="ri-file-text-line text-gray-400"></i>
                    <span class="text-sm font-medium text-gray-900 dark:text-white">Assessment ${assessmentNum}</span>
                    <span class="px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}">${status}</span>
                </div>
                ${uploadData ? `
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        ${uploadData.originalFileName} • ${new Date(uploadData.uploadedAt).toLocaleDateString()}
                    </p>
                ` : ''}
            </div>
            <div class="flex items-center gap-2">
                ${uploadData ? `
                    <button onclick="viewUpload('${uploadData._id}')" class="text-blue-600 hover:text-blue-700 text-sm">
                        <i class="ri-eye-line"></i>
                    </button>
                    <button onclick="replaceUpload('${unitId}', 'assessment', ${assessmentNum}, '${uploadData._id}')" class="text-orange-600 hover:text-orange-700 text-sm">
                        <i class="ri-refresh-line"></i>
                    </button>
                ` : `
                    <button onclick="uploadFile('${unitId}', 'assessment', ${assessmentNum})" class="px-3 py-1 bg-primary hover:bg-primary/80 text-white text-xs rounded transition-colors">
                        <i class="ri-upload-line mr-1"></i>Upload
                    </button>
                `}
            </div>
        </div>
    `;
}

// Create practical upload slot
function createPracticalUploadSlot(unitId, practicalNum, uploadData) {
    const status = uploadData ? (uploadData.version > 1 ? 'Replaced' : 'Uploaded') : 'Not Uploaded';
    const statusClass = uploadData ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700';

    return `
        <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded">
            <div class="flex-1">
                <div class="flex items-center gap-2">
                    <i class="ri-file-pdf-line text-gray-400"></i>
                    <span class="text-sm font-medium text-gray-900 dark:text-white">Practical ${practicalNum}</span>
                    <span class="px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}">${status}</span>
                </div>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">PDF Document</p>
                ${uploadData ? `
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        ${uploadData.originalFileName} • ${new Date(uploadData.uploadedAt).toLocaleDateString()}
                    </p>
                ` : ''}
            </div>
            <div class="flex items-center gap-2">
                ${uploadData ? `
                    <button onclick="viewUpload('${uploadData._id}')" class="text-blue-600 hover:text-blue-700 text-sm">
                        <i class="ri-eye-line"></i>
                    </button>
                    <button onclick="replaceUpload('${unitId}', 'practical', ${practicalNum}, '${uploadData._id}')" class="text-orange-600 hover:text-orange-700 text-sm">
                        <i class="ri-refresh-line"></i>
                    </button>
                ` : `
                    <button onclick="uploadFile('${unitId}', 'practical', ${practicalNum})" class="px-3 py-1 bg-primary hover:bg-primary/80 text-white text-xs rounded transition-colors">
                        <i class="ri-upload-line mr-1"></i>Upload
                    </button>
                `}
            </div>
        </div>
    `;
}

// Create combined video upload slot
function createCombinedVideoUploadSlot(unitId, uploadData) {
    const status = uploadData ? (uploadData.version > 1 ? 'Replaced' : 'Uploaded') : 'Not Uploaded';
    const statusClass = uploadData ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700';

    return `
        <div class="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 rounded border border-purple-200 dark:border-purple-800">
            <div class="flex-1">
                <div class="flex items-center gap-2">
                    <i class="ri-video-line text-purple-600"></i>
                    <span class="text-sm font-medium text-gray-900 dark:text-white">Combined Video</span>
                    <span class="px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}">${status}</span>
                </div>
                <p class="text-xs text-purple-600 dark:text-purple-400 mt-1">Video or Image</p>
                ${uploadData ? `
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        ${uploadData.originalFileName} • ${new Date(uploadData.uploadedAt).toLocaleDateString()}
                    </p>
                ` : ''}
            </div>
            <div class="flex items-center gap-2">
                ${uploadData ? `
                    <button onclick="viewUpload('${uploadData._id}')" class="text-blue-600 hover:text-blue-700 text-sm">
                        <i class="ri-eye-line"></i>
                    </button>
                    <button onclick="replaceUpload('${unitId}', 'combined_video', null, '${uploadData._id}')" class="text-orange-600 hover:text-orange-700 text-sm">
                        <i class="ri-refresh-line"></i>
                    </button>
                ` : `
                    <button onclick="uploadFile('${unitId}', 'combined_video', null)" class="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors">
                        <i class="ri-upload-line mr-1"></i>Upload
                    </button>
                `}
            </div>
        </div>
    `;
}

// Upload file handler
async function uploadFile(unitId, uploadType, assessmentNumber) {
    try {
        // Create file input
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        
        // Set accept based on upload type
        if (uploadType === 'practical') {
            fileInput.accept = '.pdf';
        } else if (uploadType === 'combined_video') {
            fileInput.accept = 'image/*,video/*';
        } else {
            fileInput.accept = '.pdf,.doc,.docx';
        }

        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            await processUpload(file, unitId, uploadType, assessmentNumber, null);
        };

        fileInput.click();
    } catch (error) {
        console.error('Error uploading file:', error);
        showToast('Upload failed', 'error');
    }
}

// Replace upload handler
async function replaceUpload(unitId, uploadType, assessmentNumber, oldUploadId) {
    if (!confirm('Are you sure you want to replace this file? The old file will be marked as replaced.')) {
        return;
    }

    await uploadFile(unitId, uploadType, assessmentNumber);
}

// Process upload
async function processUpload(file, unitId, uploadType, assessmentNumber, oldUploadId) {
    try {
        const studentData = getStudentData();
        showLoading('Uploading file...');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('studentId', studentData.admissionNumber);
        formData.append('uploadType', uploadType);
        formData.append('academicYear', currentAcademicYear);
        formData.append('semester', currentSemester);

        if (unitId) {
            // Get unit details from registrations
            const encodedStudentId = encodeURIComponent(studentData.admissionNumber);
            const registrations = await fetch(`${UPLOAD_API_BASE}/students/${encodedStudentId}/registrations?status=registered`);
            const regs = await registrations.json();
            const unitReg = regs.find(r => (r.unitId?._id || r.unitId) === unitId);

            if (unitReg) {
                formData.append('unitId', unitId);
                formData.append('unitCode', unitReg.unitCode);
                formData.append('unitName', unitReg.unitName);
            }
        }

        if (assessmentNumber) {
            if (uploadType === 'assessment') {
                formData.append('assessmentNumber', assessmentNumber);
            } else if (uploadType === 'practical') {
                formData.append('practicalNumber', assessmentNumber); // assessmentNumber parameter is reused for practicalNumber
            }
        }

        const response = await fetch(`${UPLOAD_API_BASE}/student-uploads`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Upload failed');
        }

        const result = await response.json();

        showToast(result.message, 'success');

        // Reload uploads
        await loadStudentUploads();
        await loadRegisteredUnitsForUploads();

    } catch (error) {
        console.error('Error processing upload:', error);
        showToast('Upload failed: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// View upload
async function viewUpload(uploadId) {
    try {
        const studentData = getStudentData();
        showLoading('Loading file...');

        const encodedStudentId = encodeURIComponent(studentData.admissionNumber);
        const response = await fetch(`${UPLOAD_API_BASE}/student-uploads/${uploadId}/download?userId=${encodedStudentId}&userType=student`);
        if (!response.ok) throw new Error('Failed to get download URL');

        const data = await response.json();
        
        // Open in new tab
        window.open(data.url, '_blank');

        hideLoading();
    } catch (error) {
        console.error('Error viewing upload:', error);
        showToast('Failed to open file', 'error');
        hideLoading();
    }
}

// Upload profile photo
async function uploadProfilePhoto() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';

    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        await processProfileUpload(file, 'profile_photo');
    };

    fileInput.click();
}

// Upload KCSE/KCPE results
async function uploadResults(type) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf,.jpg,.jpeg,.png';

    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        await processProfileUpload(file, type === 'kcse' ? 'kcse_results' : 'kcpe_results');
    };

    fileInput.click();
}

// Process profile upload
async function processProfileUpload(file, uploadType) {
    try {
        const studentData = getStudentData();
        showLoading('Uploading...');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('studentId', studentData.admissionNumber);
        formData.append('uploadType', uploadType);
        formData.append('academicYear', currentAcademicYear);
        formData.append('semester', currentSemester);

        const response = await fetch(`${UPLOAD_API_BASE}/student-uploads`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Upload failed');
        }

        const result = await response.json();

        showToast(result.message, 'success');

        // Reload uploads
        await loadStudentUploads();

    } catch (error) {
        console.error('Error processing upload:', error);
        showToast('Upload failed: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Setup event listeners
function setupUploadEventListeners() {
    // Delegated event listeners would go here if needed
}

// Helper functions - use existing ones from studentPortal.js if available
function showToast(message, type) {
    console.log(`[TOAST ${type}] ${message}`);
    
    // Try to use the existing showNotification from studentPortal.js
    if (typeof window.showNotification === 'function') {
        try {
            window.showNotification(message, type || 'info');
            return;
        } catch (e) {
            console.error('showNotification failed:', e);
        }
    }
    
    // Fallback to alert
    const toastTypes = {
        'success': '✅',
        'error': '❌',
        'warning': '⚠️',
        'info': 'ℹ️'
    };
    alert(`${toastTypes[type] || 'ℹ️'} ${message}`);
}

function showLoading(message) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
    }
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

// ========================================
// EXPOSE FUNCTIONS GLOBALLY
// ========================================
window.uploadProfilePhoto = uploadProfilePhoto;
window.uploadResults = uploadResults;
window.viewUpload = viewUpload;
window.uploadFile = uploadFile;
window.replaceUpload = replaceUpload;

console.log('✅ Upload section loaded and functions exposed globally');
