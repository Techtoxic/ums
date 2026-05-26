// tabs/management.js — student management: table, pagination, search, view/edit.
// The viewStudentModal / editStudentModal markup ships inside management.html.
window.RegistrarTabs = window.RegistrarTabs || {};

// (verbatim from the monolith inline scripts)
        // Function to fetch and display students
        async function fetchAndDisplayStudents() {
            try {
                const response = await window.AUTH.fetch(`${API_BASE_URL}/students`);
                if (!response.ok) {
                    let errorMessage = 'Failed to fetch students';
                    try {
                        const errorData = await response.json();
                        errorMessage = errorData.message || errorMessage;
                    } catch (e) {
                        errorMessage += ` (Status: ${response.status})`;
                    }
                    throw new Error(errorMessage);
                }
                const students = await response.json();
                if (!Array.isArray(students) || !students.length) {
                    throw new Error('No students found or invalid data format');
                }
                displayStudents(students);
            } catch (error) {
                console.error('Error fetching students:', error);
                showToast(error.message, 'error');
            }
        }

        // Department mapping object
        const departmentMapping = {
            applied_science: 'Applied Science Department',
            agriculture: 'Agriculture Department',
            building_civil: 'Building and Civil Department',
            electromechanical: 'Electromechanical Department',
            hospitality: 'Hospitality Department',
            business_liberal: 'Business and Liberal Studies',
            computing_informatics: 'Computing and Informatics'
        };

        // Global pagination state for students
        let studentsState = {
            currentPage: 1,
            itemsPerPage: 6,
            totalStudents: 0,
            allStudents: [],
            filteredStudents: []
        };

        // Function to display students in the table with pagination
        function displayStudents(students) {
            // Update global state
            studentsState.allStudents = students;
            studentsState.filteredStudents = students;
            studentsState.totalStudents = students.length;
            studentsState.currentPage = 1; // Reset to first page
            
            renderStudentsPage();
        }

        // Render current page of students
        function renderStudentsPage() {
            const tbody = document.querySelector('table tbody');
            tbody.innerHTML = '';
            
            const { currentPage, itemsPerPage, filteredStudents } = studentsState;
            const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const currentStudents = filteredStudents.slice(startIndex, endIndex);
            
            // Create table rows for current page
            currentStudents.forEach(student => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-700';
                
                // Get department from course configuration
                const courseInfo = courseConfig[student.course] || {};
                const departmentName = departmentMapping[courseInfo.department] || 'Not Assigned';
                
                // Convert course name to display format
                const departmentDisplay = departmentMapping[student.department] || 'Not Assigned';

                tr.innerHTML = `
                    <td class="px-3 py-4 text-sm">${escapeHtml(student.admissionNumber || '')}</td>
                    <td class="px-3 py-4 text-sm">${escapeHtml(student.name || '')}</td>
                    <td class="px-3 py-4 text-sm">${departmentDisplay}</td>
                    <td class="px-3 py-4 text-sm">${student.year || ''}</td>
                    <td class="px-3 py-4 text-sm">
                        <span class="px-2 py-1 text-xs font-medium ${student.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'} rounded-full">
                            ${escapeHtml(student.status || 'Active')}
                        </span>
                    </td>
                    <td class="px-3 py-4 text-sm space-x-2">
                        <button onclick="viewStudent('${escapeAttr(student._id)}')" class="text-primary hover:text-secondary">View</button>
                        <button onclick="editStudent('${escapeAttr(student._id)}')" class="text-primary hover:text-secondary">Edit</button>
                    </td>
                `;
                
                tbody.appendChild(tr);
            });

            // Update pagination controls
            updatePaginationControls();
        }

        // Update pagination controls
        function updatePaginationControls() {
            const { currentPage, itemsPerPage, filteredStudents } = studentsState;
            const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = Math.min(startIndex + itemsPerPage, filteredStudents.length);

            // Update pagination info
            const paginationInfo = document.getElementById('pagination-info');
            if (paginationInfo) {
                if (filteredStudents.length === 0) {
                    paginationInfo.textContent = 'No students found';
                } else {
                    paginationInfo.textContent = `Showing ${startIndex + 1}-${endIndex} of ${filteredStudents.length} students`;
                }
            }

            // Update previous button
            const prevBtn = document.getElementById('prev-page-btn');
            if (prevBtn) {
                prevBtn.disabled = currentPage <= 1;
            }

            // Update next button
            const nextBtn = document.getElementById('next-page-btn');
            if (nextBtn) {
                nextBtn.disabled = currentPage >= totalPages;
            }

            // Update page numbers
            const pageNumbersContainer = document.getElementById('page-numbers');
            if (pageNumbersContainer && totalPages > 1) {
                let pageButtonsHTML = '';
                
                // Calculate which page numbers to show
                const maxButtons = 5;
                let startPage, endPage;
                
                if (totalPages <= maxButtons) {
                    startPage = 1;
                    endPage = totalPages;
                } else if (currentPage <= 3) {
                    startPage = 1;
                    endPage = maxButtons;
                } else if (currentPage >= totalPages - 2) {
                    startPage = totalPages - maxButtons + 1;
                    endPage = totalPages;
                } else {
                    startPage = currentPage - 2;
                    endPage = currentPage + 2;
                }

                for (let i = startPage; i <= endPage; i++) {
                    const isActive = i === currentPage;
                    pageButtonsHTML += `
                        <button 
                            onclick="navigateStudentsPage(${i})" 
                            class="w-8 h-8 text-sm font-medium rounded-lg transition-colors ${
                                isActive 
                                    ? 'bg-primary text-white' 
                                    : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                            }"
                        >
                            ${i}
                        </button>
                    `;
                }
                
                pageNumbersContainer.innerHTML = pageButtonsHTML;
            } else if (pageNumbersContainer) {
                pageNumbersContainer.innerHTML = '';
            }

            // Show/hide pagination container
            const paginationContainer = document.getElementById('pagination-container');
            if (paginationContainer) {
                paginationContainer.style.display = totalPages > 1 ? 'flex' : 'none';
            }
        }

        // Navigate students pagination
        function navigateStudentsPage(direction) {
            const { currentPage, filteredStudents, itemsPerPage } = studentsState;
            const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);

            if (direction === 'prev' && currentPage > 1) {
                studentsState.currentPage = currentPage - 1;
            } else if (direction === 'next' && currentPage < totalPages) {
                studentsState.currentPage = currentPage + 1;
            } else if (typeof direction === 'number' && direction >= 1 && direction <= totalPages) {
                studentsState.currentPage = direction;
            }

            renderStudentsPage();
        }

        // Function to handle student search with pagination
        function handleSearch(event) {
            const searchTerm = event.target.value.toLowerCase();
            
            if (searchTerm === '') {
                // Reset to show all students
                studentsState.filteredStudents = studentsState.allStudents;
            } else {
                // Filter students by search term
                studentsState.filteredStudents = studentsState.allStudents.filter(student => {
                    const studentText = `${student.name} ${student.admissionNumber} ${student.course} ${student.department}`.toLowerCase();
                    return studentText.includes(searchTerm);
                });
            }
            
            // Reset to first page and re-render
            studentsState.currentPage = 1;
            renderStudentsPage();
        }

        // Function to handle department filter with pagination
        function handleDepartmentFilter(event) {
            const department = event.target.value;
            
            if (department === 'all') {
                studentsState.filteredStudents = studentsState.allStudents;
            } else {
                studentsState.filteredStudents = studentsState.allStudents.filter(student => {
                    return student.department === department;
                });
            }
            
            // Reset to first page and re-render
            studentsState.currentPage = 1;
            renderStudentsPage();
        }

        // Function to handle year filter with pagination
        function handleYearFilter(event) {
            const year = event.target.value;
            
            if (year === 'all') {
                studentsState.filteredStudents = studentsState.allStudents;
            } else {
                studentsState.filteredStudents = studentsState.allStudents.filter(student => {
                    return student.year.toString() === year;
                });
            }
            
            // Reset to first page and re-render
            studentsState.currentPage = 1;
            renderStudentsPage();
        }

        // Function to view student details
        async function viewStudent(studentId) {
            try {
                const response = await window.AUTH.fetch(`${API_BASE_URL}/students/${studentId}`);
                if (!response.ok) throw new Error('Failed to fetch student details');
                const student = await response.json();
                
                // Format course name properly
                function formatCourseName(courseCode) {
                    // Course to Program mapping for proper display names
                    const courseToProgram = {
                        'applied_biology_6': 'Applied Biology Level 6',
                        'analytical_chemistry_6': 'Analytical Chemistry Level 6',
                        'science_lab_technology_5': 'Science Lab Technology Level 5',
                        'science_laboratory_technology_5': 'Science Lab Technology Level 5',
                        'general_agriculture_4': 'General Agriculture Level 4',
                        'sustainable_agriculture_5': 'Sustainable Agriculture Level 5',
                        'agricultural_extension_6': 'Agricultural Extension Level 6',
                        'building_technician_4': 'Building Technician Level 4',
                        'building_technician_6': 'Building Technician Level 6',
                        'civil_engineering_6': 'Civil Engineering Level 6',
                        'plumbing_4': 'Plumbing Level 4',
                        'plumbing_5': 'Plumbing Level 5',
                        'electrical_engineering_4': 'Electrical Engineering Level 4',
                        'electrical_engineering_5': 'Electrical Engineering Level 5',
                        'electrical_engineering_6': 'Electrical Engineering Level 6',
                        'automotive_engineering_5': 'Automotive Engineering Level 5',
                        'automotive_engineering_6': 'Automotive Engineering Level 6',
                        'food_beverage_4': 'Food and Beverage Level 4',
                        'food_beverage_5': 'Food & Beverage Level 5',
                        'food_beverage_6': 'Food & Beverage Level 6',
                        'food_and_beverage_4': 'Food and Beverage Level 4',
                        'food_and_beverage_5': 'Food & Beverage Level 5',
                        'food_and_beverage_6': 'Food & Beverage Level 6',
                        'fashion_design_4': 'Fashion & Design Level 4',
                        'fashion_design_5': 'Fashion and Design Level 5',
                        'fashion_design_6': 'Fashion and Design Level 6',
                        'fashion_and_design_4': 'Fashion & Design Level 4',
                        'fashion_and_design_5': 'Fashion and Design Level 5',
                        'fashion_and_design_6': 'Fashion and Design Level 6',
                        'hairdressing_4': 'Hairdressing Level 4',
                        'hairdressing_5': 'Hairdressing Level 5',
                        'hairdressing_6': 'Hairdressing Level 6',
                        'tourism_management_5': 'Tourism Management Level 5',
                        'tourism_management_6': 'Tourism Management Level 6',
                        'social_work_5': 'Social Work Level 5',
                        'social_work_6': 'Social Work Level 6',
                        'office_administration_5': 'Office Administration Level 5',
                        'office_administration_6': 'Office Administration Level 6',
                        'ict_5': 'ICT Level 5',
                        'ict_6': 'ICT Level 6',
                        'information_science_5': 'Information Science Level 5',
                        'information_science_6': 'Information Science Level 6'
                    };
                    
                    // First try to get the proper program name from our mapping
                    const programName = courseToProgram[courseCode];
                    if (programName) {
                        return programName;
                    }
                    
                    // If not found in mapping, format the course code nicely
                    if (!courseCode) return 'Unknown Course';
                    
                    // Replace underscores with spaces and capitalize
                    return courseCode
                        .split('_')
                        .map(word => {
                            // Handle numbers at the end (convert to "Level X")
                            if (/^\d+$/.test(word)) {
                                return `Level ${word}`;
                            }
                            // Capitalize first letter of each word
                            return word.charAt(0).toUpperCase() + word.slice(1);
                        })
                        .join(' ');
                }
                
                const courseName = formatCourseName(student.course);
                
                // Populate modal content
                const content = document.getElementById('studentDetailsContent');
                content.innerHTML = `
                    <div class="space-y-3">
                        <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                            <h4 class="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-2 flex items-center">
                                <i class="ri-user-line mr-1"></i>Personal Information
                            </h4>
                            <div class="space-y-1 text-sm">
                                <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Name:</span> <span class="font-medium">${escapeHtml(student.name)}</span></div>
                                <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">ID Number:</span> <span class="font-medium">${escapeHtml(student.idNumber)}</span></div>
                                <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Phone:</span> <span class="font-medium">${escapeHtml(student.phoneNumber)}</span></div>
                                <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">KCSE Grade:</span> <span class="font-medium">${escapeHtml(student.kcseGrade)}</span></div>
                            </div>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                            <h4 class="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-2 flex items-center">
                                <i class="ri-graduation-cap-line mr-1"></i>Academic Information
                            </h4>
                            <div class="space-y-1 text-sm">
                                <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Admission Number:</span> <span class="font-medium">${escapeHtml(student.admissionNumber)}</span></div>
                                <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Course:</span> <span class="font-medium">${escapeHtml(courseName)}</span></div>
                                <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Department:</span> <span class="font-medium">${escapeHtml(departmentMapping[student.department] || student.department)}</span></div>
                                <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Year:</span> <span class="font-medium">Year ${student.year}</span></div>
                                <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-400">Registered:</span> <span class="font-medium">${new Date(student.createdAt).toLocaleDateString()}</span></div>
                            </div>
                        </div>
                    </div>
                `;
                
                // Show modal with animation
                const modal = document.getElementById('viewStudentModal');
                modal.classList.remove('hidden');
                modal.classList.add('flex');
                setTimeout(() => {
                    modal.querySelector('.transform').classList.remove('scale-95');
                    modal.querySelector('.transform').classList.add('scale-100');
                }, 10);
                document.body.classList.add('menu-open');
            } catch (error) {
                showToast(error.message, 'error');
            }
        }

        // Function to edit student details
        async function editStudent(studentId) {
            try {
                const response = await window.AUTH.fetch(`${API_BASE_URL}/students/${studentId}`);
                if (!response.ok) throw new Error('Failed to fetch student details');
                const student = await response.json();
                
                // Populate edit form
                document.getElementById('editStudentId').value = student._id;
                document.getElementById('editName').value = student.name;
                document.getElementById('editIdNumber').value = student.idNumber;
                document.getElementById('editPhone').value = student.phoneNumber;
                document.getElementById('editYear').value = student.year;
                document.getElementById('editCourse').value = Object.values(courseConfig).find(c => c.code === student.course?.split('_')[0])?.name || student.course;
                
                // Show modal with animation
                const modal = document.getElementById('editStudentModal');
                modal.classList.remove('hidden');
                modal.classList.add('flex');
                setTimeout(() => {
                    modal.querySelector('.transform').classList.remove('scale-95');
                    modal.querySelector('.transform').classList.add('scale-100');
                }, 10);
                document.body.classList.add('menu-open');
            } catch (error) {
                showToast(error.message, 'error');
            }
        }

        // Close view modal
        function closeViewModal() {
            const modal = document.getElementById('viewStudentModal');
            modal.querySelector('.transform').classList.remove('scale-100');
            modal.querySelector('.transform').classList.add('scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }, 200);
            document.body.classList.remove('menu-open');
        }

        // Close edit modal
        function closeEditModal() {
            const modal = document.getElementById('editStudentModal');
            modal.querySelector('.transform').classList.remove('scale-100');
            modal.querySelector('.transform').classList.add('scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }, 200);
            document.body.classList.remove('menu-open');
        }

        // Handle edit student form submission
        async function handleEditStudent(event) {
            event.preventDefault();
            const formData = new FormData(event.target);
            const studentId = formData.get('studentId');
            
            const updateData = {
                name: formData.get('name'),
                idNumber: formData.get('idNumber'),
                phoneNumber: formData.get('phoneNumber'),
                year: parseInt(formData.get('year'))
            };

            try {
                const response = await window.AUTH.fetch(`${API_BASE_URL}/students/${studentId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(updateData)
                });

                const data = await response.json();

                if (response.ok) {
                    showToast('Student updated successfully!');
                    closeEditModal();
                    fetchAndDisplayStudents(); // Refresh the list
                } else {
                    throw new Error(data.message || 'Failed to update student');
                }
            } catch (error) {
                showToast(error.message, 'error');
            }
        }

window.RegistrarTabs.management = {
    init() {
        fetchAndDisplayStudents();
        // Wire filters + search once (the partial is cached across revisits, so the
        // nodes persist — re-wiring would stack duplicate listeners).
        if (window.__regMgmtWired) return;
        window.__regMgmtWired = true;
        const departmentFilter = document.getElementById('departmentFilter');
        const yearFilter = document.getElementById('yearFilter');
        if (departmentFilter) departmentFilter.addEventListener('change', handleDepartmentFilter);
        if (yearFilter) yearFilter.addEventListener('change', handleYearFilter);
        const searchInput = document.querySelector('input[placeholder="Search students..."]');
        if (searchInput) searchInput.addEventListener('input', handleSearch);
    }
};
