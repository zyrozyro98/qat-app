// تعديل جدول المستخدمين لدعم المفاتيح الفريدة
const createUsersTable = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL DEFAULT (LOWER(HEX(RANDOMBLOB(16)))),
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT UNIQUE NOT NULL, -- مفتاح فريد
    national_id TEXT UNIQUE NOT NULL, -- رقم البطاقة مفتاح فريد
    id_card_front TEXT NOT NULL, -- صورة البطاقة الأمام
    id_card_back TEXT NOT NULL, -- صورة البطاقة الخلف
    password TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'seller', 'buyer', 'driver')) NOT NULL DEFAULT 'buyer',
    avatar TEXT,
    latitude DECIMAL(10,8), -- الموقع الجغرافي
    longitude DECIMAL(11,8),
    status TEXT DEFAULT 'pending', -- pending, active, suspended
    verification_status TEXT DEFAULT 'unverified', -- unverified, verified, rejected
    verification_notes TEXT,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`;

// تحديث جدول البائعين
const createSellersTable = `
CREATE TABLE IF NOT EXISTS sellers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL DEFAULT (LOWER(HEX(RANDOMBLOB(16)))),
    user_id INTEGER UNIQUE NOT NULL,
    store_name TEXT,
    market_id INTEGER NOT NULL,
    description TEXT,
    logo TEXT,
    rating DECIMAL(3,2) DEFAULT 0,
    total_sales INTEGER DEFAULT 0,
    total_revenue DECIMAL(15,2) DEFAULT 0,
    is_verified BOOLEAN DEFAULT 0,
    verified_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
)
`;

// جدول جديد للمسافات
const createDistancesTable = `
CREATE TABLE IF NOT EXISTS distances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    market_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    distance_km DECIMAL(10,2) NOT NULL,
    estimated_time_minutes INTEGER,
    calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(market_id, user_id)
)
`;

// جدول جديد لـ Gift Coupons
const createGiftCouponsTable = `
CREATE TABLE IF NOT EXISTS gift_coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL DEFAULT (LOWER(HEX(RANDOMBLOB(16)))),
    code TEXT UNIQUE NOT NULL,
    type TEXT CHECK(type IN ('amount', 'percentage', 'free_shipping')) NOT NULL,
    value DECIMAL(15,2) NOT NULL,
    created_by INTEGER NOT NULL, -- المدير الذي أنشأ الكوبون
    target_type TEXT CHECK(target_type IN ('all', 'specific_users', 'by_balance', 'by_orders', 'new_users')) DEFAULT 'all',
    target_criteria TEXT, -- معايير الاستهداف (JSON)
    min_order_amount DECIMAL(15,2) DEFAULT 0,
    max_discount DECIMAL(15,2),
    usage_limit INTEGER,
    used_count INTEGER DEFAULT 0,
    valid_from DATETIME,
    valid_until DATETIME,
    is_active BOOLEAN DEFAULT 1,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
)
`;

// جدول جديد لاستخدامات الكوبونات
const createGiftCouponUsesTable = `
CREATE TABLE IF NOT EXISTS gift_coupon_uses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL DEFAULT (LOWER(HEX(RANDOMBLOB(16)))),
    coupon_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    order_id INTEGER,
    amount_saved DECIMAL(15,2) NOT NULL,
    used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (coupon_id) REFERENCES gift_coupons(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
)
`;

// جدول للإشعارات من المدير
const createAdminNotificationsTable = `
CREATE TABLE IF NOT EXISTS admin_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL DEFAULT (LOWER(HEX(RANDOMBLOB(16)))),
    admin_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT CHECK(type IN ('info', 'warning', 'error', 'success')) DEFAULT 'info',
    target_roles TEXT, -- الأدوار المستهدفة (JSON array)
    target_users TEXT, -- المستخدمين المستهدفين (JSON array)
    is_read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
)
`;
