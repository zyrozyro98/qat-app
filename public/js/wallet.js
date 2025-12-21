/**
 * تطبيق قات PRO - إدارة المحفظة
 * معالجة الشحن، السحب، التحويل وسجل المعاملات
 */

// حالة إدارة المحفظة
const WalletManager = {
    walletData: null,
    transactions: [],
    currentPage: 1,
    itemsPerPage: 10,
    totalPages: 1,
    filters: {
        type: '',
        dateFrom: '',
        dateTo: '',
        minAmount: '',
        maxAmount: ''
    }
};

// تهيئة إدارة المحفظة
function initWalletManager() {
    console.log('💰 تهيئة مدير المحفظة...');
    
    // إعداد مستمعي الأحداث
    setupWalletEventListeners();
    
    // تحميل بيانات المحفظة
    loadWalletData();
}

// إعداد مستمعي الأحداث للمحفظة
function setupWalletEventListeners() {
    // أزرار الشحن والسحب
    document.getElementById('depositBtn')?.addEventListener('click', showDepositModal);
    document.getElementById('withdrawBtn')?.addEventListener('click', showWithdrawModal);
    document.getElementById('transferBtn')?.addEventListener('click', showTransferModal);
    
    // فلترة المعاملات
    document.getElementById('transactionTypeFilter')?.addEventListener('change', updateTransactionsFilters);
    document.getElementById('transactionDateFrom')?.addEventListener('change', updateTransactionsFilters);
    document.getElementById('transactionDateTo')?.addEventListener('change', updateTransactionsFilters);
    document.getElementById('transactionMinAmount')?.addEventListener('input', debounce(updateTransactionsFilters, 500));
    document.getElementById('transactionMaxAmount')?.addEventListener('input', debounce(updateTransactionsFilters, 500));
    
    // تصدير البيانات
    document.getElementById('exportTransactionsBtn')?.addEventListener('click', exportTransactions);
    
    // تحديث الرصيد
    document.getElementById('refreshWalletBtn')?.addEventListener('click', loadWalletData);
}

// تحميل بيانات المحفظة
async function loadWalletData() {
    try {
        showWalletLoading();
        
        // جلب بيانات المحفظة
        const walletResponse = await fetch('/api/wallet', {
            headers: getAuthHeaders()
        });
        
        if (!walletResponse.ok) {
            throw new Error('فشل في جلب بيانات المحفظة');
        }
        
        const walletData = await walletResponse.json();
        WalletManager.walletData = walletData.data || {};
        
        // جلب المعاملات
        await loadTransactions();
        
        // تحديث واجهة المستخدم
        updateWalletDisplay();
        updateWalletStats();
        
        hideWalletLoading();
        
    } catch (error) {
        console.error('❌ خطأ في تحميل بيانات المحفظة:', error);
        showMessage('error', 'حدث خطأ في تحميل بيانات المحفظة');
        hideWalletLoading();
    }
}

// تحميل المعاملات
async function loadTransactions() {
    try {
        // بناء معاملات البحث
        const params = new URLSearchParams();
        
        // إضافة الفلاتر
        if (WalletManager.filters.type) {
            params.append('type', WalletManager.filters.type);
        }
        if (WalletManager.filters.dateFrom) {
            params.append('date_from', WalletManager.filters.dateFrom);
        }
        if (WalletManager.filters.dateTo) {
            params.append('date_to', WalletManager.filters.dateTo);
        }
        if (WalletManager.filters.minAmount) {
            params.append('min_amount', WalletManager.filters.minAmount);
        }
        if (WalletManager.filters.maxAmount) {
            params.append('max_amount', WalletManager.filters.maxAmount);
        }
        
        // إضافة الترقيم
        params.append('page', WalletManager.currentPage);
        params.append('limit', WalletManager.itemsPerPage);
        
        // جلب المعاملات
        const response = await fetch(`/api/wallet/transactions?${params.toString()}`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            WalletManager.transactions = data.data || [];
            WalletManager.totalPages = data.meta?.pages || 1;
            
            renderTransactions();
            renderTransactionsPagination();
            
        } else {
            throw new Error('فشل في جلب المعاملات');
        }
        
    } catch (error) {
        console.error('❌ خطأ في تحميل المعاملات:', error);
        throw error;
    }
}

