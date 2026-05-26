// tabs/graduation.js — graduation application tab: eligibility check + submit.

window.StudentTabs = window.StudentTabs || {};

// (verbatim from the monolith inline script)
        // Check graduation eligibility and load form
        async function checkGraduationEligibility() {
            try {
                console.log('🎓 checkGraduationEligibility called');
                console.log('📊 studentData:', studentData);
                
                const studentId = studentData?.admissionNumber;
                console.log('🆔 Student ID:', studentId);
                
                if (!studentId) {
                    console.error('No student ID found for graduation, studentData:', studentData);
                    
                    // Try to wait for studentData to load
                    if (!studentData || !studentData.admissionNumber) {
                        console.log('⏳ Waiting for student data to load...');
                        setTimeout(checkGraduationEligibility, 500);
                        return;
                    }
                    return;
                }

                const response = await window.AUTH.fetch(`${API_BASE_URL}/students/${encodeURIComponent(studentId)}/graduation-eligibility`);
                const data = await response.json();

                const eligibilityDiv = document.getElementById('graduation-eligibility');
                const formDiv = document.getElementById('graduation-form');
                const existingDiv = document.getElementById('graduation-existing');
                const ineligibleDiv = document.getElementById('graduation-ineligible');

                // Hide loading
                eligibilityDiv.classList.add('hidden');

                if (data.hasExistingApplication) {
                    // Show existing application
                    existingDiv.classList.remove('hidden');
                    const detailsDiv = document.getElementById('graduation-existing-details');
                    const app = data.existingApplication;
                    detailsDiv.innerHTML = `
                        <p><strong>Application Date:</strong> ${app.appliedAt ? new Date(app.appliedAt).toLocaleDateString() : 'N/A'}</p>
                        <p><strong>Status:</strong> <span class="capitalize">${escapeHtml((app.status || '').replace('_', ' '))}</span></p>
                        ${app.comments ? `<p><strong>Comments:</strong> ${escapeHtml(app.comments)}</p>` : ''}
                    `;
                } else if (!data.canApply) {
                    // Show ineligible
                    ineligibleDiv.classList.remove('hidden');
                    document.getElementById('graduation-ineligible-reason').textContent = data.reason;
                } else {
                    // Show form
                    formDiv.classList.remove('hidden');
                    populateGraduationForm(data);
                }
            } catch (error) {
                console.error('Error checking graduation eligibility:', error);
                const eligibilityDiv = document.getElementById('graduation-eligibility');
                eligibilityDiv.innerHTML = 
                    `<div class="text-center py-4 text-red-600">
                        <i class="ri-error-warning-line text-2xl mb-2"></i>
                        <p>Error checking eligibility: ${escapeHtml(error.message)}</p>
                        <button onclick="checkGraduationEligibility()" class="mt-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-secondary transition-colors">
                            Try Again
                        </button>
                    </div>`;
            }
        }

        // Populate graduation form with student data
        function populateGraduationForm(data) {
            console.log('🎓 Populating graduation form with data:', data);
            console.log('👤 Student data:', studentData);
            
            // Basic student info
            document.querySelector('.graduation-student-name').textContent = studentData.name || 'N/A';
            document.querySelector('.graduation-student-admission').textContent = studentData.admissionNumber || 'N/A';
            document.querySelector('.graduation-student-course').textContent = formatCourseName(studentData.course);
            document.querySelector('.graduation-student-level').textContent = `Level ${data.level}`;
            document.querySelector('.graduation-student-year').textContent = `Year ${data.yearOfStudy}`;
            
            // Additional fields - intake formatting (same logic as profile section)
            console.log('🎓 Intake data for graduation:', { 
                intake: studentData.intake, 
                intakeYear: studentData.intakeYear 
            });
            
            let intakeText = 'N/A';
            if (studentData.intake && studentData.intakeYear) {
                const formattedIntake = studentData.intake.charAt(0).toUpperCase() + studentData.intake.slice(1);
                intakeText = `${formattedIntake} ${studentData.intakeYear}`;
            } else if (studentData.intake || studentData.intakeYear) {
                // Fallback if only one field is available
                const intake = studentData.intake || 'Unknown';
                const year = studentData.intakeYear || new Date().getFullYear();
                const formattedIntake = intake.charAt(0).toUpperCase() + intake.slice(1);
                intakeText = `${formattedIntake} ${year}`;
            } else {
                // Final fallback - extract from admission number if possible (same logic as profile)
                const admissionNumber = studentData.admissionNumber || '';
                const intakeMatch = admissionNumber.match(/\/([JS]\d{2})$/);
                if (intakeMatch) {
                    const intakeCode = intakeMatch[1];
                    const intakePrefix = intakeCode.charAt(0);
                    const yearSuffix = intakeCode.slice(1);
                    const fullYear = '20' + yearSuffix;
                    const intakeName = intakePrefix === 'J' ? 'January' : 'September';
                    intakeText = `${intakeName} ${fullYear}`;
                    console.log('✅ Extracted intake from admission number for graduation:', intakeText);
                } else {
                    console.warn('⚠️ No intake data found in studentData for graduation');
                }
            }
            
            document.querySelector('.graduation-student-intake').textContent = intakeText;
            document.querySelector('.graduation-student-phone').textContent = studentData.phoneNumber || 'N/A';

            const statusInfo = document.getElementById('graduation-status-info');
            statusInfo.innerHTML = `
                <div class="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <p class="text-sm text-green-700 dark:text-green-300">✓ Eligible to apply for graduation</p>
                    <p class="text-xs text-green-600 dark:text-green-400 mt-1">Level ${escapeHtml(data.level)} students can apply in Year ${escapeHtml(data.yearOfStudy)}</p>
                </div>
            `;
        }

        // Submit graduation application
        async function submitGraduationApplication() {
            try {
                showLoading('Submitting graduation application...');
                
                const studentId = studentData.admissionNumber;
                const response = await window.AUTH.fetch(`${API_BASE_URL}/students/${encodeURIComponent(studentId)}/graduation-application`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.message || 'Failed to submit application');
                }

                showToast('Graduation application submitted successfully!', 'success');
                
                // Refresh the page to show updated status
                setTimeout(() => {
                    checkGraduationEligibility();
                }, 1000);

            } catch (error) {
                console.error('Error submitting graduation application:', error);
                showToast(error.message || 'Failed to submit application', 'error');
            } finally {
                hideLoading();
            }
        }

// Exposed for the inline onclick="checkGraduationEligibility()" retry button.
window.checkGraduationEligibility = checkGraduationEligibility;

window.StudentTabs.graduation = {
    // The submit button lives in this partial (injected on first visit), so wire
    // it here once, then run the eligibility check (the monolith did this via
    // setTimeout in activateTab + a DOMContentLoaded button binding).
    init() {
        const btn = document.getElementById('submit-graduation');
        if (btn && !btn.__wired) {
            btn.__wired = true;
            btn.addEventListener('click', submitGraduationApplication);
        }
        setTimeout(checkGraduationEligibility, 100);
    }
};
