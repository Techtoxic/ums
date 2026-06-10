// tabs/tools-of-trade.js — tools of trade: uploads, requests, bulk upload.
window.TrainerTabs = window.TrainerTabs || {};

// (verbatim from trainerDashboard.js)
// Load Tools of Trade data
async function loadToolsOfTrade() {
    try {
        console.log('Loading tools of trade...');
        
        showToolsLoadingState();

        // Load the open requests addressed to this trainer
        loadToolRequests();

        // Load submitted tools
        const response = await authFetch(`${API_BASE_URL}/tools/trainer/${currentTrainer._id}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        toolsData = await response.json();
        
        console.log(`Successfully loaded ${toolsData.length} tools`);
        
        displayTools();
        
    } catch (error) {
        console.error('Error loading tools:', error);
        showToolsEmptyState();
        showToast(`Failed to load tools: ${error.message}`, 'error');
    }
}

// Tool-type display labels (shared by the requests list and submitted-tools cards).
const TOOL_TYPE_NAMES = {
    course_outline: 'Course Outline',
    learning_plan: 'Learning Plan',
    record_of_work: 'Record of Work',
    session_plan: 'Session Plan',
    exam: 'Exam',
    tvet_license: 'TVET License'
};

// Load the open tool requests addressed to this trainer (faculty / their department / them).
async function loadToolRequests() {
    const listEl = document.getElementById('toolRequestsList');
    const emptyEl = document.getElementById('toolRequestsEmpty');
    if (!listEl) return;

    try {
        const response = await authFetch(`${API_BASE_URL}/tool-requests/trainer/${currentTrainer._id}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const requests = await response.json();

        if (!Array.isArray(requests) || requests.length === 0) {
            listEl.innerHTML = '';
            if (emptyEl) emptyEl.classList.remove('hidden');
            return;
        }
        if (emptyEl) emptyEl.classList.add('hidden');

        listEl.innerHTML = requests.map(r => {
            const label = TOOL_TYPE_NAMES[r.toolType] || (r.toolType || '').replace(/_/g, ' ');
            const due = r.dueDate ? new Date(r.dueDate).toLocaleDateString() : 'No due date';
            return `
                <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex justify-between items-start gap-4">
                    <div class="flex-1">
                        <p class="font-medium text-gray-900 dark:text-white">${escapeHtml(label)}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Due: ${escapeHtml(due)}</p>
                        ${r.instructions ? `<p class="text-sm text-gray-600 dark:text-gray-400 mt-2">${escapeHtml(r.instructions)}</p>` : ''}
                    </div>
                    <button onclick="fulfillToolRequest('${escapeAttr(r.id)}', '${escapeAttr(r.toolType)}')" class="px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-secondary transition-colors text-sm font-medium whitespace-nowrap">
                        <i class="ri-upload-line mr-1"></i>Fulfill this
                    </button>
                </div>`;
        }).join('');
    } catch (error) {
        console.error('Error loading tool requests:', error);
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.classList.remove('hidden');
    }
}

// Pre-fill the upload from a request: link the requestId, pre-select the tool type, scroll to upload.
function fulfillToolRequest(requestId, toolType) {
    selectedRequestId = requestId;
    if (toolType) selectToolType(toolType);

    const uploadArea = document.getElementById('uploadArea');
    if (uploadArea) {
        uploadArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
        uploadArea.classList.add('border-primary', 'bg-primary/5');
        setTimeout(() => uploadArea.classList.remove('bg-primary/5'), 1500);
    }
    showToast('Request selected — choose your file and upload.', 'success');
}

// Select tool type. Highlights the matching button by its onclick target so it works
// both from a button click and when called programmatically (e.g. fulfillToolRequest).
function selectToolType(toolType) {
    selectedToolType = toolType;

    document.querySelectorAll('.tool-type-btn').forEach(btn => {
        const onclick = btn.getAttribute('onclick') || '';
        const isMatch = onclick.includes(`selectToolType('${toolType}')`);
        btn.classList.toggle('border-primary', isMatch);
        btn.classList.toggle('bg-primary/5', isMatch);
        btn.classList.toggle('border-gray-200', !isMatch);
        btn.classList.toggle('dark:border-gray-600', !isMatch);
    });

    // Enable upload button if file is selected
    updateUploadButton();
}

// Handle file selection
function handleFileSelect(event) {
    const file = event.target.files[0];
    
    if (!file) {
        clearFileSelection();
        return;
    }
    
    // Validate file type
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
        showToast('Please select a PDF or DOCX file', 'error');
        return;
    }
    
    // Validate file size (1MB = 1024 * 1024 bytes)
    if (file.size > 1024 * 1024) {
        showToast('File size must be less than 1MB', 'error');
        return;
    }
    
    selectedFile = file;
    
    // Update UI
    document.getElementById('selectedFileName').textContent = file.name;
    document.getElementById('selectedFileSize').textContent = formatFileSize(file.size);
    document.getElementById('selectedFileInfo').classList.remove('hidden');
    
    updateUploadButton();
}

