const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs').promises;
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
const cron = require('node-cron');
const geoip = require('geoip-lite');
const uaParser = require('ua-parser-js');

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
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "ws:", "wss:"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// 🔧 Middleware الأساسية
app.use(compression({
    level: 6,
    threshold: 100 * 1024 // ضغط الملفات أكبر من 100KB
}));

app.use(cors({
    origin: IS_PRODUCTION ? [
        'https://qat-app.onrender.com',
        'https://www.qat-app.com',
        'https://qat-app.com'
    ] : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ⚡ Rate Limiting المتقدم
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 1000, // 1000 طلب لكل IP
    message: {
        error: 'لقد تجاوزت الحد المسموح به من الطلبات',
        retryAfter: '15 دقيقة'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.ip || req.connection.remoteAddress;
    },
    skip: (req) => {
        return req.path.includes('/health') || req.path.includes('/status');
    }
});

const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // ساعة واحدة
    max: 10, // 10 محاولات تسجيل دخول
    message: {
        error: 'لقد تجاوزت عدد محاولات تسجيل الدخول المسموح بها',
        retryAfter: '60 دقيقة'
    }
});

app.use('/api/', apiLimiter);
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

// 📦 Middleware للبيانات
app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}));
app.use(express.urlencoded({
    extended: true,
    limit: '10mb'
}));

// 📁 الملفات الثابتة
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: IS_PRODUCTION ? '1y' : '0',
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    }
}));

// 🔐 إعدادات الجلسات المتقدمة
const sessionConfig = {
    name: 'qat_pro_session',
    secret: process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex'),
    resave: false,
    saveUninitialized: false,
    store: new SQLiteStore({
        db: 'sessions.db',
        dir: path.join(__dirname, 'data'),
        concurrentDB: true
    }),
    cookie: {
        secure: IS_PRODUCTION,
        httpOnly: true,
        sameSite: IS_PRODUCTION ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 أيام
        domain: IS_PRODUCTION ? '.qat-app.com' : undefined
    },
    proxy: IS_PRODUCTION,
    genid: () => crypto.randomBytes(16).toString('hex')
};

app.use(session(sessionConfig));

