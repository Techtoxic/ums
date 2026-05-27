// tabs/graduation-applications.js — ILO graduation applications: list, review, print.
window.ILOTabs = window.ILOTabs || {};

// (verbatim from iloDashboard.js)
// Load graduation applications
async function loadGraduationApplications() {
    try {
        console.log('Loading graduation applications from:', API_BASE_URL + '/ilo/graduation-applications');
        const response = await authFetch(API_BASE_URL + '/ilo/graduation-applications');
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }
        
        const data = await response.json();
        graduationApplications = data.applications || [];
        console.log('Found', graduationApplications.length, 'graduation applications');
        
        displayGraduationApplications(graduationApplications);
    } catch (error) {
        console.error('Error loading graduation applications:', error);
        showToast('Failed to load graduation applications: ' + error.message, 'error');
    }
}

// Display graduation applications
function displayGraduationApplications(applications) {
    const container = document.getElementById('graduation-applications-list');
    const empty = document.getElementById('graduation-empty');
    
    // Apply filters (department filter dropped — backend has no department column)
    const statusFilter = document.getElementById('graduation-status-filter').value;

    const filteredApplications = applications.filter(app => {
        return !statusFilter || app.status === statusFilter;
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
                        '<div><strong>Applied:</strong> ' + new Date(app.appliedAt).toLocaleDateString() + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="ml-4 flex space-x-2">' +
                    '<button onclick="reviewApplication(\'graduation\', \'' + escapeAttr(app.id) + '\')" class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">' +
                        '<i class="ri-eye-line mr-1"></i>Review' +
                    '</button>' +
                '</div>' +
            '</div>' +
        '</div>'
    ).join('');
}

// Refresh functions
function refreshGraduationApplications() {
    loadGraduationApplications();
}

// Print graduation list
function printGraduationList() {
    const printWindow = window.open('', '_blank');
    
    // Apply same filters as display (department filter dropped)
    const statusFilter = document.getElementById('graduation-status-filter').value;

    const applications = graduationApplications.filter(app => {
        return !statusFilter || app.status === statusFilter;
    });

    const tableRows = applications.map(app =>
        '<tr>' +
            '<td>' + escapeHtml(app.studentName) + '</td>' +
            '<td>' + escapeHtml(app.admissionNumber) + '</td>' +
            '<td>' + escapeHtml(formatCourseName(app.course)) + '</td>' +
            '<td>' + escapeHtml(app.status) + '</td>' +
            '<td>' + new Date(app.appliedAt).toLocaleDateString() + '</td>' +
        '</tr>'
    ).join('');

    printWindow.document.write(
        '<html>' +
            '<head>' +
                '<title>Graduation Applications Report</title>' +
                '<style>table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background-color:#f2f2f2}</style>' +
            '</head>' +
            '<body>' +
                '<h1>Graduation Applications Report</h1>' +
                '<table>' +
                    '<thead>' +
                        '<tr>' +
                            '<th>Name</th>' +
                            '<th>Admission Number</th>' +
                            '<th>Course</th>' +
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

window.printGraduationList = printGraduationList;

window.ILOTabs['graduation-applications'] = {
    init() {
        loadGraduationApplications();
        // Wire the status filter once (from the monolith setupFilterEventListeners).
        if (window.__iloGradFilterWired) return;
        window.__iloGradFilterWired = true;
        const graduationStatusFilter = document.getElementById('graduation-status-filter');
        if (graduationStatusFilter) {
            graduationStatusFilter.addEventListener('change', () => {
                displayGraduationApplications(graduationApplications);
            });
        }
    }
};