// تحديث عرض المحفظة
function updateWalletDisplay() {
    // تحديث الرصيد الرئيسي
    const balanceElement = document.getElementById('walletBalance');
    const currentBalanceElement = document.getElementById('currentBalance');
    
    if (balanceElement && WalletManager.walletData) {
        balanceElement.textContent = `${formatCurrency(WalletManager.walletData.balance || 0)} ريال`;
    }
    
    if (currentBalanceElement && WalletManager.walletData) {
        currentBalanceElement.innerHTML = `
            <div class="balance-amount">${formatCurrency(WalletManager.walletData.balance || 0)}</div>
            <div class="balance-label">ريال يمني</div>
        `;
    }
    
    // تحديث الإحصائيات
    const statsElements = {
        'totalDeposits': WalletManager.walletData.total_deposits || 0,
        'totalWithdrawals': WalletManager.walletData.total_withdrawals || 0,
        'totalPurchases': calculateTotalPurchases()
    };
    
    Object.entries(statsElements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = `${formatCurrency(value)} ريال`;
        }
    });
}

// حساب إجمالي المشتريات
function calculateTotalPurchases() {
    if (!WalletManager.walletData) return 0;
    
    const balance = WalletManager.walletData.balance || 0;
    const deposits = WalletManager.walletData.total_deposits || 0;
    const withdrawals = WalletManager.walletData.total_withdrawals || 0;
    
    // إجمالي المشتريات = (الإيداعات - السحوبات) - الرصيد الحالي
    return Math.max(0, deposits - withdrawals - balance);
}

// تحديث إحصائيات المحفظة
function updateWalletStats() {
    const statsElement = document.getElementById('walletStats');
    if (!statsElement || !WalletManager.walletData) return;
    
    const balance = WalletManager.walletData.balance || 0;
    const deposits = WalletManager.walletData.total_deposits || 0;
    const withdrawals = WalletManager.walletData.total_withdrawals || 0;
    const purchases = calculateTotalPurchases();
    
    statsElement.innerHTML = `
        <div class="stats-cards">
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-wallet"></i>
                </div>
                <div class="stat-content">
                    <div class="stat-number">${formatCurrency(balance)}</div>
                    <div class="stat-label">الرصيد الحالي</div>
                </div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon" style="background: #E8F5E9; color: #4CAF50;">
                    <i class="fas fa-arrow-down"></i>
                </div>
                <div class="stat-content">
                    <div class="stat-number">${formatCurrency(deposits)}</div>
                    <div class="stat-label">إجمالي الإيداعات</div>
                </div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon" style="background: #FFEBEE; color: #F44336;">
                    <i class="fas fa-arrow-up"></i>
                </div>
                <div class="stat-content">
                    <div class="stat-number">${formatCurrency(withdrawals)}</div>
                    <div class="stat-label">إجمالي السحوبات</div>
                </div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon" style="background: #E3F2FD; color: #2196F3;">
                    <i class="fas fa-shopping-cart"></i>
                </div>
                <div class="stat-content">
                    <div class="stat-number">${formatCurrency(purchases)}</div>
                    <div class="stat-label">إجمالي المشتريات</div>
                </div>
            </div>
        </div>
    `;
}

