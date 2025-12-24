module.exports = {
    IS_PRODUCTION: process.env.NODE_ENV === 'production',
    VERSION: '2.0.0-PRO',
    PORT: process.env.PORT || 3000,
    
    // أدوار المستخدمين
    ROLES: {
        ADMIN: 'admin',
        BUYER: 'buyer',
        SELLER: 'seller',
        DRIVER: 'driver'
    },
    
    // حالات الطلبات
    ORDER_STATUS: {
        PENDING: 'pending',
        PAID: 'paid',
        PREPARING: 'preparing',
        SHIPPING: 'shipping',
        DELIVERED: 'delivered',
        CANCELLED: 'cancelled'
    },
    
    // أنواع المعاملات
    TRANSACTION_TYPES: {
        DEPOSIT: 'deposit',
        WITHDRAWAL: 'withdrawal',
        PURCHASE: 'purchase',
        REFUND: 'refund'
    },
    
    // طرق الدفع
    PAYMENT_METHODS: {
        WALLET: 'wallet',
        CASH: 'cash'
    }
};
