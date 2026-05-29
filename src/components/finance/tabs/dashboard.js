// tabs/dashboard.js — finance dashboard: student fees table, payment modal, programs.
// The confirmationModal + payment-modal markup ships inside dashboard.html.
window.FinanceTabs = window.FinanceTabs || {};

// ---- dashboard state (verbatim financeDashboard.js) ----
// Global variables for pagination and filtering
let currentProgramPage = 0;
let allPrograms = [];
let allStudents = [];
let filteredStudents = [];
const PROGRAMS_PER_PAGE = 5;
let sidebarCollapsed = false;

// Dashboard element refs. In the monolith these were top-level consts captured
// at script-load; under lazy partials the dashboard markup is injected later,
// so they are declared here and (re)captured by cacheDashboardEls(), invoked at
// the top of init() once the partial is in the DOM.
let studentTable, searchInput, departmentFilter, yearFilter, paymentModal, closeModalBtn, paymentForm, studentIdInput, studentNameInput, paymentModeSelect, bankDetailsDiv, bankSelect, amountInput, updateProgramForm, programsTable, selectProgramDropdown, programDepartmentDisplay, programCostUpdate, prevProgramsBtn, nextProgramsBtn, programsInfo, toggleSidebar, sidebar, sidebarTitle, studentCountSpan;
function cacheDashboardEls() {
studentTable = document.getElementById('student-table-body');
searchInput = document.getElementById('search-student');
departmentFilter = document.getElementById('department-filter');
yearFilter = document.getElementById('year-filter');
paymentModal = document.getElementById('payment-modal');
closeModalBtn = document.getElementById('close-modal');
paymentForm = document.getElementById('payment-form');
studentIdInput = document.getElementById('student-id');
studentNameInput = document.getElementById('student-name');
paymentModeSelect = document.getElementById('payment-mode');
bankDetailsDiv = document.getElementById('bank-details');
bankSelect = document.getElementById('bank-name');
amountInput = document.getElementById('payment-amount');
updateProgramForm = document.getElementById('update-program-form');
programsTable = document.getElementById('recent-programs-body');
selectProgramDropdown = document.getElementById('select-program');
programDepartmentDisplay = document.getElementById('program-department-display');
programCostUpdate = document.getElementById('program-cost-update');

// Pagination and UI controls
prevProgramsBtn = document.getElementById('prevPrograms');
nextProgramsBtn = document.getElementById('nextPrograms');
programsInfo = document.getElementById('programsInfo');
toggleSidebar = document.getElementById('toggleSidebar');
sidebar = document.getElementById('sidebar');
sidebarTitle = document.getElementById('sidebar-title');
studentCountSpan = document.getElementById('student-count');
}

// initializeDashboard — verbatim body, prefixed with cacheDashboardEls() so the
// element refs are captured after the dashboard partial is injected.
async function initializeDashboard() {
    cacheDashboardEls();
    // Populate the department filter from the shared Catalog (DB-backed). Option
    // VALUES are snake_case textCodes; "" = all. Catalog.ready() already ran in
    // the portal bootstrap before the router started this tab.
    if (window.Catalog && departmentFilter) {
        window.Catalog.populateDepartmentSelect(departmentFilter, { includeAll: true, allLabel: 'All Departments' });
    }
    await Promise.all([
        loadStudents(),
        loadPrograms()
    ]);
    setupEventListeners();
    setupSidebar();
}

