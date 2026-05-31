// tabs/financial.js — admin financial overview (accurate, server-backed).
// Totals come from /api/finance/analytics + the per-student financials map; the
// recent-payments table resolves the student UUID to a real name.
window.AdminTabs = window.AdminTabs || {};

function adminStudentNameById(uuid) {
    const s = (allStudents || []).find(st => st._id === uuid || st.id === uuid);
    return s ? s.name : (uuid || 'N/A');
}

async function displayFinancial() {
    const container = document.getElementById('financial-content');
    if (!container) { console.error('financial-content container not found'); return; }

    try {
        if (!financeAnalytics) await loadFinanceAnalytics();
        if (Object.keys(studentFinanceByAdm || {}).length === 0) await loadStudentFinancials();

        const totals = (financeAnalytics && financeAnalytics.totals) || {};
        const totalRevenue = Number(totals.totalRevenue || 0);
        const tuitionRevenue = Number(totals.tuitionRevenue || 0);
        const otherRevenue = Number(totals.otherRevenue || 0);
        const fin = Object.values(studentFinanceByAdm || {});
        const totalOutstanding = fin.reduce((sum, f) => sum + Math.max(0, Number(f.balance) || 0), 0);
        const studentsOwing = fin.filter(f => (Number(f.balance) || 0) > 0).length;
        const expected = Number(totals.expectedRevenue || 0);
        // Collection rate = (expected − outstanding) / expected, capped at 100% —
        // identical to the dashboard. Prefer the server value (totals.collectionRate),
        // fall back to the same formula locally. The old (tuition / expected) form
        // wrongly read 100% because cumulative tuition can exceed expected-to-date.
        const collectionRate = (totals.collectionRate != null)
            ? Math.round(Number(totals.collectionRate))
            : (expected > 0 ? Math.min(100, Math.round(((expected - totalOutstanding) / expected) * 100)) : 0);

        const modePill = { mpesa: 'pill--success', bank: 'pill--info', bursary: 'pill--warning' };
        const modeLabel = { mpesa: 'M-Pesa', bank: 'Bank', bursary: 'Bursary' };

        container.innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" style="margin-bottom:18px">
                <div class="kpi">
                    <div class="kpi__top"><span class="kpi__icon kpi__icon--gold"><i class="ri-money-dollar-circle-line"></i></span><span class="kpi__label">Total Revenue</span></div>
                    <div class="kpi__value">${formatCurrency(totalRevenue)}</div>
                    <div class="kpi__foot"><span class="kpi__note">Tuition ${formatCurrency(tuitionRevenue)} · Other ${formatCurrency(otherRevenue)}</span></div>
                </div>
                <div class="kpi">
                    <div class="kpi__top"><span class="kpi__icon"><i class="ri-graduation-cap-line"></i></span><span class="kpi__label">Tuition Collected</span></div>
                    <div class="kpi__value">${formatCurrency(tuitionRevenue)}</div>
                    <div class="kpi__foot"><span class="kpi__note">${collectionRate}% of expected</span></div>
                </div>
                <div class="kpi">
                    <div class="kpi__top"><span class="kpi__icon"><i class="ri-error-warning-line"></i></span><span class="kpi__label">Outstanding</span></div>
                    <div class="kpi__value">${formatCurrency(totalOutstanding)}</div>
                    <div class="kpi__foot"><span class="kpi__note">${studentsOwing} students owing</span></div>
                </div>
                <div class="kpi">
                    <div class="kpi__top"><span class="kpi__icon"><i class="ri-bank-line"></i></span><span class="kpi__label">Expected Tuition</span></div>
                    <div class="kpi__value">${formatCurrency(expected)}</div>
                    <div class="kpi__foot"><span class="kpi__note">${(allStudents || []).length} students</span></div>
                </div>
            </div>

            <div class="adm-card" style="margin-bottom:18px"><div class="adm-card__body">
                <div class="kpi__label">Collection Rate</div>
                <div style="display:flex;align-items:baseline;gap:8px;margin:6px 0 12px"><span style="font-size:26px;font-weight:800;color:var(--text-primary)">${collectionRate}%</span><span class="kpi__note">of expected tuition</span></div>
                <div class="adm-progress"><div class="adm-progress__fill" style="width:${collectionRate}%"></div></div>
            </div></div>

            <div class="adm-card">
                <div class="adm-card__head"><div class="adm-card__title"><i class="ri-bank-card-line"></i> Recent Payments</div></div>
                <div class="adm-table-wrap">
                    <table class="adm-table">
                        <thead><tr><th>Date</th><th>Student</th><th>Method</th><th>Reference</th><th style="text-align:right">Amount</th></tr></thead>
                        <tbody>
                            ${(allPayments || []).length === 0 ? `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px">No payments yet</td></tr>` : (allPayments || []).slice(0, 12).map(payment => {
                                const mode = (payment.paymentMode || '').toLowerCase();
                                return `
                                <tr>
                                    <td>${escapeHtml(new Date(payment.paymentDate || payment.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }))}</td>
                                    <td class="td-strong">${escapeHtml(adminStudentNameById(payment.studentId))}</td>
                                    <td><span class="pill ${modePill[mode] || 'pill--neutral'}">${escapeHtml(modeLabel[mode] || payment.paymentMode || 'N/A')}</span></td>
                                    <td>${escapeHtml(payment.referenceNumber || 'N/A')}</td>
                                    <td class="td-strong" style="text-align:right">${formatCurrency(payment.amount)}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error displaying financial data:', error);
        container.innerHTML = '<p style="text-align:center;color:var(--error);padding:32px 0">Error loading financial data: ' + escapeHtml(error.message) + '</p>';
    }
}

window.AdminTabs.financial = {
    init() { displayFinancial(); }
};
