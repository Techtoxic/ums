// portal-core.js — shared base + bootstrap for the student portal SPA.
//
// Folds in studentCommon.js (the window.* globals) plus the multi-tab data /
// render helpers and shell wiring that used to live in studentPortal.js and the
// StudentPortalTailwind.html inline <script> blocks. Every function below is a
// verbatim move from the monolith (preserved comments/indentation); only the
// bootstrap at the very bottom is new orchestration — it loads identity once,
// then hands off to the History-API router (portal-router.js).
//
// Load order MUST stay: auth.js -> portal-core.js -> portal-router.js -> tab
// modules (uploads.js LAST, so its showToast/showLoading/hideLoading win the
// global name-collision exactly as uploadSection.js did in the monolith).

// ============================================================
// Shared globals (verbatim from studentCommon.js)
// ============================================================
window.API_BASE_URL = window.API_BASE_URL || (window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : `${window.location.protocol}//${window.location.host}/api`);

// Authenticated fetch wrapper for student — guarded against double-declaration.
// uploadSection.js also defines authFetch; both load as classic scripts on the
// same page, so a bare top-level `const` collides (SyntaxError). window
// assignment is idempotent regardless of load order.
window.authFetch = window.authFetch || (async (url, options = {}) => {
    // Stage 2B-1B: delegate to the single shared auth helper (public/js/auth.js).
    // It attaches the Authorization header (and a JSON Content-Type for
    // non-FormData bodies) and handles token-expiry redirects.
    return window.AUTH.fetch(url, options);
});

// Get student data from session storage
window.studentData = JSON.parse(sessionStorage.getItem('studentData')) || {};



// Format currency
window.formatCurrency = function formatCurrency(amount) {
    if (amount === null || amount === undefined) return 'KES 0';
    return `KES ${Number(amount).toLocaleString()}`;
};

// Format time ago
window.formatTimeAgo = function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
};

// Toast notification function (if not already exists)
window.showToast = function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm max-w-sm transform translate-x-full transition-transform duration-300 ${
        type === 'success' ? 'bg-green-500' :
        type === 'error' ? 'bg-red-500' :
        type === 'warning' ? 'bg-yellow-500' :
        'bg-blue-500'
    }`;

    toast.innerHTML = `
        <div class="flex items-center gap-2">
            <i class="ri-${
                type === 'success' ? 'check' :
                type === 'error' ? 'error-warning' :
                type === 'warning' ? 'alert' :
                'information'
            }-line"></i>
            <span>${escapeHtml(message)}</span>
        </div>
    `;

    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => {
        toast.classList.remove('translate-x-full');
        toast.classList.add('translate-x-0');
    }, 100);

    // Remove after delay
    setTimeout(() => {
        toast.classList.add('translate-x-full');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
};

// ============================================================
// Shared data + render helpers (verbatim from studentPortal.js)
// ============================================================

// Fetch complete student data from API
async function fetchStudentData() {
    try {
        if (!studentData.admissionNumber) {
            console.warn('No admission number available');
            return null;
        }

        const response = await authFetch(`${API_BASE_URL}/students/admission/${encodeURIComponent(studentData.admissionNumber)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching student data:', error);
        return null;
    }
}

