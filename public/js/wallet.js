/**
 * Wallet Management JavaScript
 * Handles all wallet-related functionality
 */

// Global variables
let currentPage = 1;
let isLoading = false;
let hasMore = true;
let selectedTransaction = null;
let qrCode = null;

// Initialize wallet page
async function loadWalletData() {
    try {
        showLoading('جاري تحميل بيانات المحفظة...');
        
        // Load wallet balance
        const walletResponse = await fetch('/api/wallet', {
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        if (!walletResponse.ok) {
            throw new Error('فشل في تحميل بيانات المحفظة');
        }
        
        const walletData = await walletResponse.json();
        
        if (walletData.success) {
            updateWalletDisplay(walletData.data);
        }
        
        // Load wallet stats
        const statsResponse = await fetch('/api/wallet/stats', {
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            if (statsData.success) {
                updateStatsDisplay(statsData.data);
            }
        }
        
    } catch (error) {
        console.error('Error loading wallet data:', error);
        toastr.error('حدث خطأ في تحميل بيانات المحفظة');
    } finally {
        hideLoading();
    }
}

// Update wallet display
function updateWalletDisplay(walletData) {
    const balance = walletData.balance || 0;
    document.getElementById('currentBalance').textContent = formatCurrency(balance);
    document.getElementById('availableBalance').textContent = formatCurrency(balance);
    
    // Update transactions list if available
    if (walletData.transactions && Array.isArray(walletData.transactions)) {
        renderTransactions(walletData.transactions);
    }
}

// Update stats display
function updateStatsDisplay(statsData) {
    if (statsData.stats) {
        statsData.stats.forEach(stat => {
            if (stat.type === 'deposit') {
                document.getElementById('totalDeposits').textContent = 
                    formatCurrency(stat.total_amount || 0);
            } else if (stat.type === 'purchase') {
                document.getElementById('totalPurchases').textContent = 
                    formatCurrency(stat.total_amount || 0);
            }
        });
    }
}

// Load transactions
async function loadTransactions() {
    if (isLoading || !hasMore) return;
    
    isLoading = true;
    
    try {
        const filter = document.getElementById('transactionFilter').value;
        const period = document.getElementById('periodFilter').value;
        
        let url = `/api/wallet/transactions?page=${currentPage}&limit=10`;
        
        if (filter !== 'all') {
            url += `&type=${filter}`;
        }
        
        // Add period filter logic here
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        if (!response.ok) {
            throw new Error('فشل في تحميل المعاملات');
        }
        
        const data = await response.json();
        
        if (data.success) {
            renderTransactions(data.data);
            
            // Check if there are more pages
            if (data.meta && data.data.length < data.meta.limit) {
                hasMore = false;
                document.getElementById('loadMoreContainer').style.display = 'none';
            } else {
                document.getElementById('loadMoreContainer').style.display = 'block';
            }
        }
        
    } catch (error) {
        console.error('Error loading transactions:', error);
        toastr.error('حدث خطأ في تحميل المعاملات');
    } finally {
        isLoading = false;
    }
}

// Render transactions
function renderTransactions(transactions) {
    const container = document.getElementById('transactionsList');
    
    if (currentPage === 1) {
        container.innerHTML = '';
    }
    
    if (!transactions || transactions.length === 0) {
        if (currentPage === 1) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exchange-alt"></i>
                    <p>لا توجد معاملات بعد</p>
                </div>
            `;
        }
        return;
    }
    
    transactions.forEach(transaction => {
        const transactionElement = createTransactionElement(transaction);
        container.appendChild(transactionElement);
    });
}

// Create transaction element
function createTransactionElement(transaction) {
    const div = document.createElement('div');
    div.className = 'transaction-item';
    div.onclick = () => showTransactionDetails(transaction);
    
    // Determine icon and color
    let iconClass = '';
    let icon = '';
    let amountClass = transaction.amount >= 0 ? 'positive' : 'negative';
    
    switch (transaction.type) {
        case 'deposit':
            iconClass = 'deposit';
            icon = 'fa-arrow-down';
            break;
        case 'withdrawal':
            iconClass = 'withdrawal';
            icon = 'fa-arrow-up';
            break;
        case 'purchase':
            iconClass = 'purchase';
            icon = 'fa-shopping-cart';
            break;
        case 'refund':
            iconClass = 'refund';
            icon = 'fa-undo';
            break;
        default:
            iconClass = 'deposit';
            icon = 'fa-exchange-alt';
    }
    
    // Format date
    const date = new Date(transaction.created_at);
    const formattedDate = date.toLocaleDateString('ar-YE', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    div.innerHTML = `
        <div class="transaction-icon ${iconClass}">
            <i class="fas ${icon}"></i>
        </div>
        <div class="transaction-info">
            <div class="transaction-title">${getTransactionTitle(transaction)}</div>
            <div class="transaction-description">${transaction.method || ''}</div>
            <div class="transaction-date">${formattedDate}</div>
        </div>
        <div class="transaction-amount ${amountClass}">
            ${transaction.amount >= 0 ? '+' : ''}${formatCurrency(transaction.amount)}
        </div>
    `;
    
    return div;
}

// Get transaction title based on type
function getTransactionTitle(transaction) {
    const titles = {
        'deposit': 'إيداع',
        'withdrawal': 'سحب',
        'purchase': 'شراء',
        'refund': 'استرداد',
        'transfer': 'تحويل'
    };
    
    return titles[transaction.type] || 'معاملة';
}

// Filter transactions
function filterTransactions() {
    currentPage = 1;
    hasMore = true;
    loadTransactions();
}

// Load more transactions
function loadMoreTransactions() {
    currentPage++;
    loadTransactions();
}

// Show deposit modal
function showDepositModal() {
    document.getElementById('depositModal').style.display = 'flex';
}

// Close deposit modal
function closeDepositModal() {
    document.getElementById('depositModal').style.display = 'none';
    resetDepositForm();
}

// Select payment method
function selectPaymentMethod(method) {
    document.getElementById('bankDetails').style.display = 'none';
    document.getElementById('cardDetails').style.display = 'none';
    
    if (method === 'bank') {
        document.getElementById('bankDetails').style.display = 'block';
    } else if (method === 'card') {
        document.getElementById('cardDetails').style.display = 'block';
    }
}

// Set deposit amount
function setDepositAmount(amount) {
    document.getElementById('depositAmount').value = amount;
}

// Process deposit
async function processDeposit() {
    const amount = parseFloat(document.getElementById('depositAmount').value);
    const method = document.querySelector('input[name="paymentMethod"]:checked')?.value;
    
    if (!amount || amount < 100) {
        toastr.error('الرجاء إدخال مبلغ صحيح (أقل مبلغ 100 ريال)');
        return;
    }
    
    if (!method) {
        toastr.error('الرجاء اختيار طريقة الدفع');
        return;
    }
    
    try {
        showLoading('جاري معالجة الطلب...');
        
        const response = await fetch('/api/wallet/deposit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({
                amount: amount,
                method: method
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            toastr.success('تم طلب شحن المحفظة بنجاح');
            closeDepositModal();
            
            // Update wallet display
            if (data.data && data.data.new_balance) {
                document.getElementById('currentBalance').textContent = 
                    formatCurrency(data.data.new_balance);
            }
            
            // Reload transactions
            currentPage = 1;
            loadTransactions();
            
            // If bank transfer, show instructions
            if (method === 'bank') {
                setTimeout(() => {
                    alert('يرجى إرسال إيصال التحويل البنكي إلى الدعم الفني للتأكيد');
                }, 1000);
            }
        } else {
            toastr.error(data.error || 'حدث خطأ في عملية الشحن');
        }
    } catch (error) {
        console.error('Error processing deposit:', error);
        toastr.error('حدث خطأ في الخادم');
    } finally {
        hideLoading();
    }
}

// Reset deposit form
function resetDepositForm() {
    document.getElementById('depositAmount').value = '';
    document.querySelectorAll('input[name="paymentMethod"]').forEach(input => {
        input.checked = false;
    });
    document.getElementById('bankDetails').style.display = 'none';
    document.getElementById('cardDetails').style.display = 'none';
}

// Show withdraw modal
function showWithdrawModal() {
    document.getElementById('withdrawModal').style.display = 'flex';
}

// Close withdraw modal
function closeWithdrawModal() {
    document.getElementById('withdrawModal').style.display = 'none';
    resetWithdrawForm();
}

// Select withdraw method
function selectWithdrawMethod(method) {
    document.getElementById('bankWithdrawDetails').style.display = 'none';
    document.getElementById('cashWithdrawDetails').style.display = 'none';
    
    if (method === 'bank') {
        document.getElementById('bankWithdrawDetails').style.display = 'block';
    } else if (method === 'cash') {
        document.getElementById('cashWithdrawDetails').style.display = 'block';
    }
}

// Process withdrawal
async function processWithdrawal() {
    const amount = parseFloat(document.getElementById('withdrawAmount').value);
    const method = document.querySelector('input[name="withdrawMethod"]:checked')?.value;
    
    if (!amount || amount < 100) {
        toastr.error('الرجاء إدخال مبلغ صحيح (أقل مبلغ 100 ريال)');
        return;
    }
    
    if (!method) {
        toastr.error('الرجاء اختيار طريقة السحب');
        return;
    }
    
    // Check if amount exceeds balance
    const currentBalance = parseFloat(
        document.getElementById('currentBalance').textContent.replace(/[^0-9.]/g, '')
    );
    
    if (amount > currentBalance) {
        toastr.error('المبلغ المطلوب أكبر من الرصيد المتاح');
        return;
    }
    
    try {
        showLoading('جاري معالجة طلب السحب...');
        
        const requestData = {
            amount: amount,
            method: method
        };
        
        // Add bank details if method is bank
        if (method === 'bank') {
            const bankName = document.getElementById('bankName').value;
            const accountNumber = document.getElementById('accountNumber').value;
            const accountName = document.getElementById('accountName').value;
            
            if (!bankName || !accountNumber || !accountName) {
                toastr.error('الرجاء إكمال معلومات الحساب البنكي');
                return;
            }
            
            requestData.wallet_type = `${bankName} - ${accountNumber}`;
        }
        
        const response = await fetch('/api/wallet/withdraw', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify(requestData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            toastr.success('تم طلب السحب بنجاح');
            closeWithdrawModal();
            
            // Update wallet display
            if (data.data && data.data.new_balance) {
                document.getElementById('currentBalance').textContent = 
                    formatCurrency(data.data.new_balance);
            }
            
            // Reload transactions
            currentPage = 1;
            loadTransactions();
        } else {
            toastr.error(data.error || 'حدث خطأ في عملية السحب');
        }
    } catch (error) {
        console.error('Error processing withdrawal:', error);
        toastr.error('حدث خطأ في الخادم');
    } finally {
        hideLoading();
    }
}

// Reset withdraw form
function resetWithdrawForm() {
    document.getElementById('withdrawAmount').value = '';
    document.querySelectorAll('input[name="withdrawMethod"]').forEach(input => {
        input.checked = false;
    });
    document.getElementById('bankWithdrawDetails').style.display = 'none';
    document.getElementById('cashWithdrawDetails').style.display = 'none';
}

// Show transfer modal
function showTransferModal() {
    document.getElementById('transferModal').style.display = 'flex';
}

// Close transfer modal
function closeTransferModal() {
    document.getElementById('transferModal').style.display = 'none';
    resetTransferForm();
}

// Search recipient
async function searchRecipient() {
    const searchTerm = document.getElementById('recipientSearch').value.trim();
    
    if (searchTerm.length < 2) {
        document.getElementById('searchResults').style.display = 'none';
        return;
    }
    
    try {
        const response = await fetch(`/api/users/search?q=${encodeURIComponent(searchTerm)}`, {
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            displaySearchResults(data.data || []);
        }
    } catch (error) {
        console.error('Error searching recipients:', error);
    }
}

// Display search results
function displaySearchResults(users) {
    const container = document.getElementById('searchResults');
    
    if (!users || users.length === 0) {
        container.innerHTML = '<div class="search-result-item">لم يتم العثور على نتائج</div>';
        container.style.display = 'block';
        return;
    }
    
    let html = '';
    users.forEach(user => {
        html += `
            <div class="search-result-item" onclick="selectRecipient(${JSON.stringify(user).replace(/"/g, '&quot;')})">
                <strong>${user.name}</strong><br>
                <small>${user.phone || user.email}</small>
            </div>
        `;
    });
    
    container.innerHTML = html;
    container.style.display = 'block';
}

// Select recipient
function selectRecipient(user) {
    document.getElementById('selectedRecipient').style.display = 'block';
    document.getElementById('recipientName').textContent = user.name;
    document.getElementById('recipientPhone').textContent = user.phone || user.email;
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('transferBtn').disabled = false;
    
    // Store selected user ID in a data attribute
    document.getElementById('transferBtn').dataset.userId = user.id;
}

// Process transfer
async function processTransfer() {
    const amount = parseFloat(document.getElementById('transferAmount').value);
    const note = document.getElementById('transferNote').value;
    const userId = document.getElementById('transferBtn').dataset.userId;
    
    if (!amount || amount < 10) {
        toastr.error('الرجاء إدخال مبلغ صحيح (أقل مبلغ 10 ريال)');
        return;
    }
    
    if (!userId) {
        toastr.error('الرجاء اختيار مستلم');
        return;
    }
    
    // Check if amount exceeds balance
    const currentBalance = parseFloat(
        document.getElementById('currentBalance').textContent.replace(/[^0-9.]/g, '')
    );
    
    if (amount > currentBalance) {
        toastr.error('المبلغ المطلوب أكبر من الرصيد المتاح');
        return;
    }
    
    try {
        showLoading('جاري معالجة التحويل...');
        
        const response = await fetch('/api/wallet/transfer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({
                to_user_id: userId,
                amount: amount,
                note: note
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            toastr.success('تم التحويل بنجاح');
            closeTransferModal();
            
            // Update wallet display
            if (data.data && data.data.new_balance) {
                document.getElementById('currentBalance').textContent = 
                    formatCurrency(data.data.new_balance);
            }
            
            // Reload transactions
            currentPage = 1;
            loadTransactions();
        } else {
            toastr.error(data.error || 'حدث خطأ في عملية التحويل');
        }
    } catch (error) {
        console.error('Error processing transfer:', error);
        toastr.error('حدث خطأ في الخادم');
    } finally {
        hideLoading();
    }
}

// Reset transfer form
function resetTransferForm() {
    document.getElementById('recipientSearch').value = '';
    document.getElementById('transferAmount').value = '';
    document.getElementById('transferNote').value = '';
    document.getElementById('selectedRecipient').style.display = 'none';
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('transferBtn').disabled = true;
    delete document.getElementById('transferBtn').dataset.userId;
}

// Show QR modal
function showQRModal() {
    document.getElementById('qrModal').style.display = 'flex';
    generateQRCode();
}

// Close QR modal
function closeQRModal() {
    document.getElementById('qrModal').style.display = 'none';
    if (qrCode) {
        qrCode.clear();
    }
}

// Generate QR code
async function generateQRCode() {
    try {
        // Get user info for QR code
        const response = await fetch('/api/users/profile', {
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                const user = data.data;
                
                // Update user info
                document.getElementById('qrUserName').textContent = user.name;
                document.getElementById('qrUserPhone').textContent = user.phone;
                
                // Generate QR code data
                const qrData = JSON.stringify({
                    type: 'wallet_payment',
                    userId: user.id,
                    name: user.name,
                    phone: user.phone,
                    timestamp: Date.now()
                });
                
                // Generate QR code
                const container = document.getElementById('qrCodeDisplay');
                container.innerHTML = '';
                
                qrCode = new QRCode(container, {
                    text: qrData,
                    width: 200,
                    height: 200,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H
                });
            }
        }
    } catch (error) {
        console.error('Error generating QR code:', error);
        toastr.error('حدث خطأ في إنشاء رمز QR');
    }
}

// Generate new QR code
function generateNewQR() {
    if (qrCode) {
        qrCode.clear();
    }
    generateQRCode();
    toastr.success('تم تحديث رمز QR');
}

// Download QR code
function downloadQRCode() {
    const canvas = document.querySelector('#qrCodeDisplay canvas');
    if (canvas) {
        const link = document.createElement('a');
        link.download = `qat-wallet-qr-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        toastr.success('تم تحميل رمز QR');
    }
}

