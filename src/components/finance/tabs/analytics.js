// tabs/analytics.js — finance analytics dashboard + charts.
window.FinanceTabs = window.FinanceTabs || {};

// ---- financeAnalytics.js (verbatim) ----
// Finance Analytics Module
// Production-level analytics and reporting for Finance Dashboard

const API_BASE_URL_CONFIG = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : `${window.location.protocol}//${window.location.host}/api`;

// Authenticated fetch wrapper — guarded against double-declaration.
// See note in financeDashboard.js. window assignment is idempotent across
// both files regardless of script load order.
window.authFetch = window.authFetch || (async (url, options = {}) => {
    return window.AUTH.fetch(url, options);
});

class FinanceAnalytics {
    constructor() {
        this.students = [];
        this.payments = [];
        this.programs = [];
        this.API_BASE_URL = API_BASE_URL_CONFIG;
    }

    // Load all necessary data
    async loadData() {
        try {
            const [studentsResponse, paymentsResponse, programsResponse] = await Promise.all([
                authFetch(`${this.API_BASE_URL}/students`),
                authFetch(`${this.API_BASE_URL}/payments`),
                authFetch(`${this.API_BASE_URL}/programs`)
            ]);

            if (!studentsResponse.ok || !paymentsResponse.ok || !programsResponse.ok) {
                throw new Error('Failed to load data');
            }

            this.students = await studentsResponse.json();
            this.payments = await paymentsResponse.json();
            this.programs = await programsResponse.json();

            return {
                students: this.students.length,
                payments: this.payments.length,
                programs: this.programs.length
            };
        } catch (error) {
            console.error('Error loading finance data:', error);
            throw error;
        }
    }

    // Calculate total revenue
    getTotalRevenue() {
        return this.payments.reduce((total, payment) => total + Number(payment.amount || 0), 0);
    }

    // Calculate expected revenue (all students * their program costs)
    getExpectedRevenue() {
        let expectedTotal = 0;
        this.students.forEach(student => {
            const program = this.findProgramByName(student.course);
            if (program) {
                expectedTotal += program.programCost || 0;
            }
        });
        return expectedTotal;
    }

    // Calculate outstanding balance
    getOutstandingBalance() {
        return this.getExpectedRevenue() - this.getTotalRevenue();
    }

    // Get payment statistics by method
    getPaymentMethodStats() {
        const stats = {
            mpesa: { count: 0, amount: 0 },
            bank: { count: 0, amount: 0 },
            bursary: { count: 0, amount: 0 }
        };

        this.payments.forEach(payment => {
            const method = payment.paymentMode || 'unknown';
            if (stats[method]) {
                stats[method].count++;
                stats[method].amount += Number(payment.amount || 0);
            } else {
                // Log unknown payment modes for debugging
                console.warn('Unknown payment mode:', method, payment);
            }
        });

        return stats;
    }

    // Format payment mode for display
    formatPaymentMode(paymentMode) {
        if (!paymentMode) return 'N/A';
        
        const modes = {
            'mpesa': 'M-Pesa',
            'bank': 'Bank Transfer',
            'bursary': 'CDF Bursary'
        };
        
        return modes[paymentMode] || paymentMode;
    }

    // Get formatted payment details for receipt generation
    getFormattedPaymentDetails(payment) {
        if (!payment) return null;
        
        return {
            ...payment,
            formattedPaymentMode: this.formatPaymentMode(payment.paymentMode),
            formattedAmount: this.formatCurrency(payment.amount),
            formattedDate: payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : 'N/A'
        };
    }

    // Get monthly payment trends
    getMonthlyPaymentTrends() {
        const monthlyData = {};
        
        this.payments.forEach(payment => {
            const date = new Date(payment.paymentDate || payment.createdAt);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { count: 0, amount: 0 };
            }
            
            monthlyData[monthKey].count++;
            monthlyData[monthKey].amount += Number(payment.amount || 0);
        });