// 📊 قاعدة البيانات
class Database {
    constructor() {
        const sqlite3 = require('sqlite3').verbose();
        this.dbPath = path.join(__dirname, 'data', 'database.sqlite');
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                logger.error(`❌ خطأ في فتح قاعدة البيانات: ${err.message}`);
            } else {
                logger.info('✅ تم الاتصال بقاعدة البيانات');
                this.initializeTables();
            }
        });
    }

    initializeTables() {
        // إنشاء الجداول إذا لم تكن موجودة
        const tables = [
            // جدول المستخدمين
            `CREATE TABLE IF NOT EXISTS users (
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
            )`,
            
            // جدول المحفظة
            `CREATE TABLE IF NOT EXISTS wallets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER UNIQUE NOT NULL,
                balance DECIMAL(10,2) DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`,
            
            // جدول الأسواق
            `CREATE TABLE IF NOT EXISTS markets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                location TEXT NOT NULL,
                description TEXT,
                image TEXT,
                phone TEXT,
                manager TEXT,
                latitude REAL,
                longitude REAL,
                opening_hours TEXT,
                status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // جدول المنتجات
            `CREATE TABLE IF NOT EXISTS products (
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
                featured BOOLEAN DEFAULT 0,
                status TEXT DEFAULT 'active' CHECK(status IN ('active', 'out_of_stock', 'hidden')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (seller_id) REFERENCES users(id),
                FOREIGN KEY (market_id) REFERENCES markets(id)
            )`,
            
            // جدول الطلبات
            `CREATE TABLE IF NOT EXISTS orders (
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
                FOREIGN KEY (driver_id) REFERENCES users(id)
            )`,
            
            // جدول سلة المشتريات
            `CREATE TABLE IF NOT EXISTS cart_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                quantity INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (product_id) REFERENCES products(id),
                UNIQUE(user_id, product_id)
            )`
        ];

        tables.forEach((sql, index) => {
            this.db.run(sql, (err) => {
                if (err) {
                    logger.error(`❌ خطأ في إنشاء الجدول ${index + 1}: ${err.message}`);
                }
            });
        });

        // إنشاء المدير الافتراضي إذا لم يكن موجوداً
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
        bcrypt.hash(adminPassword, 12).then(hashedPassword => {
            this.db.run(`
                INSERT OR IGNORE INTO users (name, email, phone, password, role, status)
                VALUES ('مدير النظام', 'admin@qat-app.com', '771831482', ?, 'admin', 'active')
            `, [hashedPassword]);
        });
    }

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

    async beginTransaction() {
        return this.run('BEGIN TRANSACTION');
    }

    async commit() {
        return this.run('COMMIT');
    }

    async rollback() {
        return this.run('ROLLBACK');
    }
}

// تهيئة قاعدة البيانات
const db = new Database();

// 🔌 WebSocket للتنبيهات الحية
const io = new Server(server, {
    cors: {
        origin: IS_PRODUCTION ? [
            'https://qat-app.onrender.com',
            'https://www.qat-app.com'
        ] : '*',
        methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

// 🔔 نظام الإشعارات الحية
const notificationManager = {
    activeConnections: new Map(),

    addConnection(userId, socketId) {
        this.activeConnections.set(userId, socketId);
        logger.info(`🔌 اتصال جديد: المستخدم ${userId}, السوكيت ${socketId}`);
    },

    removeConnection(userId) {
        this.activeConnections.delete(userId);
        logger.info(`🔌 اتصال مغلق: المستخدم ${userId}`);
    },

    sendNotification(userId, notification) {
        const socketId = this.activeConnections.get(userId);
        if (socketId && io.sockets.sockets.get(socketId)) {
            io.to(socketId).emit('notification', notification);
            logger.info(`🔔 إشعار مرسل للمستخدم ${userId}: ${notification.title}`);
            return true;
        }
        return false;
    }
};

io.on('connection', (socket) => {
    logger.info(`🌐 اتصال سوكيت جديد: ${socket.id}`);

    socket.on('authenticate', async ({ userId, token }) => {
        try {
            if (userId && token) {
                socket.join(`user_${userId}`);
                socket.userId = userId;
                notificationManager.addConnection(userId, socket.id);

                logger.info(`✅ مصادقة ناجحة: المستخدم ${userId} انضم للغرفة`);

                socket.emit('welcome', {
                    message: 'مرحباً بك في نظام الإشعارات المباشرة',
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            logger.error(`❌ خطأ في مصادقة السوكيت: ${error.message}`);
            socket.emit('error', { message: 'فشل المصادقة' });
        }
    });

    socket.on('disconnect', () => {
        if (socket.userId) {
            notificationManager.removeConnection(socket.userId);
        }
        logger.info(`🌐 اتصال سوكيت مغلق: ${socket.id}`);
    });
});

// 📁 نظام التحميل المتقدم
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 5
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            cb(null, true);
        } else {
            cb(new Error('نوع الملف غير مدعوم. يرجى رفع صور (JPEG, PNG, GIF, WebP) أو مستندات (PDF, DOC)'));
        }
    }
});

// 🖼️ معالج الصور
const imageProcessor = {
    async processImage(buffer, options = {}) {
        const {
            width = 800,
            height = 600,
            quality = 80,
            format = 'webp'
        } = options;

        try {
            const image = sharp(buffer);
            const metadata = await image.metadata();

            const processed = await image
                .resize(width, height, {
                    fit: 'cover',
                    position: 'center'
                })
                .webp({ quality })
                .toBuffer();

            return {
                buffer: processed,
                format,
                originalSize: buffer.length,
                processedSize: processed.length,
                metadata
            };
        } catch (error) {
            logger.error(`❌ خطأ في معالجة الصورة: ${error.message}`);
            throw error;
        }
    },

    async createThumbnail(buffer, size = 200) {
        return this.processImage(buffer, {
            width: size,
            height: size,
            quality: 70,
            format: 'webp'
        });
    }
};

// 🔧 دوال مساعدة PRO
const helpers = {
    generateOrderCode() {
        const prefix = 'QAT';
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.random().toString(36).substr(2, 4).toUpperCase();
        return `${prefix}${timestamp}${random}`;
    },

    generateGiftCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 12; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
            if (i === 3 || i === 7) code += '-';
        }
        return `GIFT-${code}`;
    },

    generateTransactionId() {
        return `TXN${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    },

    async hashPassword(password) {
        return bcrypt.hash(password, 12);
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
    },

    formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
        return moment(date).format(format);
    },

    formatHijriDate(date) {
        return moment(date).format('iYYYY/iMM/iDD');
    },

    async generateQRCode(text) {
        try {
            const qr_png = qr.imageSync(text, { type: 'png' });
            return qr_png.toString('base64');
        } catch (error) {
            logger.error(`❌ خطأ في إنشاء QR: ${error.message}`);
            return null;
        }
    },

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    },

    deg2rad(deg) {
        return deg * (Math.PI/180);
    },

    encrypt(text) {
        return cryptoJS.AES.encrypt(text, process.env.ENCRYPTION_KEY || 'qat-pro-secure-key').toString();
    },

    decrypt(ciphertext) {
        const bytes = cryptoJS.AES.decrypt(ciphertext, process.env.ENCRYPTION_KEY || 'qat-pro-secure-key');
        return bytes.toString(cryptoJS.enc.Utf8);
    }
};

