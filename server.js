const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');

// التأكد من وجود مجلد data
if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new sqlite3.Database(dbPath);

// تمكين الواجهات الخارجية
db.configure("busyTimeout", 5000);

// إنشاء الجداول
db.serialize(() => {
    // المستخدمون
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            avatar TEXT,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // المحافظ
    db.run(`
        CREATE TABLE IF NOT EXISTS wallets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            balance DECIMAL(10,2) DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

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
    `);

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
    `);

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
    `);

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
    `);

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
    `);

    // الطلبات
    db.run(`
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            buyer_id INTEGER NOT NULL,
            driver_id INTEGER,
            total DECIMAL(10,2) NOT NULL,
            shipping_address TEXT NOT NULL,
            payment_method TEXT,
            wash_qat BOOLEAN DEFAULT 0,
            status TEXT DEFAULT 'pending',
            order_code TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

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
    `);

    // المعاملات
    db.run(`
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            type TEXT NOT NULL,
            method TEXT,
            transaction_id TEXT,
            wallet_type TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // الإعلانات
    db.run(`
        CREATE TABLE IF NOT EXISTS ads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            image TEXT,
            link TEXT,
            position TEXT,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // التقييمات
    db.run(`
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            order_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            seller_id INTEGER,
            rating INTEGER,
            comment TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )
    `);

    // الإشعارات
    db.run(`
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            is_read BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // إضافة بيانات تجريبية
    setTimeout(() => {
        // التحقق من وجود مستخدمين
        db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
            if (err) {
                console.error('خطأ في التحقق من المستخدمين:', err);
                return;
            }
            
            if (row.count === 0) {
                console.log('✅ إنشاء بيانات تجريبية...');
                
                // إضافة مستخدمين تجريبيين
                const bcrypt = require('bcryptjs');
                
                // كلمة مرور مشتركة للتجربة
                const demoPassword = '123456';
                
                bcrypt.hash(demoPassword, 12).then(hashedPassword => {
                    // حساب المدير
                    db.run(`
                        INSERT INTO users (name, email, phone, password, role, status)
                        VALUES ('المدير العام', 'admin@qat.com', '771831482', ?, 'admin', 'active')
                    `, [hashedPassword], function() {
                        const adminId = this.lastID;
                        db.run('INSERT INTO wallets (user_id, balance) VALUES (?, 10000)', [adminId]);
                    });
                    
                    // حساب بائع
                    bcrypt.hash(demoPassword, 12).then(hash => {
                        db.run(`
                            INSERT INTO users (name, email, phone, password, role, status)
                            VALUES ('أحمد البائع', 'seller@qat.com', '771000001', ?, 'seller', 'active')
                        `, [hash], function() {
                            const sellerId = this.lastID;
                            db.run('INSERT INTO wallets (user_id, balance) VALUES (?, 5000)', [sellerId]);
                            db.run('INSERT INTO sellers (user_id, store_name) VALUES (?, "متجر القات الجيد")', [sellerId]);
                        });
                    });
                    
                    // حساب مشتري
                    bcrypt.hash(demoPassword, 12).then(hash => {
                        db.run(`
                            INSERT INTO users (name, email, phone, password, role, status)
                            VALUES ('محمد المشتري', 'buyer@qat.com', '771000002', ?, 'buyer', 'active')
                        `, [hash], function() {
                            const buyerId = this.lastID;
                            db.run('INSERT INTO wallets (user_id, balance) VALUES (?, 1000)', [buyerId]);
                        });
                    });
                    
                    // إضافة أسواق تجريبية
                    db.run(`
                        INSERT INTO markets (name, location, description, phone, manager)
                        VALUES ('سوق تعز المركزي', 'تعز - المدينة', 'أكبر سوق للقات في تعز', '771111111', 'علي المدير')
                    `);
                    
                    db.run(`
                        INSERT INTO markets (name, location, description, phone, manager)
                        VALUES ('سوق صنعاء القديم', 'صنعاء - باب اليمن', 'سوق تقليدي للقات', '771111112', 'حسن المدير')
                    `);
                    
                    // إضافة منتجات تجريبية
                    setTimeout(() => {
                        db.get('SELECT id FROM users WHERE role = "seller" LIMIT 1', [], (err, seller) => {
                            if (seller) {
                                db.get('SELECT id FROM markets LIMIT 1', [], (err, market) => {
                                    if (market) {
                                        const products = [
                                            ['قات يمني ممتاز', 'أجود أنواع القات اليمني', 45, 'premium', 100, '{}'],
                                            ['قات تعز الفاخر', 'من أشهر مزارع تعز', 35, 'premium', 50, '{}'],
                                            ['قات عضوي طبيعي', 'منتج عضوي خالي من المبيدات', 50, 'organic', 30, '{}']
                                        ];
                                        
                                        products.forEach(product => {
                                            db.run(`
                                                INSERT INTO products (seller_id, market_id, name, description, price, category, quantity, specifications)
                                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                            `, [seller.id, market.id, ...product]);
                                        });
                                        
                                        console.log('✅ تم إنشاء بيانات تجريبية بنجاح');
                                    }
                                });
                            }
                        });
                    }, 1000);
                });
            }
        });
    }, 1000);
});

// دالة لتسهيل الاستعلامات
db.prepare = function(sql) {
    return {
        run: function(...params) {
            return new Promise((resolve, reject) => {
                db.run(sql, params, function(err) {
                    if (err) reject(err);
                    else resolve(this);
                });
            });
        },
        get: function(...params) {
            return new Promise((resolve, reject) => {
                db.get(sql, params, (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        },
        all: function(...params) {
            return new Promise((resolve, reject) => {
                db.all(sql, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        }
    };
};

module.exports = db;
