// tabs/dashboard.js — dashboard tab: financial summary + recent activity.

window.StudentTabs = window.StudentTabs || {};

// (verbatim from studentPortal.js)
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

window.StudentTabs.dashboard = {
    // Mirrors the dashboard half of the monolith's initializePortal(): program
    // cost + payments -> financial summary tiles + recent activity. Idempotent.
    async init() {
        updateStudentInfo();
        const courseKey = studentData.course;
        let programCost = null;
        if (courseKey) {
            programCost = await fetchProgramCost(courseKey);
            updateProgramCost(programCost);
        } else {
            updateProgramCost(null);
        }
        const admissionNumber = studentData.admissionNumber;
        if (admissionNumber) {
            const payments = await fetchStudentPayments(admissionNumber);
            await updateFinancialInfo(programCost, payments);
        } else {
            await updateFinancialInfo(programCost, []);
        }
    }
};
