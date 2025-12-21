// نظام التقارير والإحصائيات لتطبيق قات PRO
class ReportsManager {
    constructor(app) {
        this.app = app;
        this.charts = {};
        this.currentReport = null;
        this.reportData = null;
    }
    
    async initialize() {
        console.log('📊 تهيئة نظام التقارير...');
        
        // إعداد مكتبات الرسوم البيانية إذا لزم الأمر
        this.setupChartLibraries();
        
        // إعداد مستمعي الأحداث
        this.setupEventListeners();
        
        console.log('✅ تم تهيئة نظام التقارير بنجاح');
    }
    
    setupChartLibraries() {
        // يمكن استخدام Chart.js أو مكتبة رسوم بيانية أخرى
        // هذا مثال باستخدام Chart.js (يجب تضمين المكتبة أولاً)
        if (typeof Chart !== 'undefined') {
            console.log('📈 مكتبة الرسوم البيانية جاهزة');
        } else {
            console.warn('⚠️ مكتبة الرسوم البيانية غير مثبتة');
        }
    }
    
    setupEventListeners() {
        // مستمعي الأحداث الخاصة بالتقارير
        document.addEventListener('click', (e) => {
            if (e.target.matches('.export-report-btn') || e.target.closest('.export-report-btn')) {
                const btn = e.target.closest('.export-report-btn');
                const format = btn?.getAttribute('data-format') || 'excel';
                const type = btn?.getAttribute('data-type') || this.currentReport;
                this.exportReport(type, format);
            }
            
            if (e.target.matches('.print-report-btn') || e.target.closest('.print-report-btn')) {
                this.printReport();
            }
            
            if (e.target.matches('.refresh-report-btn') || e.target.closest('.refresh-report-btn')) {
                this.refreshReport();
            }
        });
        
        // تغيير نوع التقرير
        const reportTypeSelect = document.getElementById('reportType');
        if (reportTypeSelect) {
            reportTypeSelect.addEventListener('change', (e) => {
                this.currentReport = e.target.value;
                this.loadReport(this.currentReport);
            });
        }
        
        // تغيير الفترة
        const reportPeriodSelect = document.getElementById('reportPeriod');
        if (reportPeriodSelect) {
            reportPeriodSelect.addEventListener('change', (e) => {
                this.toggleCustomDateRange(e.target.value === 'custom');
                if (e.target.value !== 'custom') {
                    this.loadReport(this.currentReport, e.target.value);
                }
            });
        }
        
        // تطبيق النطاق الزمني المخصص
        const applyCustomRangeBtn = document.getElementById('applyCustomRange');
        if (applyCustomRangeBtn) {
            applyCustomRangeBtn.addEventListener('click', () => {
                this.applyCustomDateRange();
            });
        }
    }
    
    toggleCustomDateRange(show) {
        const customRangeDiv = document.getElementById('customDateRange');
        if (customRangeDiv) {
            customRangeDiv.style.display = show ? 'block' : 'none';
        }
    }
    
    async loadReport(type = 'sales', period = 'month', customRange = null) {
        if (!type) return;
        
        this.currentReport = type;
        
        // إظهار حالة التحميل
        this.showLoading();
        
        try {
            const params = { type, period };
            
            if (customRange) {
                params.date_from = customRange.from;
                params.date_to = customRange.to;
            }
            
            const response = await api.get('/admin/reports', params);
            
            if (response.success) {
                this.reportData = response.data;
                this.displayReport(type, response.data);
                this.app.showNotification('success', 'تم تحميل التقرير بنجاح');
            } else {
                this.showError(response.error || 'حدث خطأ في تحميل التقرير');
            }
        } catch (error) {
            console.error('❌ خطأ في تحميل التقرير:', error);
            this.showError('حدث خطأ في تحميل التقرير');
        } finally {
            this.hideLoading();
        }
    }
    
