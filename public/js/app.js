/**
 * تطبيق قات PRO - الملف الرئيسي للتطبيق
 * إدارة الحالة، التنقل، والمكونات الرئيسية
 */

// حالة التطبيق
const App = {
    // حالة المصادقة
    auth: {
        isAuthenticated: false,
        user: null,
        token: null,
        role: null
    },
    
    // البيانات
    data: {
        products: [],
        orders: [],
        markets: [],
        wallet: null,
        notifications: [],
        stats: null
    },
    
    // إعدادات التطبيق
    settings: {
        theme: 'light',
        language: 'ar',
        notifications: true,
        autoRefresh: true
    },
    
    // حالة واجهة المستخدم
    ui: {
        currentSection: 'dashboard',
        sidebarOpen: true,
        notificationsOpen: false,
        searchQuery: '',
        isLoading: false
    }
};

// تهيئة التطبيق
async function initApp() {
    console.log('🚀 تهيئة تطبيق قات PRO...');
    
    try {
        // التحقق من المصادقة
        await checkAuth();
        
        // تحميل البيانات الأولية
        await loadInitialData();
        
        // إعداد واجهة المستخدم
        setupUI();
        
        // إعداد مستمعي الأحداث
        setupEventListeners();
        
        // إعداد WebSocket
        setupWebSocket();
        
        // تحديث البيانات بشكل دوري
        startAutoRefresh();
        
        console.log('✅ التطبيق جاهز للاستخدام');
        
    } catch (error) {
        console.error('❌ خطأ في تهيئة التطبيق:', error);
        showMessage('error', 'حدث خطأ في تهيئة التطبيق');
    }
}

// التحقق من المصادقة
async function checkAuth() {
    try {
        const token = localStorage.getItem('qat_token');
        const userId = localStorage.getItem('qat_user_id');
        
        if (!token || !userId) {
            console.log('⚠️ المستخدم غير مسجل دخول');
            redirectToLogin();
            return;
        }
        
        // التحقق من صحة التوكن مع الخادم
        const response = await fetch('/api/auth/check', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('فشل التحقق من المصادقة');
        }
        
        const data = await response.json();
        
        if (!data.isAuthenticated || !data.user) {
            throw new Error('المستخدم غير مصرح له');
        }
        
        // تحديث حالة المصادقة
        App.auth.isAuthenticated = true;
        App.auth.user = data.user;
        App.auth.token = token;
        App.auth.role = data.user.role;
        
        // تحديث واجهة المستخدم مع بيانات المستخدم
        updateUserUI();
        
        // إظهار روابط القائمة حسب الدور
        showRoleSpecificLinks();
        
    } catch (error) {
        console.error('❌ خطأ في التحقق من المصادقة:', error);
        clearAuthData();
        redirectToLogin();
    }
}

// تحميل البيانات الأولية
async function loadInitialData() {
    try {
        showLoading();
        
        // تحميل الإحصائيات
        await loadStats();
        
        // تحميل البيانات حسب الدور
        if (App.auth.role === 'buyer' || App.auth.role === 'seller') {
            await loadProducts();
            await loadOrders();
            await loadMarkets();
        }
        
        if (App.auth.role === 'seller') {
            await loadMyProducts();
            await loadSalesReport();
        }
        
        if (App.auth.role === 'driver') {
            await loadDeliveries();
            await loadEarnings();
        }
        
        // تحميل المحفظة
        await loadWallet();
        
        // تحميل الإشعارات
        await loadNotifications();
        
        hideLoading();
        
    } catch (error) {
        console.error('❌ خطأ في تحميل البيانات:', error);
        showMessage('error', 'حدث خطأ في تحميل البيانات');
        hideLoading();
    }
}

// إعداد واجهة المستخدم
function setupUI() {
    // تحديث عنوان الصفحة
    updatePageTitle();
    
    // تحديث شارة الإشعارات
    updateNotificationBadge();
    
    // تحديث رصيد المحفظة
    updateWalletBalance();
    
    // إعداد المخططات
    setupCharts();
}

