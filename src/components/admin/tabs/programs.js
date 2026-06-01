// tabs/programs.js — admin programs management: every program, its cost, and
// its associated units (grouped). Units are fetched once and cached.
window.AdminTabs = window.AdminTabs || {};

let _adminUnitsByProgram = null;

async function loadUnitsByProgram() {
    if (_adminUnitsByProgram) return _adminUnitsByProgram;
    _adminUnitsByProgram = {};
    try {
        const res = await authFetch(`${API_BASE}/units?limit=2000`);
        if (res.ok) {
            const body = await res.json();
            (body.units || []).forEach(u => {
                const pid = u.programId;
                if (!pid) return;
                if (!_adminUnitsByProgram[pid]) _adminUnitsByProgram[pid] = [];
                _adminUnitsByProgram[pid].push(u);
            });
        }
    } catch (e) {
        console.error('Error loading units for programs:', e);
    }
    return _adminUnitsByProgram;
}

async function displayPrograms(searchTerm = '') {
    const container = document.getElementById('programs-list');
    if (!container) { console.error('programs-list container not found'); return; }

    try {
        if ((allPrograms || []).length === 0) await loadPrograms();
        await loadUnitsByProgram();

        const searchLower = searchTerm.toLowerCase();
        const filtered = (allPrograms || []).filter(p =>
            (p.name || '').toLowerCase().includes(searchLower) ||
            (p.code || '').toLowerCase().includes(searchLower) ||
            (p.departmentName || '').toLowerCase().includes(searchLower)
        );

        const totalUnits = Object.values(_adminUnitsByProgram || {}).reduce((s, arr) => s + arr.length, 0);

        container.innerHTML = `
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3" style="margin-bottom:18px">
                <div>
                    <h1 class="adm-page-title"><i class="ri-book-2-line"></i> Programs <span style="color:var(--text-muted);font-weight:700">(${filtered.length})</span></h1>
                    <p class="kpi__note" style="margin-top:4px">${totalUnits} units across ${(allPrograms || []).length} programs</p>
                </div>
                <input type="text" id="program-search" class="adm-input" style="max-width:300px" placeholder="Search programs / code / department..." value="${escapeAttr(searchTerm)}">
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" id="programs-grid">
                ${filtered.length === 0 ? `
                    <div class="col-span-full" style="text-align:center;padding:40px 0;color:var(--text-muted)">
                        <i class="ri-search-line" style="font-size:32px;display:block;margin-bottom:8px;color:var(--text-tertiary)"></i>
                        <p style="font-size:13px">No programs found matching "${escapeHtml(searchTerm)}"</p>
                    </div>
                ` : filtered.map(program => {
                    const units = (_adminUnitsByProgram[program.id] || []).slice().sort((a, b) => (a.unitCode || '').localeCompare(b.unitCode || ''));
                    return `
                    <div class="adm-card"><div class="adm-card__body">
                        <div class="flex items-start justify-between gap-2" style="margin-bottom:6px">
                            <div class="td-strong" style="font-size:14px">${escapeHtml(program.name)}</div>
                            <span class="pill pill--neutral" style="flex-shrink:0">${escapeHtml(program.code || '')}</span>
                        </div>
                        <p class="kpi__note" style="margin-bottom:12px">${escapeHtml(program.departmentName || '')}</p>
                        <div class="flex items-center justify-between" style="margin-bottom:10px">
                            <span style="font-size:15px;font-weight:800;color:var(--maroon)">${formatCurrency(program.programCost)}</span>
                            <span class="kpi__note">per module · ${units.length} units</span>
                        </div>
                        <details class="group">
                            <summary class="adm-btn adm-btn--ghost adm-btn--sm" style="cursor:pointer;list-style:none;padding-left:0;padding-right:0">View units (${units.length})</summary>
                            <div style="margin-top:10px;max-height:176px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
                                ${units.length === 0 ? `<p class="kpi__note">No units recorded</p>` : units.map(u => `
                                    <div class="flex items-center justify-between gap-2" style="background:var(--bg-muted);border-radius:var(--radius);padding:6px 10px">
                                        <span style="font-family:monospace;color:var(--text-muted);flex-shrink:0;font-size:12px">${escapeHtml(u.unitCode || '')}</span>
                                        <span style="color:var(--text-secondary);text-align:right;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(u.unitName || '')}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </details>
                    </div></div>`;
                }).join('')}
            </div>
        `;

        const searchInput = document.getElementById('program-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const pos = e.target.selectionStart;
                displayPrograms(e.target.value).then(() => {
                    const again = document.getElementById('program-search');
                    if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (_) {} }
                });
            });
        }
    } catch (error) {
        console.error('Error displaying programs:', error);
        container.innerHTML = '<p style="text-align:center;color:var(--error);padding:32px 0">Error loading programs</p>';
    }
}

window.AdminTabs.programs = {
    init() { displayPrograms(); }
};
