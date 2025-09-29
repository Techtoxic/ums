// Finance Dashboard JavaScript

// Course to Program Name Mapping (same as student portal)
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

// Function to format course names for display
function formatCourseName(courseCode) {
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

// DOM Elements
// DOM Elements
const studentTable = document.getElementById('student-table-body');
const searchInput = document.getElementById('search-student');
const departmentFilter = document.getElementById('department-filter');
const yearFilter = document.getElementById('year-filter');
const paymentModal = document.getElementById('payment-modal');
const closeModalBtn = document.getElementById('close-modal');
const paymentForm = document.getElementById('payment-form');
const studentIdInput = document.getElementById('student-id');
const studentNameInput = document.getElementById('student-name');
const paymentModeSelect = document.getElementById('payment-mode');
const bankDetailsDiv = document.getElementById('bank-details');
const bankSelect = document.getElementById('bank-name');
const amountInput = document.getElementById('payment-amount');
const updateProgramForm = document.getElementById('update-program-form');
const programsTable = document.getElementById('recent-programs-body');
const selectProgramDropdown = document.getElementById('select-program');
const programDepartmentDisplay = document.getElementById('program-department-display');
const programCostUpdate = document.getElementById('program-cost-update');

// Pagination and UI controls
const prevProgramsBtn = document.getElementById('prevPrograms');
const nextProgramsBtn = document.getElementById('nextPrograms');
const programsInfo = document.getElementById('programsInfo');
const toggleSidebar = document.getElementById('toggleSidebar');
const sidebar = document.getElementById('sidebar');
const sidebarTitle = document.getElementById('sidebar-title');
const studentCountSpan = document.getElementById('student-count');

// API Base URL
const API_BASE_URL = 'http://localhost:5502/api';

// Global variables for pagination and filtering
let currentProgramPage = 0;
let allPrograms = [];
let allStudents = [];
let filteredStudents = [];
const PROGRAMS_PER_PAGE = 5;
let sidebarCollapsed = false;

// Initialize the dashboard
async function initializeDashboard() {
    await Promise.all([
        loadStudents(),
        loadPrograms()
    ]);
    setupEventListeners();
    setupSidebar();
}

// Load all students with financial information
async function loadStudents() {
    try {
        // Fetch students data
        const studentsResponse = await fetch(`${API_BASE_URL}/students`);
        if (!studentsResponse.ok) throw new Error('Failed to fetch students');
        const students = await studentsResponse.json();
        
        // Fetch programs data for costs
        const programsResponse = await fetch(`${API_BASE_URL}/programs`);
        if (!programsResponse.ok) throw new Error('Failed to fetch programs');
        const programs = await programsResponse.json();
        
        // Fetch payments data
        const paymentsResponse = await fetch(`${API_BASE_URL}/payments`);
        const payments = paymentsResponse.ok ? await paymentsResponse.json() : [];
        
        // Process and display students with financial information
        displayStudents(students, programs, payments);
    } catch (error) {
        console.error('Error loading data:', error);
        studentTable.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-center text-red-500">Error loading student data. ${error.message}</td></tr>`;
    }
}

// Display students in the table
function displayStudents(students, programs, payments) {
    allStudents = students;
    filteredStudents = [...students];
    
    if (!students.length) {
        studentTable.innerHTML = '<tr><td colspan="8" class="px-3 py-3 text-center text-sm">No students found</td></tr>';
        updateStudentCount(0);
        return;
    }
    
    renderStudentTable(students, programs, payments);
    updateStudentCount(students.length);
}

// Render student table with current filtered data
function renderStudentTable(students, programs, payments) {
    // Clear the table
    studentTable.innerHTML = '';
    
    // Process each student
    students.forEach(student => {
        // Find program cost using course mapping (exact match only)
        const programName = courseToProgram[student.course];
        const program = programs.find(p => p.programName && p.programName.toLowerCase() === (programName || '').toLowerCase());
        const programCost = program ? program.programCost : 67189; // Default to standard cost
        
        // Calculate total paid
        const studentPayments = payments.filter(payment => payment.studentId === student.admissionNumber);
        const totalPaid = studentPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
        
        // Calculate balance (program cost minus payments)
        const balance = Math.max(0, programCost - totalPaid);
        
        // Get department name
        const departmentMap = {
            'applied_science': 'Applied Science',
            'agriculture': 'Agriculture',
            'building_civil': 'Building & Civil',
            'electromechanical': 'Electromechanical',
            'hospitality': 'Hospitality',
            'business_liberal': 'Business & Liberal',
            'computing_informatics': 'Computing & Informatics'
        };
        const departmentName = departmentMap[student.department] || student.department || 'N/A';
        
        // Create table row
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        row.setAttribute('data-department', student.department || '');
        row.setAttribute('data-year', student.year || '');
        const intakeText = student.intake ? 
            (student.intake.charAt(0).toUpperCase() + student.intake.slice(1) + ' ' + (student.intakeYear || '')) : 'N/A';
            
        row.innerHTML = `
            <td class="px-3 py-2 text-sm">${student.admissionNumber || 'N/A'}</td>
            <td class="px-3 py-2 text-sm">${student.name || 'N/A'}</td>
            <td class="px-3 py-2 text-sm">${formatCourseName(student.course)}</td>
            <td class="px-3 py-2 text-sm">${departmentName}</td>
            <td class="px-3 py-2 text-sm">Year ${student.year || 'N/A'}</td>
            <td class="px-3 py-2 text-sm">${intakeText}</td>
            <td class="px-3 py-2 text-sm">${formatCurrency(totalPaid)}</td>
            <td class="px-3 py-2 text-sm">${formatCurrency(balance)}</td>
            <td class="px-3 py-2 text-sm">
                <div class="flex space-x-1">
                    <button 
                        class="add-payment-btn bg-primary text-white px-2 py-1 rounded hover:bg-secondary transition-colors text-xs"
                        data-student-id="${student.admissionNumber}"
                        data-student-name="${student.name}"
                        data-balance="${balance}"
                        data-program-cost="${programCost}"
                    >
                        Add Payment
                    </button>
                    ${studentPayments.length > 0 ? `
                    <button 
                        class="view-receipts-btn bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 transition-colors text-xs"
                        data-student-id="${student.admissionNumber}"
                        data-student-name="${student.name}"
                    >
                        Receipts
                    </button>
                    ` : ''}
                </div>
            </td>
        `;
        
        studentTable.appendChild(row);
    });
    
    // Add event listeners to the Add Payment buttons
    document.querySelectorAll('.add-payment-btn').forEach(btn => {
        btn.addEventListener('click', () => openPaymentModal(btn.dataset));
    });
    
    // Add event listeners to the View Receipts buttons
    document.querySelectorAll('.view-receipts-btn').forEach(btn => {
        btn.addEventListener('click', () => showStudentPaymentReceipts(btn.dataset));
    });
}

// Show student payment receipts
async function showStudentPaymentReceipts(data) {
    try {
        const studentId = data.studentId;
        const studentName = data.studentName;
        
        // Fetch all payments for this student
        const response = await fetch(`${API_BASE_URL}/payments`);
        if (!response.ok) throw new Error('Failed to load payments');
        
        const allPayments = await response.json();
        const studentPayments = allPayments.filter(payment => payment.studentId === studentId);
        
        if (studentPayments.length === 0) {
            showToast('No payments found for this student', 'info');
            return;
        }
        
        // Generate a receipt for each payment or show selection modal
        if (studentPayments.length === 1) {
            // If only one payment, generate receipt directly
            if (window.generatePaymentReceipt) {
                window.generatePaymentReceipt(studentPayments[0], { name: studentName, course: 'N/A' });
            }
        } else {
            // Show modal to select which payment receipt to generate
            showPaymentSelectionModal(studentPayments, { name: studentName, studentId });
        }
    } catch (error) {
        console.error('Error loading student payments:', error);
        showToast('Failed to load payment receipts', 'error');
    }
}

// Show payment selection modal for multiple payments
function showPaymentSelectionModal(payments, student) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg max-w-md w-full max-h-96 overflow-y-auto">
            <div class="p-4 border-b">
                <h3 class="text-lg font-semibold">Select Payment Receipt</h3>
                <p class="text-sm text-gray-600">Student: ${student.name}</p>
            </div>
            <div class="p-4 space-y-2">
                ${payments.map(payment => `
                    <button class="w-full text-left p-3 border rounded hover:bg-gray-50 payment-receipt-btn" 
                            data-payment='${JSON.stringify(payment)}'>
                        <div class="flex justify-between">
                            <span>Date: ${payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : 'N/A'}</span>
                            <span>KES ${(payment.amount || 0).toLocaleString()}</span>
                        </div>
                        <div class="text-sm text-gray-600">
                            Mode: ${formatPaymentModeForDisplay(payment.paymentMode)}
                        </div>
                    </button>
                `).join('')}
            </div>
            <div class="p-4 border-t">
                <button class="w-full px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400" 
                        onclick="this.closest('.fixed').remove()">Close</button>
            </div>
        </div>
    `;
    
    // Add event listeners for payment buttons
    modal.querySelectorAll('.payment-receipt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const payment = JSON.parse(btn.dataset.payment);
            if (window.generatePaymentReceipt) {
                window.generatePaymentReceipt(payment, student);
            }
            modal.remove();
        });
    });
    
    document.body.appendChild(modal);
}

// Helper function to format payment mode for display
function formatPaymentModeForDisplay(paymentMode) {
    if (!paymentMode) return 'N/A';
    const modes = {
        'mpesa': 'M-Pesa',
        'bank': 'Bank Transfer',
        'bursary': 'CDF Bursary'
    };
    return modes[paymentMode] || paymentMode;
}

// Format currency
function formatCurrency(amount) {
    return typeof amount === 'number' 
        ? amount.toLocaleString('en-KE', { style: 'currency', currency: 'KES' })
        : 'N/A';
}

// Setup event listeners
function setupEventListeners() {
    // Search functionality
    if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
    }
    
    // Filters
    if (departmentFilter) {
        departmentFilter.addEventListener('change', applyFilters);
    }
    if (yearFilter) {
        yearFilter.addEventListener('change', applyFilters);
    }
    
    // Close modal
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closePaymentModal);
    }
    
    // Payment mode change
    if (paymentModeSelect) {
        paymentModeSelect.addEventListener('change', toggleBankDetails);
    }
    
    // Payment form submission
    if (paymentForm) {
        paymentForm.addEventListener('submit', handlePaymentSubmission);
    }
    
    // Program form submission
    if (updateProgramForm) {
        updateProgramForm.addEventListener('submit', handleProgramUpdateSubmission);
    }
    
    // Program selection change
    if (selectProgramDropdown) {
        selectProgramDropdown.addEventListener('change', handleProgramSelection);
    }
    
    // Program pagination
    if (prevProgramsBtn) {
        prevProgramsBtn.addEventListener('click', () => changeProgramPage(-1));
    }
    if (nextProgramsBtn) {
        nextProgramsBtn.addEventListener('click', () => changeProgramPage(1));
    }
}

// Handle search and apply filters
function handleSearch() {
    applyFilters();
}

function applyFilters() {
    const searchTerm = (searchInput?.value || '').toLowerCase();
    const selectedDept = departmentFilter?.value || '';
    const selectedYear = yearFilter?.value || '';
    
    const filtered = allStudents.filter(student => {
        // Text search
        const matchesSearch = !searchTerm || 
            (student.name || '').toLowerCase().includes(searchTerm) ||
            (student.admissionNumber || '').toLowerCase().includes(searchTerm) ||
            (student.course || '').toLowerCase().includes(searchTerm);
        
        // Department filter
        const matchesDept = !selectedDept || student.department === selectedDept;
        
        // Year filter
        const matchesYear = !selectedYear || String(student.year) === selectedYear;
        
        return matchesSearch && matchesDept && matchesYear;
    });
    
    filteredStudents = filtered;
    
    // Re-fetch programs and payments for filtered students
    loadStudentsData(filtered);
}

async function loadStudentsData(students) {
    try {
        const programsResponse = await fetch(`${API_BASE_URL}/programs`);
        const programs = programsResponse.ok ? await programsResponse.json() : [];
        
        const paymentsResponse = await fetch(`${API_BASE_URL}/payments`);
        const payments = paymentsResponse.ok ? await paymentsResponse.json() : [];
        
        renderStudentTable(students, programs, payments);
        updateStudentCount(students.length);
    } catch (error) {
        console.error('Error loading student data:', error);
    }
}

function updateStudentCount(count) {
    if (studentCountSpan) {
        studentCountSpan.textContent = count;
    }
}

// Open payment modal
function openPaymentModal(data) {
    studentIdInput.value = data.studentId || '';
    studentNameInput.value = data.studentName || '';
    amountInput.value = '';
    paymentModeSelect.value = 'mpesa'; // Default to MPesa
    toggleBankDetails(); // Update visibility based on default
    
    paymentModal.classList.remove('hidden');
}

// Close payment modal
function closePaymentModal() {
    paymentModal.classList.add('hidden');
}

// Toggle payment details based on payment mode
function toggleBankDetails() {
    const paymentMode = paymentModeSelect.value;
    const bankDetailsDiv = document.getElementById('bank-details');
    const mpesaDetailsDiv = document.getElementById('mpesa-details');
    const bursaryDetailsDiv = document.getElementById('bursary-details');
    const receiptField = document.getElementById('receipt-number');
    const mpesaTransactionField = document.getElementById('mpesa-transaction-id');
    const bursaryNoteField = document.getElementById('bursary-note');
    
    // Hide all detail sections first
    bankDetailsDiv?.classList.add('hidden');
    mpesaDetailsDiv?.classList.add('hidden');
    bursaryDetailsDiv?.classList.add('hidden');
    
    // Clear and reset required fields
    if (receiptField) {
        receiptField.required = false;
        receiptField.value = '';
    }
    if (mpesaTransactionField) {
        mpesaTransactionField.required = false;
        mpesaTransactionField.value = '';
    }
    if (bursaryNoteField) {
        bursaryNoteField.required = false;
        bursaryNoteField.value = '';
    }
    
    // Show relevant section based on payment mode
    if (paymentMode === 'bank') {
        bankDetailsDiv?.classList.remove('hidden');
        if (receiptField) {
            receiptField.required = true;
            receiptField.placeholder = 'Enter bank slip number';
        }
    } else if (paymentMode === 'mpesa') {
        mpesaDetailsDiv?.classList.remove('hidden');
        if (mpesaTransactionField) {
            mpesaTransactionField.required = true;
            mpesaTransactionField.placeholder = 'Enter M-Pesa transaction ID (e.g., QJI8XS8L9D)';
        }
    } else if (paymentMode === 'bursary') {
        bursaryDetailsDiv?.classList.remove('hidden');
        if (bursaryNoteField) {
            bursaryNoteField.required = true;
            bursaryNoteField.placeholder = 'Enter note/reference';
        }
    }
}

// Handle payment submission
async function handlePaymentSubmission(event) {
    event.preventDefault();
    
    console.log('Payment submission started');
    console.log('Elements:', { 
        studentIdInput: !!studentIdInput, 
        amountInput: !!amountInput, 
        paymentModeSelect: !!paymentModeSelect 
    });
    
    // Get form values
    const studentId = studentIdInput?.value;
    const amount = parseFloat(amountInput?.value || 0);
    const paymentMode = paymentModeSelect?.value || 'mpesa';
    
    console.log('Form values:', { studentId, amount, paymentMode });
    
    // Get payment-specific fields
    const bankName = paymentMode === 'bank' ? bankSelect.value : null;
    const receiptNumber = document.getElementById('receipt-number')?.value || null;
    const mpesaTransactionId = document.getElementById('mpesa-transaction-id')?.value || null;
    const bursaryNote = document.getElementById('bursary-note')?.value || null;
    const paymentDate = document.getElementById('payment-date')?.value || new Date().toISOString().split('T')[0];
    
    // Validate form
    if (!studentId || isNaN(amount) || amount <= 0) {
        alert('Please fill all required fields with valid values');
        return;
    }
    
    // Validate required fields based on payment mode
    if (paymentMode === 'bank' && (!receiptNumber || receiptNumber.trim() === '')) {
        alert('Please enter the receipt/slip number for bank transfer');
        return;
    }
    
    if (paymentMode === 'mpesa' && (!mpesaTransactionId || mpesaTransactionId.trim() === '')) {
        alert('Please enter the M-Pesa transaction ID');
        return;
    }
    
    if (paymentMode === 'bursary' && (!bursaryNote || bursaryNote.trim() === '')) {
        alert('Please enter the bursary note/reference');
        return;
    }
    
    try {
        // Create payment object with mode-specific data
        const payment = {
            studentId,
            amount,
            paymentMode,
            bankName,
            receiptNumber,
            mpesaTransactionId,
            bursaryReference: paymentMode === 'bursary' ? `CDF-${bursaryNote}` : null,
            paymentDate: new Date(paymentDate).toISOString(),
            reference: generateReference(paymentMode, { mpesaTransactionId, bursaryNote, receiptNumber }),
        };
        
        // Send payment to API
        const response = await fetch(`${API_BASE_URL}/payments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payment)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to save payment');
        }
        
        // Close modal and reload students
        closePaymentModal();
        await loadStudents();
        
        // Show success message
        showToast('Payment added successfully!', 'success');
    } catch (error) {
        console.error('Error adding payment:', error);
        showToast(`Error adding payment: ${error.message}`, 'error');
    }
}