// Fetch program cost from API using proper program name mapping
async function fetchProgramCost(courseKey) {
    try {
        if (!courseKey) {
            console.warn('Course key is missing, cannot fetch program cost');
            return null;
        }

        console.log(`Fetching program cost for course code: ${courseKey}`);

        const response = await authFetch(`${API_BASE_URL}/programs`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const programs = await response.json();
        if (!Array.isArray(programs)) {
            throw new Error('Invalid programs data format received');
        }

        console.log('Available program codes:', programs.map(p => p.code));

        // Student's `course` field is the program CODE (e.g. "AC6").
        // Match directly against the API's `code` field — case-insensitive for safety.
        const foundProgram = programs.find(program =>
            program.code && program.code.toLowerCase() === courseKey.toLowerCase()
        );

        if (!foundProgram) {
            console.warn(`Program with code '${courseKey}' not found in database`);
            return null;
        }

        console.log(`Found program: ${foundProgram.name} — cost: ${foundProgram.programCost}`);
        return foundProgram.programCost || null;
    } catch (error) {
        console.error('Error fetching program cost:', error.message);
        return null;
    }
}

// Fetch student payments from API
async function fetchStudentPayments(admissionNumber) {
    try {
        if (!admissionNumber) {
            console.warn('Admission number is missing, cannot fetch payments');
            return [];
        }
        
        const encodedAdmissionNumber = encodeURIComponent(admissionNumber);
        const response = await authFetch(`${API_BASE_URL}/payments/student/${encodedAdmissionNumber}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                return [];
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const payments = await response.json();
        return Array.isArray(payments) ? payments : [];
    } catch (error) {
        console.error('Error fetching student payments:', error);
        return [];
    }
}

// Update student information in the UI
function updateStudentInfo(data) {
    const studentInfo = data || studentData;
    
    // Update all elements with student name
    document.querySelectorAll('.student-name').forEach(el => {
        el.textContent = studentInfo.name || 'Student Name';
    });
    
    // Update admission number
    document.querySelectorAll('.student-admission').forEach(el => {
        el.textContent = studentInfo.admissionNumber || 'Loading...';
    });
    
    // Update ID number
    document.querySelectorAll('.student-id').forEach(el => {
        el.textContent = studentInfo.idNumber || 'Loading...';
    });
    
    // Update phone number
    document.querySelectorAll('.student-phone').forEach(el => {
        el.textContent = studentInfo.phoneNumber || 'Loading...';
    });
    
    // Update email address
    console.log('Setting email:', studentInfo.email);
    document.querySelectorAll('.student-email').forEach(el => {
        el.textContent = studentInfo.email || 'Not set';
    });
    
    // Update KCSE grade
    document.querySelectorAll('.student-kcse').forEach(el => {
        el.textContent = studentInfo.kcseGrade || 'Loading...';
    });
    
    // Update course name. student.course holds the program CODE (e.g. 'GA5');
    // resolve its display name via the shared DB-backed Catalog helper.
    const courseName = (window.Catalog && window.Catalog.formatCourseName(studentInfo.course))
        || studentInfo.course || 'Loading...';
    document.querySelectorAll('.student-course-name').forEach(el => {
        el.textContent = courseName;
    });
    
    // Update department. student.department holds the snake_case textCode
    // (e.g. 'agriculture'); resolve its display name via the Catalog helper.
    const departmentName = (window.Catalog && window.Catalog.departmentName(studentInfo.department))
        || studentInfo.department || 'Loading...';
    document.querySelectorAll('.student-department').forEach(el => {
        el.textContent = departmentName;
    });
    
    // Update module of study
    document.querySelectorAll('.student-year').forEach(el => {
        el.textContent = studentInfo.module || '1';
    });

    document.querySelectorAll('.student-year-text').forEach(el => {
        el.textContent = `Module ${studentInfo.module || '1'}`;
    });
    
    // Update combined intake display
    document.querySelectorAll('.student-intake-combined').forEach(el => {
        console.log('Student intake data:', { intake: studentInfo.intake, intakeYear: studentInfo.intakeYear });
        
        if (studentInfo.intake && studentInfo.intakeYear) {
            const intakeText = studentInfo.intake.charAt(0).toUpperCase() + studentInfo.intake.slice(1);
            el.textContent = `${intakeText} ${studentInfo.intakeYear}`;
        } else if (studentInfo.intake || studentInfo.intakeYear) {
            // Fallback if only one field is available
            const intake = studentInfo.intake || 'Unknown';
            const year = studentInfo.intakeYear || new Date().getFullYear();
            const intakeText = intake.charAt(0).toUpperCase() + intake.slice(1);
            el.textContent = `${intakeText} ${year}`;
        } else {
            // Final fallback - extract from admission number if possible
            const admissionNumber = studentInfo.admissionNumber || '';
            const intakeMatch = admissionNumber.match(/\/([JS]\d{2})$/);
            if (intakeMatch) {
                const intakeCode = intakeMatch[1];
                const intakePrefix = intakeCode.charAt(0);
                const yearSuffix = intakeCode.slice(1);
                const fullYear = '20' + yearSuffix;
                const intakeName = intakePrefix === 'J' ? 'January' : 'September';
                el.textContent = `${intakeName} ${fullYear}`;
            } else {
                el.textContent = 'Not Available';
            }
        }
    });
    
    // Update admission type
    console.log('Setting admissionType:', studentInfo.admissionType);
    document.querySelectorAll('.student-admission-type').forEach(el => {
        if (studentInfo.admissionType) {
            const admissionTypeText = studentInfo.admissionType === 'walk-in' ? 'Walk-in' : 'KUCCPS';
            el.textContent = admissionTypeText;
            console.log('Set admission type to:', admissionTypeText);
        } else {
            el.textContent = 'Not Available';
            console.log('No admissionType in studentInfo');
        }
    });
    console.log('Full studentInfo:', studentInfo);
}

// Update program cost in the UI
function updateProgramCost(cost) {
    // Calculate total fees based on module of study
    const moduleOfStudy = studentData.module || 1;
    const totalFees = cost ? (cost * moduleOfStudy) : 0;
    const formattedCost = totalFees ? formatCurrency(totalFees) : 'Not Available';
    
    document.querySelectorAll('.program-cost').forEach(el => {
        el.textContent = formattedCost;
    });
    
    document.querySelectorAll('.program-cost-text').forEach(el => {
        el.textContent = formattedCost;
    });
}

// Update financial information in the UI
async function updateFinancialInfo(programCost, payments) {
    // Calculate total paid
    const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    
    // Calculate total fees based on module of study (programCost is per module)
    const moduleOfStudy = studentData.module || 1;
    const totalFees = (programCost || 0) * moduleOfStudy;
    
    // Calculate balance (total fees - total paid)
    const balance = totalFees - totalPaid;
    
    console.log('Dashboard balance calculation:', {
        programCost,
        yearOfStudy,
        totalFees,
        totalPaid,
        balance,
        paymentsCount: payments.length
    });
    
    // Update total paid
    document.querySelectorAll('.total-paid').forEach(el => {
        el.textContent = formatCurrency(totalPaid);
    });
    
    // Update balance (show negative if overpaid)
    document.querySelectorAll('.balance').forEach(el => {
        el.textContent = formatCurrency(balance); // Show actual balance including negative
    });
    
    // Update payment progress
    updatePaymentProgress(totalPaid, totalFees);
    
    // Update payment history
    updatePaymentHistory(payments);
    
    // Update recent activity
    updateRecentActivity(payments);
}

// Update payment progress bars
function updatePaymentProgress(totalPaid, programCost) {
    if (!programCost || programCost <= 0) {
        // Reset progress bars if no program cost
        document.querySelectorAll('[id*="payment-progress"]').forEach(el => {
            el.style.width = '0%';
        });
        document.querySelectorAll('[id*="payment-percentage"]').forEach(el => {
            el.textContent = '0%';
        });
        return;
    }
    
    const percentage = Math.min(100, Math.max(0, (totalPaid / programCost) * 100));
    const roundedPercentage = Math.round(percentage);
    
    // Update progress bars
    document.querySelectorAll('[id*="payment-progress"]').forEach(el => {
        el.style.width = `${percentage}%`;
    });
    
    // Update percentage displays
    document.querySelectorAll('[id*="payment-percentage"]').forEach(el => {
        el.textContent = `${roundedPercentage}%`;
    });
    
    // Update progress icon based on percentage
    const progressIcon = document.getElementById('financial-progress-icon');
    if (progressIcon) {
        if (percentage >= 100) {
            progressIcon.textContent = '✅';
        } else if (percentage >= 75) {
            progressIcon.textContent = '📈';
        } else if (percentage >= 50) {
            progressIcon.textContent = '📊';
        } else if (percentage >= 25) {
            progressIcon.textContent = '📉';
        } else {
            progressIcon.textContent = '💰';
        }
    }
}

// Show loading overlay
function showLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.classList.remove('hidden');
    }
}

// Hide loading overlay
function hideLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.classList.add('hidden');
    }
}

// Setup logout functionality  
function setupLogout() {
    // Logout functionality is handled in the HTML file with showLogoutModal()
    console.log('Logout button is available and will use modal from HTML');
}

// ============================================================
// Shared utils + shell wiring (verbatim from the monolith inline scripts)
// ============================================================

        // Format a course CODE (e.g. 'GA5') to its program display name via the
        // shared DB-backed Catalog helper. Title-case fallback when Catalog is
        // unavailable (script load failure). graduation.js / attachment.js call
        // this as a bare global (resolved via global function scope).
        function formatCourseName(courseCode) {
            if (window.Catalog) {
                return window.Catalog.formatCourseName(courseCode) || 'N/A';
            }
            if (!courseCode) return 'N/A';
            return courseCode
                .replace(/_/g, ' ')
                .replace(/\b\w/g, l => l.toUpperCase())
                .replace(/(\d+)/, ' Level $1');
        }

        // Update current time
        function updateCurrentTime() {
            const now = new Date();
            const timeString = now.toLocaleTimeString('en-US', { 
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            const currentTimeElement = document.getElementById('current-time');
            if (currentTimeElement) {
                currentTimeElement.textContent = timeString;
            }
        }

        // Dark mode functionality
        function toggleDarkMode() {
            const html = document.documentElement;
            const darkModeToggle = document.getElementById('dark-mode-toggle');
            const icon = darkModeToggle?.querySelector('i');
            
            html.classList.toggle('dark');
            
            if (html.classList.contains('dark')) {
                localStorage.setItem('dark-mode', 'enabled');
                if (icon) {
                    icon.classList.remove('ri-moon-line');
                    icon.classList.add('ri-sun-line');
                }
            } else {
                localStorage.setItem('dark-mode', 'disabled');
                if (icon) {
                    icon.classList.remove('ri-sun-line');
                    icon.classList.add('ri-moon-line');
                }
            }
        }

        // Initialize dark mode
        if (localStorage.getItem('dark-mode') === 'enabled') {
            document.documentElement.classList.add('dark');
            const icon = document.querySelector('#dark-mode-toggle i');
            if (icon) {
                icon.classList.remove('ri-moon-line');
                icon.classList.add('ri-sun-line');
            }
        }

        // Open email update modal
        function openEmailUpdateModal() {
            const modal = document.getElementById('email-update-modal');
            const emailInput = document.getElementById('new-email');
            
            // Pre-fill current email if available
            const currentEmail = document.querySelector('.student-email').textContent;
            if (currentEmail && currentEmail !== 'Not set') {
                emailInput.value = currentEmail;
            }
            
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            emailInput.focus();
        }

        // Close email update modal
        function closeEmailUpdateModal() {
            const modal = document.getElementById('email-update-modal');
            const form = document.getElementById('email-update-form');
            
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            form.reset();
        }

        // Receipt modal event listeners
        function setupReceiptModalListeners() {
            const closeReceiptModalBtn = document.getElementById('close-receipt-modal');
            const exportReceiptBtn = document.getElementById('export-receipt');
            const printReceiptBtn = document.getElementById('print-receipt');

            closeReceiptModalBtn?.addEventListener('click', closeReceiptModal);
            exportReceiptBtn?.addEventListener('click', exportReceipt);
            printReceiptBtn?.addEventListener('click', printReceipt);
        }

// Shell UI wiring (from the monolith setupUI(); the navigation block was
// removed — portal-router.js owns tab navigation now).
        // Setup UI interactions
        function setupUI() {
            // Mobile menu toggle
            const mobileMenuBtn = document.getElementById('mobile-menu-btn');
            const sidebar = document.getElementById('sidebar');
            const mobileOverlay = document.getElementById('mobile-overlay');
            const sidebarToggle = document.getElementById('sidebar-toggle');

            mobileMenuBtn?.addEventListener('click', () => {
                sidebar.classList.add('mobile-open');
                mobileOverlay.classList.remove('hidden');
            });

            sidebarToggle?.addEventListener('click', () => {
                sidebar.classList.remove('mobile-open');
                mobileOverlay.classList.add('hidden');
            });

            mobileOverlay?.addEventListener('click', () => {
                sidebar.classList.remove('mobile-open');
                mobileOverlay.classList.add('hidden');
            });

            // Desktop sidebar toggle
            const desktopSidebarToggle = document.getElementById('desktop-sidebar-toggle');
            const mainContent = document.getElementById('main-content');
            let sidebarCollapsed = false;

            desktopSidebarToggle?.addEventListener('click', () => {
                sidebarCollapsed = !sidebarCollapsed;
                if (sidebarCollapsed) {
                    sidebar.classList.add('sidebar-collapsed');
                    mainContent.classList.remove('md:ml-64');
                    mainContent.classList.add('md:ml-16');
                    desktopSidebarToggle.innerHTML = '<i class="ri-menu-unfold-line text-xl text-gray-600 dark:text-gray-300"></i>';
                } else {
                    sidebar.classList.remove('sidebar-collapsed');
                    mainContent.classList.remove('md:ml-16');
                    mainContent.classList.add('md:ml-64');
                    desktopSidebarToggle.innerHTML = '<i class="ri-menu-fold-line text-xl text-gray-600 dark:text-gray-300"></i>';
                }
            });

            // Dark mode toggle
            const darkModeToggle = document.getElementById('dark-mode-toggle');
            darkModeToggle?.addEventListener('click', toggleDarkMode);

            // Logout modal function
            function showLogoutModal() {
                const modal = document.createElement('div');
                modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
                modal.innerHTML = `
                    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm transform transition-all duration-300">
                        <div class="p-6">
                            <div class="flex items-center gap-3 mb-4">
                                <div class="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                                    <i class="ri-logout-box-line text-red-600 dark:text-red-400 text-xl"></i>
                                </div>
                                <h3 class="text-sm md:text-base font-semibold text-gray-800 dark:text-white">Confirm Logout</h3>
                            </div>
                            <p class="text-gray-600 dark:text-gray-300 mb-6">Are you sure you want to logout? You will need to login again to access your account.</p>
                            <div class="flex gap-3">
                                <button onclick="cancelLogout()" class="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                    Cancel
                                </button>
                                <button onclick="confirmLogout()" class="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                                    Logout
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                
                document.body.appendChild(modal);
                
                // Add global functions for modal actions
                window.cancelLogout = function() {
                    document.body.removeChild(modal);
                    delete window.cancelLogout;
                    delete window.confirmLogout;
                };
                
                window.confirmLogout = async function() {
                    document.body.removeChild(modal);
                    delete window.cancelLogout;
                    delete window.confirmLogout;

                    // Wipe the portal's sessionStorage profile cache so a different
                    // student logging in on the same browser doesn't see stale data.
                    try { sessionStorage.clear(); } catch (e) { /* private mode */ }

                    // AUTH.logout clears the cookie server-side (no token_version
                    // bump for students — that column is missing from schema) and
                    // redirects to /student/login.
                    await window.AUTH.logout({ role: 'student' });
                };
            }

            // Logout
            const logoutBtn = document.getElementById('logout-btn');
            logoutBtn?.addEventListener('click', (e) => {
                e.preventDefault();
                showLogoutModal();
            });
        }

        // Handle email update form submission
        document.getElementById('email-update-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const emailInput = document.getElementById('new-email');
            const submitBtn = document.querySelector('#email-update-btn-text');
            const newEmail = emailInput.value.trim();
            
            if (!newEmail) {
                showToast('Please enter a valid email address', 'error');
                return;
            }
            
            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(newEmail)) {
                showToast('Please enter a valid email address', 'error');
                return;
            }
            
            try {
                // Update button state
                submitBtn.textContent = 'Updating...';
                
                const studentData = JSON.parse(sessionStorage.getItem('studentData'));
                const response = await window.AUTH.fetch(`${API_BASE_URL}/students/${encodeURIComponent(studentData.admissionNumber)}/email`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email: newEmail })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    // Update the display
                    document.querySelector('.student-email').textContent = newEmail;
                    
                    // Update session storage
                    studentData.email = newEmail;
                    sessionStorage.setItem('studentData', JSON.stringify(studentData));
                    
                    showToast('Email updated successfully!', 'success');
                    closeEmailUpdateModal();
                } else {
                    showToast(data.message || 'Failed to update email', 'error');
                }
            } catch (error) {
                console.error('Error updating email:', error);
                showToast('Error updating email. Please try again.', 'error');
            } finally {
                // Reset button state
                submitBtn.textContent = 'Update Email';
            }
        });

        // Make functions globally available
        window.openEmailUpdateModal = openEmailUpdateModal;
        window.closeEmailUpdateModal = closeEmailUpdateModal;

