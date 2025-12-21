/**
 * dashboard.js - إدارة لوحة التحكم
 * تطبيق قات PRO
 * ===================================
 */

class Dashboard {
    constructor() {
        this.init();
    }

    /**
     * تهيئة لوحة التحكم
     */
    init() {
        console.log('Dashboard initialized');
        
        // تهيئة المكونات
        this.initCharts();
        this.initStats();
        this.initFilters();
        this.initNotifications();
        this.initActivityFeed();
        this.initQuickActions();
        
        // تحديث البيانات تلقائياً
        this.startAutoRefresh();
        
        // معالجة الأحداث
        this.bindEvents();
    }

    /**
     * تهيئة الرسوم البيانية
     */
    initCharts() {
        // رسم بياني للإيرادات
        this.initRevenueChart();
        
        // رسم بياني للطلبات
        this.initOrdersChart();
        
        // رسم بياني للمبيعات حسب المنطقة
        this.initSalesByRegionChart();
        
        // رسم بياني للمنتجات الأكثر مبيعاً
        this.initTopProductsChart();
    }

    /**
     * رسم بياني للإيرادات
     */
    initRevenueChart() {
        const ctx = document.getElementById('salesChart');
        if (!ctx) return;

        const revenueData = {
            labels: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو'],
            datasets: [
                {
                    label: 'الإيرادات',
                    data: [12000, 19000, 15000, 25000, 22000, 30000, 28000],
                    borderColor: '#2E7D32',
                    backgroundColor: 'rgba(46, 125, 50, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3
                },
                {
                    label: 'المصروفات',
                    data: [8000, 12000, 10000, 18000, 15000, 22000, 20000],
                    borderColor: '#F44336',
                    backgroundColor: 'rgba(244, 67, 54, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3
                }
            ]
        };

        this.revenueChart = new Chart(ctx, {
            type: 'line',
            data: revenueData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        rtl: true,
                        labels: {
                            font: {
                                family: 'Tajawal',
                                size: 14
                            }
                        }
                    },
                    tooltip: {
                        rtl: true,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y.toLocaleString()} ريال`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return value.toLocaleString() + ' ريال';
                            },
                            font: {
                                family: 'Tajawal'
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    x: {
                        ticks: {
                            font: {
                                family: 'Tajawal'
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
    }

    /**
     * رسم بياني للطلبات
     */
    initOrdersChart() {
        const ctx = document.getElementById('ordersChart');
        if (!ctx) return;

        const ordersData = {
            labels: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
            datasets: [{
                label: 'عدد الطلبات',
                data: [45, 52, 38, 65, 72, 48, 35],
                backgroundColor: 'rgba(33, 150, 243, 0.5)',
                borderColor: '#2196F3',
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false
            }]
        };

        this.ordersChart = new Chart(ctx, {
            type: 'bar',
            data: ordersData,
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return value + ' طلب';
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * رسم بياني للمبيعات حسب المنطقة
     */
    initSalesByRegionChart() {
        const ctx = document.getElementById('regionChart');
        if (!ctx) return;

        const regionData = {
            labels: ['الرياض', 'جدة', 'مكة', 'الدمام', 'الشرقية'],
            datasets: [{
                data: [35, 25, 15, 15, 10],
                backgroundColor: [
                    '#2E7D32',
                    '#2196F3',
                    '#FF9800',
                    '#9C27B0',
                    '#F44336'
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        };

        this.regionChart = new Chart(ctx, {
            type: 'doughnut',
            data: regionData,
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'right',
                        rtl: true
                    }
                },
                cutout: '70%'
            }
        });
    }

    /**
     * رسم بياني للمنتجات الأكثر مبيعاً
     */
    initTopProductsChart() {
        const ctx = document.getElementById('productsChart');
        if (!ctx) return;

        const productsData = {
            labels: ['قات يماني', 'قات حضرمي', 'قات سعودي', 'قات خولاني', 'قات صنعاني'],
            datasets: [{
                label: 'عدد المبيعات',
                data: [154, 98, 76, 65, 45],
                backgroundColor: 'rgba(255, 152, 0, 0.5)',
                borderColor: '#FF9800',
                borderWidth: 2
            }]
        };

        this.productsChart = new Chart(ctx, {
            type: 'bar',
            data: productsData,
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    /**
     * تهيئة الإحصائيات
     */
    initStats() {
        this.updateStats();
        
        // تحديث الإحصائيات كل 30 ثانية
        setInterval(() => this.updateStats(), 30000);
    }

    /**
     * تحديث الإحصائيات
     */
    async updateStats() {
        try {
            // محاكاة بيانات من API
            const stats = await this.fetchDashboardStats();
            
            // تحديث واجهة المستخدم
            this.updateStatsUI(stats);
            
            // تحديث الرسوم البيانية
            this.updateCharts(stats);
            
        } catch (error) {
            console.error('Error updating stats:', error);
            this.showError('فشل في تحديث البيانات');
        }
    }

    /**
     * جلب إحصائيات لوحة التحكم
     */
    async fetchDashboardStats() {
        // محاكاة API call
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    revenue: {
                        total: 24850,
                        change: 12,
                        trend: 'up'
                    },
                    orders: {
                        total: 154,
                        pending: 12,
                        processing: 8,
                        shipped: 15,
                        delivered: 119
                    },
                    products: {
                        total: 342,
                        active: 298,
                        outOfStock: 44,
                        lowStock: 28
                    },
                    customers: {
                        total: 1248,
                        new: 45,
                        active: 876
                    },
                    todayStats: {
                        revenue: 1850,
                        orders: 12,
                        visitors: 245
                    }
                });
            }, 1000);
        });
    }

    /**
     * تحديث واجهة الإحصائيات
     */
    updateStatsUI(stats) {
        // إيرادات
        this.updateElementText('.stat-revenue .stat-value', `${stats.revenue.total.toLocaleString()} ريال`);
        this.updateTrend('.stat-revenue .stat-change', stats.revenue.change, stats.revenue.trend);
        
        // طلبات
        this.updateElementText('.stat-orders .stat-value', stats.orders.total.toLocaleString());
        this.updateElementText('.stat-pending', stats.orders.pending);
        this.updateElementText('.stat-processing', stats.orders.processing);
        
        // منتجات
        this.updateElementText('.stat-products .stat-value', stats.products.total.toLocaleString());
        this.updateElementText('.stat-out-of-stock', stats.products.outOfStock);
        
        // عملاء
        this.updateElementText('.stat-customers .stat-value', stats.customers.total.toLocaleString());
        this.updateElementText('.stat-new-customers', stats.customers.new);
        
        // اليوم
        this.updateElementText('.stat-today-revenue', `${stats.todayStats.revenue.toLocaleString()} ريال`);
        this.updateElementText('.stat-today-orders', stats.todayStats.orders);
    }

    /**
     * تحديث اتجاه المؤشر
     */
    updateTrend(elementSelector, change, trend) {
        const element = document.querySelector(elementSelector);
        if (!element) return;
        
        element.textContent = `${trend === 'up' ? '↑' : '↓'} ${Math.abs(change)}%`;
        element.className = `stat-change ${trend === 'up' ? 'positive' : 'negative'}`;
    }

    /**
     * تحديث نص العنصر
     */
    updateElementText(selector, text) {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = text;
        }
    }

    /**
     * تحديث الرسوم البيانية
     */
    updateCharts(stats) {
        if (this.revenueChart) {
            // تحديث بيانات الإيرادات
            const newData = this.generateRevenueData();
            this.revenueChart.data.datasets[0].data = newData;
            this.revenueChart.update();
        }
    }

    /**
     * توليد بيانات إيرادات جديدة
     */
    generateRevenueData() {
        return Array.from({length: 7}, () => Math.floor(Math.random() * 20000) + 10000);
    }

    /**
     * تهيئة عوامل التصفية
     */
    initFilters() {
        // فلترة الفترة الزمنية
        const periodFilter = document.getElementById('periodFilter');
        if (periodFilter) {
            periodFilter.addEventListener('change', (e) => {
                this.filterByPeriod(e.target.value);
            });
        }

        // فلترة الحالة
        const statusFilters = document.querySelectorAll('.status-filter');
        statusFilters.forEach(filter => {
            filter.addEventListener('click', (e) => {
                this.filterByStatus(e.target.dataset.status);
            });
        });

        // فلترة البحث
        const searchInput = document.querySelector('.dashboard-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchData(e.target.value);
            });
        }
    }

    /**
     * فلترة حسب الفترة الزمنية
     */
    filterByPeriod(period) {
        console.log('Filtering by period:', period);
        
        // تحديث الرسوم البيانية حسب الفترة
        this.updateChartsByPeriod(period);
        
        // تحديث البيانات
        this.refreshData(period);
    }

    /**
     * فلترة حسب الحالة
     */
    filterByStatus(status) {
        console.log('Filtering by status:', status);
        
        // تحديث قائمة الطلبات
        this.filterOrders(status);
        
        // تحديث زر الفلترة النشط
        this.setActiveFilter(status);
    }

    /**
     * تحديث الرسوم البيانية حسب الفترة
     */
    updateChartsByPeriod(period) {
        let dataPoints;
        
        switch(period) {
            case 'week':
                dataPoints = 7;
                break;
            case 'month':
                dataPoints = 30;
                break;
            case 'quarter':
                dataPoints = 90;
                break;
            case 'year':
                dataPoints = 12;
                break;
            default:
                dataPoints = 7;
        }
        
        // تحديث البيانات
        if (this.revenueChart) {
            const newData = Array.from({length: dataPoints}, () => 
                Math.floor(Math.random() * 20000) + 10000
            );
            
            this.revenueChart.data.labels = this.generateLabels(dataPoints, period);
            this.revenueChart.data.datasets[0].data = newData;
            this.revenueChart.update();
        }
    }

    /**
     * توليد تسميات المحور السيني
     */
    generateLabels(count, period) {
        if (period === 'year') {
            return ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 
                   'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'].slice(0, count);
        }
        
        return Array.from({length: count}, (_, i) => `اليوم ${i + 1}`);
    }

    /**
     * فلترة الطلبات
     */
    filterOrders(status) {
        const orderRows = document.querySelectorAll('.orders-table tbody tr');
        
        orderRows.forEach(row => {
            const rowStatus = row.querySelector('.status').textContent.trim();
            
            if (status === 'all' || rowStatus.includes(status)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    /**
     * تعيين عامل الفلترة النشط
     */
    setActiveFilter(status) {
        const filters = document.querySelectorAll('.status-filter');
        filters.forEach(filter => {
            if (filter.dataset.status === status) {
                filter.classList.add('active');
            } else {
                filter.classList.remove('active');
            }
        });
    }

    /**
     * بحث في البيانات
     */
    searchData(query) {
        if (!query.trim()) {
            // إظهار كل الطلبات
            document.querySelectorAll('.orders-table tbody tr').forEach(row => {
                row.style.display = '';
            });
            return;
        }
        
        const searchTerm = query.toLowerCase();
        document.querySelectorAll('.orders-table tbody tr').forEach(row => {
            const orderId = row.cells[0].textContent.toLowerCase();
            const customer = row.cells[1].textContent.toLowerCase();
            
            if (orderId.includes(searchTerm) || customer.includes(searchTerm)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    /**
     * تحديث البيانات
     */
    async refreshData(period = 'week') {
        try {
            this.showLoading();
            
            // جلب بيانات جديدة
            const data = await this.fetchDataByPeriod(period);
            
            // تحديث الواجهة
            this.updateDashboard(data);
            
            this.hideLoading();
            
        } catch (error) {
            console.error('Error refreshing data:', error);
            this.showError('فشل في تحميل البيانات');
            this.hideLoading();
        }
    }

    /**
     * جلب البيانات حسب الفترة
     */
    async fetchDataByPeriod(period) {
        // محاكاة API call
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    period: period,
                    revenue: Math.floor(Math.random() * 50000) + 20000,
                    orders: Math.floor(Math.random() * 200) + 50,
                    // ... بيانات أخرى
                });
            }, 1500);
        });
    }

    /**
     * تحديث لوحة التحكم
     */
    updateDashboard(data) {
        // تحديث الإحصائيات
        this.updateElementText('.current-period', `فترة: ${this.getPeriodName(data.period)}`);
        
        // تحديث الرسوم البيانية
        this.updateChartsWithData(data);
        
        // تحديث قائمة الطلبات
        this.updateOrdersList(data.orders);
    }

    /**
     * الحصول على اسم الفترة
     */
    getPeriodName(period) {
        const periods = {
            'week': 'أسبوع',
            'month': 'شهر',
            'quarter': 'ربع سنة',
            'year': 'سنة'
        };
        return periods[period] || period;
    }

    /**
     * تحديث الرسوم البيانية بالبيانات الجديدة
     */
    updateChartsWithData(data) {
        // يمكن تحديث الرسوم البيانية هنا
        console.log('Updating charts with data:', data);
    }

    /**
     * تحديث قائمة الطلبات
     */
    updateOrdersList(orders) {
        // محاكاة تحديث قائمة الطلبات
        console.log('Updating orders list:', orders);
    }

    /**
     * تهيئة الإشعارات
     */
    initNotifications() {
        // تحديث عداد الإشعارات
        this.updateNotificationCount();
        
        // تحديث قائمة الإشعارات
        this.loadNotifications();
        
        // الاشتراك في الإشعارات الوقتية
        this.subscribeToRealtimeNotifications();
    }

    /**
     * تحديث عداد الإشعارات
     */
    updateNotificationCount() {
        // محاكاة جلب عدد الإشعارات
        const count = Math.floor(Math.random() * 10);
        const badge = document.querySelector('.notification-badge');
        
        if (badge) {
            badge.textContent = count > 0 ? count : '';
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    }

    /**
     * تحميل الإشعارات
     */
    async loadNotifications() {
        try {
            const notifications = await this.fetchNotifications();
            this.renderNotifications(notifications);
        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    }

    /**
     * جلب الإشعارات
     */
    async fetchNotifications() {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve([
                    {
                        id: 1,
                        type: 'order',
                        message: 'طلب جديد #ORD-2456',
                        time: 'قبل 15 دقيقة',
                        read: false
                    },
                    {
                        id: 2,
                        type: 'payment',
                        message: 'تم تأكيد الدفع للمنتج #PRD-123',
                        time: 'قبل ساعة',
                        read: true
                    },
                    {
                        id: 3,
                        type: 'system',
                        message: 'تحديث النظام مكتمل',
                        time: 'قبل 3 ساعات',
                        read: true
                    }
                ]);
            }, 500);
        });
    }

    /**
     * عرض الإشعارات
     */
    renderNotifications(notifications) {
        const container = document.querySelector('.notifications-dropdown');
        if (!container) return;
        
        const unreadCount = notifications.filter(n => !n.read).length;
        
        let html = `
            <div class="dropdown-header">
                <h3 class="dropdown-title">الإشعارات</h3>
                ${unreadCount > 0 ? `<span class="dropdown-count">${unreadCount}</span>` : ''}
            </div>
            <div class="dropdown-items">
        `;
        
        notifications.forEach(notification => {
            html += `
                <div class="dropdown-item ${notification.read ? '' : 'unread'}">
                    <div class="notification-icon ${notification.type}">
                        <i class="fas fa-${this.getNotificationIcon(notification.type)}"></i>
                    </div>
                    <div class="notification-content">
                        <p class="notification-message">${notification.message}</p>
                        <span class="notification-time">${notification.time}</span>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
    }

    /**
     * الحصول على أيقونة الإشعار
     */
    getNotificationIcon(type) {
        const icons = {
            'order': 'shopping-cart',
            'payment': 'credit-card',
            'system': 'cog',
            'warning': 'exclamation-triangle',
            'success': 'check-circle'
        };
        return icons[type] || 'bell';
    }

    /**
     * الاشتراك في الإشعارات الوقتية
     */
    subscribeToRealtimeNotifications() {
        // محاكاة اتصال WebSocket
        setInterval(() => {
            if (Math.random() > 0.7) {
                this.showRealtimeNotification();
            }
        }, 30000);
    }

    /**
     * عرض إشعار وقت الحقيقي
     */
    showRealtimeNotification() {
        const messages = [
            'طلب جديد تم استلامه',
            'دفعة جديدة تم تأكيدها',
            'عميل جديد قام بالتسجيل',
            'منتج جديد تم إضافته'
        ];
        
        const randomMessage = messages[Math.floor(Math.random() * messages.length)];
        this.showToast(randomMessage, 'success');
    }

    /**
     * عرض رسالة عائمة
     */
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas fa-${this.getToastIcon(type)}"></i>
                <span>${message}</span>
            </div>
            <button class="toast-close">&times;</button>
        `;
        
        document.body.appendChild(toast);
        
        // إظهار الرسالة
        setTimeout(() => toast.classList.add('show'), 100);
        
        // إغلاق تلقائي بعد 5 ثوانٍ
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
        
        // إغلاق يدوي
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        });
    }

    /**
     * الحصول على أيقونة الرسالة العائمة
     */
    getToastIcon(type) {
        const icons = {
            'success': 'check-circle',
            'error': 'exclamation-circle',
            'warning': 'exclamation-triangle',
            'info': 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    /**
     * تهيئة النشاطات
     */
    initActivityFeed() {
        this.loadActivityFeed();
        
        // تحديث النشاطات تلقائياً
        setInterval(() => this.loadActivityFeed(), 60000);
    }

    /**
     * تحميل النشاطات
     */
    async loadActivityFeed() {
        try {
            const activities = await this.fetchActivities();
            this.renderActivityFeed(activities);
        } catch (error) {
            console.error('Error loading activities:', error);
        }
    }

    /**
     * جلب النشاطات
     */
    async fetchActivities() {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve([
                    {
                        id: 1,
                        type: 'order',
                        message: 'تم إنشاء طلب جديد #ORD-2456',
                        user: 'أحمد محمد',
                        time: 'قبل 15 دقيقة',
                        icon: 'shopping-cart',
                        color: 'success'
                    },
                    {
                        id: 2,
                        type: 'user',
                        message: 'مستخدم جديد قام بالتسجيل',
                        user: 'سالم علي',
                        time: 'قبل ساعتين',
                        icon: 'user-plus',
                        color: 'info'
                    },
                    {
                        id: 3,
                        type: 'product',
                        message: 'تمت إضافة منتج جديد',
                        user: 'فاطمة حسن',
                        time: 'قبل 3 ساعات',
                        icon: 'box',
                        color: 'warning'
                    }
                ]);
            }, 800);
        });
    }

    /**
     * عرض النشاطات
     */
    renderActivityFeed(activities) {
        const container = document.querySelector('.activity-feed');
        if (!container) return;
        
        let html = '';
        
        activities.forEach(activity => {
            html += `
                <div class="activity-item">
                    <div class="activity-icon ${activity.color}">
                        <i class="fas fa-${activity.icon}"></i>
                    </div>
                    <div class="activity-content">
                        <h4>${activity.message}</h4>
                        <p>بواسطة ${activity.user}</p>
                        <span class="activity-time">${activity.time}</span>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }

