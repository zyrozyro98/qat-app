// نظام WebSocket لتطبيق قات PRO
class SocketManager {
    constructor(app) {
        this.app = app;
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.eventHandlers = new Map();
    }
    
    connect() {
        if (!this.app.state.isAuthenticated || this.socket) return;
        
        try {
            this.socket = io(this.app.config.socketUrl, {
                transports: ['websocket', 'polling'],
                auth: {
                    userId: this.app.state.user.id,
                    token: this.app.state.token
                },
                reconnection: true,
                reconnectionAttempts: this.maxReconnectAttempts,
                reconnectionDelay: this.reconnectDelay,
                reconnectionDelayMax: 5000,
                timeout: 20000
            });
            
            this.setupEventListeners();
            
        } catch (error) {
            console.error('❌ خطأ في الاتصال بـ WebSocket:', error);
            this.handleConnectionError(error);
        }
    }
    
    setupEventListeners() {
        if (!this.socket) return;
        
        // أحداث الاتصال
        this.socket.on('connect', () => {
            console.log('🔌 متصل بـ WebSocket');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.app.showNotification('success', 'متصل بالنظام المباشر');
        });
        
        this.socket.on('disconnect', (reason) => {
            console.log('🔌 انقطع الاتصال بـ WebSocket:', reason);
            this.isConnected = false;
            
            if (reason === 'io server disconnect') {
                // الخادم قطع الاتصال عمداً، نحتاج لإعادة الاتصال يدوياً
                this.socket.connect();
            }
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('❌ خطأ في اتصال WebSocket:', error);
            this.handleConnectionError(error);
        });
        
        this.socket.on('reconnect', (attemptNumber) => {
            console.log(`🔌 إعادة الاتصال (المحاولة ${attemptNumber})`);
            this.reconnectAttempts = attemptNumber;
        });
        
        this.socket.on('reconnect_error', (error) => {
            console.error('❌ خطأ في إعادة الاتصال:', error);
        });
        
        this.socket.on('reconnect_failed', () => {
            console.error('❌ فشل إعادة الاتصال بعد جميع المحاولات');
            this.app.showNotification('error', 'فقد الاتصال بالنظام المباشر');
        });
        
        // أحداث التطبيق
        this.socket.on('notification', (data) => {
            this.handleNotification(data);
        });
        
        this.socket.on('order_update', (data) => {
            this.handleOrderUpdate(data);
        });
        
        this.socket.on('wallet_update', (data) => {
            this.handleWalletUpdate(data);
        });
        
        this.socket.on('chat_message', (data) => {
            this.handleChatMessage(data);
        });
        
        this.socket.on('system_alert', (data) => {
            this.handleSystemAlert(data);
        });
        
        // مستمعون مخصصون
        this.setupCustomListeners();
    }
    
    setupCustomListeners() {
        // يمكن إضافة مستمعين مخصصين هنا
        this.on('product:update', (data) => {
            console.log('🔄 تحديث منتج:', data);
            this.app.showNotification('info', `تم تحديث المنتج: ${data.product_name}`);
        });
        
        this.on('order:assigned', (data) => {
            console.log('🚚 تعيين طلب:', data);
            this.app.showNotification('success', `تم تعيين مندوب توصيل لطلبك #${data.order_code}`);
        });
        
        this.on('order:delivered', (data) => {
            console.log('✅ تسليم طلب:', data);
            this.app.showNotification('success', `تم تسليم طلبك #${data.order_code}`);
        });
        
        this.on('wallet:deposit', (data) => {
            console.log('💰 إيداع محفظة:', data);
            this.app.showNotification('success', `تم شحن ${data.amount} ريال إلى محفظتك`);
        });
    }
    
    handleNotification(data) {
        console.log('🔔 إشعار جديد:', data);
        
        // تحديث حالة التطبيق
        this.app.state.notifications.unshift(data);
        this.app.updateNotificationBadge();
        
        // إظهار إشعار فوري
        this.app.showNotification(data.type || 'info', data.message);
        
        // تشغيل صوت الإشعار
        this.playNotificationSound();
        
        // تحديث UI إذا كان العرض الحالي متعلق بالإشعارات
        if (this.app.state.currentView === 'notifications') {
            this.app.showView('notifications');
        }
    }
    
    handleOrderUpdate(data) {
        console.log('🔄 تحديث طلب:', data);
        
        // تحديث حالة التطبيق
        const orderIndex = this.app.state.orders.findIndex(o => o.id === data.order_id);
        if (orderIndex !== -1) {
            this.app.state.orders[orderIndex] = {
                ...this.app.state.orders[orderIndex],
                ...data
            };
            
            // إظهار إشعار
            this.app.showNotification('info', `تم تحديث حالة طلبك #${data.order_code} إلى: ${data.status}`);
            
            // تحديث UI إذا كان العرض الحالي متعلق بالطلبات
            if (this.app.state.currentView === 'orders') {
                this.app.showView('orders');
            }
        }
    }
    