// Show transaction details
function showTransactionDetails(transaction) {
    selectedTransaction = transaction;
    
    const detailsContainer = document.getElementById('transactionDetails');
    const date = new Date(transaction.created_at);
    
    const statusText = {
        'pending': 'قيد الانتظار',
        'completed': 'مكتمل',
        'failed': 'فاشل',
        'cancelled': 'ملغى'
    }[transaction.status] || transaction.status;
    
    const typeText = getTransactionTitle(transaction);
    
    detailsContainer.innerHTML = `
        <div class="detail-row">
            <span class="detail-label">نوع المعاملة:</span>
            <span class="detail-value">${typeText}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">المبلغ:</span>
            <span class="detail-value ${transaction.amount >= 0 ? 'positive' : 'negative'}">
                ${transaction.amount >= 0 ? '+' : ''}${formatCurrency(transaction.amount)}
            </span>
        </div>
        <div class="detail-row">
            <span class="detail-label">طريقة الدفع:</span>
            <span class="detail-value">${transaction.method || 'غير محدد'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">الحالة:</span>
            <span class="detail-value">${statusText}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">رقم المرجع:</span>
            <span class="detail-value">${transaction.transaction_id || 'غير متوفر'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">التاريخ والوقت:</span>
            <span class="detail-value">${date.toLocaleString('ar-YE')}</span>
        </div>
        ${transaction.note ? `
        <div class="detail-row">
            <span class="detail-label">ملاحظات:</span>
            <span class="detail-value">${transaction.note}</span>
        </div>
        ` : ''}
    `;
    
    document.getElementById('transactionDetailsModal').style.display = 'flex';
}

