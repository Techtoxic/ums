// tabs/reports.js — finance reports. All data comes from the server
// (GET /api/finance/analytics and /api/finance/reports/students) and every
// document is exported through the branded EDTTI doc engine as PDF or Excel
// ONLY (no CSV / JSON, per spec).
window.FinanceTabs = window.FinanceTabs || {};

(function () {
    const API = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : `${window.location.protocol}//${window.location.host}/api`;

    function toast(msg, type) { if (typeof showToast === 'function') showToast(msg, type); }
    function docs() { return window.EDTTIDocs || window.FinanceDocs; }
    const fmt = (n) => `KES ${Math.round(Number(n) || 0).toLocaleString()}`;
    const today = () => new Date().toISOString().slice(0, 10);

    async function getAnalytics() {
        const res = await window.AUTH.fetch(`${API}/finance/analytics`);
        if (!res.ok) throw new Error('analytics');
        return res.json();
    }

    async function getStudents() {
        const res = await window.AUTH.fetch(`${API}/finance/reports/students`);
        if (!res.ok) throw new Error('students');
        return res.json();
    }

    function intakeLabel(s) {
        if (!s.intake) return 'N/A';
        const i = s.intake.charAt(0).toUpperCase() + s.intake.slice(1);
        return s.intakeYear ? `${i} ${s.intakeYear}` : i;
    }

    // ---- Revenue report: full analytics PDF / Excel ----
    window.exportRevenueReport = async function (format) {
        try {
            const data = await getAnalytics();
            const d = docs();
            if (format === 'excel') {
                const t = data.totals || {};
                const rows = [
                    ['EDTTI — Revenue Report'],
                    ['Generated', new Date().toLocaleString()],
                    [],
                    ['Metric', 'Value'],
                    ['Total Revenue', t.totalRevenue],
                    ['Tuition Revenue', t.tuitionRevenue],
                    ['Other (Non-Tuition) Revenue', t.otherRevenue],
                    ['Expected Tuition', t.expectedRevenue],
                    ['Outstanding Balance', t.outstandingBalance],
                    ['Collection Rate (%)', t.collectionRate],
                    [],
                    ['Revenue Stream', 'Amount'],
                    ...(data.revenueStreams || []).map(s => [s.label, s.amount]),
                    [],
                    ['Month', 'Collected'],
                    ...(data.monthlyTrend || []).map(m => [m.label || m.month, m.amount]),
                ];
                d.downloadExcel(rows, `revenue_report_${today()}`);
            } else {
                await d.analyticsPDF(data);
            }
            toast('Revenue report generated', 'success');
        } catch (e) {
            console.error('Revenue report error:', e);
            toast('Failed to generate revenue report', 'error');
        }
    };

    // ---- Outstanding balances report ----
    window.exportOutstandingReport = async function (format) {
        try {
            const { students } = await getStudents();
            const outstanding = (students || []).filter(s => s.balance > 0);
            const totalOut = outstanding.reduce((sum, s) => sum + s.balance, 0);
            const d = docs();
            if (format === 'excel') {
                const rows = [
                    ['EDTTI — Outstanding Balances Report'],
                    ['Generated', new Date().toLocaleString()],
                    ['Students with balance', outstanding.length],
                    ['Total outstanding', totalOut],
                    [],
                    ['Admission No', 'Student', 'Program', 'Module', 'Intake', 'Expected', 'Paid', 'Balance'],
                    ...outstanding.map(s => [s.admissionNumber, s.name, s.course, s.module, intakeLabel(s), s.expected, s.paid, s.balance]),
                ];
                d.downloadExcel(rows, `outstanding_balances_${today()}`);
            } else {
                await d.tablePDF({
                    title: 'Outstanding Balances Report',
                    subtitle: 'Students with pending tuition payments',
                    summary: [
                        ['Students With Balance', String(outstanding.length)],
                        ['Total Outstanding', fmt(totalOut)],
                    ],
                    columns: ['Admission No', 'Student', 'Program', 'Mod', 'Intake', 'Expected', 'Paid', 'Balance'],
                    rows: outstanding.map(s => [s.admissionNumber, s.name, s.course, String(s.module), intakeLabel(s), fmt(s.expected), fmt(s.paid), fmt(s.balance)]),
                    filename: `outstanding_balances_${today()}.pdf`,
                    footer: 'EDTTI UMS — Outstanding Balances · Confidential',
                    landscape: true,
                });
            }
            toast('Outstanding balances report generated', 'success');
        } catch (e) {
            console.error('Outstanding report error:', e);
            toast('Failed to generate outstanding report', 'error');
        }
    };

    // ---- Department summary report ----
    window.exportDepartmentReport = async function (format) {
        try {
            const data = await getAnalytics();
            const depts = data.departmentBreakdown || [];
            const d = docs();
            if (format === 'excel') {
                const rows = [
                    ['EDTTI — Department Revenue Summary'],
                    ['Generated', new Date().toLocaleString()],
                    [],
                    ['Department', 'Students', 'Expected', 'Collected', 'Outstanding', 'Rate %'],
                    ...depts.map(x => [x.departmentName, x.students, x.expected, x.actual, x.outstanding, x.expected > 0 ? Number(((x.actual / x.expected) * 100).toFixed(1)) : 0]),
                ];
                d.downloadExcel(rows, `department_summary_${today()}`);
            } else {
                await d.tablePDF({
                    title: 'Department Revenue Summary',
                    subtitle: 'Expected vs collected tuition by department',
                    columns: ['Department', 'Students', 'Expected', 'Collected', 'Outstanding', 'Rate %'],
                    rows: depts.map(x => [x.departmentName, String(x.students), fmt(x.expected), fmt(x.actual), fmt(x.outstanding), `${x.expected > 0 ? ((x.actual / x.expected) * 100).toFixed(1) : 0}%`]),
                    filename: `department_summary_${today()}.pdf`,
                    footer: 'EDTTI UMS — Department Summary · Confidential',
                    landscape: true,
                });
            }
            toast('Department summary generated', 'success');
        } catch (e) {
            console.error('Department report error:', e);
            toast('Failed to generate department report', 'error');
        }
    };

    // ---- Full student financial report (all students) ----
    window.exportStudentFinancialReport = async function (format) {
        try {
            const { students } = await getStudents();
            const list = students || [];
            const d = docs();
            if (format === 'excel') {
                const rows = [
                    ['EDTTI — Student Financial Report'],
                    ['Generated', new Date().toLocaleString()],
                    ['Total students', list.length],
                    [],
                    ['Admission No', 'Student', 'Program', 'Department', 'Module', 'Intake', 'Expected', 'Paid', 'Balance', 'Status'],
                    ...list.map(s => [s.admissionNumber, s.name, s.course, s.department, s.module, intakeLabel(s), s.expected, s.paid, s.balance, s.status]),
                ];
                d.downloadExcel(rows, `student_financials_${today()}`);
            } else {
                await d.tablePDF({
                    title: 'Student Financial Report',
                    subtitle: 'Per-student tuition expected, paid and balance',
                    summary: [['Total Students', String(list.length)]],
                    columns: ['Admission No', 'Student', 'Program', 'Mod', 'Expected', 'Paid', 'Balance', 'Status'],
                    rows: list.map(s => [s.admissionNumber, s.name, s.course, String(s.module), fmt(s.expected), fmt(s.paid), fmt(s.balance), s.status]),
                    filename: `student_financials_${today()}.pdf`,
                    footer: 'EDTTI UMS — Student Financials · Confidential',
                    landscape: true,
                });
            }
            toast('Student financial report generated', 'success');
        } catch (e) {
            console.error('Student report error:', e);
            toast('Failed to generate student report', 'error');
        }
    };

    window.FinanceTabs.reports = { init() {} };
})();
