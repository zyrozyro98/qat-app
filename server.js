// server.js - تطبيق قات PRO - النسخة النهائية المصححة لـ Render
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs'); // للدوال المتزامنة
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { Server } = require('socket.io');
const http = require('http');
const nodemailer = require('nodemailer');
const winston = require('winston');
const morgan = require('morgan');
const xlsx = require('xlsx');
const PDFDocument = require('pdfkit');
const qr = require('qr-image');
const cryptoJS = require('crypto-js');
const moment = require('moment');
require('moment-hijri');

// بدائل لـ better-sqlite3
const sqlite3 = require('sqlite3').verbose();

// تهيئة التطبيق
const app = express();
const server = http.createServer(app);

// 🔧 إعدادات PRO
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const VERSION = '2.0.0-PRO';

// 🔧 إعدادات الأمان المتقدمة
app.set('trust proxy', 1);
app.set('x-powered-by', false);

// 📊 إعداد التسجيل (Logging)
const logger = winston.createLogger({
    level: IS_PRODUCTION ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
    ),
    defaultMeta: { service: 'qat-app-pro' },
    transports: [
        new winston.transports.File({ 
            filename: 'logs/error.log', 
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        new winston.transports.File({ 
            filename: 'logs/combined.log',
            maxsize: 5242880,
            maxFiles: 5
        }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// 📊 Morgan مع Winston
app.use(morgan('combined', { 
    stream: { write: (message) => logger.info(message.trim()) }
}));

// 🔐 الإعدادات الأمنية المتقدمة
app.use(helmet({
    contentSecurityPolicy: false, // تبسيط لـ Render
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// 🔧 Middleware الأساسية
app.use(compression());

app.use(cors({
    origin: true, // السماح لجميع المصادر في Render
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ⚡ Rate Limiting المبسط
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100, // 100 طلب لكل IP
    message: {
        error: 'لقد تجاوزت الحد المسموح به من الطلبات',
        retryAfter: '15 دقيقة'
    }
});

app.use('/api/', apiLimiter);

// 📦 Middleware للبيانات
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 📁 الملفات الثابتة
app.use(express.static(path.join(__dirname, 'public')));

// 🔐 إعدادات الجلسات المتقدمة
const sessionConfig = {
    name: 'qat_pro_session',
    secret: process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: IS_PRODUCTION,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 ساعة
    }
};

app.use(session(sessionConfig));

// 📊 قاعدة البيانات - استخدام SQLite3 العادي
let db;
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        const dbPath = path.join(__dirname, 'data', 'database.sqlite');
        
        // إنشاء مجلد data إذا لم يكن موجوداً - استخدم fsSync بدلاً من fs.existsSync
        const dataDir = path.join(__dirname, 'data');
        if (!fsSync.existsSync(dataDir)) {
            fsSync.mkdirSync(dataDir, { recursive: true });
        }
        
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                logger.error(`❌ خطأ في فتح قاعدة البيانات: ${err.message}`);
                reject(err);
                return;
            }
            
            logger.info('✅ تم الاتصال بقاعدة البيانات');
            
            // إنشاء الجداول
            const createTables = `
                -- جدول المستخدمين
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    phone TEXT NOT NULL,
                    password TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('buyer', 'seller', 'driver', 'admin')),
                    avatar TEXT,
                    status TEXT DEFAULT 'active',
                    store_name TEXT,
                    vehicle_type TEXT,
                    rating REAL DEFAULT 0,
                    total_sales REAL DEFAULT 0,
                    last_login TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                );

                -- جدول الأسواق
                CREATE TABLE IF NOT EXISTS markets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    location TEXT NOT NULL,
                    status TEXT DEFAULT 'active',
                    image TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );

                -- جدول المنتجات
                CREATE TABLE IF NOT EXISTS products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    seller_id INTEGER NOT NULL,
                    market_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT,
                    price REAL NOT NULL,
                    image TEXT,
                    category TEXT NOT NULL,
                    quantity INTEGER NOT NULL DEFAULT 0,
                    specifications TEXT,
                    rating REAL DEFAULT 0,
                    status TEXT DEFAULT 'active',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (seller_id) REFERENCES users(id),
                    FOREIGN KEY (market_id) REFERENCES markets(id)
                );

                -- جدول المحفظة
                CREATE TABLE IF NOT EXISTS wallets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER UNIQUE NOT NULL,
                    balance REAL DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );

                -- جدول الطلبات
                CREATE TABLE IF NOT EXISTS orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    buyer_id INTEGER NOT NULL,
                    total REAL NOT NULL,
                    shipping_address TEXT NOT NULL,
                    payment_method TEXT NOT NULL CHECK(payment_method IN ('wallet', 'cash')),
                    status TEXT DEFAULT 'pending',
                    order_code TEXT UNIQUE NOT NULL,
                    driver_id INTEGER,
                    notes TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (buyer_id) REFERENCES users(id)
                );

                -- جدول عناصر الطلب
                CREATE TABLE IF NOT EXISTS order_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id INTEGER NOT NULL,
                    product_id INTEGER NOT NULL,
                    seller_id INTEGER NOT NULL,
                    quantity INTEGER NOT NULL,
                    unit_price REAL NOT NULL,
                    total_price REAL NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (order_id) REFERENCES orders(id),
                    FOREIGN KEY (product_id) REFERENCES products(id),
                    FOREIGN KEY (seller_id) REFERENCES users(id)
                );

                -- جدول المعاملات
                CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    amount REAL NOT NULL,
                    type TEXT NOT NULL CHECK(type IN ('deposit', 'withdrawal', 'purchase')),
                    method TEXT,
                    status TEXT DEFAULT 'pending',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );

                -- جدول الإشعارات
                CREATE TABLE IF NOT EXISTS notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    message TEXT NOT NULL,
                    type TEXT DEFAULT 'info',
                    is_read INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );

                -- جدول مندوبي التوصيل
                CREATE TABLE IF NOT EXISTS drivers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER UNIQUE NOT NULL,
                    vehicle_type TEXT NOT NULL,
                    status TEXT DEFAULT 'available',
                    rating REAL DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
            `;
            
            db.exec(createTables, (err) => {
                if (err) {
                    logger.error(`❌ خطأ في إنشاء الجداول: ${err.message}`);
                    reject(err);
                    return;
                }
                
                logger.info('✅ تم إنشاء جداول قاعدة البيانات');
                
                // إضافة بيانات تجريبية
                addSampleData().then(resolve).catch(reject);
            });
        });
    });
}

// إضافة بيانات تجريبية
async function addSampleData() {
    return new Promise((resolve, reject) => {
        // التحقق من وجود المستخدمين
        db.get("SELECT COUNT(*) as count FROM users", [], (err, row) => {
            if (err) {
                logger.error(`❌ خطأ في جلب عدد المستخدمين: ${err.message}`);
                reject(err);
                return;
            }
            
            if (row.count === 0) {
                // إنشاء مستخدم admin
                const adminPassword = bcrypt.hashSync('admin123', 10);
                const buyerPassword = bcrypt.hashSync('buyer123', 10);
                const sellerPassword = bcrypt.hashSync('seller123', 10);
                const driverPassword = bcrypt.hashSync('driver123', 10);
                
                const insertUsers = `
                    INSERT INTO users (name, email, phone, password, role, status) VALUES
                    ('مدير النظام', 'admin@qatpro.com', '771234567', '${adminPassword}', 'admin', 'active'),
                    ('مشتري تجريبي', 'buyer@qatpro.com', '771234568', '${buyerPassword}', 'buyer', 'active'),
                    ('بائع تجريبي', 'seller@qatpro.com', '771234569', '${sellerPassword}', 'seller', 'active'),
                    ('مندوب تجريبي', 'driver@qatpro.com', '771234570', '${driverPassword}', 'driver', 'active');
                    
                    INSERT INTO markets (name, description, location, status) VALUES
                    ('سوق القات الرئيسي', 'أكبر سوق للقات في المدينة', 'صنعاء - شارع الزبيري', 'active'),
                    ('سوق الحديدة', 'سوق القات في الحديدة', 'الحديدة - السوق المركزي', 'active');
                    
                    INSERT INTO wallets (user_id, balance) 
                    SELECT id, 100000 FROM users;
                    
                    INSERT INTO drivers (user_id, vehicle_type) 
                    SELECT id, 'دراجة نارية' FROM users WHERE role = 'driver';
                `;
                
                db.exec(insertUsers, (err) => {
                    if (err) {
                        logger.error(`❌ خطأ في إضافة البيانات التجريبية: ${err.message}`);
                        reject(err);
                        return;
                    }
                    
                    logger.info('✅ تم إضافة البيانات التجريبية');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    });
}

// 🔌 WebSocket المبسط
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// 📁 نظام التحميل المبسط
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
    }
});

// 🔧 دوال مساعدة
const helpers = {
    generateOrderCode() {
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.random().toString(36).substr(2, 4).toUpperCase();
        return `QAT${timestamp}${random}`;
    },
    
    generateTransactionId() {
        return `TXN${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    },
    
    async hashPassword(password) {
        return bcrypt.hash(password, 10);
    },
    
    async verifyPassword(password, hash) {
        return bcrypt.compare(password, hash);
    },
    
    formatCurrency(amount) {
        return new Intl.NumberFormat('ar-YE', {
            style: 'currency',
            currency: 'YER',
            minimumFractionDigits: 0
        }).format(amount);
    }
};

// 🔐 نظام الصلاحيات
const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ 
            success: false, 
            error: 'يجب تسجيل الدخول للوصول إلى هذا المورد' 
        });
    }
    next();
};

const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.session.userId || !req.session.role || !roles.includes(req.session.role)) {
            return res.status(403).json({ 
                success: false, 
                error: 'صلاحية مرفوضة' 
            });
        }
        next();
    };
};

// ============ API Routes ============

// 📊 الصحة والمراقبة
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        data: {
            status: 'healthy',
            version: VERSION,
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development'
        }
    });
});

// 👤 المستخدمون والمصادقة
app.post('/api/register', [
    body('name').trim().notEmpty(),
    body('email').trim().isEmail(),
    body('phone').trim().matches(/^[0-9]{9,15}$/),
    body('password').isLength({ min: 6 }),
    body('role').isIn(['buyer', 'seller', 'driver'])
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    const { name, email, phone, password, role } = req.body;
    
    try {
        // التحقق من وجود المستخدم
        db.get("SELECT id FROM users WHERE email = ? OR phone = ?", [email, phone], async (err, row) => {
            if (err) {
                logger.error(`❌ خطأ في قاعدة البيانات: ${err.message}`);
                return res.status(500).json({ success: false, error: 'خطأ في الخادم' });
            }
            
            if (row) {
                return res.status(400).json({ success: false, error: 'المستخدم موجود بالفعل' });
            }
            
            const hashedPassword = await helpers.hashPassword(password);
            const createdAt = new Date().toISOString();
            
            db.run(
                `INSERT INTO users (name, email, phone, password, role, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [name, email, phone, hashedPassword, role, createdAt, createdAt],
                function(err) {
                    if (err) {
                        logger.error(`❌ خطأ في التسجيل: ${err.message}`);
                        return res.status(500).json({ success: false, error: 'خطأ في التسجيل' });
                    }
                    
                    const userId = this.lastID;
                    
                    // إنشاء المحفظة
                    db.run(
                        "INSERT INTO wallets (user_id, balance, created_at, updated_at) VALUES (?, 0, ?, ?)",
                        [userId, createdAt, createdAt]
                    );
                    
                    // إنشاء مندوب إذا كان دور مندوب
                    if (role === 'driver') {
                        db.run(
                            "INSERT INTO drivers (user_id, vehicle_type, created_at) VALUES (?, ?, ?)",
                            [userId, 'دراجة نارية', createdAt]
                        );
                    }
                    
                    req.session.userId = userId;
                    req.session.role = role;
                    req.session.userEmail = email;
                    
                    res.json({
                        success: true,
                        message: 'تم إنشاء الحساب بنجاح',
                        user: { id: userId, name, email, phone, role }
                    });
                }
            );
        });
    } catch (error) {
        logger.error(`❌ خطأ في التسجيل: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

app.post('/api/login', [
    body('email').trim().isEmail(),
    body('password').notEmpty()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    const { email, password } = req.body;
    
    try {
        db.get(
            "SELECT * FROM users WHERE email = ? AND status = 'active'",
            [email],
            async (err, user) => {
                if (err) {
                    logger.error(`❌ خطأ في قاعدة البيانات: ${err.message}`);
                    return res.status(500).json({ success: false, error: 'خطأ في الخادم' });
                }
                
                if (!user) {
                    return res.status(401).json({ success: false, error: 'بيانات الدخول غير صحيحة' });
                }
                
                const validPassword = await helpers.verifyPassword(password, user.password);
                if (!validPassword) {
                    return res.status(401).json({ success: false, error: 'بيانات الدخول غير صحيحة' });
                }
                
                req.session.userId = user.id;
                req.session.role = user.role;
                req.session.userEmail = user.email;
                
                // تحديث آخر دخول
                db.run(
                    "UPDATE users SET last_login = ? WHERE id = ?",
                    [new Date().toISOString(), user.id]
                );
                
                // جلب المحفظة
                db.get(
                    "SELECT balance FROM wallets WHERE user_id = ?",
                    [user.id],
                    (err, wallet) => {
                        if (err) {
                            logger.error(`❌ خطأ في جلب المحفظة: ${err.message}`);
                        }
                        
                        res.json({
                            success: true,
                            message: 'تم تسجيل الدخول بنجاح',
                            user: {
                                id: user.id,
                                name: user.name,
                                email: user.email,
                                phone: user.phone,
                                role: user.role,
                                avatar: user.avatar,
                                balance: wallet ? wallet.balance : 0
                            }
                        });
                    }
                );
            }
        );
    } catch (error) {
        logger.error(`❌ خطأ في تسجيل الدخول: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

app.post('/api/logout', requireAuth, (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'خطأ في تسجيل الخروج' });
        }
        
        res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
    });
});