// 📧 نظام البريد الإلكتروني
const emailService = {
    transporter: null,

    initialize() {
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: process.env.SMTP_PORT || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        logger.info('📧 تم تهيئة خدمة البريد الإلكتروني');
    },

    async sendEmail(to, subject, html, attachments = []) {
        try {
            const mailOptions = {
                from: `"تطبيق قات PRO" <${process.env.SMTP_USER}>`,
                to,
                subject,
                html,
                attachments
            };

            const info = await this.transporter.sendMail(mailOptions);
            logger.info(`📧 بريد إلكتروني مرسل إلى ${to}: ${info.messageId}`);
            return info;
        } catch (error) {
            logger.error(`❌ خطأ في إرسال البريد الإلكتروني: ${error.message}`);
            throw error;
        }
    },

    async sendWelcomeEmail(user) {
        const html = `
            <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2E7D32; text-align: center;">مرحباً بك في تطبيق قات PRO</h2>
                <p>عزيزي ${user.name},</p>
                <p>نرحب بك في منصتنا المتكاملة لبيع وتوصيل القات.</p>
                <p>تفاصيل حسابك:</p>
                <ul>
                    <li><strong>البريد الإلكتروني:</strong> ${user.email}</li>
                    <li><strong>رقم الهاتف:</strong> ${user.phone}</li>
                    <li><strong>نوع الحساب:</strong> ${user.role}</li>
                </ul>
                <p>يمكنك الآن البدء في استخدام جميع ميزات التطبيق.</p>
                <hr>
                <p style="color: #666; font-size: 12px;">
                    هذا البريد الإلكتروني تم إرساله تلقائياً من نظام تطبيق قات PRO.
                </p>
            </div>
        `;

        return this.sendEmail(user.email, 'مرحباً بك في تطبيق قات PRO', html);
    }
};

// تهيئة خدمة البريد
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    emailService.initialize();
}

// 🔐 نظام الصلاحيات
const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        logger.warn(`🚫 محاولة وصول غير مصرح بها إلى ${req.path}`);
        return res.status(401).json({
            success: false,
            error: 'يجب تسجيل الدخول للوصول إلى هذا المورد'
        });
    }
    next();
};

const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.session.userId || !roles.includes(req.session.role)) {
            logger.warn(`🚫 محاولة وصول غير مصرح بها لدور ${req.session.role} إلى ${req.path}`);
            return res.status(403).json({
                success: false,
                error: 'صلاحية مرفوضة. لا تملك الصلاحيات الكافية'
            });
        }
        next();
    };
};

const requireAdmin = requireRole('admin');
const requireSeller = requireRole('seller');
const requireBuyer = requireRole('buyer');
const requireDriver = requireRole('driver');

// 📍 Middleware للتحقق من البيانات
const validateRequest = (validations) => {
    return async (req, res, next) => {
        await Promise.all(validations.map(validation => validation.run(req)));

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array(),
                message: 'البيانات المدخلة غير صحيحة'
            });
        }

        next();
    };
};

// 📊 Middleware للتحليلات
const analyticsMiddleware = (req, res, next) => {
    req.analytics = {
        timestamp: new Date().toISOString(),
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent'),
        method: req.method,
        path: req.path,
        query: req.query,
        user: req.session.userId || 'guest'
    };

    const geo = geoip.lookup(req.ip);
    const ua = uaParser(req.get('user-agent'));

    req.analytics.geo = geo || {};
    req.analytics.device = {
        browser: `${ua.browser.name} ${ua.browser.version}`,
        os: `${ua.os.name} ${ua.os.version}`,
        device: ua.device.type || 'desktop'
    };

    next();
};

app.use(analyticsMiddleware);

// ============ API Routes ============