// ---- dashboard functions (verbatim financeDashboard.js) ----
// Load all students with financial information
async function loadStudents() {
    try {
        // Fetch students data
        const studentsResponse = await authFetch(`${API_BASE_URL}/students`);
        if (!studentsResponse.ok) throw new Error('Failed to fetch students');
        const students = await studentsResponse.json();
        
        // Fetch programs data for costs
        const programsResponse = await authFetch(`${API_BASE_URL}/programs`);
        if (!programsResponse.ok) throw new Error('Failed to fetch programs');
        const programs = await programsResponse.json();
        
        // Fetch payments data
        const paymentsResponse = await authFetch(`${API_BASE_URL}/payments`);
        const payments = paymentsResponse.ok ? await paymentsResponse.json() : [];
        
        // Process and display students with financial information
        displayStudents(students, programs, payments);
    } catch (error) {
        console.error('Error loading data:', error);
        studentTable.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-center text-red-500">Error loading student data. ${escapeHtml(error.message)}</td></tr>`;
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
        // Find program cost via the shared Catalog helper. student.course holds
        // the program CODE (e.g. 'GA5'); programByCode returns the program object.
        const program = window.Catalog
            ? window.Catalog.programByCode(student.course)
            : programs.find(p => String(p.code || '').toUpperCase() === String(student.course || '').toUpperCase());
        const programCost = program ? program.programCost : 67189; // Default to standard cost
        
        // Calculate total fees based on year of study (programCost is per year)
        const moduleOfStudy = student.module || 1;
        const totalFees = programCost * moduleOfStudy;
        
        // Calculate total paid
        const studentPayments = payments.filter(payment => payment.studentId === student.admissionNumber);
        const totalPaid = studentPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        
        // Calculate balance (total fees minus payments) - allow negative values for overpayment
        const balance = totalFees - totalPaid;
        
        // Get department display name from the shared Catalog helper.
        // student.department stores the snake_case textCode (e.g. 'agriculture').
        const departmentName = window.Catalog
            ? (window.Catalog.departmentName(student.department) || 'N/A')
            : (student.department || 'N/A');
        
        // Create table row
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        row.setAttribute('data-department', student.department || '');
        row.setAttribute('data-module', student.module || '');
        const intakeText = student.intake ? 
            (student.intake.charAt(0).toUpperCase() + student.intake.slice(1) + ' ' + (student.intakeYear || '')) : 'N/A';
            
        row.innerHTML = `
            <td class="px-3 py-2 text-sm">${escapeHtml(student.admissionNumber || 'N/A')}</td>
            <td class="px-3 py-2 text-sm">${escapeHtml(student.name || 'N/A')}</td>
            <td class="px-3 py-2 text-sm">${escapeHtml(formatCourseName(student.course))}</td>
            <td class="px-3 py-2 text-sm">${escapeHtml(departmentName)}</td>
            <td class="px-3 py-2 text-sm">Module ${student.module || 'N/A'}</td>
            <td class="px-3 py-2 text-sm">${escapeHtml(intakeText)}</td>
            <td class="px-3 py-2 text-sm font-semibold">${formatCurrency(totalFees)}</td>
            <td class="px-3 py-2 text-sm">${formatCurrency(totalPaid)}</td>
            <td class="px-3 py-2 text-sm ${balance > 0 ? 'text-red-600' : 'text-green-600'} font-semibold">${formatCurrency(balance)}</td>
            <td class="px-3 py-2 text-sm">
                <div class="flex space-x-1">
                    <button 
                        class="add-payment-btn bg-primary text-white px-2 py-1 rounded hover:bg-secondary transition-colors text-xs"
                        data-student-id="${escapeAttr(student.admissionNumber)}"
                        data-student-name="${escapeAttr(student.name)}"
                        data-balance="${balance}"
                        data-total-fees="${totalFees}"
                    >
                        Add Payment
                    </button>
                    ${studentPayments.length > 0 ? `
                    <button 
                        class="view-receipts-btn bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 transition-colors text-xs"
                        data-student-id="${escapeAttr(student.admissionNumber)}"
                        data-student-name="${escapeAttr(student.name)}"
                        data-student-course="${escapeAttr(student.course || '')}"
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

        // Fetch full student data to get course information
        let studentData = { name: studentName, course: data.studentCourse || 'N/A' };
        try {
            const studentResponse = await authFetch(`${API_BASE_URL}/students/admission/${encodeURIComponent(studentId)}`);
            if (studentResponse.ok) {
                const fullStudent = await studentResponse.json();
                
                // Fetch program data to get the full program name
                let programName = formatCourseName(fullStudent.course);
                try {
                    const programsResponse = await authFetch(`${API_BASE_URL}/programs`);
                    if (programsResponse.ok) {
                        const programs = await programsResponse.json();
                        const program = programs.find(p => p.code === fullStudent.course);
                        if (program) {
                            programName = program.name;
                        }
                    }
                } catch (progErr) {
                    console.warn('Could not fetch program data, using formatted course name:', progErr);
                }
                
                studentData = {
                    name: fullStudent.name || studentName,
                    course: fullStudent.course || 'N/A',
                    programName: programName,
                    admissionNumber: fullStudent.admissionNumber,
                    department: fullStudent.department
                };
            }
        } catch (err) {
            console.warn('Could not fetch full student data, using available info:', err);
        }

        // Fetch all payments for this student
        const response = await authFetch(`${API_BASE_URL}/payments`);
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
                window.generatePaymentReceipt(studentPayments[0], studentData);
            }
        } else {
            // Show modal to select which payment receipt to generate
            showPaymentSelectionModal(studentPayments, studentData);
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
        <div class="bg-white rounded-lg max-w-2xl w-full max-h-[600px] overflow-hidden flex flex-col">
            <div class="p-4 border-b">
                <h3 class="text-lg font-semibold">All Payment Receipts</h3>
                <p class="text-sm text-gray-600">Student: ${escapeHtml(student.name)} | Total Payments: ${payments.length}</p>
            </div>
            <div class="p-4 overflow-y-auto flex-1">
                <div class="space-y-2">
                    ${payments.map((payment, index) => `
                        <button class="w-full text-left p-3 border rounded hover:bg-gray-50 payment-receipt-btn transition-colors" 
                                data-payment='${escapeAttr(JSON.stringify(payment))}'>
                            <div class="flex justify-between items-start">
                                <div class="flex-1">
                                    <div class="flex items-center gap-2 mb-1">
                                        <span class="font-medium text-gray-700">#${payments.length - index}</span>
                                        <span class="text-sm text-gray-500">Date: ${payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}</span>
                                    </div>
                                    <div class="text-sm text-gray-600">
                                        Mode: ${escapeHtml(formatPaymentModeForDisplay(payment.paymentMode))}
                                        ${payment.reference ? ` | Ref: ${escapeHtml(payment.reference)}` : ''}
                                    </div>
                                </div>
                                <div class="text-right">
                                    <div class="font-semibold text-green-600">KES ${Number(payment.amount || 0).toLocaleString()}</div>
                                    <span class="text-xs text-gray-500">Click to view</span>
                                </div>
                            </div>
                        </button>
                    `).join('')}
                </div>
            </div>
            <div class="p-4 border-t bg-gray-50">
                <div class="flex justify-between items-center mb-3">
                    <span class="font-medium text-gray-700">Total Paid:</span>
                    <span class="font-bold text-lg text-green-600">KES ${payments.reduce((sum, p) => sum + Number(p.amount || 0), 0).toLocaleString()}</span>
                </div>
                <button class="w-full px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors" 
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
            // Don't remove modal - let user view multiple receipts
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
    // Decimal128 fields serialize to strings via toJSON — coerce before formatting.
    const n = Number(amount);
    return Number.isFinite(n)
        ? n.toLocaleString('en-KE', { style: 'currency', currency: 'KES' })
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
        const matchesYear = !selectedYear || String(student.module) === selectedYear;
        
        return matchesSearch && matchesDept && matchesYear;
    });
    
    filteredStudents = filtered;
    
    // Re-fetch programs and payments for filtered students
    loadStudentsData(filtered);
}

