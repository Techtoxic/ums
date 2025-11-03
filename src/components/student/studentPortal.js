// Student Portal JavaScript
const API_BASE_URL = 'http://localhost:5502/api';

// Get student data from session storage
let studentData = JSON.parse(sessionStorage.getItem('studentData')) || {};

// Course to Program Name Mapping
const courseToProgram = {
    'applied_biology_6': 'Applied Biology Level 6',
    'analytical_chemistry_6': 'Analytical Chemistry Level 6',
    'science_lab_technology_5': 'Science Lab Technology Level 5',
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
    'information_science_6': 'Information Science Level 6',
    // Additional variations for comprehensive mapping
    'science_lab_tech_5': 'Science Lab Technology Level 5',
    'science_laboratory_technology_5': 'Science Lab Technology Level 5',
    'applied_bio_6': 'Applied Biology Level 6',
    'analytical_chem_6': 'Analytical Chemistry Level 6',
    'general_agric_4': 'General Agriculture Level 4',
    'sustainable_agric_5': 'Sustainable Agriculture Level 5',
    'agricultural_ext_6': 'Agricultural Extension Level 6',
    'building_tech_4': 'Building Technician Level 4',
    'building_tech_6': 'Building Technician Level 6',
    'civil_eng_6': 'Civil Engineering Level 6',
    'electrical_eng_4': 'Electrical Engineering Level 4',
    'electrical_eng_5': 'Electrical Engineering Level 5',
    'electrical_eng_6': 'Electrical Engineering Level 6',
    'automotive_eng_5': 'Automotive Engineering Level 5',
    'automotive_eng_6': 'Automotive Engineering Level 6',
    'tourism_mgmt_5': 'Tourism Management Level 5',
    'tourism_mgmt_6': 'Tourism Management Level 6',
    'office_admin_5': 'Office Administration Level 5',
    'office_admin_6': 'Office Administration Level 6',
    'info_science_5': 'Information Science Level 5',
    'info_science_6': 'Information Science Level 6',
    // Additional course code variations to ensure all formats work
    'agricultural_extension_6': 'Agricultural Extension Level 6',
    'agricultural_ext_6': 'Agricultural Extension Level 6',
    'agric_extension_6': 'Agricultural Extension Level 6',
    'building_technician_4': 'Building Technician Level 4',
    'building_technician_6': 'Building Technician Level 6',
    'building_tech_4': 'Building Technician Level 4',
    'building_tech_6': 'Building Technician Level 6'
};

// Department Mapping
const departmentMapping = {
    'applied_science': 'Applied Science Department',
    'agriculture': 'Agriculture Department',
    'building_civil': 'Building and Civil Department',
    'electromechanical': 'Electromechanical Department',
    'hospitality': 'Hospitality Department',
    'business_liberal': 'Business and Liberal Studies',
    'computing_informatics': 'Computing and Informatics'
};

