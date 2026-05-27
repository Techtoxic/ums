// tabs/attachment-applications.js — ILO attachment applications: list, review, print.
window.ILOTabs = window.ILOTabs || {};

// (verbatim from iloDashboard.js)
// Load attachment applications
async function loadAttachmentApplications() {
    try {
        console.log('📎 Loading attachment applications from:', API_BASE_URL + '/ilo/attachment-applications');
        const response = await authFetch(API_BASE_URL + '/ilo/attachment-applications');
        console.log('📎 Response status:', response.status);
        
        if (!response.ok) {
            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }
        
        const data = await response.json();
        attachmentApplications = data.applications || [];
        console.log('📎 Found', attachmentApplications.length, 'attachment applications');
        
        displayAttachmentApplications(attachmentApplications);
    } catch (error) {
        console.error('❌ Error loading attachment applications:', error);
        showToast('Failed to load attachment applications: ' + error.message, 'error');
    }
}

// Display attachment applications
function displayAttachmentApplications(applications) {
    const container = document.getElementById('attachment-applications-list');
    const empty = document.getElementById('attachment-empty');
    
    // Apply filters
    const statusFilter = document.getElementById('attachment-status-filter').value;
    const countyFilter = document.getElementById('attachment-county-filter').value;
    
    const filteredApplications = applications.filter(app => {
        const statusMatch = !statusFilter || app.status === statusFilter;
        const countyMatch = !countyFilter || app.county === countyFilter;
        return statusMatch && countyMatch;
    });
    
    if (!filteredApplications || filteredApplications.length === 0) {
        container.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    container.classList.remove('hidden');

    container.innerHTML = filteredApplications.map(app =>
        '<div class="border border-gray-200 rounded-lg p-4 mb-4">' +
            '<div class="flex justify-between items-start">' +
                '<div class="flex-1">' +
                    '<div class="flex items-center mb-2">' +
                        '<h4 class="text-lg font-semibold text-gray-900">' + escapeHtml(app.studentName) + '</h4>' +
                        '<span class="ml-3 px-2 py-1 text-xs font-medium rounded-full ' + getStatusClass(app.status) + '">' + escapeHtml(app.status?.replace('_', ' ') || app.status) + '</span>' +
                    '</div>' +
                    '<div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm text-gray-600">' +
                        '<div><strong>Admission:</strong> ' + escapeHtml(app.admissionNumber) + '</div>' +
                        '<div><strong>Course:</strong> ' + escapeHtml(formatCourseName(app.course)) + '</div>' +
                        '<div><strong>Location:</strong> ' + escapeHtml(app.county) + ', ' + escapeHtml(app.nearestTown) + '</div>' +
                        '<div><strong>Applied:</strong> ' + new Date(app.createdAt).toLocaleDateString() + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="ml-4 flex space-x-2">' +
                    '<button onclick="reviewApplication(\'attachment\', \'' + escapeAttr(app.id) + '\')" class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">' +
                        '<i class="ri-eye-line mr-1"></i>Review' +
                    '</button>' +
                '</div>' +
            '</div>' +
        '</div>'
    ).join('');
}

function refreshAttachmentApplications() {
    loadAttachmentApplications();
}

// Print attachment list
function printAttachmentList() {
    const printWindow = window.open('', '_blank');
    
    // Apply same filters as display
    const statusFilter = document.getElementById('attachment-status-filter').value;
    const countyFilter = document.getElementById('attachment-county-filter').value;
    
    const applications = attachmentApplications.filter(app => {
        const statusMatch = !statusFilter || app.status === statusFilter;
        const countyMatch = !countyFilter || app.county === countyFilter;
        return statusMatch && countyMatch;
    });

    const tableRows = applications.map(app =>
        '<tr>' +
            '<td>' + escapeHtml(app.studentName) + '</td>' +
            '<td>' + escapeHtml(app.admissionNumber) + '</td>' +
            '<td>' + escapeHtml(formatCourseName(app.course)) + '</td>' +
            '<td>' + escapeHtml(app.county) + ', ' + escapeHtml(app.nearestTown) + '</td>' +
            '<td>' + escapeHtml(app.status) + '</td>' +
            '<td>' + new Date(app.createdAt).toLocaleDateString() + '</td>' +
        '</tr>'
    ).join('');

    printWindow.document.write(
        '<html>' +
            '<head>' +
                '<title>Attachment Applications Report</title>' +
                '<style>table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background-color:#f2f2f2}</style>' +
            '</head>' +
            '<body>' +
                '<h1>Attachment Applications Report</h1>' +
                '<table>' +
                    '<thead>' +
                        '<tr>' +
                            '<th>Name</th>' +
                            '<th>Admission Number</th>' +
                            '<th>Course</th>' +
                            '<th>Location</th>' +
                            '<th>Status</th>' +
                            '<th>Application Date</th>' +
                        '</tr>' +
                    '</thead>' +
                    '<tbody>' +
                        tableRows +
                    '</tbody>' +
                '</table>' +
                '<p>Generated on: ' + new Date().toLocaleString() + '</p>' +
            '</body>' +
        '</html>'
    );
    printWindow.document.close();
    printWindow.print();
}

window.printAttachmentList = printAttachmentList;

window.ILOTabs['attachment-applications'] = {
    init() {
        loadAttachmentApplications();
        // Wire the status + county filters once (from setupFilterEventListeners).
        if (window.__iloAttachFilterWired) return;
        window.__iloAttachFilterWired = true;
        const attachmentStatusFilter = document.getElementById('attachment-status-filter');
        const attachmentCountyFilter = document.getElementById('attachment-county-filter');
        if (attachmentStatusFilter) {
            attachmentStatusFilter.addEventListener('change', () => {
                displayAttachmentApplications(attachmentApplications);
            });
        }
        if (attachmentCountyFilter) {
            attachmentCountyFilter.addEventListener('change', () => {
                displayAttachmentApplications(attachmentApplications);
            });
        }
    }
};