// Close transaction details
function closeTransactionDetails() {
    document.getElementById('transactionDetailsModal').style.display = 'none';
    selectedTransaction = null;
}

// Show bill payment modal
function showBillPaymentModal() {
    document.getElementById('billPaymentModal').style.display = 'flex';
}

// Close bill payment modal
function closeBillPaymentModal() {
    document.getElementById('billPaymentModal').style.display = 'none';
    resetBillPaymentForm();
}

// Select bill type
function selectBillType(type) {
    document.getElementById('billForm').style.display = 'block';
    document.getElementById('payBillBtn').disabled = false;
    
    const labels = {
        'electricity': 'رقم العداد',
        'water': 'رقم العداد',
        'internet': 'رقم الاشتراك',
        'mobile': 'رقم الهاتف'
    };
    
    document.getElementById('billLabel').textContent = labels[type] || 'الرقم';
    document.getElementById('payBillBtn').dataset.billType = type;
}

// Pay bill
async function payBill() {
    const billType = document.getElementById('payBillBtn').dataset.billType;
    const billNumber = document.getElementById('billNumber').value;
    const amount = parseFloat(document.getElementById('billAmount').value);
    
    if (!billNumber || !amount || amount < 100) {
        toastr.error('الرجاء إدخال البيانات بشكل صحيح');
        return;
    }
    
    try {
        showLoading('جاري معالجة الدفع...');
        
        // Simulate API call
        setTimeout(() => {
            hideLoading();
            toastr.success('تم دفع الفاتورة بنجاح');
            closeBillPaymentModal();
            
            // Update balance
            const currentBalance = parseFloat(
                document.getElementById('currentBalance').textContent.replace(/[^0-9.]/g, '')
            );
            const newBalance = currentBalance - amount;
            document.getElementById('currentBalance').textContent = formatCurrency(newBalance);
            
            // Reload transactions
            currentPage = 1;
            loadTransactions();
        }, 2000);
        
    } catch (error) {
        console.error('Error paying bill:', error);
        toastr.error('حدث خطأ في عملية الدفع');
        hideLoading();
    }
}

