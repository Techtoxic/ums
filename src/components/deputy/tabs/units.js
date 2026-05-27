// tabs/units.js — deputy unit management.
window.DeputyTabs = window.DeputyTabs || {};

// (verbatim from the monolith inline scripts)
        // Load units data
        async function loadUnitsData() {
            try {
                const response = await window.AUTH.fetch(`${API_BASE_URL}/units`);
                if (!response.ok) {
                    throw new Error('Failed to fetch units');
                }
                
                const data = await response.json();
                const units = data.units || data;
                displayUnits(units);
            } catch (error) {
                console.error('Error loading units:', error);
            }
        }

        // Display units
        function displayUnits(units) {
            const content = document.getElementById('content-units');
            if (!content) return;

            const unitsByCourse = {};
            units.forEach(unit => {
                if (!unitsByCourse[unit.courseCode]) {
                    unitsByCourse[unit.courseCode] = [];
                }
                unitsByCourse[unit.courseCode].push(unit);
            });

            content.innerHTML = `
                <div class="space-y-6">
                    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                        <h2 class="text-xl font-semibold mb-6">All Units by Course</h2>
                        ${Object.keys(unitsByCourse).map(courseCode => `
                            <div class="mb-8">
                                <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">${escapeHtml(courseCode)}</h3>
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    ${unitsByCourse[courseCode].map(unit => `
                                        <div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary/50 transition-colors">
                                            <h4 class="font-medium text-gray-900 dark:text-white">${escapeHtml(unit.unitName)}</h4>
                                            <p class="text-sm text-gray-500 dark:text-gray-400">${escapeHtml(unit.unitCode)}</p>
                                            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">${unit.creditHours || 0} Credit Hours</p>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

window.DeputyTabs.units = {
    init() { loadUnitsData(); }
};
