const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');

// إنشاء قاعدة البيانات والجداول
class Database {
    constructor() {
        this.db = null;
    }
    
    async connect() {
        return new Promise((resolve, reject) => {
            // التأكد من وجود مجلد data
            fs.mkdir(path.dirname(dbPath), { recursive: true }).catch(() => {});
            
            this.db = new sqlite3.Database(dbPath, (err) => {
                if (err) {
                    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
                    reject(err);
                } else {
                    console.log('✅ تم الاتصال بقاعدة البيانات SQLite');
                    resolve();
                }
            });
        });
    }
    
    async initialize() {
        console.log('🔄 جاري تهيئة قاعدة البيانات...');
        
        await this.run('PRAGMA foreign_keys = ON');
        await this.run('PRAGMA journal_mode = WAL');
        await this.run('PRAGMA synchronous = NORMAL');
        await this.run('PRAGMA cache_size = -2000');
        
        await this.createTables();
        await this.createIndexes();
        await this.seedData();
        
        console.log('✅ تم تهيئة قاعدة البيانات بنجاح');
    }
    
    async createTables() {
        const tables = [
            // المستخدمون
            `
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
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
                seller_id INTEGER NOT NULL,
                market_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                price DECIMAL(15,2) NOT NULL,
                original_price DECIMAL(15,2),
                image TEXT,
                images TEXT, // JSON array of additional images
                category TEXT,
                quantity INTEGER DEFAULT 0,
                min_order INTEGER DEFAULT 1,
                max_order INTEGER DEFAULT 100,
                specifications TEXT, // JSON
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
                buyer_id INTEGER NOT NULL,
                driver_id INTEGER,
                total DECIMAL(15,2) NOT NULL,
                shipping_cost DECIMAL(15,2) DEFAULT 0,
                tax DECIMAL(15,2) DEFAULT 0,
                discount DECIMAL(15,2) DEFAULT 0,
                final_total DECIMAL(15,2) NOT NULL,
                shipping_address TEXT NOT NULL,
                shipping_notes TEXT,
                payment_method TEXT CHECK(payment_method IN ('wallet', 'cash', 'card')) DEFAULT 'cash',
                payment_status TEXT CHECK(payment_status IN ('pending', 'paid', 'failed', 'refunded')) DEFAULT 'pending',
                wash_qat INTEGER DEFAULT 0,
                wash_cost DECIMAL(15,2) DEFAULT 0,
                status TEXT CHECK(status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')) DEFAULT 'pending',
                order_code TEXT UNIQUE NOT NULL,
                tracking_code TEXT,
                estimated_delivery DATETIME,
                delivered_at DATETIME,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
            )
            `,
            
            // عناصر الطلب
            `
            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
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
                user_id INTEGER NOT NULL,
                order_id INTEGER NOT NULL,
                product_id INTEGER,
                seller_id INTEGER,
                driver_id INTEGER,
                rating INTEGER CHECK(rating >= 1 AND rating <= 5) NOT NULL,
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
                FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
            )
            `,
            
            // المعاملات
            `
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                amount DECIMAL(15,2) NOT NULL,
                type TEXT CHECK(type IN ('deposit', 'withdrawal', 'purchase', 'refund', 'commission', 'bonus')) NOT NULL,
                method TEXT,
                transaction_id TEXT UNIQUE,
                wallet_type TEXT,
                reference TEXT,
                status TEXT CHECK(status IN ('pending', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',
                notes TEXT,
                metadata TEXT, // JSON
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            `,
            
            // الإشعارات
            `
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                type TEXT CHECK(type IN ('info', 'success', 'warning', 'error')) DEFAULT 'info',
                is_read BOOLEAN DEFAULT 0,
                action_url TEXT,
                metadata TEXT, // JSON
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            `,
            
            // أكواد الخصم
            `
            CREATE TABLE IF NOT EXISTS discount_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                discount_type TEXT CHECK(discount_type IN ('percentage', 'fixed')) NOT NULL,
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
            `
        ];
        
        for (const sql of tables) {
            await this.run(sql);
        }
    }
    
    async createIndexes() {
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
            'CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)',
            'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)',
            'CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id)',
            'CREATE INDEX IF NOT EXISTS idx_products_market ON products(market_id)',
            'CREATE INDEX IF NOT EXISTS idx_products_status ON products(status)',
            'CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id)',
            'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)',
            'CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(order_code)',
            'CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)',
            'CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id)',
            'CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read)',
            'CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id)',
            'CREATE INDEX IF NOT EXISTS idx_reviews_seller ON reviews(seller_id)'
        ];
        
