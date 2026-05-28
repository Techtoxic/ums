// tabs/students.js — deputy student management: table + pagination.
// NOTE: displayStudents is defined twice in the monolith (the second wins via
// hoisting); both are preserved verbatim to keep behaviour identical.
window.DeputyTabs = window.DeputyTabs || {};

// (verbatim from the monolith inline scripts)
        // Pagination state
        let studentsPagination = {
            currentPage: 1,
            itemsPerPage: 10,
            totalItems: 0,
            allItems: [],
            filteredItems: []
        };

        // Load students data
        async function loadStudents() {
            try {
                const response = await window.AUTH.fetch(`${API_BASE_URL}/students`);
                if (!response.ok) {
                    throw new Error('Failed to fetch students');
                }
                
                const students = await response.json();
                studentsPagination.allItems = students;
                studentsPagination.filteredItems = students;
                studentsPagination.totalItems = students.length;
                studentsPagination.currentPage = 1;
                
                displayStudents();
                updatePagination('students');
            } catch (error) {
                console.error('Error loading students:', error);
                document.getElementById('studentsTableBody').innerHTML = `
                    <tr>
                        <td colspan="5" class="px-6 py-4 text-center text-gray-500">
                            Error loading students: ${error.message}
                        </td>
                    </tr>
                `;
            }
        }

        // Display students with pagination
        function displayStudents() {
            const tbody = document.getElementById('studentsTableBody');
            const { currentPage, itemsPerPage, filteredItems } = studentsPagination;
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const currentStudents = filteredItems.slice(startIndex, endIndex);
            
            if (currentStudents.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="px-6 py-4 text-center text-gray-500">
                            No students found
                        </td>
                    </tr>
                `;
                return;
            }
            
            tbody.innerHTML = currentStudents.map(student => `
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <div class="flex-shrink-0 h-10 w-10">
                                <div class="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <i class="ri-user-line text-primary"></i>
                                </div>
                            </div>
                            <div class="ml-4">
                                <div class="text-sm font-medium text-gray-900 dark:text-white">${escapeHtml(student.name)}</div>
                                <div class="text-sm text-gray-500 dark:text-gray-400">${escapeHtml(student.admissionNumber)}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm text-gray-900 dark:text-white">${escapeHtml(student.course)}</div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">${escapeHtml(student.department)}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        ${escapeHtml(student.admissionType || 'walk-in')}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        Module ${student.module}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            Active
                        </span>
                    </td>
                </tr>
            `).join('');
        }

        // Update pagination controls
        function updatePagination(type) {
            const pagination = type === 'students' ? studentsPagination : trainersPagination;
            const containerId = type === 'students' ? 'studentsPagination' : 'trainersPagination';
            const container = document.getElementById(containerId);
            
            if (!container) return;
            
            const totalPages = Math.ceil(pagination.totalItems / pagination.itemsPerPage);
            const currentPage = pagination.currentPage;
            
            let paginationHTML = `
                <div class="flex items-center justify-between">
                    <div class="text-sm text-gray-700 dark:text-gray-300">
                        Showing ${(currentPage - 1) * pagination.itemsPerPage + 1} to ${Math.min(currentPage * pagination.itemsPerPage, pagination.totalItems)} of ${pagination.totalItems} results
                    </div>
                    <div class="flex items-center space-x-2">
                        <button onclick="changePage('${type}', 'prev')" ${currentPage === 1 ? 'disabled' : ''} 
                                class="px-3 py-1 text-sm border rounded-lg ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}">
                            Previous
                        </button>
            `;
            
            for (let i = 1; i <= totalPages; i++) {
                if (i === currentPage || i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                    paginationHTML += `
                        <button onclick="changePage('${escapeAttr(type)}', ${i})" 
                                class="px-3 py-1 text-sm border rounded-lg ${i === currentPage ? 'bg-primary text-white border-primary' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}">
                            ${i}
                        </button>
                    `;
                } else if (i === currentPage - 2 || i === currentPage + 2) {
                    paginationHTML += `<span class="px-2 text-gray-500">...</span>`;
                }
            }
            
            paginationHTML += `
                        <button onclick="changePage('${type}', 'next')" ${currentPage === totalPages ? 'disabled' : ''} 
                                class="px-3 py-1 text-sm border rounded-lg ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}">
                            Next
                        </button>
                    </div>
                </div>
            `;
            
            container.innerHTML = paginationHTML;
        }

        // Change page
        function changePage(type, direction) {
            const pagination = type === 'students' ? studentsPagination : trainersPagination;
            const totalPages = Math.ceil(pagination.totalItems / pagination.itemsPerPage);
            
            if (direction === 'prev' && pagination.currentPage > 1) {
                pagination.currentPage--;
            } else if (direction === 'next' && pagination.currentPage < totalPages) {
                pagination.currentPage++;
            } else if (typeof direction === 'number' && direction >= 1 && direction <= totalPages) {
                pagination.currentPage = direction;
            }
            
            if (type === 'students') {
                displayStudents();
                updatePagination('students');
            } else if (type === 'trainers') {
                displayTrainers();
                updatePagination('trainers');
            }
        }

        // Display students in table
        function displayStudents(students = null) {
            const tbody = document.getElementById('studentsTableBody');
            
            // Use pagination data if no students parameter provided
            if (!students) {
                students = studentsPagination.filteredItems || [];
            }
            
            if (students.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="px-6 py-4 text-center text-gray-500">
                            No students found
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = students.map(student => `
                <tr class="hover:bg-slate-50 dark:hover:bg-gray-700/50">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <div class="flex-shrink-0 h-10 w-10">
                                <div class="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <i class="ri-user-line text-primary"></i>
                                </div>
                            </div>
                            <div class="ml-4">
                                <div class="text-sm font-medium">${escapeHtml(student.name)}</div>
                                <div class="text-sm text-slate-500 dark:text-slate-400">${escapeHtml(student.admissionNumber)}</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm">${escapeHtml(student.course)}</div>
                        <div class="text-sm text-slate-500 dark:text-slate-400">${escapeHtml(student.department)}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            student.admissionType === 'KUCCPS' 
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        }">
                            ${student.admissionType === 'KUCCPS' ? 'KUCCPS' : 'Walk-in'}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm">Module ${student.module}</div>
                        <div class="text-sm text-slate-500 dark:text-slate-400">${escapeHtml(student.intake)} ${student.intakeYear}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-success/10 text-success">
                            Active
                        </span>
                    </td>
                </tr>
            `).join('');
        }

window.DeputyTabs.students = {
    init() { loadStudents(); }
};
