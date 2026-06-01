// tabs/trainers.js — deputy trainer management: adm-table with department
// filter + client-side pagination (~20/page). Pagination/changePage helpers
// are shared with students.js (window.changePage / updatePagination).
window.DeputyTabs = window.DeputyTabs || {};

const DEPUTY_TRAINERS_PAGE_SIZE = 20;

// Shared with students.js's updatePagination()/changePage() (which reference
// the global `trainersPagination`). All trainers are fetched once, then
// filtered + paginated client-side.
var trainersPagination = {
    currentPage: 1,
    itemsPerPage: DEPUTY_TRAINERS_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1,
    all: [],        // every trainer (with enriched counts)
    filtered: [],   // after applying the dept/search filters
    filters: { search: '', department: 'all' },
};

// Load trainers data (once), then render page 1.
async function loadTrainersData() {
    try {
        const response = await window.AUTH.fetch(`${API_BASE_URL}/trainers/all-departments`);
        if (!response.ok) {
            throw new Error('Failed to fetch trainers data');
        }

        const data = await response.json();
        const trainers = data.trainers || [];

        // The list endpoint already returns per-trainer counts (unitsAssigned /
        // studentsAssigned), computed server-side in two grouped queries. Use
        // them directly — no per-trainer fan-out. (The old code fetched
        // /trainers/<id>/students + /assignments per row, which 403'd: those
        // endpoints don't authorize the deputy role, and it read trainer._id
        // when the endpoint returns `id`.)
        const trainersWithData = trainers.map(trainer => ({
            ...trainer,
            studentCount: trainer.studentsAssigned || 0,
            assignedUnits: trainer.unitsAssigned || 0,
        }));

        trainersPagination.all = trainersWithData;
        trainersPagination.currentPage = 1;
        applyTrainerFilters();
    } catch (error) {
        console.error('Error loading trainers data:', error);
        const tbody = document.getElementById('trainersTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px">
                        Error loading trainers: ${escapeHtml(error.message)}
                    </td>
                </tr>
            `;
        }
    }
}

// Re-filter from the cached list, reset to page 1, re-render.
function applyTrainerFilters() {
    const { search, department } = trainersPagination.filters;
    const q = (search || '').trim().toLowerCase();
    trainersPagination.filtered = (trainersPagination.all || []).filter(t => {
        if (department && department !== 'all' && t.department !== department) return false;
        if (q) {
            const hay = `${t.name || ''} ${t.email || ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
    trainersPagination.totalItems = trainersPagination.filtered.length;
    trainersPagination.totalPages = Math.max(1, Math.ceil(trainersPagination.totalItems / trainersPagination.itemsPerPage));
    if (trainersPagination.currentPage > trainersPagination.totalPages) trainersPagination.currentPage = trainersPagination.totalPages;
    displayTrainers();
    if (typeof updatePagination === 'function') updatePagination('trainers');
}

// Render the current page of the filtered trainers into the adm-table.
function displayTrainers() {
    const tbody = document.getElementById('trainersTableBody');
    if (!tbody) return;

    const list = trainersPagination.filtered || [];
    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px">
                    No trainers found
                </td>
            </tr>
        `;
        return;
    }

    const start = (trainersPagination.currentPage - 1) * trainersPagination.itemsPerPage;
    const pageRows = list.slice(start, start + trainersPagination.itemsPerPage);
    const fmtDept = (window.formatDepartmentName)
        ? window.formatDepartmentName
        : (window.Catalog ? (c) => window.Catalog.departmentName(c) : (c) => c);

    tbody.innerHTML = pageRows.map(trainer => {
        const initial = escapeHtml((trainer.name || '?').trim().charAt(0).toUpperCase() || '?');
        const units = Number(trainer.assignedUnits || 0);
        const students = Number(trainer.studentCount || 0);
        return `
            <tr>
                <td>
                    <div style="display:flex;align-items:center;gap:12px">
                        <div style="width:38px;height:38px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:var(--maroon);background:color-mix(in srgb, var(--maroon) 12%, transparent)">${initial}</div>
                        <div style="min-width:0">
                            <div class="td-strong">${escapeHtml(trainer.name)}</div>
                            <div style="color:var(--text-muted);font-size:12px">${escapeHtml(trainer.email || '')}</div>
                        </div>
                    </div>
                </td>
                <td>${escapeHtml(fmtDept(trainer.department) || trainer.department || '')}</td>
                <td><span class="pill pill--info">${units} unit${units === 1 ? '' : 's'}</span></td>
                <td><span class="pill pill--neutral">${students} student${students === 1 ? '' : 's'}</span></td>
                <td style="text-align:right"><span class="pill pill--success">Active</span></td>
            </tr>
        `;
    }).join('');
}

window.DeputyTabs.trainers = {
    init() {
        loadTrainersData();
        if (window.__deputyTrainersWired) return;
        window.__deputyTrainersWired = true;
        const searchEl = document.getElementById('deputyTrainersSearch');
        const deptEl = document.getElementById('deputyTrainersDepartment');
        let t;
        if (searchEl) searchEl.addEventListener('input', (e) => {
            clearTimeout(t);
            const v = e.target.value;
            t = setTimeout(() => { trainersPagination.filters.search = v; trainersPagination.currentPage = 1; applyTrainerFilters(); }, 250);
        });
        if (deptEl) deptEl.addEventListener('change', (e) => { trainersPagination.filters.department = e.target.value; trainersPagination.currentPage = 1; applyTrainerFilters(); });
    }
};