app.get('/api/auth/check', (req, res) => {
    if (req.session.userId) {
        db.get(
            "SELECT id, name, email, phone, role, avatar FROM users WHERE id = ?",
            [req.session.userId],
            (err, user) => {
                if (err || !user) {
                    return res.json({ isAuthenticated: false });
                }
                res.json({ isAuthenticated: true, user });
            }
        );
    } else {
        res.json({ isAuthenticated: false });
    }
});

// 🏪 الأسواق
app.get('/api/markets', (req, res) => {
    db.all(
        `SELECT m.*, 
                COUNT(DISTINCT p.id) as product_count
         FROM markets m
         LEFT JOIN products p ON m.id = p.market_id AND p.status = 'active'
         WHERE m.status = 'active'
         GROUP BY m.id
         ORDER BY m.name`,
        [],
        (err, markets) => {
            if (err) {
                logger.error(`❌ خطأ في جلب الأسواق: ${err.message}`);
                return res.status(500).json({ success: false, error: 'خطأ في الخادم' });
            }
            
            res.json({ success: true, data: markets });
        }
    );
});

// 🛒 المنتجات
app.get('/api/products', (req, res) => {
    const { category, market_id, search, page = 1, limit = 20 } = req.query;
    
    let whereConditions = ["p.status = 'active'"];
    const params = [];
    
    if (category) {
        whereConditions.push('p.category = ?');
        params.push(category);
    }
    
    if (market_id) {
        whereConditions.push('p.market_id = ?');
        params.push(market_id);
    }
    
    if (search) {
        whereConditions.push('(p.name LIKE ? OR p.description LIKE ?)');
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm);
    }
    
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    const offset = (page - 1) * limit;
    
    const query = `
        SELECT p.*, u.name as seller_name, u.avatar as seller_avatar,
               m.name as market_name
        FROM products p
        LEFT JOIN users u ON p.seller_id = u.id
        LEFT JOIN markets m ON p.market_id = m.id
        ${whereClause}
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?
    `;
    
    db.all(query, [...params, parseInt(limit), offset], (err, products) => {
        if (err) {
            logger.error(`❌ خطأ في جلب المنتجات: ${err.message}`);
            return res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
        
        // جلب العدد الكلي
        const countQuery = `SELECT COUNT(*) as total FROM products p ${whereClause}`;
        db.get(countQuery, params, (err, countResult) => {
            if (err) {
                res.json({ success: true, data: products });
                return;
            }
            
            res.json({
                success: true,
                data: products,
                meta: {
                    total: countResult.total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(countResult.total / limit)
                }
            });
        });
    });
});

