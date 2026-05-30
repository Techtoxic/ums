// tabs/analytics.js — HOD department analytics (Chart.js). All figures are
// derived from the already-loaded real department data (unitsData, trainersData,
// assignmentsData from /api/.../department/:dept). Charts are theme-aware and
// destroy() the prior instance before re-creating so revisiting the tab is safe.
window.HODTabs = window.HODTabs || {};

let assignmentChart = null;
let workloadChart = null;

function anIsDark() { return document.documentElement.classList.contains('dark'); }
function anTick() { return anIsDark() ? '#CBD5E1' : '#475569'; }
function anGrid() { return anIsDark() ? 'rgba(148,163,184,0.15)' : 'rgba(100,116,139,0.12)'; }

function anAssignedUnitIds() {
    // assignmentsData rows expose the populated unitId object (V1-compat shape).
    return new Set((assignmentsData || [])
        .map(a => a.unitId && a.unitId._id ? a.unitId._id.toString() : null)
        .filter(Boolean));
}

function setAnText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }

function updateAnalyticsKpis() {
    const totalUnits = (unitsData || []).length;
    const assignedIds = anAssignedUnitIds();
    const assigned = Math.min(totalUnits, assignedIds.size);
    const unassigned = Math.max(0, totalUnits - assigned);
    const trainers = (trainersData || []).length;
    const coverage = totalUnits > 0 ? Math.round((assigned / totalUnits) * 100) : 0;

    setAnText('an-total-units', totalUnits);
    setAnText('an-assigned-units', assigned);
    setAnText('an-unassigned-units', unassigned);
    setAnText('an-trainers', trainers);
    setAnText('an-coverage-pct', `${coverage}%`);
    const bar = document.getElementById('an-coverage-bar');
    if (bar) bar.style.width = `${coverage}%`;
    const deptLabel = document.getElementById('an-dept-label');
    if (deptLabel && typeof currentHOD !== 'undefined' && currentHOD) {
        deptLabel.textContent = (typeof formatDepartmentName === 'function' ? formatDepartmentName(currentHOD.department) : currentHOD.department) || '';
    }
}

function updateAssignmentChart() {
    const canvas = document.getElementById('assignmentChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (assignmentChart) assignmentChart.destroy();

    const totalUnits = (unitsData || []).length;
    const assigned = Math.min(totalUnits, anAssignedUnitIds().size);
    const unassigned = Math.max(0, totalUnits - assigned);

    assignmentChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Assigned', 'Unassigned'],
            datasets: [{
                data: [assigned, unassigned],
                backgroundColor: ['#10B981', '#EF4444'],
                borderColor: anIsDark() ? '#1F2937' : '#FFFFFF',
                borderWidth: 2,
                hoverOffset: 6,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
                legend: { position: 'bottom', labels: { color: anTick(), usePointStyle: true, padding: 16 } },
                tooltip: {
                    callbacks: {
                        label: (c) => {
                            const total = assigned + unassigned;
                            const pct = total > 0 ? Math.round((c.parsed / total) * 100) : 0;
                            return ` ${c.label}: ${c.parsed} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

function updateWorkloadChart() {
    const canvas = document.getElementById('workloadChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (workloadChart) workloadChart.destroy();

    const trainerWorkloads = (trainersData || []).map(trainer => {
        const count = (assignmentsData || []).filter(a =>
            a.trainerId && a.trainerId._id && trainer._id &&
            a.trainerId._id.toString() === trainer._id.toString()
        ).length;
        return { name: trainer.name ? trainer.name.split(' ').slice(0, 2).join(' ') : 'Unknown', assignments: count };
    });

    workloadChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: trainerWorkloads.map(t => t.name),
            datasets: [{
                label: 'Assigned Units',
                data: trainerWorkloads.map(t => t.assignments),
                backgroundColor: 'rgba(59,130,246,0.85)',
                hoverBackgroundColor: '#2563EB',
                borderRadius: 6,
                maxBarThickness: 46,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, color: anTick() }, grid: { color: anGrid() } },
                x: { ticks: { color: anTick() }, grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function updateAnalytics() {
    updateAnalyticsKpis();
    updateAssignmentChart();
    updateWorkloadChart();
}

window.HODTabs.analytics = {
    init() { updateAnalytics(); }
};