        return Object.entries(monthlyData)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, data]) => ({
                month,
                count: data.count,
                amount: data.amount
            }));
    }

    // Get students with outstanding balances
    getStudentsWithBalances(minBalance = 0) {
        const studentsWithBalances = [];

        this.students.forEach(student => {
            const program = this.findProgramByName(student.course);
            const programCost = program ? program.programCost : 0;
            
            const studentPayments = this.payments.filter(p => p.studentId === student.admissionNumber);
            const totalPaid = studentPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
            
            const balance = programCost - totalPaid;
            
            if (balance > minBalance) {
                studentsWithBalances.push({
                    ...student,
                    programCost,
                    totalPaid,
                    balance,
                    paymentCount: studentPayments.length
                });
            }
        });

        return studentsWithBalances.sort((a, b) => b.balance - a.balance);
    }

    // Get students who have fully paid
    getFullyPaidStudents() {
        const fullyPaidStudents = [];

        this.students.forEach(student => {
            const program = this.findProgramByName(student.course);
            const programCost = program ? program.programCost : 0;
            
            const studentPayments = this.payments.filter(p => p.studentId === student.admissionNumber);
            const totalPaid = studentPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
            
            if (totalPaid >= programCost && programCost > 0) {
                fullyPaidStudents.push({
                    ...student,
                    programCost,
                    totalPaid,
                    overpayment: totalPaid - programCost
                });
            }
        });

        return fullyPaidStudents;
    }

    // Get department-wise revenue analysis
    getDepartmentRevenue() {
        const departmentStats = {};

        this.students.forEach(student => {
            const dept = student.department || 'unknown';
            if (!departmentStats[dept]) {
                departmentStats[dept] = {
                    studentCount: 0,
                    expectedRevenue: 0,
                    actualRevenue: 0,
                    outstandingBalance: 0
                };
            }

            departmentStats[dept].studentCount++;

            const program = this.findProgramByName(student.course);
            const programCost = program ? program.programCost : 0;
            departmentStats[dept].expectedRevenue += programCost;

            const studentPayments = this.payments.filter(p => p.studentId === student.admissionNumber);
            const totalPaid = studentPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
            departmentStats[dept].actualRevenue += totalPaid;
            departmentStats[dept].outstandingBalance += Math.max(0, programCost - totalPaid);
        });

        return departmentStats;
    }

    // Get intake-wise statistics
    getIntakeStats() {
        const intakeStats = {};

        this.students.forEach(student => {
            const intakeKey = student.intake && student.intakeYear ? 
                `${student.intake.charAt(0).toUpperCase() + student.intake.slice(1)} ${student.intakeYear}` : 
                'Unknown';

            if (!intakeStats[intakeKey]) {
                intakeStats[intakeKey] = {
                    studentCount: 0,
                    expectedRevenue: 0,
                    actualRevenue: 0
                };
            }

            intakeStats[intakeKey].studentCount++;

            const program = this.findProgramByName(student.course);
            const programCost = program ? program.programCost : 0;
            intakeStats[intakeKey].expectedRevenue += programCost;

            const studentPayments = this.payments.filter(p => p.studentId === student.admissionNumber);
            const totalPaid = studentPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
            intakeStats[intakeKey].actualRevenue += totalPaid;
        });

        return intakeStats;
    }

    // Resolve a student's course CODE (e.g. 'GA5') to its program object via the
    // shared DB-backed Catalog helper. Returns the program object (with
    // .programCost) or null/undefined, matching what callers below expect.
    findProgramByName(courseCode) {
        if (window.Catalog) {
            return window.Catalog.programByCode(courseCode) || undefined;
        }
        // Fallback when Catalog failed to load: match this.programs by code.
        const code = String(courseCode || '').toUpperCase();
        return this.programs.find(program => String(program.code || '').toUpperCase() === code);
    }

    // Export analytics data
    exportAnalyticsReport(format = 'json') {
        const report = {
            generatedAt: new Date().toISOString(),
            summary: {
                totalStudents: this.students.length,
                totalPayments: this.payments.length,
                totalRevenue: this.getTotalRevenue(),
                expectedRevenue: this.getExpectedRevenue(),
                outstandingBalance: this.getOutstandingBalance(),
                collectionRate: this.getExpectedRevenue() > 0 ? 
                    ((this.getTotalRevenue() / this.getExpectedRevenue()) * 100).toFixed(2) + '%' : '0%'
            },
            paymentMethods: this.getPaymentMethodStats(),
            monthlyTrends: this.getMonthlyPaymentTrends(),
            departmentAnalysis: this.getDepartmentRevenue(),
            intakeAnalysis: this.getIntakeStats(),
            studentsWithBalances: this.getStudentsWithBalances(1000), // Students with balance > 1000
            fullyPaidStudents: this.getFullyPaidStudents()
        };

        const filename = `finance_analytics_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${format}`;

        if (format === 'json') {
            this.downloadFile(JSON.stringify(report, null, 2), filename, 'application/json');
        } else if (format === 'csv') {
            // Convert to CSV format (summary data)
            const csvData = this.convertAnalyticsToCSV(report);
            this.downloadFile(csvData, filename.replace('.json', '.csv'), 'text/csv');
        } else if (format === 'pdf') {
            this.exportAnalyticsToPDF(report, filename.replace('.json', '.pdf'));
        }
    }

    // Export analytics to PDF
    exportAnalyticsToPDF(report, filename) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4'); // Portrait orientation
        
        // Add title
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text('Financial Analytics Report', 20, 20);
        
        // Add generation date
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Generated on: ${new Date(report.generatedAt).toLocaleDateString()}`, 20, 30);
        
        let yPosition = 45;
        
        // Summary Section
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('Financial Summary', 20, yPosition);
        yPosition += 10;
        
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        const summaryData = [
            ['Total Students', report.summary.totalStudents.toString()],
            ['Total Payments', report.summary.totalPayments.toString()],
            ['Total Revenue', this.formatCurrency(report.summary.totalRevenue)],
            ['Expected Revenue', this.formatCurrency(report.summary.expectedRevenue)],
            ['Outstanding Balance', this.formatCurrency(report.summary.outstandingBalance)],
            ['Collection Rate', report.summary.collectionRate]
        ];
        
        doc.autoTable({
            body: summaryData,
            startY: yPosition,
            theme: 'striped',
            headStyles: { fillColor: [59, 130, 246] },
            margin: { left: 20, right: 20 },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 60 },
                1: { cellWidth: 80 }
            }
        });
        
        yPosition = doc.lastAutoTable.finalY + 15;
        
        // Department Analysis
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('Department Revenue Analysis', 20, yPosition);
        yPosition += 10;
        
        const deptHeaders = ['Department', 'Students', 'Expected Revenue', 'Actual Revenue', 'Outstanding'];
        const deptData = Object.entries(report.departmentAnalysis).map(([dept, stats]) => [
            dept.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            stats.studentCount.toString(),
            this.formatCurrency(stats.expectedRevenue),
            this.formatCurrency(stats.actualRevenue),
            this.formatCurrency(stats.outstandingBalance)
        ]);
        
        doc.autoTable({
            head: [deptHeaders],
            body: deptData,
            startY: yPosition,
            theme: 'striped',
            headStyles: { fillColor: [59, 130, 246] },
            margin: { left: 20, right: 20 },
            styles: { fontSize: 8 }
        });
        
        // Add footer
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.width - 30, doc.internal.pageSize.height - 10);
            doc.text('University Management System - Finance Dashboard', 20, doc.internal.pageSize.height - 10);
        }
        
        doc.save(filename);
    }

    // Convert analytics to CSV format
    convertAnalyticsToCSV(report) {
        let csvContent = 'Finance Analytics Report\n\n';
        
        // Summary section
        csvContent += 'SUMMARY\n';
        csvContent += 'Metric,Value\n';
        Object.entries(report.summary).forEach(([key, value]) => {
            csvContent += `${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())},${value}\n`;
        });
        
        csvContent += '\n\nDEPARTMENT ANALYSIS\n';
        csvContent += 'Department,Students,Expected Revenue,Actual Revenue,Outstanding Balance\n';
        Object.entries(report.departmentAnalysis).forEach(([dept, data]) => {
            csvContent += `${dept},${data.studentCount},${data.expectedRevenue},${data.actualRevenue},${data.outstandingBalance}\n`;
        });

        return csvContent;
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

    // Format currency
    formatCurrency(amount) {
        return `KES ${Number(amount).toLocaleString()}`;
    }
}

// Export the class for use in other modules
window.FinanceAnalytics = FinanceAnalytics;

// ---- analytics glue (verbatim inline block) ----
        // Navigation and Analytics functionality
        let financeAnalytics = null;
        
        // Initialize analytics
        async function initializeAnalytics() {
            try {
                financeAnalytics = new FinanceAnalytics();
                await financeAnalytics.loadData();
                updateAnalyticsDashboard();
            } catch (error) {
                console.error('Failed to initialize analytics:', error);
            }
        }

        // Update analytics dashboard
        function updateAnalyticsDashboard() {
            if (!financeAnalytics) return;
            
            // Update summary cards
            document.getElementById('total-revenue').textContent = 
                financeAnalytics.formatCurrency(financeAnalytics.getTotalRevenue());
            document.getElementById('outstanding-balance').textContent = 
                financeAnalytics.formatCurrency(financeAnalytics.getOutstandingBalance());
            document.getElementById('active-students').textContent = 
                financeAnalytics.students.length.toLocaleString();
                
            const expectedRevenue = financeAnalytics.getExpectedRevenue();
            const actualRevenue = financeAnalytics.getTotalRevenue();
            const collectionRate = expectedRevenue > 0 ? ((actualRevenue / expectedRevenue) * 100).toFixed(1) : 0;
            document.getElementById('collection-rate').textContent = `${collectionRate}%`;
            
            // Update department analysis
            const departmentStats = financeAnalytics.getDepartmentRevenue();
            const departmentContainer = document.getElementById('department-analysis');
            
            let departmentHTML = '';
            Object.entries(departmentStats).forEach(([dept, stats]) => {
                const deptName = dept.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                departmentHTML += `
                    <div class="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
                        <div>
                            <h4 class="font-medium text-slate-800 dark:text-white">${escapeHtml(deptName)}</h4>
                            <p class="text-sm text-slate-500 dark:text-slate-400">${stats.studentCount} students</p>
                        </div>
                        <div class="text-right">
                            <p class="font-semibold text-slate-800 dark:text-white">${financeAnalytics.formatCurrency(stats.actualRevenue)}</p>
                            <p class="text-sm text-slate-500 dark:text-slate-400">of ${financeAnalytics.formatCurrency(stats.expectedRevenue)}</p>
                        </div>
                    </div>
                `;
            });
            
            departmentContainer.innerHTML = departmentHTML;
        }

window.FinanceTabs.analytics = {
    // Render once: updateAnalyticsDashboard() builds Chart.js charts; re-running on
    // revisit would hit "Canvas is already in use". The cached pane keeps them.
    init() {
        if (window.__financeAnalyticsRendered) return;
        window.__financeAnalyticsRendered = true;
        initializeAnalytics();
    }
};
