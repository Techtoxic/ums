// tabs/revenue.js — record + analyse non-tuition revenue.
window.FinanceTabs = window.FinanceTabs || {};

(function () {
    const API = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : `${window.location.protocol}//${window.location.host}/api`;
    const fmt = (n) => `KES ${Math.round(Number(n) || 0).toLocaleString()}`;
    let chart = null;
    let wired = false;

    function isDark() { return document.documentElement.classList.contains('dark'); }

    async function loadRevenue() {
        try {
            const res = await window.AUTH.fetch(`${API}/revenue`);
            if (!res.ok) throw new Error('Failed to load revenue');
            const data = await res.json();
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
                <td class="px-4 py-2 text-right">
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