    handleWalletUpdate(data) {
        console.log('💰 تحديث محفظة:', data);
        
        // تحديث حالة التطبيق
        this.app.state.wallet = {
            ...this.app.state.wallet,
            ...data
        };
        
        // إظهار إشعار
        this.app.showNotification('success', `تم تحديث رصيد محفظتك: ${data.balance} ريال`);
        
        // تحديث UI إذا كان العرض الحالي متعلق بالمحفظة
        if (this.app.state.currentView === 'wallet') {
            this.app.showView('wallet');
        }
    }
    
    handleChatMessage(data) {
        console.log('💬 رسالة دردشة:', data);
        
        // تحديث حالة التطبيق
        if (!this.app.state.chatMessages) {
            this.app.state.chatMessages = [];
        }
        
        this.app.state.chatMessages.push(data);
        
        // تشغيل صوت الرسالة
        this.playMessageSound();
        
        // تحديث UI إذا كان العرض الحالي متعلق بالدردشة
        if (this.app.state.currentView === 'chat') {
            this.app.showView('chat');
        }
    }
    
    handleSystemAlert(data) {
        console.log('⚠️ تنبيه نظام:', data);
        
        // إظهار تنبيه للمستخدم
        this.app.showNotification('warning', data.message);
        
        // إذا كان التنبيه حرجاً، إظهار موديل
        if (data.level === 'critical') {
            this.showCriticalAlert(data);
        }
    }
    
    showCriticalAlert(data) {
        const modalHtml = `
            <div class="modal active" id="criticalAlertModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title text-warning">
                            <i class="fas fa-exclamation-triangle"></i>
                            ${data.title || 'تنبيه هام'}
                        </h3>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-warning">
                            <i class="fas fa-exclamation-triangle"></i>
                            ${data.message}
                        </div>
                        ${data.instructions ? `
                            <div class="instructions">
                                <h4>التعليمات:</h4>
                                <p>${data.instructions}</p>
                            </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="app.closeModal('criticalAlertModal')">
                            فهمت
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        const modalsContainer = document.getElementById('modalsContainer');
        modalsContainer.innerHTML = modalHtml;
    }
    
    handleConnectionError(error) {
        this.reconnectAttempts++;
        
        if (this.reconnectAttempts <= this.maxReconnectAttempts) {
            const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
            
            console.log(`⏳ إعادة الاتصال بعد ${delay}ms...`);
            
            setTimeout(() => {
                if (!this.isConnected) {
                    this.connect();
                }
            }, delay);
        } else {
            console.error('❌ فشل جميع محاولات إعادة الاتصال');
            this.app.showNotification('error', 'فقد الاتصال بالنظام المباشر');
        }
    }
    
    playNotificationSound() {
        try {
            // يمكن إضافة صوت إشعار
            const audio = new Audio('/assets/sounds/notification.mp3');
            audio.volume = 0.3;
            audio.play().catch(e => console.log('❌ خطأ في تشغيل الصوت:', e));
        } catch (error) {
            console.log('❌ خطأ في تشغيل صوت الإشعار:', error);
        }
    }
    
    playMessageSound() {
        try {
            const audio = new Audio('/assets/sounds/message.mp3');
            audio.volume = 0.2;
            audio.play().catch(e => console.log('❌ خطأ في تشغيل الصوت:', e));
        } catch (error) {
            console.log('❌ خطأ في تشغيل صوت الرسالة:', error);
        }
    }
    
    // إرسال أحداث
    emit(event, data) {
        if (!this.socket || !this.isConnected) {
            console.warn('⚠️ WebSocket غير متصل، لا يمكن إرسال الحدث:', event);
            return false;
        }
        
        try {
            this.socket.emit(event, data);
            return true;
        } catch (error) {
            console.error(`❌ خطأ في إرسال الحدث ${event}:`, error);
            return false;
        }
    }
    
    // التسجيل للاستماع لأحداث مخصصة
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
            
            // إعداد مستمع Socket.io لهذا الحدث
            if (this.socket) {
                this.socket.on(event, (data) => {
                    const handlers = this.eventHandlers.get(event);
                    if (handlers) {
                        handlers.forEach(h => h(data));
                    }
                });
            }
        }
        
        this.eventHandlers.get(event).push(handler);
    }
    
    off(event, handler) {
        if (!this.eventHandlers.has(event)) return;
        
        const handlers = this.eventHandlers.get(event);
        const index = handlers.indexOf(handler);
        
        if (index !== -1) {
            handlers.splice(index, 1);
        }
    }
    
    joinRoom(room) {
        return this.emit('join:room', { room });
    }
    
    leaveRoom(room) {
        return this.emit('leave:room', { room });
    }
    
    sendMessage(to, message, type = 'text') {
        return this.emit('chat:send', {
            to,
            message,
            type,
            timestamp: new Date().toISOString()
        });
    }
    
    updateStatus(status) {
        return this.emit('user:status', { status });
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            console.log('🔌 تم قطع اتصال WebSocket');
        }
    }
    
    reconnect() {
        this.disconnect();
        this.connect();
    }
    
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts,
            socketId: this.socket?.id
        };
    }
}

// تصدير مدير Socket للاستخدام العام
if (typeof window !== 'undefined') {
    window.SocketManager = SocketManager;
}