        for (const sql of indexes) {
            await this.run(sql);
        }
    }
    
    async seedData() {
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
        }
        
        // إضافة بيانات تجريبية للأسواق
        const marketsCount = await this.get('SELECT COUNT(*) as count FROM markets');
        
        if (marketsCount.count === 0) {
            console.log('🏪 جاري إضافة بيانات الأسواق التجريبية...');
            
            const markets = [
                ['سوق القات المركزي - صنعاء', 'صنعاء - شارع الزبيري', 'أكبر سوق للقات في العاصمة صنعاء', '771234567', 'أحمد محمد'],
                ['سوق القات الجديد - تعز', 'تعز - منطقة القاهرة', 'سوق حديث للقات في تعز', '772345678', 'محمد علي'],
                ['سوق الحديدة للقات', 'الحديدة - السوق القديم', 'سوق تقليدي للقات في الحديدة', '773456789', 'يوسف أحمد'],
                ['سوق إب للقات الطازج', 'إب - وسط المدينة', 'سوق متخصص في القات الطازج', '774567890', 'خالد محمد'],
                ['سوق ذمار للقات', 'ذمار - السوق الشعبي', 'سوق شعبي للقات في ذمار', '775678901', 'علي حسن']
            ];
            
            for (const market of markets) {
                await this.run(
                    `INSERT INTO markets (name, location, description, phone, manager, status, featured, created_at)
                     VALUES (?, ?, ?, ?, ?, 'active', 1, ?)`,
                    [...market, new Date().toISOString()]
                );
            }
            
            console.log(`✅ تم إضافة ${markets.length} سوق`);
        }
        
        // إضافة أكواد خصم تجريبية
        const discountCodesCount = await this.get('SELECT COUNT(*) as count FROM discount_codes');
        
        if (discountCodesCount.count === 0) {
            console.log('🎫 جاري إضافة أكواد الخصم التجريبية...');
            
            const codes = [
                ['WELCOME10', 'percentage', 10, 50000, 5000, 100, new Date(), new Date(Date.now() + 30*24*60*60*1000)],
                ['SAVE5000', 'fixed', 5000, 20000, 5000, 50, new Date(), new Date(Date.now() + 60*24*60*60*1000)],
                ['FIRSTORDER', 'percentage', 15, 30000, 7500, 200, new Date(), new Date(Date.now() + 90*24*60*60*1000)]
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
        }
    }
    
    // طرق تنفيذ الاستعلامات مع تحسين الأداء
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    console.error('❌ خطأ في تنفيذ الاستعلام:', err.message);
                    console.error('📝 الاستعلام:', sql);
                    console.error('🔢 المعاملات:', params);
                    reject(err);
                } else {
                    resolve({ lastID: this.lastID, changes: this.changes });
                }
            });
        });
    }
    
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
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
        const backupPath = path.join(__dirname, 'backups', `backup_${Date.now()}.db`);
        
        return new Promise((resolve, reject) => {
            this.db.backup(backupPath, (err) => {
                if (err) {
                    console.error('❌ خطأ في النسخ الاحتياطي:', err.message);
                    reject(err);
                } else {
                    console.log(`✅ تم إنشاء نسخة احتياطية: ${backupPath}`);
                    resolve(backupPath);
                }
            });
        });
    }
    
    // إغلاق الاتصال
    close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    console.error('❌ خطأ في إغلاق قاعدة البيانات:', err.message);
                    reject(err);
                } else {
                    console.log('✅ تم إغلاق اتصال قاعدة البيانات');
                    resolve();
                }
            });
        });
    }
}

// إنشاء ونفذ نسخة واحدة من قاعدة البيانات
const database = new Database();

// تهيئة الاتصال
database.connect()
    .then(() => database.initialize())
    .catch(err => {
        console.error('❌ فشل في تهيئة قاعدة البيانات:', err.message);
        process.exit(1);
    });

// تصدير كائن قاعدة البيانات مع الأساليب
module.exports = {
    // الطرق الأساسية
    run: (sql, params) => database.run(sql, params),
    get: (sql, params) => database.get(sql, params),
    all: (sql, params) => database.all(sql, params),
    transaction: (callback) => database.transaction(callback),
    
    // طرق مساعدة
    runQuery: database.run.bind(database),
    getQuery: database.get.bind(database),
    allQuery: database.all.bind(database),
    
    // طرق خاصة بالنظام
    backup: () => database.backup(),
    close: () => database.close(),
    
    // دالة تهيئة لـ npm scripts
    init: async () => {
        await database.connect();
        await database.initialize();
        await database.close();
    }
};
