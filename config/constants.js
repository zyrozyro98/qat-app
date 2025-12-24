module.exports = {
    // إعدادات التطبيق
    APP_NAME: 'تطبيق قات PRO',
    APP_VERSION: '2.0.0',
    APP_DESCRIPTION: 'نظام البيع والتوصيل المتكامل للقات',
    
    // الإعدادات العامة
    IS_PRODUCTION: process.env.NODE_ENV === 'production',
    PORT: process.env.PORT || 3000,
    
    // إعدادات الجلسات
    SESSION_CONFIG: {
        name: 'qat_pro_session',
        secret: process.env.SESSION_SECRET || 'default-session-secret-change-in-production',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 أيام
        }
    },
    
    // إعدادات قاعدة البيانات
    DATABASE: {
        PATH: 'data/database.sqlite',
        BACKUP_DIR: 'backups',
        BACKUP_INTERVAL: '0 2 * * *', // كل يوم الساعة 2 صباحاً
        OPTIMIZE_INTERVAL: '0 4 * * 0' // كل أسبوع يوم الأحد الساعة 4 صباحاً
    },
    
    // إعدادات التشفير
    ENCRYPTION: {
        KEY: process.env.ENCRYPTION_KEY || 'qat-pro-secure-key-change-in-production',
        ALGORITHM: 'aes-256-cbc',
        IV_LENGTH: 16
    },
    
    // إعدادات التحميل
    UPLOAD: {
        MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
        ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
        ALLOWED_DOC_TYPES: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        UPLOAD_DIR: 'uploads'
    },
    
    // إعدادات الصور
    IMAGE_PROCESSING: {
        PRODUCT_IMAGE: { width: 800, height: 600, quality: 80, format: 'webp' },
        AVATAR_IMAGE: { width: 200, height: 200, quality: 80, format: 'webp' },
        THUMBNAIL: { width: 150, height: 150, quality: 70, format: 'webp' }
    },
    
    // إعدادات البريد الإلكتروني
    EMAIL: {
        FROM: process.env.SMTP_USER ? `"تطبيق قات PRO" <${process.env.SMTP_USER}>` : '"تطبيق قات PRO" <noreply@qat-app.com>',
        SUPPORT_EMAIL: 'support@qat-app.com',
        ADMIN_EMAIL: 'admin@qat-app.com'
    },
    
    // إعدادات التطبيق
    APP_SETTINGS: {
        MAX_PRODUCTS_PER_PAGE: 20,
        MAX_ORDERS_PER_PAGE: 10,
        MAX_NOTIFICATIONS_PER_PAGE: 20,
        DEFAULT_CURRENCY: 'YER',
        DEFAULT_LANGUAGE: 'ar',
        TIMEZONE: 'Asia/Aden'
    },
    
    // أدوار المستخدمين
    USER_ROLES: {
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
    
    // حالات المنتجات
    PRODUCT_STATUS: {
        ACTIVE: 'active',
        OUT_OF_STOCK: 'out_of_stock',
        INACTIVE: 'inactive'
    },
    
    // حالات السائقين
    DRIVER_STATUS: {
        AVAILABLE: 'available',
        BUSY: 'busy',
        OFFLINE: 'offline'
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
    },
    
    // فئات المنتجات
    PRODUCT_CATEGORIES: [
        'قات يمني',
        'قات سعودي',
        'قات إثيوبي',
        'قات كيني',
        'قات صومالي',
        'مستلزمات القات'
    ],
    
    // أنواع المركبات
    VEHICLE_TYPES: [
        'دراجة نارية',
        'سيارة صغيرة',
        'سيارة كبيرة',
        'شاحنة صغيرة'
    ],
    
    // الرسائل والتنبيهات
    MESSAGES: {
        WELCOME: 'مرحباً بك في تطبيق قات PRO',
        ORDER_CREATED: 'تم إنشاء طلبك بنجاح',
        ORDER_UPDATED: 'تم تحديث حالة طلبك',
        PAYMENT_SUCCESS: 'تمت عملية الدفع بنجاح',
        PAYMENT_FAILED: 'فشلت عملية الدفع',
        PRODUCT_ADDED: 'تم إضافة المنتج بنجاح',
        PRODUCT_UPDATED: 'تم تحديث المنتج بنجاح',
        WALLET_CHARGED: 'تم شحن محفظتك بنجاح',
        PROFILE_UPDATED: 'تم تحديث ملفك الشخصي'
    },
    
    // أكواد الأخطاء
    ERROR_CODES: {
        VALIDATION_ERROR: 'VALIDATION_ERROR',
        AUTH_ERROR: 'AUTH_ERROR',
        NOT_FOUND: 'NOT_FOUND',
        FORBIDDEN: 'FORBIDDEN',
        SERVER_ERROR: 'SERVER_ERROR',
        DATABASE_ERROR: 'DATABASE_ERROR',
        NETWORK_ERROR: 'NETWORK_ERROR'
    },
    
    // حدود النظام
    LIMITS: {
        MAX_PRODUCTS_PER_SELLER: 100,
        MAX_ORDERS_PER_DAY: 50,
        MAX_WITHDRAWAL_AMOUNT: 1000000, // 1,000,000 ريال
        MIN_DEPOSIT_AMOUNT: 1000, // 1,000 ريال
        MAX_DEPOSIT_AMOUNT: 10000000 // 10,000,000 ريال
    },
    
    // روابط التطبيق
    LINKS: {
        WEBSITE: 'https://qat-app.com',
        DOCUMENTATION: 'https://docs.qat-app.com',
        SUPPORT: 'https://support.qat-app.com',
        API_DOCS: 'https://api.qat-app.com/docs'
    }
};
