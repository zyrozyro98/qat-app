/**
 * تطبيق قات PRO - إدارة الطلبات
 * معالجة الطلبات، التتبع، التحديث والإدارة
 */

// حالة إدارة الطلبات
const OrdersManager = {
    currentOrders: [],
    filteredOrders: [],
    currentPage: 1,
    itemsPerPage: 10,
    totalPages: 1,
    filters: {
        status: '',
        dateFrom: '',
        dateTo: '',
        search: ''
    },
    sortBy: 'created_at',
    sortOrder: 'DESC',
    selectedOrder: null
};

// تهيئة إدارة الطلبات
function initOrdersManager() {
    console.log('🛍️ تهيئة مدير الطلبات...');
    
    // إعداد مستمعي الأحداث
    setupOrdersEventListeners();
    
    // تحميل الطلبات
    loadOrders();
}

// إعداد مستمعي الأحداث للطلبات
function setupOrdersEventListeners() {
    // فلترة الطلبات
    document.getElementById('orderStatusFilter')?.addEventListener('change', updateOrdersFilters);
    document.getElementById('orderDateFrom')?.addEventListener('change', updateOrdersFilters);
    document.getElementById('orderDateTo')?.addEventListener('change', updateOrdersFilters);
    document.getElementById('orderSearch')?.addEventListener('input', debounce(updateOrdersFilters, 300));
    
    // أزرار العمل
    document.addEventListener('click', handleOrdersActions);
    
    // تحديث الطلبات تلقائياً
    startOrdersAutoRefresh();
}

// تحميل الطلبات
async function loadOrders() {
    try {
        showOrdersLoading();
        
        // بناء معاملات البحث
        const params = new URLSearchParams();
        
        // إضافة الفلاتر
        if (OrdersManager.filters.status) {
            params.append('status', OrdersManager.filters.status);
        }
        if (OrdersManager.filters.dateFrom) {
            params.append('date_from', OrdersManager.filters.dateFrom);
        }
        if (OrdersManager.filters.dateTo) {
            params.append('date_to', OrdersManager.filters.dateTo);
        }
        if (OrdersManager.filters.search) {
            params.append('search', OrdersManager.filters.search);
        }
        
        // إضافة الترتيب
        params.append('sort_by', OrdersManager.sortBy);
        params.append('sort_order', OrdersManager.sortOrder);
        
        // إضافة الترقيم
        params.append('page', OrdersManager.currentPage);
        params.append('limit', OrdersManager.itemsPerPage);
        
        // جلب الطلبات من الخادم
        const response = await fetch(`/api/orders?${params.toString()}`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            
            OrdersManager.currentOrders = data.data || [];
            OrdersManager.filteredOrders = data.data || [];
            OrdersManager.totalPages = data.meta?.pages || 1;
            
            renderOrdersList();
            renderOrdersPagination();
            updateOrdersStats();
            
            // تحديث الرسم البياني إذا كان موجوداً
            updateOrdersChart();
            
        } else {
            throw new Error('فشل في جلب الطلبات');
        }
        
        hideOrdersLoading();
        
    } catch (error) {
        console.error('❌ خطأ في تحميل الطلبات:', error);
        showMessage('error', 'حدث خطأ في تحميل الطلبات');
        hideOrdersLoading();
    }
}

