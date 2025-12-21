const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');

// إعداد وتحسين قاعدة البيانات
class Database {
    constructor() {
        this.db = null;
        this.isConnected = false;
    }
    
    async connect() {
        try {
            // التأكد من وجود مجلد data
            await fs.mkdir(path.dirname(dbPath), { recursive: true });
            
            return new Promise((resolve, reject) => {
                this.db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
                    if (err) {
                        console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
                        reject(err);
                    } else {
                        console.log('✅ تم الاتصال بقاعدة البيانات SQLite');
                        this.isConnected = true;
                        
                        // إعداد تحسينات الأداء
                        this.db.run('PRAGMA foreign_keys = ON');
                        this.db.run('PRAGMA journal_mode = WAL');
                        this.db.run('PRAGMA synchronous = NORMAL');
                        this.db.run('PRAGMA cache_size = -2000');
                        this.db.run('PRAGMA temp_store = MEMORY');
                        
                        resolve();
                    }
                });
            });
        } catch (error) {
            console.error('❌ خطأ في إعداد قاعدة البيانات:', error.message);
            throw error;
        }
    }
    
    async initialize() {
        console.log('🔄 جاري تهيئة قاعدة البيانات...');
        
        try {
            await this.createTables();
            await this.createIndexes();
            await this.seedData();
            
            console.log('✅ تم تهيئة قاعدة البيانات بنجاح');
        } catch (error) {
            console.error('❌ خطأ في تهيئة قاعدة البيانات:', error.message);
            throw error;
        }
    }
    
    async createTables() {
        console.log('📊 جاري إنشاء الجداول...');
        
        const tables = [
            // المستخدمون
            `
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL DEFAULT (LOWER(HEX(RANDOMBLOB(16)))),
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                phone TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT CHECK(role IN ('admin', 'seller', 'buyer', 'driver')) NOT NULL DEFAULT 'buyer',
                avatar TEXT,
                status TEXT DEFAULT 'active',
                last_login DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            `,
            
            // المحافظ
            `
            CREATE TABLE IF NOT EXISTS wallets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL DEFAULT (LOWER(HEX(RANDOMBLOB(16)))),
                user_id INTEGER UNIQUE NOT NULL,
                balance DECIMAL(15,2) DEFAULT 0,
                total_deposits DECIMAL(15,2) DEFAULT 0,
                total_withdrawals DECIMAL(15,2) DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            `,
            
            // البائعون
            `
            CREATE TABLE IF NOT EXISTS sellers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL DEFAULT (LOWER(HEX(RANDOMBLOB(16)))),
                user_id INTEGER UNIQUE NOT NULL,
                store_name TEXT NOT NULL,
                description TEXT,
                logo TEXT,
                rating DECIMAL(3,2) DEFAULT 0,
                total_sales INTEGER DEFAULT 0,
                total_revenue DECIMAL(15,2) DEFAULT 0,
                is_verified BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            `,
            
            // الأسواق
            `
            CREATE TABLE IF NOT EXISTS markets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL DEFAULT (LOWER(HEX(RANDOMBLOB(16)))),
                name TEXT NOT NULL,
                location TEXT,
                description TEXT,
                phone TEXT,
                manager TEXT,
                latitude DECIMAL(10,8),
                longitude DECIMAL(11,8),
                opening_hours TEXT,
                status TEXT DEFAULT 'active',
                featured BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            `,
            
            // المنتجات
            `
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL DEFAULT (LOWER(HEX(RANDOMBLOB(16)))),
                seller_id INTEGER NOT NULL,
                market_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                price DECIMAL(15,2) NOT NULL,
                original_price DECIMAL(15,2),
                image TEXT,
                images TEXT,
                category TEXT,
                quantity INTEGER DEFAULT 0,
                min_order INTEGER DEFAULT 1,
                max_order INTEGER DEFAULT 100,
                specifications TEXT,
                is_featured BOOLEAN DEFAULT 0,
                is_discounted BOOLEAN DEFAULT 0,
                discount_percent INTEGER DEFAULT 0,
                status TEXT DEFAULT 'active',
                views INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
            )
            `,
            
            // الطلبات
            `
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL DEFAULT (LOWER(HEX(RANDOMBLOB(16)))),
                buyer_id INTEGER NOT NULL,
                driver_id INTEGER,
                total DECIMAL(15,2) NOT NULL,
                shipping_cost DECIMAL(15,2) DEFAULT 0,
                tax DECIMAL(15,2) DEFAULT 0,
                discount DECIMAL(15,2) DEFAULT 0,
                final_total DECIMAL(15,2) NOT NULL,
                shipping_address TEXT NOT NULL,
                shipping_notes TEXT,
                payment_method TEXT DEFAULT 'cash',
                payment_status TEXT DEFAULT 'pending',
                wash_qat INTEGER DEFAULT 0,
                wash_cost DECIMAL(15,2) DEFAULT 0,
                status TEXT DEFAULT 'pending',
                order_code TEXT UNIQUE NOT NULL,
                tracking_code TEXT,
                estimated_delivery DATETIME,
                delivered_at DATETIME,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE SET NULL
            )
            `,
            
            // عناصر الطلب
            `
            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL DEFAULT (LOWER(HEX(RANDOMBLOB(16)))),
                order_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                seller_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                unit_price DECIMAL(15,2) NOT NULL,
                total_price DECIMAL(15,2) NOT NULL,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
            )
            `,
            
            // التقييمات
            `
            CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL DEFAULT (LOWER(HEX(RANDOMBLOB(16)))),
                user_id INTEGER NOT NULL,
                order_id INTEGER NOT NULL,
                product_id INTEGER,
                seller_id INTEGER,
                driver_id INTEGER,
                rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
                comment TEXT,
                reply TEXT,
                is_verified BOOLEAN DEFAULT 0,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
            )
            `,
            
            // المعاملات
            `
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL DEFAULT (LOWER(HEX(RANDOMBLOB(16)))),
                user_id INTEGER NOT NULL,
                amount DECIMAL(15,2) NOT NULL,
                type TEXT NOT NULL,
                method TEXT,
                transaction_id TEXT UNIQUE,
                wallet_type TEXT,
                reference TEXT,
                status TEXT DEFAULT 'pending',
                notes TEXT,
                metadata TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            `,
            
            // الإشعارات
            `
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL DEFAULT (LOWER(HEX(RANDOMBLOB(16)))),
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                type TEXT DEFAULT 'info',
                is_read BOOLEAN DEFAULT 0,
                action_url TEXT,
                metadata TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            `,
            
            // أكواد الخصم
            `
            CREATE TABLE IF NOT EXISTS discount_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL DEFAULT (LOWER(HEX(RANDOMBLOB(16)))),
                code TEXT UNIQUE NOT NULL,
                discount_type TEXT NOT NULL,
                discount_value DECIMAL(15,2) NOT NULL,
                min_order DECIMAL(15,2) DEFAULT 0,
                max_discount DECIMAL(15,2),
                usage_limit INTEGER,
                used_count INTEGER DEFAULT 0,
                valid_from DATETIME,
                valid_until DATETIME,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            `,
            
            // إحصائيات النظام
            `
            CREATE TABLE IF NOT EXISTS system_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL DEFAULT (LOWER(HEX(RANDOMBLOB(16)))),
                date DATE UNIQUE NOT NULL,
                total_users INTEGER DEFAULT 0,
                active_users INTEGER DEFAULT 0,
                total_orders INTEGER DEFAULT 0,
                total_revenue DECIMAL(15,2) DEFAULT 0,
                total_products INTEGER DEFAULT 0,
                total_sellers INTEGER DEFAULT 0,
                total_drivers INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            `,
            
            // السجلات
            `
            CREATE TABLE IF NOT EXISTS system_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL DEFAULT (LOWER(HEX(RANDOMBLOB(16)))),
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                context TEXT,
                ip_address TEXT,
                user_id INTEGER,
                user_agent TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            `
        ];
        
        for (const sql of tables) {
            await this.run(sql);
        }
        
        console.log('✅ تم إنشاء جميع الجداول');
    }
    
    async createIndexes() {
        console.log('📈 جاري إنشاء الفهارس...');
        
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
            'CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)',
            'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)',
            'CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)',
            'CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id)',
            'CREATE INDEX IF NOT EXISTS idx_products_market ON products(market_id)',
            'CREATE INDEX IF NOT EXISTS idx_products_status ON products(status)',
            'CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)',
            'CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id)',
            'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)',
            'CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(order_code)',
            'CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)',
            'CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id)',
            'CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status)',
            'CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read)',
            'CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id)',
            'CREATE INDEX IF NOT EXISTS idx_reviews_seller ON reviews(seller_id)',
            'CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating)',
            'CREATE INDEX IF NOT EXISTS idx_system_stats_date ON system_stats(date)'
        ];
        
        for (const sql of indexes) {
            await this.run(sql);
        }
        
        console.log('✅ تم إنشاء جميع الفهارس');
    }
    
    async seedData() {
        console.log('🌱 جاري إضافة البيانات الأولية...');
        
        try {
            // التحقق من وجود مدير
            const adminExists = await this.get('SELECT id FROM users WHERE email = ?', ['admin@qat.com']);
            
            if (!adminExists) {
                console.log('👑 جاري إنشاء حساب المدير...');
                
                const hashedPassword = await bcrypt.hash('Admin@123', 12);
                const now = new Date().toISOString();
                
                await this.run(
                    `INSERT INTO users (name, email, phone, password, role, status, created_at)
                     VALUES (?, ?, ?, ?, 'admin', 'active', ?)`,
                    ['مدير النظام', 'admin@qat.com', '771831482', hashedPassword, now]
                );
                
                const adminResult = await this.get('SELECT id FROM users WHERE email = ?', ['admin@qat.com']);
                
                if (adminResult) {
                    await this.run(
                        `INSERT INTO wallets (user_id, balance, total_deposits, created_at)
                         VALUES (?, 1000000, 1000000, ?)`,
                        [adminResult.id, now]
                    );
                    
                    console.log('✅ تم إنشاء حساب المدير برصيد 1,000,000 ريال');
                }
            } else {
                console.log('✅ حساب المدير موجود بالفعل');
            }
            
            // التحقق من وجود أسواق
            const marketsCount = await this.get('SELECT COUNT(*) as count FROM markets');
            
            if (marketsCount.count === 0) {
                console.log('🏪 جاري إضافة بيانات الأسواق...');
                
                const markets = [
                    ['سوق القات المركزي - صنعاء', 'صنعاء - شارع الزبيري', 'أكبر سوق للقات في العاصمة صنعاء', '771234567', 'أحمد محمد'],
                    ['سوق القات الجديد - تعز', 'تعز - منطقة القاهرة', 'سوق حديث للقات في تعز', '772345678', 'محمد علي'],
                    ['سوق الحديدة للقات', 'الحديدة - السوق القديم', 'سوق تقليدي للقات في الحديدة', '773456789', 'يوسف أحمد'],
                    ['سوق إب للقات الطازج', 'إب - وسط المدينة', 'سوق متخصص في القات الطازج', '774567890', 'خالد محمد'],
                    ['سوق ذمار للقات', 'ذمار - السوق الشعبي', 'سوق شعبي للقات في ذمار', '775678901', 'علي حسن'],
                    ['سوق عدن للقات', 'عدن - كريتر', 'سوق القات في عدن', '776789012', 'فاروق سالم'],
                    ['سوق المكلا للقات', 'المكلا - السوق المركزي', 'سوق القات في حضرموت', '777890123', 'سالم أحمد']
                ];
                
                for (const market of markets) {
                    await this.run(
                        `INSERT INTO markets (name, location, description, phone, manager, status, featured, created_at)
                         VALUES (?, ?, ?, ?, ?, 'active', 1, datetime('now'))`,
                        market
                    );
                }
                
                console.log(`✅ تم إضافة ${markets.length} سوق`);
            } else {
                console.log(`✅ يوجد ${marketsCount.count} سوق بالفعل`);
            }
            
            // التحقق من وجود أكواد خصم
            const discountCodesCount = await this.get('SELECT COUNT(*) as count FROM discount_codes');
            
            if (discountCodesCount.count === 0) {
                console.log('🎫 جاري إضافة أكواد الخصم...');
                
                const now = new Date().toISOString();
                const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
                
                const codes = [
                    ['WELCOME10', 'percentage', 10, 50000, 5000, 100, now, futureDate],
                    ['SAVE5000', 'fixed', 5000, 20000, 5000, 50, now, futureDate],
                    ['FIRSTORDER', 'percentage', 15, 30000, 7500, 200, now, futureDate],
                    ['QAT2024', 'percentage', 20, 100000, 20000, 1000, now, futureDate]
                ];
                
                for (const code of codes) {
                    await this.run(
                        `INSERT INTO discount_codes 
                         (code, discount_type, discount_value, min_order, max_discount, usage_limit, valid_from, valid_until, is_active)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                        code
                    );
                }
                
                console.log(`✅ تم إضافة ${codes.length} كود خصم`);
            } else {
                console.log(`✅ يوجد ${discountCodesCount.count} كود خصم بالفعل`);
            }
            
            console.log('✅ تم إكمال إضافة البيانات الأولية');
            
        } catch (error) {
            console.error('❌ خطأ في إضافة البيانات الأولية:', error.message);
            throw error;
        }
    }
    
    // طرق تنفيذ الاستعلامات
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('قاعدة البيانات غير متصلة'));
                return;
            }
            
            this.db.run(sql, params, function(err) {
                if (err) {
                    console.error('❌ خطأ في تنفيذ الاستعلام:', err.message);
                    console.error('📝 الاستعلام:', sql);
                    console.error('🔢 المعاملات:', params);
                    reject(err);
                } else {
                    resolve({ 
                        lastID: this.lastID, 
                        changes: this.changes,
                        sql: sql
                    });
                }
            });
        });
    }
    
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('قاعدة البيانات غير متصلة'));
                return;
            }
            
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    console.error('❌ خطأ في جلب البيانات:', err.message);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }
    
    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('قاعدة البيانات غير متصلة'));
                return;
            }
            
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('❌ خطأ في جلب جميع البيانات:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
    
    // دالة تنفيذ معاملة
    async transaction(callback) {
        await this.run('BEGIN TRANSACTION');
        
        try {
            const result = await callback();
            await this.run('COMMIT');
            return result;
        } catch (error) {
            await this.run('ROLLBACK');
            throw error;
        }
    }
    
    // دالة النسخ الاحتياطي
    async backup() {
        const backupDir = path.join(__dirname, 'backups');
        try {
            await fs.access(backupDir);
        } catch {
            await fs.mkdir(backupDir, { recursive: true });
        }
        
        const backupFile = path.join(backupDir, `backup_${Date.now()}.db`);
        
        return new Promise((resolve, reject) => {
            this.db.backup(backupFile, (err) => {
                if (err) {
                    console.error('❌ خطأ في النسخ الاحتياطي:', err.message);
                    reject(err);
                } else {
                    console.log(`✅ تم إنشاء نسخة احتياطية: ${backupFile}`);
                    resolve(backupFile);
                }
            });
        });
    }
    
    // إغلاق الاتصال
    close() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                resolve();
                return;
            }
            
            this.db.close((err) => {
                if (err) {
                    console.error('❌ خطأ في إغلاق قاعدة البيانات:', err.message);
                    reject(err);
                } else {
                    console.log('✅ تم إغلاق اتصال قاعدة البيانات');
                    this.isConnected = false;
                    resolve();
                }
            });
        });
    }
    
    // دالة فحص صحة الاتصال
    async healthCheck() {
        try {
            const result = await this.get('SELECT 1 as status');
            return result && result.status === 1;
        } catch (error) {
            return false;
        }
    }
}

// إنشاء وإرجاع نسخة واحدة من قاعدة البيانات
const databaseInstance = new Database();

// تهيئة الاتصال تلقائياً
databaseInstance.connect()
    .then(() => databaseInstance.initialize())
    .then(() => {
        console.log('🎉 قاعدة البيانات جاهزة للاستخدام');
    })
    .catch(err => {
        console.error('❌ فشل في تهيئة قاعدة البيانات:', err.message);
        // لا نخرج من العملية، بل نواصل مع قاعدة بيانات مؤقتة
    });

// معالجة إيقاف العملية لتنظيف قاعدة البيانات
process.on('SIGINT', async () => {
    console.log('🛑 إيقاف قاعدة البيانات...');
    await databaseInstance.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🛑 إيقاف قاعدة البيانات...');
    await databaseInstance.close();
    process.exit(0);
});

// تصدير كائن قاعدة البيانات مع الأساليب
module.exports = {
    // الطرق الأساسية
    run: (sql, params) => databaseInstance.run(sql, params),
    get: (sql, params) => databaseInstance.get(sql, params),
    all: (sql, params) => databaseInstance.all(sql, params),
    transaction: (callback) => databaseInstance.transaction(callback),
    
    // طرق مساعدة
    runQuery: databaseInstance.run.bind(databaseInstance),
    getQuery: databaseInstance.get.bind(databaseInstance),
    allQuery: databaseInstance.all.bind(databaseInstance),
    
    // طرق خاصة بالنظام
    backup: () => databaseInstance.backup(),
    close: () => databaseInstance.close(),
    healthCheck: () => databaseInstance.healthCheck(),
    
    // دالة تهيئة لـ npm scripts
    init: async () => {
        await databaseInstance.connect();
        await databaseInstance.initialize();
        await databaseInstance.close();
        console.log('✅ تم تهيئة قاعدة البيانات بنجاح');
    }
};
