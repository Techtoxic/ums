// tabs/promotion.js — student promotion: eligibility list + promote actions.
window.RegistrarTabs = window.RegistrarTabs || {};

// (verbatim from the monolith inline scripts)
        // Student Promotion Functions
        let promotionStudents = [];

        // Show promotion section (legacy function)
        function showPromotionSection() {
            switchTab('promotion');
        }

        // Load students for promotion
        async function loadPromotionStudents() {
            try {
                console.log('Loading promotion students...');
                const levelFilter = document.getElementById('levelFilter').value;
                const deptFilter = document.getElementById('deptFilter').value;
                
                console.log('Filters:', { levelFilter, deptFilter });
                
                const response = await window.AUTH.fetch(`${API_BASE_URL}/students`);
                if (!response.ok) {
                    throw new Error('Failed to fetch students');
                }
                
                const students = await response.json();
                console.log('Fetched students:', students.length);
                
                // Filter students based on criteria
                let filteredStudents = students.filter(student => {
                    // Check if student is eligible for promotion
                    const isEligible = isStudentEligibleForPromotion(student);
                    
                    // Apply level filter
                    const levelMatch = levelFilter === 'all' || student.course.includes(`_${levelFilter}`);
                    
                    // Apply department filter
                    const deptMatch = deptFilter === 'all' || student.department === deptFilter;
                    
                    return isEligible && levelMatch && deptMatch;
                });
                
                promotionStudents = filteredStudents;
                displayPromotionStudents(filteredStudents);
                
                showToast(`Loaded ${filteredStudents.length} students eligible for promotion`, 'success');
            } catch (error) {
                console.error('Error loading promotion students:', error);
                showToast('Failed to load students for promotion', 'error');
            }
        }

        // Check if student is eligible for promotion
        function isStudentEligibleForPromotion(student) {
            const courseCode = student.course;
            const currentYear = student.year;
            
            // Extract level from course code
            const levelMatch = courseCode.match(/_(\d+)$/);
            if (!levelMatch) return false;
            
            const level = parseInt(levelMatch[1]);
            const maxYear = level === 5 ? 2 : 3; // Level 5 = 2 years, Level 6 = 3 years
            
            // Student is eligible if they haven't reached max year
            return currentYear < maxYear;
        }

        // Display students in promotion table
        function displayPromotionStudents(students) {
            console.log('Displaying promotion students:', students.length);
            const tbody = document.getElementById('promotionTableBody');
            
            if (!tbody) {
                console.error('promotionTableBody element not found!');
                return;
            }
            
            if (students.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" class="px-6 py-4 text-center text-gray-500">
                            No students found matching the criteria
                        </td>
                    </tr>
                `;
                return;
            }
            
            tbody.innerHTML = students.map(student => {
                const courseCode = student.course;
                const levelMatch = courseCode.match(/_(\d+)$/);
                const level = levelMatch ? levelMatch[1] : 'Unknown';
                const maxYear = level === '5' ? 2 : 3;
                const nextYear = student.year + 1;
                const isEligible = nextYear <= maxYear;
                
                return `
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td class="px-6 py-4 whitespace-nowrap">
                            <input type="checkbox" class="student-checkbox rounded border-gray-300" value="${escapeAttr(student._id)}" ${isEligible ? '' : 'disabled'}>
                        </td>
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
                            <div class="text-sm text-gray-900 dark:text-white">${escapeHtml(courseCode.replace(/_/g, ' ').toUpperCase())}</div>
                            <div class="text-sm text-gray-500 dark:text-gray-400">${escapeHtml(student.department)}</div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            Year ${student.year}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            Level ${level}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            Year ${maxYear}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                            ${isEligible ? 
                                `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                    Eligible
                                </span>` : 
                                `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                                    Max Year Reached
                                </span>`
                            }
                        </td>
                    </tr>
                `;
            }).join('');
        }

        // Toggle all students selection
        function toggleAllStudents() {
            const selectAll = document.getElementById('selectAll');
            const checkboxes = document.querySelectorAll('.student-checkbox:not([disabled])');
            
            checkboxes.forEach(checkbox => {
                checkbox.checked = selectAll.checked;
            });
        }

        // Promote all selected students
        async function promoteAllStudents() {
            const selectedCheckboxes = document.querySelectorAll('.student-checkbox:checked');
            
            if (selectedCheckboxes.length === 0) {
                showToast('Please select students to promote', 'warning');
                return;
            }
            
            const selectedStudentIds = Array.from(selectedCheckboxes).map(cb => cb.value);
            const studentsToPromote = promotionStudents.filter(s => selectedStudentIds.includes(s._id));
            
            // Show progress
            document.getElementById('promotionProgress').classList.remove('hidden');
            const progressBar = document.getElementById('progressBar');
            const progressText = document.getElementById('progressText');
            
            let successCount = 0;
            let errorCount = 0;
            
            for (let i = 0; i < studentsToPromote.length; i++) {
                const student = studentsToPromote[i];
                const progress = ((i + 1) / studentsToPromote.length) * 100;
                
                progressBar.style.width = `${progress}%`;
                progressText.textContent = `${i + 1} of ${studentsToPromote.length} students processed`;
                
                try {
                    const response = await window.AUTH.fetch(`${API_BASE_URL}/students/${student._id}`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            year: student.year + 1
                        })
                    });
                    
                    if (response.ok) {
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } catch (error) {
                    console.error(`Error promoting student ${student.name}:`, error);
                    errorCount++;
                }
                
                // Small delay to show progress
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Hide progress
            document.getElementById('promotionProgress').classList.add('hidden');
            
            // Show results
            if (successCount > 0) {
                showToast(`Successfully promoted ${successCount} students`, 'success');
            }
            if (errorCount > 0) {
                showToast(`${errorCount} students failed to promote`, 'error');
            }
            
            // Refresh the list
            loadPromotionStudents();
        }

window.RegistrarTabs.promotion = {
    init() {
        loadPromotionStudents();
    }
};
