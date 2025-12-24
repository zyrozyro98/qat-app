// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const logger = require('./server').logger || console;

class Database {
    constructor() {
        this.dbPath = path.join(__dirname, 'data', 'database.sqlite');
        this.db = null;
    }

    async initialize() {
        try {
            // إنشاء مجلد data إذا لم يكن موجوداً
            const dataDir = path.join(__dirname, 'data');
            try {
                await fs.access(dataDir);
            } catch {
                await fs.mkdir(dataDir, { recursive: true });
            }

            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    logger.error(`❌ خطأ في فتح قاعدة البيانات: ${err.message}`);
                } else {
                    logger.info('✅ تم الاتصال بقاعدة البيانات');
                }
            });

            await this.createTables();
        } catch (error) {
            logger.error(`❌ خطأ في تهيئة قاعدة البيانات: ${error.message}`);
            throw error;
        }
    }

    async createTables() {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                // جدول المستخدمين
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        email TEXT UNIQUE NOT NULL,
                        phone TEXT UNIQUE NOT NULL,
                        password TEXT NOT NULL,
                        role TEXT NOT NULL CHECK(role IN ('admin', 'buyer', 'seller', 'driver')),
                        avatar TEXT,
                        latitude REAL,
                        longitude REAL,
                        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'banned')),
                        last_login DATETIME,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // جدول المحفظة
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS wallets (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER UNIQUE NOT NULL,
                        balance DECIMAL(10,2) DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    )
                `);

                // جدول البائعين
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS sellers (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER UNIQUE NOT NULL,
                        store_name TEXT NOT NULL,
                        rating DECIMAL(3,2) DEFAULT 0,
                        total_sales INTEGER DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    )
                `);

                // جدول مندوبي التوصيل
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS drivers (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER UNIQUE NOT NULL,
                        vehicle_type TEXT,
                        rating DECIMAL(3,2) DEFAULT 0,
                        status TEXT DEFAULT 'available' CHECK(status IN ('available', 'busy', 'offline')),
                        market_id INTEGER,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                        FOREIGN KEY (market_id) REFERENCES markets(id)
                    )
                `);

                // جدول الأسواق
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS markets (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        location TEXT NOT NULL,
                        description TEXT,
                        phone TEXT,
                        manager TEXT,
                        latitude REAL,
                        longitude REAL,
                        opening_hours TEXT,
                        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // جدول المنتجات
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS products (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        seller_id INTEGER NOT NULL,
                        market_id INTEGER NOT NULL,
                        name TEXT NOT NULL,
                        description TEXT,
                        price DECIMAL(10,2) NOT NULL,
                        image TEXT,
                        category TEXT NOT NULL,
                        quantity INTEGER DEFAULT 0,
                        specifications TEXT,
                        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'out_of_stock', 'hidden')),
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (seller_id) REFERENCES users(id),
                        FOREIGN KEY (market_id) REFERENCES markets(id)
                    )
                `);

                // جدول الطلبات
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS orders (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        buyer_id INTEGER NOT NULL,
                        driver_id INTEGER,
                        total DECIMAL(10,2) NOT NULL,
                        shipping_address TEXT NOT NULL,
                        payment_method TEXT CHECK(payment_method IN ('wallet', 'cash')),
                        coupon_code TEXT,
                        wash_qat BOOLEAN DEFAULT 0,
                        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled')),
                        order_code TEXT UNIQUE NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (buyer_id) REFERENCES users(id),
                        FOREIGN KEY (driver_id) REFERENCES drivers(id)
                    )
                `);

                // جدول عناصر الطلب
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS order_items (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        order_id INTEGER NOT NULL,
                        product_id INTEGER NOT NULL,
                        seller_id INTEGER NOT NULL,
                        quantity INTEGER NOT NULL,
                        unit_price DECIMAL(10,2) NOT NULL,
                        total_price DECIMAL(10,2) NOT NULL,
                        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                        FOREIGN KEY (product_id) REFERENCES products(id),
                        FOREIGN KEY (seller_id) REFERENCES users(id)
                    )
                `);

                // جدول المعاملات
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS transactions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        amount DECIMAL(10,2) NOT NULL,
                        type TEXT CHECK(type IN ('deposit', 'withdrawal', 'purchase', 'refund')),
                        method TEXT,
                        wallet_type TEXT,
                        transaction_id TEXT UNIQUE,
                        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed', 'cancelled')),
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id)
                    )
                `);

                // جدول التقييمات
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS reviews (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        product_id INTEGER NOT NULL,
                        order_id INTEGER NOT NULL,
                        rating INTEGER CHECK(rating BETWEEN 1 AND 5),
                        comment TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id),
                        FOREIGN KEY (product_id) REFERENCES products(id),
                        FOREIGN KEY (order_id) REFERENCES orders(id),
                        UNIQUE(user_id, product_id, order_id)
                    )
                `);

                // جدول الإشعارات
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS notifications (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        title TEXT NOT NULL,
                        message TEXT NOT NULL,
                        type TEXT DEFAULT 'info',
                        is_read BOOLEAN DEFAULT 0,
                        metadata TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id)
                    )
                `);

                // جدول كوبونات الهدايا
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS gift_coupons (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        code TEXT UNIQUE NOT NULL,
                        type TEXT CHECK(type IN ('amount', 'percentage', 'free_shipping')),
                        value DECIMAL(10,2) NOT NULL,
                        created_by INTEGER NOT NULL,
                        target_type TEXT CHECK(target_type IN ('all', 'specific_users', 'by_balance', 'by_orders', 'new_users')),
                        target_criteria TEXT,
                        min_order_amount DECIMAL(10,2) DEFAULT 0,
                        max_discount DECIMAL(10,2),
                        usage_limit INTEGER,
                        used_count INTEGER DEFAULT 0,
                        valid_from DATETIME,
                        valid_until DATETIME,
                        notes TEXT,
                        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'expired')),
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (created_by) REFERENCES users(id)
                    )
                `);

                // جدول محطات الغسيل
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS wash_stations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        market_id INTEGER NOT NULL,
                        name TEXT NOT NULL,
                        phone TEXT,
                        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (market_id) REFERENCES markets(id)
                    )
                `);

                // جدول طلبات الغسيل
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS wash_orders (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        order_id INTEGER NOT NULL,
                        wash_station_id INTEGER NOT NULL,
                        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'washing', 'completed', 'cancelled')),
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (order_id) REFERENCES orders(id),
                        FOREIGN KEY (wash_station_id) REFERENCES wash_stations(id)
                    )
                `);

                // جدول نشاطات المدير
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS admin_activities (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        admin_id INTEGER NOT NULL,
                        action TEXT NOT NULL,
                        target_id INTEGER,
                        details TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (admin_id) REFERENCES users(id)
                    )
                `);

                // جدول المسافات
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS distances (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        market_id INTEGER NOT NULL,
                        user_id INTEGER NOT NULL,
                        distance_km DECIMAL(5,2) NOT NULL,
                        calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (market_id) REFERENCES markets(id),
                        FOREIGN KEY (user_id) REFERENCES users(id),
                        UNIQUE(market_id, user_id)
                    )
                `);

                // إنشاء الفهارس
                this.db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
                this.db.run(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
                this.db.run(`CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id)`);
                this.db.run(`CREATE INDEX IF NOT EXISTS idx_products_market ON products(market_id)`);
                this.db.run(`CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id)`);
                this.db.run(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
                this.db.run(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)`);

                logger.info('✅ تم إنشاء جميع الجداول');
                resolve();
            });
        });
    }

    // دوال CRUD الأساسية
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ lastID: this.lastID, changes: this.changes });
                }
            });
        });
    }

    getQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    allQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    // دوال مساعدة
    async beginTransaction() {
        return this.run('BEGIN TRANSACTION');
    }

    async commit() {
        return this.run('COMMIT');
    }

    async rollback() {
        return this.run('ROLLBACK');
    }

    async backup() {
        const backupPath = path.join(__dirname, 'backups', `backup_${Date.now()}.sqlite`);
        await fs.copyFile(this.dbPath, backupPath);
        return backupPath;
    }
}

// إنشاء وتهيئة نسخة من قاعدة البيانات
const db = new Database();
db.initialize().catch(err => {
    logger.error(`❌ فشل في تهيئة قاعدة البيانات: ${err.message}`);
});

module.exports = db;
