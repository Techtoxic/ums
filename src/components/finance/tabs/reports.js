// tabs/reports.js — finance report PDF exports (revenue / outstanding / department).
window.FinanceTabs = window.FinanceTabs || {};

// (verbatim inline block)
        // Export functions for reports
        async function exportRevenueReport() {
            if (!financeAnalytics) {
                await initializeAnalytics();
            }
            
            try {
                // Show format selection
                const format = await showFormatSelectionModal('Revenue Report');
                if (!format) return; // User cancelled
                
                financeAnalytics.exportAnalyticsReport(format);
                showToast(`Revenue report exported as ${format.toUpperCase()} successfully!`, 'success');
            } catch (error) {
                console.error('Export error:', error);
                showToast('Failed to export revenue report', 'error');
            }
        }
        
        async function exportOutstandingReport() {
            if (!financeAnalytics) {
                await initializeAnalytics();
            }
            
            try {
                const outstandingStudents = financeAnalytics.getStudentsWithBalances(0);
                const totalOutstanding = outstandingStudents.reduce((sum, student) => sum + student.balance, 0);
                
                // Create PDF report
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF('p', 'mm', 'a4');
                
                // Add title
                doc.setFontSize(18);
                doc.setFont(undefined, 'bold');
                doc.text('Outstanding Balances Report', 20, 20);
                
                // Add generation date and summary
                doc.setFontSize(10);
                doc.setFont(undefined, 'normal');
                doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 30);
                doc.text(`Total Students with Outstanding Balance: ${outstandingStudents.length}`, 20, 35);
                doc.text(`Total Outstanding Amount: KES ${totalOutstanding.toLocaleString()}`, 20, 40);
                
                // Prepare table data
                const tableData = outstandingStudents.map(student => [
                    student.admissionNumber || 'N/A',
                    student.name || 'N/A',
                    formatCourseName(student.course),
                    `KES ${(student.totalPaid || 0).toLocaleString()}`,
                    `KES ${student.balance.toLocaleString()}`,
                    student.intake ? `${student.intake} ${student.intakeYear}` : 'N/A'
                ]);
                
                // Add table
                doc.autoTable({
                    head: [['Admission No', 'Student Name', 'Program', 'Paid', 'Outstanding', 'Intake']],
                    body: tableData,
                    startY: 50,
                    styles: { fontSize: 8 },
                    headStyles: { fillColor: [37, 99, 235] },
                    alternateRowStyles: { fillColor: [245, 245, 245] }
                });
                
                // Save the PDF
                const filename = `outstanding_balances_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.pdf`;
                doc.save(filename);
                
                showToast('Outstanding balances report exported as PDF successfully!', 'success');
            } catch (error) {
                console.error('Export error:', error);
                showToast('Failed to export outstanding report', 'error');
            }
        }
        
        async function exportDepartmentReport() {
            if (!financeAnalytics) {
                await initializeAnalytics();
            }
            
            try {
                const departmentStats = financeAnalytics.getDepartmentRevenue();
                
                // Create PDF report
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF('p', 'mm', 'a4');
                
                // Add title
                doc.setFontSize(18);
                doc.setFont(undefined, 'bold');
                doc.text('Department Revenue Analysis', 20, 20);
                
                // Add generation date
                doc.setFontSize(10);
                doc.setFont(undefined, 'normal');
                doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 30);
                
                // Calculate totals
                const totalStudents = Object.values(departmentStats).reduce((sum, stats) => sum + stats.studentCount, 0);
                const totalExpected = Object.values(departmentStats).reduce((sum, stats) => sum + stats.expectedRevenue, 0);
                const totalActual = Object.values(departmentStats).reduce((sum, stats) => sum + stats.actualRevenue, 0);
                const totalOutstanding = Object.values(departmentStats).reduce((sum, stats) => sum + stats.outstandingBalance, 0);
                
                // Add summary
                doc.text(`Total Students: ${totalStudents}`, 20, 40);
                doc.text(`Total Expected Revenue: KES ${totalExpected.toLocaleString()}`, 20, 45);
                doc.text(`Total Actual Revenue: KES ${totalActual.toLocaleString()}`, 20, 50);
                doc.text(`Total Outstanding: KES ${totalOutstanding.toLocaleString()}`, 20, 55);
                doc.text(`Overall Collection Rate: ${totalExpected > 0 ? ((totalActual / totalExpected) * 100).toFixed(2) : 0}%`, 20, 60);
                
                // Prepare table data
                const tableData = Object.entries(departmentStats).map(([dept, stats]) => [
                    dept.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                    stats.studentCount.toString(),
                    `KES ${stats.expectedRevenue.toLocaleString()}`,
                    `KES ${stats.actualRevenue.toLocaleString()}`,
                    `KES ${stats.outstandingBalance.toLocaleString()}`,
                    stats.expectedRevenue > 0 ? `${((stats.actualRevenue / stats.expectedRevenue) * 100).toFixed(2)}%` : '0%'
                ]);
                
                // Add table
                doc.autoTable({
                    head: [['Department', 'Students', 'Expected', 'Collected', 'Outstanding', 'Rate %']],
                    body: tableData,
                    startY: 70,
                    styles: { fontSize: 8 },
                    headStyles: { fillColor: [37, 99, 235] },
                    alternateRowStyles: { fillColor: [245, 245, 245] }
                });
                
                // Save the PDF
                const filename = `department_analysis_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.pdf`;
                doc.save(filename);
                
                showToast('Department analysis report exported as PDF successfully!', 'success');
            } catch (error) {
                console.error('Export error:', error);
                showToast('Failed to export department report', 'error');
            }
        }

        // Format selection modal
        function showFormatSelectionModal(reportType) {
            return new Promise((resolve) => {
                const modal = document.createElement('div');
                modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
                modal.innerHTML = `
                    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-sm">
                        <div class="p-6 border-b border-gray-200 dark:border-gray-700">
                            <h3 class="text-lg font-semibold text-gray-800 dark:text-white">Export ${escapeHtml(reportType)}</h3>
                        </div>
                        <div class="p-6">
                            <p class="text-gray-600 dark:text-gray-300 mb-4">Choose export format:</p>
                            <div class="space-y-3">
                                <button onclick="selectFormat('json')" class="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">JSON</button>
                                <button onclick="selectFormat('csv')" class="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">CSV</button>
                                <button onclick="selectFormat('pdf')" class="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">PDF</button>
                                <button onclick="selectFormat(null)" class="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancel</button>
                            </div>
                        </div>
                    </div>
                `;
                
                document.body.appendChild(modal);
                
                window.selectFormat = function(format) {
                    document.body.removeChild(modal);
                    delete window.selectFormat;
                    resolve(format);
                };
            });
        }

window.FinanceTabs.reports = {
    init() {}
};