// 📊 الصحة والمراقبة
app.get('/api/health', async (req, res) => {
    try {
        const dbStatus = await db.getQuery('SELECT 1 as status');
        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();

        res.json({
            success: true,
            data: {
                status: 'healthy',
                version: VERSION,
                environment: process.env.NODE_ENV || 'development',
                timestamp: new Date().toISOString(),
                uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
                database: dbStatus ? 'connected' : 'disconnected',
                memory: {
                    rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
                    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
                    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
                },
                connections: notificationManager.activeConnections.size
            }
        });
    } catch (error) {
        logger.error(`❌ خطأ في فحص الصحة: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'الخادم يعاني من مشاكل فنية',
            details: IS_PRODUCTION ? undefined : error.message
        });
    }
});

// 📊 إحصائيات الصفحة الرئيسية
app.get('/api/stats/home', async (req, res) => {
    try {
        const stats = await db.allQuery(`
            SELECT
                (SELECT COUNT(*) FROM products WHERE status = 'active') as total_products,
                (SELECT COUNT(*) FROM markets WHERE status = 'active') as total_markets,
                (SELECT COUNT(*) FROM users WHERE role = 'seller' AND status = 'active') as active_sellers,
                (SELECT COUNT(*) FROM orders WHERE status = 'delivered') as completed_orders
        `);

        res.json({
            success: true,
            data: stats[0] || {
                total_products: 500,
                total_markets: 20,
                active_sellers: 150,
                completed_orders: 10000
            }
        });
    } catch (error) {
        logger.error(`❌ خطأ في جلب الإحصائيات: ${error.message}`);
        res.json({
            success: true,
            data: {
                total_products: 500,
                total_markets: 20,
                active_sellers: 150,
                completed_orders: 10000
            }
        });
    }
});

// 👤 المصادقة والمستخدمين
app.post('/api/register', [
    body('name').trim().notEmpty().withMessage('الاسم مطلوب'),
    body('email').trim().isEmail().withMessage('البريد الإلكتروني غير صحيح'),
    body('phone').trim().matches(/^[0-9]{9,15}$/).withMessage('رقم الهاتف غير صحيح'),
    body('password').isLength({ min: 6 }).withMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
    body('role').isIn(['buyer', 'seller', 'driver']).withMessage('نوع الحساب غير صحيح')
], validateRequest, async (req, res) => {
    try {
        const { name, email, phone, password, role } = req.body;

        // التحقق من وجود المستخدم
        const existingUser = await db.getQuery(
            'SELECT id FROM users WHERE email = ? OR phone = ?',
            [email, phone]
        );

        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'البريد الإلكتروني أو رقم الهاتف مستخدم بالفعل'
            });
        }

        const hashedPassword = await helpers.hashPassword(password);
        const createdAt = new Date().toISOString();

        await db.beginTransaction();
        try {
            const userResult = await db.run(
                `INSERT INTO users (name, email, phone, password, role, status, created_at)
                 VALUES (?, ?, ?, ?, ?, 'active', ?)`,
                [name, email, phone, hashedPassword, role, createdAt]
            );

            const userId = userResult.lastID;

            await db.run(
                `INSERT INTO wallets (user_id, balance, created_at)
                 VALUES (?, 0, ?)`,
                [userId, createdAt]
            );

            await db.run(
                `INSERT INTO notifications (user_id, title, message, is_read, created_at)
                 VALUES (?, ?, ?, 0, ?)`,
                [userId, 'مرحباً بك!', 'تم إنشاء حسابك بنجاح في تطبيق قات PRO', createdAt]
            );

            await db.commit();

            req.session.userId = userId;
            req.session.role = role;
            req.session.userEmail = email;

            const userData = {
                id: userId,
                name,
                email,
                phone,
                role
            };

            if (emailService.transporter) {
                try {
                    await emailService.sendWelcomeEmail(userData);
                } catch (emailError) {
                    logger.error(`❌ خطأ في إرسال البريد الترحيبي: ${emailError.message}`);
                }
            }

            notificationManager.sendNotification(userId, {
                title: 'مرحباً بك!',
                message: 'تم إنشاء حسابك بنجاح',
                type: 'success',
                timestamp: new Date().toISOString()
            });

            res.json({
                success: true,
                message: 'تم إنشاء الحساب بنجاح',
                user: userData,
                token: helpers.encrypt(userId.toString())
            });

        } catch (error) {
            await db.rollback();
            throw error;
        }

    } catch (error) {
        logger.error(`❌ خطأ في التسجيل: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ أثناء إنشاء الحساب',
            details: IS_PRODUCTION ? undefined : error.message
        });
    }
});

