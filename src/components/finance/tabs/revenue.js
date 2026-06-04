// tabs/revenue.js — record + analyse non-tuition revenue.
window.FinanceTabs = window.FinanceTabs || {};

(function () {
    const API = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : `${window.location.protocol}//${window.location.host}/api`;
    const fmt = (n) => `KES ${Math.round(Number(n) || 0).toLocaleString()}`;
    let chart = null;
    let wired = false;
    let lastEntries = [];   // cached for export
    let lastSummary = {};

    function isDark() { return document.documentElement.classList.contains('dark'); }

    // Academic year runs September–August (institution-wide convention).
    function academicYearLabel(dateInput) {
        const d = dateInput ? new Date(dateInput) : new Date();
        const valid = !isNaN(d.getTime()) ? d : new Date();
        const yr = valid.getFullYear();
        const start = valid.getMonth() >= 8 ? yr : yr - 1; // Sep = index 8
        return `${start}/${start + 1}`;
    }

    async function loadRevenue() {
        try {
            const res = await window.AUTH.fetch(`${API}/revenue`);
            if (!res.ok) throw new Error('Failed to load revenue');
            const data = await res.json();
            lastEntries = data.entries || [];
            lastSummary = data.summary || {};
            renderSummary(data.summary);
            renderTable(data.entries);
            renderChart(data.summary.monthlyTrend || []);
        } catch (err) {
            console.error('Revenue load failed:', err);
            if (typeof showToast === 'function') showToast('Failed to load revenue', 'error');
        }
    }

    function renderSummary(summary) {
        const total = document.getElementById('revenue-total');
        const count = document.getElementById('revenue-count');
        if (total) total.textContent = fmt(summary.total);
        if (count) count.textContent = summary.count;
    }

    function renderTable(entries) {
        const tbody = document.getElementById('revenue-table');
        if (!tbody) return;
        if (!entries.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-slate-400">No revenue recorded yet</td></tr>';
            return;
        }
        tbody.innerHTML = entries.map(e => `
            <tr class="text-slate-700 dark:text-slate-200">
                <td class="px-4 py-2 whitespace-nowrap">${new Date(e.createdAt).toLocaleDateString('en-GB')}</td>
                <td class="px-4 py-2">${escapeHtml(e.note)}</td>
                <td class="px-4 py-2">${escapeHtml(e.source || '—')}</td>
                <td class="px-4 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">${fmt(e.amount)}</td>
                <td class="px-4 py-2 text-right whitespace-nowrap">
                    <button onclick="revenueReceipt('${e.id}')" class="text-primary hover:text-secondary mr-3" title="Download receipt">
                        <i class="ri-receipt-line"></i>
                    </button>
                    <button onclick="deleteRevenueEntry('${e.id}')" class="text-rose-600 hover:text-rose-700" title="Delete">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    function renderChart(trend) {
        const el = document.getElementById('revenue-chart');
        if (!el || typeof Chart === 'undefined') return;
        if (chart) { chart.destroy(); chart = null; }
        const tick = isDark() ? '#CBD5E1' : '#475569';
        const grid = isDark() ? 'rgba(148,163,184,0.15)' : 'rgba(100,116,139,0.12)';
        chart = new Chart(el.getContext('2d'), {
            type: 'bar',
            data: {
                labels: trend.map(p => p.month),
                datasets: [{ label: 'Revenue', data: trend.map(p => p.amount), backgroundColor: '#10B981', borderRadius: 4 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmt(c.parsed.y) } } },
                scales: {
                    x: { ticks: { color: tick }, grid: { display: false } },
                    y: { ticks: { color: tick, callback: (v) => Number(v).toLocaleString() }, grid: { color: grid }, beginAtZero: true },
                }
            }
        });
    }

    async function recordRevenue(e) {
        e.preventDefault();
        const note = document.getElementById('revenue-note').value.trim();
        const source = document.getElementById('revenue-source').value.trim();
        const amount = parseFloat(document.getElementById('revenue-amount').value);
        if (!note) { showToast('Please enter a note describing the revenue source', 'error'); return; }
        if (!Number.isFinite(amount) || amount <= 0) { showToast('Please enter a valid amount', 'error'); return; }
        try {
            const res = await window.AUTH.fetch(`${API}/revenue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note, amount, source: source || null })
            });
            if (!res.ok) { const er = await res.json().catch(() => ({})); throw new Error(er.message || 'Failed'); }
            showToast('Revenue recorded successfully', 'success');
            document.getElementById('revenue-form').reset();
            await loadRevenue();
        } catch (err) {
            console.error('Record revenue failed:', err);
            showToast(err.message || 'Failed to record revenue', 'error');
        }
    }

    window.deleteRevenueEntry = async function (id) {
        if (!confirm('Delete this revenue entry?')) return;
        try {
            const res = await window.AUTH.fetch(`${API}/revenue/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');
            showToast('Revenue entry deleted', 'success');
            await loadRevenue();
        } catch (err) {
            showToast('Failed to delete entry', 'error');
        }
    };

    // ---- Exports: non-tuition revenue (farm sales, bus rentals, hall hire, …) ----

    // Full branded PDF report of all recorded revenue, including the academic year.
    window.exportRevenuePDF = async function () {
        const D = window.EDTTIDocs;
        if (!D || !window.jspdf) { showToast('PDF engine not loaded', 'error'); return; }
        if (!lastEntries.length) { showToast('No revenue to export', 'info'); return; }
        try {
            const total = lastEntries.reduce((s, e) => s + Number(e.amount || 0), 0);
            const summary = [
                ['Academic Year', academicYearLabel()],
                ['Generated', new Date().toLocaleString('en-GB')],
                ['Entries', String(lastEntries.length)],
                ['Total Other Revenue', D.formatKES(total)],
            ];
            const columns = ['Date', 'Academic Year', 'Source / Category', 'Description', 'Recorded By', 'Amount (KES)'];
            const rows = lastEntries.map(e => [
                new Date(e.createdAt).toLocaleDateString('en-GB'),
                academicYearLabel(e.createdAt),
                e.source || 'Other',
                e.note || '',
                e.recordedByName || '—',
                D.formatKES(e.amount),
            ]);
            await D.tablePDF({
                title: 'Revenue Receipts Report',
                subtitle: 'Income from sources other than student tuition',
                summary, columns, rows, landscape: true,
                filename: `revenue_receipts_${new Date().toISOString().slice(0, 10)}.pdf`,
                footer: 'EDTTI UMS — Non-Tuition Revenue · Confidential',
            });
        } catch (err) {
            console.error('Revenue PDF export failed:', err);
            showToast('Failed to export revenue PDF', 'error');
        }
    };

    // Excel (.xls) export of all recorded revenue.
    window.exportRevenueExcel = function () {
        const D = window.EDTTIDocs;
        if (!D || typeof D.downloadExcel !== 'function') { showToast('Export engine not loaded', 'error'); return; }
        if (!lastEntries.length) { showToast('No revenue to export', 'info'); return; }
        const total = lastEntries.reduce((s, e) => s + Number(e.amount || 0), 0);
        const rows = [
            ['EDTTI — Revenue Receipts (Non-Tuition Income)'],
            [`Academic Year: ${academicYearLabel()}`, `Generated: ${new Date().toLocaleString('en-GB')}`],
            [],
            ['Date', 'Academic Year', 'Source / Category', 'Description', 'Recorded By', 'Amount (KES)'],
            ...lastEntries.map(e => [
                new Date(e.createdAt).toLocaleDateString('en-GB'),
                academicYearLabel(e.createdAt),
                e.source || 'Other',
                e.note || '',
                e.recordedByName || '—',
                Math.round(Number(e.amount) || 0),
            ]),
            [],
            ['', '', '', '', 'TOTAL', Math.round(total)],
        ];
        D.downloadExcel(rows, `revenue_receipts_${new Date().toISOString().slice(0, 10)}`);
    };

    // Individual branded revenue receipt PDF (includes academic year + reference).
    window.revenueReceipt = async function (id) {
        const D = window.EDTTIDocs;
        if (!D || !window.jspdf) { showToast('PDF engine not loaded', 'error'); return; }
        const entry = lastEntries.find(e => String(e.id) === String(id));
        if (!entry) { showToast('Revenue entry not found', 'error'); return; }
        try {
            await D.loadLogo();
            const doc = D.newDoc(false);
            const pageWidth = doc.internal.pageSize.getWidth();
            doc.setProperties({ title: 'Revenue Receipt', author: 'EDTTI UMS', creator: 'EDTTI UMS' });
            let y = D.letterhead(doc, { title: 'Revenue Receipt' });

            const createdAt = entry.createdAt ? new Date(entry.createdAt) : new Date();
            const acadYear = academicYearLabel(createdAt);
            const refTail = String(entry.id || '').slice(-6).toUpperCase();
            const receiptRef = `EDTTI/REVENUE/${acadYear.replace('/', '-')}/${refTail}`;

            doc.setFontSize(10); doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
            doc.text(`Ref: ${receiptRef}`, 14, y);
            doc.text(`Date: ${createdAt.toLocaleDateString('en-GB')}`, pageWidth - 14, y, { align: 'right' });

            doc.autoTable({
                startY: y + 4,
                theme: 'plain',
                styles: { fontSize: 10, cellPadding: 1.5 },
                columnStyles: { 0: { fontStyle: 'bold', textColor: D.MAROON, cellWidth: 45 } },
                body: [
                    ['Source / Category', entry.source || 'Other'],
                    ['Description', entry.note || '—'],
                    ['Reference', receiptRef],
                    ['Academic Year', acadYear],
                    ['Recorded By', entry.recordedByName || '—'],
                ],
                margin: { left: 14, right: 14 },
            });
            y = doc.lastAutoTable.finalY + 6;

            const amount = `KES ${Number(entry.amount || 0).toLocaleString()}`;
            doc.autoTable({
                startY: y,
                head: [['Description', 'Reference', 'Amount']],
                body: [[entry.source || 'Other Revenue', receiptRef, amount]],
                foot: [['Total Received', '', amount]],
                theme: 'grid',
                styles: { fontSize: 10, cellPadding: 3 },
                headStyles: { fillColor: D.MAROON, textColor: 255, fontStyle: 'bold' },
                footStyles: { fillColor: D.CREAM, textColor: D.MAROON, fontStyle: 'bold' },
                columnStyles: { 2: { halign: 'right' } },
                margin: { left: 14, right: 14 },
            });
            y = doc.lastAutoTable.finalY + 14;

            doc.setFontSize(9); doc.setTextColor(70, 70, 70); doc.setFont('helvetica', 'normal');
            doc.text('This is an official revenue receipt from Emurua Dikirr Technical Training Institute.', 14, y);

            D.decorate(doc, { footer: 'EDTTI — Official Revenue Receipt · Confidential' });
            D.lockDocument(doc);
            doc.save(`revenue_receipt_${refTail}_${Date.now()}.pdf`);
            showToast('Revenue receipt generated', 'success');
        } catch (err) {
            console.error('Revenue receipt failed:', err);
            showToast('Failed to generate revenue receipt', 'error');
        }
    };

    window.FinanceTabs.revenue = {
        init() {
            if (!wired) {
                const form = document.getElementById('revenue-form');
                if (form) { form.addEventListener('submit', recordRevenue); wired = true; }
            }
            loadRevenue();
        }
    };
})();
