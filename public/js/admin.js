// نظام إدارة لوحة تحكم المدير
class AdminManager {
    constructor(app) {
        this.app = app;
        this.currentView = 'overview';
        this.stats = {};
        this.users = [];
        this.products = [];
        this.orders = [];
        this.pagination = {
            page: 1,
            limit: 10,
            total: 0,
            pages: 0
        };
    }
    
    async initialize() {
        if (!this.app.state.isAuthenticated || this.app.state.user.role !== 'admin') {
            console.warn('⚠️ ليس لديك صلاحية الوصول إلى لوحة الإدارة');
            this.app.showView('home');
            return;
        }
        
        console.log('👑 تهيئة لوحة تحكم المدير...');
        
        // إعداد مستمعي الأحداث
        this.setupEventListeners();
        
        // تحميل الإحصائيات
        await this.loadStats();
        
        // تحميل المستخدمين
        await this.loadUsers();
        
        // تحديث UI
        this.updateUI();
        
        console.log('✅ تم تهيئة لوحة المدير بنجاح');
    }
    
    setupEventListeners() {
        // مستمعي الأحداث العامة
        document.addEventListener('click', (e) => {
            // التنقل بين علامات التبويب
            if (e.target.matches('.nav-tab') || e.target.closest('.nav-tab')) {
                const tab = e.target.closest('.nav-tab');
                if (tab) {
                    const view = tab.getAttribute('data-view');
                    this.showView(view);
                }
            }
            
            // أزرار الإجراءات
            if (e.target.matches('.action-btn') || e.target.closest('.action-btn')) {
                const btn = e.target.closest('.action-btn');
                if (btn) {
                    const action = btn.getAttribute('data-action');
                    const id = btn.getAttribute('data-id');
                    this.handleAction(action, id);
                }
            }
        });
        
        // البحث
        const searchInput = document.querySelector('.search-input');
        if (searchInput) {
            searchInput.addEventListener('input', utils.debounce((e) => {
                this.search(e.target.value);
            }, 300));
        }
        
        // التصفية
        const filterSelects = document.querySelectorAll('.filter-select');
        filterSelects.forEach(select => {
            select.addEventListener('change', () => this.applyFilters());
        });
        
        // التصفح
        const prevBtn = document.querySelector('.pagination-prev');
        const nextBtn = document.querySelector('.pagination-next');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.prevPage());
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextPage());
        }
    }
    
    async showView(viewName, params = {}) {
        this.currentView = viewName;
        
        // تحديث التنقل
        this.updateNavigation();
        
        // تحديث عناوين الصفحة
        this.updateBreadcrumb(viewName);
        
        // تحميل محتوى العرض
        await this.loadViewContent(viewName, params);
        
        // تحديث البيانات إذا لزم الأمر
        if (viewName === 'overview') {
            await this.loadStats();
        } else if (viewName === 'admin-users') {
            await this.loadUsers();
        } else if (viewName === 'admin-sellers') {
            await this.loadSellers();
        } else if (viewName === 'admin-drivers') {
            await this.loadDrivers();
        } else if (viewName === 'admin-reports') {
            await this.loadReports();
        }
    }
    
    updateNavigation() {
        // تحديث علامات التبويب النشطة
        const navTabs = document.querySelectorAll('.nav-tab');
        navTabs.forEach(tab => {
            const tabView = tab.getAttribute('data-view');
            if (tabView === this.currentView) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
        
        // تحديث القائمة الجانبية
        const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
        navLinks.forEach(link => {
            const linkView = link.getAttribute('data-view');
            if (linkView === this.currentView) {
                link.classList.add('active');
                link.closest('.nav-item').classList.add('active');
            } else {
                link.classList.remove('active');
                link.closest('.nav-item').classList.remove('active');
            }
        });
    }
    
    updateBreadcrumb(viewName) {
        const breadcrumbMap = {
            'overview': 'نظرة عامة',
            'admin-users': 'إدارة المستخدمين',
            'admin-sellers': 'إدارة البائعين',
            'admin-drivers': 'إدارة السائقين',
            'admin-reports': 'التقارير',
            'admin-settings': 'إعدادات النظام'
        };
        
        const breadcrumbElement = document.getElementById('breadcrumb');
        if (breadcrumbElement) {
            breadcrumbElement.textContent = breadcrumbMap[viewName] || 'لوحة التحكم';
        }
    }
    
    async loadViewContent(viewName, params = {}) {
        const contentArea = document.getElementById('dashboardView');
        if (!contentArea) return;
        
        // إظهار حالة التحميل
        contentArea.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p>جاري التحميل...</p>
            </div>
        `;
        
        try {
            let html = '';
            
            switch(viewName) {
                case 'overview':
                    html = await this.getOverviewView();
                    break;
                case 'admin-users':
                    html = await this.getUsersView();
                    break;
                case 'admin-sellers':
                    html = await this.getSellersView();
                    break;
                case 'admin-drivers':
                    html = await this.getDriversView();
                    break;
                case 'admin-reports':
                    html = await this.getReportsView();
                    break;
                default:
                    html = await this.getOverviewView();
            }
            
            contentArea.innerHTML = html;
            
            // تهيئة عناصر العرض
            this.initializeViewElements(viewName);
            
        } catch (error) {
            console.error(`❌ خطأ في تحميل العرض ${viewName}:`, error);
            contentArea.innerHTML = this.getErrorView('حدث خطأ في تحميل المحتوى');
        }
    }
    
    async getOverviewView() {
        const stats = this.stats;
        
        return `
            <div class="overview-view">
                <!-- Stats Cards -->
                <div class="stats-grid">
                    <div class="stat-card stat-primary">
                        <div class="stat-icon">
                            <i class="fas fa-users"></i>
                        </div>
                        <div class="stat-content">
                            <div class="stat-number">${stats.total_users || 0}</div>
                            <div class="stat-label">إجمالي المستخدمين</div>
                        </div>
                        <div class="stat-trend">
                            <i class="fas fa-arrow-up"></i>
                            <span>${stats.user_growth || 0}%</span>
                        </div>
                    </div>
                    
                    <div class="stat-card stat-success">
                        <div class="stat-icon">
                            <i class="fas fa-shopping-cart"></i>
                        </div>
                        <div class="stat-content">
                            <div class="stat-number">${stats.total_orders || 0}</div>
                            <div class="stat-label">إجمالي الطلبات</div>
                        </div>
                        <div class="stat-trend">
                            <i class="fas fa-arrow-up"></i>
                            <span>${stats.order_growth || 0}%</span>
                        </div>
                    </div>
                    
                    <div class="stat-card stat-warning">
                        <div class="stat-icon">
                            <i class="fas fa-money-bill-wave"></i>
                        </div>
                        <div class="stat-content">
                            <div class="stat-number">${utils.formatCurrency(stats.total_revenue || 0)}</div>
                            <div class="stat-label">إجمالي الإيرادات</div>
                        </div>
                        <div class="stat-trend">
                            <i class="fas fa-arrow-up"></i>
                            <span>${stats.revenue_growth || 0}%</span>
                        </div>
                    </div>
                    
                    <div class="stat-card stat-info">
                        <div class="stat-icon">
                            <i class="fas fa-box"></i>
                        </div>
                        <div class="stat-content">
                            <div class="stat-number">${stats.total_products || 0}</div>
                            <div class="stat-label">إجمالي المنتجات</div>
                        </div>
                        <div class="stat-trend">
                            <i class="fas fa-arrow-up"></i>
                            <span>${stats.product_growth || 0}%</span>
                        </div>
                    </div>
                </div>
                
                <!-- Charts Row -->
                <div class="charts-row">
                    <div class="chart-card">
                        <div class="card-header">
                            <h4>الإيرادات الشهرية</h4>
                            <select class="filter-select" id="revenueChartPeriod">
                                <option value="month">هذا الشهر</option>
                                <option value="quarter">هذا الربع</option>
                                <option value="year">هذه السنة</option>
                            </select>
                        </div>
                        <div class="card-body">
                            <div class="chart-container" id="revenueChart">
                                <div class="chart-placeholder">
                                    <p>جاري تحميل الرسم البياني...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="chart-card">
                        <div class="card-header">
                            <h4>أعلى المنتجات مبيعاً</h4>
                            <a href="#products" class="btn btn-sm btn-outline">عرض الكل</a>
                        </div>
                        <div class="card-body">
                            <div class="top-products-list" id="topProductsList">
                                <!-- سيتم تحميل المنتجات هنا -->
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Recent Activity -->
                <div class="activity-card">
                    <div class="card-header">
                        <h4>النشاط الأخير</h4>
                    </div>
                    <div class="card-body">
                        <div class="activity-list" id="activityList">
                            <!-- سيتم تحميل النشاطات هنا -->
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    async getUsersView() {
        const users = this.users;
        const pagination = this.pagination;
        
        return `
            <div class="users-view">
                <div class="view-header">
                    <h2>إدارة المستخدمين</h2>
                    <div class="header-actions">
                        <div class="search-box">
                            <input type="text" class="search-input" placeholder="بحث عن مستخدم...">
                            <button class="search-btn">
                                <i class="fas fa-search"></i>
                            </button>
                        </div>
                        <button class="btn btn-primary" onclick="admin.showAddUserModal()">
                            <i class="fas fa-user-plus"></i>
                            إضافة مستخدم
                        </button>
                    </div>
                </div>
                
                <!-- Filters -->
                <div class="filters-row">
                    <div class="filter-group">
                        <label>النوع:</label>
                        <select class="filter-select" id="userRoleFilter">
                            <option value="">جميع الأنواع</option>
                            <option value="buyer">مشتري</option>
                            <option value="seller">بائع</option>
                            <option value="driver">مندوب توصيل</option>
                            <option value="admin">مدير</option>
                        </select>
                    </div>
                    
                    <div class="filter-group">
                        <label>الحالة:</label>
                        <select class="filter-select" id="userStatusFilter">
                            <option value="">جميع الحالات</option>
                            <option value="active">نشط</option>
                            <option value="inactive">غير نشط</option>
                            <option value="suspended">موقوف</option>
                        </select>
                    </div>
                    
                    <div class="filter-group">
                        <label>التاريخ:</label>
                        <select class="filter-select" id="userDateFilter">
                            <option value="">جميع الأوقات</option>
                            <option value="today">اليوم</option>
                            <option value="week">هذا الأسبوع</option>
                            <option value="month">هذا الشهر</option>
                        </select>
                    </div>
                </div>
                
                <!-- Users Table -->
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>المستخدم</th>
                                <th>البريد الإلكتروني</th>
                                <th>رقم الهاتف</th>
                                <th>النوع</th>
                                <th>الحالة</th>
                                <th>تاريخ التسجيل</th>
                                <th>الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody id="usersTableBody">
                            ${users.length > 0 ? users.map(user => `
                                <tr>
                                    <td>
                                        <div class="user-cell">
                                            <img src="${user.avatar || '/assets/images/default-avatar.png'}" 
                                                 alt="${user.name}" class="user-avatar">
                                            <div class="user-info">
                                                <strong>${user.name}</strong>
                                                <small>${user.uuid}</small>
                                            </div>
                                        </div>
                                    </td>
                                    <td>${user.email}</td>
                                    <td>${utils.formatters.phone(user.phone)}</td>
                                    <td>
                                        <span class="badge badge-${this.getRoleBadgeClass(user.role)}">
                                            ${this.getRoleText(user.role)}
                                        </span>
                                    </td>
                                    <td>
                                        <span class="badge badge-${this.getStatusBadgeClass(user.status)}">
                                            ${this.getStatusText(user.status)}
                                        </span>
                                    </td>
                                    <td>${utils.formatters.date(user.created_at, 'short')}</td>
                                    <td>
                                        <div class="action-buttons">
                                            <button class="btn btn-sm btn-outline" 
                                                    onclick="admin.viewUser(${user.id})"
                                                    title="عرض">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                            <button class="btn btn-sm btn-outline" 
                                                    onclick="admin.editUser(${user.id})"
                                                    title="تعديل">
                                                <i class="fas fa-edit"></i>
                                            </button>
                                            <button class="btn btn-sm btn-outline ${user.status === 'active' ? 'btn-danger' : 'btn-success'}" 
                                                    onclick="admin.toggleUserStatus(${user.id})"
                                                    title="${user.status === 'active' ? 'تعطيل' : 'تفعيل'}">
                                                <i class="fas fa-${user.status === 'active' ? 'ban' : 'check'}"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('') : `
                                <tr>
                                    <td colspan="7" class="text-center">
                                        <div class="empty-state">
                                            <i class="fas fa-users"></i>
                                            <p>لا توجد مستخدمين</p>
                                        </div>
                                    </td>
                                </tr>
                            `}
                        </tbody>
                    </table>
                </div>
                
                <!-- Pagination -->
                ${pagination.pages > 1 ? `
                    <div class="pagination">
                        <button class="pagination-btn ${pagination.page === 1 ? 'disabled' : ''}" 
                                onclick="admin.prevPage()" ${pagination.page === 1 ? 'disabled' : ''}>
                            <i class="fas fa-chevron-right"></i>
                            السابق
                        </button>
                        
                        <div class="pagination-pages">
                            ${Array.from({length: Math.min(5, pagination.pages)}, (_, i) => {
                                const pageNum = i + 1;
                                return `
                                    <button class="pagination-page ${pageNum === pagination.page ? 'active' : ''}" 
                                            onclick="admin.goToPage(${pageNum})">
                                        ${pageNum}
                                    </button>
                                `;
                            }).join('')}
                            
                            ${pagination.pages > 5 ? `
                                <span class="pagination-dots">...</span>
                                <button class="pagination-page" onclick="admin.goToPage(${pagination.pages})">
                                    ${pagination.pages}
                                </button>
                            ` : ''}
                        </div>
                        
                        <button class="pagination-btn ${pagination.page === pagination.pages ? 'disabled' : ''}" 
                                onclick="admin.nextPage()" ${pagination.page === pagination.pages ? 'disabled' : ''}>
                            التالي
                            <i class="fas fa-chevron-left"></i>
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    async getSellersView() {
        // مشابه لـ getUsersView ولكن لمستخدمي البائعين
        return `<div class="sellers-view">إدارة البائعين</div>`;
    }
    
    async getDriversView() {
        // مشابه لـ getUsersView ولكن لمستخدمي السائقين
        return `<div class="drivers-view">إدارة السائقين</div>`;
    }
    
    async getReportsView() {
        return `
            <div class="reports-view">
                <div class="view-header">
                    <h2>التقارير والإحصائيات</h2>
                    <div class="header-actions">
                        <button class="btn btn-primary" onclick="admin.generateReport('sales')">
                            <i class="fas fa-file-export"></i>
                            تصدير تقرير المبيعات
                        </button>
                        <button class="btn btn-outline" onclick="admin.generateReport('users')">
                            <i class="fas fa-file-export"></i>
                            تصدير تقرير المستخدمين
                        </button>
                    </div>
                </div>
                
                <!-- Report Filters -->
                <div class="report-filters">
                    <div class="filter-row">
                        <div class="filter-group">
                            <label>نوع التقرير:</label>
                            <select class="form-control" id="reportType">
                                <option value="sales">تقرير المبيعات</option>
                                <option value="users">تقرير المستخدمين</option>
                                <option value="products">تقرير المنتجات</option>
                                <option value="orders">تقرير الطلبات</option>
                            </select>
                        </div>
                        
                        <div class="filter-group">
                            <label>الفترة:</label>
                            <select class="form-control" id="reportPeriod">
                                <option value="today">اليوم</option>
                                <option value="yesterday">أمس</option>
                                <option value="week">هذا الأسبوع</option>
                                <option value="month">هذا الشهر</option>
                                <option value="quarter">هذا الربع</option>
                                <option value="year">هذه السنة</option>
                                <option value="custom">مخصص</option>
                            </select>
                        </div>
                        
                        <div class="filter-group" id="customDateRange" style="display: none;">
                            <label>من:</label>
                            <input type="date" class="form-control" id="reportDateFrom">
                            
                            <label>إلى:</label>
                            <input type="date" class="form-control" id="reportDateTo">
                        </div>
                        
                        <div class="filter-group">
                            <button class="btn btn-primary" onclick="admin.generateReport()">
                                <i class="fas fa-chart-bar"></i>
                                إنشاء التقرير
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Report Results -->
                <div class="report-results">
                    <div class="report-placeholder" id="reportResults">
                        <div class="empty-state">
                            <i class="fas fa-chart-bar"></i>
                            <p>حدد نوع التقرير والفترة ثم اضغط على "إنشاء التقرير"</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    initializeViewElements(viewName) {
        switch(viewName) {
            case 'overview':
                this.initializeOverview();
                break;
            case 'admin-users':
                this.initializeUsersView();
                break;
            case 'admin-sellers':
                this.initializeSellersView();
                break;
            case 'admin-drivers':
                this.initializeDriversView();
                break;
            case 'admin-reports':
                this.initializeReportsView();
                break;
        }
    }
    
    async initializeOverview() {
        // تحميل الرسوم البيانية
        await this.loadCharts();
        
        // تحميل المنتجات الأعلى مبيعاً
        await this.loadTopProducts();
        
        // تحميل النشاطات الأخيرة
        await this.loadRecentActivity();
        
        // إعداد مستمعي الأحداث للرسوم البيانية
        const periodSelect = document.getElementById('revenueChartPeriod');
        if (periodSelect) {
            periodSelect.addEventListener('change', async (e) => {
                await this.loadRevenueChart(e.target.value);
            });
        }
    }
    
    async loadStats() {
        try {
            const response = await api.get('/admin/stats');
            if (response.success) {
                this.stats = response.data;
                this.updateStatsUI();
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل الإحصائيات:', error);
        }
    }
    
    async loadUsers(params = {}) {
        try {
            const queryParams = {
                page: this.pagination.page,
                limit: this.pagination.limit,
                ...params
            };
            
            const response = await api.get('/admin/users', queryParams);
            if (response.success) {
                this.users = response.data;
                this.pagination = response.meta || this.pagination;
                
                // تحديث UI إذا كان العرض الحالي هو المستخدمين
                if (this.currentView === 'admin-users') {
                    this.showView('admin-users');
                }
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل المستخدمين:', error);
        }
    }
    
    async loadCharts() {
        await this.loadRevenueChart('month');
        // يمكن إضافة رسوم بيانية أخرى هنا
    }
    
    async loadRevenueChart(period = 'month') {
        try {
            const response = await api.get('/admin/charts/revenue', { period });
            if (response.success) {
                this.renderRevenueChart(response.data);
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل الرسم البياني:', error);
        }
    }
    
    renderRevenueChart(data) {
        const chartContainer = document.getElementById('revenueChart');
        if (!chartContainer || !data || data.length === 0) return;
        
        // استخدام مكتبة رسم بيانية مثل Chart.js
        // هنا مثال مبسط
        const maxValue = Math.max(...data.map(d => d.amount));
        
        chartContainer.innerHTML = `
            <div class="simple-chart">
                ${data.map(item => `
                    <div class="chart-bar">
                        <div class="bar-label">${item.label}</div>
                        <div class="bar-container">
                            <div class="bar-fill" style="height: ${(item.amount / maxValue) * 100}%"></div>
                        </div>
                        <div class="bar-value">${utils.formatCurrency(item.amount)}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    async loadTopProducts() {
        try {
            const response = await api.get('/admin/products/top');
            if (response.success) {
                this.renderTopProducts(response.data);
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل المنتجات الأعلى مبيعاً:', error);
        }
    }
    
    renderTopProducts(products) {
        const container = document.getElementById('topProductsList');
        if (!container) return;
        
        if (!products || products.length === 0) {
            container.innerHTML = `
                <div class="empty-state small">
                    <p>لا توجد منتجات مبيعات</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = products.map((product, index) => `
            <div class="top-product-item">
                <div class="product-rank">${index + 1}</div>
                <div class="product-info">
                    <div class="product-name">${product.name}</div>
                    <div class="product-meta">
                        <span class="product-category">${product.category}</span>
                        <span class="product-sales">${product.sales_count} مبيع</span>
                    </div>
                </div>
                <div class="product-revenue">
                    <div class="revenue-amount">${utils.formatCurrency(product.revenue)}</div>
                    <div class="revenue-change ${product.growth >= 0 ? 'positive' : 'negative'}">
                        <i class="fas fa-${product.growth >= 0 ? 'arrow-up' : 'arrow-down'}"></i>
                        ${Math.abs(product.growth)}%
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    async loadRecentActivity() {
        try {
            const response = await api.get('/admin/activity/recent');
            if (response.success) {
                this.renderRecentActivity(response.data);
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل النشاطات الأخيرة:', error);
        }
    }
    
    renderRecentActivity(activities) {
        const container = document.getElementById('activityList');
        if (!container) return;
        
        if (!activities || activities.length === 0) {
            container.innerHTML = `
                <div class="empty-state small">
                    <p>لا توجد نشاطات حديثة</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = activities.map(activity => `
            <div class="activity-item">
                <div class="activity-icon">
                    <i class="fas fa-${this.getActivityIcon(activity.type)}"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-message">${activity.message}</div>
                    <div class="activity-meta">
                        <span class="activity-user">${activity.user_name}</span>
                        <span class="activity-time">${utils.formatters.date(activity.created_at, 'time')}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    getActivityIcon(type) {
        const icons = {
            'user_register': 'user-plus',
            'user_login': 'sign-in-alt',
            'order_create': 'shopping-cart',
            'order_update': 'sync',
            'product_add': 'box',
            'product_update': 'edit',
            'payment': 'credit-card',
            'withdrawal': 'money-bill-wave',
            'review': 'star'
        };
        
        return icons[type] || 'bell';
    }
    
    async search(query) {
        if (this.currentView === 'admin-users') {
            await this.loadUsers({ search: query });
        } else if (this.currentView === 'admin-sellers') {
            await this.loadSellers({ search: query });
        } else if (this.currentView === 'admin-drivers') {
            await this.loadDrivers({ search: query });
        }
    }
    
    async applyFilters() {
        const filters = {};
        
        if (this.currentView === 'admin-users') {
            const roleFilter = document.getElementById('userRoleFilter');
            const statusFilter = document.getElementById('userStatusFilter');
            const dateFilter = document.getElementById('userDateFilter');
            
            if (roleFilter && roleFilter.value) filters.role = roleFilter.value;
            if (statusFilter && statusFilter.value) filters.status = statusFilter.value;
            if (dateFilter && dateFilter.value) filters.date = dateFilter.value;
            
            await this.loadUsers(filters);
        }
    }
    
    async prevPage() {
        if (this.pagination.page > 1) {
            this.pagination.page--;
            await this.loadCurrentViewData();
        }
    }
    
    async nextPage() {
        if (this.pagination.page < this.pagination.pages) {
            this.pagination.page++;
            await this.loadCurrentViewData();
        }
    }
    
    async goToPage(page) {
        if (page >= 1 && page <= this.pagination.pages) {
            this.pagination.page = page;
            await this.loadCurrentViewData();
        }
    }
    
    async loadCurrentViewData() {
        switch(this.currentView) {
            case 'admin-users':
                await this.loadUsers();
                break;
            case 'admin-sellers':
                await this.loadSellers();
                break;
            case 'admin-drivers':
                await this.loadDrivers();
                break;
        }
    }
    
    getRoleBadgeClass(role) {
        const classes = {
            'admin': 'danger',
            'seller': 'warning',
            'driver': 'info',
            'buyer': 'success'
        };
        return classes[role] || 'secondary';
    }
    
    getRoleText(role) {
        const texts = {
            'admin': 'مدير',
            'seller': 'بائع',
            'driver': 'مندوب توصيل',
            'buyer': 'مشتري'
        };
        return texts[role] || role;
    }
    
    getStatusBadgeClass(status) {
        const classes = {
            'active': 'success',
            'inactive': 'secondary',
            'suspended': 'danger',
            'pending': 'warning'
        };
        return classes[status] || 'secondary';
    }
    
    getStatusText(status) {
        const texts = {
            'active': 'نشط',
            'inactive': 'غير نشط',
            'suspended': 'موقوف',
            'pending': 'قيد المراجعة'
        };
        return texts[status] || status;
    }
    
    async viewUser(userId) {
        try {
            const response = await api.get(`/admin/users/${userId}`);
            if (response.success) {
                this.showUserModal(response.data, 'view');
            }
        } catch (error) {
            console.error('❌ خطأ في عرض بيانات المستخدم:', error);
            this.app.showNotification('error', 'حدث خطأ في عرض بيانات المستخدم');
        }
    }
    
    async editUser(userId) {
        try {
            const response = await api.get(`/admin/users/${userId}`);
            if (response.success) {
                this.showUserModal(response.data, 'edit');
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل بيانات المستخدم:', error);
            this.app.showNotification('error', 'حدث خطأ في تحميل بيانات المستخدم');
        }
    }
    
    async toggleUserStatus(userId) {
        if (!confirm('هل أنت متأكد من تغيير حالة المستخدم؟')) return;
        
        try {
            const response = await api.put(`/admin/users/${userId}/toggle-status`);
            if (response.success) {
                this.app.showNotification('success', 'تم تغيير حالة المستخدم بنجاح');
                await this.loadUsers(); // إعادة تحميل القائمة
            } else {
                this.app.showNotification('error', response.error || 'حدث خطأ في تغيير الحالة');
            }
        } catch (error) {
            console.error('❌ خطأ في تغيير حالة المستخدم:', error);
            this.app.showNotification('error', 'حدث خطأ في تغيير حالة المستخدم');
        }
    }
    
    showUserModal(user, mode = 'view') {
        const modalHtml = `
            <div class="modal active" id="userModal">
                <div class="modal-content modal-lg">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            <i class="fas fa-user"></i>
                            ${mode === 'view' ? 'عرض المستخدم' : 'تعديل المستخدم'}
                        </h3>
                        <button class="modal-close" onclick="admin.closeModal('userModal')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        ${mode === 'view' ? this.getUserViewContent(user) : this.getUserEditForm(user)}
                    </div>
                    <div class="modal-footer">
                        ${mode === 'view' ? `
                            <button class="btn btn-primary" onclick="admin.editUser(${user.id})">
                                <i class="fas fa-edit"></i>
                                تعديل
                            </button>
                        ` : `
                            <button class="btn btn-primary" onclick="admin.updateUser(${user.id})">
                                <i class="fas fa-save"></i>
                                حفظ التغييرات
                            </button>
                        `}
                        <button class="btn btn-outline" onclick="admin.closeModal('userModal')">
                            إغلاق
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        const modalsContainer = document.getElementById('modalsContainer') || document.body;
        modalsContainer.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    getUserViewContent(user) {
        return `
            <div class="user-profile">
                <div class="profile-header">
                    <div class="profile-avatar">
                        <img src="${user.avatar || '/assets/images/default-avatar.png'}" 
                             alt="${user.name}">
                    </div>
                    <div class="profile-info">
                        <h4>${user.name}</h4>
                        <div class="profile-meta">
                            <span class="badge badge-${this.getRoleBadgeClass(user.role)}">
                                ${this.getRoleText(user.role)}
                            </span>
                            <span class="badge badge-${this.getStatusBadgeClass(user.status)}">
                                ${this.getStatusText(user.status)}
                            </span>
                        </div>
                    </div>
                </div>
                
                <div class="profile-details">
                    <div class="detail-row">
                        <div class="detail-label">
                            <i class="fas fa-envelope"></i>
                            البريد الإلكتروني:
                        </div>
                        <div class="detail-value">${user.email}</div>
                    </div>
                    
                    <div class="detail-row">
                        <div class="detail-label">
                            <i class="fas fa-phone"></i>
                            رقم الهاتف:
                        </div>
                        <div class="detail-value">${utils.formatters.phone(user.phone)}</div>
                    </div>
                    
                    <div class="detail-row">
                        <div class="detail-label">
                            <i class="fas fa-calendar"></i>
                            تاريخ التسجيل:
                        </div>
                        <div class="detail-value">${utils.formatters.date(user.created_at, 'full')}</div>
                    </div>
                    
                    <div class="detail-row">
                        <div class="detail-label">
                            <i class="fas fa-clock"></i>
                            آخر دخول:
                        </div>
                        <div class="detail-value">${user.last_login ? utils.formatters.date(user.last_login, 'full') : 'لم يسجل دخول'}</div>
                    </div>
                    
                    ${user.store_name ? `
                        <div class="detail-row">
                            <div class="detail-label">
                                <i class="fas fa-store"></i>
                                اسم المتجر:
                            </div>
                            <div class="detail-value">${user.store_name}</div>
                        </div>
                    ` : ''}
                    
                    ${user.vehicle_type ? `
                        <div class="detail-row">
                            <div class="detail-label">
                                <i class="fas fa-motorcycle"></i>
                                نوع المركبة:
                            </div>
                            <div class="detail-value">${user.vehicle_type}</div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    getUserEditForm(user) {
        return `
            <form id="editUserForm">
                <div class="form-group">
                    <label class="form-label">الاسم الكامل</label>
                    <input type="text" class="form-control" 
                           id="editUserName" 
                           value="${user.name}" 
                           required>
                </div>
                
                <div class="form-group">
                    <label class="form-label">البريد الإلكتروني</label>
                    <input type="email" class="form-control" 
                           id="editUserEmail" 
                           value="${user.email}" 
                           required>
                </div>
                
                <div class="form-group">
                    <label class="form-label">رقم الهاتف</label>
                    <input type="tel" class="form-control" 
                           id="editUserPhone" 
                           value="${user.phone}" 
                           required>
                </div>
                
                <div class="form-group">
                    <label class="form-label">نوع المستخدم</label>
                    <select class="form-control" id="editUserRole" required>
                        <option value="buyer" ${user.role === 'buyer' ? 'selected' : ''}>مشتري</option>
                        <option value="seller" ${user.role === 'seller' ? 'selected' : ''}>بائع</option>
                        <option value="driver" ${user.role === 'driver' ? 'selected' : ''}>مندوب توصيل</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>مدير</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label class="form-label">حالة الحساب</label>
                    <select class="form-control" id="editUserStatus" required>
                        <option value="active" ${user.status === 'active' ? 'selected' : ''}>نشط</option>
                        <option value="inactive" ${user.status === 'inactive' ? 'selected' : ''}>غير نشط</option>
                        <option value="suspended" ${user.status === 'suspended' ? 'selected' : ''}>موقوف</option>
                        <option value="pending" ${user.status === 'pending' ? 'selected' : ''}>قيد المراجعة</option>
                    </select>
                </div>
                
                <div class="form-group" id="editStoreField" style="${user.role === 'seller' ? '' : 'display: none;'}">
                    <label class="form-label">اسم المتجر</label>
                    <input type="text" class="form-control" 
                           id="editUserStore" 
                           value="${user.store_name || ''}">
                </div>
                
                <div class="form-group" id="editVehicleField" style="${user.role === 'driver' ? '' : 'display: none;'}">
                    <label class="form-label">نوع المركبة</label>
                    <input type="text" class="form-control" 
                           id="editUserVehicle" 
                           value="${user.vehicle_type || ''}">
                </div>
            </form>
            
            <script>
                // إظهار/إخفاء الحقول بناءً على نوع المستخدم
                const roleSelect = document.getElementById('editUserRole');
                const storeField = document.getElementById('editStoreField');
                const vehicleField = document.getElementById('editVehicleField');
                
                if (roleSelect) {
                    roleSelect.addEventListener('change', function() {
                        storeField.style.display = this.value === 'seller' ? 'block' : 'none';
                        vehicleField.style.display = this.value === 'driver' ? 'block' : 'none';
                    });
                }
            </script>
        `;
    }
    
    async updateUser(userId) {
        const form = document.getElementById('editUserForm');
        if (!form) return;
        
        const formData = {
            name: document.getElementById('editUserName').value,
            email: document.getElementById('editUserEmail').value,
            phone: document.getElementById('editUserPhone').value,
            role: document.getElementById('editUserRole').value,
            status: document.getElementById('editUserStatus').value,
            store_name: document.getElementById('editUserStore')?.value || '',
            vehicle_type: document.getElementById('editUserVehicle')?.value || ''
        };
        
        try {
            const response = await api.put(`/admin/users/${userId}`, formData);
            if (response.success) {
                this.app.showNotification('success', 'تم تحديث بيانات المستخدم بنجاح');
                this.closeModal('userModal');
                await this.loadUsers(); // إعادة تحميل القائمة
            } else {
                this.app.showNotification('error', response.error || 'حدث خطأ في التحديث');
            }
        } catch (error) {
            console.error('❌ خطأ في تحديث المستخدم:', error);
            this.app.showNotification('error', 'حدث خطأ في تحديث بيانات المستخدم');
        }
    }
    
    showAddUserModal() {
        const modalHtml = `
            <div class="modal active" id="addUserModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            <i class="fas fa-user-plus"></i>
                            إضافة مستخدم جديد
                        </h3>
                        <button class="modal-close" onclick="admin.closeModal('addUserModal')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="addUserForm">
                            <div class="form-group">
                                <label class="form-label">الاسم الكامل</label>
                                <input type="text" class="form-control" 
                                       id="addUserName" 
                                       placeholder="أدخل الاسم الكامل" 
                                       required>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">البريد الإلكتروني</label>
                                <input type="email" class="form-control" 
                                       id="addUserEmail" 
                                       placeholder="example@email.com" 
                                       required>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">رقم الهاتف</label>
                                <input type="tel" class="form-control" 
                                       id="addUserPhone" 
                                       placeholder="7XXXXXXXX" 
                                       required>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">نوع المستخدم</label>
                                <select class="form-control" id="addUserRole" required>
                                    <option value="">اختر نوع المستخدم</option>
                                    <option value="buyer">مشتري</option>
                                    <option value="seller">بائع</option>
                                    <option value="driver">مندوب توصيل</option>
                                    <option value="admin">مدير</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">كلمة المرور</label>
                                <input type="password" class="form-control" 
                                       id="addUserPassword" 
                                       placeholder="أدخل كلمة المرور" 
                                       required>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">تأكيد كلمة المرور</label>
                                <input type="password" class="form-control" 
                                       id="addUserConfirmPassword" 
                                       placeholder="أعد إدخال كلمة المرور" 
                                       required>
                            </div>
                            
                            <div class="form-group" id="addStoreField" style="display: none;">
                                <label class="form-label">اسم المتجر</label>
                                <input type="text" class="form-control" 
                                       id="addUserStore" 
                                       placeholder="أدخل اسم المتجر">
                            </div>
                            
                            <div class="form-group" id="addVehicleField" style="display: none;">
                                <label class="form-label">نوع المركبة</label>
                                <input type="text" class="form-control" 
                                       id="addUserVehicle" 
                                       placeholder="مثال: دراجة نارية، سيارة">
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="admin.createUser()">
                            <i class="fas fa-save"></i>
                            إضافة المستخدم
                        </button>
                        <button class="btn btn-outline" onclick="admin.closeModal('addUserModal')">
                            إلغاء
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        const modalsContainer = document.getElementById('modalsContainer') || document.body;
        modalsContainer.insertAdjacentHTML('beforeend', modalHtml);
        
        // إعداد تغيير نوع المستخدم
        const roleSelect = document.getElementById('addUserRole');
        const storeField = document.getElementById('addStoreField');
        const vehicleField = document.getElementById('addVehicleField');
        
        if (roleSelect) {
            roleSelect.addEventListener('change', function() {
                storeField.style.display = this.value === 'seller' ? 'block' : 'none';
                vehicleField.style.display = this.value === 'driver' ? 'block' : 'none';
            });
        }
    }
    
    async createUser() {
        const name = document.getElementById('addUserName').value;
        const email = document.getElementById('addUserEmail').value;
        const phone = document.getElementById('addUserPhone').value;
        const role = document.getElementById('addUserRole').value;
        const password = document.getElementById('addUserPassword').value;
        const confirmPassword = document.getElementById('addUserConfirmPassword').value;
        const storeName = document.getElementById('addUserStore')?.value || '';
        const vehicleType = document.getElementById('addUserVehicle')?.value || '';
        
        // التحقق من البيانات
        if (!name || !email || !phone || !role || !password || !confirmPassword) {
            this.app.showNotification('error', 'يرجى ملء جميع الحقول المطلوبة');
            return;
        }
        
        if (password !== confirmPassword) {
            this.app.showNotification('error', 'كلمات المرور غير متطابقة');
            return;
        }
        
        if (role === 'seller' && !storeName) {
            this.app.showNotification('error', 'يرجى إدخال اسم المتجر');
            return;
        }
        
        if (role === 'driver' && !vehicleType) {
            this.app.showNotification('error', 'يرجى إدخال نوع المركبة');
            return;
        }
        
        const userData = {
            name,
            email,
            phone,
            role,
            password,
            storeName: role === 'seller' ? storeName : undefined,
            vehicleType: role === 'driver' ? vehicleType : undefined
        };
        
        try {
            const response = await api.post('/admin/users', userData);
            if (response.success) {
                this.app.showNotification('success', 'تم إنشاء المستخدم بنجاح');
                this.closeModal('addUserModal');
                await this.loadUsers(); // إعادة تحميل القائمة
            } else {
                this.app.showNotification('error', response.error || 'حدث خطأ في إنشاء المستخدم');
            }
        } catch (error) {
            console.error('❌ خطأ في إنشاء المستخدم:', error);
            this.app.showNotification('error', 'حدث خطأ في إنشاء المستخدم');
        }
    }
    
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.remove();
        }
    }
    
    async generateReport(type = null) {
        const reportType = type || document.getElementById('reportType')?.value || 'sales';
        const period = document.getElementById('reportPeriod')?.value || 'month';
        
        let params = { type: reportType, period };
        
        if (period === 'custom') {
            const dateFrom = document.getElementById('reportDateFrom')?.value;
            const dateTo = document.getElementById('reportDateTo')?.value;
            
            if (!dateFrom || !dateTo) {
                this.app.showNotification('error', 'يرجى تحديد تاريخ البداية والنهاية');
                return;
            }
            
            params.date_from = dateFrom;
            params.date_to = dateTo;
        }
        
        try {
            const response = await api.post('/admin/reports/generate', params);
            if (response.success) {
                this.displayReportResults(response.data);
                
                // زر التحميل
                const downloadBtn = document.createElement('button');
                downloadBtn.className = 'btn btn-primary mt-3';
                downloadBtn.innerHTML = '<i class="fas fa-download"></i> تحميل التقرير';
                downloadBtn.onclick = () => this.downloadReport(response.data);
                
                const resultsContainer = document.getElementById('reportResults');
                if (resultsContainer) {
                    resultsContainer.appendChild(downloadBtn);
                }
            } else {
                this.app.showNotification('error', response.error || 'حدث خطأ في إنشاء التقرير');
            }
        } catch (error) {
            console.error('❌ خطأ في إنشاء التقرير:', error);
            this.app.showNotification('error', 'حدث خطأ في إنشاء التقرير');
        }
    }
    
    displayReportResults(data) {
        const container = document.getElementById('reportResults');
        if (!container) return;
        
        let html = '';
        
        if (data.type === 'sales') {
            html = this.getSalesReportHtml(data);
        } else if (data.type === 'users') {
            html = this.getUsersReportHtml(data);
        } else if (data.type === 'products') {
            html = this.getProductsReportHtml(data);
        } else {
            html = this.getGenericReportHtml(data);
        }
        
        container.innerHTML = html;
    }
    
    getSalesReportHtml(data) {
        return `
            <div class="report-summary">
                <h4>تقرير المبيعات</h4>
                <div class="summary-stats">
                    <div class="summary-stat">
                        <div class="stat-label">إجمالي المبيعات</div>
                        <div class="stat-value">${utils.formatCurrency(data.total_sales || 0)}</div>
                    </div>
                    <div class="summary-stat">
                        <div class="stat-label">عدد الطلبات</div>
                        <div class="stat-value">${data.order_count || 0}</div>
                    </div>
                    <div class="summary-stat">
                        <div class="stat-label">متوسط قيمة الطلب</div>
                        <div class="stat-value">${utils.formatCurrency(data.average_order_value || 0)}</div>
                    </div>
                </div>
                
                ${data.daily_sales ? `
                    <div class="report-table">
                        <h5>المبيعات اليومية</h5>
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>التاريخ</th>
                                    <th>عدد الطلبات</th>
                                    <th>إجمالي المبيعات</th>
                                    <th>متوسط الطلب</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.daily_sales.map(day => `
                                    <tr>
                                        <td>${day.date}</td>
                                        <td>${day.order_count}</td>
                                        <td>${utils.formatCurrency(day.total_sales)}</td>
                                        <td>${utils.formatCurrency(day.average_order_value)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    async downloadReport(data) {
        try {
            const response = await api.post('/admin/reports/export', data);
            if (response.success && response.data) {
                // إنشاء رابط تحميل
                const blob = new Blob([response.data.buffer], { type: response.data.type });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = response.data.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                
                this.app.showNotification('success', 'تم تحميل التقرير بنجاح');
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل التقرير:', error);
            this.app.showNotification('error', 'حدث خطأ في تحميل التقرير');
        }
    }
    
    getErrorView(message) {
        return `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>${message}</h3>
                <button class="btn btn-primary" onclick="admin.showView('overview')">
                    العودة للرئيسية
                </button>
            </div>
        `;
    }
    
    updateStatsUI() {
        // تحديث عناصر UI بالإحصائيات
        const elements = {
            'totalUsers': this.stats.total_users,
            'totalOrders': this.stats.total_orders,
            'totalRevenue': utils.formatCurrency(this.stats.total_revenue || 0),
            'totalProducts': this.stats.total_products
        };
        
        Object.entries(elements).forEach(([key, value]) => {
            const element = document.getElementById(key);
            if (element) {
                element.textContent = value;
            }
        });
    }
    
    updateUI() {
        // تحديث جميع عناصر UI بناءً على دور المستخدم
        this.updateUserInfo();
        this.updateNavigationVisibility();
        this.updateBadges();
    }
    
    updateUserInfo() {
        const user = this.app.state.user;
        
        // تحديث المعلومات في الشريط الجانبي
        const userNameElements = document.querySelectorAll('#userName, #topUserName');
        userNameElements.forEach(el => {
            if (el) el.textContent = user.name;
        });
        
        const userRoleElements = document.querySelectorAll('#userRole');
        userRoleElements.forEach(el => {
            if (el) el.textContent = this.getRoleText(user.role);
        });
        
        const userAvatarElements = document.querySelectorAll('#userAvatar, #topUserAvatar');
        userAvatarElements.forEach(el => {
            if (el && user.avatar) {
                el.src = user.avatar;
            }
        });
    }
    
    updateNavigationVisibility() {
        const userRole = this.app.state.user.role;
        const navItems = document.querySelectorAll('.nav-item[data-role]');
        
        navItems.forEach(item => {
            const roles = item.getAttribute('data-role').split(' ');
            const isVisible = roles.includes('all') || roles.includes(userRole);
            item.style.display = isVisible ? 'block' : 'none';
        });
    }
    
    updateBadges() {
        // تحديث شارات الإشعارات والطلبات
        const badges = {
            'ordersBadge': this.stats.pending_orders || 0,
            'deliveriesBadge': this.stats.pending_deliveries || 0,
            'notificationsBadge': this.stats.unread_notifications || 0,
            'topNotificationsBadge': this.stats.unread_notifications || 0
        };
        
        Object.entries(badges).forEach(([id, count]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = count;
                element.style.display = count > 0 ? 'flex' : 'none';
            }
        });
    }
}

// تصدير مدير الإدارة للاستخدام العام
if (typeof window !== 'undefined') {
    window.AdminManager = AdminManager;
    
    // إنشاء كائن إدارة عالمي
    window.admin = new AdminManager(window.app || {});
}