async function loadStudentsData(students) {
    try {
        const programsResponse = await authFetch(`${API_BASE_URL}/programs`);
        const programs = programsResponse.ok ? await programsResponse.json() : [];
        
        const paymentsResponse = await authFetch(`${API_BASE_URL}/payments`);
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
        const response = await authFetch(`${API_BASE_URL}/payments`, {
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

// Load programs
async function loadPrograms() {
    try {
        const response = await authFetch(`${API_BASE_URL}/programs`);
        if (!response.ok) throw new Error('Failed to fetch programs');
        const programs = await response.json();
        displayPrograms(programs);
        populateProgramDropdown(programs);
    } catch (error) {
        console.error('Error loading programs:', error);
        if (programsTable) {
            programsTable.innerHTML = `<tr><td colspan="4" class="px-4 py-3 text-center text-red-500">Error loading programs. ${escapeHtml(error.message)}</td></tr>`;
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
    const sortedPrograms = [...programs].sort((a, b) => a.name.localeCompare(b.name));
    
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
        // V2: /api/programs now includes departmentName (joined server-side from
        // the departments table by departmentId). Fall back to 'Unknown' if absent.
        const departmentName = program.departmentName || 'Unknown';

        // Create table row
        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50';
        row.innerHTML = `
            <td class="px-3 py-2 text-sm">${escapeHtml(program.name)}</td>
            <td class="px-3 py-2 text-sm">${escapeHtml(departmentName)}</td>
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
            const response = await authFetch(`${API_BASE_URL}/programs/${programId}`, {
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

// Populate program dropdown
function populateProgramDropdown(programs) {
    if (!selectProgramDropdown) return;
    
    // Clear existing options
    selectProgramDropdown.innerHTML = '<option value="">Select a program...</option>';
    
    // Sort programs by name
    const sortedPrograms = [...programs].sort((a, b) => a.name.localeCompare(b.name));
    
    // Add programs to dropdown
    sortedPrograms.forEach(program => {
        const option = document.createElement('option');
        option.value = program._id;
        option.textContent = program.name;
        option.dataset.department = program.departmentName || '';
        option.dataset.cost = program.programCost;
        selectProgramDropdown.appendChild(option);
    });
}

// Handle program selection
function handleProgramSelection() {
    const selectedOption = selectProgramDropdown.options[selectProgramDropdown.selectedIndex];
    
    if (selectedOption.value) {
        // Auto-fill department. /api/programs already returns departmentName as a
        // readable display name (joined server-side), stored in the option's
        // dataset — no code->name mapping needed.
        const departmentName = selectedOption.dataset.department || 'N/A';
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
        const response = await authFetch(`${API_BASE_URL}/programs/${programId}`, {
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

// ---- payment receipt PDF (verbatim inline block) ----
                // Generate individual payment receipt (formal payslip-style format)
        function generatePaymentReceipt(payment, student = null) {
            try {
                // Create PDF receipt
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF('p', 'mm', 'a4');

                // Dark red/maroon color for header (RGB: 122, 12, 12)
                const headerColor = [122, 12, 12];
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();

                // ========================================
                // HEADER BANNER (Dark Red Background)
                // ========================================
                doc.setFillColor(...headerColor);
                doc.rect(0, 0, pageWidth, 40, 'F');

                // Institution Name (White text on red background)
                doc.setTextColor(255, 255, 255); // White
                doc.setFontSize(16);
                doc.setFont(undefined, 'bold');
                doc.text('EMURUA DIKIRR TECHNICAL TRAINING INSTITUTE', pageWidth / 2, 12, { align: 'center' });

                // Contact Information
                doc.setFontSize(9);
                doc.setFont(undefined, 'normal');
                doc.text('P.O. Box 49, Emurua Dikirr - 20500', pageWidth / 2, 18, { align: 'center' });
                doc.text('Tel: +254 729 123 456 | Email: info@emurua-tech.ac.ke', pageWidth / 2, 23, { align: 'center' });
                doc.text('Website: www.emurua-tech.ac.ke', pageWidth / 2, 28, { align: 'center' });
                doc.setFontSize(8);
                doc.text('ISO 9001:2015 Certified Institution', pageWidth / 2, 34, { align: 'center' });

                // ========================================
                // RECEIPT TITLE AND REFERENCE
                // ========================================
                doc.setTextColor(0, 0, 0); // Black text
                doc.setFontSize(18);
                doc.setFont(undefined, 'bold');
                doc.text('PAYMENT RECEIPT', pageWidth / 2, 55, { align: 'center' });

                // Receipt date
                const paymentDate = payment.paymentDate ? new Date(payment.paymentDate) : new Date();
                const monthYear = paymentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                doc.setFontSize(12);
                doc.setFont(undefined, 'normal');
                doc.text(monthYear, pageWidth / 2, 62, { align: 'center' });

                // Reference and Date (left and right aligned)
                const receiptRef = `Ref: EDTTI/RECEIPT/2025/${payment._id ? payment._id.slice(-6) : (payment.reference || 'N/A').slice(-6)}`;
                const formattedDate = paymentDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
                
                doc.setFontSize(10);
                doc.text(receiptRef, 20, 70);
                doc.text(`Date: ${formattedDate}`, pageWidth - 20, 70, { align: 'right' });

                // ========================================
                // STUDENT INFORMATION SECTION
                // ========================================
                let yPos = 85;
                doc.setFontSize(12);
                doc.setFont(undefined, 'bold');
                doc.text('STUDENT INFORMATION', 20, yPos);
                
                yPos += 8;
                doc.setFontSize(10);
                doc.setFont(undefined, 'normal');
                
                // Use program name if available, otherwise format course code
                let programDisplay = 'N/A';
                if (student?.programName) {
                    programDisplay = student.programName;
                } else if (student?.course) {
                    // Fallback: Convert course code to readable format
                    programDisplay = student.course.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                }

                doc.text(`Name: ${student?.name || 'N/A'}`, 20, yPos);
                yPos += 7;
                doc.text(`Admission Number: ${payment.studentId || student?.admissionNumber || 'N/A'}`, 20, yPos);
                yPos += 7;
                doc.text(`Program: ${programDisplay}`, 20, yPos);
                if (student?.department) {
                    yPos += 7;
                    const deptName = student.department.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    doc.text(`Department: ${deptName}`, 20, yPos);
                }

                // ========================================
                // PAYMENT DETAILS SECTION (Table Style)
                // ========================================
                yPos += 15;
                doc.setFontSize(12);
                doc.setFont(undefined, 'bold');
                doc.text('PAYMENT DETAILS', 20, yPos);

                // Table header background (dark red)
                yPos += 8;
                doc.setFillColor(...headerColor);
                doc.rect(20, yPos - 5, pageWidth - 40, 8, 'F');

                // Table headers (white text)
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(10);
                doc.setFont(undefined, 'bold');
                doc.text('Description', 25, yPos);
                doc.text('Amount (KES)', pageWidth - 25, yPos, { align: 'right' });

                // Table content (black text on white background)
                yPos += 8;
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(10);
                doc.setFont(undefined, 'normal');
                
                // Format payment mode properly
                let paymentModeDisplay = 'N/A';
                if (payment.paymentMode) {
                    const modes = {
                        'mpesa': 'M-Pesa Payment',
                        'bank': 'Bank Transfer',
                        'bursary': 'CDF Bursary'
                    };
                    paymentModeDisplay = modes[payment.paymentMode] || payment.paymentMode;
                }

                doc.text(paymentModeDisplay, 25, yPos);
                doc.text(Number(payment.amount || 0).toLocaleString(), pageWidth - 25, yPos, { align: 'right' });

                // Add reference details below
                yPos += 10;
                doc.setFontSize(9);
                if (payment.paymentMode === 'bursary' && payment.bursaryReference) {
                    doc.text(`Bursary Reference: ${payment.bursaryReference}`, 25, yPos);
                    yPos += 6;
                } else if (payment.paymentMode === 'mpesa' && payment.mpesaTransactionId) {
                    doc.text(`M-Pesa Transaction ID: ${payment.mpesaTransactionId}`, 25, yPos);
                    yPos += 6;
                } else if (payment.paymentMode === 'bank' && payment.receiptNumber) {
                    doc.text(`Bank Receipt Number: ${payment.receiptNumber}`, 25, yPos);
                    yPos += 6;
                    if (payment.bankName) {
                        doc.text(`Bank: ${payment.bankName}`, 25, yPos);
                        yPos += 6;
                    }
                }

                // ========================================
                // FOOTER
                // ========================================
                doc.setFontSize(9);
                doc.setFont(undefined, 'normal');
                doc.text('This is an official payment receipt from Emurua Dikirr Technical Training Institute', pageWidth / 2, pageHeight - 20, { align: 'center' });
                doc.text(`Generated on ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })} | Student Portal: ums.emurua-tech.ac.ke`, pageWidth / 2, pageHeight - 15, { align: 'center' });

                // Save the PDF
                const filename = `payment_receipt_${(payment.studentId || 'student').replace(/\//g, '_')}_${Date.now()}.pdf`;
                doc.save(filename);

                showToast('Payment receipt generated successfully!', 'success');
            } catch (error) {
                console.error('Error generating receipt:', error);
                showToast('Failed to generate payment receipt', 'error');
            }
        }

        // Add function to generate receipt for a specific payment (for testing)
        window.generatePaymentReceipt = generatePaymentReceipt;

window.FinanceTabs.dashboard = {
    init() { initializeDashboard(); }
};