    /**
     * تهيئة الإجراءات السريعة
     */
    initQuickActions() {
        const quickActions = document.querySelectorAll('.quick-action');
        
        quickActions.forEach(action => {
            action.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleQuickAction(action.dataset.action);
            });
        });
    }

    /**
     * معالجة الإجراءات السريعة
     */
    handleQuickAction(action) {
        switch(action) {
            case 'add-product':
                window.location.href = '/pages/products.html?action=add';
                break;
            case 'create-order':
                this.showCreateOrderModal();
                break;
            case 'recharge-wallet':
                window.location.href = '/pages/wallet.html?action=recharge';
                break;
            case 'visit-markets':
                window.location.href = '/pages/markets.html';
                break;
            case 'view-reports':
                this.showReports();
                break;
            case 'support':
                this.showSupportModal();
                break;
        }
    }

    /**
     * عرض نموذج إنشاء طلب
     */
    showCreateOrderModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>إنشاء طلب جديد</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="createOrderForm">
                        <div class="form-group">
                            <label>اختر المنتج</label>
                            <select class="form-control" required>
                                <option value="">اختر منتج</option>
                                <option value="1">قات يماني ممتاز</option>
                                <option value="2">قات حضرمي</option>
                                <option value="3">قات سعودي</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>الكمية</label>
                            <input type="number" class="form-control" min="1" value="1" required>
                        </div>
                        <div class="form-group">
                            <label>العنوان</label>
                            <textarea class="form-control" rows="3" required></textarea>
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="btn-primary">إنشاء الطلب</button>
                            <button type="button" class="btn-secondary modal-close">إلغاء</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // إغلاق النموذج
        modal.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => modal.remove());
        });
        
        // معالجة النموذج
        modal.querySelector('form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createNewOrder(new FormData(e.target));
            modal.remove();
        });
    }

    /**
     * إنشاء طلب جديد
     */
    async createNewOrder(formData) {
        try {
            this.showLoading();
            
            // محاكاة إنشاء الطلب
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            this.showToast('تم إنشاء الطلب بنجاح', 'success');
            
            // تحديث البيانات
            this.refreshData();
            
        } catch (error) {
            this.showToast('فشل في إنشاء الطلب', 'error');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * عرض التقارير
     */
    showReports() {
        window.open('/reports/dashboard.pdf', '_blank');
    }

    /**
     * عرض نموذج الدعم
     */
    showSupportModal() {
        // تنفيذ مشابه لـ showCreateOrderModal
        console.log('Support modal opened');
    }

    /**
     * بدء التحديث التلقائي
     */
    startAutoRefresh() {
        // تحديث كل 5 دقائق
        setInterval(() => this.refreshData(), 5 * 60 * 1000);
    }

    /**
     * ربط الأحداث
     */
    bindEvents() {
        // تحديث يدوي
        const refreshBtn = document.querySelector('.btn-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshData());
        }
        
        // تصدير البيانات
        const exportBtn = document.querySelector('.btn-export');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportData());
        }
        
        // تغيير السمة
        const themeToggle = document.querySelector('.theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }
        
        // البحث المتقدم
        const advancedSearch = document.querySelector('.btn-advanced-search');
        if (advancedSearch) {
            advancedSearch.addEventListener('click', () => this.showAdvancedSearch());
        }
    }

    /**
     * تصدير البيانات
     */
    exportData() {
        const data = {
            timestamp: new Date().toISOString(),
            stats: this.getCurrentStats(),
            charts: this.getChartsData()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dashboard-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.showToast('تم تصدير البيانات بنجاح', 'success');
    }

    /**
     * الحصول على الإحصائيات الحالية
     */
    getCurrentStats() {
        // محاكاة جلب البيانات الحالية
        return {
            revenue: 24850,
            orders: 154,
            products: 342,
            customers: 1248
        };
    }

    /**
     * الحصول على بيانات الرسوم البيانية
     */
    getChartsData() {
        if (!this.revenueChart) return {};
        
        return {
            revenue: this.revenueChart.data,
            orders: this.ordersChart?.data || {}
        };
    }

    /**
     * تبديل السمة
     */
    toggleTheme() {
        const body = document.body;
        const isDark = body.classList.contains('dark-theme');
        
        if (isDark) {
            body.classList.remove('dark-theme');
            localStorage.setItem('theme', 'light');
        } else {
            body.classList.add('dark-theme');
            localStorage.setItem('theme', 'dark');
        }
        
        // إعادة تهيئة الرسوم البيانية
        this.reinitializeCharts();
    }

    /**
     * إعادة تهيئة الرسوم البيانية
     */
    reinitializeCharts() {
        if (this.revenueChart) {
            this.revenueChart.destroy();
            this.initRevenueChart();
        }
        
        if (this.ordersChart) {
            this.ordersChart.destroy();
            this.initOrdersChart();
        }
    }

    /**
     * عرض البحث المتقدم
     */
    showAdvancedSearch() {
        const searchPanel = document.createElement('div');
        searchPanel.className = 'advanced-search-panel';
        searchPanel.innerHTML = `
            <div class="search-panel-content">
                <h3>بحث متقدم</h3>
                <form id="advancedSearchForm">
                    <div class="form-group">
                        <label>نوع البحث</label>
                        <select class="form-control">
                            <option value="all">الكل</option>
                            <option value="orders">الطلبات</option>
                            <option value="products">المنتجات</option>
                            <option value="customers">العملاء</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>الفترة</label>
                        <input type="date" class="form-control" name="from">
                        <span>إلى</span>
                        <input type="date" class="form-control" name="to">
                    </div>
                    <div class="form-group">
                        <label>الحالة</label>
                        <select class="form-control" multiple>
                            <option value="pending">معلق</option>
                            <option value="processing">قيد المعالجة</option>
                            <option value="completed">مكتمل</option>
                        </select>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn-primary">بحث</button>
                        <button type="button" class="btn-secondary close-panel">إلغاء</button>
                    </div>
                </form>
            </div>
        `;
        
        document.body.appendChild(searchPanel);
        
        // إغلاق اللوحة
        searchPanel.querySelector('.close-panel').addEventListener('click', () => {
            searchPanel.remove();
        });
        
        // معالجة البحث
        searchPanel.querySelector('form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.performAdvancedSearch(new FormData(e.target));
            searchPanel.remove();
        });
    }

    /**
     * تنفيذ بحث متقدم
     */
    performAdvancedSearch(formData) {
        console.log('Advanced search:', Object.fromEntries(formData));
        this.showToast('جاري البحث...', 'info');
        
        // محاكاة البحث
        setTimeout(() => {
            this.showToast('تم العثور على 25 نتيجة', 'success');
        }, 2000);
    }

    /**
     * عرض مؤشر التحميل
     */
    showLoading() {
        let loader = document.querySelector('.dashboard-loader');
        if (!loader) {
            loader = document.createElement('div');
            loader.className = 'dashboard-loader';
            loader.innerHTML = '<div class="loader-spinner"></div><p>جاري التحميل...</p>';
            document.querySelector('.dashboard-container').appendChild(loader);
        }
        loader.style.display = 'flex';
    }

    /**
     * إخفاء مؤشر التحميل
     */
    hideLoading() {
        const loader = document.querySelector('.dashboard-loader');
        if (loader) {
            loader.style.display = 'none';
        }
    }

    /**
     * عرض خطأ
     */
    showError(message) {
        this.showToast(message, 'error');
    }
}

// تصدير الكلاس
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Dashboard;
}

// التهيئة التلقائية عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
    // التحقق من وجود عناصر لوحة التحكم
    if (document.querySelector('.dashboard-container')) {
        window.dashboard = new Dashboard();
    }
});
