// tabs/attachment.js — attachment application tab: eligibility check + submit.

window.StudentTabs = window.StudentTabs || {};

// (verbatim from the monolith inline script)
        // Check attachment eligibility and load form
        async function checkAttachmentEligibility() {
            try {
                console.log('🔍 checkAttachmentEligibility called');
                console.log('📊 studentData:', studentData);
                
                // Refresh studentData from session storage to ensure we have latest data
                const sessionData = JSON.parse(sessionStorage.getItem('studentData')) || {};
                if (sessionData && Object.keys(sessionData).length > Object.keys(studentData).length) {
                    console.log('🔄 Updating studentData from session storage');
                    studentData = sessionData;
                }
                
                const studentId = studentData?.admissionNumber;
                console.log('🆔 Student ID:', studentId);
                
                if (!studentId) {
                    console.error('No student ID found, studentData:', studentData);
                    
                    // Try to wait for studentData to load
                    if (!studentData || !studentData.admissionNumber) {
                        console.log('⏳ Waiting for student data to load...');
                        setTimeout(checkAttachmentEligibility, 500);
                        return;
                    }
                    return;
                }

                const url = `${API_BASE_URL}/students/${encodeURIComponent(studentId)}/attachment-eligibility`;
                console.log('🌐 API_BASE_URL:', API_BASE_URL);
                console.log('🌐 Fetching URL:', url);
                
                const response = await window.AUTH.fetch(url);
                const data = await response.json();

                const eligibilityDiv = document.getElementById('attachment-eligibility');
                const formDiv = document.getElementById('attachment-form');
                const existingDiv = document.getElementById('attachment-existing');
                const ineligibleDiv = document.getElementById('attachment-ineligible');

                // Hide loading
                eligibilityDiv.classList.add('hidden');

                if (data.hasExistingApplication) {
                    // Show existing application
                    existingDiv.classList.remove('hidden');
                    const detailsDiv = document.getElementById('attachment-existing-details');
                    const app = data.existingApplication;
                    detailsDiv.innerHTML = `
                        <p><strong>Application Date:</strong> ${app.createdAt ? new Date(app.createdAt).toLocaleDateString() : 'N/A'}</p>
                        <p><strong>Status:</strong> <span class="capitalize">${escapeHtml((app.status || '').replace('_', ' '))}</span></p>
                        <p><strong>Location:</strong> ${escapeHtml(app.county || '')}, ${escapeHtml(app.nearestTown || '')}</p>
                        ${app.comments ? `<p><strong>Comments:</strong> ${escapeHtml(app.comments)}</p>` : ''}
                    `;
                } else if (!data.canApply) {
                    // Show ineligible
                    ineligibleDiv.classList.remove('hidden');
                    document.getElementById('attachment-ineligible-reason').textContent = data.reason;
                } else {
                    // Show form
                    formDiv.classList.remove('hidden');
                    populateAttachmentForm(data);
                }
            } catch (error) {
                console.error('Error checking attachment eligibility:', error);
                const eligibilityDiv = document.getElementById('attachment-eligibility');
                eligibilityDiv.innerHTML = 
                    `<div class="text-center py-4 text-red-600">
                        <i class="ri-error-warning-line text-2xl mb-2"></i>
                        <p>Error checking eligibility: ${escapeHtml(error.message)}</p>
                        <button onclick="checkAttachmentEligibility()" class="mt-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-secondary transition-colors">
                            Try Again
                        </button>
                    </div>`;
            }
        }

        // Populate attachment form with student data
        function populateAttachmentForm(data) {
            console.log('📝 Populating attachment form with data:', data);
            console.log('👤 Student data:', studentData);
            console.log('🔍 Student data keys:', Object.keys(studentData));
            console.log('🗓️ Intake fields specifically:', {
                intake: studentData.intake,
                intakeYear: studentData.intakeYear,
                hasIntake: 'intake' in studentData,
                hasIntakeYear: 'intakeYear' in studentData
            });
            
            // Basic student info
            document.querySelector('.attachment-student-name').textContent = studentData.name || 'N/A';
            document.querySelector('.attachment-student-admission').textContent = studentData.admissionNumber || 'N/A';
            document.querySelector('.attachment-student-course').textContent = formatCourseName(studentData.course);
            document.querySelector('.attachment-student-level').textContent = `Level ${data.level}`;
            document.querySelector('.attachment-student-year').textContent = `Year ${data.yearOfStudy}`;
            
            // Additional fields - intake formatting (same logic as profile section)
            console.log('🗓️ Intake data for attachment:', { 
                intake: studentData.intake, 
                intakeYear: studentData.intakeYear,
                fullStudentData: studentData 
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
                    console.log('✅ Extracted intake from admission number for attachment:', intakeText);
                } else {
                    console.warn('⚠️ No intake data found in studentData for attachment');
                }
            }
            
            document.querySelector('.attachment-student-intake').textContent = intakeText;
            document.querySelector('.attachment-student-phone').textContent = studentData.phoneNumber || 'N/A';
        }

        // Submit attachment application
        async function submitAttachmentApplication() {
            try {
                const county = document.getElementById('attachment-county').value;
                const town = document.getElementById('attachment-town').value;

                if (!county || !town) {
                    showToast('Please select county and enter nearest town', 'error');
                    return;
                }

                showLoading('Submitting attachment application...');
                
                const studentId = studentData.admissionNumber;
                const response = await window.AUTH.fetch(`${API_BASE_URL}/students/${encodeURIComponent(studentId)}/attachment-application`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        county: county,
                        nearestTown: town
                    })
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.message || 'Failed to submit application');
                }

                showToast('Attachment application submitted successfully!', 'success');
                
                // Refresh the page to show updated status
                setTimeout(() => {
                    checkAttachmentEligibility();
                }, 1000);

            } catch (error) {
                console.error('Error submitting attachment application:', error);
                showToast(error.message || 'Failed to submit application', 'error');
            } finally {
                hideLoading();
            }
        }

// Exposed for the inline onclick="checkAttachmentEligibility()" retry button.
window.checkAttachmentEligibility = checkAttachmentEligibility;

window.StudentTabs.attachment = {
    init() {
        const btn = document.getElementById('submit-attachment');
        if (btn && !btn.__wired) {
            btn.__wired = true;
            btn.addEventListener('click', submitAttachmentApplication);
        }
        setTimeout(checkAttachmentEligibility, 100);
    }
};
