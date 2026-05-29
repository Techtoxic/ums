// tabs/profile.js — HOD profile view + profile-update modal.
window.HODTabs = window.HODTabs || {};

// (verbatim from hodDashboard.js)
// Show profile update modal
function showProfileUpdateModal(needsEmailUpdate, needsPhoneUpdate) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
    modal.id = 'profile-update-modal';
    
    let title, description;
    if (needsEmailUpdate && needsPhoneUpdate) {
        title = 'Update Contact Information';
        description = 'Please update your email address and phone number to keep your account secure and receive important notifications.';
    } else if (needsEmailUpdate) {
        title = 'Update Email Address';
        description = 'Please update your email address to keep your account secure and receive important notifications.';
    } else {
        title = 'Update Phone Number';
        description = 'Please add your phone number to receive important notifications.';
    }
    
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md transform transition-all duration-300 scale-95">
            <div class="p-6 border-b border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between">
                    <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-100">${escapeHtml(title)}</h3>
                    <button onclick="closeProfileUpdateModal()" class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                        <i class="ri-close-line text-xl text-gray-600 dark:text-gray-400"></i>
                    </button>
                </div>
            </div>
            <form id="profile-update-form" class="p-6">
                <div class="space-y-4">
                    <p class="text-gray-600 dark:text-gray-400 text-sm">${escapeHtml(description)}</p>

                    <div>
                        <label for="hod-email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            <i class="ri-mail-line mr-2 text-blue-600"></i>Email Address
                        </label>
                        <input
                            type="email"
                            id="hod-email"
                            value="${currentHOD.email || ''}"
                            placeholder="Enter your email address"
                            class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                            ${needsEmailUpdate ? 'required' : ''}
                        >
                    </div>

                    <div>
                        <label for="hod-phone" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            <i class="ri-phone-line mr-2 text-blue-600"></i>Phone Number
                        </label>
                        <input
                            type="tel"
                            id="hod-phone"
                            value="${currentHOD.phone || ''}"
                            placeholder="Enter your phone number"
                            class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                            ${needsPhoneUpdate ? 'required' : ''}
                        >
                    </div>

                    <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <div class="flex items-start">
                            <i class="ri-information-line text-blue-600 mr-2 mt-0.5"></i>
                            <div class="text-sm text-blue-700 dark:text-blue-300">
                                <p class="font-medium mb-1">Important Notes:</p>
                                <ul class="list-disc list-inside space-y-1 text-xs">
                                    <li>Use a valid email address you have access to</li>
                                    <li>Phone number will be used for important notifications</li>
                                    <li>Make sure the information is spelled correctly</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flex gap-3 pt-6">
                    <button type="button" onclick="closeProfileUpdateModal()" class="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        Skip for now
                    </button>
                    <button type="submit" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                        <span id="profile-update-btn-text">Update Profile</span>
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Handle form submission
    document.getElementById('profile-update-form').addEventListener('submit', handleProfileUpdate);
    
    // Make functions globally available
    window.closeProfileUpdateModal = function() {
        document.body.removeChild(modal);
        delete window.closeProfileUpdateModal;
    };
}

// Handle profile update
async function handleProfileUpdate(e) {
    e.preventDefault();
    
    const emailInput = document.getElementById('hod-email');
    const phoneInput = document.getElementById('hod-phone');
    const submitBtn = document.querySelector('#profile-update-btn-text');
    
    const email = emailInput.value.trim();
    const phone = phoneInput.value.trim();
    
    if (!email && !phone) {
        closeProfileUpdateModal();
        return;
    }
    
    try {
        // Update button state
        submitBtn.textContent = 'Updating...';
        
        const response = await authFetch(`/api/hod/${currentHOD._id}/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, phone })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Update current HOD data — re-fetch from server so the cookie-backed
            // identity stays authoritative.
            currentHOD = (await window.AUTH.me({ force: true })) || { ...currentHOD, ...data.hod };

            // Update UI
            updateHODInfo();
            
            closeProfileUpdateModal();
            showToast('Profile updated successfully', 'success');
        } else {
            showToast(data.message || 'Failed to update profile', 'error');
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        showToast('Error updating profile. Please try again.', 'error');
    } finally {
        // Reset button state
        submitBtn.textContent = 'Update Profile';
    }
}

// Load profile data when profile tab is accessed
function loadProfileData() {
    console.log('Loading profile data...');
    
    if (!currentHOD) {
        console.error('No HOD data available');
        return;
    }
    
    try {
        // Update profile information
        document.getElementById('profile-name').textContent = currentHOD.name || 'N/A';
        document.getElementById('profile-department').textContent = formatDepartmentName(currentHOD.department) || 'N/A';
        document.getElementById('profile-full-name').textContent = currentHOD.name || 'N/A';
        document.getElementById('profile-email').textContent = currentHOD.email || 'Not set';
        document.getElementById('profile-phone').textContent = currentHOD.phone || 'Not set';
        document.getElementById('profile-department-full').textContent = formatDepartmentName(currentHOD.department) || 'N/A';
        
        // Format and display dates
        if (currentHOD.createdAt) {
            const createdDate = new Date(currentHOD.createdAt);
            document.getElementById('profile-created').textContent = createdDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        if (currentHOD.updatedAt) {
            const updatedDate = new Date(currentHOD.updatedAt);
            document.getElementById('profile-updated').textContent = updatedDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        if (currentHOD.lastLogin) {
            const lastLoginDate = new Date(currentHOD.lastLogin);
            document.getElementById('profile-last-login').textContent = lastLoginDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } else {
            document.getElementById('profile-last-login').textContent = 'Never';
        }
        
        // Update account status
        const statusElement = document.getElementById('profile-status');
        if (currentHOD.isActive !== false) {
            statusElement.innerHTML = '<i class="ri-check-circle-line mr-1"></i>Active';
            statusElement.className = 'px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
        } else {
            statusElement.innerHTML = '<i class="ri-close-circle-line mr-1"></i>Inactive';
            statusElement.className = 'px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
        }
        
        console.log('Profile data loaded successfully');
    } catch (error) {
        console.error('Error loading profile data:', error);
        showToast('Error loading profile data', 'error');
    }
}

window.HODTabs.profile = {
    init() { loadProfileData(); }
};
