// tabs/units.js — deputy unit management.
//
// BUG FIX: the old view grouped by unit.courseCode (which produced "undefined"
// headers) and printed `unit.creditHours` ("0 Credit Hours") — neither field is
// returned by the fixed /api/units endpoint. We now group by courseName (header
// shows courseName + courseCode) and each tile shows unitName, unitCode and a
// "Module N" pill. creditHours is dropped entirely. Adds course + level filters
// and client-side pagination of the flat unit list (~30 units/page).
window.DeputyTabs = window.DeputyTabs || {};

const DEPUTY_UNITS_PAGE_SIZE = 30;

let _deputyUnitsCache = [];
let _deputyUnitsPage = 1;
let _deputyUnitsFilters = { course: 'all', level: 'all' };

// Load units data (once), populate the filter dropdowns, then render.
async function loadUnitsData() {
    try {
        const response = await window.AUTH.fetch(`${API_BASE_URL}/units?limit=2000`);
        if (!response.ok) {
            throw new Error('Failed to fetch units');
        }

        const data = await response.json();
        _deputyUnitsCache = Array.isArray(data) ? data : (data.units || []);
        _deputyUnitsPage = 1;
        populateUnitFilters();
        displayUnits();
    } catch (error) {
        console.error('Error loading units:', error);
    }
}

// Build the course + level filter options from the loaded units.
function populateUnitFilters() {
    const courseEl = document.getElementById('deputyUnitsCourse');
    const levelEl = document.getElementById('deputyUnitsLevel');

    if (courseEl) {
        // Unique courses keyed by courseCode (label = courseName).
        const seen = new Map();
        _deputyUnitsCache.forEach(u => {
            const code = u.courseCode || '';
            const name = u.courseName || code || 'Unassigned';
            if (code && !seen.has(code)) seen.set(code, name);
        });
        const opts = ['<option value="all">All Courses</option>']
            .concat(Array.from(seen.entries())
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([code, name]) => `<option value="${escapeAttr(code)}">${escapeHtml(name)}</option>`));
        courseEl.innerHTML = opts.join('');
        courseEl.value = _deputyUnitsFilters.course;
    }

    if (levelEl) {
        const levels = Array.from(new Set(_deputyUnitsCache
            .map(u => u.level)
            .filter(l => l != null && l !== '')))
            .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
        const opts = ['<option value="all">All Levels</option>']
            .concat(levels.map(l => `<option value="${escapeAttr(String(l))}">Level ${escapeHtml(String(l))}</option>`));
        levelEl.innerHTML = opts.join('');
        levelEl.value = _deputyUnitsFilters.level;
    }
}

// Apply filters → flat list.
function filteredUnits() {
    return (_deputyUnitsCache || []).filter(u => {
        if (_deputyUnitsFilters.course !== 'all' && (u.courseCode || '') !== _deputyUnitsFilters.course) return false;
        if (_deputyUnitsFilters.level !== 'all' && String(u.level) !== String(_deputyUnitsFilters.level)) return false;
        return true;
    });
}