// عرض قائمة الطلبات
function renderOrdersList() {
    const ordersList = document.getElementById('ordersList');
    const ordersTableBody = document.getElementById('ordersTableBody');
    
    // العرض كبطاقات (للشاشات الصغيرة)
    if (ordersList) {
        if (OrdersManager.filteredOrders.length === 0) {
            ordersList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-shopping-cart"></i>
                    <h4>لا توجد طلبات</h4>
                    <p>لم يتم العثور على طلبات مطابقة للبحث</p>
                </div>
            `;
            return;
        }
        
        ordersList.innerHTML = OrdersManager.filteredOrders.map(order => `
            <div class="order-card ${order.status}" data-order-id="${order.id}">
                <div class="order-header">
                    <div>
                        <div class="order-code">#${order.order_code}</div>
                        <div class="order-date">
                            <i class="fas fa-calendar"></i>
                            ${formatDate(order.created_at)}
                        </div>
                    </div>
                    <span class="order-status ${order.status}">
                        ${getOrderStatusText(order.status)}
                    </span>
                </div>
                
                <div class="order-body">
                    <div class="order-customer">
                        <i class="fas fa-user"></i> 
                        <strong>العميل:</strong> ${order.buyer_name || 'مشتري'}
                    </div>
                    
                    <div class="order-items-preview">
                        <i class="fas fa-box"></i>
                        <strong>العناصر:</strong> ${order.item_count || 0} عنصر
                    </div>
                    
                    <div class="order-total-amount">
                        <i class="fas fa-money-bill-wave"></i>
                        <strong>المبلغ الإجمالي:</strong> ${formatCurrency(order.total || 0)}
                    </div>
                    
                    ${order.driver_name ? `
                        <div class="order-driver">
                            <i class="fas fa-shipping-fast"></i>
                            <strong>مندوب التوصيل:</strong> ${order.driver_name}
                        </div>
                    ` : ''}
                </div>
                
                <div class="order-footer">
                    <div class="order-actions">
                        <button class="btn btn-sm btn-outline-primary" onclick="viewOrder(${order.id})">
                            <i class="fas fa-eye"></i> تفاصيل
                        </button>
                        
                        ${getOrderActions(order)}
                    </div>
                    <div class="order-total">
                        ${formatCurrency(order.total || 0)}
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    // العرض كجدول (للشاشات الكبيرة)
    if (ordersTableBody) {
        if (OrdersManager.filteredOrders.length === 0) {
            ordersTableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-5">
                        <div class="empty-state-sm">
                            <i class="fas fa-shopping-cart"></i>
                            <p>لا توجد طلبات</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }
        
        ordersTableBody.innerHTML = OrdersManager.filteredOrders.map(order => `
            <tr data-order-id="${order.id}">
                <td>
                    <div class="order-code-cell">#${order.order_code}</div>
                </td>
                <td>
                    <div class="order-customer-cell">
                        <div class="customer-name">${order.buyer_name || 'مشتري'}</div>
                        <div class="customer-phone text-muted">${order.buyer_phone || ''}</div>
                    </div>
                </td>
                <td>
                    <span class="badge ${getOrderStatusClass(order.status)}">
                        ${getOrderStatusText(order.status)}
                    </span>
                </td>
                <td>
                    <div class="order-date-cell">
                        ${formatDateShort(order.created_at)}
                    </div>
                </td>
                <td>
                    <div class="order-items-cell">
                        <span class="badge badge-light">${order.item_count || 0} عنصر</span>
                    </div>
                </td>
                <td>
                    <div class="order-total-cell">
                        ${formatCurrency(order.total || 0)}
                    </div>
                </td>
                <td>
                    <div class="order-payment-cell">
                        <span class="badge ${order.payment_method === 'wallet' ? 'badge-success' : 'badge-info'}">
                            ${order.payment_method === 'wallet' ? 'محفظة' : 'نقدي'}
                        </span>
                    </div>
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="viewOrder(${order.id})" title="تفاصيل">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-outline-warning" onclick="updateOrderStatus(${order.id})" title="تغيير الحالة">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-outline-info" onclick="printOrder(${order.id})" title="طباعة">
                            <i class="fas fa-print"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }
}

// الحصول على أزرار الإجراءات حسب حالة الطلب
function getOrderActions(order) {
    let actions = '';
    
    switch (order.status) {
        case 'pending':
            actions = `
                <button class="btn btn-sm btn-success" onclick="processOrder(${order.id})">
                    <i class="fas fa-check"></i> معالجة
                </button>
                <button class="btn btn-sm btn-danger" onclick="cancelOrder(${order.id})">
                    <i class="fas fa-times"></i> إلغاء
                </button>
            `;
            break;
            
        case 'processing':
            actions = `
                <button class="btn btn-sm btn-primary" onclick="shipOrder(${order.id})">
                    <i class="fas fa-shipping-fast"></i> شحن
                </button>
                <button class="btn btn-sm btn-warning" onclick="assignDriver(${order.id})">
                    <i class="fas fa-user"></i> تعيين مندوب
                </button>
            `;
            break;
            
        case 'shipped':
            actions = `
                <button class="btn btn-sm btn-success" onclick="deliverOrder(${order.id})">
                    <i class="fas fa-check-circle"></i> تسليم
                </button>
                <button class="btn btn-sm btn-info" onclick="trackOrder(${order.id})">
                    <i class="fas fa-map-marker-alt"></i> تتبع
                </button>
            `;
            break;
            
        case 'delivered':
            actions = `
                <button class="btn btn-sm btn-info" onclick="rateOrder(${order.id})">
                    <i class="fas fa-star"></i> تقييم
                </button>
            `;
            break;
    }
    
    return actions;
}

// الحصول على كلاس حالة الطلب
function getOrderStatusClass(status) {
    const classes = {
        'pending': 'badge-warning',
        'processing': 'badge-info',
        'shipped': 'badge-primary',
        'delivered': 'badge-success',
        'cancelled': 'badge-danger'
    };
    return classes[status] || 'badge-secondary';
}

// تنسيق التاريخ المختصر
function formatDateShort(dateString) {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ar-YE', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

// تحديث فلتر الطلبات
function updateOrdersFilters() {
    OrdersManager.filters = {
        status: document.getElementById('orderStatusFilter')?.value || '',
        dateFrom: document.getElementById('orderDateFrom')?.value || '',
        dateTo: document.getElementById('orderDateTo')?.value || '',
        search: document.getElementById('orderSearch')?.value || ''
    };
    
    OrdersManager.currentPage = 1;
    loadOrders();
}

// عرض الطلب
async function viewOrder(orderId) {
    try {
        showLoading();
        
        const response = await fetch(`/api/orders/${orderId}`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            OrdersManager.selectedOrder = data.data;
            showOrderModal(data.data);
        } else {
            throw new Error('فشل في جلب بيانات الطلب');
        }
        
        hideLoading();
        
    } catch (error) {
        console.error('❌ خطأ في عرض الطلب:', error);
        showMessage('error', 'حدث خطأ في عرض بيانات الطلب');
        hideLoading();
    }
}

// عرض نافذة الطلب
function showOrderModal(orderData) {
    const modalHTML = `
        <div class="modal fade" id="orderModal" tabindex="-1" role="dialog" aria-labelledby="orderModalLabel">
            <div class="modal-dialog modal-xl" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="orderModalLabel">
                            <i class="fas fa-shopping-cart"></i>
                            طلب #${orderData.order_code}
                        </h5>
                        <div class="order-header-actions">
                            <span class="badge ${getOrderStatusClass(orderData.status)}">
                                ${getOrderStatusText(orderData.status)}
                            </span>
                            <button type="button" class="btn btn-sm btn-outline-primary" onclick="printOrder(${orderData.id})">
                                <i class="fas fa-print"></i> طباعة
                            </button>
                            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                                <span aria-hidden="true">&times;</span>
                            </button>
                        </div>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-8">
                                <!-- معلومات الطلب -->
                                <div class="card mb-4">
                                    <div class="card-header">
                                        <h6 class="mb-0"><i class="fas fa-info-circle"></i> معلومات الطلب</h6>
                                    </div>
                                    <div class="card-body">
                                        <div class="row">
                                            <div class="col-md-6">
                                                <div class="info-item">
                                                    <strong><i class="fas fa-hashtag"></i> رقم الطلب:</strong>
                                                    <span>${orderData.order_code}</span>
                                                </div>
                                                <div class="info-item">
                                                    <strong><i class="fas fa-calendar"></i> تاريخ الطلب:</strong>
                                                    <span>${formatDate(orderData.created_at)}</span>
                                                </div>
                                                <div class="info-item">
                                                    <strong><i class="fas fa-money-bill-wave"></i> طريقة الدفع:</strong>
                                                    <span>${orderData.payment_method === 'wallet' ? 'محفظة إلكترونية' : 'نقدي عند الاستلام'}</span>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="info-item">
                                                    <strong><i class="fas fa-user"></i> العميل:</strong>
                                                    <span>${orderData.buyer_name || 'مشتري'}</span>
                                                </div>
                                                <div class="info-item">
                                                    <strong><i class="fas fa-phone"></i> الهاتف:</strong>
                                                    <span>${orderData.buyer_phone || ''}</span>
                                                </div>
                                                <div class="info-item">
                                                    <strong><i class="fas fa-map-marker-alt"></i> عنوان التوصيل:</strong>
                                                    <span>${orderData.shipping_address}</span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        ${orderData.notes ? `
                                            <div class="info-item mt-3">
                                                <strong><i class="fas fa-sticky-note"></i> ملاحظات:</strong>
                                                <p class="mb-0">${orderData.notes}</p>
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                                
                                <!-- عناصر الطلب -->
                                <div class="card">
                                    <div class="card-header">
                                        <h6 class="mb-0"><i class="fas fa-boxes"></i> عناصر الطلب</h6>
                                    </div>
                                    <div class="card-body">
                                        <div class="table-responsive">
                                            <table class="table table-hover">
                                                <thead>
                                                    <tr>
                                                        <th>المنتج</th>
                                                        <th>الكمية</th>
                                                        <th>سعر الوحدة</th>
                                                        <th>المجموع</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${orderData.items ? orderData.items.map(item => `
                                                        <tr>
                                                            <td>
                                                                <div class="product-item">
                                                                    ${item.product_image ? 
                                                                        `<img src="${item.product_image}" alt="${item.product_name}" class="product-thumb">` : 
                                                                        `<div class="product-thumb-placeholder">
                                                                            <i class="fas fa-leaf"></i>
                                                                        </div>`
                                                                    }
                                                                    <div class="product-info">
                                                                        <div class="product-name">${item.product_name}</div>
                                                                        ${item.seller_name ? `
                                                                            <div class="seller-name text-muted">
                                                                                <small><i class="fas fa-store"></i> ${item.seller_name}</small>
                                                                            </div>
                                                                        ` : ''}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td>${item.quantity}</td>
                                                            <td>${formatCurrency(item.unit_price)}</td>
                                                            <td>${formatCurrency(item.total_price)}</td>
                                                        </tr>
                                                    `).join('') : `
                                                        <tr>
                                                            <td colspan="4" class="text-center text-muted">
                                                                لا توجد عناصر
                                                            </td>
                                                        </tr>
                                                    `}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="col-md-4">
                                <!-- ملخص الطلب -->
                                <div class="card mb-4">
                                    <div class="card-header">
                                        <h6 class="mb-0"><i class="fas fa-receipt"></i> ملخص الطلب</h6>
                                    </div>
                                    <div class="card-body">
                                        <div class="order-summary">
                                            <div class="summary-item">
                                                <span>المجموع الفرعي</span>
                                                <span>${formatCurrency(orderData.subtotal || orderData.total)}</span>
                                            </div>
                                            ${orderData.shipping_cost > 0 ? `
                                                <div class="summary-item">
                                                    <span>رسوم التوصيل</span>
                                                    <span>${formatCurrency(orderData.shipping_cost)}</span>
                                                </div>
                                            ` : ''}
                                            ${orderData.wash_qat ? `
                                                <div class="summary-item">
                                                    <span>غسيل القات</span>
                                                    <span>${formatCurrency(orderData.wash_cost || 100)}</span>
                                                </div>
                                            ` : ''}
                                            ${orderData.tax > 0 ? `
                                                <div class="summary-item">
                                                    <span>الضريبة</span>
                                                    <span>${formatCurrency(orderData.tax)}</span>
                                                </div>
                                            ` : ''}
                                            ${orderData.discount > 0 ? `
                                                <div class="summary-item text-success">
                                                    <span>الخصم</span>
                                                    <span>-${formatCurrency(orderData.discount)}</span>
                                                </div>
                                            ` : ''}
                                            <div class="summary-item total">
                                                <strong>المبلغ الإجمالي</strong>
                                                <strong>${formatCurrency(orderData.final_total || orderData.total)}</strong>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- تتبع الطلب -->
                                <div class="card mb-4">
                                    <div class="card-header">
                                        <h6 class="mb-0"><i class="fas fa-shipping-fast"></i> تتبع الطلب</h6>
                                    </div>
                                    <div class="card-body">
                                        <div class="tracking-steps">
                                            ${renderTrackingSteps(orderData.status, orderData)}
                                        </div>
                                        
                                        ${orderData.driver_name ? `
                                            <div class="driver-info mt-3">
                                                <h6><i class="fas fa-user"></i> مندوب التوصيل</h6>
                                                <div class="driver-details">
                                                    <div class="driver-name">${orderData.driver_name}</div>
                                                    ${orderData.driver_phone ? `
                                                        <div class="driver-phone">
                                                            <i class="fas fa-phone"></i>
                                                            <a href="tel:${orderData.driver_phone}">${orderData.driver_phone}</a>
                                                        </div>
                                                    ` : ''}
                                                </div>
                                            </div>
                                        ` : ''}
                                        
                                        ${orderData.tracking_code ? `
                                            <div class="tracking-code mt-3">
                                                <h6><i class="fas fa-barcode"></i> رمز التتبع</h6>
                                                <code class="tracking-number">${orderData.tracking_code}</code>
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                                
                                <!-- إجراءات الطلب -->
                                <div class="card">
                                    <div class="card-header">
                                        <h6 class="mb-0"><i class="fas fa-cogs"></i> الإجراءات</h6>
                                    </div>
                                    <div class="card-body">
                                        <div class="order-actions-list">
                                            ${getOrderActionsModal(orderData)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">
                            <i class="fas fa-times"></i> إغلاق
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // إضافة النافذة إلى DOM إذا لم تكن موجودة
    if (!document.getElementById('orderModal')) {
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    } else {
        // تحديث النافذة الموجودة
        const modal = document.getElementById('orderModal');
        const modalContent = modal.querySelector('.modal-content');
        modalContent.outerHTML = modalHTML.split('id="orderModal"')[1].split('</div>')[0] + '</div>';
    }
    
    // إظهار النافذة
    showModal('orderModal');
}

// عرض خطوات التتبع
function renderTrackingSteps(status, orderData) {
    const steps = [
        { id: 'pending', icon: 'fas fa-clock', label: 'معلق', description: 'تم استلام الطلب' },
        { id: 'processing', icon: 'fas fa-cog', label: 'قيد المعالجة', description: 'جاري تحضير الطلب' },
        { id: 'shipped', icon: 'fas fa-shipping-fast', label: 'تم الشحن', description: 'تم تسليم الطلب لمندوب التوصيل' },
        { id: 'delivered', icon: 'fas fa-check-circle', label: 'تم التسليم', description: 'تم تسليم الطلب للعميل' }
    ];
    
    const currentStepIndex = steps.findIndex(step => step.id === status);
    
    return steps.map((step, index) => `
        <div class="tracking-step ${index <= currentStepIndex ? 'active' : ''} 
                                   ${index === currentStepIndex ? 'current' : ''}">
            <div class="step-icon">
                <i class="${step.icon}"></i>
            </div>
            <div class="step-content">
                <div class="step-label">${step.label}</div>
                <div class="step-description">${step.description}</div>
                ${index === currentStepIndex && orderData.status_updated_at ? `
                    <div class="step-time">
                        <small>${formatDateShort(orderData.status_updated_at)}</small>
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// الحصول على إجراءات الطلب للنافذة
function getOrderActionsModal(order) {
    let actions = '';
    
    switch (order.status) {
        case 'pending':
            actions = `
                <button class="btn btn-block btn-success mb-2" onclick="processOrder(${order.id})">
                    <i class="fas fa-check"></i> بدء المعالجة
                </button>
                <button class="btn btn-block btn-danger" onclick="cancelOrder(${order.id})">
                    <i class="fas fa-times"></i> إلغاء الطلب
                </button>
            `;
            break;
            
        case 'processing':
            actions = `
                <button class="btn btn-block btn-primary mb-2" onclick="shipOrder(${order.id})">
                    <i class="fas fa-shipping-fast"></i> تمهيد للشحن
                </button>
                <button class="btn btn-block btn-warning mb-2" onclick="assignDriver(${order.id})">
                    <i class="fas fa-user"></i> تعيين مندوب توصيل
                </button>
                <button class="btn btn-block btn-outline-danger" onclick="cancelOrder(${order.id})">
                    <i class="fas fa-times"></i> إلغاء الطلب
                </button>
            `;
            break;
            
        case 'shipped':
            actions = `
                <button class="btn btn-block btn-success mb-2" onclick="deliverOrder(${order.id})">
                    <i class="fas fa-check-circle"></i> تأكيد التسليم
                </button>
                <button class="btn btn-block btn-info" onclick="trackOrder(${order.id})">
                    <i class="fas fa-map-marker-alt"></i> تتبع الموقع
                </button>
            `;
            break;
            
        case 'delivered':
            actions = `
                <button class="btn btn-block btn-info mb-2" onclick="rateOrder(${order.id})">
                    <i class="fas fa-star"></i> تقييم الخدمة
                </button>
                <button class="btn btn-block btn-outline-primary" onclick="createInvoice(${order.id})">
                    <i class="fas fa-file-invoice"></i> إنشاء فاتورة
                </button>
            `;
            break;
            
        case 'cancelled':
            actions = `
                <button class="btn btn-block btn-outline-warning" onclick="reorder(${order.id})">
                    <i class="fas fa-redo"></i> إعادة الطلب
                </button>
            `;
            break;
    }
    
    return actions || '<p class="text-muted text-center">لا توجد إجراءات متاحة</p>';
}

// معالجة الطلب
async function processOrder(orderId) {
    try {
        if (!confirm('هل تريد بدء معالجة هذا الطلب؟')) {
            return;
        }
        
        showLoading();
        
        const response = await fetch(`/api/orders/${orderId}/process`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showMessage('success', data.message || 'تم بدء معالجة الطلب بنجاح');
            closeModal('orderModal');
            loadOrders();
            
        } else {
            throw new Error(data.error || 'فشل في معالجة الطلب');
        }
        
        hideLoading();
        
    } catch (error) {
        console.error('❌ خطأ في معالجة الطلب:', error);
        showMessage('error', 'حدث خطأ في معالجة الطلب');
        hideLoading();
    }
}

// شحن الطلب
async function shipOrder(orderId) {
    try {
        showLoading();
        
        const response = await fetch(`/api/orders/${orderId}/ship`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showMessage('success', data.message || 'تم شحن الطلب بنجاح');
            closeModal('orderModal');
            loadOrders();
            
        } else {
            throw new Error(data.error || 'فشل في شحن الطلب');
        }
        
        hideLoading();
        
    } catch (error) {
        console.error('❌ خطأ في شحن الطلب:', error);
        showMessage('error', 'حدث خطأ في شحن الطلب');
        hideLoading();
    }
}

// تعيين مندوب توصيل
async function assignDriver(orderId) {
    try {
        // جلب قائمة مندوبي التوصيل المتاحين
        const driversResponse = await fetch('/api/drivers/available', {
            headers: getAuthHeaders()
        });
        
        if (!driversResponse.ok) {
            throw new Error('فشل في جلب مندوبي التوصيل');
        }
        
        const driversData = await driversResponse.json();
        const drivers = driversData.data || [];
        
        if (drivers.length === 0) {
            showMessage('warning', 'لا توجد مندوبي توصيل متاحين حالياً');
            return;
        }
        
        // عرض نافذة اختيار المندوب
        showDriverSelectionModal(orderId, drivers);
        
    } catch (error) {
        console.error('❌ خطأ في جلب مندوبي التوصيل:', error);
        showMessage('error', 'حدث خطأ في جلب مندوبي التوصيل');
    }
}

// عرض نافذة اختيار المندوب
function showDriverSelectionModal(orderId, drivers) {
    const modalHTML = `
        <div class="modal fade" id="driverModal" tabindex="-1" role="dialog">
            <div class="modal-dialog" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-user"></i> تعيين مندوب توصيل
                        </h5>
                        <button type="button" class="close" data-dismiss="modal">
                            <span>&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="drivers-list">
                            ${drivers.map(driver => `
                                <div class="driver-card" onclick="selectDriver(${orderId}, ${driver.id})">
                                    <div class="driver-avatar">
                                        ${driver.avatar ? 
                                            `<img src="${driver.avatar}" alt="${driver.name}">` : 
                                            `<i class="fas fa-user"></i>`
                                        }
                                    </div>
                                    <div class="driver-info">
                                        <div class="driver-name">${driver.name}</div>
                                        <div class="driver-rating">
                                            <i class="fas fa-star"></i> ${driver.rating || '0.0'}
                                        </div>
                                        <div class="driver-vehicle">
                                            <i class="fas fa-car"></i> ${driver.vehicle_type}
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // إضافة النافذة إلى DOM
    if (!document.getElementById('driverModal')) {
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
    
    // إظهار النافذة
    showModal('driverModal');
}

// اختيار مندوب التوصيل
async function selectDriver(orderId, driverId) {
    try {
        showLoading();
        
        const response = await fetch(`/api/orders/${orderId}/assign-driver`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ driver_id: driverId })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showMessage('success', data.message || 'تم تعيين مندوب التوصيل بنجاح');
            closeModal('driverModal');
            closeModal('orderModal');
            loadOrders();
            
        } else {
            throw new Error(data.error || 'فشل في تعيين مندوب التوصيل');
        }
        
        hideLoading();
        
    } catch (error) {
        console.error('❌ خطأ في تعيين مندوب التوصيل:', error);
        showMessage('error', 'حدث خطأ في تعيين مندوب التوصيل');
        hideLoading();
    }
}

// تسليم الطلب
async function deliverOrder(orderId) {
    try {
        if (!confirm('هل تريد تأكيد تسليم هذا الطلب؟')) {
            return;
        }
        
        showLoading();
        
        const response = await fetch(`/api/orders/${orderId}/deliver`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showMessage('success', data.message || 'تم تأكيد تسليم الطلب بنجاح');
            closeModal('orderModal');
            loadOrders();
            
        } else {
            throw new Error(data.error || 'فشل في تأكيد التسليم');
        }
        
        hideLoading();
        
    } catch (error) {
        console.error('❌ خطأ في تأكيد التسليم:', error);
        showMessage('error', 'حدث خطأ في تأكيد التسليم');
        hideLoading();
    }
}

// إلغاء الطلب
async function cancelOrder(orderId) {
    try {
        if (!confirm('هل أنت متأكد من إلغاء هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.')) {
            return;
        }
        
        const reason = prompt('يرجى إدخال سبب الإلغاء:');
        if (!reason) {
            showMessage('warning', 'يرجى إدخال سبب الإلغاء');
            return;
        }
        
        showLoading();
        
        const response = await fetch(`/api/orders/${orderId}/cancel`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason: reason })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showMessage('success', data.message || 'تم إلغاء الطلب بنجاح');
            closeModal('orderModal');
            loadOrders();
            
        } else {
            throw new Error(data.error || 'فشل في إلغاء الطلب');
        }
        
        hideLoading();
        
    } catch (error) {
        console.error('❌ خطأ في إلغاء الطلب:', error);
        showMessage('error', 'حدث خطأ في إلغاء الطلب');
        hideLoading();
    }
}

// طباعة الطلب
function printOrder(orderId) {
    const order = OrdersManager.currentOrders.find(o => o.id === orderId);
    if (!order) {
        showMessage('error', 'الطلب غير موجود');
        return;
    }
    
    // إنشاء نافذة طباعة
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
            <title>فاتورة طلب #${order.order_code}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .invoice-header { text-align: center; margin-bottom: 30px; }
                .invoice-header h1 { color: #2E7D32; }
                .invoice-details { margin-bottom: 20px; }
                .invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                .invoice-table th, .invoice-table td { border: 1px solid #ddd; padding: 8px; text-align: right; }
                .invoice-table th { background-color: #f2f2f2; }
                .invoice-total { text-align: left; margin-top: 20px; }
                .invoice-footer { margin-top: 40px; text-align: center; color: #666; }
                @media print {
                    .no-print { display: none; }
                    body { margin: 0; }
                }
            </style>
        </head>
        <body>
            <div class="invoice-header">
                <h1>تطبيق قات PRO</h1>
                <h2>فاتورة الطلب #${order.order_code}</h2>
                <p>${formatDate(order.created_at)}</p>
            </div>
            
            <div class="invoice-details">
                <p><strong>العميل:</strong> ${order.buyer_name}</p>
                <p><strong>الهاتف:</strong> ${order.buyer_phone}</p>
                <p><strong>العنوان:</strong> ${order.shipping_address}</p>
                <p><strong>حالة الطلب:</strong> ${getOrderStatusText(order.status)}</p>
            </div>
            
            <table class="invoice-table">
                <thead>
                    <tr>
                        <th>المنتج</th>
                        <th>الكمية</th>
                        <th>سعر الوحدة</th>
                        <th>المجموع</th>
                    </tr>
                </thead>
                <tbody>
                    ${order.items ? order.items.map(item => `
                        <tr>
                            <td>${item.product_name}</td>
                            <td>${item.quantity}</td>
                            <td>${formatCurrency(item.unit_price)}</td>
                            <td>${formatCurrency(item.total_price)}</td>
                        </tr>
                    `).join('') : ''}
                </tbody>
            </table>
            
            <div class="invoice-total">
                <h3>المبلغ الإجمالي: ${formatCurrency(order.total)} ريال</h3>
                <p>طريقة الدفع: ${order.payment_method === 'wallet' ? 'محفظة إلكترونية' : 'نقدي عند الاستلام'}</p>
            </div>
            
            <div class="invoice-footer">
                <p>شكراً لثقتكم بنا ❤️</p>
                <p>للشكاوى والاستفسارات: 771831482</p>
                <p>تطبيق قات PRO - ${new Date().getFullYear()}</p>
            </div>
            
            <div class="no-print" style="margin-top: 20px;">
                <button onclick="window.print()" style="padding: 10px 20px; background: #2E7D32; color: white; border: none; cursor: pointer;">
                    طباعة الفاتورة
                </button>
                <button onclick="window.close()" style="padding: 10px 20px; background: #666; color: white; border: none; cursor: pointer; margin-right: 10px;">
                    إغلاق
                </button>
            </div>
            
            <script>
                window.onload = function() {
                    window.print();
                };
            </script>
        </body>
        </html>
    `);
    
    printWindow.document.close();
}

// تحديث مخطط الطلبات
function updateOrdersChart() {
    const ctx = document.getElementById('ordersChart');
    if (!ctx) return;
    
    // تجميع الطلبات حسب الحالة
    const statusCounts = {
        'pending': 0,
        'processing': 0,
        'shipped': 0,
        'delivered': 0,
        'cancelled': 0
    };
    
    OrdersManager.currentOrders.forEach(order => {
        if (statusCounts[order.status] !== undefined) {
            statusCounts[order.status]++;
        }
    });
    
    // إعداد البيانات
    const data = {
        labels: ['معلق', 'قيد المعالجة', 'تم الشحن', 'تم التسليم', 'ملغي'],
        datasets: [{
            data: [
                statusCounts.pending,
                statusCounts.processing,
                statusCounts.shipped,
                statusCounts.delivered,
                statusCounts.cancelled
            ],
            backgroundColor: [
                '#FF9800', // برتقالي للمعلق
                '#2196F3', // أزرق للقيد المعالجة
                '#3F51B5', // نيلي للشحن
                '#4CAF50', // أخضر للتسليم
                '#F44336'  // أحمر للملغي
            ],
            borderWidth: 1
        }]
    };
    
    // إنشاء أو تحديث المخطط
    if (window.ordersChartInstance) {
        window.ordersChartInstance.data = data;
        window.ordersChartInstance.update();
    } else {
        window.ordersChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: data,
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        rtl: true
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.raw || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((value / total) * 100);
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
}

// تحديث إحصائيات الطلبات
function updateOrdersStats() {
    const statsElement = document.getElementById('ordersStats');
    if (!statsElement) return;
    
    const total = OrdersManager.filteredOrders.length;
    const pending = OrdersManager.filteredOrders.filter(o => o.status === 'pending').length;
    const processing = OrdersManager.filteredOrders.filter(o => o.status === 'processing').length;
    const delivered = OrdersManager.filteredOrders.filter(o => o.status === 'delivered').length;
    const totalRevenue = OrdersManager.filteredOrders.reduce((sum, order) => sum + (order.total || 0), 0);
    
    statsElement.innerHTML = `
        <div class="stats-summary">
            <span class="stat-item">
                <i class="fas fa-shopping-cart"></i>
                <strong>${total}</strong> طلب
            </span>
            <span class="stat-item">
                <i class="fas fa-clock"></i>
                <strong>${pending}</strong> معلق
            </span>
            <span class="stat-item">
                <i class="fas fa-cog"></i>
                <strong>${processing}</strong> قيد المعالجة
            </span>
            <span class="stat-item">
                <i class="fas fa-check-circle"></i>
                <strong>${delivered}</strong> تم التسليم
            </span>
            <span class="stat-item">
                <i class="fas fa-money-bill-wave"></i>
                <strong>${formatCurrency(totalRevenue)}</strong> إجمالي المبيعات
            </span>
        </div>
    `;
}

// بدء التحديث التلقائي للطلبات
function startOrdersAutoRefresh() {
    // تحديث الطلبات كل 30 ثانية
    setInterval(() => {
        if (document.getElementById('ordersSection')?.classList.contains('active')) {
            loadOrders();
        }
    }, 30000);
}

// إظهار تحميل الطلبات
function showOrdersLoading() {
    const ordersList = document.getElementById('ordersList');
    const ordersTableBody = document.getElementById('ordersTableBody');
    
    if (ordersList) {
        ordersList.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="sr-only">جاري التحميل...</span>
                </div>
                <p class="mt-2">جاري تحميل الطلبات...</p>
            </div>
        `;
    }
    
    if (ordersTableBody) {
        ordersTableBody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="sr-only">جاري التحميل...</span>
                    </div>
                    <p class="mt-2">جاري تحميل الطلبات...</p>
                </td>
            </tr>
        `;
    }
}

// إخفاء تحميل الطلبات
function hideOrdersLoading() {
    // يتم التعامل معه في renderOrdersList
}

// معالجة أحداث الطلبات
function handleOrdersActions(event) {
    const target = event.target;
    
    // التحقق إذا كان النقر على زر إجراء
    if (target.closest('.order-action-btn')) {
        event.preventDefault();
        const button = target.closest('.order-action-btn');
        const action = button.dataset.action;
        const orderId = button.dataset.orderId;
        
        if (orderId && action) {
            executeOrderAction(orderId, action);
        }
    }
}

// تنفيذ إجراء على الطلب
async function executeOrderAction(orderId, action) {
    try {
        let endpoint = '';
        let method = 'POST';
        let body = null;
        
        switch (action) {
            case 'process':
                endpoint = `/api/orders/${orderId}/process`;
                break;
            case 'ship':
                endpoint = `/api/orders/${orderId}/ship`;
                break;
            case 'deliver':
                endpoint = `/api/orders/${orderId}/deliver`;
                break;
            case 'cancel':
                endpoint = `/api/orders/${orderId}/cancel`;
                body = JSON.stringify({ reason: 'طلب من المستخدم' });
                break;
            default:
                console.warn(`⚠️ إجراء غير معروف: ${action}`);
                return;
        }
        
        showLoading();
        
        const response = await fetch(endpoint, {
            method: method,
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: body
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showMessage('success', data.message || 'تم تنفيذ الإجراء بنجاح');
            loadOrders();
            
        } else {
            throw new Error(data.error || `فشل في تنفيذ الإجراء: ${action}`);
        }
        
        hideLoading();
        
    } catch (error) {
        console.error(`❌ خطأ في تنفيذ الإجراء ${action}:`, error);
        showMessage('error', `حدث خطأ في تنفيذ الإجراء: ${action}`);
        hideLoading();
    }
}

// ============ تصدير الدوال الهامة ============
window.initOrdersManager = initOrdersManager;
window.viewOrder = viewOrder;
window.processOrder = processOrder;
window.shipOrder = shipOrder;
window.deliverOrder = deliverOrder;
window.cancelOrder = cancelOrder;
window.assignDriver = assignDriver;
window.selectDriver = selectDriver;
window.printOrder = printOrder;
window.updateOrdersFilters = updateOrdersFilters;

console.log('✅ مدير الطلبات جاهز للاستخدام');
