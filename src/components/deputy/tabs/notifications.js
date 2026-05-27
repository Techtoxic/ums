// tabs/notifications.js — deputy notifications.
window.DeputyTabs = window.DeputyTabs || {};

// (verbatim from the monolith inline scripts)
        // Load notifications data
        async function loadNotificationsData() {
            try {
                const response = await window.AUTH.fetch(`${API_BASE_URL}/notifications`);
                if (!response.ok) {
                    throw new Error('Failed to fetch notifications');
                }
                
                const notifications = await response.json();
                displayNotifications(notifications);
            } catch (error) {
                console.error('Error loading notifications:', error);
            }
        }

        // Display notifications
        function displayNotifications(notifications) {
            const content = document.getElementById('content-notifications');
            if (!content) return;

            content.innerHTML = `
                <div class="space-y-6">
                    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                        <h2 class="text-xl font-semibold mb-6">System Notifications</h2>
                        <div class="space-y-4">
                            ${notifications.map(notification => `
                                <div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                                    <h4 class="font-medium text-gray-900 dark:text-white">${escapeHtml(notification.title)}</h4>
                                    <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">${escapeHtml(notification.message)}</p>
                                    <p class="text-xs text-gray-500 dark:text-gray-500 mt-2">${new Date(notification.createdAt).toLocaleDateString()}</p>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        }

window.DeputyTabs.notifications = {
    init() { loadNotificationsData(); }
};