// Fetch complete student data from API
async function fetchStudentData() {
    try {
        if (!studentData.admissionNumber) {
            console.warn('No admission number available');
            return null;
        }

        const response = await fetch(`${API_BASE_URL}/students/admission/${studentData.admissionNumber}`, {
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
        
        // Convert course key to program name
        const programName = courseToProgram[courseKey];
        if (!programName) {
            console.warn(`No program mapping found for course: ${courseKey}`);
            return null;
        }
        
        console.log(`Fetching cost for program: ${programName} (from course: ${courseKey})`);
        
        // Fetch programs data from the API
        const response = await fetch(`${API_BASE_URL}/programs`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const programs = await response.json();
        if (!Array.isArray(programs)) {
            throw new Error('Invalid programs data format received');
        }
        
        console.log('Available programs:', programs.map(p => p.programName));
        
        // Find the program with matching name
        const foundProgram = programs.find(program => 
            program.programName && program.programName.toLowerCase() === programName.toLowerCase()
        );
        
        if (!foundProgram) {
            console.warn(`Program '${programName}' not found in database`);
            return null;
        }
        
        console.log(`Found program cost: ${foundProgram.programCost}`);
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
        const response = await fetch(`${API_BASE_URL}/payments/student/${encodedAdmissionNumber}`, {
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
    document.querySelectorAll('.student-email').forEach(el => {
        el.textContent = studentInfo.email || 'Not set';
    });
    
    // Update KCSE grade
    document.querySelectorAll('.student-kcse').forEach(el => {
        el.textContent = studentInfo.kcseGrade || 'Loading...';
    });
    
    // Update course name (convert to readable format)
    const courseName = courseToProgram[studentInfo.course] || studentInfo.course || 'Loading...';
    document.querySelectorAll('.student-course-name').forEach(el => {
        el.textContent = courseName;
    });
    
    // Update department (convert to readable format)
    const departmentName = departmentMapping[studentInfo.department] || studentInfo.department || 'Loading...';
    document.querySelectorAll('.student-department').forEach(el => {
        el.textContent = departmentName;
    });
    
    // Update year of study
    document.querySelectorAll('.student-year').forEach(el => {
        el.textContent = studentInfo.year || '1';
    });
    
    document.querySelectorAll('.student-year-text').forEach(el => {
        el.textContent = `Year ${studentInfo.year || '1'}`;
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
    document.querySelectorAll('.student-admission-type').forEach(el => {
        if (studentInfo.admissionType) {
            const admissionTypeText = studentInfo.admissionType === 'walk-in' ? 'Walk-in' : 'KUCCPS';
            el.textContent = admissionTypeText;
        } else {
            el.textContent = 'Not Available';
        }
    });
}

// Update program cost in the UI
function updateProgramCost(cost) {
    // Calculate total fees based on year of study
    const yearOfStudy = studentData.year || 1;
    const totalFees = cost ? (cost * yearOfStudy) : 0;
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
    const totalPaid = payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
    
    // Calculate total fees based on year of study (programCost is per year)
    const yearOfStudy = studentData.year || 1;
    const totalFees = (programCost || 0) * yearOfStudy;
    
    // Calculate balance (total fees - total paid)
    const balance = totalFees - totalPaid;
    
    console.log('🔍 Dashboard balance calculation:', {
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

// Update payment history display
function updatePaymentHistory(payments) {
    const paymentHistoryContainer = document.getElementById('payment-history');
    if (!paymentHistoryContainer) return;
    
    if (!payments || payments.length === 0) {
        paymentHistoryContainer.innerHTML = `
            <div class="text-center py-8">
                <div class="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="ri-receipt-line text-2xl text-gray-400"></i>
                </div>
                <p class="text-gray-600 dark:text-gray-400">No payment history available</p>
            </div>
        `;
        return;
    }
    
    const paymentHTML = payments.map((payment, index) => `
        <div class="payment-item flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer transition-colors" data-payment='${JSON.stringify(payment)}'>
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                    <i class="ri-check-line text-green-600"></i>
                </div>
                <div>
                    <p class="font-medium text-gray-800 dark:text-white">${formatCurrency(payment.amount)}</p>
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                        ${payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : 'Date not available'}
                    </p>
                </div>
            </div>
            <div class="text-right flex items-center gap-2">
                <span class="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded-full">
                    ${payment.paymentMode === 'mpesa' ? 'M-Pesa' : payment.paymentMode === 'bank' ? 'Bank' : 'Payment'}
                </span>
                <i class="ri-receipt-line text-gray-400 text-sm"></i>
            </div>
        </div>
    `).join('');
    
    paymentHistoryContainer.innerHTML = paymentHTML;
    
    // Add click event listeners to payment items
    document.querySelectorAll('.payment-item').forEach(item => {
        item.addEventListener('click', () => {
            const paymentData = JSON.parse(item.getAttribute('data-payment'));
            showPaymentReceipt(paymentData);
        });
    });
}

// Update recent activity
function updateRecentActivity(payments) {
    const recentActivityContainer = document.getElementById('recent-activity');
    if (!recentActivityContainer) return;
    
    let activities = [];
    
    // Add recent payments to activity
    if (payments && payments.length > 0) {
        const recentPayments = payments.slice(-3); // Last 3 payments
        activities.push(...recentPayments.map(payment => ({
            icon: 'ri-money-dollar-circle-line',
            iconBg: 'bg-green-100 dark:bg-green-900/30',
            iconColor: 'text-green-600',
            title: `Payment of ${formatCurrency(payment.amount)}`,
            description: 'Payment processed successfully',
            time: payment.paymentDate ? formatTimeAgo(payment.paymentDate) : 'Recently'
        })));
    }
    
    // Add profile activity
    activities.unshift({
        icon: 'ri-user-line',
        iconBg: 'bg-blue-100 dark:bg-blue-900/30',
        iconColor: 'text-blue-600',
        title: 'Profile updated',
        description: 'Welcome to the portal',
        time: 'Just now'
    });
    
    const activityHTML = activities.map(activity => `
        <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div class="w-8 h-8 ${activity.iconBg} rounded-full flex items-center justify-center">
                <i class="${activity.icon} ${activity.iconColor} text-sm"></i>
            </div>
            <div class="flex-1">
                <p class="text-sm font-medium text-gray-800 dark:text-white">${activity.title}</p>
                <p class="text-xs text-gray-600 dark:text-gray-400">${activity.description}</p>
            </div>
            <span class="text-xs text-gray-500 dark:text-gray-400">${activity.time}</span>
        </div>
    `).join('');
    
    recentActivityContainer.innerHTML = activityHTML;
}

// Format currency
function formatCurrency(amount) {
    if (amount === null || amount === undefined) return 'KES 0';
    return `KES ${Number(amount).toLocaleString()}`;
}

// Format time ago
function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
}

// Fetch student units with registration status
async function fetchStudentUnits(studentCourse) {
    try {
        if (!studentCourse) {
            console.warn('No course specified for fetching units');
            updateUnitsDisplay([]);
            return;
        }

        // Get student ID for registration status
        const studentId = studentData.admissionNumber;
        const url = studentId ? 
            `${API_BASE_URL}/units/course/${encodeURIComponent(studentCourse)}?studentId=${encodeURIComponent(studentId)}` :
            `${API_BASE_URL}/units/course/${encodeURIComponent(studentCourse)}`;

        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 404) {
                console.log('No units found for course:', studentCourse);
                updateUnitsDisplay([]);
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Units data received:', data);
        
        if (data.success && data.units) {
            // Calculate registration eligibility using the same method as dashboard
            let registrationEligibility = null;
            if (studentId) {
                try {
                    // Get payment data (same as dashboard)
                    const payments = await fetchStudentPayments(studentId);
                    
                    // Get program cost using the same method as dashboard
                    const courseKey = studentData.course;
                    const programCost = courseKey ? await fetchProgramCost(courseKey) : (data.programCost || 100000);
                    
                    console.log('🔍 Units section balance calculation:', {
                        courseKey,
                        programCost,
                        apiProgramCost: data.programCost,
                        paymentsCount: payments.length
                    });
                    
                    // Calculate balance using same method as dashboard
                    const totalPaid = payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
                    const yearOfStudy = studentData.year || 1;
                    const totalFees = programCost * yearOfStudy;
                    const outstandingBalance = totalFees - totalPaid;
                    
                    // Get fee threshold (default 50000)
                    const feeThreshold = 50000; // You can make this configurable later
                    
                    registrationEligibility = {
                        canRegister: outstandingBalance < feeThreshold,
                        outstandingBalance: outstandingBalance,
                        feeThreshold: feeThreshold,
                        totalFees: totalFees,
                        paidAmount: totalPaid
                    };
                    
                    console.log('Registration eligibility (calculated locally):', registrationEligibility);
                } catch (error) {
                    console.warn('Error calculating registration eligibility:', error);
                }
            }
            
            updateUnitsDisplay(data.units, studentCourse, data, registrationEligibility);
        } else {
            updateUnitsDisplay([]);
        }
    } catch (error) {
        console.error('Error fetching student units:', error);
        updateUnitsDisplay([]);
    }
}

// Global pagination state for units
let unitsState = {
    currentPage: 1,
    itemsPerPage: 8,
    totalUnits: 0,
    allUnits: [],
    courseCode: ''
};

// Update units display with pagination and grid layout
function updateUnitsDisplay(units, courseCode = '', apiData = null, registrationEligibility = null) {
    const unitsContainer = document.getElementById('student-units');
    if (!unitsContainer) return;
    
    if (!units || units.length === 0) {
        unitsContainer.innerHTML = `
            <div class="text-center py-12">
                <div class="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="ri-book-open-line text-3xl text-gray-400"></i>
                </div>
                <h3 class="text-lg font-medium text-gray-800 dark:text-white mb-2">No Units Available</h3>
                <p class="text-gray-600 dark:text-gray-400">No units information available for this course.</p>
            </div>
        `;
        return;
    }

    // Count unit types and registration status
    const departmentUnits = units.filter(unit => unit.type === 'department').length;
    const commonUnits = units.filter(unit => unit.type === 'common').length;
    const registeredUnits = units.filter(unit => unit.isRegistered).length;
    const unregisteredUnits = units.length - registeredUnits;

    // Update global state
    unitsState.allUnits = units;
    unitsState.totalUnits = units.length;
    unitsState.courseCode = courseCode;
    unitsState.departmentUnits = departmentUnits;
    unitsState.commonUnits = commonUnits;
    unitsState.registeredUnits = registeredUnits;
    unitsState.unregisteredUnits = unregisteredUnits;
    unitsState.apiData = apiData;
    unitsState.registrationEligibility = registrationEligibility;

    renderUnitsPage();
}

// Render current page of units
function renderUnitsPage() {
    const unitsContainer = document.getElementById('student-units');
    if (!unitsContainer) return;

    const { currentPage, itemsPerPage, totalUnits, allUnits, courseCode, departmentUnits, commonUnits, registeredUnits, unregisteredUnits, registrationEligibility } = unitsState;
    const totalPages = Math.ceil(totalUnits / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentUnits = allUnits.slice(startIndex, endIndex);

    // Get the course name for display
    const courseName = courseToProgram[courseCode] || courseCode?.replace(/_/g, ' ').toUpperCase() || 'Your Course';

    const unitsHTML = `
        <!-- Course Header -->
        <div class="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-lg p-4 mb-6">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                    <h3 class="text-lg font-semibold text-gray-800 dark:text-white">${courseName}</h3>
                    <div class="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400 mt-1">
                        <span>Total Units: ${totalUnits}</span>
                        <span>Department: ${departmentUnits || 0}</span>
                        <span class="text-blue-600 dark:text-blue-400">Common: ${commonUnits || 0}</span>
                        ${registeredUnits !== undefined ? `<span class="text-green-600 dark:text-green-400">Registered: ${registeredUnits || 0}</span>` : ''}
                        ${unregisteredUnits !== undefined ? `<span class="text-orange-600 dark:text-orange-400">Unregistered: ${unregisteredUnits || 0}</span>` : ''}
                    </div>
                </div>
                <div class="text-sm text-gray-500 dark:text-gray-400">
                    Page ${currentPage} of ${totalPages}
                </div>
            </div>
            ${registrationEligibility ? `
                <div class="mt-4 p-3 rounded-lg ${registrationEligibility.canRegister ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}">
                    <div class="flex items-center gap-2">
                        <i class="ri-${registrationEligibility.canRegister ? 'check' : 'error-warning'}-line text-${registrationEligibility.canRegister ? 'green' : 'red'}-600"></i>
                        <span class="text-sm font-medium text-${registrationEligibility.canRegister ? 'green' : 'red'}-800 dark:text-${registrationEligibility.canRegister ? 'green' : 'red'}-200">
                            ${registrationEligibility.canRegister ? 'Registration Available' : 'Registration Blocked'}
                        </span>
                    </div>
                    <div class="text-xs text-${registrationEligibility.canRegister ? 'green' : 'red'}-700 dark:text-${registrationEligibility.canRegister ? 'green' : 'red'}-300 mt-1">
                        ${registrationEligibility.canRegister ? 
                            `Outstanding balance: KES ${registrationEligibility.outstandingBalance?.toLocaleString() || 0} (Threshold: KES ${registrationEligibility.feeThreshold?.toLocaleString() || 0})` :
                            `Outstanding balance of KES ${registrationEligibility.outstandingBalance?.toLocaleString() || 0} exceeds threshold of KES ${registrationEligibility.feeThreshold?.toLocaleString() || 0}`
                        }
                    </div>
                    ${registrationEligibility.canRegister && unregisteredUnits > 0 ? `
                        <button onclick="showBulkRegistrationModal()" class="mt-2 px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg transition-colors">
                            <i class="ri-add-line mr-1"></i>
                            Register Unregistered Units
                        </button>
                    ` : ''}
                </div>
            ` : ''}
        </div>

        <!-- Units Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 gap-4 mb-6">
            ${currentUnits.map((unit, index) => {
                const globalIndex = startIndex + index + 1;
                return `
                    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 group border border-transparent hover:border-primary/20 ${unit.type === 'common' ? 'ring-2 ring-blue-200 dark:ring-blue-800' : ''}">
                        <div class="flex items-start gap-3">
                            <div class="flex-shrink-0 w-8 h-8 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-medium">
                                ${globalIndex}
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-start justify-between gap-3">
                                    <div class="flex-1">
                                        <div class="flex items-center gap-2 mb-1">
                                            <h4 class="font-medium text-gray-800 dark:text-white group-hover:text-primary transition-colors text-sm leading-tight">
                                                ${unit.unitName}
                                            </h4>
                                            ${unit.type === 'common' ? '<span class="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">Common</span>' : ''}
                                        </div>
                                        <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                            <span class="font-mono bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded text-xs">
                                                ${unit.unitCode}
                                            </span>
                                        </p>
                                    </div>
                                    <div class="flex-shrink-0 flex flex-col gap-1">
                                        ${unit.isRegistered ? `
                                            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                                <i class="ri-check-line mr-1 text-xs"></i>
                                                Registered
                                            </span>
                                        ` : `
                                            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                                                <i class="ri-time-line mr-1 text-xs"></i>
                                                Not Registered
                                            </span>
                                            ${registrationEligibility?.canRegister ? `
                                                <button onclick="registerSingleUnit('${unit._id}', '${unit.unitCode}', '${unit.unitName}', '${unit.type}')" 
                                                        class="px-2 py-1 bg-primary hover:bg-primary/80 text-white text-xs rounded transition-colors">
                                                    <i class="ri-add-line mr-1"></i>
                                                    Register
                                                </button>
                                            ` : `
                                                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                                    <i class="ri-lock-line mr-1 text-xs"></i>
                                                    Blocked
                                                </span>
                                            `}
                                        `}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>

        <!-- Pagination Controls -->
        ${totalPages > 1 ? `
            <div class="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div class="text-sm text-gray-600 dark:text-gray-400">
                    Showing ${startIndex + 1}-${Math.min(endIndex, totalUnits)} of ${totalUnits} units
                </div>
                <div class="flex items-center gap-2">
                    <button 
                        onclick="navigateUnitsPage('prev')" 
                        ${currentPage <= 1 ? 'disabled' : ''}
                        class="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-700 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-gray-800 transition-colors"
                    >
                        <i class="ri-arrow-left-s-line"></i>
                        Previous
                    </button>
                    
                    <div class="flex items-center gap-1">
                        ${Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum;
                            if (totalPages <= 5) {
                                pageNum = i + 1;
                            } else if (currentPage <= 3) {
                                pageNum = i + 1;
                            } else if (currentPage >= totalPages - 2) {
                                pageNum = totalPages - 4 + i;
                            } else {
                                pageNum = currentPage - 2 + i;
                            }
                            
                            const isActive = pageNum === currentPage;
                            return `
                                <button 
                                    onclick="navigateUnitsPage(${pageNum})" 
                                    class="w-8 h-8 text-sm font-medium rounded-lg transition-colors ${
                                        isActive 
                                            ? 'bg-primary text-white' 
                                            : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                                    }"
                                >
                                    ${pageNum}
                                </button>
                            `;
                        }).join('')}
                    </div>

                    <button 
                        onclick="navigateUnitsPage('next')" 
                        ${currentPage >= totalPages ? 'disabled' : ''}
                        class="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-700 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-gray-800 transition-colors"
                    >
                        Next
                        <i class="ri-arrow-right-s-line"></i>
                    </button>
                </div>
            </div>
        ` : ''}
    `;

    unitsContainer.innerHTML = unitsHTML;
}

// Navigate units pagination
function navigateUnitsPage(direction) {
    const { currentPage, totalUnits, itemsPerPage } = unitsState;
    const totalPages = Math.ceil(totalUnits / itemsPerPage);

    if (direction === 'prev' && currentPage > 1) {
        unitsState.currentPage = currentPage - 1;
    } else if (direction === 'next' && currentPage < totalPages) {
        unitsState.currentPage = currentPage + 1;
    } else if (typeof direction === 'number' && direction >= 1 && direction <= totalPages) {
        unitsState.currentPage = direction;
    }

    renderUnitsPage();
    
    // Smooth scroll to top of units section
    const unitsSection = document.getElementById('units');
    if (unitsSection && !unitsSection.classList.contains('hidden')) {
        unitsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Setup logout functionality  
function setupLogout() {
    // Logout functionality is handled in the HTML file with showLogoutModal()
    console.log('Logout button is available and will use modal from HTML');
}

// Show payment receipt modal
function showPaymentReceipt(payment) {
    const modal = document.getElementById('receipt-modal');
    const content = document.getElementById('receipt-content');
    
    if (!modal || !content) return;
    
    // Generate receipt content
    const receiptHTML = `
        <div class="space-y-4">
            <div class="text-center pb-4 border-b border-gray-200 dark:border-gray-700">
                <div class="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-3">
                    <i class="ri-receipt-line text-white text-2xl"></i>
                </div>
                <h4 class="text-lg font-semibold text-gray-800 dark:text-white">Payment Receipt</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400">EDTTI - Emura Technical Training Institute</p>
            </div>
            
            <div class="space-y-3">
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Student:</span>
                    <span class="font-medium text-gray-800 dark:text-white">${studentData.name || 'N/A'}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Admission Number:</span>
                    <span class="font-medium text-gray-800 dark:text-white">${studentData.admissionNumber || 'N/A'}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Amount Paid:</span>
                    <span class="font-semibold text-green-600 text-lg">${formatCurrency(payment.amount)}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Payment Method:</span>
                    <span class="font-medium text-gray-800 dark:text-white">${payment.paymentMode === 'mpesa' ? 'M-Pesa' : payment.paymentMode === 'bank' ? 'Bank Transfer' : 'N/A'}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Reference:</span>
                    <span class="font-medium text-gray-800 dark:text-white">${payment.reference || 'N/A'}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Date:</span>
                    <span class="font-medium text-gray-800 dark:text-white">${payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    }) : 'N/A'}</span>
                </div>
                ${payment.paymentMode === 'bank' && payment.bankName ? `
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Bank:</span>
                    <span class="font-medium text-gray-800 dark:text-white">${payment.bankName}</span>
                </div>` : ''}
                ${payment.receiptNumber ? `
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Receipt Number:</span>
                    <span class="font-medium text-gray-800 dark:text-white">${payment.receiptNumber}</span>
                </div>` : ''}
            </div>
            
            <div class="pt-4 border-t border-gray-200 dark:border-gray-700 text-center">
                <p class="text-xs text-gray-500 dark:text-gray-400">
                    Generated on ${new Date().toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}
                </p>
            </div>
        </div>
    `;
    
    content.innerHTML = receiptHTML;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    // Store payment data for export
    modal.setAttribute('data-payment', JSON.stringify(payment));
}

// Close receipt modal
function closeReceiptModal() {
    const modal = document.getElementById('receipt-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

// Export receipt as PDF (using same method as registrar dashboard)
function exportReceipt() {
    const modal = document.getElementById('receipt-modal');
    const paymentData = JSON.parse(modal.getAttribute('data-payment') || '{}');
    
    try {
        // Use same jsPDF access method as registrar dashboard
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Header
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text('EDTTI - Payment Receipt', 105, 20, { align: 'center' });
        
        // Institute name
        doc.setFontSize(12);
        doc.setFont(undefined, 'normal');
        doc.text('Emura Technical Training Institute', 105, 30, { align: 'center' });
        
        // Line separator
        doc.line(20, 40, 190, 40);
        
        // Receipt details
        doc.setFontSize(11);
        let yPos = 55;
        
        const details = [
            ['Student Name:', studentData.name || 'N/A'],
            ['Admission Number:', studentData.admissionNumber || 'N/A'],
            ['Amount Paid:', formatCurrency(paymentData.amount)],
            ['Payment Method:', paymentData.paymentMode === 'mpesa' ? 'M-Pesa' : paymentData.paymentMode === 'bank' ? 'Bank Transfer' : 'N/A'],
            ['Reference/Transaction ID:', paymentData.reference || 'N/A'],
            ['Payment Date:', paymentData.paymentDate ? new Date(paymentData.paymentDate).toLocaleDateString() : 'N/A']
        ];
        
        if (paymentData.paymentMode === 'bank' && paymentData.bankName) {
            details.push(['Bank:', paymentData.bankName]);
        }
        
        if (paymentData.receiptNumber) {
            details.push(['Receipt Number:', paymentData.receiptNumber]);
        }
        
        details.forEach(([label, value]) => {
            doc.setFont(undefined, 'bold');
            doc.text(label, 20, yPos);
            doc.setFont(undefined, 'normal');
            doc.text(value, 80, yPos);
            yPos += 8;
        });
        
        // Footer
        yPos += 15;
        doc.line(20, yPos, 190, yPos);
        yPos += 10;
        doc.setFontSize(9);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, yPos);
        doc.text('This is an official payment receipt.', 105, yPos + 8, { align: 'center' });
        
        // Save the PDF
        const fileName = `payment-receipt-${paymentData.reference || Date.now()}.pdf`;
        doc.save(fileName);
    } catch (error) {
        console.error('PDF generation failed:', error);
        alert('Unable to generate PDF. Please ensure you have a stable internet connection and try again.');
    }
}



// Print receipt
function printReceipt() {
    const content = document.getElementById('receipt-content');
    if (!content) return;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Payment Receipt</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .receipt { max-width: 400px; margin: 0 auto; }
                .header { text-align: center; margin-bottom: 20px; }
                .details { margin: 10px 0; }
                .row { display: flex; justify-content: space-between; margin: 5px 0; }
                .amount { font-size: 18px; font-weight: bold; color: #059669; }
            </style>
        </head>
        <body>
            <div class="receipt">
                ${content.innerHTML}
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
    printWindow.close();
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

// Initialize the portal
async function initializePortal() {
    console.log('Initializing student portal...');
    console.log('Student data from session:', studentData);
    
    showLoading();
    
    try {
    // First check if we already have complete data in session storage
    const hasCompleteData = studentData && studentData.idNumber && 
                           studentData.kcseGrade && studentData.department && 
                           studentData.phoneNumber;
    
    // Update UI with data from session storage
    updateStudentInfo();
    
    // Only fetch from API if we don't have complete data
        if (!hasCompleteData && studentData.admissionNumber) {
        console.log('Fetching complete student data from API...');
        const completeData = await fetchStudentData();
        if (completeData) {
            // Update session storage with complete data
            const updatedStudentData = {...studentData, ...completeData};
            sessionStorage.setItem('studentData', JSON.stringify(updatedStudentData));
                studentData = updatedStudentData;
            // Update UI with complete data
            updateStudentInfo(completeData);
        }
    }
    
    // Fetch and display program cost
        const courseKey = studentData.course;
    let programCost = null;
        if (courseKey) {
            console.log('Fetching program cost for course:', courseKey);
            programCost = await fetchProgramCost(courseKey);
        updateProgramCost(programCost);
    } else {
            console.warn('No course key available');
        updateProgramCost(null);
    }
    
    // Fetch and display payment information
    const admissionNumber = studentData.admissionNumber;
    if (admissionNumber) {
        console.log('Fetching payment data for:', admissionNumber);
        const payments = await fetchStudentPayments(admissionNumber);
            await updateFinancialInfo(programCost, payments);
        
        // Fetch and display student units
        const courseKey = studentData.course;
        if (courseKey) {
            console.log('Fetching units for course:', courseKey);
            await fetchStudentUnits(courseKey);
        } else {
            console.warn('No course key available for fetching units');
            updateUnitsDisplay([]);
        }
    } else {
            console.warn('No admission number available');
        // Update with empty payment data
            await updateFinancialInfo(programCost, []);
        }
        
        setupLogout();
        
        console.log('Portal initialization completed');
    } catch (error) {
        console.error('Error initializing portal:', error);
    } finally {
        hideLoading();
    }
}

// ========================================
// UNIT REGISTRATION FUNCTIONS
// ========================================

// Register a single unit
async function registerSingleUnit(unitId, unitCode, unitName, unitType) {
    try {
        showLoading('Registering unit...');
        
        const studentId = studentData.admissionNumber;
        if (!studentId) {
            throw new Error('Student ID not found');
        }
        
        const unitIds = unitType === 'common' ? [] : [unitId];
        const commonUnitIds = unitType === 'common' ? [unitId] : [];
        
        const response = await fetch(`${API_BASE_URL}/students/register-units`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                studentId,
                unitIds,
                commonUnitIds,
                academicYear: unitsState.apiData?.academicYear || '2024/2025',
                semester: unitsState.apiData?.semester || '1'
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || 'Registration failed');
        }
        
        // Show success message
        showToast(`Successfully registered for ${unitName} (${unitCode})`, 'success');
        
        // Refresh the units display
        await fetchStudentUnits(unitsState.courseCode);
        
    } catch (error) {
        console.error('Error registering unit:', error);
        showToast(error.message || 'Failed to register unit', 'error');
    } finally {
        hideLoading();
    }
}

// Show bulk registration modal
function showBulkRegistrationModal() {
    const unregisteredUnits = unitsState.allUnits.filter(unit => !unit.isRegistered);
    
    if (unregisteredUnits.length === 0) {
        showToast('No unregistered units found', 'info');
        return;
    }
    
    const modalHTML = `
        <div id="bulkRegistrationModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div class="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
                <div class="p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 class="text-lg font-semibold text-gray-800 dark:text-white">Register Units</h2>
                    <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Select units to register for the current semester</p>
                </div>
                
                <div class="p-6 max-h-96 overflow-y-auto">
                    <div class="space-y-3">
                        ${unregisteredUnits.map(unit => `
                            <div class="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                                <input type="checkbox" id="unit_${unit._id}" value="${unit._id}" 
                                       data-type="${unit.type}" data-code="${unit.unitCode}" data-name="${unit.unitName}"
                                       class="w-4 h-4 text-primary bg-gray-100 border-gray-300 rounded focus:ring-primary focus:ring-2">
                                <label for="unit_${unit._id}" class="flex-1 cursor-pointer">
                                    <div class="flex items-center gap-2">
                                        <span class="font-medium text-gray-800 dark:text-white text-sm">${unit.unitName}</span>
                                        ${unit.type === 'common' ? '<span class="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">Common</span>' : ''}
                                    </div>
                                    <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                        <span class="font-mono bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded">${unit.unitCode}</span>
                                    </div>
                                </label>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                    <button onclick="closeBulkRegistrationModal()" class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
                        Cancel
                    </button>
                    <button onclick="processBulkRegistration()" class="px-4 py-2 bg-primary hover:bg-primary/80 text-white rounded-lg transition-colors">
                        <i class="ri-check-line mr-2"></i>
                        Register Selected Units
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Close bulk registration modal
function closeBulkRegistrationModal() {
    const modal = document.getElementById('bulkRegistrationModal');
    if (modal) {
        modal.remove();
    }
}

// Process bulk registration
async function processBulkRegistration() {
    try {
        const selectedUnits = document.querySelectorAll('#bulkRegistrationModal input[type="checkbox"]:checked');
        
        if (selectedUnits.length === 0) {
            showToast('Please select at least one unit to register', 'warning');
            return;
        }
        
        showLoading(`Registering ${selectedUnits.length} units...`);
        
        const studentId = studentData.admissionNumber;
        if (!studentId) {
            throw new Error('Student ID not found');
        }
        
        const unitIds = [];
        const commonUnitIds = [];
        
        selectedUnits.forEach(checkbox => {
            const unitId = checkbox.value;
            const unitType = checkbox.dataset.type;
            
            if (unitType === 'common') {
                commonUnitIds.push(unitId);
            } else {
                unitIds.push(unitId);
            }
        });
        
        const url = `${API_BASE_URL}/students/register-units`;
        console.log('🔍 Bulk Registration API call:', {
            studentId,
            url,
            unitIds,
            commonUnitIds,
            studentData: {
                course: studentData.course,
                name: studentData.name
            }
        });
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                studentId,
                unitIds,
                commonUnitIds,
                academicYear: unitsState.apiData?.academicYear || '2024/2025',
                semester: unitsState.apiData?.semester || '1'
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || 'Registration failed');
        }
        
        // Show success message
        showToast(`Successfully registered ${selectedUnits.length} units`, 'success');
        
        // Close modal
        closeBulkRegistrationModal();
        
        // Refresh the units display
        await fetchStudentUnits(unitsState.courseCode);
        
    } catch (error) {
        console.error('Error registering units:', error);
        showToast(error.message || 'Failed to register units', 'error');
    } finally {
        hideLoading();
    }
}

// Toast notification function (if not already exists)
function showToast(message, type = 'info') {
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
            <span>${message}</span>
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
}

// ========================================
// DEAN NOTES & MESSAGES FUNCTIONALITY
// ========================================

let allNotes = [];
let currentNotesFilter = 'all';

// Load public notes from Dean
async function loadPublicNotes() {
    try {
        showNotesLoading();
        
        const response = await fetch(`${API_BASE_URL}/students/${encodeURIComponent(studentData.admissionNumber)}/public-notes`);
        if (!response.ok) throw new Error('Failed to load notes');
        
        const data = await response.json();
        allNotes = data.notes || [];
        
        displayNotes();
        updateNotesCount();
        hideNotesLoading();
        
    } catch (error) {
        console.error('Error loading public notes:', error);
        hideNotesLoading();
        showNotesEmpty();
    }
}

// Display notes based on current filter
function displayNotes() {
    const container = document.getElementById('notes-list');
    const emptyState = document.getElementById('notes-empty');
    
    if (!container) return;
    
    // Filter notes
    let filteredNotes = allNotes;
    if (currentNotesFilter === 'unread') {
        filteredNotes = allNotes.filter(note => !note.isRead);
    } else if (currentNotesFilter === 'read') {
        filteredNotes = allNotes.filter(note => note.isRead);
    }
    
    if (filteredNotes.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    
    // Create note cards
    container.innerHTML = filteredNotes.map(note => createNoteCard(note)).join('');
}

// Create note card HTML
function createNoteCard(note) {
    const priorityColors = {
        urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
        normal: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        low: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
    };
    
    const categoryIcons = {
        academic: 'ri-book-line',
        welfare: 'ri-heart-line',
        administrative: 'ri-file-list-line',
        general: 'ri-information-line'
    };
    
    const priorityColor = priorityColors[note.priority] || priorityColors.normal;
    const categoryIcon = categoryIcons[note.category] || categoryIcons.general;
    
    const unreadIndicator = !note.isRead ? `
        <span class="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
    ` : '';
    
    return `
        <div class="note-card relative bg-white dark:bg-gray-800 border ${!note.isRead ? 'border-primary' : 'border-gray-200 dark:border-gray-700'} rounded-lg p-4 hover:shadow-md transition-all cursor-pointer"
             onclick="viewNote('${note._id}')">
            ${unreadIndicator}
            <div class="flex items-start justify-between mb-2">
                <div class="flex items-center space-x-2">
                    <i class="${categoryIcon} text-xl text-gray-600 dark:text-gray-400"></i>
                    <h3 class="font-semibold text-gray-900 dark:text-white ${!note.isRead ? 'font-bold' : ''}">${note.title}</h3>
                </div>
                <span class="px-2 py-1 text-xs font-medium rounded-full ${priorityColor}">
                    ${note.priority}
                </span>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">${note.content}</p>
            <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500">
                <div class="flex items-center space-x-3">
                    <span class="flex items-center">
                        <i class="ri-calendar-line mr-1"></i>
                        ${new Date(note.createdAt).toLocaleDateString()}
                    </span>
                    <span class="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded capitalize">${note.category}</span>
                </div>
                ${!note.isRead ? '<span class="text-primary font-medium">New</span>' : ''}
            </div>
        </div>
    `;
}

// View note details
async function viewNote(noteId) {
    const note = allNotes.find(n => n._id === noteId);
    if (!note) return;
    
    // Show modal with note details
    showNoteModal(note);
    
    // Mark as read if unread
    if (!note.isRead) {
        await markNoteAsRead(noteId);
    }
}

// Show note modal
function showNoteModal(note) {
    const priorityColors = {
        urgent: 'bg-red-600',
        high: 'bg-orange-600',
        normal: 'bg-blue-600',
        low: 'bg-gray-600'
    };
    
    const modal = document.createElement('div');
    modal.id = 'note-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div class="${priorityColors[note.priority]} text-white p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-2xl font-bold">${note.title}</h2>
                        <p class="text-blue-100 mt-1 text-sm">From Dean's Office</p>
                    </div>
                    <button onclick="closeNoteModal()" class="p-2 hover:bg-white/20 rounded-full transition-colors">
                        <i class="ri-close-line text-2xl"></i>
                    </button>
                </div>
                <div class="flex items-center space-x-4 mt-4 text-sm">
                    <span class="flex items-center">
                        <i class="ri-calendar-line mr-2"></i>
                        ${new Date(note.createdAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                    <span class="px-3 py-1 bg-white/20 rounded-full capitalize">${note.category}</span>
                    <span class="px-3 py-1 bg-white/20 rounded-full capitalize">${note.priority} Priority</span>
                </div>
            </div>
            <div class="p-6 overflow-y-auto max-h-[60vh]">
                <div class="prose dark:prose-invert max-w-none">
                    <p class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">${note.content}</p>
                </div>
            </div>
            <div class="bg-gray-50 dark:bg-gray-900 p-4 flex items-center justify-between">
                <p class="text-sm text-gray-600 dark:text-gray-400">
                    Posted: ${new Date(note.createdAt).toLocaleString()}
                </p>
                <button onclick="closeNoteModal()" class="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors">
                    Close
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Close note modal
window.closeNoteModal = function() {
    const modal = document.getElementById('note-modal');
    if (modal) {
        modal.remove();
    }
};

// Mark note as read
async function markNoteAsRead(noteId) {
    try {
        const response = await fetch(`${API_BASE_URL}/students/${encodeURIComponent(studentData.admissionNumber)}/notes/${noteId}/read`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) throw new Error('Failed to mark note as read');
        
        // Update local note status
        const note = allNotes.find(n => n._id === noteId);
        if (note) {
            note.isRead = true;
            note.readAt = new Date();
        }
        
        // Refresh display
        displayNotes();
        updateNotesCount();
        
    } catch (error) {
        console.error('Error marking note as read:', error);
    }
}

// Update notes count
function updateNotesCount() {
    const unreadCount = allNotes.filter(n => !n.isRead).length;
    
    // Update badge in sidebar
    const notesBadge = document.getElementById('notes-badge');
    if (notesBadge) {
        if (unreadCount > 0) {
            notesBadge.textContent = unreadCount;
            notesBadge.classList.remove('hidden');
        } else {
            notesBadge.classList.add('hidden');
        }
    }
    
    // Update unread tab badge
    const unreadCountEl = document.getElementById('unread-count');
    if (unreadCountEl) {
        if (unreadCount > 0) {
            unreadCountEl.textContent = unreadCount;
            unreadCountEl.classList.remove('hidden');
        } else {
            unreadCountEl.classList.add('hidden');
        }
    }
}

// Show/hide loading state
function showNotesLoading() {
    const loading = document.getElementById('notes-loading');
    const list = document.getElementById('notes-list');
    const empty = document.getElementById('notes-empty');
    
    if (loading) loading.classList.remove('hidden');
    if (list) list.classList.add('hidden');
    if (empty) empty.classList.add('hidden');
}

function hideNotesLoading() {
    const loading = document.getElementById('notes-loading');
    const list = document.getElementById('notes-list');
    
    if (loading) loading.classList.add('hidden');
    if (list) list.classList.remove('hidden');
}

function showNotesEmpty() {
    const empty = document.getElementById('notes-empty');
    if (empty) empty.classList.remove('hidden');
}

// Initialize notes section
function initializeNotes() {
    // Load notes
    loadPublicNotes();
    
    // Refresh button
    const refreshBtn = document.getElementById('refresh-notes-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadPublicNotes);
    }
    
    // Filter tabs
    const filterTabs = document.querySelectorAll('.notes-filter-tab');
    filterTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // Remove active state from all tabs
            filterTabs.forEach(t => {
                t.classList.remove('border-primary', 'text-primary');
                t.classList.add('border-transparent', 'text-gray-600', 'dark:text-gray-400');
            });
            
            // Add active state to clicked tab
            this.classList.remove('border-transparent', 'text-gray-600', 'dark:text-gray-400');
            this.classList.add('border-primary', 'text-primary');
            
            // Update filter
            currentNotesFilter = this.dataset.filter;
            displayNotes();
        });
    });
    
    // Poll for new notes every 5 minutes
    setInterval(loadPublicNotes, 5 * 60 * 1000);
}

// Load student data when the page loads
document.addEventListener('DOMContentLoaded', function() {
    // Check if student is logged in
        if (!studentData || !studentData.admissionNumber) {
        console.warn('No student data found, redirecting to login');
            window.location.href = '/student/login';
            return;
        }

    initializePortal();
    
    // Initialize notes section
    initializeNotes();
});