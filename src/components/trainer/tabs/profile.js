// tabs/profile.js — trainer profile settings.
window.TrainerTabs = window.TrainerTabs || {};

// (verbatim from trainerDashboard.js)
async function handleProfileUpdate(event) {
    event.preventDefault();
    
    const email = document.getElementById('profileEmail').value.trim();
    const phone = document.getElementById('profilePhone').value.trim();
    
    try {
        const response = await authFetch(`${API_BASE_URL}/trainers/${currentTrainer._id}/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, phone })
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Failed to update profile');
        }
        
        // Update current trainer data — re-fetch from server so cookie-backed identity stays authoritative
        currentTrainer = (await window.AUTH.me({ force: true })) || { ...currentTrainer, ...data.trainer };

        // Update UI
        updateTrainerInfo();

        showToast('Profile updated successfully', 'success');
        
    } catch (error) {
        console.error('❌ Error updating profile:', error);
        showToast(`Failed to update profile: ${error.message}`, 'error');
    }
}

function resetProfileForm() {
    updateTrainerInfo();
    showToast('Form reset to original values', 'info');
}

window.TrainerTabs.profile = {
    init() {
        currentSection = 'profile';
        updateTrainerInfo();   // fill profile fields from currentTrainer
        // Wire the profile form once (initializeUI's bootstrap attempt no-ops
        // because the profile partial is not in the DOM then).
        if (!window.__trProfileWired) {
            window.__trProfileWired = true;
            const form = document.getElementById('profileForm');
            if (form) form.addEventListener('submit', handleProfileUpdate);
        }
    }
};
