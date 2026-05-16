// Export Utilities for Registrar Dashboard
// Production-level export functionality with multiple formats and filters

const API_BASE_URL = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : `${window.location.protocol}//${window.location.host}/api`;

class StudentExporter {
    constructor() {
        this.students = [];
        this.departmentMapping = {
            'applied_science': 'Applied Science Department',
            'agriculture': 'Agriculture Department',
            'building_civil': 'Building and Civil Department',
            'electromechanical': 'Electromechanical Department',
            'hospitality': 'Hospitality Department',
            'business_liberal': 'Business and Liberal Studies',
            'computing_informatics': 'Computing and Informatics'
        };
    }

    // Load students data
    async loadStudents() {
        try {
            const response = await fetch(`${API_BASE_URL}/students`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.students = await response.json();
            return this.students;
        } catch (error) {
            console.error('Error loading students:', error);
            throw error;
        }
    }

    // Filter students based on criteria (supports multiple filters)
    filterStudents(filters) {
        if (!filters || Object.keys(filters).length === 0) {
            return this.students;
        }

        return this.students.filter(student => {
            let matches = true;
            
            // Check each filter condition
            Object.entries(filters).forEach(([filterType, filterValue]) => {
                if (!filterValue || filterValue === 'all' || filterValue === '') return;
                
                switch (filterType) {
                    case 'department':
                        if (student.department !== filterValue) matches = false;
                        break;
                    case 'year':
                        if (student.year !== parseInt(filterValue)) matches = false;
                        break;
                    case 'intake':
                        if (student.intake !== filterValue) matches = false;
                        break;
                    case 'intakeYear':
                        if (student.intakeYear !== parseInt(filterValue)) matches = false;
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

    // Format student data for export
    formatStudentData(students) {
        return students.map(student => ({
            'Admission Number': student.admissionNumber || 'N/A',
            'Full Name': student.name || 'N/A',
            'ID Number': student.idNumber || 'N/A',
            'Course': student.course || 'N/A',
            'Department': this.departmentMapping[student.department] || student.department || 'N/A',
            'Year of Study': student.year || 'N/A',
            'Intake': student.intake ? 
                (student.intake.charAt(0).toUpperCase() + student.intake.slice(1) + ' ' + (student.intakeYear || '')) : 'N/A',
            'Phone Number': student.phoneNumber || 'N/A',
            'KCSE Grade': student.kcseGrade || 'N/A',
            'Admission Type': student.admissionType ? 
                (student.admissionType === 'walk-in' ? 'Walk-in' : 'KUCCPS') : 'N/A',
            'Registration Date': student.createdAt ? new Date(student.createdAt).toLocaleDateString() : 'N/A'
        }));
    }

    // Export to CSV
    exportToCSV(data, filename = 'students_export.csv') {
        if (!data || data.length === 0) {
            throw new Error('No data to export');
        }

        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => 
                headers.map(header => {
                    const value = row[header];
                    // Escape commas and quotes in CSV
                    if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                        return `"${value.replace(/"/g, '""')}"`;
                    }
                    return value;
                }).join(',')
            )
        ].join('\n');

        this.downloadFile(csvContent, filename, 'text/csv');
    }

    // Export to JSON
    exportToJSON(data, filename = 'students_export.json') {
        if (!data || data.length === 0) {
            throw new Error('No data to export');
        }

        const jsonContent = JSON.stringify({
            exportDate: new Date().toISOString(),
            totalRecords: data.length,
            data: data
        }, null, 2);

        this.downloadFile(jsonContent, filename, 'application/json');
    }

    // Export to PDF
    exportToPDF(data, filename = 'students_export.pdf', filters = {}) {
        if (!data || data.length === 0) {
            throw new Error('No data to export');
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4'); // Landscape orientation
        
        // Add title
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text('Student Export Report', 20, 20);
        
        // Add export info
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 30);
        doc.text(`Total Records: ${data.length}`, 20, 35);
        
        // Add filter info if any
        let yPosition = 40;
        if (filters && Object.keys(filters).length > 0) {
            doc.text('Filters Applied:', 20, yPosition);
            yPosition += 5;
            Object.entries(filters).forEach(([key, value]) => {
                if (value) {
                    const filterText = `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`;
                    doc.text(filterText, 25, yPosition);
                    yPosition += 5;
                }
            });
            yPosition += 5;
        }
        
        // Prepare table data
        const headers = Object.keys(data[0]);
        const tableData = data.map(row => headers.map(header => row[header] || 'N/A'));
        
        // Add table
        doc.autoTable({
            head: [headers],
            body: tableData,
            startY: yPosition,
            styles: {
                fontSize: 8,
                cellPadding: 2,
            },
            headStyles: {
                fillColor: [59, 130, 246], // Blue color
                textColor: [255, 255, 255],
                fontStyle: 'bold'
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252] // Light gray
            },
            margin: { top: yPosition, left: 20, right: 20 },
            tableWidth: 'auto',
            columnStyles: {
                0: { cellWidth: 25 }, // Admission Number
                1: { cellWidth: 35 }, // Name
                2: { cellWidth: 30 }, // Course
                3: { cellWidth: 25 }, // Department
                4: { cellWidth: 15 }, // Year
                5: { cellWidth: 25 }, // Intake
                6: { cellWidth: 20 }, // Phone
                7: { cellWidth: 15 }, // KCSE
                8: { cellWidth: 25 }  // Registration Date
            }
        });
        
        // Add footer
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.width - 30, doc.internal.pageSize.height - 10);
            doc.text('University Management System', 20, doc.internal.pageSize.height - 10);
        }
        
        // Save the PDF
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
        let prefix = 'students';

        if (exportType !== 'all' && filters && Object.keys(filters).length > 0) {
            const filterParts = [];
            
            if (filters.department) {
                filterParts.push(`dept_${filters.department}`);
            }
            if (filters.year) {
                filterParts.push(`year_${filters.year}`);
            }
            if (filters.intake) {
                filterParts.push(`intake_${filters.intake}`);
            }
            if (filters.intakeYear) {
                filterParts.push(`${filters.intakeYear}`);
            }
            
            if (filterParts.length > 0) {
                prefix += `_${filterParts.join('_')}`;
            }
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
    
    // Reset form
    const form = document.getElementById('export-form');
    if (form) {
        form.reset();
        toggleExportFilters();
    }
}

function toggleExportFilters() {
    const exportType = document.getElementById('export-type').value;
    const departmentFilter = document.getElementById('department-filter');
    const yearFilter = document.getElementById('year-filter');
    const intakeFilter = document.getElementById('intake-filter');
    const intakeYearFilter = document.getElementById('intake-year-filter');
    const admissionTypeFilter = document.getElementById('admission-type-filter');

    // Hide all filters first
    departmentFilter.classList.add('hidden');
    yearFilter.classList.add('hidden');
    intakeFilter.classList.add('hidden');
    intakeYearFilter.classList.add('hidden');
    admissionTypeFilter.classList.add('hidden');

    // Show relevant filters based on export type
    switch (exportType) {
        case 'department':
            departmentFilter.classList.remove('hidden');
            break;
        case 'year':
            yearFilter.classList.remove('hidden');
            break;
        case 'intake':
            intakeFilter.classList.remove('hidden');
            break;
        case 'department_year':
            departmentFilter.classList.remove('hidden');
            yearFilter.classList.remove('hidden');
            break;
        case 'department_intake':
            departmentFilter.classList.remove('hidden');
            intakeFilter.classList.remove('hidden');
            intakeYearFilter.classList.remove('hidden');
            break;
        case 'year_intake':
            yearFilter.classList.remove('hidden');
            intakeFilter.classList.remove('hidden');
            intakeYearFilter.classList.remove('hidden');
            break;
        case 'department_year_intake':
            departmentFilter.classList.remove('hidden');
            yearFilter.classList.remove('hidden');
            intakeFilter.classList.remove('hidden');
            intakeYearFilter.classList.remove('hidden');
            break;
        case 'admission-type':
            admissionTypeFilter.classList.remove('hidden');
            break;
        case 'custom':
            // Show all filters for custom selection
            departmentFilter.classList.remove('hidden');
            yearFilter.classList.remove('hidden');
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
    
    // Collect all filter values
    const filters = {};
    
    const departmentValue = document.getElementById('export-department').value;
    const yearValue = document.getElementById('export-year').value;
    const intakeValue = document.getElementById('export-intake').value;
    const intakeYearValue = document.getElementById('export-intake-year').value;
    const admissionTypeValue = document.getElementById('export-admission-type').value;
    
    if (departmentValue) filters.department = departmentValue;
    if (yearValue) filters.year = yearValue;
    if (intakeValue) filters.intake = intakeValue;
    if (intakeYearValue) filters.intakeYear = intakeYearValue;
    if (admissionTypeValue) filters.admissionType = admissionTypeValue;

    try {
        // Show loading state
        const submitBtn = event.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Exporting...';
        submitBtn.disabled = true;

        const exporter = new StudentExporter();
        await exporter.loadStudents();
        
        const filteredStudents = exporter.filterStudents(filters);
        
        if (filteredStudents.length === 0) {
            throw new Error('No students found matching the selected criteria');
        }

        const formattedData = exporter.formatStudentData(filteredStudents);
        const filename = exporter.generateFilename(exportType, filters, exportFormat);

        if (exportFormat === 'csv') {
            exporter.exportToCSV(formattedData, filename);
        } else if (exportFormat === 'json') {
            exporter.exportToJSON(formattedData, filename);
        } else if (exportFormat === 'pdf') {
            exporter.exportToPDF(formattedData, filename, filters);
        }

        showToast(`Successfully exported ${filteredStudents.length} students`, 'success');
        closeExportModal();

    } catch (error) {
        console.error('Export error:', error);
        showToast(`Export failed: ${error.message}`, 'error');
    } finally {
        // Reset button state
        const submitBtn = event.target.querySelector('button[type="submit"]');
        submitBtn.textContent = 'Export';
        submitBtn.disabled = false;
    }
}

// Initialize export functionality when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Set up export type change handler
    const exportTypeSelect = document.getElementById('export-type');
    if (exportTypeSelect) {
        exportTypeSelect.addEventListener('change', toggleExportFilters);
    }
});
