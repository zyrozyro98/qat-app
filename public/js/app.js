// تطبيق قات PRO - الملف الرئيسي
class QatApp {
    constructor() {
        this.config = {
            apiUrl: window.location.origin + '/api',
            socketUrl: window.location.origin,
            appName: 'تطبيق قات PRO',
            version: '2.0.0'
        };
        
        this.state = {
            user: null,
            token: null,
            isAuthenticated: false,
            cart: [],
            notifications: [],
            currentView: 'home',
            isLoading: false,
            socket: null
        };
        
        this.init();
    }
    
    async init() {
        console.log('🚀 تهيئة تطبيق قات PRO...');
        
        // التحقق من المصادقة
        await this.checkAuth();
        
        // تهيئة المكونات
        this.initComponents();
        
        // إعداد مستمعي الأحداث
        this.setupEventListeners();
        
        // اتصال WebSocket
        this.connectSocket();
        
        // تحميل البيانات الأولية
        this.loadInitialData();
        
        console.log('✅ تم تهيئة التطبيق بنجاح');
    }
    
    async checkAuth() {
        try {
            const response = await fetch(`${this.config.apiUrl}/auth/check`, {
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (data.isAuthenticated) {
                this.state.user = data.user;
                this.state.isAuthenticated = true;
                this.updateUI();
            }
        } catch (error) {
            console.error('❌ خطأ في التحقق من المصادقة:', error);
        }
    }
    
    initComponents() {
        // تحميل المكونات الديناميكية
        this.loadComponent('header', '/components/header.html');
        this.loadComponent('navigation', '/components/navigation.html');
        this.loadComponent('footer', '/components/footer.html');
        
        // تعيين المحتوى الافتراضي
        this.showView('home');
    }
    
    async loadComponent(componentId, url) {
        try {
            const response = await fetch(url);
            const html = await response.text();
            
            const element = document.getElementById(componentId);
            if (element) {
                element.innerHTML = html;
                this.initializeComponent(componentId);
            }
        } catch (error) {
            console.error(`❌ خطأ في تحميل المكون ${componentId}:`, error);
        }
    }
    
    initializeComponent(componentId) {
        switch(componentId) {
            case 'header':
                this.initializeHeader();
                break;
            case 'navigation':
                this.initializeNavigation();
                break;
            case 'footer':
                this.initializeFooter();
                break;
        }
    }
    
    initializeHeader() {
        const userMenu = document.querySelector('.user-menu');
        const authButtons = document.querySelector('.auth-buttons');
        
        if (this.state.isAuthenticated && userMenu) {
            authButtons.style.display = 'none';
            userMenu.style.display = 'flex';
            
            // تحديث معلومات المستخدم
            const userName = userMenu.querySelector('.user-name');
            const userAvatar = userMenu.querySelector('.user-avatar');
            
            if (userName) {
                userName.textContent = this.state.user.name;
            }
            
            if (userAvatar && this.state.user.avatar) {
                userAvatar.src = this.state.user.avatar;
            }
            
            // إعداد حدث تسجيل الخروج
            const logoutBtn = userMenu.querySelector('.logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', () => this.logout());
            }
        } else if (authButtons) {
            authButtons.style.display = 'flex';
            if (userMenu) userMenu.style.display = 'none';
            
            // إعداد أحداث أزرار المصادقة
            const loginBtn = authButtons.querySelector('.login-btn');
            const registerBtn = authButtons.querySelector('.register-btn');
            
            if (loginBtn) {
                loginBtn.addEventListener('click', () => this.showLoginModal());
            }
            
            if (registerBtn) {
                registerBtn.addEventListener('click', () => this.showRegisterModal());
            }
        }
        
        // إعداد بحث
        const searchInput = document.querySelector('.search-input');
        const searchBtn = document.querySelector('.search-btn');
        
        if (searchInput && searchBtn) {
            searchBtn.addEventListener('click', () => this.search(searchInput.value));
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.search(searchInput.value);
                }
            });
        }
    }
    
    initializeNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');
        
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const view = link.getAttribute('data-view');
                if (view) {
                    this.showView(view);
                }
            });
        });
    }
    
    initializeFooter() {
        // يمكن إضافة منطق تهيئة الفوتر هنا
    }
    
    setupEventListeners() {
        // مستمعي الأحداث العامة
        document.addEventListener('click', (e) => {
            // إغلاق الموديلات عند النقر خارجها
            if (e.target.classList.contains('modal')) {
                this.closeModal(e.target.id);
            }
        });
        
        // مستمعي الأحداث للحواسيب اللوحية والهواتف
        this.setupMobileEvents();
    }
    
    setupMobileEvents() {
        const menuToggle = document.querySelector('.menu-toggle');
        const sidebar = document.getElementById('sidebar');
        const cartToggle = document.querySelector('.cart-toggle');
        const cartSidebar = document.getElementById('cartSidebar');
        
        if (menuToggle && sidebar) {
            menuToggle.addEventListener('click', () => {
                sidebar.classList.toggle('open');
            });
        }
        
        if (cartToggle && cartSidebar) {
            cartToggle.addEventListener('click', () => {
                cartSidebar.classList.toggle('open');
                this.updateCartSidebar();
            });
        }
    }
    
    connectSocket() {
        if (!this.state.isAuthenticated) return;
        
        this.state.socket = io(this.config.socketUrl, {
            transports: ['websocket'],
            query: {
                userId: this.state.user.id,
                token: this.state.token
            }
        });
        
        this.state.socket.on('connect', () => {
            console.log('🔌 متصل بـ WebSocket');
        });
        
        this.state.socket.on('notification', (notification) => {
            this.handleNotification(notification);
        });
        
        this.state.socket.on('disconnect', () => {
            console.log('🔌 انقطع الاتصال بـ WebSocket');
        });
    }
    
    async loadInitialData() {
        if (this.state.isAuthenticated) {
            // تحميل البيانات الأولية للمستخدم
            await Promise.all([
                this.loadNotifications(),
                this.loadCart(),
                this.loadUserStats()
            ]);
        }
    }
    
    async loadNotifications() {
        try {
            const response = await fetch(`${this.config.apiUrl}/notifications`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                this.state.notifications = data.data || [];
                this.updateNotificationBadge();
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل الإشعارات:', error);
        }
    }
    
    async loadCart() {
        try {
            const cartData = localStorage.getItem('qat_cart');
            if (cartData) {
                this.state.cart = JSON.parse(cartData);
                this.updateCartBadge();
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل سلة التسوق:', error);
        }
    }
    
    async loadUserStats() {
        try {
            const response = await fetch(`${this.config.apiUrl}/users/stats`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                // تحديث الإحصائيات في UI
                this.updateUserStats(data.data);
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل إحصائيات المستخدم:', error);
        }
    }
    
    async showView(viewName, params = {}) {
        this.state.currentView = viewName;
        
        // تحديث التنقل النشط
        this.updateActiveNav(viewName);
        
        // تحميل المحتوى الديناميكي
        await this.loadViewContent(viewName, params);
        
        // التمرير إلى الأعلى
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    async loadViewContent(viewName, params) {
        const mainContent = document.getElementById('mainContent');
        
        // إظهار حالة التحميل
        mainContent.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p>جاري التحميل...</p>
            </div>
        `;
        
        try {
            let html = '';
            
            switch(viewName) {
                case 'home':
                    html = await this.getHomeView();
                    break;
                case 'products':
                    html = await this.getProductsView(params);
                    break;
                case 'markets':
                    html = await this.getMarketsView();
                    break;
                case 'wallet':
                    html = await this.getWalletView();
                    break;
                case 'orders':
                    html = await this.getOrdersView();
                    break;
                case 'profile':
                    html = await this.getProfileView();
                    break;
                case 'cart':
                    html = await this.getCartView();
                    break;
                case 'checkout':
                    html = await this.getCheckoutView();
                    break;
                default:
                    html = await this.getHomeView();
            }
            
            mainContent.innerHTML = html;
            
            // تهيئة عناصر العرض
            this.initializeViewElements(viewName);
            
        } catch (error) {
            console.error(`❌ خطأ في تحميل العرض ${viewName}:`, error);
            mainContent.innerHTML = `
                <div class="error-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>حدث خطأ في تحميل المحتوى</h3>
                    <p>يرجى المحاولة مرة أخرى</p>
                    <button class="btn btn-primary" onclick="app.showView('home')">
                        العودة للرئيسية
                    </button>
                </div>
            `;
        }
    }
    
    async getHomeView() {
        try {
            // جلب البيانات
            const [productsResponse, marketsResponse, statsResponse] = await Promise.all([
                fetch(`${this.config.apiUrl}/products?featured=true&limit=6`),
                fetch(`${this.config.apiUrl}/markets?featured=true&limit=3`),
                fetch(`${this.config.apiUrl}/stats/home`)
            ]);
            
            const products = productsResponse.ok ? (await productsResponse.json()).data : [];
            const markets = marketsResponse.ok ? (await marketsResponse.json()).data : [];
            const stats = statsResponse.ok ? (await statsResponse.json()).data : {};
            
            // بناء HTML
            return `
                <div class="home-view">
                    <!-- Hero Section -->
                    <section class="hero-section">
                        <div class="container">
                            <div class="hero-content">
                                <h1 class="hero-title">أكبر منصة لبيع وتوصيل القات</h1>
                                <p class="hero-description">
                                    نوفر لكم أفضل أنواع القات من مختلف الأسواق مع خدمة توصيل سريعة وآمنة
                                </p>
                                <div class="hero-buttons">
                                    <button class="btn btn-primary btn-lg" onclick="app.showView('products')">
                                        <i class="fas fa-shopping-basket"></i>
                                        تسوق الآن
                                    </button>
                                    <button class="btn btn-outline btn-lg" onclick="app.showView('markets')">
                                        <i class="fas fa-store"></i>
                                        استعرض الأسواق
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>
                    
                    <!-- Stats Section -->
                    <section class="stats-section">
                        <div class="container">
                            <div class="stats-grid">
                                <div class="stat-card">
                                    <div class="stat-icon">
                                        <i class="fas fa-shopping-basket"></i>
                                    </div>
                                    <div class="stat-number">${stats.products || 0}</div>
                                    <div class="stat-label">منتج متوفر</div>
                                </div>
                                <div class="stat-card">
                                    <div class="stat-icon">
                                        <i class="fas fa-store"></i>
                                    </div>
                                    <div class="stat-number">${stats.markets || 0}</div>
                                    <div class="stat-label">سوق نشط</div>
                                </div>
                                <div class="stat-card">
                                    <div class="stat-icon">
                                        <i class="fas fa-users"></i>
                                    </div>
                                    <div class="stat-number">${stats.users || 0}</div>
                                    <div class="stat-label">مستخدم نشط</div>
                                </div>
                                <div class="stat-card">
                                    <div class="stat-icon">
                                        <i class="fas fa-shopping-cart"></i>
                                    </div>
                                    <div class="stat-number">${stats.orders || 0}</div>
                                    <div class="stat-label">طلب ناجح</div>
                                </div>
                            </div>
                        </div>
                    </section>
                    
                    <!-- Featured Markets -->
                    <section class="markets-section">
                        <div class="container">
                            <div class="section-header">
                                <h2>الأسواق المميزة</h2>
                                <button class="btn btn-outline" onclick="app.showView('markets')">
                                    عرض الكل
                                </button>
                            </div>
                            <div class="markets-grid">
                                ${markets.map(market => `
                                    <div class="market-card">
                                        <div class="market-image">
                                            <img src="${market.image || '/assets/images/market-placeholder.jpg'}" 
                                                 alt="${market.name}">
                                            ${market.featured ? '<span class="market-badge">مميز</span>' : ''}
                                        </div>
                                        <div class="market-info">
                                            <h3 class="market-name">${market.name}</h3>
                                            <p class="market-location">
                                                <i class="fas fa-map-marker-alt"></i>
                                                ${market.location}
                                            </p>
                                            <div class="market-meta">
                                                <span><i class="fas fa-box"></i> ${market.product_count} منتج</span>
                                                <span><i class="fas fa-star"></i> ${market.rating || 'جديد'}</span>
                                            </div>
                                            <button class="btn btn-primary w-100 mt-2" 
                                                    onclick="app.showView('market-detail', {id: ${market.id}})">
                                                <i class="fas fa-store"></i>
                                                زيارة السوق
                                            </button>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </section>
                    
                    <!-- Featured Products -->
                    <section class="products-section">
                        <div class="container">
                            <div class="section-header">
                                <h2>المنتجات المميزة</h2>
                                <button class="btn btn-outline" onclick="app.showView('products')">
                                    عرض الكل
                                </button>
                            </div>
                            <div class="products-grid">
                                ${products.map(product => `
                                    <div class="product-card">
                                        ${product.is_discounted ? `
                                            <div class="product-badge">
                                                <span class="discount-badge">خصم ${product.discount_percent}%</span>
                                            </div>
                                        ` : ''}
                                        <div class="product-image">
                                            <img src="${product.image || '/assets/images/default-product.jpg'}" 
                                                 alt="${product.name}">
                                        </div>
                                        <div class="product-info">
                                            <div class="product-category">${product.category}</div>
                                            <h3 class="product-title">${product.name}</h3>
                                            <p class="product-description">${product.description}</p>
                                            <div class="product-price">
                                                ${product.is_discounted ? `
                                                    <span class="original-price">${this.formatCurrency(product.original_price)}</span>
                                                ` : ''}
                                                <span class="current-price">${this.formatCurrency(product.price)}</span>
                                            </div>
                                            <div class="product-meta">
                                                <span><i class="fas fa-box"></i> ${product.quantity} متوفر</span>
                                                <span><i class="fas fa-star"></i> ${product.average_rating || 'جديد'}</span>
                                            </div>
                                            <button class="btn btn-primary w-100 mt-2" 
                                                    onclick="app.addToCart(${product.id})">
                                                <i class="fas fa-cart-plus"></i>
                                                إضافة للسلة
                                            </button>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </section>
                    
                    <!-- CTA Section -->
                    <section class="cta-section">
                        <div class="container">
                            <div class="cta-content">
                                <h2 class="cta-title">ابدأ تجربة التسوق الآن</h2>
                                <p class="cta-description">
                                    سجل في منصتنا واستمتع بأفضل تجربة تسوق للقات مع خدمة التوصيل السريع
                                </p>
                                <div class="cta-buttons">
                                    ${!this.state.isAuthenticated ? `
                                        <button class="btn btn-primary btn-lg" onclick="app.showRegisterModal()">
                                            <i class="fas fa-user-plus"></i>
                                            إنشاء حساب
                                        </button>
                                        <button class="btn btn-outline btn-lg" onclick="app.showLoginModal()">
                                            <i class="fas fa-sign-in-alt"></i>
                                            تسجيل الدخول
                                        </button>
                                    ` : `
                                        <button class="btn btn-primary btn-lg" onclick="app.showView('products')">
                                            <i class="fas fa-shopping-basket"></i>
                                            استعرض المنتجات
                                        </button>
                                        <button class="btn btn-outline btn-lg" onclick="app.showView('markets')">
                                            <i class="fas fa-store"></i>
                                            استكشف الأسواق
                                        </button>
                                    `}
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            `;
        } catch (error) {
            console.error('❌ خطأ في تحميل الصفحة الرئيسية:', error);
            return this.getErrorView('حدث خطأ في تحميل الصفحة الرئيسية');
        }
    }
    
    initializeViewElements(viewName) {
        switch(viewName) {
            case 'products':
                this.initializeProductsView();
                break;
            case 'markets':
                this.initializeMarketsView();
                break;
            case 'wallet':
                this.initializeWalletView();
                break;
            case 'orders':
                this.initializeOrdersView();
                break;
            case 'cart':
                this.initializeCartView();
                break;
            case 'checkout':
                this.initializeCheckoutView();
                break;
        }
    }
    
    async search(query) {
        if (!query.trim()) return;
        
        this.showView('products', { search: query });
    }
    
    async addToCart(productId) {
        if (!this.state.isAuthenticated) {
            this.showLoginModal();
            return;
        }
        
        try {
            const response = await fetch(`${this.config.apiUrl}/cart/add`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ product_id: productId, quantity: 1 })
            });
            
            if (response.ok) {
                const data = await response.json();
                this.state.cart = data.data;
                this.updateCartBadge();
                
                // إظهار إشعار
                this.showNotification('success', 'تمت إضافة المنتج إلى السلة');
                
                // تحديث سلة التسوق الجانبية
                this.updateCartSidebar();
            }
        } catch (error) {
            console.error('❌ خطأ في إضافة المنتج للسلة:', error);
            this.showNotification('error', 'حدث خطأ في إضافة المنتج');
        }
    }
    
    updateCartBadge() {
        const cartBadge = document.querySelector('.cart-badge');
        if (cartBadge) {
            const totalItems = this.state.cart.reduce((sum, item) => sum + item.quantity, 0);
            cartBadge.textContent = totalItems;
            cartBadge.style.display = totalItems > 0 ? 'flex' : 'none';
        }
    }
    
    updateNotificationBadge() {
        const notificationBadge = document.querySelector('.notification-badge');
        if (notificationBadge) {
            const unreadCount = this.state.notifications.filter(n => !n.is_read).length;
            notificationBadge.textContent = unreadCount;
            notificationBadge.style.display = unreadCount > 0 ? 'flex' : 'none';
        }
    }
    
    updateCartSidebar() {
        const cartSidebar = document.getElementById('cartSidebar');
        if (!cartSidebar || !cartSidebar.classList.contains('open')) return;
        
        const cartContent = cartSidebar.querySelector('.cart-content');
        if (cartContent) {
            if (this.state.cart.length === 0) {
                cartContent.innerHTML = `
                    <div class="empty-cart">
                        <i class="fas fa-shopping-cart"></i>
                        <p>سلة التسوق فارغة</p>
                    </div>
                `;
            } else {
                cartContent.innerHTML = `
                    <div class="cart-items">
                        ${this.state.cart.map(item => `
                            <div class="cart-item">
                                <div class="cart-item-image">
                                    <img src="${item.product_image || '/assets/images/default-product.jpg'}" 
                                         alt="${item.product_name}">
                                </div>
                                <div class="cart-item-info">
                                    <h4>${item.product_name}</h4>
                                    <div class="cart-item-price">
                                        ${this.formatCurrency(item.price)} × ${item.quantity}
                                    </div>
                                </div>
                                <div class="cart-item-actions">
                                    <button class="btn btn-sm btn-outline" 
                                            onclick="app.updateCartItem(${item.product_id}, ${item.quantity - 1})">
                                        <i class="fas fa-minus"></i>
                                    </button>
                                    <span>${item.quantity}</span>
                                    <button class="btn btn-sm btn-outline" 
                                            onclick="app.updateCartItem(${item.product_id}, ${item.quantity + 1})">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="cart-summary">
                        <div class="cart-total">
                            <span>المجموع:</span>
                            <span>${this.formatCurrency(this.calculateCartTotal())}</span>
                        </div>
                        <button class="btn btn-primary w-100" onclick="app.showView('checkout')">
                            <i class="fas fa-shopping-bag"></i>
                            إتمام الشراء
                        </button>
                    </div>
                `;
            }
        }
    }
    
    calculateCartTotal() {
        return this.state.cart.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);
    }
    
    formatCurrency(amount) {
        return new Intl.NumberFormat('ar-YE', {
            style: 'currency',
            currency: 'YER',
            minimumFractionDigits: 0
        }).format(amount);
    }
    
    updateUI() {
        // تحديث جميع العناصر بناءً على حالة التطبيق
        this.initializeHeader();
        this.updateCartBadge();
        this.updateNotificationBadge();
        
        // تحديث العرض الحالي
        this.showView(this.state.currentView);
    }
    
    showNotification(type, message) {
        const notificationsContainer = document.getElementById('notificationsContainer');
        
        const notificationId = 'notification-' + Date.now();
        const notification = document.createElement('div');
        notification.id = notificationId;
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
                <span>${message}</span>
            </div>
            <button class="notification-close" onclick="document.getElementById('${notificationId}').remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        notificationsContainer.appendChild(notification);
        
        // إزالة الإشعار بعد 5 ثواني
        setTimeout(() => {
            const element = document.getElementById(notificationId);
            if (element) {
                element.remove();
            }
        }, 5000);
    }
    
    handleNotification(notification) {
        // إضافة الإشعار للحالة
        this.state.notifications.unshift(notification);
        this.updateNotificationBadge();
        
        // إظهار إشعار فوري
        this.showNotification(notification.type || 'info', notification.message);
    }
    
    async logout() {
        try {
            const response = await fetch(`${this.config.apiUrl}/logout`, {
                method: 'POST',
                credentials: 'include'
            });
            
            if (response.ok) {
                // إعادة تعيين الحالة
                this.state.user = null;
                this.state.isAuthenticated = false;
                this.state.token = null;
                this.state.cart = [];
                this.state.notifications = [];
                
                // إغلاق WebSocket
                if (this.state.socket) {
                    this.state.socket.disconnect();
                    this.state.socket = null;
                }
                
                // تحديث UI
                this.updateUI();
                
                // إظهار إشعار
                this.showNotification('success', 'تم تسجيل الخروج بنجاح');
            }
        } catch (error) {
            console.error('❌ خطأ في تسجيل الخروج:', error);
            this.showNotification('error', 'حدث خطأ في تسجيل الخروج');
        }
    }
    
    showLoginModal() {
        const modalsContainer = document.getElementById('modalsContainer');
        
        modalsContainer.innerHTML = `
            <div class="modal active" id="loginModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            <i class="fas fa-sign-in-alt"></i>
                            تسجيل الدخول
                        </h3>
                        <button class="modal-close" onclick="app.closeModal('loginModal')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="loginForm">
                            <div class="form-group">
                                <label class="form-label">البريد الإلكتروني</label>
                                <input type="email" class="form-control" id="loginEmail" 
                                       placeholder="example@email.com" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">كلمة المرور</label>
                                <input type="password" class="form-control" id="loginPassword" 
                                       placeholder="أدخل كلمة المرور" required>
                            </div>
                            <button type="submit" class="btn btn-primary w-100">
                                <i class="fas fa-sign-in-alt"></i>
                                تسجيل الدخول
                            </button>
                        </form>
                        <div class="modal-footer">
                            <p>ليس لديك حساب؟ 
                                <a href="#" onclick="app.closeModal('loginModal'); setTimeout(() => app.showRegisterModal(), 300);">
                                    إنشاء حساب جديد
                                </a>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // إعداد نموذج تسجيل الدخول
        const loginForm = document.getElementById('loginForm');
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleLogin();
        });
    }
    
    showRegisterModal() {
        const modalsContainer = document.getElementById('modalsContainer');
        
        modalsContainer.innerHTML = `
            <div class="modal active" id="registerModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            <i class="fas fa-user-plus"></i>
                            إنشاء حساب جديد
                        </h3>
                        <button class="modal-close" onclick="app.closeModal('registerModal')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="registerForm">
                            <div class="form-group">
                                <label class="form-label">الاسم الكامل</label>
                                <input type="text" class="form-control" id="regName" 
                                       placeholder="أدخل اسمك الكامل" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">البريد الإلكتروني</label>
                                <input type="email" class="form-control" id="regEmail" 
                                       placeholder="example@email.com" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">رقم الهاتف</label>
                                <input type="tel" class="form-control" id="regPhone" 
                                       placeholder="7XXXXXXXX" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">كلمة المرور</label>
                                <input type="password" class="form-control" id="regPassword" 
                                       placeholder="أدخل كلمة المرور" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">تأكيد كلمة المرور</label>
                                <input type="password" class="form-control" id="regConfirmPassword" 
                                       placeholder="أعد إدخال كلمة المرور" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">نوع الحساب</label>
                                <select class="form-control" id="regRole" required>
                                    <option value="">اختر نوع الحساب</option>
                                    <option value="buyer">مشتري</option>
                                    <option value="seller">بائع</option>
                                    <option value="driver">مندوب توصيل</option>
                                </select>
                            </div>
                            <div id="storeField" class="form-group" style="display: none;">
                                <label class="form-label">اسم المتجر</label>
                                <input type="text" class="form-control" id="regStore" 
                                       placeholder="أدخل اسم المتجر">
                            </div>
                            <div id="vehicleField" class="form-group" style="display: none;">
                                <label class="form-label">نوع المركبة</label>
                                <input type="text" class="form-control" id="regVehicle" 
                                       placeholder="مثال: دراجة نارية، سيارة">
                            </div>
                            <button type="submit" class="btn btn-primary w-100">
                                <i class="fas fa-user-plus"></i>
                                إنشاء الحساب
                            </button>
                        </form>
                        <div class="modal-footer">
                            <p>لديك حساب بالفعل؟ 
                                <a href="#" onclick="app.closeModal('registerModal'); setTimeout(() => app.showLoginModal(), 300);">
                                    سجل الدخول
                                </a>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // إعداد تغيير نوع الحساب
        const roleSelect = document.getElementById('regRole');
        roleSelect.addEventListener('change', (e) => {
            const storeField = document.getElementById('storeField');
            const vehicleField = document.getElementById('vehicleField');
            
            storeField.style.display = e.target.value === 'seller' ? 'block' : 'none';
            vehicleField.style.display = e.target.value === 'driver' ? 'block' : 'none';
        });
        
        // إعداد نموذج التسجيل
        const registerForm = document.getElementById('registerForm');
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleRegister();
        });
    }
    
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.remove();
        }
    }
    
    async handleLogin() {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        if (!email || !password) {
            this.showNotification('error', 'يرجى ملء جميع الحقول');
            return;
        }
        
        try {
            const response = await fetch(`${this.config.apiUrl}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                // تحديث الحالة
                this.state.user = data.user;
                this.state.isAuthenticated = true;
                this.state.token = data.token;
                
                // إغلاق الموديل
                this.closeModal('loginModal');
                
                // تحديث UI
                this.updateUI();
                
                // اتصال WebSocket
                this.connectSocket();
                
                // تحميل البيانات
                await this.loadInitialData();
                
                // إظهار إشعار
                this.showNotification('success', 'تم تسجيل الدخول بنجاح');
            } else {
                this.showNotification('error', data.error || 'خطأ في تسجيل الدخول');
            }
        } catch (error) {
            console.error('❌ خطأ في تسجيل الدخول:', error);
            this.showNotification('error', 'حدث خطأ في الاتصال بالخادم');
        }
    }
    
    async handleRegister() {
        const name = document.getElementById('regName').value;
        const email = document.getElementById('regEmail').value;
        const phone = document.getElementById('regPhone').value;
        const password = document.getElementById('regPassword').value;
        const confirmPassword = document.getElementById('regConfirmPassword').value;
        const role = document.getElementById('regRole').value;
        const storeName = document.getElementById('regStore').value;
        const vehicleType = document.getElementById('regVehicle').value;
        
        // التحقق من البيانات
        if (!name || !email || !phone || !password || !confirmPassword || !role) {
            this.showNotification('error', 'يرجى ملء جميع الحقول المطلوبة');
            return;
        }
        
        if (password !== confirmPassword) {
            this.showNotification('error', 'كلمات المرور غير متطابقة');
            return;
        }
        
        if (role === 'seller' && !storeName) {
            this.showNotification('error', 'يرجى إدخال اسم المتجر');
            return;
        }
        
        if (role === 'driver' && !vehicleType) {
            this.showNotification('error', 'يرجى إدخال نوع المركبة');
            return;
        }
        
        try {
            const response = await fetch(`${this.config.apiUrl}/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name,
                    email,
                    phone,
                    password,
                    role,
                    storeName: role === 'seller' ? storeName : undefined,
                    vehicleType: role === 'driver' ? vehicleType : undefined
                })
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                // إغلاق الموديل
                this.closeModal('registerModal');
                
                // إظهار إشعار النجاح
                this.showNotification('success', 'تم إنشاء الحساب بنجاح');
                
                // إظهار موديل تسجيل الدخول
                setTimeout(() => {
                    this.showLoginModal();
                    if (document.getElementById('loginEmail')) {
                        document.getElementById('loginEmail').value = email;
                    }
                }, 500);
            } else {
                this.showNotification('error', data.error || 'خطأ في إنشاء الحساب');
            }
        } catch (error) {
            console.error('❌ خطأ في التسجيل:', error);
            this.showNotification('error', 'حدث خطأ في الاتصال بالخادم');
        }
    }
    
    // دوال مساعدة أخرى
    getErrorView(message) {
        return `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>${message}</h3>
                <button class="btn btn-primary" onclick="app.showView('home')">
                    العودة للرئيسية
                </button>
            </div>
        `;
    }
    
    updateActiveNav(viewName) {
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            const linkView = link.getAttribute('data-view');
            if (linkView === viewName) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }
}

// تصدير التطبيق للاستخدام العام
window.QatApp = QatApp;
