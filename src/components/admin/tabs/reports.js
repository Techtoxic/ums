// tabs/reports.js — admin reports. Real branded PDF/Excel exports (no CSV/JSON)
// built from the same accurate, server-backed data the dashboard uses.
window.AdminTabs = window.AdminTabs || {};

function adminDocs() { return window.EDTTIDocs || window.FinanceDocs; }
const adminToday = () => new Date().toISOString().slice(0, 10);

function reportCard(id, icon, color, title, desc) {
    return `
        <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
            <div class="flex items-center gap-3 mb-2">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background:${color}1A;color:${color}"><i class="${icon} text-xl"></i></div>
                <div>
                    <h4 class="font-bold text-sm text-gray-800 dark:text-white">${title}</h4>
                    <p class="text-xs text-gray-500 dark:text-gray-400">${desc}</p>
                </div>
            </div>
            <div class="flex gap-2 mt-3">
                <button onclick="generateReport('${id}','pdf')" class="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs text-white rounded" style="background:#7A0C0C"><i class="ri-file-pdf-2-line"></i> PDF</button>
                <button onclick="generateReport('${id}','excel')" class="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs text-white rounded" style="background:#15803d"><i class="ri-file-excel-2-line"></i> Excel</button>
            </div>
        </div>`;
}

function displayReports() {
    const container = document.getElementById('reports-container');
    if (!container) return;
    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            ${reportCard('enrollment', 'ri-user-follow-line', '#2563EB', 'Enrollment Report', 'Students by department & module')}
            ${reportCard('financial', 'ri-money-dollar-circle-line', '#15803d', 'Financial Report', 'Revenue, collection & outstanding')}
            ${reportCard('department', 'ri-building-line', '#7A0C0C', 'Department Report', 'Expected vs collected by department')}
            ${reportCard('students', 'ri-graduation-cap-line', '#D4A017', 'Student Financials', 'Per-student expected, paid, balance')}
        </div>`;
}

async function generateReport(type, format) {
    const docs = adminDocs();
    if (!docs) { showToast('Export engine not loaded', 'error'); return; }
    try {
        if (Object.keys(studentFinanceByAdm || {}).length === 0) await loadStudentFinancials();
        if (!financeAnalytics) await loadFinanceAnalytics();
        const fmt = (n) => `KES ${Math.round(Number(n) || 0).toLocaleString()}`;

        if (type === 'enrollment') {
            // Students grouped by department + module counts.
            const byDept = {};
            (allStudents || []).forEach(s => {
                const d = formatDepartmentName(s.department) || 'Unknown';
                byDept[d] = byDept[d] || { dept: d, total: 0, modules: {} };
                byDept[d].total++;
                const m = `M${s.module || 1}`;
                byDept[d].modules[m] = (byDept[d].modules[m] || 0) + 1;
            });
            const rows = Object.values(byDept).sort((a, b) => b.total - a.total);
            if (format === 'excel') {
                docs.downloadExcel([
                    ['EDTTI — Enrollment Report'], ['Generated', new Date().toLocaleString()], ['Total Students', (allStudents || []).length], [],
                    ['Department', 'Students', 'Module Breakdown'],
                    ...rows.map(r => [r.dept, r.total, Object.entries(r.modules).map(([k, v]) => `${k}:${v}`).join(', ')]),
                ], `enrollment_${adminToday()}`);
            } else {
                await docs.tablePDF({
                    title: 'Enrollment Report', subtitle: 'Students by department & module',
                    summary: [['Total Students', String((allStudents || []).length)]],
                    columns: ['Department', 'Students', 'Module Breakdown'],
                    rows: rows.map(r => [r.dept, String(r.total), Object.entries(r.modules).map(([k, v]) => `${k}:${v}`).join(', ')]),
                    filename: `enrollment_${adminToday()}.pdf`, footer: 'EDTTI UMS — Enrollment · Confidential',
                });
            }
        } else if (type === 'financial') {
            if (format === 'excel') {
                const t = (financeAnalytics && financeAnalytics.totals) || {};
                docs.downloadExcel([
                    ['EDTTI — Financial Report'], ['Generated', new Date().toLocaleString()], [],
                    ['Metric', 'Value'],
                    ['Total Revenue', t.totalRevenue], ['Tuition Revenue', t.tuitionRevenue], ['Other Revenue', t.otherRevenue],
                    ['Expected Tuition', t.expectedRevenue], ['Outstanding', t.outstandingBalance], ['Collection Rate (%)', t.collectionRate],
                ], `financial_${adminToday()}`);
            } else {
                await docs.analyticsPDF(financeAnalytics || { totals: {}, departmentBreakdown: [] });
            }
        } else if (type === 'department') {
            const depts = (financeAnalytics && financeAnalytics.departmentBreakdown) || [];
            if (format === 'excel') {
                docs.downloadExcel([
                    ['EDTTI — Department Report'], ['Generated', new Date().toLocaleString()], [],
                    ['Department', 'Students', 'Expected', 'Collected', 'Outstanding'],
                    ...depts.map(d => [d.departmentName, d.students, d.expected, d.actual, d.outstanding]),
                ], `department_${adminToday()}`);
            } else {
                await docs.tablePDF({
                    title: 'Department Report', subtitle: 'Expected vs collected by department',
                    columns: ['Department', 'Students', 'Expected', 'Collected', 'Outstanding'],
                    rows: depts.map(d => [d.departmentName, String(d.students), fmt(d.expected), fmt(d.actual), fmt(d.outstanding)]),
                    filename: `department_${adminToday()}.pdf`, footer: 'EDTTI UMS — Department · Confidential', landscape: true,
                });
            }
        } else if (type === 'students') {
            const list = Object.values(studentFinanceByAdm || {});
            if (format === 'excel') {
                docs.downloadExcel([
                    ['EDTTI — Student Financials'], ['Generated', new Date().toLocaleString()], ['Total', list.length], [],
                    ['Admission', 'Name', 'Program', 'Module', 'Expected', 'Paid', 'Balance', 'Status'],
                    ...list.map(s => [s.admissionNumber, s.name, s.course, s.module, s.expected, s.paid, s.balance, s.status]),
                ], `student_financials_${adminToday()}`);
            } else {
                await docs.tablePDF({
                    title: 'Student Financial Report', subtitle: 'Per-student expected, paid & balance',
                    summary: [['Total Students', String(list.length)]],
                    columns: ['Admission', 'Name', 'Program', 'Mod', 'Expected', 'Paid', 'Balance', 'Status'],
                    rows: list.map(s => [s.admissionNumber, s.name, s.course, String(s.module), fmt(s.expected), fmt(s.paid), fmt(s.balance), s.status]),
                    filename: `student_financials_${adminToday()}.pdf`, footer: 'EDTTI UMS — Student Financials · Confidential', landscape: true,
                });
            }
        }
        showToast('Report generated', 'success');
    } catch (e) {
        console.error('Report error:', e);
        showToast('Failed to generate report', 'error');
    }
}

window.generateReport = generateReport;

window.AdminTabs.reports = {
    init() { displayReports(); }
};