app.get('/api/products/:id', (req, res) => {
    const productId = req.params.id;
    
    db.get(
        `SELECT p.*, u.name as seller_name, u.avatar as seller_avatar,
                u.phone as seller_phone, m.name as market_name
         FROM products p
         LEFT JOIN users u ON p.seller_id = u.id
         LEFT JOIN markets m ON p.market_id = m.id
         WHERE p.id = ? AND p.status = 'active'`,
        [productId],
        (err, product) => {
            if (err) {
                logger.error(`❌ خطأ في جلب المنتج: ${err.message}`);
                return res.status(500).json({ success: false, error: 'خطأ في الخادم' });
            }
            
            if (!product) {
                return res.status(404).json({ success: false, error: 'المنتج غير موجود' });
            }
            
            res.json({ success: true, data: product });
        }
    );
});

// 💰 المحفظة
app.get('/api/wallet', requireAuth, (req, res) => {
    db.get(
        `SELECT w.*, u.name as user_name
         FROM wallets w
         LEFT JOIN users u ON w.user_id = u.id
         WHERE w.user_id = ?`,
        [req.session.userId],
        (err, wallet) => {
            if (err) {
                logger.error(`❌ خطأ في جلب المحفظة: ${err.message}`);
                return res.status(500).json({ success: false, error: 'خطأ في الخادم' });
            }
            
            if (!wallet) {
                // إنشاء محفظة جديدة
                db.run(
                    "INSERT INTO wallets (user_id, balance, created_at, updated_at) VALUES (?, 0, ?, ?)",
                    [req.session.userId, new Date().toISOString(), new Date().toISOString()],
                    function(err) {
                        if (err) {
                            return res.status(500).json({ success: false, error: 'خطأ في إنشاء المحفظة' });
                        }
                        
                        res.json({
                            success: true,
                            data: {
                                id: this.lastID,
                                user_id: req.session.userId,
                                balance: 0,
                                created_at: new Date().toISOString()
                            }
                        });
                    }
                );
                return;
            }
            
            // جلب المعاملات
            db.all(
                "SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10",
                [req.session.userId],
                (err, transactions) => {
                    if (err) {
                        res.json({ success: true, data: { ...wallet, transactions: [] } });
                        return;
                    }
                    
                    res.json({ success: true, data: { ...wallet, transactions } });
                }
            );
        }
    );
});

