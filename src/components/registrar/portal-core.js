// portal-core.js — shared base + bootstrap for the registrar portal SPA.
//
// Folds in the monolith's shell-chrome / global-modal JS (the topbar "Add
// Student" + "Promote Students" + admission-letter flows, the mobile sidebar
// helpers, the legacy dark-mode helpers) plus a new bootstrap that loads the
// registrar identity once and hands off to the History-API router. Every
// function is a verbatim move from RegistrarDashboardNew.html (comments +
// indentation preserved); only updateIdentityUI() and the DOMContentLoaded
// bootstrap at the bottom are new orchestration.
//
// Load order: auth.js -> dashboard-theme.js -> config.js -> exportUtils.js ->
// portal-core.js -> portal-router.js -> tab modules.


// ============================================================
// Global modal + admission flows (verbatim from inline block 2)
// ============================================================

        function openAdmissionModal() {
            const modal = document.getElementById('admissionModal');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            modal.style.display = 'flex';
            document.body.classList.add('menu-open');
            document.body.style.overflow = 'hidden';
            // Populate course + department dropdowns from the DB-backed catalog.
            if (window.Catalog) {
                window.Catalog.ready().then(() => {
                    window.Catalog.populateCourseSelect(document.getElementById('course'), { grouped: true, blankLabel: 'Select Course' });
                    window.Catalog.populateDepartmentSelect(document.getElementById('department'), { allLabel: 'Department will be auto-selected', includeAll: true });
                });
            }
            // Reset grade dropdown until a course is picked, then fetch the
            // next admission number for the preview field.
            populateGradeDropdown(null);
            refreshAdmissionNumberPreview();
        }

        function closeAdmissionModal() {
            const modal = document.getElementById('admissionModal');
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            modal.style.display = 'none';
            document.body.classList.remove('menu-open');
            document.body.style.overflow = 'auto';
        }

        // Promotion Modal Functions
        function showPromotionModal() {
            const modal = document.getElementById('promotionModal');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }

        function closePromotionModal() {
            const modal = document.getElementById('promotionModal');
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }

        // Load students for modal promotion
        async function loadModalPromotionStudents() {
            try {
                const levelFilter = document.getElementById('modalLevelFilter').value;
                const deptFilter = document.getElementById('modalDeptFilter').value;

                const response = await window.AUTH.fetch(`${API_BASE_URL}/students`);
                if (!response.ok) {
                    throw new Error('Failed to fetch students');
                }

                const students = await response.json();

                // Filter by level + department, but show ALL students (eligible or not) so
                // the registrar can see who is capped vs promotable.
                const filteredStudents = students.filter(student => {
                    const level = extractLevelFromCourse(student.course);
                    const levelMatch = !levelFilter || levelFilter === 'all' || String(level) === String(levelFilter);
                    const deptMatch = !deptFilter || deptFilter === 'all' || student.department === deptFilter;
                    return levelMatch && deptMatch;
                });

                displayModalPromotionStudents(filteredStudents);
            } catch (error) {
                console.error('Error loading promotion students:', error);
                showToast('Error loading students: ' + error.message, 'error');
            }
        }

        // Display students in modal promotion table
        function displayModalPromotionStudents(students) {
            console.log('Displaying modal promotion students:', students.length);
            const tbody = document.getElementById('modalPromotionTableBody');
            
            if (!tbody) {
                console.error('modalPromotionTableBody element not found!');
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
                const level = extractLevelFromCourse(student.course);
                const currentModule = Number(student.module || 0);
                const maxModule = MAX_MODULE_BY_LEVEL[level] || 0;
                const isEligible = currentModule >= 1 && currentModule < maxModule;
                const nextModule = currentModule + 1;

                return `
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td class="px-6 py-4 whitespace-nowrap">
                            <input type="checkbox" class="student-checkbox rounded border-gray-300" value="${escapeAttr(student._id)}" ${isEligible ? '' : 'disabled'}>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                            <div class="flex items-center">
                                <div class="flex-shrink-0 h-10 w-10">
                                    <div class="h-10 w-10 rounded-full bg-primary flex items-center justify-center">
                                        <span class="text-sm font-medium text-white">${escapeHtml((student.name || '?').charAt(0))}</span>
                                    </div>
                                </div>
                                <div class="ml-4">
                                    <div class="text-sm font-medium text-gray-900 dark:text-white">${escapeHtml(student.name)}</div>
                                    <div class="text-sm text-gray-500 dark:text-gray-400">${escapeHtml(student.admissionNumber)}</div>
                                </div>
                            </div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            ${escapeHtml(formatCourseName(student.course) || '')}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            Module ${currentModule || '-'}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            Level ${level || 'Unknown'}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            ${maxModule || '-'}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                            ${isEligible ?
                                `<span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" title="Will be promoted to Module ${nextModule}">Eligible → Module ${nextModule}</span>` :
                                '<span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Max Module Reached</span>'
                            }
                        </td>
                    </tr>
                `;
            }).join('');
        }

        // Promote all selected students in modal
        async function promoteAllModalStudents() {
            const checkboxes = document.querySelectorAll('.student-checkbox:checked');
            if (checkboxes.length === 0) {
                showToast('Please select students to promote', 'error');
                return;
            }

            const studentIds = Array.from(checkboxes).map(cb => cb.value);
            const progressDiv = document.getElementById('modalPromotionProgress');
            const progressBar = document.getElementById('modalProgressBar');
            const progressText = document.getElementById('modalProgressText');

            progressDiv.classList.remove('hidden');
            progressText.textContent = 'Starting promotion...';

            let successCount = 0;
            let errorCount = 0;

            for (let i = 0; i < studentIds.length; i++) {
                const studentId = studentIds[i];
                const progress = ((i + 1) / studentIds.length) * 100;
                progressBar.style.width = `${progress}%`;
                progressText.textContent = `Promoting student ${i + 1} of ${studentIds.length}...`;

                try {
                    const getResponse = await window.AUTH.fetch(`${API_BASE_URL}/students/${studentId}`);
                    if (!getResponse.ok) {
                        throw new Error('Failed to fetch student data');
                    }
                    const student = await getResponse.json();
                    const currentModule = Number(student.module || 0);
                    const level = extractLevelFromCourse(student.course);
                    const cap = MAX_MODULE_BY_LEVEL[level];
                    if (!cap || currentModule >= cap) {
                        errorCount++;
                        continue;
                    }

                    const response = await window.AUTH.fetch(`${API_BASE_URL}/students/${studentId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ module: currentModule + 1 })
                    });

                    if (response.ok) {
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } catch (error) {
                    console.error('Error promoting student:', error);
                    errorCount++;
                }

                await new Promise(resolve => setTimeout(resolve, 100));
            }

            progressText.textContent = `Promotion complete! ${successCount} successful, ${errorCount} errors`;
            
            if (successCount > 0) {
                showToast(`Successfully promoted ${successCount} students`, 'success');
                // Reload students
                loadModalPromotionStudents();
            }

            if (errorCount > 0) {
                showToast(`${errorCount} students failed to promote`, 'error');
            }
        }

        // Toast Notification Function
        function showToast(message, type = 'success') {
            const toast = document.createElement('div');
            toast.className = `p-4 rounded-lg shadow-lg text-white mb-4 transform transition-all duration-300 translate-y-0 opacity-100 ${
                type === 'success' ? 'bg-success' : 'bg-danger'
            }`;
            toast.innerHTML = `
                <div class="flex items-center gap-2">
                    <i class="${type === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'}"></i>
                    <span>${escapeHtml(message)}</span>
                </div>
            `;
            
            document.getElementById('toastContainer').appendChild(toast);
            
            // Animate and remove toast after 3 seconds
            setTimeout(() => {
                toast.classList.add('translate-y-2', 'opacity-0');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        // ---------------------------------------------------------------
        // Shared registrar helpers — grade rules, module caps, level parsing.
        // Must match the backend defaults in src/utils/studentHelpers.js.
        // ---------------------------------------------------------------
        const MAX_MODULE_BY_LEVEL = { 3: 1, 4: 2, 5: 4, 6: 6 };
        // Grade dropdown order: E, KCPE, then progressively higher KCSE grades.
        const GRADE_DROPDOWN_ORDER = ['E', 'KCPE', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+'];
        const ALLOWED_GRADES_BY_LEVEL = {
            3: ['KCPE'],
            4: ['E', 'D-'],
            5: ['D', 'D+'],
            6: ['C-', 'C', 'C+', 'B-', 'B', 'B+'],
        };

        // Course identifiers are program CODES (e.g. 'GA5', 'EE6'): the level is the
        // trailing digit. Also tolerates legacy snake keys like 'electrical_engineering_6'.
        function extractLevelFromCourse(course) {
            if (!course) return null;
            const m = String(course).match(/(\d+)$/);
            if (!m) return null;
            const n = parseInt(m[1], 10);
            return Number.isFinite(n) ? n : null;
        }

        function getAllowedGradesForLevel(level) {
            const list = ALLOWED_GRADES_BY_LEVEL[Number(level)];
            return list ? list.slice() : [];
        }

        // Handle course selection: auto-fill department, repopulate the grade
        // dropdown for the selected level, and preview the next admission #.
        // The course <select> value is a program CODE; the matching program (with
        // its department + level) comes from the DB-backed Catalog (Rule 7).
        function handleCourseSelection() {
            const courseSelect = document.getElementById('course');
            const departmentSelect = document.getElementById('department');
            const selectedCourse = courseSelect.value;
            const program = (window.Catalog && selectedCourse) ? window.Catalog.programByCode(selectedCourse) : null;

            if (program) {
                departmentSelect.value = program.departmentCode || '';
                populateGradeDropdown(program.level || extractLevelFromCourse(selectedCourse));
                refreshAdmissionNumberPreview();
            } else {
                departmentSelect.value = '';
                populateGradeDropdown(null);
                const admissionNumberField = document.getElementById('admissionNumber');
                if (admissionNumberField) admissionNumberField.value = '';
            }
        }

        // Populate the KCSE Grade <select> with only the grades allowed for the
        // currently-selected course level. Disabled when no course is selected.
        function populateGradeDropdown(level) {
            const select = document.getElementById('kcseGradeSelect');
            const help = document.getElementById('gradeHelpText');
            if (!select) return;
            if (!level) {
                select.innerHTML = '<option value="">Select a course first</option>';
                select.disabled = true;
                if (help) help.textContent = '';
                return;
            }
            const allowed = getAllowedGradesForLevel(level);
            const previous = select.value;
            // Preserve dropdown order (E, KCPE, ...) but only show allowed grades.
            const optionGrades = GRADE_DROPDOWN_ORDER.filter(g => allowed.includes(g));
            const parts = ['<option value="">Select Grade</option>'];
            for (const g of optionGrades) {
                parts.push(`<option value="${escapeAttr(g)}">${escapeHtml(g)}</option>`);
            }
            select.innerHTML = parts.join('');
            select.disabled = false;
            if (previous && optionGrades.includes(previous)) {
                select.value = previous;
            } else {
                select.value = '';
            }
            if (help) {
                help.textContent = `Level ${level} accepts: ${optionGrades.join(', ')}.`;
            }
        }

        // Update intake year based on selected intake (January, May or September).
        function updateIntakeYear() {
            const intakeSelect = document.getElementById('intake-select');
            const intakeYearInput = document.getElementById('intake-year');

            if (!intakeSelect.value) {
                intakeYearInput.value = '';
                return;
            }

            const currentDate = new Date();
            const currentYear = currentDate.getFullYear();
            const currentMonth = currentDate.getMonth() + 1;

            let intakeYear = currentYear;
            if (intakeSelect.value === 'january' && currentMonth > 1) intakeYear = currentYear + 1;
            else if (intakeSelect.value === 'may' && currentMonth > 5) intakeYear = currentYear + 1;
            else if (intakeSelect.value === 'september' && currentMonth > 9) intakeYear = currentYear + 1;

            intakeYearInput.value = intakeYear;
        }

        // Read-only preview of the next admission number from the global counter.
        async function refreshAdmissionNumberPreview() {
            const field = document.getElementById('admissionNumber');
            if (!field) return;
            try {
                const response = await window.AUTH.fetch(`${API_BASE_URL}/students/next-admission-number`);
                if (!response.ok) throw new Error(`Server error: ${response.status}`);
                const data = await response.json();
                field.value = data.nextAdmissionNumber || '';
            } catch (err) {
                console.error('Error fetching next admission number:', err);
                field.value = '';
            }
        }

        // Handle Student Admission
        async function handleAdmission(event) {
            event.preventDefault();

            const formData = new FormData(event.target);
            const courseValue = formData.get('course');
            const program = (window.Catalog && courseValue) ? window.Catalog.programByCode(courseValue) : null;
            const moduleValue = formData.get('module');
            const intakeValue = formData.get('intake');
            const intakeYearValue = formData.get('intakeYear');
            const grade = formData.get('kcseGrade');
            const level = (program && program.level) || extractLevelFromCourse(courseValue);

            // Frontend validation — backend re-checks everything.
            if (!grade) {
                showToast('Please select a KCSE grade.', 'error');
                return;
            }
            const allowed = getAllowedGradesForLevel(level);
            if (!allowed.includes(grade)) {
                showToast(`Grade ${grade} is not allowed for a Level ${level} course. Allowed: ${allowed.join(', ')}`, 'error');
                return;
            }
            const moduleInt = moduleValue ? parseInt(moduleValue, 10) : 1;
            const cap = MAX_MODULE_BY_LEVEL[level];
            if (cap && moduleInt > cap) {
                showToast(`Module ${moduleInt} exceeds Level ${level} max (${cap}).`, 'error');
                return;
            }

            const studentData = {
                name: formData.get('name'),
                idNumber: formData.get('idNumber'),
                kcseGrade: grade,
                course: courseValue,
                department: program ? (program.departmentCode || '') : '',
                module: moduleInt,
                intake: intakeValue,
                intakeYear: intakeYearValue ? parseInt(intakeYearValue, 10) : new Date().getFullYear(),
                phoneNumber: formData.get('phonenumber'),
                admissionType: formData.get('admissionType'),
                nextOfKinName: formData.get('nextOfKinName') || null,
                nextOfKinPhone: formData.get('nextOfKinPhone') || null,
                email: formData.get('email') || null,
                role: 'student'
            };

            try {
                const response = await window.AUTH.fetch(`${API_BASE_URL}/students/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(studentData)
                });

                const data = await response.json();

                if (response.ok) {
                    const assignedAdm = data.student && data.student.admissionNumber;
                    showToast(`${data.message || 'Student registered successfully!'} Admission #: ${assignedAdm}`, 'success');
                    event.target.reset();
                    // Reset dependent fields after the form reset
                    populateGradeDropdown(null);
                    const admissionNumberField = document.getElementById('admissionNumber');
                    if (admissionNumberField) admissionNumberField.value = '';
                    closeAdmissionModal();

                    if (data.showAdmissionLetter && data.admissionLetter) {
                        showAdmissionLetter(data.admissionLetter);
                    }

                    if (typeof fetchAndDisplayStudents === 'function') fetchAndDisplayStudents();
                    if (typeof loadDashboardStats === 'function') loadDashboardStats();
                    refreshAdmissionNumberPreview();
                } else {
                    throw new Error(data.message || 'Failed to register student');
                }
            } catch (error) {
                showToast(error.message, 'error');
            }
        }

        // Function to load and show admission letter modal
        async function loadAdmissionLetterModal(studentData) {
            console.log('loadAdmissionLetterModal called with:', studentData); // Debug log
            try {
                // Create modal container if it doesn't exist
                let modalContainer = document.getElementById('admissionLetterContainer');
                if (!modalContainer) {
                    modalContainer = document.createElement('div');
                    modalContainer.id = 'admissionLetterContainer';
                    document.body.appendChild(modalContainer);
                    console.log('Created modal container'); // Debug log
                }

                // Load admission letter HTML
                console.log('Fetching admission letter HTML...'); // Debug log
                const response = await fetch('/src/components/registrar/AdmissionLetter.html');
                
                if (!response.ok) {
                    throw new Error(`Failed to load admission letter: ${response.status}`);
                }
                
                const letterHTML = await response.text();
                console.log('Loaded admission letter HTML, length:', letterHTML.length); // Debug log
                modalContainer.innerHTML = letterHTML;

                // Wait for DOM to update, then show the letter
                setTimeout(() => {
                    console.log('Checking for showAdmissionLetter function...'); // Debug log
                    if (window.showAdmissionLetter) {
                        console.log('Calling showAdmissionLetter with:', studentData); // Debug log
                        window.showAdmissionLetter(studentData);
                    } else {
                        console.error('showAdmissionLetter function not found!'); // Debug log
                    }
                }, 100);

            } catch (error) {
                console.error('Error loading admission letter:', error);
                showToast('Error loading admission letter: ' + error.message, 'error');
            }
        }

// ============================================================
// Shell chrome — mobile sidebar + legacy theme helpers (verbatim block 3)
// NOTE: the sidebar-collapse + mobileMenuBtn wiring and the second
// toggleDarkMode are pre-existing dead/duplicate code (they target
// elements that do not exist); moved verbatim, not fixed.
// ============================================================

        function openSidebar() {
            document.getElementById('sidebar').classList.add('open');
            document.getElementById('sbBackdrop').classList.add('show');
        }
        function closeSidebar() {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('sbBackdrop').classList.remove('show');
        }

        // Theme toggle functionality (legacy — kept harmless for any callers; the
        // active theme controller is /public/js/dashboard-theme.js which the
        // data-theme-toggle button in the topbar wires automatically).
        function toggleDarkMode() {
            document.documentElement.classList.toggle('dark');
            localStorage.setItem('darkMode', document.documentElement.classList.contains('dark'));
        }

        // Check for saved dark mode preference
        if (localStorage.getItem('darkMode') === 'true') {
            document.documentElement.classList.add('dark');
        }

        // Get sidebar element for collapse functionality
        const sidebar = document.getElementById('sidebar');

        // Sidebar collapse functionality
        let sidebarCollapsed = false;
        const toggleSidebar = document.getElementById('toggleSidebar');
        const sidebarTitle = document.getElementById('sidebar-title');

        if (toggleSidebar && sidebar) {
            toggleSidebar.addEventListener('click', () => {
                sidebarCollapsed = !sidebarCollapsed;
                
                if (sidebarCollapsed) {
                    sidebar.classList.add('w-16');
                    sidebar.classList.remove('w-64');
                    if (sidebarTitle) sidebarTitle.classList.add('hidden');
                    toggleSidebar.innerHTML = '<i class="ri-menu-unfold-line text-xl text-slate-600"></i>';
                    
                    // Hide text in navigation items
                    const navSpans = sidebar.querySelectorAll('nav span');
                    navSpans.forEach(span => span.classList.add('hidden'));
                    
                    // Hide auth buttons container
                    const authButtons = sidebar.querySelector('.mb-4');
                    if (authButtons) authButtons.classList.add('hidden');
                    
                    // Hide dark mode toggle text and make button icon only
                    const darkModeToggle = sidebar.querySelector('button[onclick="toggleDarkMode()"]');
                    if (darkModeToggle) {
                        const darkModeSpan = darkModeToggle.querySelector('span');
                        if (darkModeSpan) darkModeSpan.classList.add('hidden');
                        darkModeToggle.classList.add('w-full', 'justify-center');
                        darkModeToggle.classList.remove('gap-2');
                    }
                } else {
                    sidebar.classList.remove('w-16');
                    sidebar.classList.add('w-64');
                    if (sidebarTitle) sidebarTitle.classList.remove('hidden');
                    toggleSidebar.innerHTML = '<i class="ri-menu-fold-line text-xl text-slate-600"></i>';
                    
                    // Show text in navigation items
                    const navSpans = sidebar.querySelectorAll('nav span');
                    navSpans.forEach(span => span.classList.remove('hidden'));
                    
                    // Show auth buttons container
                    const authButtons = sidebar.querySelector('.mb-4');
                    if (authButtons) authButtons.classList.remove('hidden');
                    
                    // Show dark mode toggle text and restore normal layout
                    const darkModeToggle = sidebar.querySelector('button[onclick="toggleDarkMode()"]');
                    if (darkModeToggle) {
                        const darkModeSpan = darkModeToggle.querySelector('span');
                        if (darkModeSpan) darkModeSpan.classList.remove('hidden');
                        darkModeToggle.classList.remove('w-full', 'justify-center');
                        darkModeToggle.classList.add('gap-2');
                    }
                }
            });
        }

        // Dark mode functionality
        function toggleDarkMode() {
            const html = document.documentElement;
            html.classList.toggle('dark');
            
            const darkModeButton = document.querySelector('button[onclick="toggleDarkMode()"]');
            const icon = darkModeButton?.querySelector('i');
            const span = darkModeButton?.querySelector('span');
            
            if (html.classList.contains('dark')) {
                if (icon) {
                    icon.classList.remove('ri-moon-line');
                    icon.classList.add('ri-sun-line');
                }
                if (span) span.textContent = 'Light Mode';
                localStorage.setItem('registrar-dark-mode', 'enabled');
            } else {
                if (icon) {
                    icon.classList.remove('ri-sun-line');
                    icon.classList.add('ri-moon-line');
                }
                if (span) span.textContent = 'Dark Mode';
                localStorage.setItem('registrar-dark-mode', 'disabled');
            }
        }

        // Initialize dark mode from localStorage
        if (localStorage.getItem('registrar-dark-mode') === 'enabled') {
            document.documentElement.classList.add('dark');
        }

        // Mobile menu functionality
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        
        if (mobileMenuBtn && sidebar) {
            mobileMenuBtn.addEventListener('click', () => {
                sidebar.classList.toggle('active');
            });
            
            // Close sidebar when clicking outside on mobile
            document.addEventListener('click', (e) => {
                if (window.innerWidth < 1024 && 
                    !sidebar.contains(e.target) && 
                    !mobileMenuBtn.contains(e.target)) {
                    sidebar.classList.remove('active');
                }
            });
        }

// ============================================================
// Admission-letter helpers + global exposures (verbatim block 4)
// (window.switchTab is set by portal-router.js as a router alias.)
// ============================================================

        // Course/department display names come from the DB-backed Catalog (Rule 7).
        // Both keep a title-case fallback for any unknown/legacy value.
        function formatCourseName(courseName) {
            if (!courseName) return courseName;
            if (window.Catalog) return window.Catalog.formatCourseName(courseName);
            return courseName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }

        function formatDepartmentName(department) {
            if (!department) return department;
            if (window.Catalog) return window.Catalog.departmentName(department);
            return department.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }

        // Admission Letter Functions
        function showAdmissionLetter(studentData) {
            
            // Populate student data with formatting
            document.getElementById('studentName').textContent = studentData.name || '[Student Name]';
            document.getElementById('courseName').textContent = formatCourseName(studentData.course) || '[Course Name]';
            document.getElementById('letterAdmissionNumber').textContent = studentData.admissionNumber || '[Admission Number]';
            document.getElementById('intakeYear').textContent = studentData.intakeYear || '[Intake Year]';
            document.getElementById('portalUsername').textContent = studentData.admissionNumber || '[Admission Number]';
            document.getElementById('portalPassword').textContent = studentData.phoneNumber || '[Phone Number]';
            
            // Set dates
            const currentDate = new Date();
            const letterDate = currentDate.toLocaleDateString('en-GB', { 
                day: '2-digit', 
                month: 'long', 
                year: 'numeric' 
            });
            document.getElementById('letterDate').textContent = letterDate;
            document.getElementById('generationDate').textContent = currentDate.toLocaleDateString('en-GB');
            
            // Set reference number
            document.getElementById('refYear').textContent = currentDate.getFullYear();
            document.getElementById('refNumber').textContent = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
            
            // Show modal
            const modal = document.getElementById('admissionLetterModal');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }


        // Close admission letter modal
        function closeAdmissionLetterModal() {
            const modal = document.getElementById('admissionLetterModal');
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }

        // Print letter
        function printLetter() {
            window.print();
        }

        // Download as PDF
        function downloadPDF() {
            const element = document.getElementById('letterContent');
            const opt = {
                margin: [10, 10, 10, 10],
                filename: `Admission_Letter_${document.getElementById('letterAdmissionNumber').textContent}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { 
                    unit: 'mm', 
                    format: 'a4', 
                    orientation: 'portrait',
                    putOnlyUsedFonts: true
                }
            };
            
            html2pdf().set(opt).from(element).save();
        }

        // Make functions globally available
        window.showAdmissionLetter = showAdmissionLetter;
        window.closeAdmissionLetterModal = closeAdmissionLetterModal;
        window.printLetter = printLetter;
        window.downloadPDF = downloadPDF;

// ============================================================
// Identity + bootstrap (new)
// ============================================================

// Paint the registrar identity into whatever chrome is currently in the DOM.
// #userName + #userAvatar live in the shell sidebar (always present); #welcomeName
// lives in the dashboard partial, so this is called again from dashboard init().
// Null-safe — mirrors the monolith's identity wiring (it used user.name for all
// three). There was never a hardcoded "Admin User"; the displayed value is the
// authenticated account's own name.
function updateIdentityUI() {
    const user = window.registrarUser || {};
    if (!user.name) return;
    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');
    const welcomeName = document.getElementById('welcomeName');
    if (userName) userName.textContent = user.name;
    if (welcomeName) welcomeName.textContent = user.name;
    if (userAvatar) userAvatar.textContent = user.name.charAt(0).toUpperCase();
}
window.updateIdentityUI = updateIdentityUI;

document.addEventListener('DOMContentLoaded', async () => {
    // Cookie-based auth: bounce to login if no valid session.
    const user = await window.AUTH.requireAuth('/admin/login');
    if (!user) return;
    window.registrarUser = user;
    updateIdentityUI();

    // Preload the DB-backed catalog and populate the static filter dropdowns
    // (admission-modal course/department are populated lazily on modal open).
    if (window.Catalog) {
        await window.Catalog.ready();
        window.Catalog.populateDepartmentSelect(document.getElementById('export-department'), { includeAll: true, allLabel: 'All Departments' });
        window.Catalog.populateDepartmentSelect(document.getElementById('modalDeptFilter'), { includeAll: true, allLabel: 'All Departments' });
    }

    // Logout button — registrar logs back into /admin/login.
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to logout?')) {
                await window.AUTH.logout({ role: 'admin' });
            }
        });
    }

    // Hand off to the History-API router: it shows the tab for the current URL
    // (or dashboard), injects its partial, and calls that tab's init().
    if (window.RegistrarRouter) window.RegistrarRouter.start();
});

