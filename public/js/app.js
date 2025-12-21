// حالة التطبيق
const AppState = {
    user: null,
    token: null,
    socket: null,
    cart: [],
    notifications: []
};

// تهيئة التطبيق
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 تطبيق قات PRO - جاري التهيئة...');
    
    // التحقق من جلسة المستخدم
    await checkAuth();
    
    // إعداد مستمعي الأحداث
    setupEventListeners();
    
    // إعداد السوكيت
    setupSocket();
    
    // تحميل البيانات الأولية
    loadInitialData();
    
    console.log('✅ التطبيق جاهز للاستخدام');
});

// التحقق من المصادقة
async function checkAuth() {
    try {
        const token = localStorage.getItem('qat_token');
        const userId = localStorage.getItem('qat_user_id');
        
        if (!token || !userId) {
            showAuthPage();
            return;
        }
        
        const response = await fetch('/api/auth/check', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.isAuthenticated) {
                AppState.user = data.user;
                AppState.token = token;
                showDashboard();
            } else {
                showAuthPage();
            }
        } else {
            showAuthPage();
        }
    } catch (error) {
        console.error('❌ خطأ في التحقق من المصادقة:', error);
        showAuthPage();
    }
}

// إظهار صفحة المصادقة
function showAuthPage() {
    AppState.user = null;
    AppState.token = null;
    
    // توجيه إلى صفحة الدخول إذا لم يكن المستخدم هناك
    if (!window.location.pathname.includes('index.html') && 
        window.location.pathname !== '/') {
        window.location.href = '/';
    }
}

// إظهار لوحة التحكم
function showDashboard() {
    if (!AppState.user) {
        showAuthPage();
        return;
    }
    
    // تحميل لوحة التحكم المناسبة حسب دور المستخدم
    loadDashboard();
}

// إعداد اتصال WebSocket
function setupSocket() {
    if (!AppState.user || !AppState.token) return;
    
    try {
        AppState.socket = io({
            auth: {
                userId: AppState.user.id,
                token: AppState.token
            }
        });
        
        AppState.socket.on('connect', () => {
            console.log('🔌 متصل بالسوكيت:', AppState.socket.id);
        });
        
        AppState.socket.on('notification', (notification) => {
            showNotification(notification);
            AppState.notifications.push(notification);
            updateNotificationBadge();
        });
        
        AppState.socket.on('welcome', (data) => {
            console.log('🎉 رسالة ترحيب:', data.message);
        });
        
        AppState.socket.on('error', (error) => {
            console.error('❌ خطأ في السوكيت:', error);
        });
        
    } catch (error) {
        console.error('❌ خطأ في إعداد السوكيت:', error);
    }
}

// تحميل لوحة التحكم
async function loadDashboard() {
    try {
        const dashboardHTML = await fetch('/dashboard.html').then(res => res.text());
        document.body.innerHTML = dashboardHTML;
        
        // إضافة CSS
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/css/dashboard.css';
        document.head.appendChild(link);
        
        // تهيئة لوحة التحكم
        initDashboard();
        
    } catch (error) {
        console.error('❌ خطأ في تحميل لوحة التحكم:', error);
        showMessage('error', 'حدث خطأ في تحميل لوحة التحكم');
    }
}

// تهيئة لوحة التحكم
function initDashboard() {
    // تحديث واجهة المستخدم
    updateUI();
    
    // تحميل البيانات
    loadStats();
    loadProducts();
    loadOrders();
    loadNotifications();
    
    // إعداد التنقل
    setupNavigation();
    
    // إعداد الأحداث
    setupDashboardEvents();
}

