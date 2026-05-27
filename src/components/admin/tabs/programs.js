// tabs/programs.js — admin programs management.
window.AdminTabs = window.AdminTabs || {};

// (verbatim from adminDashboard.js)
async function displayPrograms(searchTerm = '') {
    const container = document.getElementById('programs-list');
    if (!container) {
        console.error('programs-list container not found');
        return;
    }

    try {
        if (allPrograms.length === 0) {
            await loadPrograms();
        }

        // Filter programs based on search term
        const filteredPrograms = allPrograms.filter(program => {
            const searchLower = searchTerm.toLowerCase();
            return program.name.toLowerCase().includes(searchLower) ||
                   (program.departmentName || '').toLowerCase().includes(searchLower);
        });

        container.innerHTML = `
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
                <h3 class="text-sm md:text-base font-bold text-gray-800 dark:text-white">All Programs (${filteredPrograms.length})</h3>
                <div class="flex gap-2 w-full sm:w-auto">
                    <input type="text" id="program-search" placeholder="Search programs..." 
                        value="${escapeAttr(searchTerm)}"
                        class="flex-1 sm:flex-none sm:w-48 px-2 py-1 text-xs border border-gray-300 rounded-md focus:ring-1 focus:ring-primary focus:border-primary">
                    <button class="bg-primary text-white px-2 py-1 text-xs rounded-md hover:bg-secondary transition whitespace-nowrap">
                        <i class="ri-add-line mr-1"></i><span class="hidden xs:inline">Add </span>Program
                    </button>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2" id="programs-grid">
                ${filteredPrograms.length === 0 ? `
                    <div class="col-span-full text-center py-8">
                        <i class="ri-search-line text-3xl text-gray-400 mb-2"></i>
                        <p class="text-xs text-gray-500">No programs found matching "${escapeHtml(searchTerm)}"</p>
                    </div>
                ` : filteredPrograms.map(program => `
                    <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-2 hover:shadow-lg transition">
                        <h4 class="font-semibold text-xs text-gray-800 dark:text-white mb-1">${escapeHtml(program.name)}</h4>
                        <p class="text-xs text-gray-600 dark:text-gray-400 mb-2">${escapeHtml(program.departmentName)}</p>
                        <div class="flex items-center justify-between">
                            <span class="text-sm font-bold text-primary">${formatCurrency(program.programCost)}</span>
                            <span class="text-xs text-gray-500">per year</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        // Add event listener for real-time search
        const searchInput = document.getElementById('program-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                displayPrograms(e.target.value);
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