// Reset bill payment form
function resetBillPaymentForm() {
    document.getElementById('billForm').style.display = 'none';
    document.getElementById('billNumber').value = '';
    document.getElementById('billAmount').value = '';
    document.getElementById('payBillBtn').disabled = true;
    delete document.getElementById('payBillBtn').dataset.billType;
}

// Show gift card modal
function showGiftCardModal() {
    document.getElementById('giftCardModal').style.display = 'flex';
}

// Close gift card modal
function closeGiftCardModal() {
    document.getElementById('giftCardModal').style.display = 'none';
    resetGiftCardForm();
}

// Show create gift card
function showCreateGiftCard() {
    document.getElementById('createGiftCard').style.display = 'block';
    document.getElementById('redeemGiftCard').style.display = 'none';
    document.getElementById('createGiftBtn').style.display = 'block';
    document.getElementById('redeemGiftBtn').style.display = 'none';
}

// Show redeem gift card
function showRedeemGiftCard() {
    document.getElementById('redeemGiftCard').style.display = 'block';
    document.getElementById('createGiftCard').style.display = 'none';
    document.getElementById('redeemGiftBtn').style.display = 'block';
    document.getElementById('createGiftBtn').style.display = 'none';
}

// Set gift amount
function setGiftAmount(amount) {
    document.getElementById('giftAmount').value = amount;
}