// إعداد مستمعي الأحداث
function setupEventListeners() {
    // أحداث التنقل
    document.addEventListener('click', handleNavigation);
    
    // أحداث البحث
    const searchInput = document.getElementById('globalSearch');
    if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch(searchInput.value);
            }
        });
    }
    
    // أحداث القوائم المنسدلة
    setupDropdowns();
    
    // أحداث الأزرار
    setupButtons();
    
    // أحداث النماذج
    setupForms();
}

// إعداد WebSocket
function setupWebSocket() {
    if (!App.auth.token) return;
    
    try {
        const socket = io({
            auth: {
                token: App.auth.token,
                userId: App.auth.user.id
            }
        });
        
        socket.on('connect', () => {
            console.log('🔌 متصل بالسوكيت:', socket.id);
            App.socket = socket;
        });
        
        socket.on('notification', (notification) => {
            handleNewNotification(notification);
        });
        
        socket.on('order_update', (order) => {
            handleOrderUpdate(order);
        });
        
        socket.on('disconnect', () => {
            console.log('🔌 تم قطع الاتصال بالسوكيت');
        });
        
    } catch (error) {
        console.error('❌ خطأ في إعداد WebSocket:', error);
    }
}

// معالجة التنقل بين الأقسام
async function loadSection(sectionId, forceReload = false) {
    console.log(`📍 تحميل القسم: ${sectionId}`);
    
    // تحديث حالة واجهة المستخدم
    App.ui.currentSection = sectionId;
    
    // تحديث القائمة النشطة
    updateActiveMenu(sectionId);
    
    // تحديث عنوان الصفحة
    updatePageTitle(sectionId);
    
    // إخفاء جميع الأقسام
    hideAllSections();
    
    // إظهار القسم المطلوب
    showSection(sectionId);
    
    // تحميل بيانات القسم إذا لزم الأمر
    if (shouldLoadSectionData(sectionId, forceReload)) {
        await loadSectionData(sectionId);
    }
    
    // التمرير إلى الأعلى
    scrollToTop();
}

