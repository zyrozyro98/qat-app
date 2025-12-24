const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcryptjs');
const logger = require('../config/logger');

const initializeDatabase = async () => {
    const dataDir = path.join(__dirname, '../data');
    const dbPath = path.join(dataDir, 'database.sqlite');
    
    try {
        await fs.mkdir(dataDir, { recursive: true });
        
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                logger.error(`❌ خطأ في فتح قاعدة البيانات: ${err.message}`);
                throw err;
            }
            logger.info(`✅ تم فتح قاعدة البيانات بنجاح: ${dbPath}`);
        });
        
        // تعريف دوال تنفيذ الاستعلامات
        db.runQuery = function(sql, params = []) {
            return new Promise((resolve, reject) => {
                this.run(sql, params, function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ lastID: this.lastID, changes: this.changes });
                    }
                });
            });
        };

        db.getQuery = function(sql, params = []) {
            return new Promise((resolve, reject) => {
                this.get(sql, params, (err, row) => {
                    if (err) {
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
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });
            });
        };

        await createTables(db);
        
        return db;
    } catch (error) {
        logger.error(`❌ خطأ في تهيئة قاعدة البيانات: ${error.message}`);
        throw error;
    }
};

const createTables = async (db) => {
    const tables = [
        `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin', 'buyer', 'seller', 'driver')),
            avatar TEXT,
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended')),
            last_login DATETIME,
            created_at DATETIME NOT NULL,
            updated_at DATETIME
        )`,

        `CREATE TABLE IF NOT EXISTS wallets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            balance REAL DEFAULT 0,
            created_at DATETIME NOT NULL,
            updated_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS sellers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            store_name TEXT NOT NULL,
            rating REAL DEFAULT 0,
            total_sales INTEGER DEFAULT 0,
            created_at DATETIME NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS drivers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            market_id INTEGER,
            vehicle_type TEXT,
            rating REAL DEFAULT 0,
            status TEXT DEFAULT 'available' CHECK(status IN ('available', 'busy', 'offline')),
            current_location TEXT,
            created_at DATETIME NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE SET NULL
        )`,

        `CREATE TABLE IF NOT EXISTS markets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            location TEXT,
            image TEXT,
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
            created_at DATETIME NOT NULL
        )`,

        `CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            seller_id INTEGER NOT NULL,
            market_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL,
            image TEXT,
            category TEXT NOT NULL,
            quantity INTEGER DEFAULT 0,
            specifications TEXT,
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'out_of_stock', 'inactive')),
            created_at DATETIME NOT NULL,
            updated_at DATETIME,
            FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            buyer_id INTEGER NOT NULL,
            driver_id INTEGER,
            total REAL NOT NULL,
            shipping_address TEXT NOT NULL,
            payment_method TEXT NOT NULL CHECK(payment_method IN ('wallet', 'cash')),
            wash_qat INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'preparing', 'shipping', 'delivered', 'cancelled')),
            order_code TEXT UNIQUE NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME,
            FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
        )`,

        `CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            seller_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            unit_price REAL NOT NULL,
            total_price REAL NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('deposit', 'withdrawal', 'purchase', 'refund')),
            method TEXT,
            wallet_type TEXT,
            transaction_id TEXT UNIQUE,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed', 'cancelled')),
            created_at DATETIME NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT DEFAULT 'info' CHECK(type IN ('info', 'success', 'warning', 'error')),
            is_read INTEGER DEFAULT 0,
            created_at DATETIME NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
            comment TEXT,
            created_at DATETIME NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )`
    ];

    try {
        for (const tableSQL of tables) {
            await db.runQuery(tableSQL);
        }
        logger.info('✅ تم إنشاء/التحقق من جميع الجداول بنجاح');
        
        // إضافة مستخدم مسؤول افتراضي
        const adminExists = await db.getQuery("SELECT id FROM users WHERE email = 'admin@qat.com'");
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('admin123', 12);
            await db.runQuery(
                `INSERT INTO users (name, email, phone, password, role, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                ['المسؤول', 'admin@qat.com', '777777777', hashedPassword, 'admin', new Date().toISOString()]
            );
            logger.info('✅ تم إنشاء المستخدم المسؤول الافتراضي');
        }
        
        // إضافة سوق افتراضي
        const marketExists = await db.getQuery("SELECT id FROM markets LIMIT 1");
        if (!marketExists) {
            await db.runQuery(
                `INSERT INTO markets (name, description, location, created_at) 
                 VALUES (?, ?, ?, ?)`,
                ['سوق صنعاء المركزي', 'أكبر سوق للقات في صنعاء', 'صنعاء، اليمن', new Date().toISOString()]
            );
            logger.info('✅ تم إنشاء سوق افتراضي');
        }
    } catch (error) {
        logger.error(`❌ خطأ في إنشاء الجداول: ${error.message}`);
        throw error;
    }
};

module.exports = { initializeDatabase };
