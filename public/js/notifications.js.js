// notifications.js
class NotificationSystem {
    constructor() {
        this.socket = null;
        this.notificationCount = 0;
        this.initialize();
    }

    initialize() {
        this.setupSocket();
        this.setupUI();
        this.loadNotifications();
    }

    setupSocket() {
        try {
            const userId = this.getUserId();
            const token = this.getToken();

            if (!userId || !token) {
                return;
            }

            this.socket = io();

            this.socket.on('connect', () => {
                this.socket.emit('authenticate', { userId, token });
            });

            this.socket.on('welcome', (data) => {
                console.log('✅ متصل بنظام الإشعارات:', data.message);
            });

            this.socket.on('notification', (notification) => {
                this.addNotification(notification);
                this.showToast(notification);
                this.updateBadge();
            });

            this.socket.on('error', (error) => {
                console.error('❌ خطأ في السوكيت:', error);
            });

        } catch (error) {
            console.error('❌ خطأ في تهيئة السوكيت:', error);
        }
    }

    setupUI() {
        // زر الإشعارات
        const notificationBtn = document.getElementById('notificationBtn');
        const notificationBadge = document.getElementById('notificationBadge');
        const notificationDropdown = document.getElementById('notificationDropdown');

        if (notificationBtn) {
            notificationBtn.addEventListener('click', () => {
                notificationDropdown.classList.toggle('show');
                this.markAllAsRead();
            });
        }

        // إغلاق القائمة عند النقر خارجها
        document.addEventListener('click', (e) => {
            if (!notificationBtn?.contains(e.target) && !notificationDropdown?.contains(e.target)) {
                notificationDropdown?.classList.remove('show');
            }
        });
    }

    async loadNotifications() {
        try {
            const response = await fetch('/api/notifications');
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.renderNotifications(data.data);
                    this.updateBadge(data.unreadCount || 0);
                }
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل الإشعارات:', error);
        }
    }

    renderNotifications(notifications) {
        const container = document.getElementById('notificationList');
        if (!container) return;

        container.innerHTML = '';

        if (notifications.length === 0) {
            container.innerHTML = `
                <div class="notification-item empty">
                    <i class="fas fa-bell-slash"></i>
                    <span>لا توجد إشعارات جديدة</span>
                </div>
            `;
            return;
        }

        notifications.forEach(notification => {
            const item = document.createElement('div');
            item.className = `notification-item ${notification.is_read ? 'read' : 'unread'}`;
            item.innerHTML = `
                <div class="notification-icon">
                    <i class="fas fa-${this.getNotificationIcon(notification.type)}"></i>
                </div>
                <div class="notification-content">
                    <div class="notification-title">${notification.title}</div>
                    <div class="notification-message">${notification.message}</div>
                    <div class="notification-time">${this.formatTime(notification.created_at)}</div>
                </div>
                ${!notification.is_read ? '<div class="notification-dot"></div>' : ''}
            `;

            item.addEventListener('click', () => {
                this.markAsRead(notification.id);
                item.classList.remove('unread');
                item.classList.add('read');
                this.updateBadge();
            });

            container.appendChild(item);
        });
    }

    addNotification(notification) {
        const container = document.getElementById('notificationList');
        if (!container) return;

        const item = document.createElement('div');
        item.className = 'notification-item unread';
        item.innerHTML = `
            <div class="notification-icon">
                <i class="fas fa-${this.getNotificationIcon(notification.type)}"></i>
            </div>
            <div class="notification-content">
                <div class="notification-title">${notification.title}</div>
                <div class="notification-message">${notification.message}</div>
                <div class="notification-time">${this.formatTime(notification.timestamp)}</div>
            </div>
            <div class="notification-dot"></div>
        `;

        container.insertBefore(item, container.firstChild);
        
        // تحديث العداد
        this.notificationCount++;
        this.updateBadge();
    }

    showToast(notification) {
        // إنشاء عنصر toast
        const toast = document.createElement('div');
        toast.className = `notification-toast ${notification.type}`;
        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fas fa-${this.getNotificationIcon(notification.type)}"></i>
            </div>
            <div class="toast-content">
                <div class="toast-title">${notification.title}</div>
                <div class="toast-message">${notification.message}</div>
            </div>
            <button class="toast-close">&times;</button>
        `;

        document.body.appendChild(toast);

        // إضافة CSS للـ toast
        if (!document.querySelector('#notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                .notification-toast {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    padding: 16px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    min-width: 300px;
                    max-width: 400px;
                    z-index: 9999;
                    animation: slideIn 0.3s ease;
                    border-left: 4px solid #2E7D32;
                }

                .notification-toast.success { border-color: #2E7D32; }
                .notification-toast.info { border-color: #1976D2; }
                .notification-toast.warning { border-color: #F57C00; }
                .notification-toast.error { border-color: #D32F2F; }

                .toast-icon {
                    font-size: 20px;
                    color: inherit;
                }

                .toast-content {
                    flex: 1;
                }

                .toast-title {
                    font-weight: bold;
                    margin-bottom: 4px;
                }

                .toast-message {
                    font-size: 14px;
                    color: #666;
                }

                .toast-close {
                    background: none;
                    border: none;
                    font-size: 20px;
                    cursor: pointer;
                    color: #999;
                }

                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        // إغلاق الـ toast
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            toast.remove();
        });

        // إزالة تلقائية بعد 5 ثواني
        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
    }

    getNotificationIcon(type) {
        const icons = {
            'success': 'check-circle',
            'info': 'info-circle',
            'warning': 'exclamation-triangle',
            'error': 'exclamation-circle'
        };
        return icons[type] || 'bell';
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'الآن';
        if (diffMins < 60) return `قبل ${diffMins} دقيقة`;
        if (diffHours < 24) return `قبل ${diffHours} ساعة`;
        if (diffDays < 7) return `قبل ${diffDays} يوم`;
        return date.toLocaleDateString('ar-YE');
    }

    updateBadge(count = this.notificationCount) {
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            if (count > 0) {
                badge.textContent = count > 9 ? '9+' : count;
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    async markAsRead(id) {
        try {
            await fetch(`/api/notifications/${id}/read`, { method: 'PUT' });
            this.notificationCount = Math.max(0, this.notificationCount - 1);
        } catch (error) {
            console.error('❌ خطأ في تحديد الإشعار كمقروء:', error);
        }
    }

    async markAllAsRead() {
        try {
            await fetch('/api/notifications/read-all', { method: 'PUT' });
            this.notificationCount = 0;
            this.updateBadge();
        } catch (error) {
            console.error('❌ خطأ في تحديد جميع الإشعارات كمقروءة:', error);
        }
    }

    getUserId() {
        // يمكنك الحصول على ID المستخدم من localStorage أو من خصائص التطبيق
        return localStorage.getItem('userId');
    }

    getToken() {
        return localStorage.getItem('token');
    }
}

// تهيئة النظام عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    window.notificationSystem = new NotificationSystem();
});