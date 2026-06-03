// tabs/attachment-applications.js — ILO attachment applications: list, review, print.
window.ILOTabs = window.ILOTabs || {};

// (verbatim from iloDashboard.js)
// Load attachment applications
async function loadAttachmentApplications() {
    try {
        console.log('Loading attachment applications from:', API_BASE_URL + '/ilo/attachment-applications');
        const response = await authFetch(API_BASE_URL + '/ilo/attachment-applications');
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }
        
        const data = await response.json();
        attachmentApplications = data.applications || [];
        console.log('Found', attachmentApplications.length, 'attachment applications');
        
        displayAttachmentApplications(attachmentApplications);
    } catch (error) {
        console.error('Error loading attachment applications:', error);
        showToast('Failed to load attachment applications: ' + error.message, 'error');
    }
}

// Display attachment applications
function displayAttachmentApplications(applications) {
    const container = document.getElementById('attachment-applications-list');
    const empty = document.getElementById('attachment-empty');
    // If the partial hasn't been injected yet, bail quietly rather than throw on
    // a null container (which would silently abort the whole render — the
    // "attachments not loading" symptom).
    if (!container || !empty) return;

    // Apply filters. Guard the .value reads: the filter <select>s live in the
    // same partial, but a missing element must not throw and blank the list.
    const statusEl = document.getElementById('attachment-status-filter');
    const countyEl = document.getElementById('attachment-county-filter');
    const statusFilter = statusEl ? statusEl.value : '';
    const countyFilter = countyEl ? countyEl.value : '';

    const list = Array.isArray(applications) ? applications : [];
    const filteredApplications = list.filter(app => {
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
        '<div class="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg p-4 mb-4">' +
            '<div class="flex justify-between items-start">' +
                '<div class="flex-1">' +
                    '<div class="flex items-center mb-2">' +
                        '<h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100">' + escapeHtml(app.studentName) + '</h4>' +
                        '<span class="ml-3 px-2 py-1 text-xs font-medium rounded-full ' + getStatusClass(app.status) + '">' + escapeHtml(app.status?.replace('_', ' ') || app.status) + '</span>' +
                    '</div>' +
                    '<div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm text-gray-600 dark:text-gray-300">' +
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

    // The print window's base URL is about:blank, so a relative logo src can't
    // resolve and drops out of the preview/print. Use an absolute origin URL, and
    // print-color-adjust:exact so the maroon header bar survives printing.
    const logoUrl = window.location.origin + '/public/img/logo.png';

    printWindow.document.write(
        '<html>' +
            '<head>' +
                '<title>Attachment Applications Report</title>' +
                '<style>' +
                    '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
                    'table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background-color:#f2f2f2}' +
                '</style>' +
            '</head>' +
            '<body>' +
                '<div style="text-align:center;border-bottom:3px solid #7A0C0C;padding-bottom:10px;margin-bottom:16px">' +
                    '<img src="' + logoUrl + '" alt="EDTTI" style="height:60px;object-fit:contain"><br>' +
                    '<div style="font-size:17px;font-weight:bold;color:#7A0C0C">EMURUA DIKIRR TECHNICAL TRAINING INSTITUTE</div>' +
                    '<div style="font-size:11px;color:#555">P.O. Box 180-20401, Chebunyo<br>Tel: 0740 555 123 | Email: emuruadikirrtti2019@gmail.com<br>Website: edtti.ac.ke | ISO 9001:2015 Certified Institution</div>' +
                '</div>' +
                '<h1 style="text-align:center;font-size:16px">Attachment Applications Report</h1>' +
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
    // Wait for the logo image to load before printing so it isn't dropped.
    printWindow.onload = function () { printWindow.focus(); printWindow.print(); };
    setTimeout(function () { try { printWindow.focus(); printWindow.print(); } catch (e) {} }, 500);
}

window.printAttachmentList = printAttachmentList;

// Export the filtered attachment list as a branded PDF (logo embedded as a
// dataURL via EDTTIDocs, so it can never drop the way the print img can).
async function exportAttachmentPDF() {
    if (!window.EDTTIDocs || !window.jspdf) {
        showToast('PDF library not loaded yet — please retry in a moment', 'error');
        return;
    }
    const statusEl = document.getElementById('attachment-status-filter');
    const countyEl = document.getElementById('attachment-county-filter');
    const statusFilter = statusEl ? statusEl.value : '';
    const countyFilter = countyEl ? countyEl.value : '';
    const apps = (Array.isArray(attachmentApplications) ? attachmentApplications : []).filter(app => {
        const statusMatch = !statusFilter || app.status === statusFilter;
        const countyMatch = !countyFilter || app.county === countyFilter;
        return statusMatch && countyMatch;
    });
    const rows = apps.map(app => [
        app.studentName || '',
        app.admissionNumber || '',
        formatCourseName(app.course) || '',
        [app.county, app.nearestTown].filter(Boolean).join(', '),
        (app.status || '').replace('_', ' '),
        app.createdAt ? new Date(app.createdAt).toLocaleDateString() : '',
    ]);
    try {
        await window.EDTTIDocs.tablePDF({
            title: 'Attachment Applications Report',
            subtitle: 'Industrial Liaison Office',
            columns: ['Name', 'Admission No.', 'Course', 'Location', 'Status', 'Applied'],
            rows,
            filename: 'attachment_applications_' + new Date().toISOString().slice(0, 10) + '.pdf',
            footer: 'EDTTI UMS — ILO · Attachment Applications',
        });
    } catch (err) {
        console.error('Export PDF failed:', err);
        showToast('Failed to export PDF: ' + err.message, 'error');
    }
}

window.exportAttachmentPDF = exportAttachmentPDF;

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
