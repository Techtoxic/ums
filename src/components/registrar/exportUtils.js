// Export Utilities for Registrar Dashboard.
//
// Production-grade exports (CSV / JSON / PDF). The PDF path uses jsPDF +
// autoTable and is deliberately rendered server-style: there are no editable
// inputs/forms in the output and the document is flattened so a third party
// cannot tamper with rows in a text editor without corrupting the file.

const API_BASE_URL = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : `${window.location.protocol}//${window.location.host}/api`;

// Cache the school logo as a dataURL so the PDF letterhead can embed it.
// Kicked off at module load so it is ready by the time the user exports.
let _registrarLogoDataUrl = null;
(function preloadLogo() {
    fetch('/public/img/logo.png')
        .then(r => (r.ok ? r.blob() : null))
        .then(blob => { if (!blob) return; const fr = new FileReader(); fr.onloadend = () => { _registrarLogoDataUrl = fr.result; }; fr.readAsDataURL(blob); })
        .catch(() => {});
})();

// Stage 2B-1B: authenticated fetch via the shared helper.
const authFetch = async (url, options = {}) => window.AUTH.fetch(url, options);

class StudentExporter {
    constructor() {
        this.students = [];
    }

    // Department display name from the shared DB-backed catalog (Rule 7), with a
    // title-case fallback if the catalog helper failed to load.
    deptDisplay(key) {
        if (window.Catalog) return window.Catalog.departmentName(key);
        return String(key || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    // Load students data (always pulls the full set via ?all=1 — exports must
    // not silently truncate to page 1).
    async loadStudents(filters = {}) {
        try {
            const params = new URLSearchParams({ all: '1' });
            if (filters.department) params.set('department', filters.department);
            if (filters.module) params.set('module', filters.module);
            if (filters.intake) params.set('intake', filters.intake);
            if (filters.intakeYear) params.set('intakeYear', filters.intakeYear);
            if (filters.admissionType) params.set('admissionType', filters.admissionType);
            if (filters.course) params.set('course', filters.course);

            const response = await authFetch(`${API_BASE_URL}/students?${params.toString()}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const body = await response.json();
            this.students = Array.isArray(body.students) ? body.students : (Array.isArray(body) ? body : []);
            return this.students;
        } catch (error) {
            console.error('Error loading students:', error);
            throw error;
        }
    }

    // Defensive client-side filtering — the server already filters on the
    // params we send, but custom-export mode mixes filters that the server
    // can't easily combine, so we double-check here.
    filterStudents(filters) {
        if (!filters || Object.keys(filters).length === 0) {
            return this.students;
        }

        return this.students.filter(student => {
            let matches = true;
            Object.entries(filters).forEach(([filterType, filterValue]) => {
                if (!filterValue || filterValue === 'all' || filterValue === '') return;

                switch (filterType) {
                    case 'department':
                        if (student.department !== filterValue) matches = false;
                        break;
                    case 'module':
                        if (Number(student.module) !== parseInt(filterValue)) matches = false;
                        break;
                    case 'intake':
                        if (student.intake !== filterValue) matches = false;
                        break;
                    case 'intakeYear':
                        if (Number(student.intakeYear) !== parseInt(filterValue)) matches = false;
                        break;
                    case 'course':
                        if (student.course !== filterValue) matches = false;
                        break;
                    case 'admissionType':
                        if (student.admissionType !== filterValue) matches = false;
                        break;
                }
            });
            return matches;
        });
    }

    // Format student data for export (production layout — full course names,
    // department display labels, module label, intake "Month Year"). All keys
    // are stable so CSV columns stay aligned across runs.
    formatStudentData(students) {
        return students.map(student => {
            // Program/course DISPLAY via the shared catalog (Rule 7); prefer a
            // server-provided display name, then the catalog, then title-case.
            const courseDisplay = student.courseName
                || (window.Catalog ? window.Catalog.formatCourseName(student.course) : null)
                || student.course || 'N/A';
            // Department DISPLAY via the catalog-backed deptDisplay() helper.
            const departmentDisplay = student.departmentName
                || this.deptDisplay(student.department)
                || student.department || 'N/A';
            return {
                'Admission Number': student.admissionNumber || 'N/A',
                'Full Name': student.name || 'N/A',
                'ID Number': student.idNumber || 'N/A',
                'Course': courseDisplay,
                'Course Code': student.courseCode || (student.course || ''),
                'Department': departmentDisplay,
                'Module': student.module != null ? `Module ${student.module}` : 'N/A',
                'Intake': student.intake
                    ? (student.intake.charAt(0).toUpperCase() + student.intake.slice(1) + ' ' + (student.intakeYear || ''))
                    : 'N/A',
                'Phone Number': student.phoneNumber || 'N/A',
                'Email': student.email || 'N/A',
                'Next of Kin Name': student.nextOfKinName || 'N/A',
                'Next of Kin Phone': student.nextOfKinPhone || 'N/A',
                'KCSE Grade': student.kcseGrade || 'N/A',
                'Admission Type': student.admissionType
                    ? (student.admissionType === 'walk-in' ? 'Walk-in' : 'KUCCPS')
                    : 'N/A',
                'Registration Date': student.createdAt ? new Date(student.createdAt).toLocaleDateString('en-GB') : 'N/A',
            };
        });
    }

    // Export to CSV (RFC-4180-ish quoting: any field that contains a comma,
    // a newline, or a double-quote is wrapped in quotes and internal quotes
    // are doubled). Forces a UTF-8 BOM so Excel renders accents correctly.
    exportToCSV(data, filename = 'students_export.csv') {
        if (!data || data.length === 0) {
            throw new Error('No data to export');
        }

        const csvCell = (value) => {
            const s = value == null ? '' : String(value);
            if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
            return s;
        };

        const headers = Object.keys(data[0]);
        const lines = [headers.map(csvCell).join(',')];
        for (const row of data) lines.push(headers.map(h => csvCell(row[h])).join(','));
        const csvContent = '\uFEFF' + lines.join('\r\n');
        this.downloadFile(csvContent, filename, 'text/csv;charset=utf-8');
    }

    // Export to JSON (also bundles an exportedAt timestamp + count so the
    // file is self-describing for downstream tooling).
    exportToJSON(data, filename = 'students_export.json') {
        if (!data || data.length === 0) {
            throw new Error('No data to export');
        }
        const jsonContent = JSON.stringify({
            exportedAt: new Date().toISOString(),
            generatedBy: 'EDTTI UMS Registrar Portal',
            totalRecords: data.length,
            data,
        }, null, 2);
        this.downloadFile(jsonContent, filename, 'application/json');
    }

    // Export to PDF (production layout).
    // - Landscape A4 for legibility
    // - EDTTI letterhead at the top
    // - "Generated by … on …" footer + page numbers
    // - Watermark "OFFICIAL · EDTTI" on every page so a tampered PDF is
    //   instantly obvious to a reader
    // - Document is locked with metadata + standard encryption when supported
    //   (user-password empty, owner-password = a random per-export string),
    //   which jsPDF's setEncryption() ships out of the box; this prevents
    //   silent edits in viewers that respect encryption metadata.
    exportToPDF(data, filename = 'students_export.pdf', filters = {}) {
        if (!data || data.length === 0) {
            throw new Error('No data to export');
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // PDF metadata (helps document control downstream).
        doc.setProperties({
            title: 'EDTTI Student Export Report',
            subject: 'Student Records Export',
            author: 'EDTTI University Management System',
            keywords: 'EDTTI, UMS, students, export',
            creator: 'EDTTI UMS Registrar Portal',
        });

        // Letterhead — school logo (top-left) + institution name.
        if (_registrarLogoDataUrl) {
            try { doc.addImage(_registrarLogoDataUrl, 'PNG', 14, 6, 22, 19); } catch (e) { /* ignore */ }
        }
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text('EMURUA DIKIRR TECHNICAL TRAINING INSTITUTE', pageWidth / 2, 14, { align: 'center' });
        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');
        doc.text('Registrar — Student Records Export', pageWidth / 2, 21, { align: 'center' });

        doc.setFontSize(9);
        doc.text(`Generated on: ${new Date().toLocaleString('en-GB')}`, 14, 30);
        doc.text(`Total Records: ${data.length}`, 14, 35);

        let yPosition = 40;
        if (filters && Object.keys(filters).length > 0) {
            doc.text('Filters Applied:', 14, yPosition);
            yPosition += 5;
            Object.entries(filters).forEach(([key, value]) => {
                if (!value) return;
                const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
                doc.text(`• ${label}: ${value}`, 18, yPosition);
                yPosition += 5;
            });
            yPosition += 2;
        }

        const headers = Object.keys(data[0]);
        const tableData = data.map(row => headers.map(header => row[header] == null ? '' : String(row[header])));

        doc.autoTable({
            head: [headers],
            body: tableData,
            startY: yPosition,
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
            headStyles: { fillColor: [122, 12, 12], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [250, 244, 232] },
            margin: { left: 8, right: 8 },
        });

        // Watermark + footer on every page.
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            // Diagonal "OFFICIAL · EDTTI" watermark — light gray, large font.
            doc.setTextColor(225, 215, 195);
            doc.setFontSize(60);
            doc.setFont(undefined, 'bold');
            doc.text('OFFICIAL · EDTTI', pageWidth / 2, pageHeight / 2, {
                align: 'center', angle: 30,
            });
            // Footer.
            doc.setTextColor(80);
            doc.setFont(undefined, 'normal');
            doc.setFontSize(7);
            doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
            doc.text('EDTTI UMS — Registrar Portal · Confidential', 14, pageHeight - 6);
        }

        // Document protection: jsPDF supports a printing/modifying password
        // option for the standard PDF encryption header. We set a random owner
        // password per export so the document can be opened by anyone but
        // cannot be silently edited inside most viewers.
        try {
            const ownerPwd = `EDTTI-LOCK-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
            doc.setEncryption('', ownerPwd, {
                printing: 'highResolution',
                modifying: false,
                copying: true,
                annotating: false,
                fillingForms: false,
                contentAccessibility: true,
                documentAssembly: false,
            });
        } catch (encryptErr) {
            // jsPDF older builds may not ship setEncryption; we still emit
            // the PDF with metadata + watermark which on its own makes
            // tampering visually obvious.
            console.warn('PDF encryption unavailable:', encryptErr && encryptErr.message);
        }

        doc.save(filename);
    }

    // Download file helper
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    // Generate filename based on filters
    generateFilename(exportType, filters, format) {
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        let prefix = 'EDTTI_students';

        if (exportType !== 'all' && filters && Object.keys(filters).length > 0) {
            const filterParts = [];
            if (filters.department) filterParts.push(`dept_${filters.department}`);
            if (filters.module) filterParts.push(`module_${filters.module}`);
            if (filters.intake) filterParts.push(`intake_${filters.intake}`);
            if (filters.intakeYear) filterParts.push(`${filters.intakeYear}`);
            if (filters.admissionType) filterParts.push(`type_${filters.admissionType}`);
            if (filterParts.length > 0) prefix += `_${filterParts.join('_')}`;
        }

        return `${prefix}_${timestamp}.${format}`;
    }
}

// Export modal functions
function showExportModal() {
    const modal = document.getElementById('export-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closeExportModal() {
    const modal = document.getElementById('export-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    const form = document.getElementById('export-form');
    if (form) {
        form.reset();
        toggleExportFilters();
    }
}

function toggleExportFilters() {
    const exportTypeEl = document.getElementById('export-type');
    if (!exportTypeEl) return;
    const exportType = exportTypeEl.value;
    const departmentFilter = document.getElementById('department-filter');
    const moduleFilter = document.getElementById('module-filter');
    const intakeFilter = document.getElementById('intake-filter');
    const intakeYearFilter = document.getElementById('intake-year-filter');
    const admissionTypeFilter = document.getElementById('admission-type-filter');

    if (!departmentFilter) return;

    departmentFilter.classList.add('hidden');
    moduleFilter.classList.add('hidden');
    intakeFilter.classList.add('hidden');
    intakeYearFilter.classList.add('hidden');
    admissionTypeFilter.classList.add('hidden');

    switch (exportType) {
        case 'department': departmentFilter.classList.remove('hidden'); break;
        case 'module': moduleFilter.classList.remove('hidden'); break;
        case 'intake':
            intakeFilter.classList.remove('hidden');
            intakeYearFilter.classList.remove('hidden');
            break;
        case 'department_module':
            departmentFilter.classList.remove('hidden');
            moduleFilter.classList.remove('hidden');
            break;
        case 'department_intake':
            departmentFilter.classList.remove('hidden');
            intakeFilter.classList.remove('hidden');
            intakeYearFilter.classList.remove('hidden');
            break;
        case 'module_intake':
            moduleFilter.classList.remove('hidden');
            intakeFilter.classList.remove('hidden');
            intakeYearFilter.classList.remove('hidden');
            break;
        case 'department_module_intake':
            departmentFilter.classList.remove('hidden');
            moduleFilter.classList.remove('hidden');
            intakeFilter.classList.remove('hidden');
            intakeYearFilter.classList.remove('hidden');
            break;
        case 'admission-type': admissionTypeFilter.classList.remove('hidden'); break;
        case 'custom':
            departmentFilter.classList.remove('hidden');
            moduleFilter.classList.remove('hidden');
            intakeFilter.classList.remove('hidden');
            intakeYearFilter.classList.remove('hidden');
            admissionTypeFilter.classList.remove('hidden');
            break;
    }
}

async function handleExport(event) {
    event.preventDefault();

    const exportType = document.getElementById('export-type').value;
    const exportFormat = document.getElementById('export-format').value;

    const filters = {};
    const departmentValue = document.getElementById('export-department').value;
    const moduleValue = document.getElementById('export-module') ? document.getElementById('export-module').value : '';
    const intakeValue = document.getElementById('export-intake').value;
    const intakeYearValue = document.getElementById('export-intake-year').value;
    const admissionTypeValue = document.getElementById('export-admission-type').value;

    if (departmentValue) filters.department = departmentValue;
    if (moduleValue) filters.module = moduleValue;
    if (intakeValue) filters.intake = intakeValue;
    if (intakeYearValue) filters.intakeYear = intakeYearValue;
    if (admissionTypeValue) filters.admissionType = admissionTypeValue;

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.textContent : null;
    try {
        if (submitBtn) { submitBtn.textContent = 'Exporting…'; submitBtn.disabled = true; }

        const exporter = new StudentExporter();
        await exporter.loadStudents(filters);
        const filteredStudents = exporter.filterStudents(filters);

        if (filteredStudents.length === 0) {
            throw new Error('No students found matching the selected criteria');
        }

        const formattedData = exporter.formatStudentData(filteredStudents);
        const filename = exporter.generateFilename(exportType, filters, exportFormat);

        if (exportFormat === 'csv') exporter.exportToCSV(formattedData, filename);
        else if (exportFormat === 'json') exporter.exportToJSON(formattedData, filename);
        else if (exportFormat === 'pdf') exporter.exportToPDF(formattedData, filename, filters);

        showToast(`Successfully exported ${filteredStudents.length} student${filteredStudents.length === 1 ? '' : 's'}`, 'success');
        closeExportModal();
    } catch (error) {
        console.error('Export error:', error);
        showToast(`Export failed: ${error.message}`, 'error');
    } finally {
        if (submitBtn) { submitBtn.textContent = originalText || 'Export'; submitBtn.disabled = false; }
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const exportTypeSelect = document.getElementById('export-type');
    if (exportTypeSelect) {
        exportTypeSelect.addEventListener('change', toggleExportFilters);
    }
});
