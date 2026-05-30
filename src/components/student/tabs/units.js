// tabs/units.js — units & courses tab: listing, pagination, single + bulk registration.

window.StudentTabs = window.StudentTabs || {};

// Dynamic academic year (Sept–Aug) fallback when API data is unavailable.
function unitsAcademicYearFallback() {
    const now = new Date();
    const y = now.getFullYear();
    return now.getMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

// (verbatim from studentPortal.js)
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

        const response = await authFetch(url);
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
                    
                    console.log('Units section balance calculation:', {
                        courseKey,
                        programCost,
                        apiProgramCost: data.programCost,
                        paymentsCount: payments.length
                    });
                    
                    // Calculate balance using same method as dashboard
                    const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
                    const moduleOfStudy = studentData.module || 1;
                    const totalFees = programCost * moduleOfStudy;
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

    // Get the course name for display. courseCode is the program CODE (e.g. 'GA5');
    // resolve its display name via the shared DB-backed Catalog helper.
    const courseName = (window.Catalog && window.Catalog.formatCourseName(courseCode))
        || courseCode?.replace(/_/g, ' ').toUpperCase() || 'Your Course';

    const unitsHTML = `
        <!-- Course Header -->
        <div class="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-lg p-4 mb-6">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                    <h3 class="text-lg font-semibold text-gray-800 dark:text-white">${escapeHtml(courseName)}</h3>
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
                                                ${escapeHtml(unit.unitName)}
                                            </h4>
                                            ${unit.type === 'common' ? '<span class="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">Common</span>' : ''}
                                        </div>
                                        <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                            <span class="font-mono bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded text-xs">
                                                ${escapeHtml(unit.unitCode)}
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
                                                <button onclick="registerSingleUnit('${escapeAttr(unit._id)}', '${escapeAttr(unit.unitCode)}', '${escapeAttr(unit.unitName)}', '${escapeAttr(unit.type)}')" 
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
        
        const response = await authFetch(`${API_BASE_URL}/students/register-units`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                studentId,
                unitIds,
                commonUnitIds,
                academicYear: unitsState.apiData?.academicYear || unitsAcademicYearFallback(),
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
                    <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Select units to register for the current intake</p>
                </div>
                
                <div class="p-6 max-h-96 overflow-y-auto">
                    <div class="space-y-3">
                        ${unregisteredUnits.map(unit => `
                            <div class="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                                <input type="checkbox" id="unit_${escapeAttr(unit._id)}" value="${escapeAttr(unit._id)}" 
                                       data-type="${escapeAttr(unit.type)}" data-code="${escapeAttr(unit.unitCode)}" data-name="${escapeAttr(unit.unitName)}"
                                       class="w-4 h-4 text-primary bg-gray-100 border-gray-300 rounded focus:ring-primary focus:ring-2">
                                <label for="unit_${escapeAttr(unit._id)}" class="flex-1 cursor-pointer">
                                    <div class="flex items-center gap-2">
                                        <span class="font-medium text-gray-800 dark:text-white text-sm">${escapeHtml(unit.unitName)}</span>
                                        ${unit.type === 'common' ? '<span class="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">Common</span>' : ''}
                                    </div>
                                    <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                        <span class="font-mono bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded">${escapeHtml(unit.unitCode)}</span>
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
        console.log('Bulk Registration API call:', {
            studentId,
            url,
            unitIds,
            commonUnitIds,
            studentData: {
                course: studentData.course,
                name: studentData.name
            }
        });
        
        const response = await authFetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                studentId,
                unitIds,
                commonUnitIds,
                academicYear: unitsState.apiData?.academicYear || unitsAcademicYearFallback(),
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

window.StudentTabs.units = {
    async init() {
        const courseKey = studentData.course;
        if (courseKey) {
            await fetchStudentUnits(courseKey);
        } else {
            console.warn('No course key available for fetching units');
            updateUnitsDisplay([]);
        }
    }
};