// Create gift card
async function createGiftCard() {
    const amount = parseFloat(document.getElementById('giftAmount').value);
    const recipient = document.getElementById('giftRecipient').value;
    const message = document.getElementById('giftMessage').value;
    
    if (!amount || amount < 100) {
        toastr.error('الرجاء إدخال مبلغ صحيح (أقل مبلغ 100 ريال)');
        return;
    }
    
    // Check if amount exceeds balance
    const currentBalance = parseFloat(
        document.getElementById('currentBalance').textContent.replace(/[^0-9.]/g, '')
    );
    
    if (amount > currentBalance) {
        toastr.error('المبلغ المطلوب أكبر من الرصيد المتاح');
        return;
    }
    
    try {
        showLoading('جاري إنشاء بطاقة الهدايا...');
        
        // Simulate API call
        setTimeout(() => {
            hideLoading();
            
            // Generate gift code
            const giftCode = `GIFT-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
            
            const giftDetails = `
                تم إنشاء بطاقة هدايا بنجاح!
                
                كود البطاقة: ${giftCode}
                القيمة: ${formatCurrency(amount)}
                ${recipient ? `المستلم: ${recipient}` : ''}
                ${message ? `الرسالة: ${message}` : ''}
                
                شارك هذا الكود مع صديقك لاستخدامه.
            `;
            
            alert(giftDetails);
            
            closeGiftCardModal();
            
            // Update balance
            const newBalance = currentBalance - amount;
            document.getElementById('currentBalance').textContent = formatCurrency(newBalance);
            
            // Reload transactions
            currentPage = 1;
            loadTransactions();
            
        }, 2000);
        
    } catch (error) {
        console.error('Error creating gift card:', error);
        toastr.error('حدث خطأ في إنشاء بطاقة الهدايا');
        hideLoading();
    }
}

// Redeem gift card
async function redeemGiftCard() {
    const giftCode = document.getElementById('giftCode').value.trim();
    
    if (!giftCode) {
        toastr.error('الرجاء إدخال كود بطاقة الهدايا');
        return;
    }
    
    try {
        showLoading('جاري التحقق من بطاقة الهدايا...');
        
        // Simulate API call
        setTimeout(() => {
            hideLoading();
            
            // Simulate successful redemption
            const amount = 5000; // Example amount
            
            toastr.success(`تم استبدال بطاقة الهدايا بنجاح! تم إضافة ${formatCurrency(amount)} إلى محفظتك`);
            
            closeGiftCardModal();
            
            // Update balance
            const currentBalance = parseFloat(
                document.getElementById('currentBalance').textContent.replace(/[^0-9.]/g, '')
            );
            const newBalance = currentBalance + amount;
            document.getElementById('currentBalance').textContent = formatCurrency(newBalance);
            
            // Reload transactions
            currentPage = 1;
            loadTransactions();
            
        }, 2000);
        
    } catch (error) {
        console.error('Error redeeming gift card:', error);
        toastr.error('حدث خطأ في استبدال بطاقة الهدايا');
        hideLoading();
    }
}

// Reset gift card form
function resetGiftCardForm() {
    document.getElementById('giftAmount').value = '';
    document.getElementById('giftRecipient').value = '';
    document.getElementById('giftMessage').value = '';
    document.getElementById('giftCode').value = '';
    document.getElementById('createGiftCard').style.display = 'none';
    document.getElementById('redeemGiftCard').style.display = 'none';
    document.getElementById('createGiftBtn').style.display = 'none';
    document.getElementById('redeemGiftBtn').style.display = 'none';
}

// Helper function to format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('ar-YE', {
        style: 'decimal',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

// Show loading overlay
function showLoading(text = 'جاري المعالجة...') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').style.display = 'flex';
}

// Hide loading overlay
function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

// Get auth token from localStorage
function getAuthToken() {
    return localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
}

// Check authentication (implemented in auth.js)
async function checkAuth() {
    // This function should be implemented in auth.js
    return true;
}
