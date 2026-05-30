// tabs/analytics.js — finance analytics: accurate aggregates + production charts.
// Data comes from GET /api/finance/analytics (server-computed against the real
// payment / revenue / student records). Charts use Chart.js (loaded in the shell).
window.FinanceTabs = window.FinanceTabs || {};

(function () {
    const API = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : `${window.location.protocol}//${window.location.host}/api`;
    const MAROON = '#7A0C0C';
    const GOLD = '#D4A017';
    const EMERALD = '#10B981';
    const SLATE = '#64748B';
    const ROSE = '#E11D48';
    const BLUE = '#2563EB';

    const charts = {};            // canvasId -> Chart instance
    let lastData = null;          // cache for exports

    const fmt = (n) => `KES ${Math.round(Number(n) || 0).toLocaleString()}`;

    function isDark() { return document.documentElement.classList.contains('dark'); }
    function tickColor() { return isDark() ? '#CBD5E1' : '#475569'; }
    function gridColor() { return isDark() ? 'rgba(148,163,184,0.15)' : 'rgba(100,116,139,0.12)'; }

    function destroy(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

    function makeChart(id, config) {
        const el = document.getElementById(id);
        if (!el || typeof Chart === 'undefined') return;
        destroy(id);
        charts[id] = new Chart(el.getContext('2d'), config);
    }

    function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }

    async function loadAnalytics() {
        const res = await window.AUTH.fetch(`${API}/finance/analytics`);
        if (!res.ok) throw new Error('Failed to load analytics');
        const data = await res.json();
        lastData = data;
        renderKpis(data);
        renderTrend(data);
        renderModes(data);
        renderDepartments(data);
        renderStreams(data);
        renderDeptTable(data);
    }

    function renderKpis(d) {
        const t = d.totals || {};
        setText('an-total-revenue', fmt(t.totalRevenue));
        setText('an-revenue-split', `Tuition ${fmt(t.tuitionRevenue)} · Other ${fmt(t.otherRevenue)}`);
        setText('an-expected', fmt(t.expectedRevenue));
        setText('an-collection-rate', `${t.collectionRate || 0}%`);
        const bar = document.getElementById('an-collection-bar');
        if (bar) bar.style.width = `${Math.min(100, t.collectionRate || 0)}%`;
        setText('an-outstanding', fmt(t.outstandingBalance));
        setText('an-students-summary', `${t.studentsTotal || 0} students · ${t.fullyPaid || 0} fully paid · ${t.withBalance || 0} with balance`);
    }

    function renderTrend(d) {
        const trend = d.monthlyTrend || [];
        makeChart('an-trend-chart', {
            type: 'line',
            data: {
                labels: trend.map(p => p.label),
                datasets: [{
                    label: 'Revenue',
                    data: trend.map(p => p.amount),
                    borderColor: MAROON,
                    backgroundColor: 'rgba(122,12,12,0.12)',
                    fill: true,
                    tension: 0.35,
                    pointRadius: 3,
                    pointBackgroundColor: MAROON,
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmt(c.parsed.y) } } },
                scales: {
                    x: { ticks: { color: tickColor() }, grid: { color: gridColor() } },
                    y: { ticks: { color: tickColor(), callback: (v) => 'KES ' + Number(v).toLocaleString() }, grid: { color: gridColor() }, beginAtZero: true },
                }
            }
        });
    }

    function renderModes(d) {
        const modes = d.paymentModes || [];
        const labelMap = { mpesa: 'M-Pesa', bank: 'Bank Transfer', bursary: 'CDF Bursary', unknown: 'Other' };
        makeChart('an-mode-chart', {
            type: 'doughnut',
            data: {
                labels: modes.map(m => labelMap[m.mode] || m.mode),
                datasets: [{ data: modes.map(m => m.amount), backgroundColor: [EMERALD, BLUE, GOLD, SLATE, ROSE], borderWidth: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '62%',
                plugins: { legend: { position: 'bottom', labels: { color: tickColor(), padding: 12 } }, tooltip: { callbacks: { label: (c) => `${c.label}: ${fmt(c.parsed)}` } } }
            }
        });
    }

    function renderDepartments(d) {
        const depts = d.departmentBreakdown || [];
        makeChart('an-dept-chart', {
            type: 'bar',
            data: {
                labels: depts.map(x => x.departmentName),
                datasets: [
                    { label: 'Collected', data: depts.map(x => x.actual), backgroundColor: MAROON, borderRadius: 4 },
                    { label: 'Expected', data: depts.map(x => x.expected), backgroundColor: GOLD, borderRadius: 4 },
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: tickColor() } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.parsed.x)}` } } },
                scales: {
                    x: { ticks: { color: tickColor(), callback: (v) => Number(v).toLocaleString() }, grid: { color: gridColor() }, beginAtZero: true },
                    y: { ticks: { color: tickColor() }, grid: { display: false } },
                }
            }
        });
    }

    function renderStreams(d) {
        const streams = (d.revenueStreams || []).filter(s => s.amount > 0);
        makeChart('an-stream-chart', {
            type: 'doughnut',
            data: {
                labels: streams.map(s => s.label),
                datasets: [{ data: streams.map(s => s.amount), backgroundColor: [MAROON, GOLD, EMERALD, BLUE, SLATE, ROSE], borderWidth: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '55%',
                plugins: { legend: { position: 'bottom', labels: { color: tickColor(), padding: 12 } }, tooltip: { callbacks: { label: (c) => `${c.label}: ${fmt(c.parsed)}` } } }
            }
        });
    }

    function renderDeptTable(d) {
        const tbody = document.getElementById('an-dept-table');
        if (!tbody) return;
        const depts = d.departmentBreakdown || [];
        tbody.innerHTML = depts.map(x => `
            <tr class="text-slate-700 dark:text-slate-200">
                <td class="px-3 py-2">${escapeHtml(x.departmentName)}</td>
                <td class="px-3 py-2 text-right">${x.students}</td>
                <td class="px-3 py-2 text-right">${fmt(x.expected)}</td>
                <td class="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">${fmt(x.actual)}</td>
                <td class="px-3 py-2 text-right text-rose-600 dark:text-rose-400">${fmt(x.outstanding)}</td>
            </tr>
        `).join('') || '<tr><td colspan="5" class="px-3 py-4 text-center text-slate-400">No data</td></tr>';
    }

    // ---- Exports (PDF + Excel only) ----
    window.exportAnalyticsPDF = function exportAnalyticsPDF() {
        if (!lastData) { showToast('Analytics still loading', 'warning'); return; }
        if (window.FinanceDocs && window.FinanceDocs.analyticsPDF) {
            window.FinanceDocs.analyticsPDF(lastData);
        } else {
            showToast('PDF exporter unavailable', 'error');
        }
    };

    window.exportAnalyticsExcel = function exportAnalyticsExcel() {
        if (!lastData) { showToast('Analytics still loading', 'warning'); return; }
        const t = lastData.totals || {};
        const rows = [
            ['Finance Analytics Report'],
            ['Generated', new Date().toLocaleString()],
            [],
            ['Metric', 'Value'],
            ['Total Revenue', t.totalRevenue],
            ['Tuition Revenue', t.tuitionRevenue],
            ['Other Revenue', t.otherRevenue],
            ['Expected Tuition', t.expectedRevenue],
            ['Outstanding Balance', t.outstandingBalance],
            ['Collection Rate (%)', t.collectionRate],
            ['Total Students', t.studentsTotal],
            ['Fully Paid', t.fullyPaid],
            ['With Balance', t.withBalance],
            [],
            ['Department', 'Students', 'Expected', 'Collected', 'Outstanding'],
            ...(lastData.departmentBreakdown || []).map(x => [x.departmentName, x.students, x.expected, x.actual, x.outstanding]),
        ];
        window.FinanceDocs.downloadExcel(rows, `finance_analytics_${new Date().toISOString().slice(0, 10)}`);
    };

    window.FinanceTabs.analytics = {
        init() {
            loadAnalytics().catch(err => {
                console.error('Analytics load failed:', err);
                if (typeof showToast === 'function') showToast('Failed to load analytics', 'error');
            });
        }
    };
})();