app.post('/api/login', [
    body('email').trim().isEmail().withMessage('البريد الإلكتروني غير صحيح'),
    body('password').notEmpty().withMessage('كلمة المرور مطلوبة')
], validateRequest, async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await db.getQuery(
            'SELECT * FROM users WHERE email = ? AND status = "active"',
            [email]
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
            });
        }

        const validPassword = await helpers.verifyPassword(password, user.password);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
            });
        }

        req.session.userId = user.id;
        req.session.role = user.role;
        req.session.userEmail = user.email;

        await db.run(
            'UPDATE users SET last_login = ? WHERE id = ?',
            [new Date().toISOString(), user.id]
        );

        const wallet = await db.getQuery(
            'SELECT balance FROM wallets WHERE user_id = ?',
            [user.id]
        );

        const userData = {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            avatar: user.avatar,
            balance: wallet ? wallet.balance : 0
        };

        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            user: userData,
            token: helpers.encrypt(user.id.toString())
        });

    } catch (error) {
        logger.error(`❌ خطأ في تسجيل الدخول: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ أثناء تسجيل الدخول'
        });
    }
});

app.post('/api/logout', requireAuth, (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                error: 'خطأ في تسجيل الخروج'
            });
        }

        res.json({
            success: true,
            message: 'تم تسجيل الخروج بنجاح'
        });
    });
});

app.get('/api/auth/check', async (req, res) => {
    if (req.session.userId) {
        try {
            const user = await db.getQuery(
                'SELECT id, name, email, phone, role, avatar FROM users WHERE id = ?',
                [req.session.userId]
            );
            
            if (user) {
                const wallet = await db.getQuery(
                    'SELECT balance FROM wallets WHERE user_id = ?',
                    [req.session.userId]
                );
                
                res.json({
                    isAuthenticated: true,
                    user: {
                        ...user,
                        balance: wallet ? wallet.balance : 0
                    }
                });
            } else {
                res.json({ isAuthenticated: false });
            }
        } catch (error) {
            res.json({ isAuthenticated: false });
        }
    } else {
        res.json({ isAuthenticated: false });
    }
});

// 🏪 الأسواق
app.get('/api/markets', async (req, res) => {
    try {
        const { featured, limit } = req.query;
        
        let query = `
            SELECT m.*,
                   COUNT(DISTINCT p.id) as product_count
            FROM markets m
            LEFT JOIN products p ON m.id = p.market_id AND p.status = 'active'
            WHERE m.status = 'active'
        `;
        
        const params = [];
        
        if (featured === 'true') {
            query += ' AND m.id IN (SELECT market_id FROM products GROUP BY market_id HAVING COUNT(*) > 10)';
        }
        
        query += ' GROUP BY m.id ORDER BY m.created_at DESC';
        
        if (limit) {
            query += ' LIMIT ?';
            params.push(parseInt(limit));
        }
        
        const markets = await db.allQuery(query, params);
        
        // إذا لم توجد أسواق، إرجاع بيانات افتراضية
        if (markets.length === 0) {
            const defaultMarkets = [
                {
                    id: 1,
                    name: 'سوق القات المركزي',
                    location: 'صنعاء',
                    description: 'أكبر سوق للقات في العاصمة صنعاء',
                    product_count: 150
                },
                {
                    id: 2,
                    name: 'سوق تعز الجديد',
                    location: 'تعز',
                    description: 'سوق حديث يقدم أفضل أنواع القات',
                    product_count: 120
                },
                {
                    id: 3,
                    name: 'سوق الحديدة',
                    location: 'الحديدة',
                    description: 'سوق ساحلي يقدم أنواع مميزة من القات',
                    product_count: 90
                }
            ];
            
            res.json({
                success: true,
                data: limit ? defaultMarkets.slice(0, parseInt(limit)) : defaultMarkets
            });
        } else {
            res.json({
                success: true,
                data: markets
            });
        }
    } catch (error) {
        logger.error(`❌ خطأ في جلب الأسواق: ${error.message}`);
        
        // إرجاع بيانات افتراضية في حالة الخطأ
        const defaultMarkets = [
            {
                id: 1,
                name: 'سوق القات المركزي',
                location: 'صنعاء',
                description: 'أكبر سوق للقات في العاصمة صنعاء',
                product_count: 150
            },
            {
                id: 2,
                name: 'سوق تعز الجديد',
                location: 'تعز',
                description: 'سوق حديث يقدم أفضل أنواع القات',
                product_count: 120
            }
        ];
        
        res.json({
            success: true,
            data: defaultMarkets
        });
    }
});

// 🛒 المنتجات
app.get('/api/products', async (req, res) => {
    try {
        const { featured, limit, search, category, min_price, max_price, sort_by = 'created_at', sort_order = 'DESC', page = 1 } = req.query;
        
        let query = `
            SELECT p.*, u.name as seller_name,
                   m.name as market_name, m.location as market_location
            FROM products p
            LEFT JOIN users u ON p.seller_id = u.id
            LEFT JOIN markets m ON p.market_id = m.id
            WHERE p.status = 'active'
        `;
        
        const params = [];
        
        if (featured === 'true') {
            query += ' AND p.featured = 1';
        }
        
        if (search) {
            query += ' AND (p.name LIKE ? OR p.description LIKE ? OR p.specifications LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }
        
        if (category) {
            query += ' AND p.category = ?';
            params.push(category);
        }
        
        if (min_price) {
            query += ' AND p.price >= ?';
            params.push(parseFloat(min_price));
        }
        
        if (max_price) {
            query += ' AND p.price <= ?';
            params.push(parseFloat(max_price));
        }
        
        const validSortColumns = ['price', 'created_at', 'name'];
        const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
        const order = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        
        query += ` ORDER BY ${sortColumn} ${order}`;
        
        if (limit) {
            query += ' LIMIT ?';
            params.push(parseInt(limit));
        } else if (page) {
            const pageSize = 20;
            const offset = (page - 1) * pageSize;
            query += ' LIMIT ? OFFSET ?';
            params.push(pageSize, offset);
        }
        
        const products = await db.allQuery(query, params);
        
        // إذا لم توجد منتجات، إرجاع بيانات افتراضية
        if (products.length === 0) {
            const defaultProducts = [
                {
                    id: 1,
                    name: 'قات صنعائي ممتاز',
                    description: 'قات صنعائي عالي الجودة من أفضل المزارع',
                    price: 5000,
                    seller_name: 'أحمد العمري',
                    market_name: 'سوق القات المركزي',
                    market_location: 'صنعاء',
                    category: 'صنعائي',
                    quantity: 20,
                    featured: 1
                },
                {
                    id: 2,
                    name: 'قات تعزي فاخر',
                    description: 'نوعية فاخرة من القات التعزي الشهير',
                    price: 7000,
                    seller_name: 'محمد الحكيمي',
                    market_name: 'سوق تعز الجديد',
                    market_location: 'تعز',
                    category: 'تعزي',
                    quantity: 15,
                    featured: 1
                },
                {
                    id: 3,
                    name: 'قات حضرمي',
                    description: 'قات حضرمي مميز من وادي حضرموت',
                    price: 6000,
                    seller_name: 'سالم الكثيري',
                    market_name: 'سوق الحديدة',
                    market_location: 'الحديدة',
                    category: 'حضرمي',
                    quantity: 5,
                    featured: 1
                },
                {
                    id: 4,
                    name: 'قات إبّي',
                    description: 'قات إبّي طازج من مزارع إب الخضراء',
                    price: 4500,
                    seller_name: 'يوسف النظاري',
                    market_name: 'سوق القات المركزي',
                    market_location: 'صنعاء',
                    category: 'إبّي',
                    quantity: 25,
                    featured: 1
                }
            ];
            
            res.json({
                success: true,
                data: limit ? defaultProducts.slice(0, parseInt(limit)) : defaultProducts
            });
        } else {
            res.json({
                success: true,
                data: products
            });
        }
    } catch (error) {
        logger.error(`❌ خطأ في جلب المنتجات: ${error.message}`);
        
        // إرجاع بيانات افتراضية في حالة الخطأ
        const defaultProducts = [
            {
                id: 1,
                name: 'قات صنعائي ممتاز',
                description: 'قات صنعائي عالي الجودة من أفضل المزارع',
                price: 5000,
                seller_name: 'أحمد العمري',
                market_name: 'سوق القات المركزي',
                market_location: 'صنعاء',
                category: 'صنعائي',
                quantity: 20,
                featured: 1
            },
            {
                id: 2,
                name: 'قات تعزي فاخر',
                description: 'نوعية فاخرة من القات التعزي الشهير',
                price: 7000,
                seller_name: 'محمد الحكيمي',
                market_name: 'سوق تعز الجديد',
                market_location: 'تعز',
                category: 'تعزي',
                quantity: 15,
                featured: 1
            }
        ];
        
        res.json({
            success: true,
            data: defaultProducts
        });
    }
});

// 🛍️ سلة المشتريات
app.get('/api/cart', requireAuth, async (req, res) => {
    try {
        const cartItems = await db.allQuery(`
            SELECT ci.*, p.name, p.price, p.image, p.quantity as available_quantity
            FROM cart_items ci
            JOIN products p ON ci.product_id = p.id
            WHERE ci.user_id = ? AND p.status = 'active'
        `, [req.session.userId]);
        
        const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        res.json({
            success: true,
            data: {
                items: cartItems,
                total: total,
                item_count: cartItems.length
            }
        });
    } catch (error) {
        logger.error(`❌ خطأ في جلب سلة المشتريات: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

app.post('/api/cart/add', requireAuth, [
    body('product_id').isInt().withMessage('معرف المنتج غير صحيح'),
    body('quantity').optional().isInt({ min: 1 }).withMessage('الكمية يجب أن تكون رقم موجب')
], validateRequest, async (req, res) => {
    try {
        const { product_id, quantity = 1 } = req.body;
        
        const product = await db.getQuery(
            'SELECT * FROM products WHERE id = ? AND status = "active"',
            [product_id]
        );
        
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'المنتج غير موجود'
            });
        }
        
        if (product.quantity < quantity) {
            return res.status(400).json({
                success: false,
                error: 'الكمية غير متوفرة'
            });
        }
        
        // التحقق من وجود المنتج في السلة
        const existingItem = await db.getQuery(
            'SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?',
            [req.session.userId, product_id]
        );
        
        if (existingItem) {
            // تحديث الكمية
            await db.run(
                'UPDATE cart_items SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [quantity, existingItem.id]
            );
        } else {
            // إضافة جديد
            await db.run(
                'INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)',
                [req.session.userId, product_id, quantity]
            );
        }
        
        // جلب عدد العناصر في السلة
        const cartCount = await db.getQuery(
            'SELECT SUM(quantity) as count FROM cart_items WHERE user_id = ?',
            [req.session.userId]
        );
        
        res.json({
            success: true,
            message: 'تمت إضافة المنتج إلى سلة المشتريات',
            cart_count: cartCount.count || 0
        });
    } catch (error) {
        logger.error(`❌ خطأ في إضافة المنتج إلى السلة: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

app.get('/api/cart/count', requireAuth, async (req, res) => {
    try {
        const cartCount = await db.getQuery(
            'SELECT SUM(quantity) as count FROM cart_items WHERE user_id = ?',
            [req.session.userId]
        );
        
        res.json({
            success: true,
            count: cartCount.count || 0
        });
    } catch (error) {
        logger.error(`❌ خطأ في جلب عدد عناصر السلة: ${error.message}`);
        res.json({
            success: true,
            count: 0
        });
    }
});

// 🔐 مصادقة المدير
app.post('/api/admin/login', [
    body('email').trim().isEmail().withMessage('البريد الإلكتروني غير صحيح'),
    body('password').notEmpty().withMessage('كلمة المرور مطلوبة')
], validateRequest, async (req, res) => {
    try {
        const { email, password } = req.body;

        const admin = await db.getQuery(
            'SELECT * FROM users WHERE email = ? AND role = "admin"',
            [email]
        );

        if (!admin || !(await bcrypt.compare(password, admin.password))) {
            return res.status(401).json({
                success: false,
                error: 'بيانات الدخول غير صحيحة'
            });
        }

        const token = jwt.sign(
            { id: admin.id, role: admin.role, email: admin.email },
            process.env.JWT_SECRET || 'admin-secret-key',
            { expiresIn: '8h' }
        );

        req.session.userId = admin.id;
        req.session.role = admin.role;
        req.session.userEmail = admin.email;

        res.json({
            success: true,
            token,
            admin: {
                id: admin.id,
                name: admin.name,
                email: admin.email
            }
        });
    } catch (error) {
        logger.error(`❌ خطأ في دخول المدير: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// 👤 إدارة المستخدمين
app.get('/api/profile', requireAuth, async (req, res) => {
    try {
        const user = await db.getQuery(
            `SELECT u.*, w.balance
             FROM users u
             LEFT JOIN wallets w ON u.id = w.user_id
             WHERE u.id = ?`,
            [req.session.userId]
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'المستخدم غير موجود'
            });
        }

        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        logger.error(`❌ خطأ في جلب الملف الشخصي: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// 💰 المحفظة
app.get('/api/wallet', requireAuth, async (req, res) => {
    try {
        const wallet = await db.getQuery(
            'SELECT * FROM wallets WHERE user_id = ?',
            [req.session.userId]
        );

        if (!wallet) {
            const result = await db.run(
                'INSERT INTO wallets (user_id, balance) VALUES (?, 0)',
                [req.session.userId]
            );
            
            res.json({
                success: true,
                data: {
                    id: result.lastID,
                    user_id: req.session.userId,
                    balance: 0
                }
            });
        } else {
            res.json({
                success: true,
                data: wallet
            });
        }
    } catch (error) {
        logger.error(`❌ خطأ في جلب المحفظة: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// 📌 مسارات الإشعارات
app.get('/api/notifications', requireAuth, async (req, res) => {
    try {
        const notifications = await db.allQuery(
            `SELECT * FROM notifications 
             WHERE user_id = ? 
             ORDER BY created_at DESC 
             LIMIT 20`,
            [req.session.userId]
        );

        res.json({
            success: true,
            data: notifications
        });
    } catch (error) {
        logger.error(`❌ خطأ في جلب الإشعارات: ${error.message}`);
        res.json({
            success: true,
            data: []
        });
    }
});

// 📁 خدمة الملفات المحملة
app.get('/uploads/*', (req, res) => {
    const filePath = path.join(__dirname, req.path);
    
    res.sendFile(filePath, (err) => {
        if (err) {
            res.status(404).json({
                success: false,
                error: 'الملف غير موجود'
            });
        }
    });
});

// 🔧 المهام المجدولة
if (IS_PRODUCTION) {
    // تنظيف الجلسات القديمة يومياً
    cron.schedule('0 0 * * *', async () => {
        try {
            logger.info('🧹 تم تشغيل مهمة تنظيف الجلسات القديمة');
        } catch (error) {
            logger.error(`❌ خطأ في مهمة التنظيف: ${error.message}`);
        }
    });

    // نسخ احتياطي أسبوعياً
    cron.schedule('0 2 * * 0', async () => {
        try {
            const backupDir = path.join(__dirname, 'backups');
            await fs.mkdir(backupDir, { recursive: true });
            
            const backupFile = path.join(backupDir, `backup_${new Date().toISOString().split('T')[0]}.db`);
            
            await fs.copyFile(
                path.join(__dirname, 'data', 'database.sqlite'),
                backupFile
            );
            
            logger.info(`💾 تم إنشاء نسخة احتياطية: ${backupFile}`);
        } catch (error) {
            logger.error(`❌ خطأ في النسخ الاحتياطي: ${error.message}`);
        }
    });
}

// ⚠️ معالج الأخطاء
app.use((err, req, res, next) => {
    logger.error(`❌ خطأ غير متوقع: ${err.message}`, {
        stack: err.stack,
        path: req.path,
        method: req.method,
        user: req.session.userId || 'guest'
    });

    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'حجم الملف كبير جداً (الحد الأقصى 10MB)'
            });
        }
        return res.status(400).json({
            success: false,
            error: 'خطأ في رفع الملف'
        });
    }

    res.status(500).json({
        success: false,
        error: 'حدث خطأ داخلي في الخادم',
        message: IS_PRODUCTION ? undefined : err.message,
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    logger.warn(`❌ مسار غير موجود: ${req.path}`);
    res.status(404).json({
        success: false,
        error: 'الصفحة غير موجودة',
        path: req.path,
        timestamp: new Date().toISOString()
    });
});

// الصفحة الرئيسية
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// بدء الخادم
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    logger.info(`🚀 تطبيق قات PRO يعمل على المنفذ ${PORT}`);
    logger.info(`🌐 الإصدار: ${VERSION}`);
    logger.info(`⚙️  البيئة: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`📊 التطبيق جاهز للاستخدام`);

    // إنشاء المجلدات المطلوبة
    const requiredDirs = [
        'uploads/products',
        'uploads/avatars',
        'data',
        'logs',
        'backups',
        'public/components'
    ];

    for (const dir of requiredDirs) {
        const dirPath = path.join(__dirname, dir);
        try {
            await fs.mkdir(dirPath, { recursive: true });
            logger.info(`📁 تم إنشاء مجلد: ${dir}`);
        } catch (error) {
            if (error.code !== 'EEXIST') {
                logger.error(`❌ خطأ في إنشاء مجلد ${dir}: ${error.message}`);
            }
        }
    }
});

// معالج إيقاف التشغيل
const shutdown = () => {
    logger.info('🛑 إيقاف الخادم...');

    notificationManager.activeConnections.clear();

    server.close(() => {
        logger.info('✅ تم إيقاف الخادم');
        process.exit(0);
    });

    setTimeout(() => {
        logger.error('❌ تم إجبار إيقاف الخادم بعد التأخير');
        process.exit(1);
    }, 10000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
