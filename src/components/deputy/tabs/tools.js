// tabs/tools.js — deputy Tools of Trade: list, request modal, review/approve, downloads.
// The tool-request modal (incl. #trainerSelect) ships inside tools.html; the
// review modal is created dynamically. loadTrainers() populates #trainerSelect.
window.DeputyTabs = window.DeputyTabs || {};

// (verbatim from the monolith inline scripts)
        // Tools of Trade Modal Functions
        function openToolRequestModal() {
            document.getElementById('toolRequestModal').classList.remove('hidden');
            document.getElementById('toolRequestModal').classList.add('flex');
            document.body.classList.add('menu-open');
        }

        function closeToolRequestModal() {
            document.getElementById('toolRequestModal').classList.add('hidden');
            document.getElementById('toolRequestModal').classList.remove('flex');
            document.body.classList.remove('menu-open');
        }

        // Global variable to store tools data
        let toolsData = [];

        // Fetch and display tools of trade
        async function fetchToolsOfTrade() {
            const toolsContainer = document.querySelector('.grid.grid-cols-1.md\\:grid-cols-2.xl\\:grid-cols-4.gap-4');
            if (!toolsContainer) return;

            // Show loading state
            toolsContainer.innerHTML = '<div class="col-span-full text-center py-4"><i class="ri-loader-4-line animate-spin text-2xl text-primary"></i></div>';

            try {
                const response = await window.AUTH.fetch(`${API_BASE_URL}/tools`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch tools: ${response.status} ${response.statusText}`);
                }
                
                const tools = await response.json();
                if (!Array.isArray(tools)) {
                    throw new Error('Invalid response format: expected an array of tools');
                }
                
                toolsData = tools; // Store tools data globally
                displayToolsOfTrade(tools);
            } catch (error) {
                console.error('Error fetching tools:', error);
                toolsContainer.innerHTML = `
                    <div class="col-span-full text-center py-4 text-danger">
                        <i class="ri-error-warning-line text-2xl mb-2"></i>
                        <p>Failed to load tools. Please try again later.</p>
                    </div>`;
                showToast(error.message, 'error');
            }
        }

        function displayToolsOfTrade(tools) {
            // Get the tools list container
            const toolsContainer = document.querySelector('.grid.grid-cols-1.md\\:grid-cols-2.xl\\:grid-cols-4.gap-4');
            if (!toolsContainer) return;

            // Clear existing tools
            toolsContainer.innerHTML = '';

            if (tools.length === 0) {
                toolsContainer.innerHTML = `
                    <div class="col-span-full text-center py-8">
                        <i class="ri-tools-line text-4xl text-gray-400 mb-4"></i>
                        <p class="text-gray-500">No tools of trade submitted yet</p>
                    </div>`;
                return;
            }

            // Display each tool
            tools.forEach(tool => {
                const statusClass = getStatusClass(tool.status);
                const toolTypeNames = {
                    'course_outline': 'Course Outline',
                    'learning_plan': 'Learning Plan',
                    'record_of_work': 'Record of Work',
                    'session_plan': 'Session Plan',
                    'exam': 'Exam',
                    'tvet_license': 'TVET License'
                };
                const trainerName = tool.trainerName || 'Unknown Trainer';
                const trainerDepartment = tool.trainerDepartment || '';
                const submittedAt = tool.createdAt ? new Date(tool.createdAt).toLocaleDateString() : 'N/A';

                const toolCard = `
                    <div class="p-4 border border-slate-200 dark:border-gray-700 rounded-lg hover:border-primary/50 transition-colors">
                        <div class="flex items-center justify-between mb-2">
                            <h4 class="font-medium">${escapeHtml(toolTypeNames[tool.toolType] || tool.toolType)}</h4>
                            <span class="px-3 py-1 rounded-full text-xs ${statusClass}">${escapeHtml((tool.status || '').replace('_', ' ').toUpperCase())}</span>
                        </div>
                        <p class="text-sm text-slate-500 dark:text-slate-400 mb-2">${escapeHtml(trainerName)}${trainerDepartment ? ` — ${escapeHtml(trainerDepartment)}` : ''}</p>
                        <p class="text-xs text-slate-400 dark:text-slate-500 mb-3">Submitted: ${submittedAt}</p>
                        <div class="flex items-center gap-2">
                            <button onclick="reviewTool('${escapeAttr(tool.id)}')" class="text-sm text-primary hover:text-secondary transition-colors">Review</button>
                            <span class="text-slate-300 dark:text-slate-600">|</span>
                            <button onclick="downloadTool('${escapeAttr(tool.id)}')" class="text-sm text-slate-500 hover:text-slate-600 transition-colors">Download</button>
                            <span class="text-slate-300 dark:text-slate-600">|</span>
                            <button onclick="deleteToolDeputy('${escapeAttr(tool.id)}')" class="text-sm text-red-500 hover:text-red-700 transition-colors">Delete</button>
                        </div>
                    </div>
                `;
                toolsContainer.insertAdjacentHTML('beforeend', toolCard);
            });
        }

        function getStatusClass(status) {
            const statusClasses = {
                'submitted': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                'approved': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                'rejected': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                'needs_revision': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
            };
            return statusClasses[status] || 'bg-slate-100 text-slate-600';
        }

        async function handleToolRequest(event) {
            event.preventDefault();
            const submitButton = event.target.querySelector('button[type="submit"]');
            const originalButtonText = submitButton.innerHTML;
            
            try {
                // Disable submit button and show loading state
                submitButton.disabled = true;
                submitButton.innerHTML = '<i class="ri-loader-4-line animate-spin mr-2"></i>Submitting...';
                
                const formData = new FormData(event.target);
                const toolType = formData.get('toolType');
                const sendTo = formData.get('sendTo');
                const department = formData.get('department');
                const trainerSelection = formData.get('trainer');
                const instructions = formData.get('instructions');
                const dueDate = formData.get('dueDate');

                // Validate due date
                const today = new Date();
                const selectedDate = new Date(dueDate);
                today.setHours(0, 0, 0, 0);
                selectedDate.setHours(0, 0, 0, 0);

                if (selectedDate < today) {
                    showToast('Due date cannot be in the past', 'error');
                    return;
                }

                // Map the "send to" choice to the request's target type.
                const targetTypeMap = { all_trainers: 'faculty', by_department: 'department', specific_trainer: 'trainer' };
                const targetType = targetTypeMap[sendTo];

                // Create the tool_requests row; the backend fans out the notifications.
                const requestBody = {
                    toolType,
                    targetType,
                    targetTrainerId: sendTo === 'specific_trainer' ? (trainerSelection || null) : null,
                    targetDepartment: sendTo === 'by_department' ? (department || null) : null,
                    dueDate,
                    instructions: instructions || null
                };

                // window.AUTH.fetch attaches the Authorization + CSRF headers for state-changing requests.
                const response = await window.AUTH.fetch(`${API_BASE_URL}/tool-requests`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.message || `Failed to create tool request: ${response.status} ${response.statusText}`);
                }

                showToast('Tool request sent to trainers successfully!');
                event.target.reset();
                closeToolRequestModal();
                // Refresh the tools list
                fetchToolsOfTrade();
            } catch (error) {
                console.error('Error submitting tool request:', error);
                showToast(error.message, 'error');
            } finally {
                // Reset button state
                submitButton.disabled = false;
                submitButton.innerHTML = originalButtonText;
            }
        }

        // Review tool function
        async function reviewTool(toolId) {
            try {
                // Find the tool in the current tools data
                const tool = toolsData.find(t => t.id === toolId);
                if (!tool) {
                    throw new Error('Tool not found in current data');
                }
                
                // Show review modal
                showToolReviewModal(tool);
            } catch (error) {
                console.error('Error fetching tool:', error);
                showToast('Failed to load tool details', 'error');
            }
        }

        // Download tool function
        async function downloadTool(toolId) {
            try {
                // Get download URL from API (supports both S3 and local storage)
                const response = await window.AUTH.fetch(`${API_BASE_URL}/tools/${toolId}/download`);
                if (!response.ok) {
                    throw new Error(`Failed to get download URL: ${response.status}`);
                }
                
                const data = await response.json();
                if (!data.success || !data.url) {
                    throw new Error('Invalid download URL received');
                }
                
                console.log(`📥 Downloading file from ${data.storageType}:`, data.fileName);
                
                // Create download link
                const a = document.createElement('a');
                a.href = data.url;
                a.download = data.fileName;
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                
                showToast(`Download started (${data.storageType})`, 'success');
            } catch (error) {
                console.error('❌ Error downloading tool:', error);
                showToast('Failed to download file: ' + error.message, 'error');
            }
        }

        // Delete tool function (Deputy may delete any upload, any status — soft delete)
        async function deleteToolDeputy(toolId) {
            if (!confirm('Delete this tool submission? This cannot be undone.')) return;
            try {
                const response = await window.AUTH.fetch(`${API_BASE_URL}/tools/${toolId}`, {
                    method: 'DELETE'
                });
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.message || `HTTP ${response.status}`);
                }
                showToast('Tool submission deleted', 'success');
                fetchToolsOfTrade();
            } catch (error) {
                console.error('❌ Error deleting tool:', error);
                showToast('Failed to delete tool: ' + error.message, 'error');
            }
        }

        // Show tool review modal
        function showToolReviewModal(tool) {
            // Create review modal
            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
            modal.innerHTML = `
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 w-full max-w-2xl mx-4 shadow-2xl max-h-[80vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-semibold">Review Tool of Trade</h3>
                        <button onclick="closeReviewModal()" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                            <i class="ri-close-line text-xl"></i>
                        </button>
                    </div>
                    
                    <div class="space-y-4 max-h-[60vh] overflow-y-auto">
                        <!-- Tool Info -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Tool Type</label>
                                <p class="text-sm text-gray-900 dark:text-white capitalize">${escapeHtml(tool.toolType.replace('_', ' '))}</p>
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">File Name</label>
                                <p class="text-sm text-gray-900 dark:text-white truncate">${escapeHtml(tool.originalFileName)}</p>
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">File Size</label>
                                <p class="text-sm text-gray-900 dark:text-white">${formatFileSize(tool.fileSize)}</p>
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                                <span class="px-2 py-1 rounded-full text-xs font-medium ${getStatusClass(tool.status)}">${escapeHtml(tool.status.replace('_', ' '))}</span>
                            </div>
                        </div>

                        <!-- File Preview -->
                        <div>
                            <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">File Preview</label>
                            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-700">
                                <div class="text-center">
                                    <i class="ri-file-pdf-line text-2xl text-red-500 mb-1"></i>
                                    <p class="text-xs text-gray-600 dark:text-gray-400">PDF Preview</p>
                                    <p class="text-xs text-gray-500 dark:text-gray-500 mt-1">Click download to view full content</p>
                                </div>
                            </div>
                        </div>

                        <!-- Review Actions -->
                        <div class="flex flex-col space-y-3">
                            <div>
                                <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Review Status</label>
                                <select id="reviewStatus" class="w-full px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-700 dark:text-white">
                                    <option value="">Select Status...</option>
                                    <option value="reviewed">Reviewed</option>
                                    <option value="rejected">Rejected</option>
                                </select>
                            </div>
                            
                            <div>
                                <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Feedback</label>
                                <textarea id="reviewFeedback" rows="2" class="w-full px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-700 dark:text-white" placeholder="Enter your feedback..."></textarea>
                            </div>
                        </div>

                        <!-- Action Buttons -->
                        <div class="flex justify-end space-x-2">
                            <button onclick="closeReviewModal()" class="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">Cancel</button>
                            <button onclick="downloadTool('${escapeAttr(tool.id)}')" class="px-3 py-1 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors">
                                <i class="ri-download-line mr-1"></i>Download
                            </button>
                            <button onclick="updateToolStatus('${escapeAttr(tool.id)}')" class="px-3 py-1 text-sm bg-primary text-white rounded-lg hover:bg-secondary transition-colors">
                                <i class="ri-check-line mr-1"></i>Update Status
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
        }

        // Close review modal
        function closeReviewModal() {
            const modal = document.querySelector('.fixed.inset-0.bg-black\\/50');
            if (modal) {
                modal.remove();
            }
        }

        // Update tool status
        async function updateToolStatus(toolId) {
            try {
                // Wait a bit for the modal to be fully rendered
                await new Promise(resolve => setTimeout(resolve, 100));
                
                const statusElement = document.getElementById('reviewStatus');
                const feedbackElement = document.getElementById('reviewFeedback');
                
                console.log('🔍 Debug modal elements:', { 
                    statusElement: statusElement, 
                    feedbackElement: feedbackElement,
                    statusValue: statusElement?.value,
                    feedbackValue: feedbackElement?.value
                });
                
                if (!statusElement || !feedbackElement) {
                    console.error('Modal elements not found:', { statusElement, feedbackElement });
                    showToast('Modal elements not found. Please try again.', 'error');
                    return;
                }
                
                const status = statusElement.value;
                const feedback = feedbackElement.value;
                
                console.log('🔍 Debug extracted values:', { status, feedback });

                if (!status || status === '') {
                    showToast('Please select a status', 'error');
                    return;
                }

                const updateData = {
                    status,
                    feedback: feedback || ''
                };
                
                console.log('Updating tool status:', toolId, updateData);
                
                const response = await window.AUTH.fetch(`${API_BASE_URL}/tools/${toolId}/status`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(updateData)
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.message || `HTTP ${response.status}: Failed to update tool status`);
                }

                showToast('Tool status updated successfully', 'success');
                
                // Update local tools data immediately
                const toolIndex = toolsData.findIndex(tool => tool.id === toolId);
                if (toolIndex !== -1) {
                    toolsData[toolIndex].status = status;
                    toolsData[toolIndex].feedback = feedback || '';
                    toolsData[toolIndex].reviewedBy = 'deputy_academics';
                    toolsData[toolIndex].reviewedAt = new Date().toISOString();
                }
                
                // Refresh display and dashboard stats
                await loadDashboardStats();
                await fetchToolsOfTrade();
                
                // Small delay to ensure UI updates, then close modal
                setTimeout(() => {
                    closeReviewModal();
                }, 500);
            } catch (error) {
                console.error('Error updating tool status:', error);
                showToast('Failed to update tool status', 'error');
            }
        }

        // Format file size
        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        async function viewToolRequest(requestId) {
            try {
                const response = await window.AUTH.fetch(`${API_BASE_URL}/tools/requests/${requestId}`);
                if (!response.ok) throw new Error('Failed to fetch tool request details');
                
                const request = await response.json();
                // Show request details in a modal or dedicated view
                showToast('Viewing request details - Feature coming soon', 'success');
            } catch (error) {
                showToast(error.message, 'error');
            }
        }

        async function updateToolRequestStatus(requestId, newStatus) {
            try {
                const response = await window.AUTH.fetch(`${API_BASE_URL}/tools/${requestId}/status`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ status: newStatus })
                });

                if (!response.ok) throw new Error('Failed to update tool request status');
                
                showToast(`Tool request ${newStatus ? newStatus.toLowerCase() : 'updated'} successfully`);
                // Refresh the tools of trade list
                fetchToolsOfTrade();
            } catch (error) {
                showToast(error.message, 'error');
            }
        }

        // Handle send to change
        function handleSendToChange() {
            const sendTo = document.getElementById('sendToSelect').value;
            const departmentFilter = document.getElementById('departmentFilter');
            const trainerFilter = document.getElementById('trainerFilter');
            
            // Hide all filters
            departmentFilter.classList.add('hidden');
            trainerFilter.classList.add('hidden');
            
            // Show relevant filter
            if (sendTo === 'by_department') {
                departmentFilter.classList.remove('hidden');
            } else if (sendTo === 'specific_trainer') {
                trainerFilter.classList.remove('hidden');
                loadAllTrainers();
            }
        }

        // Load trainers by department
        async function loadTrainersByDepartment() {
            const department = document.getElementById('departmentSelect').value;
            if (!department) return;
            
            try {
                const response = await window.AUTH.fetch(`${API_BASE_URL}/trainers/department/${department}`);
                if (!response.ok) {
                    throw new Error('Failed to fetch trainers');
                }
                
                const data = await response.json();
                const trainers = data.trainers || [];
                const trainerSelect = document.getElementById('trainerSelect');
                
                trainerSelect.innerHTML = '<option value="">Select Trainer</option>';
                trainers.forEach(trainer => {
                    const option = document.createElement('option');
                    option.value = trainer._id;
                    option.textContent = trainer.name;
                    trainerSelect.appendChild(option);
                });
            } catch (error) {
                console.error('Error loading trainers by department:', error);
            }
        }

        // Load all trainers for specific trainer selection
        async function loadAllTrainers() {
            try {
                const response = await window.AUTH.fetch(`${API_BASE_URL}/trainers/all-departments`);
                if (!response.ok) {
                    throw new Error('Failed to fetch trainers');
                }
                
                const data = await response.json();
                const trainers = data.trainers || [];
                const trainerSelect = document.getElementById('trainerSelect');
                
                trainerSelect.innerHTML = '<option value="">Select Trainer</option>';
                trainers.forEach(trainer => {
                    const option = document.createElement('option');
                    option.value = trainer._id;
                    option.textContent = `${trainer.name} (${trainer.department})`;
                    trainerSelect.appendChild(option);
                });
            } catch (error) {
                console.error('Error loading all trainers:', error);
            }
        }

        // Load trainers for dropdown
        async function loadTrainers() {
            try {
                const response = await window.AUTH.fetch(`${API_BASE_URL}/trainers/all-departments`);
                if (!response.ok) {
                    throw new Error('Failed to fetch trainers');
                }
                
                const data = await response.json();
                const trainers = data.trainers || [];
                const trainerSelect = document.getElementById('trainerSelect');
                
                trainerSelect.innerHTML = '<option value="all_trainers">All Trainers</option>';
                trainers.forEach(trainer => {
                    const option = document.createElement('option');
                    option.value = trainer._id;
                    option.textContent = `${trainer.name} (${trainer.department})`;
                    trainerSelect.appendChild(option);
                });
            } catch (error) {
                console.error('Error loading trainers:', error);
                document.getElementById('trainerSelect').innerHTML = '<option value="all_trainers">Error loading trainers</option>';
            }
        }

window.DeputyTabs.tools = {
    init() {
        fetchToolsOfTrade();
        loadTrainers();   // populate #trainerSelect in the tool-request modal
    }
};
