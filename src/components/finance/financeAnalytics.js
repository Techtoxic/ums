// Finance Analytics Module
// Production-level analytics and reporting for Finance Dashboard

class FinanceAnalytics {
    constructor() {
        this.students = [];
        this.payments = [];
        this.programs = [];
        this.API_BASE_URL = 'http://localhost:5502/api';
    }

    // Load all necessary data
    async loadData() {
        try {
            const [studentsResponse, paymentsResponse, programsResponse] = await Promise.all([
                fetch(`${this.API_BASE_URL}/students`),
                fetch(`${this.API_BASE_URL}/payments`),
                fetch(`${this.API_BASE_URL}/programs`)
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
        return this.payments.reduce((total, payment) => total + (payment.amount || 0), 0);
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
                stats[method].amount += payment.amount || 0;
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
            monthlyData[monthKey].amount += payment.amount || 0;
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
            const totalPaid = studentPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
            
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
            const totalPaid = studentPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
            
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
            const totalPaid = studentPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
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
            const totalPaid = studentPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
            intakeStats[intakeKey].actualRevenue += totalPaid;
        });

        return intakeStats;
    }

    // Helper method to find program by course name
    findProgramByName(courseName) {
        // Course to Program mapping (complete mapping from finance dashboard)
        const courseToProgram = {
            'applied_biology_6': 'Applied Biology Level 6',
            'analytical_chemistry_6': 'Analytical Chemistry Level 6',
            'science_lab_technology_5': 'Science Lab Technology Level 5',
            'general_agriculture_4': 'General Agriculture Level 4',
            'sustainable_agriculture_5': 'Sustainable Agriculture Level 5',
            'agricultural_extension_6': 'Agricultural Extension Level 6',
            'building_technician_4': 'Building Technician Level 4',
            'building_technician_6': 'Building Technician Level 6',
            'civil_engineering_6': 'Civil Engineering Level 6',
            'plumbing_4': 'Plumbing Level 4',
            'plumbing_5': 'Plumbing Level 5',
            'electrical_engineering_4': 'Electrical Engineering Level 4',
            'electrical_engineering_5': 'Electrical Engineering Level 5',
            'electrical_engineering_6': 'Electrical Engineering Level 6',
            'automotive_engineering_5': 'Automotive Engineering Level 5',
            'automotive_engineering_6': 'Automotive Engineering Level 6',
            'food_beverage_4': 'Food and Beverage Level 4',
            'food_beverage_5': 'Food & Beverage Level 5',
            'food_beverage_6': 'Food & Beverage Level 6',
            'food_and_beverage_4': 'Food and Beverage Level 4',
            'food_and_beverage_5': 'Food & Beverage Level 5',
            'food_and_beverage_6': 'Food & Beverage Level 6',
            'fashion_design_4': 'Fashion & Design Level 4',
            'fashion_design_5': 'Fashion and Design Level 5',
            'fashion_design_6': 'Fashion and Design Level 6',
            'fashion_and_design_4': 'Fashion & Design Level 4',
            'fashion_and_design_5': 'Fashion and Design Level 5',
            'fashion_and_design_6': 'Fashion and Design Level 6',
            'hairdressing_4': 'Hairdressing Level 4',
            'hairdressing_5': 'Hairdressing Level 5',
            'hairdressing_6': 'Hairdressing Level 6',
            'tourism_management_5': 'Tourism Management Level 5',
            'tourism_management_6': 'Tourism Management Level 6',
            'social_work_5': 'Social Work Level 5',
            'social_work_6': 'Social Work Level 6',
            'office_administration_5': 'Office Administration Level 5',
            'office_administration_6': 'Office Administration Level 6',
            'ict_5': 'ICT Level 5',
            'ict_6': 'ICT Level 6',
            'information_science_5': 'Information Science Level 5',
            'information_science_6': 'Information Science Level 6',
            // Additional variations for comprehensive mapping
            'science_lab_tech_5': 'Science Lab Technology Level 5',
            'science_laboratory_technology_5': 'Science Lab Technology Level 5',
            'applied_bio_6': 'Applied Biology Level 6',
            'analytical_chem_6': 'Analytical Chemistry Level 6',
            'general_agric_4': 'General Agriculture Level 4',
            'sustainable_agric_5': 'Sustainable Agriculture Level 5',
            'agricultural_ext_6': 'Agricultural Extension Level 6',
            'building_tech_4': 'Building Technician Level 4',
            'building_tech_6': 'Building Technician Level 6',
            'civil_eng_6': 'Civil Engineering Level 6',
            'electrical_eng_4': 'Electrical Engineering Level 4',
            'electrical_eng_5': 'Electrical Engineering Level 5',
            'electrical_eng_6': 'Electrical Engineering Level 6',
            'automotive_eng_5': 'Automotive Engineering Level 5',
            'automotive_eng_6': 'Automotive Engineering Level 6',
            'tourism_mgmt_5': 'Tourism Management Level 5',
            'tourism_mgmt_6': 'Tourism Management Level 6',
            'office_admin_5': 'Office Administration Level 5',
            'office_admin_6': 'Office Administration Level 6',
            'info_science_5': 'Information Science Level 5',
            'info_science_6': 'Information Science Level 6',
            // Additional course code variations to ensure all formats work
            'agricultural_extension_6': 'Agricultural Extension Level 6',
            'agric_extension_6': 'Agricultural Extension Level 6',
            'building_technician_4': 'Building Technician Level 4',
            'building_technician_6': 'Building Technician Level 6'
        };

        const programName = courseToProgram[courseName] || courseName;
        return this.programs.find(program => 
            program.programName && program.programName.toLowerCase() === programName.toLowerCase()
        );
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