// عرض المعاملات
function renderTransactions() {
    const transactionsList = document.getElementById('transactionsList');
    const transactionsTableBody = document.getElementById('transactionsTableBody');
    
    // العرض كقائمة (للشاشات الصغيرة)
    if (transactionsList) {
        if (WalletManager.transactions.length === 0) {
            transactionsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-history"></i>
                    <h4>لا توجد معاملات</h4>
                    <p>لم يتم العثور على معاملات مطابقة للبحث</p>
                </div>
            `;
            return;
        }
        
        transactionsList.innerHTML = WalletManager.transactions.map(transaction => `
            <div class="transaction-item ${transaction.type}" data-transaction-id="${transaction.id}">
                <div class="transaction-icon ${transaction.type}">
                    <i class="fas fa-${getTransactionIcon(transaction.type)}"></i>
                </div>
                <div class="transaction-details">
                    <div class="transaction-title">${getTransactionTitle(transaction)}</div>
                    <div class="transaction-description">${transaction.description || ''}</div>
                    <div class="transaction-meta">
                        <span class="transaction-date">
                            <i class="fas fa-calendar"></i>
                            ${formatDateShort(transaction.created_at)}
                        </span>
                        <span class="transaction-id">
                            <i class="fas fa-hashtag"></i>
                            ${transaction.transaction_id || transaction.id}
                        </span>
                    </div>
                </div>
                <div class="transaction-amount ${transaction.amount >= 0 ? 'positive' : 'negative'}">
                    ${transaction.amount >= 0 ? '+' : ''}${formatCurrency(transaction.amount)}
                </div>
            </div>
        `).join('');
    }
    
    // العرض كجدول (للشاشات الكبيرة)
    if (transactionsTableBody) {
        if (WalletManager.transactions.length === 0) {
            transactionsTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-5">
                        <div class="empty-state-sm">
                            <i class="fas fa-history"></i>
                            <p>لا توجد معاملات</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }
        
        transactionsTableBody.innerHTML = WalletManager.transactions.map(transaction => `
            <tr data-transaction-id="${transaction.id}">
                <td>
                    <div class="transaction-type-cell">
                        <span class="badge ${getTransactionTypeClass(transaction.type)}">
                            <i class="fas fa-${getTransactionIcon(transaction.type)}"></i>
                            ${getTransactionTypeText(transaction.type)}
                        </span>
                    </div>
                </td>
                <td>
                    <div class="transaction-details-cell">
                        <div class="transaction-title">${getTransactionTitle(transaction)}</div>
                        <div class="transaction-description text-muted">${transaction.description || ''}</div>
                    </div>
                </td>
                <td>
                    <div class="transaction-id-cell">
                        <code>${transaction.transaction_id || transaction.id}</code>
                    </div>
                </td>
                <td>
                    <div class="transaction-date-cell">
                        ${formatDateShort(transaction.created_at)}
                    </div>
                </td>
                <td>
                    <div class="transaction-status-cell">
                        <span class="badge ${getTransactionStatusClass(transaction.status)}">
                            ${getTransactionStatusText(transaction.status)}
                        </span>
                    </div>
                </td>
                <td>
                    <div class="transaction-amount-cell ${transaction.amount >= 0 ? 'text-success' : 'text-danger'}">
                        <strong>${transaction.amount >= 0 ? '+' : ''}${formatCurrency(transaction.amount)}</strong>
                    </div>
                </td>
            </tr>
        `).join('');
    }
}

// الحصول على أيقونة المعاملة
function getTransactionIcon(type) {
    const icons = {
        'deposit': 'arrow-down',
        'withdrawal': 'arrow-up',
        'purchase': 'shopping-cart',
        'refund': 'undo',
        'commission': 'percentage',
        'transfer': 'exchange-alt',
        'bonus': 'gift'
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
        'commission': 'عمولة',
        'transfer': 'تحويل',
        'bonus': 'مكافأة'
    };
    
    let title = titles[transaction.type] || transaction.type;
    
    // إضافة معلومات إضافية
    if (transaction.wallet_type) {
        title += ` (${transaction.wallet_type})`;
    }
    
    return title;
}

// الحصول على نص نوع المعاملة
function getTransactionTypeText(type) {
    const types = {
        'deposit': 'إيداع',
        'withdrawal': 'سحب',
        'purchase': 'شراء',
        'refund': 'استرداد',
        'commission': 'عمولة',
        'transfer': 'تحويل',
        'bonus': 'مكافأة'
    };
    return types[type] || type;
}

// الحصول على كلاس نوع المعاملة
function getTransactionTypeClass(type) {
    const classes = {
        'deposit': 'badge-success',
        'withdrawal': 'badge-danger',
        'purchase': 'badge-info',
        'refund': 'badge-warning',
        'commission': 'badge-primary',
        'transfer': 'badge-secondary',
        'bonus': 'badge-success'
    };
    return classes[type] || 'badge-secondary';
}

// الحصول على نص حالة المعاملة
function getTransactionStatusText(status) {
    const statuses = {
        'pending': 'معلق',
        'completed': 'مكتمل',
        'failed': 'فشل',
        'cancelled': 'ملغي',
        'refunded': 'تم الاسترداد'
    };
    return statuses[status] || status;
}

// الحصول على كلاس حالة المعاملة
function getTransactionStatusClass(status) {
    const classes = {
        'pending': 'badge-warning',
        'completed': 'badge-success',
        'failed': 'badge-danger',
        'cancelled': 'badge-secondary',
        'refunded': 'badge-info'
    };
    return classes[status] || 'badge-secondary';
}

// عرض ترقيم المعاملات
function renderTransactionsPagination() {
    const pagination = document.getElementById('transactionsPagination');
    if (!pagination) return;
    
    if (WalletManager.totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let paginationHTML = '';
    
    // زر السابق
    paginationHTML += `
        <button class="pagination-btn ${WalletManager.currentPage === 1 ? 'disabled' : ''}" 
                onclick="changeTransactionsPage(${WalletManager.currentPage - 1})" 
                ${WalletManager.currentPage === 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-right"></i>
        </button>
    `;
    
    // أرقام الصفحات
    const maxPagesToShow = 5;
    let startPage = Math.max(1, WalletManager.currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(WalletManager.totalPages, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage + 1 < maxPagesToShow) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <button class="pagination-btn ${i === WalletManager.currentPage ? 'active' : ''}" 
                    onclick="changeTransactionsPage(${i})">
                ${i}
            </button>
        `;
    }
    
    // زر التالي
    paginationHTML += `
        <button class="pagination-btn ${WalletManager.currentPage === WalletManager.totalPages ? 'disabled' : ''}" 
                onclick="changeTransactionsPage(${WalletManager.currentPage + 1})" 
                ${WalletManager.currentPage === WalletManager.totalPages ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i>
        </button>
    `;
    
    pagination.innerHTML = paginationHTML;
}

// تغيير صفحة المعاملات
function changeTransactionsPage(page) {
    if (page < 1 || page > WalletManager.totalPages) return;
    
    WalletManager.currentPage = page;
    loadTransactions();
}

// تحديث فلتر المعاملات
function updateTransactionsFilters() {
    WalletManager.filters = {
        type: document.getElementById('transactionTypeFilter')?.value || '',
        dateFrom: document.getElementById('transactionDateFrom')?.value || '',
        dateTo: document.getElementById('transactionDateTo')?.value || '',
        minAmount: document.getElementById('transactionMinAmount')?.value || '',
        maxAmount: document.getElementById('transactionMaxAmount')?.value || ''
    };
    
    WalletManager.currentPage = 1;
    loadWalletData();
}

// عرض نافذة الشحن
function showDepositModal() {
    const modalHTML = `
        <div class="modal fade" id="depositModal" tabindex="-1" role="dialog">
            <div class="modal-dialog" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-money-bill-wave"></i> شحن الرصيد
                        </h5>
                        <button type="button" class="close" data-dismiss="modal">
                            <span>&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="depositForm">
                            <div class="form-group">
                                <label for="depositAmount">المبلغ (ريال) *</label>
                                <input type="number" class="form-control" id="depositAmount" 
                                       min="1000" value="5000" step="1000" required>
                                <small class="form-text text-muted">الحد الأدنى للشحن: 1,000 ريال</small>
                            </div>
                            
                            <div class="form-group">
                                <label for="depositMethod">طريقة الدفع *</label>
                                <select class="form-control" id="depositMethod" required>
                                    <option value="">اختر طريقة الدفع</option>
                                    <option value="jib">محفظة جيب</option>
                                    <option value="jawaly">محفظة جوالي</option>
                                    <option value="mobile">موبايل موني</option>
                                    <option value="shamel">الشامل موني</option>
                                    <option value="fulus">فلوسك</option>
                                    <option value="manual">تحويل بنكي يدوي</option>
                                </select>
                            </div>
                            
                            <div id="walletInstructions" style="display: none;">
                                <div class="alert alert-info">
                                    <h6><i class="fas fa-info-circle"></i> تعليمات الشحن:</h6>
                                    <ol class="mb-0">
                                        <li>أرسل المبلغ إلى الرقم: <strong>771831482</strong></li>
                                        <li>الاسم: <strong>يوسف محمد علي حمود زهير</strong></li>
                                        <li>أرسل إيصال التحويل عبر الواتساب لنفس الرقم</li>
                                        <li>سيتم إضافة الرصيد خلال 24 ساعة بعد التحقق</li>
                                    </ol>
                                </div>
                            </div>
                            
                            <div id="bankInstructions" style="display: none;">
                                <div class="alert alert-info">
                                    <h6><i class="fas fa-university"></i> معلومات الحساب البنكي:</h6>
                                    <ul class="mb-0">
                                        <li><strong>اسم البنك:</strong> البنك المركزي اليمني</li>
                                        <li><strong>اسم الحساب:</strong> يوسف محمد علي حمود زهير</li>
                                        <li><strong>رقم الحساب:</strong> 1234567890</li>
                                        <li><strong>IBAN:</strong> YE00 0000 0000 0000 0000 0000</li>
                                    </ul>
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label for="depositReference">رقم المرجع (اختياري)</label>
                                <input type="text" class="form-control" id="depositReference" 
                                       placeholder="رقم العملية أو المرجع">
                            </div>
                            
                            <div class="form-group">
                                <label for="depositNotes">ملاحظات (اختياري)</label>
                                <textarea class="form-control" id="depositNotes" rows="2" 
                                          placeholder="ملاحظات إضافية..."></textarea>
                            </div>
                            
                            <div id="depositFormErrors" class="alert alert-danger" style="display: none;"></div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">
                            <i class="fas fa-times"></i> إلغاء
                        </button>
                        <button type="button" class="btn btn-primary" onclick="processDeposit()">
                            <i class="fas fa-check"></i> تأكيد الشحن
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // إضافة النافذة إلى DOM إذا لم تكن موجودة
    if (!document.getElementById('depositModal')) {
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // إعداد أحداث النافذة
        const depositMethod = document.getElementById('depositMethod');
        if (depositMethod) {
            depositMethod.addEventListener('change', function() {
                const walletInstructions = document.getElementById('walletInstructions');
                const bankInstructions = document.getElementById('bankInstructions');
                
                if (this.value === 'manual') {
                    walletInstructions.style.display = 'none';
                    bankInstructions.style.display = 'block';
                } else if (this.value) {
                    walletInstructions.style.display = 'block';
                    bankInstructions.style.display = 'none';
                } else {
                    walletInstructions.style.display = 'none';
                    bankInstructions.style.display = 'none';
                }
            });
        }
    }
    
    // إظهار النافذة
    showModal('depositModal');
}

// معالجة الشحن
async function processDeposit() {
    try {
        const amount = document.getElementById('depositAmount')?.value;
        const method = document.getElementById('depositMethod')?.value;
        const reference = document.getElementById('depositReference')?.value;
        const notes = document.getElementById('depositNotes')?.value;
        
        // التحقق من البيانات
        if (!amount || !method) {
            showMessage('error', 'يرجى ملء جميع الحقول المطلوبة');
            return;
        }
        
        if (parseFloat(amount) < 1000) {
            showMessage('error', 'الحد الأدنى للشحن هو 1,000 ريال');
            return;
        }
        
        if (!confirm(`هل تريد شحن ${formatCurrency(amount)} ريال إلى محفظتك؟`)) {
            return;
        }
        
        showLoading();
        
        const response = await fetch('/api/wallet/topup', {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: parseFloat(amount),
                method: method,
                wallet_type: method === 'manual' ? 'bank' : method,
                reference: reference,
                notes: notes
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showMessage('success', data.message || 'تم تقديم طلب الشحن بنجاح');
            closeModal('depositModal');
            
            // إذا كانت العملية فورية
            if (method !== 'manual') {
                // تحديث الرصيد فوراً
                setTimeout(() => {
                    loadWalletData();
                }, 1000);
            }
            
        } else {
            throw new Error(data.error || 'فشل في معالجة الشحن');
        }
        
        hideLoading();
        
    } catch (error) {
        console.error('❌ خطأ في معالجة الشحن:', error);
        showMessage('error', 'حدث خطأ في معالجة الشحن');
        hideLoading();
    }
}

// عرض نافذة السحب
function showWithdrawModal() {
    if (!WalletManager.walletData) {
        showMessage('error', 'لا يمكن تحميل بيانات المحفظة');
        return;
    }
    
    const currentBalance = WalletManager.walletData.balance || 0;
    
    const modalHTML = `
        <div class="modal fade" id="withdrawModal" tabindex="-1" role="dialog">
            <div class="modal-dialog" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-hand-holding-usd"></i> سحب أموال
                        </h5>
                        <button type="button" class="close" data-dismiss="modal">
                            <span>&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="withdrawForm">
                            <div class="alert alert-info">
                                <h6><i class="fas fa-info-circle"></i> الرصيد المتاح:</h6>
                                <div class="available-balance">
                                    <span class="balance-amount">${formatCurrency(currentBalance)} ريال</span>
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label for="withdrawAmount">المبلغ المطلوب (ريال) *</label>
                                <input type="number" class="form-control" id="withdrawAmount" 
                                       min="1000" max="${currentBalance}" step="1000" 
                                       value="${Math.min(10000, currentBalance)}" required>
                                <small class="form-text text-muted">الحد الأدنى للسحب: 1,000 ريال</small>
                            </div>
                            
                            <div class="form-group">
                                <label for="withdrawMethod">طريقة الاستلام *</label>
                                <select class="form-control" id="withdrawMethod" required>
                                    <option value="">اختر طريقة الاستلام</option>
                                    <option value="jib">محفظة جيب</option>
                                    <option value="jawaly">محفظة جوالي</option>
                                    <option value="mobile">موبايل موني</option>
                                    <option value="shamel">الشامل موني</option>
                                    <option value="fulus">فلوسك</option>
                                    <option value="bank">تحويل بنكي</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="withdrawAccount">رقم الحساب/المحفظة *</label>
                                <input type="text" class="form-control" id="withdrawAccount" 
                                       placeholder="أدخل رقم الحساب أو المحفظة" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="withdrawAccountName">اسم صاحب الحساب *</label>
                                <input type="text" class="form-control" id="withdrawAccountName" 
                                       placeholder="أدخل اسم صاحب الحساب" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="withdrawNotes">ملاحظات (اختياري)</label>
                                <textarea class="form-control" id="withdrawNotes" rows="2" 
                                          placeholder="ملاحظات إضافية..."></textarea>
                            </div>
                            
                            <div class="alert alert-warning">
                                <h6><i class="fas fa-exclamation-triangle"></i> ملاحظات هامة:</h6>
                                <ul class="mb-0">
                                    <li>يتم معالجة طلبات السحب خلال 24-48 ساعة عمل</li>
                                    <li>يرجى التأكد من صحة معلومات الحساب</li>
                                    <li>يتم خصم 2% رسوم معالجة (بحد أدنى 500 ريال)</li>
                                    <li>الحد الأقصى للسحب اليومي: 50,000 ريال</li>
                                </ul>
                            </div>
                            
                            <div id="withdrawFormErrors" class="alert alert-danger" style="display: none;"></div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">
                            <i class="fas fa-times"></i> إلغاء
                        </button>
                        <button type="button" class="btn btn-primary" onclick="processWithdrawal()">
                            <i class="fas fa-check"></i> تأكيد السحب
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // إضافة النافذة إلى DOM إذا لم تكن موجودة
    if (!document.getElementById('withdrawModal')) {
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
    
    // إظهار النافذة
    showModal('withdrawModal');
}

// معالجة السحب
async function processWithdrawal() {
    try {
        const amount = document.getElementById('withdrawAmount')?.value;
        const method = document.getElementById('withdrawMethod')?.value;
        const account = document.getElementById('withdrawAccount')?.value;
        const accountName = document.getElementById('withdrawAccountName')?.value;
        const notes = document.getElementById('withdrawNotes')?.value;
        
        // التحقق من البيانات
        if (!amount || !method || !account || !accountName) {
            showMessage('error', 'يرجى ملء جميع الحقول المطلوبة');
            return;
        }
        
        const amountNum = parseFloat(amount);
        const currentBalance = WalletManager.walletData?.balance || 0;
        
        if (amountNum < 1000) {
            showMessage('error', 'الحد الأدنى للسحب هو 1,000 ريال');
            return;
        }
        
        if (amountNum > currentBalance) {
            showMessage('error', 'رصيدك غير كافي لهذا المبلغ');
            return;
        }
        
        if (amountNum > 50000) {
            showMessage('error', 'الحد الأقصى للسحب اليومي هو 50,000 ريال');
            return;
        }
        
        // حساب الرسوم
        const fee = Math.max(500, amountNum * 0.02);
        const netAmount = amountNum - fee;
        
        if (!confirm(`سحب ${formatCurrency(amountNum)} ريال\nالرسوم: ${formatCurrency(fee)} ريال\nالصافي: ${formatCurrency(netAmount)} ريال\nهل تريد المتابعة؟`)) {
            return;
        }
        
        showLoading();
        
        const response = await fetch('/api/wallet/withdraw', {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: amountNum,
                method: method,
                account_number: account,
                account_name: accountName,
                notes: notes
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showMessage('success', data.message || 'تم تقديم طلب السحب بنجاح');
            closeModal('withdrawModal');
            
            // تحديث الرصيد
            setTimeout(() => {
                loadWalletData();
            }, 1000);
            
        } else {
            throw new Error(data.error || 'فشل في معالجة السحب');
        }
        
        hideLoading();
        
    } catch (error) {
        console.error('❌ خطأ في معالجة السحب:', error);
        showMessage('error', 'حدث خطأ في معالجة السحب');
        hideLoading();
    }
}

// عرض نافذة التحويل
function showTransferModal() {
    const modalHTML = `
        <div class="modal fade" id="transferModal" tabindex="-1" role="dialog">
            <div class="modal-dialog" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-exchange-alt"></i> تحويل أموال
                        </h5>
                        <button type="button" class="close" data-dismiss="modal">
                            <span>&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="transferForm">
                            <div class="alert alert-info">
                                <h6><i class="fas fa-info-circle"></i> معلومات التحويل:</h6>
                                <p class="mb-0">يمكنك تحويل الأموال لمستخدمين آخرين في التطبيق</p>
                            </div>
                            
                            <div class="form-group">
                                <label for="transferTo">المستخدم المستلم *</label>
                                <div class="input-group">
                                    <input type="text" class="form-control" id="transferSearch" 
                                           placeholder="ابحث بالاسم أو البريد أو الهاتف">
                                    <div class="input-group-append">
                                        <button class="btn btn-outline-secondary" type="button" onclick="searchUser()">
                                            <i class="fas fa-search"></i>
                                        </button>
                                    </div>
                                </div>
                                <select class="form-control mt-2" id="transferTo" required>
                                    <option value="">اختر المستخدم</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="transferAmount">المبلغ (ريال) *</label>
                                <input type="number" class="form-control" id="transferAmount" 
                                       min="100" step="100" required>
                                <small class="form-text text-muted">الحد الأدنى للتحويل: 100 ريال</small>
                            </div>
                            
                            <div class="form-group">
                                <label for="transferNotes">ملاحظات (اختياري)</label>
                                <textarea class="form-control" id="transferNotes" rows="2" 
                                          placeholder="سبب التحويل..."></textarea>
                            </div>
                            
                            <div class="alert alert-warning">
                                <h6><i class="fas fa-exclamation-triangle"></i> ملاحظات هامة:</h6>
                                <ul class="mb-0">
                                    <li>التحويل فوري ولا يمكن التراجع عنه</li>
                                    <li>تأكد من صحة بيانات المستلم قبل الإرسال</li>
                                    <li>يتم خصم 1% رسوم تحويل (بحد أدنى 100 ريال)</li>
                                    <li>سيتلقى المستلم إشعاراً بالتحويل</li>
                                </ul>
                            </div>
                            
                            <div id="transferFormErrors" class="alert alert-danger" style="display: none;"></div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">
                            <i class="fas fa-times"></i> إلغاء
                        </button>
                        <button type="button" class="btn btn-primary" onclick="processTransfer()">
                            <i class="fas fa-paper-plane"></i> إرسال التحويل
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // إضافة النافذة إلى DOM إذا لم تكن موجودة
    if (!document.getElementById('transferModal')) {
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
    
    // إظهار النافذة
    showModal('transferModal');
}

// البحث عن مستخدم للتحويل
async function searchUser() {
    try {
        const searchQuery = document.getElementById('transferSearch')?.value;
        if (!searchQuery || searchQuery.length < 2) {
            showMessage('warning', 'يرجى إدخال 2 أحرف على الأقل للبحث');
            return;
        }
        
        const response = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            populateUsersSelect(data.data || []);
        }
        
    } catch (error) {
        console.error('❌ خطأ في البحث عن المستخدمين:', error);
        showMessage('error', 'حدث خطأ في البحث');
    }
}

// تعبئة قائمة المستخدمين
function populateUsersSelect(users) {
    const select = document.getElementById('transferTo');
    if (!select) return;
    
    // الحفاظ على الخيارات الحالية
    const currentValue = select.value;
    
    // مسح الخيارات القديمة (باستثناء الخيار الأول)
    while (select.options.length > 1) {
        select.remove(1);
    }
    
    // إضافة المستخدمين الجدد
    users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = `${user.name} (${user.phone})`;
        select.appendChild(option);
    });
    
    // استعادة القيمة السابقة
    select.value = currentValue;
}

// معالجة التحويل
async function processTransfer() {
    try {
        const toUserId = document.getElementById('transferTo')?.value;
        const amount = document.getElementById('transferAmount')?.value;
        const notes = document.getElementById('transferNotes')?.value;
        
        // التحقق من البيانات
        if (!toUserId || !amount) {
            showMessage('error', 'يرجى ملء جميع الحقول المطلوبة');
            return;
        }
        
        const amountNum = parseFloat(amount);
        const currentBalance = WalletManager.walletData?.balance || 0;
        
        if (amountNum < 100) {
            showMessage('error', 'الحد الأدنى للتحويل هو 100 ريال');
            return;
        }
        
        if (amountNum > currentBalance) {
            showMessage('error', 'رصيدك غير كافي لهذا المبلغ');
            return;
        }
        
        // حساب الرسوم
        const fee = Math.max(100, amountNum * 0.01);
        const totalAmount = amountNum + fee;
        
        if (totalAmount > currentBalance) {
            showMessage('error', `رصيدك غير كافي (بعد إضافة الرسوم ${formatCurrency(fee)} ريال)`);
            return;
        }
        
        if (!confirm(`تحويل ${formatCurrency(amountNum)} ريال\nالرسوم: ${formatCurrency(fee)} ريال\nالإجمالي: ${formatCurrency(totalAmount)} ريال\nهل تريد المتابعة؟`)) {
            return;
        }
        
        showLoading();
        
        const response = await fetch('/api/wallet/transfer', {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                to_user_id: toUserId,
                amount: amountNum,
                notes: notes
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showMessage('success', data.message || 'تم إجراء التحويل بنجاح');
            closeModal('transferModal');
            
            // تحديث الرصيد
            setTimeout(() => {
                loadWalletData();
            }, 1000);
            
        } else {
            throw new Error(data.error || 'فشل في معالجة التحويل');
        }
        
        hideLoading();
        
    } catch (error) {
        console.error('❌ خطأ في معالجة التحويل:', error);
        showMessage('error', 'حدث خطأ في معالجة التحويل');
        hideLoading();
    }
}

// تصدير المعاملات
function exportTransactions() {
    try {
        // إنشاء بيانات CSV
        let csv = 'تاريخ,نوع المعاملة,الوصف,المبلغ,الحالة,رقم المرجع\n';
        
        WalletManager.transactions.forEach(transaction => {
            csv += `"${formatDate(transaction.created_at)}",`;
            csv += `"${getTransactionTypeText(transaction.type)}",`;
            csv += `"${transaction.description || ''}",`;
            csv += `"${transaction.amount}",`;
            csv += `"${getTransactionStatusText(transaction.status)}",`;
            csv += `"${transaction.transaction_id || ''}"\n`;
        });
        
        // إنشاء ملف وتنزيله
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `معاملات_محفظة_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showMessage('success', 'تم تصدير المعاملات بنجاح');
        
    } catch (error) {
        console.error('❌ خطأ في تصدير المعاملات:', error);
        showMessage('error', 'حدث خطأ في تصدير المعاملات');
    }
}

// إظهار تحميل المحفظة
function showWalletLoading() {
    const transactionsList = document.getElementById('transactionsList');
    const transactionsTableBody = document.getElementById('transactionsTableBody');
    
    if (transactionsList) {
        transactionsList.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="sr-only">جاري التحميل...</span>
                </div>
                <p class="mt-2">جاري تحميل بيانات المحفظة...</p>
            </div>
        `;
    }
    
    if (transactionsTableBody) {
        transactionsTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="sr-only">جاري التحميل...</span>
                    </div>
                    <p class="mt-2">جاري تحميل المعاملات...</p>
                </td>
            </tr>
        `;
    }
}

// إخفاء تحميل المحفظة
function hideWalletLoading() {
    // يتم التعامل معه في renderTransactions
}

// ============ تصدير الدوال الهامة ============
window.initWalletManager = initWalletManager;
window.showDepositModal = showDepositModal;
window.showWithdrawModal = showWithdrawModal;
window.showTransferModal = showTransferModal;
window.processDeposit = processDeposit;
window.processWithdrawal = processWithdrawal;
window.processTransfer = processTransfer;
window.searchUser = searchUser;
window.exportTransactions = exportTransactions;
window.updateTransactionsFilters = updateTransactionsFilters;
window.changeTransactionsPage = changeTransactionsPage;

console.log('✅ مدير المحفظة جاهز للاستخدام');
