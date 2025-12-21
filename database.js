const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');

// التأكد من وجود مجلد data
if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
    } else {
        console.log('✅ تم الاتصال بقاعدة البيانات SQLite');
        initializeDatabase();
    }
});

// إنشاء الجداول بطريقة صحيحة
function initializeDatabase() {
    db.serialize(() => {
        // المستخدمون
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                phone TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT CHECK(role IN ('admin', 'seller', 'buyer', 'driver')) NOT NULL,
                avatar TEXT,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('❌ خطأ في إنشاء جدول users:', err.message);
            else console.log('✅ تم إنشاء/التحقق من جدول users');
        });

        // المحافظ
        db.run(`
            CREATE TABLE IF NOT EXISTS wallets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER UNIQUE NOT NULL,
                balance DECIMAL(10,2) DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) console.error('❌ خطأ في إنشاء جدول wallets:', err.message);
            else console.log('✅ تم إنشاء/التحقق من جدول wallets');
        });

        // البائعون
        db.run(`
            CREATE TABLE IF NOT EXISTS sellers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER UNIQUE NOT NULL,
                store_name TEXT NOT NULL,
                rating DECIMAL(3,2) DEFAULT 0,
                total_sales INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) console.error('❌ خطأ في إنشاء جدول sellers:', err.message);
            else console.log('✅ تم إنشاء/التحقق من جدول sellers');
        });

        // الأسواق
        db.run(`
            CREATE TABLE IF NOT EXISTS markets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                location TEXT,
                description TEXT,
                phone TEXT,
                manager TEXT,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('❌ خطأ في إنشاء جدول markets:', err.message);
            else console.log('✅ تم إنشاء/التحقق من جدول markets');
        });

        // مغاسل القات
        db.run(`
            CREATE TABLE IF NOT EXISTS wash_stations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                market_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                phone TEXT,
                washer_name TEXT,
                wash_price DECIMAL(10,2) DEFAULT 100,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) console.error('❌ خطأ في إنشاء جدول wash_stations:', err.message);
            else console.log('✅ تم إنشاء/التحقق من جدول wash_stations');
        });

        // مندوبو التوصيل
        db.run(`
            CREATE TABLE IF NOT EXISTS drivers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER UNIQUE NOT NULL,
                market_id INTEGER NOT NULL,
                vehicle_type TEXT,
                license_plate TEXT,
                rating DECIMAL(3,2) DEFAULT 0,
                status TEXT DEFAULT 'available',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) console.error('❌ خطأ في إنشاء جدول drivers:', err.message);
            else console.log('✅ تم إنشاء/التحقق من جدول drivers');
        });

        // المنتجات
        db.run(`
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                seller_id INTEGER NOT NULL,
                market_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                price DECIMAL(10,2) NOT NULL,
                image TEXT,
                category TEXT,
                quantity INTEGER DEFAULT 0,
                specifications TEXT,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) console.error('❌ خطأ في إنشاء جدول products:', err.message);
            else console.log('✅ تم إنشاء/التحقق من جدول products');
        });

        // الطلبات
        db.run(`
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                buyer_id INTEGER NOT NULL,
                driver_id INTEGER,
                total DECIMAL(10,2) NOT NULL,
                shipping_address TEXT NOT NULL,
                payment_method TEXT,
                wash_qat INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending',
                order_code TEXT UNIQUE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
            )
        `, (err) => {
            if (err) console.error('❌ خطأ في إنشاء جدول orders:', err.message);
            else console.log('✅ تم إنشاء/التحقق من جدول orders');
        });

        // عناصر الطلب
        db.run(`
            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                seller_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                unit_price DECIMAL(10,2) NOT NULL,
                total_price DECIMAL(10,2) NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) console.error('❌ خطأ في إنشاء جدول order_items:', err.message);
            else console.log('✅ تم إنشاء/التحقق من جدول order_items');
        });

        // طلبات غسيل القات
        db.run(`
            CREATE TABLE IF NOT EXISTS wash_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                wash_station_id INTEGER NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                FOREIGN KEY (wash_station_id) REFERENCES wash_stations(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) console.error('❌ خطأ في إنشاء جدول wash_orders:', err.message);
            else console.log('✅ تم إنشاء/التحقق من جدول wash_orders');
        });

        // المعاملات
        db.run(`
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                type TEXT CHECK(type IN ('deposit', 'withdrawal', 'purchase', 'refund')) NOT NULL,
                method TEXT,
                transaction_id TEXT,
                wallet_type TEXT,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) console.error('❌ خطأ في إنشاء جدول transactions:', err.message);
            else console.log('✅ تم إنشاء/التحقق من جدول transactions');
        });

        // طلبات السحب
        db.run(`
            CREATE TABLE IF NOT EXISTS withdrawals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                wallet_number TEXT NOT NULL,
                wallet_type TEXT NOT NULL,
                full_name TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) console.error('❌ خطأ في إنشاء جدول withdrawals:', err.message);
            else console.log('✅ تم إنشاء/التحقق من جدول withdrawals');
        });

        // باقات الإعلانات
        db.run(`
            CREATE TABLE IF NOT EXISTS ad_packages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                price DECIMAL(10,2) NOT NULL,
                duration INTEGER,
                features TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('❌ خطأ في إنشاء جدول ad_packages:', err.message);
            else console.log('✅ تم إنشاء/التحقق من جدول ad_packages');
        });

        // الإعلانات
        db.run(`
            CREATE TABLE IF NOT EXISTS ads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                image TEXT,
                link TEXT,
                position TEXT,
                is_active INTEGER DEFAULT 1,
                package_id INTEGER,
                seller_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (package_id) REFERENCES ad_packages(id) ON DELETE SET NULL,
                FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) console.error('❌ خطأ في إنشاء جدول ads:', err.message);
            else console.log('✅ تم إنشاء/التحقق من جدول ads');
        });

        // التقييمات
        db.run(`
            CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                order_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                seller_id INTEGER,
                rating INTEGER CHECK(rating >= 1 AND rating <= 5),
                comment TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) console.error('❌ خطأ في إنشاء جدول reviews:', err.message);
            else console.log('✅ تم إنشاء/التحقق من جدول reviews');
        });

        // الإشعارات
        db.run(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                is_read INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) console.error('❌ خطأ في إنشاء جدول notifications:', err.message);
            else console.log('✅ تم إنشاء/التحقق من جدول notifications');
        });

        // أكواد الهدايا
        db.run(`
            CREATE TABLE IF NOT EXISTS gift_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                expires_at DATETIME,
                max_uses INTEGER,
                remaining_uses INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('❌ خطأ في إنشاء جدول gift_codes:', err.message);
            else console.log('✅ تم إنشاء/التحقق من جدول gift_codes');
        });

        // استخدامات أكواد الهدايا
        db.run(`
            CREATE TABLE IF NOT EXISTS gift_code_uses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) console.error('❌ خطأ في إنشاء جدول gift_code_uses:', err.message);
            else console.log('✅ تم إنشاء/التحقق من جدول gift_code_uses');
        });

        // إنشاء حساب المدير بعد إنشاء جميع الجداول
        createAdminAccount();
    });
}

// إنشاء حساب المدير
function createAdminAccount() {
    db.get('SELECT id FROM users WHERE email = ?', ['admin@qat.com'], (err, row) => {
        if (err) {
            console.error('❌ خطأ في التحقق من حساب المدير:', err.message);
            return;
        }
        
        if (!row) {
            bcrypt.hash('admin123', 12, (err, hashedPassword) => {
                if (err) {
                    console.error('❌ خطأ في تشفير كلمة مرور المدير:', err.message);
                    return;
                }
                
                db.run(
                    `INSERT INTO users (name, email, phone, password, role, status, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    ['المدير', 'admin@qat.com', '771831482', hashedPassword, 'admin', 'active', new Date().toISOString()],
                    function(err) {
                        if (err) {
                            console.error('❌ خطأ في إنشاء حساب المدير:', err.message);
                            return;
                        }
                        
                        const adminId = this.lastID;
                        console.log(`✅ تم إنشاء حساب المدير (ID: ${adminId})`);
                        
                        // إنشاء محفظة للمدير
                        db.run(
                            `INSERT INTO wallets (user_id, balance, created_at)
                             VALUES (?, ?, ?)`,
                            [adminId, 100000, new Date().toISOString()],
                            (err) => {
                                if (err) {
                                    console.error('❌ خطأ في إنشاء محفظة المدير:', err.message);
                                } else {
                                    console.log('✅ تم إنشاء محفظة المدير برصيد 100,000 ريال');
                                }
                            }
                        );
                    }
                );
            });
        } else {
            console.log('✅ حساب المدير موجود بالفعل');
        }
    });
}

// دالة لتنفيذ الاستعلامات مع معالجة الأخطاء
db.prepareQuery = function(sql, params = []) {
    return new Promise((resolve, reject) => {
        this.run(sql, params, function(err) {
            if (err) {
                console.error('❌ خطأ في تنفيذ الاستعلام:', err.message);
                console.error('📝 الاستعلام:', sql);
                console.error('🔢 المعاملات:', params);
                reject(err);
            } else {
                resolve(this);
            }
        });
    });
};

db.getQuery = function(sql, params = []) {
    return new Promise((resolve, reject) => {
        this.get(sql, params, (err, row) => {
            if (err) {
                console.error('❌ خطأ في جلب البيانات:', err.message);
                console.error('📝 الاستعلام:', sql);
                console.error('🔢 المعاملات:', params);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
};

db.allQuery = function(sql, params = []) {
    return new Promise((resolve, reject) => {
        this.all(sql, params, (err, rows) => {
            if (err) {
                console.error('❌ خطأ في جلب جميع البيانات:', err.message);
                console.error('📝 الاستعلام:', sql);
                console.error('🔢 المعاملات:', params);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
};

module.exports = db;
