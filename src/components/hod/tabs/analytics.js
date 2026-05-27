// tabs/analytics.js — HOD analytics charts (Chart.js). The chart functions
// already destroy() the prior instance before re-creating, so revisiting the
// tab is safe without a render-once guard.
window.HODTabs = window.HODTabs || {};

// (verbatim from hodDashboard.js)
// Update analytics charts
function updateAnalytics() {
    updateAssignmentChart();
    updateWorkloadChart();
}

// Module-level chart instance for proper teardown on re-render.
let assignmentChart = null;

// Update assignment status chart
function updateAssignmentChart() {
    const assignmentCanvas = document.getElementById('assignmentChart');
    if (!assignmentCanvas) return; // SPA: analytics partial not injected yet
    const ctx = assignmentCanvas.getContext('2d');

    // Destroy existing chart if it exists (prevents Chart.js "Canvas is already in use" leak
    // when the analytics tab is opened more than once per session).
    if (assignmentChart) {
        assignmentChart.destroy();
    }

    const assignedCount = assignmentsData.length;
    const unassignedCount = Math.max(0, unitsData.length - assignedCount);

    assignmentChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Assigned', 'Unassigned'],
            datasets: [{
                data: [assignedCount, unassignedCount],
                backgroundColor: ['#10B981', '#EF4444'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// Global chart instances to manage destruction
let workloadChart = null;

// Update trainer workload chart
function updateWorkloadChart() {
    const workloadCanvas = document.getElementById('workloadChart');
    if (!workloadCanvas) return; // SPA: analytics partial not injected yet
    const ctx = workloadCanvas.getContext('2d');
    
    // Destroy existing chart if it exists
    if (workloadChart) {
        workloadChart.destroy();
    }
    
    const trainerWorkloads = trainersData.map(trainer => {
        const assignmentCount = assignmentsData.filter(a => 
            a.trainerId && 
            a.trainerId._id && 
            trainer._id && 
            a.trainerId._id.toString() === trainer._id.toString()
        ).length;
        return {
            name: trainer.name ? trainer.name.split(' ')[0] : 'Unknown', // First name only
            assignments: assignmentCount
        };
    });
    
    workloadChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: trainerWorkloads.map(t => t.name),
            datasets: [{
                label: 'Assigned Units',
                data: trainerWorkloads.map(t => t.assignments),
                backgroundColor: '#3B82F6',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

window.HODTabs.analytics = {
    init() {
        updateAnalytics();
    }
};