// Generate payment reference
function generateReference(paymentMode, details = {}) {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    
    switch (paymentMode) {
        case 'mpesa':
            // Use the actual M-Pesa transaction ID if provided
            return details.mpesaTransactionId || `MPESA-${timestamp}-${random}`;
        case 'bank':
            // Use bank receipt number if provided
            return details.receiptNumber || `BANK-${timestamp}-${random}`;
        case 'bursary':
            // Use the CDF- format
            return `CDF-${details.bursaryNote || timestamp}`;
        default:
            return `PAY-${timestamp}-${random}`;
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    // Set toast color based on type
    let bgColor = '';
    switch (type) {
        case 'success':
            bgColor = 'bg-success';
            break;
        case 'error':
            bgColor = 'bg-danger';
            break;
        case 'warning':
            bgColor = 'bg-warning';
            break;
        default:
            bgColor = 'bg-primary';
    }
    
    // Set toast content and style
    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-xl text-white transform translate-y-full opacity-0 transition-all duration-300 shadow-lg z-50 ${bgColor}`;
    toast.textContent = message;
    
    // Show toast
    setTimeout(() => {
        toast.classList.remove('translate-y-full', 'opacity-0');
    }, 100);
    
    // Hide toast after 3 seconds
    setTimeout(() => {
        toast.classList.add('translate-y-full', 'opacity-0');
    }, 3000);
}

// Load programs
async function loadPrograms() {
    try {
        const response = await fetch(`${API_BASE_URL}/programs`);
        if (!response.ok) throw new Error('Failed to fetch programs');
        const programs = await response.json();
        displayPrograms(programs);
        populateProgramDropdown(programs);
    } catch (error) {
        console.error('Error loading programs:', error);
        if (programsTable) {
            programsTable.innerHTML = `<tr><td colspan="4" class="px-4 py-3 text-center text-red-500">Error loading programs. ${error.message}</td></tr>`;
        }
        if (selectProgramDropdown) {
            selectProgramDropdown.innerHTML = '<option value="">Error loading programs</option>';
        }
    }
}

// Display programs in the table with pagination
function displayPrograms(programs) {
    if (!programsTable) return;
    
    allPrograms = programs;
    
    if (!programs.length) {
        programsTable.innerHTML = '<tr><td colspan="3" class="px-3 py-2 text-center text-sm">No programs found</td></tr>';
        updateProgramsInfo(0, 0, 0);
        return;
    }
    
    // Sort programs alphabetically
    const sortedPrograms = [...programs].sort((a, b) => a.programName.localeCompare(b.programName));
    
    // Calculate pagination
    const totalPrograms = sortedPrograms.length;
    const totalPages = Math.ceil(totalPrograms / PROGRAMS_PER_PAGE);
    const startIndex = currentProgramPage * PROGRAMS_PER_PAGE;
    const endIndex = Math.min(startIndex + PROGRAMS_PER_PAGE, totalPrograms);
    const currentPrograms = sortedPrograms.slice(startIndex, endIndex);
    
    // Clear the table
    programsTable.innerHTML = '';
    
    // Process each program
    currentPrograms.forEach(program => {
        // Map department codes to readable names
        const departmentMap = {
            'applied_science': 'Applied Science',
            'agriculture': 'Agriculture',
            'building_civil': 'Building & Civil',
            'electromechanical': 'Electromechanical',
            'hospitality': 'Hospitality',
            'business_liberal': 'Business & Liberal',
            'computing_informatics': 'Computing & Informatics'
        };
        
        const departmentName = departmentMap[program.department] || program.department;
        
        // Create table row
        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50';
        row.innerHTML = `
            <td class="px-3 py-2 text-sm">${program.programName}</td>
            <td class="px-3 py-2 text-sm">${departmentName}</td>
            <td class="px-3 py-2 text-sm">${formatCurrency(program.programCost)}</td>
        `;
        
        programsTable.appendChild(row);
    });
    
    // Update pagination info and buttons
    updateProgramsInfo(startIndex + 1, endIndex, totalPrograms);
    updateProgramButtons(currentProgramPage, totalPages);
}

function updateProgramsInfo(start, end, total) {
    if (programsInfo) {
        programsInfo.textContent = `Showing programs ${start}-${end} of ${total}`;
    }
}

function updateProgramButtons(currentPage, totalPages) {
    if (prevProgramsBtn) {
        prevProgramsBtn.disabled = currentPage === 0;
    }
    if (nextProgramsBtn) {
        nextProgramsBtn.disabled = currentPage >= totalPages - 1;
    }
}

function changeProgramPage(direction) {
    const totalPages = Math.ceil(allPrograms.length / PROGRAMS_PER_PAGE);
    const newPage = currentProgramPage + direction;
    
    if (newPage >= 0 && newPage < totalPages) {
        currentProgramPage = newPage;
        displayPrograms(allPrograms);
    }
}



// Show delete confirmation modal
function showDeleteConfirmation(programId, programName) {
    if (!confirmationModal) return;
    
    modalTitle.textContent = 'Confirm Delete';
    modalMessage.textContent = `Are you sure you want to delete the program "${programName}"? This action cannot be undone.`;
    
    // Set up confirm button
    modalConfirmBtn.textContent = 'Delete';
    modalConfirmBtn.className = 'px-4 py-2 bg-danger text-white rounded-lg hover:bg-red-600 transition-colors';
    
    // Set up the delete action
    modalConfirmBtn.onclick = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/programs/${programId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) throw new Error('Failed to delete program');
            
            // Close modal and reload data
            closeConfirmationModal();
            await Promise.all([loadPrograms(), loadStudents()]);
            
            // Show success message
            showToast('Program deleted successfully!', 'success');
        } catch (error) {
            console.error('Error deleting program:', error);
            showToast(`Error deleting program: ${error.message}`, 'error');
            closeConfirmationModal();
        }
    };
    
    // Show the modal
    confirmationModal.classList.remove('hidden');
}

// Close confirmation modal
function closeConfirmationModal() {
    if (confirmationModal) {
        confirmationModal.classList.add('hidden');
    }
}

// Generate fees statement function (placeholder)
function generateFeesStatement() {
    showToast('Generating fees statement...', 'info');
    // Implementation would go here
}

// Populate program dropdown
function populateProgramDropdown(programs) {
    if (!selectProgramDropdown) return;
    
    // Clear existing options
    selectProgramDropdown.innerHTML = '<option value="">Select a program...</option>';
    
    // Sort programs by name
    const sortedPrograms = [...programs].sort((a, b) => a.programName.localeCompare(b.programName));
    
    // Add programs to dropdown
    sortedPrograms.forEach(program => {
        const option = document.createElement('option');
        option.value = program._id;
        option.textContent = program.programName;
        option.dataset.department = program.department;
        option.dataset.cost = program.programCost;
        selectProgramDropdown.appendChild(option);
    });
}

// Handle program selection
function handleProgramSelection() {
    const selectedOption = selectProgramDropdown.options[selectProgramDropdown.selectedIndex];
    
    if (selectedOption.value) {
        // Auto-fill department
        const departmentMap = {
            'applied_science': 'Applied Science Department',
            'agriculture': 'Agriculture Department',
            'building_civil': 'Building and Civil Department',
            'electromechanical': 'Electromechanical Department',
            'hospitality': 'Hospitality Department',
            'business_liberal': 'Business and Liberal Studies',
            'computing_informatics': 'Computing and Informatics'
        };
        
        const departmentName = departmentMap[selectedOption.dataset.department] || selectedOption.dataset.department;
        programDepartmentDisplay.value = departmentName;
        
        // Show current cost in placeholder
        programCostUpdate.placeholder = `Current cost: KES ${parseFloat(selectedOption.dataset.cost).toLocaleString()}`;
        programCostUpdate.value = '';
    } else {
        programDepartmentDisplay.value = '';
        programCostUpdate.placeholder = 'Enter new cost';
        programCostUpdate.value = '';
    }
}

// Handle program update submission
async function handleProgramUpdateSubmission(event) {
    event.preventDefault();
    
    const programId = selectProgramDropdown.value;
    const newCost = parseFloat(programCostUpdate.value);
    
    // Validate form
    if (!programId || isNaN(newCost) || newCost < 0) {
        showToast('Please select a program and enter a valid cost', 'error');
        return;
    }
    
    try {
        // Update program cost
        const response = await fetch(`${API_BASE_URL}/programs/${programId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                programCost: newCost
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to update program cost');
        }
        
        // Reset form and reload data
        updateProgramForm.reset();
        programDepartmentDisplay.value = '';
        programCostUpdate.placeholder = 'Enter new cost';
        await Promise.all([loadPrograms(), loadStudents()]);
        
        // Show success message
        showToast('Program cost updated successfully!', 'success');
    } catch (error) {
        console.error('Error updating program cost:', error);
        showToast(`Error updating program cost: ${error.message}`, 'error');
    }
}

// Setup sidebar collapse functionality
function setupSidebar() {
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
                const darkModeToggle = sidebar.querySelector('#dark-mode-toggle');
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
                const darkModeToggle = sidebar.querySelector('#dark-mode-toggle');
                if (darkModeToggle) {
                    const darkModeSpan = darkModeToggle.querySelector('span');
                    if (darkModeSpan) darkModeSpan.classList.remove('hidden');
                    darkModeToggle.classList.remove('w-full', 'justify-center');
                    darkModeToggle.classList.add('gap-2');
                }
            }
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeDashboard);