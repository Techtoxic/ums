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
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
                <div>
                    <h3 class="text-sm md:text-base font-bold text-gray-800 dark:text-white">All Programs (${filtered.length})</h3>
                    <p class="text-xs text-gray-500 dark:text-gray-400">${totalUnits} units across ${(allPrograms || []).length} programs</p>
                </div>
                <input type="text" id="program-search" placeholder="Search programs / code / department..." value="${escapeAttr(searchTerm)}"
                    class="w-full sm:w-72 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:ring-1 focus:ring-primary focus:border-primary">
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" id="programs-grid">
                ${filtered.length === 0 ? `
                    <div class="col-span-full text-center py-8">
                        <i class="ri-search-line text-3xl text-gray-400 mb-2"></i>
                        <p class="text-xs text-gray-500">No programs found matching "${escapeHtml(searchTerm)}"</p>
                    </div>
                ` : filtered.map(program => {
                    const units = (_adminUnitsByProgram[program.id] || []).slice().sort((a, b) => (a.code || '').localeCompare(b.code || ''));
                    return `
                    <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:shadow-lg transition bg-white dark:bg-gray-800">
                        <div class="flex items-start justify-between gap-2 mb-1">
                            <h4 class="font-semibold text-xs text-gray-800 dark:text-white">${escapeHtml(program.name)}</h4>
                            <span class="shrink-0 px-1.5 py-0.5 text-[10px] rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">${escapeHtml(program.code || '')}</span>
                        </div>
                        <p class="text-xs text-gray-600 dark:text-gray-400 mb-2">${escapeHtml(program.departmentName || '')}</p>
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-sm font-bold text-primary">${formatCurrency(program.programCost)}</span>
                            <span class="text-[10px] text-gray-500 dark:text-gray-400">per module · ${units.length} units</span>
                        </div>
                        <details class="group">
                            <summary class="cursor-pointer text-xs font-medium text-blue-600 dark:text-blue-400 select-none">View units (${units.length})</summary>
                            <div class="mt-2 max-h-44 overflow-y-auto space-y-1">
                                ${units.length === 0 ? `<p class="text-[11px] text-gray-400">No units recorded</p>` : units.map(u => `
                                    <div class="text-[11px] bg-gray-50 dark:bg-gray-700/60 rounded px-2 py-1 flex items-center justify-between gap-2">
                                        <span class="font-mono text-gray-500 dark:text-gray-400 shrink-0">${escapeHtml(u.code || '')}</span>
                                        <span class="text-gray-700 dark:text-gray-200 text-right truncate">${escapeHtml(u.name || '')}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </details>
                    </div>`;
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
        container.innerHTML = '<p class="text-red-600 text-center py-8">Error loading programs</p>';
    }
}

window.AdminTabs.programs = {
    init() { displayPrograms(); }
};
