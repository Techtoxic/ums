// tabs/reports.js — admin reports. Real branded PDF/Excel exports (no CSV/JSON)
// built from the same accurate, server-backed data the dashboard uses.
window.AdminTabs = window.AdminTabs || {};

function adminDocs() { return window.EDTTIDocs || window.FinanceDocs; }
const adminToday = () => new Date().toISOString().slice(0, 10);

function reportCard(id, icon, color, title, desc) {
    return `
        <div class="adm-card">
            <div class="adm-card__body">
                <div class="flex items-center gap-3" style="margin-bottom:14px">
                    <div style="width:42px;height:42px;border-radius:var(--radius);display:flex;align-items:center;justify-content:center;flex-shrink:0;background:color-mix(in srgb, ${color} 12%, transparent);color:${color}"><i class="${icon}" style="font-size:20px"></i></div>
                    <div>
                        <div class="adm-card__title" style="font-size:14px">${title}</div>
                        <p style="font-size:12px;color:var(--text-muted);margin-top:2px">${desc}</p>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="generateReport('${id}','pdf')" class="adm-btn adm-btn--primary adm-btn--sm" style="flex:1;justify-content:center"><i class="ri-file-pdf-2-line"></i> PDF</button>
                    <button onclick="generateReport('${id}','excel')" class="adm-btn adm-btn--outline adm-btn--sm" style="flex:1;justify-content:center"><i class="ri-file-excel-2-line"></i> Excel</button>
                </div>
            </div>
        </div>`;
}

function displayReports() {
    const container = document.getElementById('reports-container');
    if (!container) return;
    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            ${reportCard('enrollment', 'ri-user-follow-line', '#2563EB', 'Enrollment Report', 'Students by department & module')}
            ${reportCard('financial', 'ri-money-dollar-circle-line', 'var(--success)', 'Financial Report', 'Revenue, collection & outstanding')}
            ${reportCard('department', 'ri-building-line', 'var(--maroon)', 'Department Report', 'Expected vs collected by department')}
            ${reportCard('students', 'ri-graduation-cap-line', 'var(--gold)', 'Student Financials', 'Per-student expected, paid, balance')}
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
