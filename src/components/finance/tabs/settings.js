// tabs/settings.js — finance settings: fee threshold config.
window.FinanceTabs = window.FinanceTabs || {};

// (verbatim inline block)
        // Load system settings when settings section is shown
        async function loadSystemSettings() {
            try {
                const API_BASE_URL = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : `${window.location.protocol}//${window.location.host}/api`;
                const response = await window.AUTH.fetch(`${API_BASE_URL}/system-settings`);
                if (!response.ok) {
                    throw new Error('Failed to load system settings');
                }
                
                const settings = await response.json();
                console.log('Loaded system settings:', settings);
                
                // Update UI with current settings
                settings.forEach(setting => {
                    switch (setting.key) {
                        case 'fee_threshold':
                            document.getElementById('feeThreshold').value = setting.value;
                            document.getElementById('currentThreshold').textContent = `KES ${setting.value?.toLocaleString() || '0'}`;
                            break;
                        case 'current_academic_year':
                            document.getElementById('currentAcademicYear').textContent = setting.value || 'Not Set';
                            break;
                        case 'current_semester':
                            document.getElementById('currentSemester').textContent = `Semester ${setting.value || 'Not Set'}`;
                            break;
                        case 'registration_enabled':
                            document.getElementById('registrationEnabled').textContent = setting.value ? 'Enabled' : 'Disabled';
                            break;
                    }
                });
                
            } catch (error) {
                console.error('Error loading system settings:', error);
                showToast('Failed to load system settings', 'error');
            }
        }

        // Update fee threshold
        async function updateFeeThreshold() {
            try {
                const thresholdInput = document.getElementById('feeThreshold');
                const newThreshold = parseInt(thresholdInput.value);
                
                if (!newThreshold || newThreshold < 0) {
                    showToast('Please enter a valid threshold amount', 'error');
                    return;
                }
                
                const API_BASE_URL = window.APP_CONFIG ? window.APP_CONFIG.API_BASE_URL : `${window.location.protocol}//${window.location.host}/api`;
                const response = await window.AUTH.fetch(`${API_BASE_URL}/system-settings/fee_threshold`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        value: newThreshold,
                        description: 'Minimum fee balance required for unit registration'
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Failed to update fee threshold');
                }
                
                const result = await response.json();
                console.log('Updated fee threshold:', result);
                
                // Update the display
                document.getElementById('currentThreshold').textContent = `KES ${newThreshold.toLocaleString()}`;
                
                // Show success message
                showToast(`Fee threshold updated to KES ${newThreshold.toLocaleString()}`, 'success');
                
                // Show status
                showThresholdStatus('Threshold updated successfully! Students with outstanding balances above this amount will be blocked from registering for units.', 'success');
                
            } catch (error) {
                console.error('Error updating fee threshold:', error);
                showToast('Failed to update fee threshold', 'error');
                showThresholdStatus('Failed to update threshold. Please try again.', 'error');
            }
        }

        // Show threshold status message
        function showThresholdStatus(message, type) {
            const statusDiv = document.getElementById('thresholdStatus');
            statusDiv.className = `mt-4 p-3 rounded-lg ${
                type === 'success' ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' :
                'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`;
            
            statusDiv.innerHTML = `
                <div class="flex items-center gap-2">
                    <i class="ri-${type === 'success' ? 'check' : 'error-warning'}-line text-${type === 'success' ? 'green' : 'red'}-600"></i>
                    <span class="text-sm font-medium text-${type === 'success' ? 'green' : 'red'}-800 dark:text-${type === 'success' ? 'green' : 'red'}-200">
                        ${escapeHtml(message)}
                    </span>
                </div>
            `;
            
            statusDiv.classList.remove('hidden');
            
            // Hide after 5 seconds
            setTimeout(() => {
                statusDiv.classList.add('hidden');
            }, 5000);
        }

window.FinanceTabs.settings = {
    init() { loadSystemSettings(); }
};
