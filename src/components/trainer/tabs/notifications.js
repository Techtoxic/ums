// tabs/notifications.js — trainer notifications.
window.TrainerTabs = window.TrainerTabs || {};

// (verbatim from trainerDashboard.js)
// Load notifications
async function loadNotifications() {
    try {
        if (!currentTrainer || !currentTrainer._id) {
            console.error('No trainer data available');
            return;
        }

        showNotificationsLoadingState();

        const response = await authFetch(`${API_BASE_URL}/notifications/${currentTrainer._id}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const notifications = await response.json();
        
        console.log(`✅ Successfully loaded ${notifications.length} notifications`);

        displayNotifications(notifications);
        updateNotificationBadge(notifications);

    } catch (error) {
        console.error('❌ Error loading notifications:', error);
        showNotificationsEmptyState();
        showToast(`Failed to load notifications: ${error.message}`, 'error');
    }
}

// Display notifications
function displayNotifications(notifications) {
    const notificationsList = document.getElementById('notificationsList');
    const notificationsEmptyState = document.getElementById('notificationsEmptyState');
    const notificationsLoadingState = document.getElementById('notificationsLoadingState');

    notificationsLoadingState.classList.add('hidden');

    if (notifications.length === 0) {
        notificationsList.classList.add('hidden');
        notificationsEmptyState.classList.remove('hidden');
        return;
    }

    notificationsList.classList.remove('hidden');
    notificationsEmptyState.classList.add('hidden');

    notificationsList.innerHTML = notifications.map(notification => createNotificationCard(notification)).join('');
}

// Create notification card HTML
function createNotificationCard(notification) {
    const isRead = notification.isRead;
    const timeAgo = getTimeAgo(notification.createdAt);
    
    return `
        <div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary/50 transition-all ${!isRead ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-white dark:bg-gray-800'}">
            <div class="flex items-start justify-between">
                <div class="flex-1">
                    <div class="flex items-center space-x-2 mb-2">
                        <h3 class="font-semibold text-gray-900 dark:text-white">${escapeHtml(notification.title || '')}</h3>
                        ${!isRead ? '<span class="w-2 h-2 bg-red-500 rounded-full"></span>' : ''}
                    </div>
                    <p class="text-gray-600 dark:text-gray-400 text-sm mb-2">${escapeHtml(notification.body || '')}</p>
                    <div class="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-500">
                        <span>${timeAgo}</span>
                    </div>
                </div>
                <div class="flex items-center space-x-2 ml-4">
                    ${!isRead ? `
                        <button onclick="markAsRead('${escapeAttr(notification.id)}')" class="text-primary hover:text-secondary text-sm font-medium transition-colors">
                            Mark as Read
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

// Mark notification as read
async function markAsRead(notificationId) {
    try {
        const response = await authFetch(`${API_BASE_URL}/notifications/${notificationId}/read`, {
            method: 'PATCH'
        });

        if (!response.ok) {
            throw new Error('Failed to mark notification as read');
        }

        // Reload notifications
        await loadNotifications();
        showToast('Notification marked as read', 'success');

    } catch (error) {
        console.error('❌ Error marking notification as read:', error);
        showToast(`Failed to mark as read: ${error.message}`, 'error');
    }
}

// Mark all notifications as read
async function markAllAsRead() {
    try {
        if (!currentTrainer || !currentTrainer._id) {
            showToast('No trainer data available', 'error');
            return;
        }

        const response = await authFetch(`${API_BASE_URL}/notifications/${currentTrainer._id}/read-all`, {
            method: 'PATCH'
        });

        if (!response.ok) {
            throw new Error('Failed to mark all notifications as read');
        }

        // Reload notifications
        await loadNotifications();
        showToast('All notifications marked as read', 'success');

    } catch (error) {
        console.error('❌ Error marking all notifications as read:', error);
        showToast(`Failed to mark all as read: ${error.message}`, 'error');
    }
}

// Refresh notifications
async function refreshNotifications() {
    await loadNotifications();
    showToast('Notifications refreshed', 'success');
}

// Update notification badge
function updateNotificationBadge(notifications) {
    const badge = document.getElementById('notification-badge');
    const unreadCount = notifications.filter(n => !n.isRead).length;
    
    if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// Show notifications loading state
function showNotificationsLoadingState() {
    document.getElementById('notificationsLoadingState')?.classList.remove('hidden');
    document.getElementById('notificationsList')?.classList.add('hidden');
    document.getElementById('notificationsEmptyState')?.classList.add('hidden');
}

// Show notifications empty state
function showNotificationsEmptyState() {
    document.getElementById('notificationsLoadingState')?.classList.add('hidden');
    document.getElementById('notificationsList')?.classList.add('hidden');
    document.getElementById('notificationsEmptyState')?.classList.remove('hidden');
}

window.TrainerTabs.notifications = {
    init() {
        currentSection = 'notifications';
        loadNotifications();
    }
};