// تحديث واجهة المستخدم
function updateUI() {
    // تحديث معلومات المستخدم
    if (AppState.user) {
        const userElements = document.querySelectorAll('[data-user-name]');
        userElements.forEach(el => {
            el.textContent = AppState.user.name;
        });
        
        const avatarElements = document.querySelectorAll('[data-user-avatar]');
        avatarElements.forEach(el => {
            if (AppState.user.avatar) {
                el.src = AppState.user.avatar;
            } else {
                el.textContent = AppState.user.name.charAt(0);
            }
        });
    }
    
    // تحديث دور المستخدم
    if (AppState.user && AppState.user.role) {
        const roleElements = document.querySelectorAll('[data-user-role]');
        roleElements.forEach(el => {
            el.textContent = getRoleName(AppState.user.role);
        });
    }
}

// تحميل الإحصائيات
async function loadStats() {
    try {
        const response = await fetch('/api/status', {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            updateStats(data.data);
        }
    } catch (error) {
        console.error('❌ خطأ في تحميل الإحصائيات:', error);
    }
}

// تحميل المنتجات
async function loadProducts() {
    try {
        showLoading('products');
        
        const response = await fetch('/api/products', {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            renderProducts(data.data);
        }
        
        hideLoading('products');
    } catch (error) {
        console.error('❌ خطأ في تحميل المنتجات:', error);
        hideLoading('products');
        showMessage('error', 'حدث خطأ في تحميل المنتجات');
    }
}

// تحميل الطلبات
async function loadOrders() {
    try {
        showLoading('orders');
        
        const response = await fetch('/api/orders', {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            renderOrders(data.data);
        }
        
        hideLoading('orders');
    } catch (error) {
        console.error('❌ خطأ في تحميل الطلبات:', error);
        hideLoading('orders');
        showMessage('error', 'حدث خطأ في تحميل الطلبات');
    }
}

// تحميل الإشعارات
async function loadNotifications() {
    try {
        const response = await fetch('/api/notifications', {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            AppState.notifications = data.data || [];
            updateNotificationBadge();
        }
    } catch (error) {
        console.error('❌ خطأ في تحميل الإشعارات:', error);
    }
}

// تسجيل الخروج
async function logout() {
    try {
        await fetch('/api/logout', {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        // تنظيف التخزين المحلي
        localStorage.removeItem('qat_token');
        localStorage.removeItem('qat_user_id');
        
        // إغلاق السوكيت
        if (AppState.socket) {
            AppState.socket.disconnect();
        }
        
        // إعادة التعيين
        AppState.user = null;
        AppState.token = null;
        AppState.socket = null;
        AppState.cart = [];
        AppState.notifications = [];
        
        // توجيه إلى صفحة الدخول
        window.location.href = '/';
        
    } catch (error) {
        console.error('❌ خطأ في تسجيل الخروج:', error);
        showMessage('error', 'حدث خطأ في تسجيل الخروج');
    }
}

// دوال مساعدة
function getAuthHeaders() {
    return {
        'Authorization': `Bearer ${AppState.token}`,
        'Content-Type': 'application/json'
    };
}

function showMessage(type, text) {
    const messagesDiv = document.getElementById('messages') || createMessagesContainer();
    
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 
                         type === 'error' ? 'exclamation-circle' : 
                         type === 'warning' ? 'exclamation-triangle' : 
                         'info-circle'}"></i>
        <span>${text}</span>
        <button onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    messagesDiv.appendChild(message);
    
    setTimeout(() => {
        if (message.parentElement) {
            message.remove();
        }
    }, 5000);
}

function showLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = `
            <div class="loading">
                <i class="fas fa-spinner fa-spin"></i>
                جاري التحميل...
            </div>
        `;
    }
}

function hideLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element && element.querySelector('.loading')) {
        element.innerHTML = '';
    }
}

function getRoleName(role) {
    const roles = {
        'admin': 'مدير النظام',
        'seller': 'بائع',
        'buyer': 'مشتري',
        'driver': 'مندوب توصيل'
    };
    return roles[role] || role;
}

function createMessagesContainer() {
    const div = document.createElement('div');
    div.id = 'messages';
    document.body.appendChild(div);
    return div;
}

// تصدير دوال مهمة
window.logout = logout;
window.showMessage = showMessage;
