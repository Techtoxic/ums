// tabs/tools.js — deputy Tools of Trade: list, request modal, review/approve, downloads.
// The tool-request modal (incl. #trainerSelect) ships inside tools.html; the
// review modal is created dynamically. loadTrainers() populates #trainerSelect.
window.DeputyTabs = window.DeputyTabs || {};

// (verbatim from the monolith inline scripts)
        // Tools of Trade Modal Functions
        function openToolRequestModal() {
            const m = document.getElementById('toolRequestModal');
            m.classList.remove('hidden');
            m.classList.add('flex');
            m.style.display = 'flex'; // ensure visibility regardless of class cascade
            document.body.classList.add('menu-open');
        }

        function closeToolRequestModal() {
            const m = document.getElementById('toolRequestModal');
            m.classList.add('hidden');
            m.classList.remove('flex');
            m.style.display = 'none';
            document.body.classList.remove('menu-open');
        }

        // Global variable to store tools data
        let toolsData = [];

        // Fetch and display tools of trade
        async function fetchToolsOfTrade() {
            const toolsContainer = document.getElementById('toolsContainer');
            if (!toolsContainer) return;

            // Show loading state
            toolsContainer.innerHTML = '<div class="text-center py-6"><i class="ri-loader-4-line animate-spin text-2xl text-primary"></i></div>';

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
                toolsPage = 1;
                displayToolsOfTrade();
            } catch (error) {
                console.error('Error fetching tools:', error);
                toolsContainer.innerHTML = `
                    <div class="text-center py-6 text-danger">
                        <i class="ri-error-warning-line text-2xl mb-2"></i>
                        <p>Failed to load tools. Please try again later.</p>
                    </div>`;
                showToast(error.message, 'error');
            }
        }

        // Filter + pagination state for the tools list.
        let toolsFilters = { type: '', department: '', status: '' };
        let toolsPage = 1;
        const TOOLS_PAGE_SIZE = 12;

        function getFilteredTools() {
            return (toolsData || []).filter(t =>
                (!toolsFilters.type || t.toolType === toolsFilters.type) &&
                (!toolsFilters.department || t.trainerDepartment === toolsFilters.department) &&
                (!toolsFilters.status || t.status === toolsFilters.status)
            );
        }

        // Human-readable department label from a snake_case code (Rule 7: prefer
        // the shared catalog; fall back to a title-cased code).
        function toolDeptLabel(code) {
            if (!code) return 'Unassigned';
            if (window.Catalog && typeof window.Catalog.departmentName === 'function') {
                const n = window.Catalog.departmentName(code);
                if (n) return n;
            }
            return String(code).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }

        const TOOL_TYPE_NAMES = {
            'course_outline': 'Course Outline',
            'learning_plan': 'Learning Plan',
            'record_of_work': 'Record of Work',
            'session_plan': 'Session Plan',
            'exam': 'Exam',
            'tvet_license': 'TVET License'
        };

        // One tool as a table row (all actions inline).
        function toolRowHtml(tool) {
            const statusClass = getStatusClass(tool.status);
            const trainerName = tool.trainerName || 'Unknown Trainer';
            const submittedAt = tool.createdAt ? new Date(tool.createdAt).toLocaleDateString() : 'N/A';
            const cell = 'padding:12px';
            return `
                <tr>
                    <td style="${cell};font-weight:600">${escapeHtml(TOOL_TYPE_NAMES[tool.toolType] || tool.toolType)}</td>
                    <td style="${cell}">${escapeHtml(trainerName)}</td>
                    <td style="${cell};color:var(--text-secondary)">${escapeHtml(toolDeptLabel(tool.trainerDepartment))}</td>
                    <td style="${cell};color:var(--text-secondary)">${escapeHtml(submittedAt)}</td>
                    <td style="${cell}"><span class="pill ${statusClass}">${escapeHtml((tool.status || '').replace('_', ' ').toUpperCase())}</span></td>
                    <td style="${cell};text-align:right;white-space:nowrap">
                        <button onclick="reviewTool('${escapeAttr(tool.id)}')" class="adm-btn adm-btn--outline adm-btn--sm"><i class="ri-eye-line"></i> Review</button>
                        <button onclick="downloadTool('${escapeAttr(tool.id)}')" class="adm-btn adm-btn--ghost adm-btn--sm" title="Download"><i class="ri-download-line"></i></button>
                        <button onclick="deleteToolDeputy('${escapeAttr(tool.id)}')" class="adm-btn adm-btn--ghost adm-btn--sm" title="Delete" style="color:var(--error,#dc2626)"><i class="ri-delete-bin-line"></i></button>
                    </td>
                </tr>`;
        }

        // Render the filtered + paginated tools table.
        function displayToolsOfTrade() {
            const toolsContainer = document.getElementById('toolsContainer');
            if (!toolsContainer) return;

            const filtered = getFilteredTools();
            const pager = document.getElementById('toolsPagination');

            if (!filtered.length) {
                toolsContainer.innerHTML = `
                    <div class="adm-card"><div class="adm-card__body" style="text-align:center;padding:32px 0;color:var(--text-muted)">
                        <i class="ri-tools-line" style="font-size:32px;display:block;margin-bottom:8px;color:var(--text-tertiary)"></i>
                        <p style="font-size:13px">${(toolsData && toolsData.length) ? 'No tools match the selected filters' : 'No tools of trade submitted yet'}</p>
                    </div></div>`;
                if (pager) pager.classList.add('hidden');
                return;
            }

            const totalPages = Math.max(1, Math.ceil(filtered.length / TOOLS_PAGE_SIZE));
            if (toolsPage > totalPages) toolsPage = totalPages;
            if (toolsPage < 1) toolsPage = 1;
            const start = (toolsPage - 1) * TOOLS_PAGE_SIZE;
            const pageItems = filtered.slice(start, start + TOOLS_PAGE_SIZE);

            const head = 'text-align:left;padding:10px 12px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted)';
            toolsContainer.innerHTML = `
                <div class="adm-card"><div class="adm-card__body" style="padding:0;overflow-x:auto">
                    <table style="width:100%;border-collapse:collapse;font-size:14px">
                        <thead><tr>
                            <th style="${head}">Tool Type</th>
                            <th style="${head}">Trainer</th>
                            <th style="${head}">Department</th>
                            <th style="${head}">Submitted</th>
                            <th style="${head}">Status</th>
                            <th style="${head};text-align:right">Actions</th>
                        </tr></thead>
                        <tbody>${pageItems.map(toolRowHtml).join('')}</tbody>
                    </table>
                </div></div>`;

            renderToolsPagination(filtered.length, totalPages, start, pageItems.length);
        }

        function renderToolsPagination(total, totalPages, start, pageCount) {
            const el = document.getElementById('toolsPagination');
            if (!el) return;
            if (totalPages <= 1) { el.classList.add('hidden'); el.innerHTML = ''; return; }
            const prevDis = toolsPage <= 1, nextDis = toolsPage >= totalPages;
            const btn = (label, dis, target) =>
                `<button ${dis ? 'disabled' : ''} onclick="toolsGoToPage(${target})" class="adm-btn adm-btn--ghost adm-btn--sm" ${dis ? 'style="opacity:.4;cursor:not-allowed"' : ''}>${label}</button>`;
            el.innerHTML = `
                <span style="color:var(--text-muted)">Showing ${start + 1}–${start + pageCount} of ${total}</span>
                <div style="display:flex;align-items:center;gap:8px">
                    ${btn('<i class="ri-arrow-left-s-line"></i> Prev', prevDis, toolsPage - 1)}
                    <span style="color:var(--text-muted)">Page ${toolsPage} of ${totalPages}</span>
                    ${btn('Next <i class="ri-arrow-right-s-line"></i>', nextDis, toolsPage + 1)}
                </div>`;
            el.classList.remove('hidden');
        }
        function toolsGoToPage(p) { toolsPage = p; displayToolsOfTrade(); }
        window.toolsGoToPage = toolsGoToPage;

        function getStatusClass(status) {
            const statusClasses = {
                'submitted': 'pill--info',
                'reviewed': 'pill--success',
                'approved': 'pill--success',
                'rejected': 'pill--error',
                'needs_revision': 'pill--warning'
            };
            return statusClasses[status] || 'pill--neutral';
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
                
                console.log(`Downloading file from ${data.storageType}:`, data.fileName);
                
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
                console.error('Error downloading tool:', error);
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
                console.error('Error deleting tool:', error);
                showToast('Failed to delete tool: ' + error.message, 'error');
            }
        }

        // Show tool review modal
        function showToolReviewModal(tool) {
            // Create review modal (admin adm-modal styling).
            const modal = document.createElement('div');
            modal.id = 'toolReviewModal';
            modal.className = 'adm-modal-overlay';
            modal.innerHTML = `
                <div class="adm-modal" style="max-width:680px">
                    <div class="adm-modal__head">
                        <div class="adm-modal__title"><i class="ri-eye-line"></i> Review Tool of Trade</div>
                        <button onclick="closeReviewModal()" class="admin-iconbtn" aria-label="Close"><i class="ri-close-line text-xl"></i></button>
                    </div>
                    <div class="adm-modal__body" style="display:flex;flex-direction:column;gap:16px">
                        <!-- Tool Info -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label class="adm-label">Tool Type</label>
                                <p class="td-strong" style="text-transform:capitalize">${escapeHtml((tool.toolType || '').replace('_', ' '))}</p>
                            </div>
                            <div>
                                <label class="adm-label">File Name</label>
                                <p class="td-strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(tool.originalFileName || '')}</p>
                            </div>
                            <div>
                                <label class="adm-label">File Size</label>
                                <p class="td-strong">${escapeHtml(formatFileSize(tool.fileSize || 0))}</p>
                            </div>
                            <div>
                                <label class="adm-label">Status</label>
                                <div><span class="pill ${getStatusClass(tool.status)}">${escapeHtml((tool.status || '').replace('_', ' '))}</span></div>
                            </div>
                        </div>

                        <!-- File Preview -->
                        <div>
                            <label class="adm-label">File Preview</label>
                            <div class="adm-card"><div class="adm-card__body" style="text-align:center">
                                <i class="ri-file-pdf-line" style="font-size:26px;color:#dc2626"></i>
                                <p class="kpi__note" style="margin-top:4px">PDF Preview</p>
                                <p class="kpi__note">Click download to view full content</p>
                            </div></div>
                        </div>

                        <!-- Review Actions -->
                        <div style="display:flex;flex-direction:column;gap:12px">
                            <div>
                                <label class="adm-label">Review Status</label>
                                <select id="reviewStatus" class="adm-select">
                                    <option value="">Select Status...</option>
                                    <option value="reviewed">Reviewed</option>
                                    <option value="rejected">Rejected</option>
                                </select>
                            </div>
                            <div>
                                <label class="adm-label">Feedback</label>
                                <textarea id="reviewFeedback" rows="2" class="adm-textarea" placeholder="Enter your feedback..."></textarea>
                            </div>
                        </div>

                        <!-- Action Buttons -->
                        <div class="flex justify-end" style="gap:8px">
                            <button onclick="closeReviewModal()" class="adm-btn adm-btn--ghost">Cancel</button>
                            <button onclick="downloadTool('${escapeAttr(tool.id)}')" class="adm-btn adm-btn--outline"><i class="ri-download-line"></i> Download</button>
                            <button onclick="updateToolStatus('${escapeAttr(tool.id)}')" class="adm-btn adm-btn--primary"><i class="ri-check-line"></i> Update Status</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
        }

        // Close review modal
        function closeReviewModal() {
            const modal = document.getElementById('toolReviewModal');
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
                
                console.log('Debug modal elements:', { 
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
                
                console.log('Debug extracted values:', { status, feedback });

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
                // /trainers/department/:department returns a raw array (each row
                // carries `_id`); be tolerant of a {trainers:[…]} shape too.
                const trainers = Array.isArray(data) ? data : (data.trainers || []);
                const trainerSelect = document.getElementById('trainerSelect');

                trainerSelect.innerHTML = '<option value="">Select Trainer</option>';
                trainers.forEach(trainer => {
                    const option = document.createElement('option');
                    option.value = trainer.id || trainer._id;
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
                    option.value = trainer.id || trainer._id;
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
                    option.value = trainer.id || trainer._id;
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
        // Populate the "By Department" filter from the shared catalog (Rule 7).
        // Option values stay snake_case textCodes (drives loadTrainersByDepartment).
        const deptSelect = document.getElementById('departmentSelect');
        if (deptSelect && window.Catalog) {
            window.Catalog.populateDepartmentSelect(deptSelect, { includeAll: true, allLabel: 'Select Department' });
        }

        // Wire the list filters once (the partial persists across revisits).
        if (window.__deputyToolsFiltersWired) return;
        window.__deputyToolsFiltersWired = true;
        const fType = document.getElementById('toolsFilterType');
        const fDept = document.getElementById('toolsFilterDept');
        const fStatus = document.getElementById('toolsFilterStatus');
        if (fDept && window.Catalog) {
            window.Catalog.populateDepartmentSelect(fDept, { includeAll: true, allLabel: 'All Departments' });
        }
        const onChange = () => {
            toolsFilters = {
                type: fType ? fType.value : '',
                department: fDept ? fDept.value : '',
                status: fStatus ? fStatus.value : '',
            };
            toolsPage = 1;
            displayToolsOfTrade();
        };
        if (fType) fType.addEventListener('change', onChange);
        if (fDept) fDept.addEventListener('change', onChange);
        if (fStatus) fStatus.addEventListener('change', onChange);
        const clearBtn = document.getElementById('toolsClearFilters');
        if (clearBtn) clearBtn.addEventListener('click', () => {
            if (fType) fType.value = '';
            if (fDept) fDept.value = '';
            if (fStatus) fStatus.value = '';
            toolsFilters = { type: '', department: '', status: '' };
            toolsPage = 1;
            displayToolsOfTrade();
        });
    }
};
