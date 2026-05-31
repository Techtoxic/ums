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

            const list = Array.isArray(notifications) ? notifications : [];
            const rows = list.length === 0
                ? `<div class="adm-card"><div class="adm-card__body" style="text-align:center;padding:40px 0;color:var(--text-muted)">
                        <i class="ri-notification-off-line" style="font-size:32px;display:block;margin-bottom:8px;color:var(--text-tertiary)"></i>
                        <p style="font-size:13px">No notifications</p>
                   </div></div>`
                : list.map(notification => `
                    <div class="adm-card" style="margin-bottom:12px"><div class="adm-card__body">
                        <div style="display:flex;align-items:flex-start;gap:12px">
                            <span class="kpi__icon" style="flex-shrink:0"><i class="ri-notification-3-line"></i></span>
                            <div style="min-width:0;flex:1">
                                <div class="td-strong" style="font-size:14px">${escapeHtml(notification.title || 'Notification')}</div>
                                <p style="color:var(--text-secondary);font-size:13px;margin-top:2px">${escapeHtml(notification.message || '')}</p>
                                <p class="kpi__note" style="margin-top:6px">${notification.createdAt ? new Date(notification.createdAt).toLocaleString() : ''}</p>
                            </div>
                        </div>
                    </div></div>
                `).join('');

            content.innerHTML = `
                <div class="flex items-center justify-between gap-4 flex-wrap" style="margin-bottom:18px">
                    <h1 class="adm-page-title"><i class="ri-notification-3-line"></i> Notifications</h1>
                    <span class="kpi__note">${list.length} message${list.length === 1 ? '' : 's'}</span>
                </div>
                ${rows}
            `;
        }

window.DeputyTabs.notifications = {
    init() { loadNotificationsData(); }
};