// Render the current page of units, grouped by courseName.
function displayUnits() {
    const content = document.getElementById('unitsContent');
    if (!content) return;

    const all = filteredUnits();
    const totalItems = all.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / DEPUTY_UNITS_PAGE_SIZE));
    if (_deputyUnitsPage > totalPages) _deputyUnitsPage = totalPages;

    const start = (_deputyUnitsPage - 1) * DEPUTY_UNITS_PAGE_SIZE;
    const pageUnits = all.slice(start, start + DEPUTY_UNITS_PAGE_SIZE);

    if (totalItems === 0) {
        content.innerHTML = `
            <div class="adm-card"><div class="adm-card__body" style="text-align:center;padding:40px 0;color:var(--text-muted)">
                <i class="ri-file-list-3-line" style="font-size:32px;display:block;margin-bottom:8px;color:var(--text-tertiary)"></i>
                <p style="font-size:13px">No units found</p>
            </div></div>`;
        renderUnitsPagination(0, totalPages);
        return;
    }

    // Group the current page by courseName (FIX: was courseCode → "undefined").
    const unitsByCourse = {};
    pageUnits.forEach(unit => {
        const name = unit.courseName || 'Unassigned';
        if (!unitsByCourse[name]) unitsByCourse[name] = { code: unit.courseCode || '', units: [] };
        unitsByCourse[name].units.push(unit);
    });

    content.innerHTML = Object.keys(unitsByCourse).map(courseName => {
        const group = unitsByCourse[courseName];
        return `
        <div class="adm-card" style="margin-bottom:16px">
            <div class="adm-card__head">
                <div class="adm-card__title"><i class="ri-book-open-line"></i> ${escapeHtml(courseName)}</div>
                ${group.code ? `<span class="pill pill--neutral">${escapeHtml(group.code)}</span>` : ''}
            </div>
            <div class="adm-card__body">
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    ${group.units.map(unit => `
                        <div class="adm-card"><div class="adm-card__body">
                            <div class="flex items-start justify-between gap-2" style="margin-bottom:6px">
                                <div class="td-strong" style="font-size:14px">${escapeHtml(unit.unitName || '')}</div>
                                ${unit.module != null && unit.module !== '' ? `<span class="pill pill--info" style="flex-shrink:0">Module ${escapeHtml(String(unit.module))}</span>` : ''}
                            </div>
                            <p class="kpi__note" style="font-family:monospace">${escapeHtml(unit.unitCode || '')}</p>
                        </div></div>
                    `).join('')}
                </div>
            </div>
        </div>`;
    }).join('');

    renderUnitsPagination(totalItems, totalPages);
}

// Pagination controls (admin adm-btn styling) with "Showing X–Y of N".
function renderUnitsPagination(totalItems, totalPages) {
    const container = document.getElementById('unitsPagination');
    if (!container) return;
    if (totalItems === 0) { container.innerHTML = ''; return; }

    const startIndex = (_deputyUnitsPage - 1) * DEPUTY_UNITS_PAGE_SIZE + 1;
    const endIndex = Math.min(_deputyUnitsPage * DEPUTY_UNITS_PAGE_SIZE, totalItems);

    container.innerHTML = `
        <div class="flex items-center justify-between gap-3 flex-wrap">
            <div class="kpi__note">Showing ${startIndex}–${endIndex} of ${totalItems} units · Page ${_deputyUnitsPage} of ${totalPages}</div>
            <div class="flex items-center" style="gap:6px">
                <button onclick="changeUnitsPage('prev')" ${_deputyUnitsPage === 1 ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''} class="adm-btn adm-btn--outline adm-btn--sm"><i class="ri-arrow-left-s-line"></i> Prev</button>
                <button onclick="changeUnitsPage('next')" ${_deputyUnitsPage >= totalPages ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''} class="adm-btn adm-btn--outline adm-btn--sm">Next <i class="ri-arrow-right-s-line"></i></button>
            </div>
        </div>`;
}

function changeUnitsPage(direction) {
    const totalPages = Math.max(1, Math.ceil(filteredUnits().length / DEPUTY_UNITS_PAGE_SIZE));
    if (direction === 'prev' && _deputyUnitsPage > 1) _deputyUnitsPage--;
    else if (direction === 'next' && _deputyUnitsPage < totalPages) _deputyUnitsPage++;
    else return;
    displayUnits();
    window.scrollTo(0, 0);
}
window.changeUnitsPage = changeUnitsPage;

window.DeputyTabs.units = {
    init() {
        loadUnitsData();
        if (window.__deputyUnitsWired) return;
        window.__deputyUnitsWired = true;
        const courseEl = document.getElementById('deputyUnitsCourse');
        const levelEl = document.getElementById('deputyUnitsLevel');
        if (courseEl) courseEl.addEventListener('change', (e) => { _deputyUnitsFilters.course = e.target.value; _deputyUnitsPage = 1; displayUnits(); });
        if (levelEl) levelEl.addEventListener('change', (e) => { _deputyUnitsFilters.level = e.target.value; _deputyUnitsPage = 1; displayUnits(); });
    }
};