    displayReport(type, data) {
        const reportContainer = document.getElementById('reportResults');
        if (!reportContainer) return;
        
        let html = '';
        
        switch(type) {
            case 'sales':
                html = this.getSalesReportHtml(data);
                break;
            case 'users':
                html = this.getUsersReportHtml(data);
                break;
            case 'products':
                html = this.getProductsReportHtml(data);
                break;
            case 'orders':
                html = this.getOrdersReportHtml(data);
                break;
            case 'financial':
                html = this.getFinancialReportHtml(data);
                break;
            default:
                html = this.getSalesReportHtml(data);
        }
        
        // إضافة أزرار الإجراءات
        html += this.getReportActionsHtml(type);
        
        reportContainer.innerHTML = html;
        
        // إنشاء الرسوم البيانية إذا كانت البيانات تحتوي عليها
        if (data.charts) {
            this.createCharts(data.charts);
        }
    }
    
    getSalesReportHtml(data) {
        return `
            <div class="report-content">
                <div class="report-header">
                    <h3>تقرير المبيعات</h3>
                    <div class="report-period">
                        <span>الفترة: ${data.period || 'غير محدد'}</span>
                        <span>تاريخ الإنشاء: ${new Date().toLocaleDateString('ar-SA')}</span>
                    </div>
                </div>
                
                <div class="report-summary">
                    <div class="summary-cards">
                        <div class="summary-card">
                            <div class="card-icon">
                                <i class="fas fa-shopping-cart"></i>
                            </div>
                            <div class="card-content">
                                <div class="card-value">${data.total_orders || 0}</div>
                                <div class="card-label">إجمالي الطلبات</div>
                            </div>
                            <div class="card-change ${data.order_growth >= 0 ? 'positive' : 'negative'}">
                                <i class="fas fa-${data.order_growth >= 0 ? 'arrow-up' : 'arrow-down'}"></i>
                                ${Math.abs(data.order_growth || 0)}%
                            </div>
                        </div>
                        
                        <div class="summary-card">
                            <div class="card-icon">
                                <i class="fas fa-money-bill-wave"></i>
                            </div>
                            <div class="card-content">
                                <div class="card-value">${utils.formatCurrency(data.total_revenue || 0)}</div>
                                <div class="card-label">إجمالي الإيرادات</div>
                            </div>
                            <div class="card-change ${data.revenue_growth >= 0 ? 'positive' : 'negative'}">
                                <i class="fas fa-${data.revenue_growth >= 0 ? 'arrow-up' : 'arrow-down'}"></i>
                                ${Math.abs(data.revenue_growth || 0)}%
                            </div>
                        </div>
                        
                        <div class="summary-card">
                            <div class="card-icon">
                                <i class="fas fa-users"></i>
                            </div>
                            <div class="card-content">
                                <div class="card-value">${data.unique_customers || 0}</div>
                                <div class="card-label">عملاء فريدون</div>
                            </div>
                            <div class="card-change ${data.customer_growth >= 0 ? 'positive' : 'negative'}">
                                <i class="fas fa-${data.customer_growth >= 0 ? 'arrow-up' : 'arrow-down'}"></i>
                                ${Math.abs(data.customer_growth || 0)}%
                            </div>
                        </div>
                        
                        <div class="summary-card">
                            <div class="card-icon">
                                <i class="fas fa-box"></i>
                            </div>
                            <div class="card-content">
                                <div class="card-value">${data.total_products_sold || 0}</div>
                                <div class="card-label">منتجات مباعة</div>
                            </div>
                            <div class="card-change ${data.products_growth >= 0 ? 'positive' : 'negative'}">
                                <i class="fas fa-${data.products_growth >= 0 ? 'arrow-up' : 'arrow-down'}"></i>
                                ${Math.abs(data.products_growth || 0)}%
                            </div>
                        </div>
                    </div>
                    
                    ${data.daily_sales && data.daily_sales.length > 0 ? `
                        <div class="report-section">
                            <h4>المبيعات اليومية</h4>
                            <div class="chart-container">
                                <canvas id="dailySalesChart" height="300"></canvas>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${data.top_products && data.top_products.length > 0 ? `
                        <div class="report-section">
                            <h4>أعلى المنتجات مبيعاً</h4>
                            <div class="table-responsive">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th>المنتج</th>
                                            <th>الفئة</th>
                                            <th>الكمية المباعة</th>
                                            <th>الإيرادات</th>
                                            <th>النسبة</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${data.top_products.map((product, index) => `
                                            <tr>
                                                <td>
                                                    <div class="product-cell">
                                                        ${product.image ? `
                                                            <img src="${product.image}" alt="${product.name}" class="product-thumb">
                                                        ` : ''}
                                                        <span>${product.name}</span>
                                                    </div>
                                                </td>
                                                <td>${product.category}</td>
                                                <td>${product.quantity_sold}</td>
                                                <td>${utils.formatCurrency(product.revenue)}</td>
                                                <td>
                                                    <div class="progress-wrapper">
                                                        <div class="progress">
                                                            <div class="progress-bar" style="width: ${product.percentage || 0}%"></div>
                                                        </div>
                                                        <span>${product.percentage || 0}%</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${data.top_customers && data.top_customers.length > 0 ? `
                        <div class="report-section">
                            <h4>أفضل العملاء</h4>
                            <div class="table-responsive">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th>العميل</th>
                                            <th>عدد الطلبات</th>
                                            <th>إجمالي المشتريات</th>
                                            <th>متوسط الطلب</th>
                                            <th>آخر شراء</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${data.top_customers.map(customer => `
                                            <tr>
                                                <td>
                                                    <div class="user-cell">
                                                        ${customer.avatar ? `
                                                            <img src="${customer.avatar}" alt="${customer.name}" class="user-avatar">
                                                        ` : ''}
                                                        <div class="user-info">
                                                            <strong>${customer.name}</strong>
                                                            <small>${customer.email}</small>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>${customer.order_count}</td>
                                                <td>${utils.formatCurrency(customer.total_spent)}</td>
                                                <td>${utils.formatCurrency(customer.average_order)}</td>
                                                <td>${utils.formatters.date(customer.last_order, 'short')}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    getUsersReportHtml(data) {
        return `
            <div class="report-content">
                <div class="report-header">
                    <h3>تقرير المستخدمين</h3>
                    <div class="report-period">
                        <span>الفترة: ${data.period || 'غير محدد'}</span>
                        <span>تاريخ الإنشاء: ${new Date().toLocaleDateString('ar-SA')}</span>
                    </div>
                </div>
                
                <div class="report-summary">
                    <div class="summary-cards">
                        <div class="summary-card">
                            <div class="card-icon">
                                <i class="fas fa-users"></i>
                            </div>
                            <div class="card-content">
                                <div class="card-value">${data.total_users || 0}</div>
                                <div class="card-label">إجمالي المستخدمين</div>
                            </div>
                            <div class="card-change ${data.user_growth >= 0 ? 'positive' : 'negative'}">
                                <i class="fas fa-${data.user_growth >= 0 ? 'arrow-up' : 'arrow-down'}"></i>
                                ${Math.abs(data.user_growth || 0)}%
                            </div>
                        </div>
                        
                        <div class="summary-card">
                            <div class="card-icon">
                                <i class="fas fa-user-plus"></i>
                            </div>
                            <div class="card-content">
                                <div class="card-value">${data.new_users || 0}</div>
                                <div class="card-label">مستخدمين جدد</div>
                            </div>
                        </div>
                        
                        <div class="summary-card">
                            <div class="card-icon">
                                <i class="fas fa-store"></i>
                            </div>
                            <div class="card-content">
                                <div class="card-value">${data.total_sellers || 0}</div>
                                <div class="card-label">بائعين</div>
                            </div>
                        </div>
                        
                        <div class="summary-card">
                            <div class="card-icon">
                                <i class="fas fa-truck"></i>
                            </div>
                            <div class="card-content">
                                <div class="card-value">${data.total_drivers || 0}</div>
                                <div class="card-label">سائقين</div>
                            </div>
                        </div>
                    </div>
                    
                    ${data.users_by_role && Object.keys(data.users_by_role).length > 0 ? `
                        <div class="report-section">
                            <h4>توزيع المستخدمين حسب النوع</h4>
                            <div class="chart-container">
                                <canvas id="usersByRoleChart" height="300"></canvas>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${data.users_by_date && data.users_by_date.length > 0 ? `
                        <div class="report-section">
                            <h4>تسجيلات المستخدمين حسب التاريخ</h4>
                            <div class="chart-container">
                                <canvas id="usersByDateChart" height="300"></canvas>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${data.active_users && data.active_users.length > 0 ? `
                        <div class="report-section">
                            <h4>المستخدمين النشطين</h4>
                            <div class="table-responsive">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th>المستخدم</th>
                                            <th>النوع</th>
                                            <th>آخر نشاط</th>
                                            <th>عدد الطلبات</th>
                                            <th>إجمالي المشتريات</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${data.active_users.map(user => `
                                            <tr>
                                                <td>
                                                    <div class="user-cell">
                                                        ${user.avatar ? `
                                                            <img src="${user.avatar}" alt="${user.name}" class="user-avatar">
                                                        ` : ''}
                                                        <div class="user-info">
                                                            <strong>${user.name}</strong>
                                                            <small>${user.email}</small>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span class="badge badge-${this.getRoleBadgeClass(user.role)}">
                                                        ${this.getRoleText(user.role)}
                                                    </span>
                                                </td>
                                                <td>${utils.formatters.date(user.last_activity, 'short')}</td>
                                                <td>${user.order_count || 0}</td>
                                                <td>${utils.formatCurrency(user.total_spent || 0)}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    getProductsReportHtml(data) {
        // مشابه للتقرير السابق مع تركيز على المنتجات
        return `<div class="report-content">تقرير المنتجات</div>`;
    }
    
    getReportActionsHtml(type) {
        return `
            <div class="report-actions">
                <div class="action-group">
                    <button class="btn btn-primary export-report-btn" data-type="${type}" data-format="excel">
                        <i class="fas fa-file-excel"></i>
                        تصدير إلى Excel
                    </button>
                    <button class="btn btn-outline export-report-btn" data-type="${type}" data-format="pdf">
                        <i class="fas fa-file-pdf"></i>
                        تصدير إلى PDF
                    </button>
                    <button class="btn btn-outline print-report-btn">
                        <i class="fas fa-print"></i>
                        طباعة التقرير
                    </button>
                </div>
                <div class="action-group">
                    <button class="btn btn-outline refresh-report-btn">
                        <i class="fas fa-sync-alt"></i>
                        تحديث التقرير
                    </button>
                </div>
            </div>
        `;
    }
    
    async exportReport(type, format) {
        if (!this.reportData) {
            this.app.showNotification('error', 'لا توجد بيانات للتصدير');
            return;
        }
        
        this.showLoading('جاري تصدير التقرير...');
        
        try {
            const response = await api.post('/admin/reports/export', {
                type: type || this.currentReport,
                format: format,
                data: this.reportData
            });
            
            if (response.success && response.data) {
                // تحميل الملف
                this.downloadFile(response.data, `تقرير_${type}_${new Date().toISOString().split('T')[0]}.${format}`);
                this.app.showNotification('success', 'تم تصدير التقرير بنجاح');
            } else {
                this.app.showNotification('error', response.error || 'حدث خطأ في التصدير');
            }
        } catch (error) {
            console.error('❌ خطأ في تصدير التقرير:', error);
            this.app.showNotification('error', 'حدث خطأ في تصدير التقرير');
        } finally {
            this.hideLoading();
        }
    }
    
    downloadFile(fileData, filename) {
        // إنشاء رابط تحميل للملف
        const blob = new Blob([fileData.buffer], { type: fileData.type });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
    
    printReport() {
        window.print();
    }
    
    async refreshReport() {
        await this.loadReport(this.currentReport);
    }
    
    applyCustomDateRange() {
        const dateFrom = document.getElementById('reportDateFrom')?.value;
        const dateTo = document.getElementById('reportDateTo')?.value;
        
        if (!dateFrom || !dateTo) {
            this.app.showNotification('error', 'يرجى تحديد تاريخ البداية والنهاية');
            return;
        }
        
        if (new Date(dateTo) < new Date(dateFrom)) {
            this.app.showNotification('error', 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
            return;
        }
        
        this.loadReport(this.currentReport, 'custom', { from: dateFrom, to: dateTo });
    }
    
    createCharts(chartData) {
        if (typeof Chart === 'undefined') return;
        
        // تدمير الرسوم البيانية القديمة
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
        
        this.charts = {};
        
        // إنشاء رسوم بيانية جديدة
        if (chartData.daily_sales) {
            this.createDailySalesChart(chartData.daily_sales);
        }
        
        if (chartData.users_by_role) {
            this.createUsersByRoleChart(chartData.users_by_role);
        }
        
        // إضافة المزيد من الرسوم البيانية حسب الحاجة
    }
    
    createDailySalesChart(dailySales) {
        const canvas = document.getElementById('dailySalesChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        const labels = dailySales.map(item => item.date);
        const data = dailySales.map(item => item.total_sales);
        
        this.charts.dailySales = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'المبيعات اليومية',
                    data: data,
                    borderColor: '#2E7D32',
                    backgroundColor: 'rgba(46, 125, 50, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            font: {
                                family: 'Tajawal',
                                size: 14
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return utils.formatCurrency(value);
                            }
                        }
                    }
                }
            }
        });
    }
    
    createUsersByRoleChart(usersByRole) {
        const canvas = document.getElementById('usersByRoleChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        const labels = Object.keys(usersByRole).map(role => this.getRoleText(role));
        const data = Object.values(usersByRole);
        const colors = Object.keys(usersByRole).map(role => this.getRoleColor(role));
        
        this.charts.usersByRole = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'right',
                        labels: {
                            font: {
                                family: 'Tajawal',
                                size: 14
                            }
                        }
                    }
                }
            }
        });
    }
    
    getRoleColor(role) {
        const colors = {
            'buyer': '#4CAF50',
            'seller': '#FF9800',
            'driver': '#2196F3',
            'admin': '#F44336'
        };
        return colors[role] || '#9E9E9E';
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
    
    showLoading(message = 'جاري التحميل...') {
        const reportContainer = document.getElementById('reportResults');
        if (reportContainer) {
            reportContainer.innerHTML = `
                <div class="loading-state">
                    <div class="loading-spinner"></div>
                    <p>${message}</p>
                </div>
            `;
        }
    }
    
    hideLoading() {
        // سيكون المحتوى قد تم تحميله بواسطة displayReport
    }
    
    showError(message) {
        const reportContainer = document.getElementById('reportResults');
        if (reportContainer) {
            reportContainer.innerHTML = `
                <div class="error-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>${message}</h3>
                    <button class="btn btn-primary" onclick="reports.refreshReport()">
                        <i class="fas fa-sync-alt"></i>
                        إعادة المحاولة
                    </button>
                </div>
            `;
        }
    }
}

// تصدير مدير التقارير للاستخدام العام
if (typeof window !== 'undefined') {
    window.ReportsManager = ReportsManager;
    
    // إنشاء كائن تقارير عالمي
    window.reports = new ReportsManager(window.app || {});
}