// تحديث القائمة النشطة
function updateActiveMenu(sectionId) {
    // إزالة النشط من جميع الروابط
    const menuLinks = document.querySelectorAll('.sidebar-menu a, .nav-link');
    menuLinks.forEach(link => link.classList.remove('active'));
    
    // إضافة النشط للرابط الحالي
    const activeLink = document.querySelector(`[href="#${sectionId}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }
}

// تحديث عنوان الصفحة
function updatePageTitle(sectionId = null) {
    const section = sectionId || App.ui.currentSection;
    const titles = {
        'dashboard': 'لوحة التحكم',
        'products': 'المنتجات',
        'orders': 'الطلبات',
        'markets': 'الأسواق',
        'wallet': 'المحفظة',
        'profile': 'الملف الشخصي',
        'admin': 'إدارة النظام',
        'users': 'المستخدمين',
        'myProducts': 'منتجاتي',
        'sales': 'المبيعات',
        'deliveries': 'طلبات التوصيل',
        'earnings': 'الأرباح',
        'reports': 'التقارير',
        'settings': 'الإعدادات'
    };
    
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
        pageTitle.textContent = titles[section] || 'تطبيق قات PRO';
    }
    
    // تحديث عنوان المتصفح
    document.title = `${titles[section] || 'لوحة التحكم'} - تطبيق قات PRO`;
}

// إخفاء جميع الأقسام
function hideAllSections() {
    const sections = document.querySelectorAll('.page-section');
    sections.forEach(section => {
        section.classList.remove('active');
        section.style.display = 'none';
    });
}

// إظهار قسم معين
function showSection(sectionId) {
    const section = document.getElementById(`${sectionId}Section`);
    if (section) {
        section.style.display = 'block';
        setTimeout(() => {
            section.classList.add('active');
        }, 10);
    } else {
        console.warn(`⚠️ القسم ${sectionId} غير موجود`);
        loadSection('dashboard');
    }
}

// التحقق إذا كان يجب تحميل بيانات القسم
function shouldLoadSectionData(sectionId, forceReload = false) {
    if (forceReload) return true;
    
    const sectionsWithData = ['products', 'orders', 'markets', 'wallet'];
    return sectionsWithData.includes(sectionId);
}

// تحميل بيانات القسم
async function loadSectionData(sectionId) {
    try {
        showSectionLoading(sectionId);
        
        switch (sectionId) {
            case 'products':
                await loadProducts();
                break;
            case 'orders':
                await loadOrders();
                break;
            case 'markets':
                await loadMarkets();
                break;
            case 'wallet':
                await loadWallet();
                break;
            case 'profile':
                await loadProfile();
                break;
            case 'admin':
                await loadAdminData();
                break;
            case 'myProducts':
                await loadMyProducts();
                break;
            case 'sales':
                await loadSalesReport();
                break;
            case 'deliveries':
                await loadDeliveries();
                break;
            case 'earnings':
                await loadEarnings();
                break;
        }
        
        hideSectionLoading(sectionId);
        
    } catch (error) {
        console.error(`❌ خطأ في تحميل بيانات ${sectionId}:`, error);
        hideSectionLoading(sectionId);
        showMessage('error', `حدث خطأ في تحميل بيانات ${sectionId}`);
    }
}

// ============ دوال تحميل البيانات ============

// تحميل الإحصائيات
async function loadStats() {
    try {
        const response = await fetch('/api/status', {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            App.data.stats = data.data;
            updateQuickStats(data.data);
        }
    } catch (error) {
        console.error('❌ خطأ في تحميل الإحصائيات:', error);
    }
}

// تحميل المنتجات
async function loadProducts() {
    try {
        const response = await fetch('/api/products', {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            App.data.products = data.data;
            renderProducts(data.data);
            updateProductsBadge(data.data.length);
        }
    } catch (error) {
        console.error('❌ خطأ في تحميل المنتجات:', error);
    }
}

// تحميل الطلبات
async function loadOrders() {
    try {
        const response = await fetch('/api/orders', {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            App.data.orders = data.data;
            renderOrders(data.data);
            updateOrdersBadge(data.data.length);
        }
    } catch (error) {
        console.error('❌ خطأ في تحميل الطلبات:', error);
    }
}

// تحميل الأسواق
async function loadMarkets() {
    try {
        const response = await fetch('/api/markets', {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            App.data.markets = data.data;
            renderMarkets(data.data);
        }
    } catch (error) {
        console.error('❌ خطأ في تحميل الأسواق:', error);
    }
}

// تحميل المحفظة
async function loadWallet() {
    try {
        const response = await fetch('/api/wallet', {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            App.data.wallet = data.data;
            updateWalletDisplay(data.data);
        }
    } catch (error) {
        console.error('❌ خطأ في تحميل المحفظة:', error);
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
            App.data.notifications = data.data || [];
            updateNotificationBadge();
        }
    } catch (error) {
        console.error('❌ خطأ في تحميل الإشعارات:', error);
    }
}

// ============ دوال العرض ============

// تحديث الإحصائيات السريعة
function updateQuickStats(stats) {
    const statsGrid = document.getElementById('quickStats');
    if (!statsGrid) return;
    
    const statCards = [
        {
            icon: 'fas fa-users',
            value: stats.total_users || 0,
            label: 'إجمالي المستخدمين',
            change: '+12%'
        },
        {
            icon: 'fas fa-shopping-cart',
            value: stats.total_orders || 0,
            label: 'إجمالي الطلبات',
            change: '+8%'
        },
        {
            icon: 'fas fa-money-bill-wave',
            value: formatCurrency(stats.today_revenue || 0),
            label: 'الإيرادات اليوم',
            change: '+15%'
        },
        {
            icon: 'fas fa-box',
            value: stats.active_products || 0,
            label: 'المنتجات النشطة',
            change: '+5%'
        }
    ];
    
    statsGrid.innerHTML = statCards.map(stat => `
        <div class="stat-card" onclick="loadSection('${getStatSection(stat.label)}')">
            <div class="stat-icon">
                <i class="${stat.icon}"></i>
            </div>
            <div class="stat-content">
                <div class="stat-number">${stat.value}</div>
                <div class="stat-label">${stat.label}</div>
                <div class="stat-change ${stat.change.includes('+') ? 'positive' : 'negative'}">
                    <i class="fas fa-arrow-${stat.change.includes('+') ? 'up' : 'down'}"></i>
                    ${stat.change}
                </div>
            </div>
        </div>
    `).join('');
}

// عرض المنتجات
function renderProducts(products) {
    // المنتجات في الجدول
    const tableBody = document.getElementById('productsTableBody');
    if (tableBody) {
        tableBody.innerHTML = products.map(product => `
            <tr>
                <td>
                    <img src="${product.image || '/assets/images/default-product.png'}" 
                         alt="${product.name}" 
                         class="table-image">
                </td>
                <td>
                    <div class="product-info-sm">
                        <div class="product-name">${product.name}</div>
                        <div class="product-description">${product.description || 'لا يوجد وصف'}</div>
                    </div>
                </td>
                <td>
                    <span class="category-badge">${product.category || 'غير محدد'}</span>
                </td>
                <td>
                    <span class="price">${formatCurrency(product.price)}</span>
                </td>
                <td>
                    <span class="quantity ${product.quantity > 0 ? 'in-stock' : 'out-of-stock'}">
                        ${product.quantity > 0 ? product.quantity + ' متوفر' : 'نفذت الكمية'}
                    </span>
                </td>
                <td>
                    <span class="status-badge ${product.status === 'active' ? 'active' : 'inactive'}">
                        ${product.status === 'active' ? 'نشط' : 'غير نشط'}
                    </span>
                </td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-sm btn-outline" onclick="viewProduct(${product.id})">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-outline" onclick="editProduct(${product.id})">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline btn-danger" onclick="deleteProduct(${product.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }
    
    // المنتجات المميزة
    const featuredGrid = document.getElementById('featuredProducts');
    if (featuredGrid) {
        const featuredProducts = products.filter(p => p.is_featured).slice(0, 4);
        featuredGrid.innerHTML = featuredProducts.map(product => `
            <div class="product-card">
                <div class="product-image">
                    ${product.image ? 
                        `<img src="${product.image}" alt="${product.name}">` : 
                        `<i class="fas fa-leaf"></i>`
                    }
                </div>
                <div class="product-info">
                    <h4 class="product-title">${product.name}</h4>
                    <span class="product-category">${product.category || 'عام'}</span>
                    <div class="product-price">${formatCurrency(product.price)}</div>
                    <div class="product-meta">
                        <span><i class="fas fa-box"></i> ${product.quantity || 0}</span>
                        <span><i class="fas fa-star"></i> ${product.rating || '0.0'}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }
}

// عرض الطلبات
function renderOrders(orders) {
    // قائمة الطلبات
    const ordersList = document.getElementById('ordersList');
    if (ordersList) {
        ordersList.innerHTML = orders.map(order => `
            <div class="order-card ${order.status}">
                <div class="order-header">
                    <div>
                        <div class="order-code">#${order.order_code}</div>
                        <div class="order-date">${formatDate(order.created_at)}</div>
                    </div>
                    <span class="order-status ${order.status}">
                        ${getOrderStatusText(order.status)}
                    </span>
                </div>
                <div class="order-body">
                    <div class="order-customer">
                        <i class="fas fa-user"></i> ${order.buyer_name || 'مشتري'}
                    </div>
                    <div class="order-total-amount">
                        <strong>المبلغ الإجمالي:</strong> ${formatCurrency(order.total)}
                    </div>
                </div>
                <div class="order-footer">
                    <div class="order-actions">
                        <button class="btn btn-sm btn-outline" onclick="viewOrder(${order.id})">
                            <i class="fas fa-eye"></i> تفاصيل
                        </button>
                        ${order.status === 'pending' ? `
                            <button class="btn btn-sm btn-primary" onclick="processOrder(${order.id})">
                                <i class="fas fa-check"></i> معالجة
                            </button>
                        ` : ''}
                    </div>
                    <div class="order-total">
                        ${formatCurrency(order.total)}
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    // آخر الطلبات في لوحة التحكم
    const recentOrders = document.getElementById('recentOrders');
    if (recentOrders) {
        const recent = orders.slice(0, 5);
        recentOrders.innerHTML = recent.map(order => `
            <div class="order-item">
                <div class="order-item-image">
                    <i class="fas fa-shopping-bag"></i>
                </div>
                <div class="order-item-info">
                    <div class="order-item-name">طلب #${order.order_code}</div>
                    <div class="order-item-details">
                        <span class="order-status-sm ${order.status}">${getOrderStatusText(order.status)}</span>
                        <span class="order-date-sm">${formatDate(order.created_at)}</span>
                    </div>
                </div>
                <div class="order-item-price">
                    ${formatCurrency(order.total)}
                </div>
            </div>
        `).join('');
    }
}

// عرض الأسواق
function renderMarkets(markets) {
    const marketsGrid = document.getElementById('marketsGrid');
    if (marketsGrid) {
        marketsGrid.innerHTML = markets.map(market => `
            <div class="market-card">
                <div class="market-icon">
                    <i class="fas fa-store"></i>
                </div>
                <div class="market-info">
                    <h4 class="market-name">${market.name}</h4>
                    <div class="market-location">
                        <i class="fas fa-map-marker-alt"></i>
                        ${market.location}
                    </div>
                    <div class="market-stats">
                        <span><i class="fas fa-box"></i> ${market.product_count || 0} منتج</span>
                        <span><i class="fas fa-user"></i> ${market.seller_count || 0} بائع</span>
                    </div>
                </div>
                <button class="btn btn-outline" onclick="viewMarket(${market.id})">
                    <i class="fas fa-external-link-alt"></i>
                </button>
            </div>
        `).join('');
    }
    
    // الأسواق النشطة في لوحة التحكم
    const activeMarkets = document.getElementById('activeMarkets');
    if (activeMarkets) {
        const active = markets.filter(m => m.status === 'active').slice(0, 3);
        activeMarkets.innerHTML = active.map(market => `
            <div class="market-card">
                <div class="market-icon">
                    <i class="fas fa-store"></i>
                </div>
                <div class="market-info">
                    <h4 class="market-name">${market.name}</h4>
                    <div class="market-location">
                        <i class="fas fa-map-marker-alt"></i>
                        ${market.location}
                    </div>
                </div>
            </div>
        `).join('');
    }
}

// تحديث عرض المحفظة
function updateWalletDisplay(wallet) {
    // الرصيد الحالي
    const currentBalance = document.getElementById('currentBalance');
    if (currentBalance) {
        currentBalance.innerHTML = `
            <div class="balance-amount">${formatCurrency(wallet.balance || 0)}</div>
            <div class="balance-label">ريال يمني</div>
        `;
    }
    
    // شارة المحفظة في الشريط العلوي
    const walletBalance = document.getElementById('walletBalance');
    if (walletBalance) {
        walletBalance.textContent = formatCurrency(wallet.balance || 0) + ' ريال';
    }
    
    // الإحصائيات
    document.getElementById('totalDeposits').textContent = formatCurrency(wallet.total_deposits || 0) + ' ريال';
    document.getElementById('totalWithdrawals').textContent = formatCurrency(wallet.total_withdrawals || 0) + ' ريال';
    document.getElementById('totalPurchases').textContent = formatCurrency(Math.abs(wallet.total_withdrawals || 0) - (wallet.balance || 0)) + ' ريال';
    
    // قائمة المعاملات
    const transactionsList = document.getElementById('transactionsList');
    if (transactionsList && wallet.transactions) {
        transactionsList.innerHTML = wallet.transactions.map(transaction => `
            <div class="transaction-item">
                <div class="transaction-icon ${transaction.type}">
                    <i class="fas fa-${getTransactionIcon(transaction.type)}"></i>
                </div>
                <div class="transaction-details">
                    <div class="transaction-title">${getTransactionTitle(transaction)}</div>
                    <div class="transaction-date">
                        <i class="fas fa-calendar"></i>
                        ${formatDate(transaction.created_at)}
                    </div>
                </div>
                <div class="transaction-amount ${transaction.amount > 0 ? 'positive' : 'negative'}">
                    ${transaction.amount > 0 ? '+' : ''}${formatCurrency(transaction.amount)}
                </div>
            </div>
        `).join('');
    }
}

// ============ دوال المساعدة ============

// الحصول على رؤوس المصادقة
function getAuthHeaders() {
    return {
        'Authorization': `Bearer ${App.auth.token}`,
        'Content-Type': 'application/json'
    };
}

// تنسيق العملة
function formatCurrency(amount) {
    return new Intl.NumberFormat('ar-YE', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

// تنسيق التاريخ
function formatDate(dateString) {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ar-YE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

// الحصول على نص حالة الطلب
function getOrderStatusText(status) {
    const statuses = {
        'pending': 'معلق',
        'processing': 'قيد المعالجة',
        'shipped': 'تم الشحن',
        'delivered': 'تم التسليم',
        'cancelled': 'ملغي'
    };
    return statuses[status] || status;
}

// الحصول على أيقونة المعاملة
function getTransactionIcon(type) {
    const icons = {
        'deposit': 'arrow-down',
        'withdrawal': 'arrow-up',
        'purchase': 'shopping-cart',
        'refund': 'undo',
        'commission': 'percentage'
    };
    return icons[type] || 'exchange-alt';
}

// الحصول على عنوان المعاملة
function getTransactionTitle(transaction) {
    const titles = {
        'deposit': 'إيداع رصيد',
        'withdrawal': 'سحب أموال',
        'purchase': 'شراء منتجات',
        'refund': 'استرداد مبلغ',
        'commission': 'عمولة'
    };
    return titles[transaction.type] || transaction.description || 'معاملة';
}

// الحصول على قسم الإحصائيات
function getStatSection(label) {
    const sections = {
        'إجمالي المستخدمين': 'users',
        'إجمالي الطلبات': 'orders',
        'الإيرادات اليوم': 'wallet',
        'المنتجات النشطة': 'products'
    };
    return sections[label] || 'dashboard';
}

// تحديث واجهة المستخدم للمستخدم
function updateUserUI() {
    // معلومات المستخدم في الشريط الجانبي
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    const userAvatarSm = document.getElementById('userAvatarSm');
    
    if (App.auth.user) {
        if (userName) userName.textContent = App.auth.user.name;
        if (userRole) userRole.textContent = getRoleName(App.auth.user.role);
        
        // الصورة الشخصية
        if (App.auth.user.avatar) {
            if (userAvatar) {
                userAvatar.innerHTML = `<img src="${App.auth.user.avatar}" alt="${App.auth.user.name}">`;
            }
            if (userAvatarSm) {
                userAvatarSm.innerHTML = `<img src="${App.auth.user.avatar}" alt="${App.auth.user.name}">`;
            }
        } else {
            const initial = App.auth.user.name.charAt(0);
            if (userAvatar) {
                userAvatar.textContent = initial;
            }
            if (userAvatarSm) {
                userAvatarSm.textContent = initial;
            }
        }
    }
}

// الحصول على اسم الدور
function getRoleName(role) {
    const roles = {
        'admin': 'مدير النظام',
        'seller': 'بائع',
        'buyer': 'مشتري',
        'driver': 'مندوب توصيل'
    };
    return roles[role] || role;
}

// إظهار روابط حسب الدور
function showRoleSpecificLinks() {
    const adminLinks = document.getElementById('adminLinks');
    const sellerLinks = document.getElementById('sellerLinks');
    const driverLinks = document.getElementById('driverLinks');
    
    if (App.auth.role === 'admin' && adminLinks) {
        adminLinks.style.display = 'block';
    }
    
    if (App.auth.role === 'seller' && sellerLinks) {
        sellerLinks.style.display = 'block';
    }
    
    if (App.auth.role === 'driver' && driverLinks) {
        driverLinks.style.display = 'block';
    }
}

// تحديث شارة الإشعارات
function updateNotificationBadge() {
    const unreadCount = App.data.notifications.filter(n => !n.is_read).length;
    const badge = document.getElementById('notificationCount');
    if (badge) {
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'flex' : 'none';
    }
}

// تحديث شارة المنتجات
function updateProductsBadge(count) {
    const badge = document.getElementById('productsBadge');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

// تحديث شارة الطلبات
function updateOrdersBadge(count) {
    const badge = document.getElementById('ordersBadge');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

// تحديث رصيد المحفظة
function updateWalletBalance() {
    const balance = App.data.wallet?.balance || 0;
    const walletBadge = document.getElementById('walletBadge');
    if (walletBadge) {
        walletBadge.textContent = formatCurrency(balance);
    }
}

// إظهار رسالة
function showMessage(type, text, duration = 5000) {
    const messagesDiv = document.getElementById('messages');
    
    if (!messagesDiv) {
        createMessagesContainer();
    }
    
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 
                         type === 'error' ? 'exclamation-circle' : 
                         type === 'warning' ? 'exclamation-triangle' : 
                         'info-circle'}"></i>
        <span>${text}</span>
        <button class="close-btn" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    document.getElementById('messages').appendChild(message);
    
    setTimeout(() => {
        if (message.parentElement) {
            message.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (message.parentElement) {
                    message.remove();
                }
            }, 300);
        }
    }, duration);
}

// إظهار التحميل
function showLoading() {
    App.ui.isLoading = true;
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'loadingOverlay';
    overlay.innerHTML = `
        <div class="loading-content">
            <div class="spinner"></div>
            <p>جاري التحميل...</p>
        </div>
    `;
    document.body.appendChild(overlay);
}

// إخفاء التحميل
function hideLoading() {
    App.ui.isLoading = false;
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.remove();
    }
}

// إظهار تحميل القسم
function showSectionLoading(sectionId) {
    const section = document.getElementById(`${sectionId}Section`);
    if (section) {
        const loader = section.querySelector('.section-loader');
        if (!loader) {
            const loaderDiv = document.createElement('div');
            loaderDiv.className = 'section-loader';
            loaderDiv.innerHTML = `
                <div class="spinner"></div>
                <p>جاري تحميل البيانات...</p>
            `;
            section.appendChild(loaderDiv);
        }
    }
}

// إخفاء تحميل القسم
function hideSectionLoading(sectionId) {
    const section = document.getElementById(`${sectionId}Section`);
    if (section) {
        const loader = section.querySelector('.section-loader');
        if (loader) {
            loader.remove();
        }
    }
}

// التبديل بين فتح وإغلاق الشريط الجانبي
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
        App.ui.sidebarOpen = !sidebar.classList.contains('collapsed');
    }
}

// التبديل بين فتح وإغلاق الإشعارات
function toggleNotifications() {
    const panel = document.getElementById('notificationsPanel');
    if (panel) {
        panel.classList.toggle('show');
        App.ui.notificationsOpen = panel.classList.contains('show');
    }
}

// التمرير إلى الأعلى
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// إنشاء حاوية الرسائل
function createMessagesContainer() {
    const div = document.createElement('div');
    div.id = 'messages';
    document.body.appendChild(div);
}

// مسح بيانات المصادقة
function clearAuthData() {
    localStorage.removeItem('qat_token');
    localStorage.removeItem('qat_user_id');
    localStorage.removeItem('qat_user_data');
}

// توجيه إلى صفحة الدخول
function redirectToLogin() {
    window.location.href = '/';
}

// بدء التحديث التلقائي
function startAutoRefresh() {
    if (App.settings.autoRefresh) {
        setInterval(() => {
            if (App.ui.currentSection === 'dashboard') {
                loadStats();
            }
        }, 30000); // كل 30 ثانية
    }
}

// ============ معالجة الإشعارات الجديدة ============
function handleNewNotification(notification) {
    // إضافة الإشعار إلى القائمة
    App.data.notifications.unshift(notification);
    
    // تحديث الشارة
    updateNotificationBadge();
    
    // إظهار إشعار عائم
    showMessage('info', notification.message);
    
    // تحديث البيانات إذا كان الإشعار متعلقاً بها
    if (notification.type === 'order_update') {
        loadOrders();
    } else if (notification.type === 'wallet_update') {
        loadWallet();
    }
}

// معالجة تحديث الطلب
function handleOrderUpdate(order) {
    // تحديث الطلب في القائمة
    const index = App.data.orders.findIndex(o => o.id === order.id);
    if (index !== -1) {
        App.data.orders[index] = order;
        renderOrders(App.data.orders);
    }
}

// ============ أحداث التنقل ============
function handleNavigation(event) {
    const target = event.target.closest('a');
    if (!target) return;
    
    const href = target.getAttribute('href');
    if (href && href.startsWith('#')) {
        event.preventDefault();
        const sectionId = href.substring(1);
        loadSection(sectionId);
    }
}

// ============ الأحداث ============
function handleSearch(event) {
    App.ui.searchQuery = event.target.value;
}

function performSearch(query) {
    if (!query.trim()) return;
    
    // البحث في المنتجات
    const results = App.data.products.filter(product =>
        product.name.includes(query) ||
        product.description.includes(query) ||
        product.category.includes(query)
    );
    
    // عرض نتائج البحث
    if (results.length > 0) {
        loadSection('products');
        renderProducts(results);
        showMessage('info', `تم العثور على ${results.length} نتيجة للبحث "${query}"`);
    } else {
        showMessage('warning', `لا توجد نتائج للبحث "${query}"`);
    }
}

// ============ إعدادات إضافية ============
function setupCharts() {
    // سيتم تنفيذها لاحقاً
}

function setupDropdowns() {
    const dropdownBtn = document.getElementById('userDropdownBtn');
    const dropdown = document.getElementById('userDropdown');
    
    if (dropdownBtn && dropdown) {
        dropdownBtn.addEventListener('click', () => {
            dropdown.classList.toggle('show');
        });
        
        document.addEventListener('click', (event) => {
            if (!dropdownBtn.contains(event.target) && !dropdown.contains(event.target)) {
                dropdown.classList.remove('show');
            }
        });
    }
}

function setupButtons() {
    // إعدادات الأزرار العامة
}

function setupForms() {
    // إعدادات النماذج العامة
}

// ============ تصدير الدوال الهامة ============
window.loadSection = loadSection;
window.toggleSidebar = toggleSidebar;
window.toggleNotifications = toggleNotifications;
window.logout = logout;
window.showMessage = showMessage;

// تهيئة التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', initApp);