// Clear file selection
function clearFileSelection() {
    selectedFile = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('selectedFileInfo').classList.add('hidden');
    updateUploadButton();
}

// Update upload button state
function updateUploadButton() {
    const uploadBtn = document.getElementById('uploadBtn');
    const canUpload = selectedFile && selectedToolType;
    uploadBtn.disabled = !canUpload;
}

// Upload tool
async function uploadTool() {
    if (!selectedFile || !selectedToolType) {
        showToast('Please select a file and tool type', 'error');
        return;
    }

    try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('trainerId', currentTrainer._id);
        formData.append('toolType', selectedToolType);
        // requestId is optional — present only when fulfilling a specific request.
        if (selectedRequestId) formData.append('requestId', selectedRequestId);

        const uploadBtn = document.getElementById('uploadBtn');
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<i class="ri-loader-4-line animate-spin mr-2"></i>Uploading...';
        
        const response = await authFetch(`${API_BASE_URL}/tools/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Upload failed');
        }
        
        showToast('Tool uploaded successfully!', 'success');
        
        // Reset form
        clearFileSelection();
        selectedToolType = null;
        selectedRequestId = null;
        document.querySelectorAll('.tool-type-btn').forEach(btn => {
            btn.classList.remove('border-primary', 'bg-primary/5');
            btn.classList.add('border-gray-200', 'dark:border-gray-600');
        });
        updateUploadButton();

        // Reload tools (also refreshes the requests list via loadToolsOfTrade)
        await loadToolsOfTrade();
        
    } catch (error) {
        console.error('Error uploading tool:', error);
        showToast(`Upload failed: ${error.message}`, 'error');
    } finally {
        const uploadBtn = document.getElementById('uploadBtn');
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="ri-upload-line mr-2"></i>Upload Tool';
    }
}

// Display tools
function displayTools() {
    const toolsGrid = document.getElementById('toolsGrid');
    const toolsEmptyState = document.getElementById('toolsEmptyState');
    const toolsLoadingState = document.getElementById('toolsLoadingState');
    
    toolsLoadingState.classList.add('hidden');
    
    if (toolsData.length === 0) {
        toolsGrid.classList.add('hidden');
        toolsEmptyState.classList.remove('hidden');
        return;
    }
    
    toolsGrid.classList.remove('hidden');
    toolsEmptyState.classList.add('hidden');
    
    toolsGrid.innerHTML = toolsData.map(tool => createToolCard(tool)).join('');
}

// Create tool card HTML
function createToolCard(tool) {
    const statusColors = {
        'submitted': 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
        'under_review': 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800',
        'approved': 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
        'rejected': 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
        'needs_revision': 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800'
    };
    
    const submittedAt = tool.createdAt ? new Date(tool.createdAt).toLocaleDateString() : 'N/A';
    const fileSize = formatFileSize(tool.fileSize);
    
    return `
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 card-hover">
            <div class="flex justify-between items-start mb-4">
                <div class="flex-1">
                    <h3 class="font-semibold text-gray-900 dark:text-white text-lg">${escapeHtml(TOOL_TYPE_NAMES[tool.toolType] || tool.toolType)}</h3>
                </div>
                <span class="px-3 py-1 rounded-full text-xs font-medium border ${statusColors[tool.status] || statusColors.submitted}">
                    ${escapeHtml(tool.status.replace('_', ' ').toUpperCase())}
                </span>
            </div>
            
            <div class="space-y-2 mb-4">
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600 dark:text-gray-400">File:</span>
                    <span class="font-medium text-gray-900 dark:text-white truncate">${escapeHtml(tool.originalName)}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600 dark:text-gray-400">Size:</span>
                    <span class="font-medium text-gray-900 dark:text-white">${fileSize}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-gray-600 dark:text-gray-400">Submitted:</span>
                    <span class="font-medium text-gray-900 dark:text-white">${submittedAt}</span>
                </div>
            </div>
            
            ${tool.feedback ? `
                <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-4">
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                        <i class="ri-message-line mr-2 text-gray-400 dark:text-gray-500"></i>
                        ${escapeHtml(tool.feedback)}
                    </p>
                </div>
            ` : ''}
            
            <div class="flex justify-end items-center pt-4 border-t border-gray-100 dark:border-gray-700">
                <div class="flex space-x-2">
                    <button onclick="downloadTool('${escapeAttr(tool.id)}')" class="text-primary hover:text-secondary text-sm font-medium transition-colors">
                        <i class="ri-download-line mr-1"></i>Download
                    </button>
                    ${tool.status === 'submitted' ? `
                    <button onclick="deleteTool('${escapeAttr(tool.id)}')" class="text-red-500 hover:text-red-700 text-sm font-medium transition-colors">
                        <i class="ri-delete-bin-line mr-1"></i>Delete
                    </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

// Download tool
async function downloadTool(toolId) {
    try {
        // Get download URL from API (supports both S3 and local storage)
        const response = await authFetch(`${API_BASE_URL}/tools/${toolId}/download`);
        
        if (!response.ok) {
            throw new Error(`Failed to get download URL: ${response.status}`);
        }
        
        const data = await response.json();
        if (!data.success || !data.url) {
            throw new Error('Invalid download URL received');
        }
        
        console.log(`Downloading file from ${data.storageType}:`, data.fileName);
        
        // Create download link
        const a = document.createElement('a');
        a.href = data.url;
        a.download = data.fileName;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        showToast(`File downloaded successfully (${data.storageType})`, 'success');
        
    } catch (error) {
        console.error('Error downloading tool:', error);
        showToast(`Download failed: ${error.message}`, 'error');
    }
}

// Delete tool
async function deleteTool(toolId) {
    if (!confirm('Are you sure you want to delete this tool? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await authFetch(`${API_BASE_URL}/tools/${toolId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        showToast('Tool deleted successfully', 'success');
        
        // Reload tools
        await loadToolsOfTrade();
        
    } catch (error) {
        console.error('Error deleting tool:', error);
        showToast(`Delete failed: ${error.message}`, 'error');
    }
}

// Refresh tools
async function refreshTools() {
    await loadToolsOfTrade();
    showToast('Tools refreshed successfully', 'success');
}

// Show tools loading state
function showToolsLoadingState() {
    document.getElementById('toolsLoadingState')?.classList.remove('hidden');
    document.getElementById('toolsGrid')?.classList.add('hidden');
    document.getElementById('toolsEmptyState')?.classList.add('hidden');
}

// Show tools empty state
function showToolsEmptyState() {
    document.getElementById('toolsLoadingState')?.classList.add('hidden');
    document.getElementById('toolsGrid')?.classList.add('hidden');
    document.getElementById('toolsEmptyState')?.classList.remove('hidden');
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Bulk Upload Functions

// Show bulk upload modal
function showBulkUploadModal() {
    document.getElementById('bulkUploadModal').classList.remove('hidden');
    document.getElementById('bulkUploadModal').classList.add('flex');
}

// Close bulk upload modal
function closeBulkUploadModal() {
    document.getElementById('bulkUploadModal').classList.add('hidden');
    document.getElementById('bulkUploadModal').classList.remove('flex');
    
    // Reset form
    bulkToolType = null;
    bulkFiles = [];
    document.querySelectorAll('.bulk-tool-type-btn').forEach(btn => {
        btn.classList.remove('border-primary', 'bg-primary/5');
        btn.classList.add('border-gray-200', 'dark:border-gray-600');
    });
    document.getElementById('bulkFilesList').classList.add('hidden');
    document.getElementById('bulkUploadProgress').classList.add('hidden');
    document.getElementById('bulkUploadBtn').disabled = true;
}

// Select bulk tool type
function selectBulkToolType(toolType) {
    bulkToolType = toolType;
    
    // Update UI
    document.querySelectorAll('.bulk-tool-type-btn').forEach(btn => {
        btn.classList.remove('border-primary', 'bg-primary/5');
        btn.classList.add('border-gray-200', 'dark:border-gray-600');
    });
    
    event.target.closest('.bulk-tool-type-btn').classList.remove('border-gray-200', 'dark:border-gray-600');
    event.target.closest('.bulk-tool-type-btn').classList.add('border-primary', 'bg-primary/5');
    
    updateBulkUploadButton();
}

// Handle bulk file selection
function handleBulkFileSelect(event) {
    const files = Array.from(event.target.files);
    
    if (files.length === 0) {
        clearBulkFileSelection();
        return;
    }
    
    // Validate files
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const validFiles = [];
    const errors = [];
    
    files.forEach((file, index) => {
        if (!allowedTypes.includes(file.type)) {
            errors.push(`${file.name}: Invalid file type`);
        } else if (file.size > 1024 * 1024) {
            errors.push(`${file.name}: File size exceeds 1MB`);
        } else {
            validFiles.push(file);
        }
    });
    
    if (errors.length > 0) {
        showToast(`Some files were rejected: ${errors.join(', ')}`, 'error');
    }
    
    if (validFiles.length === 0) {
        clearBulkFileSelection();
        return;
    }
    
    // Accumulate files instead of replacing them
    bulkFiles = [...bulkFiles, ...validFiles];
    displayBulkFiles();
    updateBulkUploadButton();
}

// Display selected bulk files
function displayBulkFiles() {
    const filesList = document.getElementById('bulkFilesList');
    const filesContainer = document.getElementById('bulkFilesContainer');
    
    filesContainer.innerHTML = bulkFiles.map((file, index) => `
        <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div class="flex items-center space-x-3">
                <i class="ri-file-line text-2xl text-primary"></i>
                <div>
                    <p class="font-medium text-gray-900 dark:text-white">${escapeHtml(file.name)}</p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">${formatFileSize(file.size)} - ${bulkToolType || 'No tool type selected'}</p>
                </div>
            </div>
            <button onclick="removeBulkFile(${index})" class="text-red-500 hover:text-red-700">
                <i class="ri-close-line text-xl"></i>
            </button>
        </div>
    `).join('');
    
    filesList.classList.remove('hidden');
}

// Remove file from bulk selection
function removeBulkFile(index) {
    bulkFiles.splice(index, 1);
    
    if (bulkFiles.length === 0) {
        clearBulkFileSelection();
    } else {
        displayBulkFiles();
    }
    
    updateBulkUploadButton();
}

// Clear bulk file selection
function clearBulkFileSelection() {
    bulkFiles = [];
    document.getElementById('bulkFileInput').value = '';
    document.getElementById('bulkFilesList').classList.add('hidden');
    updateBulkUploadButton();
}

// Update bulk upload button state
function updateBulkUploadButton() {
    const uploadBtn = document.getElementById('bulkUploadBtn');
    const canUpload = bulkFiles.length > 0 && bulkToolType;
    uploadBtn.disabled = !canUpload;
}

// Upload bulk tools
async function uploadBulkTools() {
    if (bulkFiles.length === 0 || !bulkToolType) {
        showToast('Please select files and tool type', 'error');
        return;
    }
    
    try {
        const uploadBtn = document.getElementById('bulkUploadBtn');
        const progressContainer = document.getElementById('bulkUploadProgress');
        const progressBar = document.getElementById('bulkProgressBar');
        const progressText = document.getElementById('bulkProgressText');
        
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<i class="ri-loader-4-line animate-spin mr-2"></i>Uploading...';
        progressContainer.classList.remove('hidden');
        
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < bulkFiles.length; i++) {
            const file = bulkFiles[i];
            const progress = ((i + 1) / bulkFiles.length) * 100;
            
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `Uploading ${file.name} (${i + 1}/${bulkFiles.length})`;
            
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('trainerId', currentTrainer._id);
                formData.append('toolType', bulkToolType);
                
                const response = await authFetch(`${API_BASE_URL}/tools/upload`, {
                    method: 'POST',
                    body: formData
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.success) {
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } else {
                    errorCount++;
                }
            } catch (error) {
                console.error(`Error uploading ${file.name}:`, error);
                errorCount++;
            }
        }
        
        // Show results
        if (successCount > 0) {
            showToast(`Successfully uploaded ${successCount} files`, 'success');
        }
        if (errorCount > 0) {
            showToast(`${errorCount} files failed to upload`, 'error');
        }
        
        // Reset form
        closeBulkUploadModal();
        
        // Reload tools
        await loadToolsOfTrade();
        
    } catch (error) {
        console.error('Error in bulk upload:', error);
        showToast(`Bulk upload failed: ${error.message}`, 'error');
    } finally {
        const uploadBtn = document.getElementById('bulkUploadBtn');
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="ri-upload-2-line mr-2"></i>Upload All Files';
        document.getElementById('bulkUploadProgress').classList.add('hidden');
    }
}

window.TrainerTabs['tools-of-trade'] = {
    init() {
        currentSection = 'tools-of-trade';
        loadToolsOfTrade();
    }
};
