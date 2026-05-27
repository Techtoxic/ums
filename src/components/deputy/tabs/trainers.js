// tabs/trainers.js — deputy trainer management: table.
window.DeputyTabs = window.DeputyTabs || {};

// (verbatim from the monolith inline scripts)
        // Load trainers data
        async function loadTrainersData() {
            try {
                const response = await window.AUTH.fetch(`${API_BASE_URL}/trainers/all-departments`);
                if (!response.ok) {
                    throw new Error('Failed to fetch trainers data');
                }
                
                const data = await response.json();
                const trainers = data.trainers || [];
                
                // Load additional data for each trainer
                const trainersWithData = await Promise.all(trainers.map(async (trainer) => {
                    try {
                        // Get students for this trainer
                        const studentsResponse = await window.AUTH.fetch(`${API_BASE_URL}/trainers/${trainer._id}/students`);
                        let studentCount = 0;
                        if (studentsResponse.ok) {
                            const studentsData = await studentsResponse.json();
                            studentCount = Object.values(studentsData.students || {}).flat().length;
                        }
                        
                        // Get assignments for this trainer
                        const assignmentsResponse = await window.AUTH.fetch(`${API_BASE_URL}/trainers/${trainer._id}/assignments`);
                        let assignedUnits = 0;
                        if (assignmentsResponse.ok) {
                            const assignmentsData = await assignmentsResponse.json();
                            assignedUnits = assignmentsData.assignments?.length || 0;
                        }
                        
                        return {
                            ...trainer,
                            studentCount,
                            assignedUnits
                        };
                    } catch (error) {
                        console.error(`Error loading data for trainer ${trainer._id}:`, error);
                        return {
                            ...trainer,
                            studentCount: 0,
                            assignedUnits: 0
                        };
                    }
                }));
                
                displayTrainers(trainersWithData);
            } catch (error) {
                console.error('Error loading trainers data:', error);
                document.getElementById('trainersTableBody').innerHTML = `
                    <tr>
                        <td colspan="5" class="px-6 py-4 text-center text-gray-500">
                            Error loading trainers: ${error.message}
                        </td>
                    </tr>
                `;
            }
        }

        // Display trainers in table
        function displayTrainers(trainers) {
            const tbody = document.getElementById('trainersTableBody');
            
            if (trainers.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="px-6 py-4 text-center text-gray-500">
                            No trainers found
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = trainers.map(trainer => `
                <tr class="hover:bg-slate-50 dark:hover:bg-gray-700/50">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <div class="flex-shrink-0 h-10 w-10">
                                <div class="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <i class="ri-user-line text-primary"></i>
                                </div>
                            </div>
                            <div class="ml-4">
                                <div class="text-sm font-medium">${escapeHtml(trainer.name)}</div>
                                <div class="text-sm text-slate-500 dark:text-slate-400">${escapeHtml(trainer.email)}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm">${escapeHtml(trainer.department)}</div>
                        <div class="text-sm text-slate-500 dark:text-slate-400">${escapeHtml(trainer.role)}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm">${trainer.assignedUnits || 0}</div>
                        <div class="text-sm text-slate-500 dark:text-slate-400">Units assigned</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm">${trainer.studentCount || 0}</div>
                        <div class="text-sm text-slate-500 dark:text-slate-400">Students enrolled</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-success/10 text-success">
                            Active
                        </span>
                    </td>
                </tr>
            `).join('');
        }

window.DeputyTabs.trainers = {
    init() { loadTrainersData(); }
};