app.post('/api/wallet/topup', requireAuth, [
    body('amount').isFloat({ min: 1000 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    const { amount } = req.body;
    
    try {
        const transactionId = helpers.generateTransactionId();
        
        // إضافة المعاملة
        db.run(
            `INSERT INTO transactions (user_id, amount, type, method, status, created_at)
             VALUES (?, ?, 'deposit', 'manual', 'completed', ?)`,
            [req.session.userId, amount, new Date().toISOString()],
            function(err) {
                if (err) {
                    logger.error(`❌ خطأ في شحن الرصيد: ${err.message}`);
                    return res.status(500).json({ success: false, error: 'خطأ في شحن الرصيد' });
                }
                
                // تحديث رصيد المحفظة
                db.run(
                    "UPDATE wallets SET balance = balance + ?, updated_at = ? WHERE user_id = ?",
                    [amount, new Date().toISOString(), req.session.userId],
                    (err) => {
                        if (err) {
                            logger.error(`❌ خطأ في تحديث الرصيد: ${err.message}`);
                            return res.status(500).json({ success: false, error: 'خطأ في تحديث الرصيد' });
                        }
                        
                        // جلب الرصيد الجديد
                        db.get(
                            "SELECT balance FROM wallets WHERE user_id = ?",
                            [req.session.userId],
                            (err, wallet) => {
                                if (err) {
                                    res.json({
                                        success: true,
                                        message: 'تم شحن الرصيد بنجاح',
                                        data: {
                                            transaction_id: transactionId,
                                            amount,
                                            new_balance: 'غير متاح'
                                        }
                                    });
                                    return;
                                }
                                
                                res.json({
                                    success: true,
                                    message: 'تم شحن الرصيد بنجاح',
                                    data: {
                                        transaction_id: transactionId,
                                        amount,
                                        new_balance: wallet.balance
                                    }
                                });
                            }
                        );
                    }
                );
            }
        );
    } catch (error) {
        logger.error(`❌ خطأ في شحن الرصيد: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// 🛍️ الطلبات
app.get('/api/orders', requireAuth, (req, res) => {
    const { status, page = 1, limit = 10 } = req.query;
    
    let whereConditions = ['o.buyer_id = ?'];
    const params = [req.session.userId];
    
    if (status) {
        whereConditions.push('o.status = ?');
        params.push(status);
    }
    
    const whereClause = 'WHERE ' + whereConditions.join(' AND ');
    const offset = (page - 1) * limit;
    
    const query = `
        SELECT o.*, u.name as buyer_name, u.phone as buyer_phone,
               COUNT(oi.id) as item_count,
               SUM(oi.total_price) as items_total
        FROM orders o
        LEFT JOIN users u ON o.buyer_id = u.id
        LEFT JOIN order_items oi ON o.id = oi.order_id
        ${whereClause}
        GROUP BY o.id 
        ORDER BY o.created_at DESC
        LIMIT ? OFFSET ?
    `;
    
    db.all(query, [...params, parseInt(limit), offset], (err, orders) => {
        if (err) {
            logger.error(`❌ خطأ في جلب الطلبات: ${err.message}`);
            return res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
        
        // جلب العناصر لكل طلب
        const getOrderItems = (orderId) => {
            return new Promise((resolve) => {
                db.all(
                    `SELECT oi.*, p.name as product_name, p.image as product_image,
                            u.name as seller_name
                     FROM order_items oi
                     LEFT JOIN products p ON oi.product_id = p.id
                     LEFT JOIN users u ON oi.seller_id = u.id
                     WHERE oi.order_id = ?`,
                    [orderId],
                    (err, items) => {
                        resolve(items || []);
                    }
                );
            });
        };
        
        Promise.all(orders.map(async (order) => {
            order.items = await getOrderItems(order.id);
            return order;
        })).then((ordersWithItems) => {
            res.json({ success: true, data: ordersWithItems });
        });
    });
});

app.post('/api/orders', requireAuth, requireRole('buyer'), [
    body('items').isArray({ min: 1 }),
    body('shipping_address').trim().notEmpty(),
    body('payment_method').isIn(['wallet', 'cash'])
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    const { items, shipping_address, payment_method } = req.body;
    
    try {
        let totalAmount = 0;
        const orderItems = [];
        
        // التحقق من المنتجات
        for (const item of items) {
            db.get(
                "SELECT * FROM products WHERE id = ? AND status = 'active'",
                [item.product_id],
                (err, product) => {
                    if (err) {
                        return res.status(500).json({ success: false, error: 'خطأ في التحقق من المنتجات' });
                    }
                    
                    if (!product) {
                        return res.status(400).json({ success: false, error: 'المنتج غير موجود' });
                    }
                    
                    if (product.quantity < item.quantity) {
                        return res.status(400).json({ success: false, error: 'الكمية غير متوفرة' });
                    }
                    
                    const itemTotal = product.price * item.quantity;
                    totalAmount += itemTotal;
                    
                    orderItems.push({
                        product_id: product.id,
                        seller_id: product.seller_id,
                        quantity: item.quantity,
                        unit_price: product.price,
                        total_price: itemTotal,
                        product_name: product.name
                    });
                }
            );
        }
        
        // التحقق من الرصيد إذا كانت الدفع بالمحفظة
        if (payment_method === 'wallet') {
            db.get(
                "SELECT balance FROM wallets WHERE user_id = ?",
                [req.session.userId],
                (err, wallet) => {
                    if (err || !wallet || wallet.balance < totalAmount) {
                        return res.status(400).json({ success: false, error: 'رصيد المحفظة غير كافي' });
                    }
                }
            );
        }
        
        // إنشاء الطلب
        const orderCode = helpers.generateOrderCode();
        const orderData = {
            buyer_id: req.session.userId,
            total: totalAmount,
            shipping_address,
            payment_method,
            status: payment_method === 'wallet' ? 'paid' : 'pending',
            order_code: orderCode,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        db.run(
            `INSERT INTO orders (buyer_id, total, shipping_address, payment_method, status, order_code, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            Object.values(orderData),
            function(err) {
                if (err) {
                    logger.error(`❌ خطأ في إنشاء الطلب: ${err.message}`);
                    return res.status(500).json({ success: false, error: 'خطأ في إنشاء الطلب' });
                }
                
                const orderId = this.lastID;
                
                // إضافة عناصر الطلب وتحديث الكميات
                orderItems.forEach(item => {
                    db.run(
                        `INSERT INTO order_items (order_id, product_id, seller_id, quantity, unit_price, total_price)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [orderId, item.product_id, item.seller_id, item.quantity, item.unit_price, item.total_price]
                    );
                    
                    db.run(
                        "UPDATE products SET quantity = quantity - ? WHERE id = ?",
                        [item.quantity, item.product_id]
                    );
                });
                
                // خصم المبلغ إذا كانت الدفع بالمحفظة
                if (payment_method === 'wallet') {
                    db.run(
                        "UPDATE wallets SET balance = balance - ?, updated_at = ? WHERE user_id = ?",
                        [totalAmount, new Date().toISOString(), req.session.userId]
                    );
                    
                    db.run(
                        `INSERT INTO transactions (user_id, amount, type, method, status, created_at)
                         VALUES (?, ?, 'purchase', 'wallet', 'completed', ?)`,
                        [req.session.userId, totalAmount * -1, new Date().toISOString()]
                    );
                }
                
                res.json({
                    success: true,
                    message: 'تم إنشاء الطلب بنجاح',
                    data: {
                        order_id: orderId,
                        order_code: orderCode,
                        total: totalAmount,
                        status: orderData.status
                    }
                });
            }
        );
    } catch (error) {
        logger.error(`❌ خطأ في إنشاء الطلب: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// 🔧 الملف الشخصي
app.get('/api/profile', requireAuth, (req, res) => {
    db.get(
        `SELECT u.*, w.balance
         FROM users u
         LEFT JOIN wallets w ON u.id = w.user_id
         WHERE u.id = ?`,
        [req.session.userId],
        (err, user) => {
            if (err || !user) {
                return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
            }
            
            res.json({ success: true, data: user });
        }
    );
});

// 📊 إحصائيات
app.get('/api/stats', requireAuth, (req, res) => {
    const userRole = req.session.role;
    
    let statsQuery = '';
    let params = [];
    
    if (userRole === 'buyer') {
        statsQuery = `
            SELECT 
                (SELECT COUNT(*) FROM orders WHERE buyer_id = ?) as total_orders,
                (SELECT COUNT(*) FROM orders WHERE buyer_id = ? AND status = 'pending') as pending_orders,
                (SELECT SUM(total) FROM orders WHERE buyer_id = ? AND status = 'delivered') as total_spent
        `;
        params = [req.session.userId, req.session.userId, req.session.userId];
    } else if (userRole === 'seller') {
        statsQuery = `
            SELECT 
                (SELECT COUNT(*) FROM products WHERE seller_id = ?) as total_products,
                (SELECT COUNT(*) FROM products WHERE seller_id = ? AND status = 'active') as active_products,
                (SELECT SUM(total_price) FROM order_items WHERE seller_id = ?) as total_sales
        `;
        params = [req.session.userId, req.session.userId, req.session.userId];
    } else if (userRole === 'driver') {
        statsQuery = `
            SELECT 
                (SELECT COUNT(*) FROM orders WHERE driver_id = ?) as total_deliveries,
                (SELECT COUNT(*) FROM orders WHERE driver_id = ? AND status = 'on_the_way') as active_deliveries
        `;
        params = [req.session.userId, req.session.userId];
    } else {
        return res.json({ success: true, data: {} });
    }
    
    db.get(statsQuery, params, (err, stats) => {
        if (err) {
            logger.error(`❌ خطأ في جلب الإحصائيات: ${err.message}`);
            return res.json({ success: true, data: {} });
        }
        
        res.json({ success: true, data: stats || {} });
    });
});

// 📁 الملفات الثابتة
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// معالج الأخطاء
app.use((err, req, res, next) => {
    logger.error(`❌ خطأ غير متوقع: ${err.message}`);
    
    res.status(500).json({
        success: false,
        error: 'حدث خطأ داخلي في الخادم',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'الصفحة غير موجودة',
        timestamp: new Date().toISOString()
    });
});

// الصفحة الرئيسية
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// بدء الخادم
const PORT = process.env.PORT || 3000;

initializeDatabase().then(() => {
    server.listen(PORT, () => {
        logger.info(`🚀 تطبيق قات PRO يعمل على المنفذ ${PORT}`);
        logger.info(`🌐 الإصدار: ${VERSION}`);
        logger.info(`⚙️  البيئة: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`✅ التطبيق جاهز للاستخدام`);
        
        // إنشاء المجلدات المطلوبة باستخدام fsSync
        const requiredDirs = ['uploads', 'data', 'logs'];
        requiredDirs.forEach(dir => {
            const dirPath = path.join(__dirname, dir);
            if (!fsSync.existsSync(dirPath)) {
                fsSync.mkdirSync(dirPath, { recursive: true });
                logger.info(`📁 تم إنشاء مجلد: ${dir}`);
            }
        });
    });
}).catch(err => {
    logger.error(`❌ فشل في بدء الخادم: ${err.message}`);
    process.exit(1);
});