// ============================================================
// Bootstrap (new) — identity load once, then start the router.
// ============================================================

// The identity half of the monolith's initializePortal(): confirm the session,
// merge server identity into studentData, fetch the fresh record, and paint the
// sidebar. Per-tab data (program cost, payments, units, notes) is loaded by each
// tab's init() when the router shows it.
async function bootstrapPortal() {
    console.log('Initializing student portal...');

    // Cookie-based auth: confirm the student session is live before doing
    // anything else. requireAuth bounces to /student/login on no/expired cookie.
    const me = await window.AUTH.requireAuth('/student/login');
    if (!me) return;
    // Load the shared catalog (programs + departments) so sync Catalog lookups
    // (formatCourseName, departmentName) resolve before any tab renders.
    if (window.Catalog) { await window.Catalog.ready(); }
    window.studentData = { ...studentData, ...me };
    try { sessionStorage.setItem('studentData', JSON.stringify(studentData)); } catch (e) { /* private mode */ }
    console.log('Student data after auth check:', studentData);

    showLoading();
    try {
        // Always fetch fresh data from API on portal load to ensure we have the
        // latest email, admissionType, etc.
        if (studentData.admissionNumber) {
            const completeData = await fetchStudentData();
            if (completeData) {
                const updatedStudentData = { ...studentData, ...completeData };
                sessionStorage.setItem('studentData', JSON.stringify(updatedStudentData));
                window.studentData = updatedStudentData;
            }
        }
        updateStudentInfo();
        setupLogout();
        console.log('Portal initialization completed');
    } catch (error) {
        console.error('Error initializing portal:', error);
    } finally {
        hideLoading();
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    // Guard (from studentPortal.js): no cached identity -> bounce to login.
    if (!studentData || !studentData.admissionNumber) {
        console.warn('No student data found, redirecting to login');
        window.location.href = '/student/login';
        return;
    }

    setupUI();
    setupReceiptModalListeners();
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);

    await bootstrapPortal();

    // Hand off to the History-API router: it shows the tab for the current URL
    // (or dashboard), injects its partial, and calls that tab's init().
    if (window.StudentRouter) window.StudentRouter.start();
});

