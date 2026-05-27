// tabs/tools-of-trade.js — dean tools-of-trade review: list, download, review/remove.
// The tool-review-modal is a shell global modal.
window.DeanTabs = window.DeanTabs || {};

// (verbatim from deanDashboard.js)
// Load tool submissions with the status + tool-type filters applied.
async function loadTools() {
    try {
        const status = document.getElementById('tools-filter-status').value;
        const toolType = document.getElementById('tools-filter-type').value;

        let url = `${API_BASE}/tools?`;
        if (status) url += `status=${encodeURIComponent(status)}&`;
        if (toolType) url += `toolType=${encodeURIComponent(toolType)}&`;

        const response = await authFetch(url);
        if (!response.ok) throw new Error('Failed to load tools');

        const tools = await response.json();
        displayTools(tools);
    } catch (error) {
        console.error('Error loading tools:', error);
        const tbody = document.getElementById('tools-table-body');
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-12 text-center text-red-500">
                    <i class="ri-error-warning-line text-4xl mb-4"></i>
                    <p>Failed to load submissions</p>
                </td>
            </tr>
        `;
        showNotification('Failed to load tool submissions', 'error');
    }
}

// Render the tool submissions table.
function displayTools(tools) {
    const tbody = document.getElementById('tools-table-body');

    if (!tools || tools.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-12 text-center text-gray-500">
                    <i class="ri-inbox-line text-4xl mb-4"></i>
                    <p>No submissions found</p>
                </td>
            </tr>
        `;
        return;
    }

    const statusBadges = {
        submitted: 'bg-gray-100 text-gray-800',
        reviewed: 'bg-green-100 text-green-800',
        rejected: 'bg-red-100 text-red-800'
    };

    tbody.innerHTML = tools.map(tool => {
        const badgeClass = statusBadges[tool.status] || 'bg-gray-100 text-gray-800';
        const typeLabel = TOOL_TYPE_LABELS[tool.toolType] || tool.toolType;
        const submitted = tool.createdAt ? new Date(tool.createdAt).toLocaleDateString() : 'N/A';
        return `
        <tr class="hover:bg-gray-50 transition">
            <td class="px-6 py-4">
                <div class="font-medium text-gray-900">${escapeHtml(tool.trainerName || 'Unknown')}</div>
                <div class="text-sm text-gray-500">${escapeHtml(tool.trainerDepartment || '')}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${escapeHtml(typeLabel)}</td>
            <td class="px-6 py-4 text-sm text-gray-900">${escapeHtml(tool.originalName || tool.fileName || '')}</td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-semibold rounded-full ${badgeClass}">
                    ${escapeHtml(tool.status)}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${escapeHtml(submitted)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                <button onclick="downloadTool('${escapeAttr(tool.id)}')"
                    class="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition">
                    <i class="ri-download-line mr-1"></i>Download
                </button>
                <button onclick="openToolReviewModal('${escapeAttr(tool.id)}')"
                    class="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition">
                    <i class="ri-check-line mr-1"></i>Review
                </button>
                <button onclick="removeTool('${escapeAttr(tool.id)}')"
                    class="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition">
                    <i class="ri-delete-bin-line mr-1"></i>Remove
                </button>
            </td>
        </tr>
        `;
    }).join('');
}

// Fetch a presigned S3 URL for the file and open it in a new tab.
async function downloadTool(toolId) {
    try {
        const response = await authFetch(`${API_BASE}/tools/${toolId}/download`);
        if (!response.ok) throw new Error('Failed to get download link');

        const data = await response.json();
        if (data.success && data.url) {
            window.open(data.url, '_blank');
        } else {
            throw new Error('No download URL returned');
        }
    } catch (error) {
        console.error('Error downloading tool:', error);
        showNotification('Failed to download file', 'error');
    }
}

// Open the review modal for a specific submission.
function openToolReviewModal(toolId) {
    currentReviewToolId = toolId;
    document.getElementById('tool-review-status').value = 'reviewed';
    document.getElementById('tool-review-feedback').value = '';

    document.getElementById('tool-review-modal').classList.remove('hidden');
    document.getElementById('tool-review-modal').classList.add('flex');
}

// Close the review modal.
function closeToolReviewModal() {
    document.getElementById('tool-review-modal').classList.add('hidden');
    document.getElementById('tool-review-modal').classList.remove('flex');
}

// Submit the review: PATCH the status (+ optional feedback), then refresh.
async function submitToolReview() {
    if (!currentReviewToolId) return;

    try {
        const status = document.getElementById('tool-review-status').value;
        const feedback = document.getElementById('tool-review-feedback').value.trim();

        const body = { status };
        if (feedback) body.feedback = feedback;

        const response = await authFetch(`${API_BASE}/tools/${currentReviewToolId}/status`, {
            method: 'PATCH',
            body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error('Failed to submit review');

        closeToolReviewModal();
        showNotification('Review submitted', 'success');
        loadTools();
    } catch (error) {
        console.error('Error submitting review:', error);
        showNotification('Failed to submit review', 'error');
    }
}

// Soft-delete a submission after confirmation, then refresh.
async function removeTool(toolId) {
    if (!confirm('Remove this submission from the list?')) return;

    try {
        const response = await authFetch(`${API_BASE}/tools/${toolId}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to remove submission');

        showNotification('Submission removed', 'success');
        loadTools();
    } catch (error) {
        console.error('Error removing tool:', error);
        showNotification('Failed to remove submission', 'error');
    }
}

window.DeanTabs['tools-of-trade'] = {
    init() {
        loadTools();
        // Wire the status/type filter selects once.
        if (window.__deanToolsWired) return;
        window.__deanToolsWired = true;
        const statusEl = document.getElementById('tools-filter-status');
        const typeEl = document.getElementById('tools-filter-type');
        if (statusEl) statusEl.addEventListener('change', loadTools);
        if (typeEl) typeEl.addEventListener('change', loadTools);
    }
};
