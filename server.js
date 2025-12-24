const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
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
        // تخطي بعض المسارات
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
    store: new session.MemoryStore(),
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

// 📊 تهيئة قاعدة البيانات بشكل مباشر
const initializeDatabase = async () => {
    const dataDir = path.join(__dirname, 'data');
    const dbPath = path.join(dataDir, 'database.sqlite');
    
    try {
        // إنشاء مجلد data إذا لم يكن موجوداً
        await fs.mkdir(dataDir, { recursive: true });
        
        // إنشاء اتصال قاعدة البيانات
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

        // إنشاء الجداول إذا لم تكن موجودة
        await createTables(db);
        
        return db;
    } catch (error) {
        logger.error(`❌ خطأ في تهيئة قاعدة البيانات: ${error.message}`);
        throw error;
    }
};

// دالة لإنشاء الجداول
const createTables = async (db) => {
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
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended')),
            last_login DATETIME,
            created_at DATETIME NOT NULL,
            updated_at DATETIME
        )`,

        // جدول المحافظ
        `CREATE TABLE IF NOT EXISTS wallets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            balance REAL DEFAULT 0,
            created_at DATETIME NOT NULL,
            updated_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        // جدول البائعين
        `CREATE TABLE IF NOT EXISTS sellers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            store_name TEXT NOT NULL,
            rating REAL DEFAULT 0,
            total_sales INTEGER DEFAULT 0,
            created_at DATETIME NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        // جدول السائقين
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

        // جدول الأسواق
        `CREATE TABLE IF NOT EXISTS markets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            location TEXT,
            image TEXT,
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
            created_at DATETIME NOT NULL
        )`,

        // جدول المنتجات
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

        // جدول الطلبات
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

        // جدول عناصر الطلب
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

        // جدول المعاملات
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

        // جدول الإشعارات
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

        // جدول التقييمات
        `CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
            comment TEXT,
            created_at DATETIME NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )`,

        // جدول محطات الغسيل
        `CREATE TABLE IF NOT EXISTS wash_stations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            market_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            location TEXT,
            status TEXT DEFAULT 'active',
            created_at DATETIME NOT NULL,
            FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
        )`,

        // جدول طلبات الغسيل
        `CREATE TABLE IF NOT EXISTS wash_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            wash_station_id INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
            FOREIGN KEY (wash_station_id) REFERENCES wash_stations(id) ON DELETE CASCADE
        )`
    ];

    try {
        for (const tableSQL of tables) {
            await db.runQuery(tableSQL);
        }
        logger.info('✅ تم إنشاء/التحقق من جميع الجداول بنجاح');
        
        // إضافة مستخدم مسؤول افتراضي إذا لم يكن موجوداً
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
        
        // إضافة سوق افتراضي إذا لم يكن موجوداً
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

// تهيئة قاعدة البيانات بشكل غير متزامن
let db;
initializeDatabase().then(database => {
    db = database;
    logger.info('✅ قاعدة البيانات جاهزة للاستخدام');
}).catch(error => {
    logger.error(`❌ فشل في تهيئة قاعدة البيانات: ${error.message}`);
    process.exit(1);
});

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
    },
    
    broadcastToRole(role, notification) {
        this.activeConnections.forEach((socketId, userId) => {
            if (io.sockets.sockets.get(socketId)) {
                io.to(socketId).emit('notification', notification);
            }
        });
        logger.info(`📢 إشعار عام للدور ${role}: ${notification.title}`);
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
    
    socket.on('joinRoom', (room) => {
        socket.join(room);
        logger.info(`👤 السوكيت ${socket.id} انضم للغرفة ${room}`);
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
        const R = 6371; // نصف قطر الأرض بالكيلومتر
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; // المسافة بالكيلومتر
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
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
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
        } else {
            logger.warn('⚠️ إعدادات SMTP غير متوفرة، سيتم تعطيل إرسال البريد الإلكتروني');
        }
    },
    
    async sendEmail(to, subject, html, attachments = []) {
        if (!this.transporter) {
            logger.warn('📧 خدمة البريد الإلكتروني غير مهيئة');
            return null;
        }
        
        try {
            const mailOptions = {
                from: `"تطبيق قات PRO" <${process.env.SMTP_USER || 'noreply@qat-app.com'}>`,
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
    },
    
    async sendOrderConfirmation(order, user) {
        const html = `
            <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2E7D32; text-align: center;">تأكيد طلبك #${order.order_code}</h2>
                <p>عزيزي ${user.name},</p>
                <p>شكراً لك على طلبك. تفاصيل الطلب:</p>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="border: 1px solid #ddd; padding: 8px;"><strong>رقم الطلب</strong></td>
                        <td style="border: 1px solid #ddd; padding: 8px;">${order.order_code}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #ddd; padding: 8px;"><strong>المبلغ الإجمالي</strong></td>
                        <td style="border: 1px solid #ddd; padding: 8px;">${helpers.formatCurrency(order.total)}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #ddd; padding: 8px;"><strong>حالة الطلب</strong></td>
                        <td style="border: 1px solid #ddd; padding: 8px;">${order.status}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #ddd; padding: 8px;"><strong>تاريخ الطلب</strong></td>
                        <td style="border: 1px solid #ddd; padding: 8px;">${helpers.formatDate(order.created_at)}</td>
                    </tr>
                </table>
                <p>سيتم تحديثك على حالة طلبك عبر التطبيق.</p>
                <hr>
                <p style="color: #666; font-size: 12px;">تطبيق قات PRO - نظام البيع والتوصيل المتكامل</p>
            </div>
        `;
        
        return this.sendEmail(user.email, `تأكيد طلبك #${order.order_code}`, html);
    }
};

// تهيئة خدمة البريد
emailService.initialize();

// 📊 نظام التقارير
const reportService = {
    async generateSalesReport(startDate, endDate) {
        const query = `
            SELECT 
                DATE(o.created_at) as date,
                COUNT(*) as order_count,
                SUM(o.total) as total_sales,
                AVG(o.total) as avg_order_value
            FROM orders o
            WHERE o.created_at BETWEEN ? AND ?
            GROUP BY DATE(o.created_at)
            ORDER BY date DESC
        `;
        
        return db.allQuery(query, [startDate, endDate]);
    },
    
    async generateProductReport() {
        const query = `
            SELECT 
                p.name,
                p.category,
                COUNT(oi.product_id) as units_sold,
                SUM(oi.total_price) as revenue,
                AVG(p.price) as avg_price
            FROM products p
            LEFT JOIN order_items oi ON p.id = oi.product_id
            GROUP BY p.id
            ORDER BY revenue DESC
        `;
        
        return db.allQuery(query);
    },
    
    async exportToExcel(data, filename) {
        try {
            const ws = xlsx.utils.json_to_sheet(data);
            const wb = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(wb, ws, 'Report');
            
            const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
            
            return {
                filename: `${filename}_${helpers.formatDate(new Date(), 'YYYY-MM-DD')}.xlsx`,
                buffer,
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            };
        } catch (error) {
            logger.error(`❌ خطأ في تصدير Excel: ${error.message}`);
            throw error;
        }
    },
    
    async generatePDFReport(data, title) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ margin: 50 });
                const buffers = [];
                
                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => {
                    const pdfData = Buffer.concat(buffers);
                    resolve({
                        filename: `${title}_${helpers.formatDate(new Date(), 'YYYY-MM-DD')}.pdf`,
                        buffer: pdfData,
                        type: 'application/pdf'
                    });
                });
                
                doc.font('Helvetica-Bold')
                   .fontSize(20)
                   .text(title, { align: 'center' });
                
                doc.moveDown();
                doc.fontSize(12);
                doc.text(`تاريخ التقرير: ${helpers.formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')}`);
                doc.text(`نسخة: ${VERSION}`);
                
                if (data.length > 0) {
                    doc.moveDown();
                    doc.font('Helvetica-Bold').text('البيانات:');
                    
                    data.forEach((item, index) => {
                        doc.moveDown();
                        doc.font('Helvetica').text(`${index + 1}. ${JSON.stringify(item, null, 2)}`);
                    });
                }
                
                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }
};

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

// متغيرات الصلاحيات المسبقة
const requireAdmin = requireRole('admin');
const requireSeller = requireRole('seller');
const requireBuyer = requireRole('buyer');
const requireDriver = requireRole('driver');
const requireAdminOrSeller = requireRole('admin', 'seller');

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

// ============ API Routes PRO ============

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

app.get('/api/status', requireAuth, requireAdmin, async (req, res) => {
    try {
        const stats = await db.allQuery(`
            SELECT 
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM products WHERE status = 'active') as active_products,
                (SELECT COUNT(*) FROM orders WHERE DATE(created_at) = DATE('now')) as today_orders,
                (SELECT SUM(total) FROM orders WHERE DATE(created_at) = DATE('now')) as today_revenue,
                (SELECT COUNT(*) FROM drivers WHERE status = 'available') as available_drivers,
                (SELECT COUNT(*) FROM markets WHERE status = 'active') as active_markets
        `);
        
        res.json({
            success: true,
            data: stats[0] || {}
        });
    } catch (error) {
        logger.error(`❌ خطأ في جلب الإحصائيات: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// 👤 المستخدمون والمصادقة
app.post('/api/register', [
    body('name').trim().notEmpty().withMessage('الاسم مطلوب'),
    body('email').trim().isEmail().withMessage('البريد الإلكتروني غير صحيح'),
    body('phone').trim().matches(/^[0-9]{9,15}$/).withMessage('رقم الهاتف غير صحيح'),
    body('password').isLength({ min: 6 }).withMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
    body('role').isIn(['buyer', 'seller', 'driver']).withMessage('نوع الحساب غير صحيح')
], validateRequest, async (req, res) => {
    try {
        const { name, email, phone, password, role, storeName, vehicleType, market_id } = req.body;
        
        logger.info(`📝 محاولة تسجيل جديد: ${email}`);
        
        if (!db) {
            return res.status(500).json({
                success: false,
                error: 'قاعدة البيانات غير جاهزة'
            });
        }
        
        const existingUser = await db.getQuery(
            'SELECT id FROM users WHERE email = ? OR phone = ?',
            [email, phone]
        );
        
        if (existingUser) {
            logger.warn(`❌ مستخدم موجود بالفعل: ${email}`);
            return res.status(400).json({
                success: false,
                error: 'البريد الإلكتروني أو رقم الهاتف مستخدم بالفعل'
            });
        }
        
        const hashedPassword = await helpers.hashPassword(password);
        const createdAt = new Date().toISOString();
        
        await db.runQuery('BEGIN TRANSACTION');
        
        try {
            const userResult = await db.runQuery(
                `INSERT INTO users (name, email, phone, password, role, status, created_at)
                 VALUES (?, ?, ?, ?, ?, 'active', ?)`,
                [name, email, phone, hashedPassword, role, createdAt]
            );
            
            const userId = userResult.lastID;
            
            await db.runQuery(
                `INSERT INTO wallets (user_id, balance, created_at)
                 VALUES (?, 0, ?)`,
                [userId, createdAt]
            );
            
            if (role === 'seller' && storeName) {
                await db.runQuery(
                    `INSERT INTO sellers (user_id, store_name, rating, total_sales, created_at)
                     VALUES (?, ?, 0, 0, ?)`,
                    [userId, storeName, createdAt]
                );
            }
            
            if (role === 'driver' && vehicleType) {
                await db.runQuery(
                    `INSERT INTO drivers (user_id, market_id, vehicle_type, rating, status, created_at)
                     VALUES (?, ?, ?, 0, 'available', ?)`,
                    [userId, market_id || null, vehicleType, createdAt]
                );
            }
            
            await db.runQuery(
                `INSERT INTO notifications (user_id, title, message, is_read, created_at)
                 VALUES (?, ?, ?, 0, ?)`,
                [userId, 'مرحباً بك!', 'تم إنشاء حسابك بنجاح في تطبيق قات PRO', createdAt]
            );
            
            await db.runQuery('COMMIT');
            
            req.session.userId = userId;
            req.session.role = role;
            req.session.userEmail = email;
            
            const userData = {
                id: userId,
                name,
                email,
                phone,
                role,
                storeName: role === 'seller' ? storeName : undefined,
                vehicleType: role === 'driver' ? vehicleType : undefined,
                market_id: role === 'driver' ? market_id : undefined
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
            
            logger.info(`✅ تم إنشاء حساب جديد: ${email} (ID: ${userId})`);
            
            res.json({
                success: true,
                message: 'تم إنشاء الحساب بنجاح',
                user: userData,
                token: helpers.encrypt(userId.toString())
            });
            
        } catch (error) {
            await db.runQuery('ROLLBACK');
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
        
        logger.info(`🔐 محاولة تسجيل دخول: ${email}`);
        
        if (!db) {
            return res.status(500).json({
                success: false,
                error: 'قاعدة البيانات غير جاهزة'
            });
        }
        
        const user = await db.getQuery(
            'SELECT * FROM users WHERE email = ? AND status = "active"',
            [email]
        );
        
        if (!user) {
            logger.warn(`❌ مستخدم غير موجود: ${email}`);
            return res.status(401).json({
                success: false,
                error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
            });
        }
        
        const validPassword = await helpers.verifyPassword(password, user.password);
        if (!validPassword) {
            logger.warn(`❌ كلمة مرور خاطئة: ${email}`);
            return res.status(401).json({
                success: false,
                error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
            });
        }
        
        req.session.userId = user.id;
        req.session.role = user.role;
        req.session.userEmail = user.email;
        
        await db.runQuery(
            'UPDATE users SET last_login = ? WHERE id = ?',
            [new Date().toISOString(), user.id]
        );
        
        let additionalInfo = {};
        if (user.role === 'seller') {
            const sellerInfo = await db.getQuery(
                'SELECT store_name, rating, total_sales FROM sellers WHERE user_id = ?',
                [user.id]
            );
            additionalInfo = sellerInfo || {};
        } else if (user.role === 'driver') {
            const driverInfo = await db.getQuery(
                'SELECT vehicle_type, rating, status, market_id FROM drivers WHERE user_id = ?',
                [user.id]
            );
            additionalInfo = driverInfo || {};
        }
        
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
            ...additionalInfo,
            balance: wallet ? wallet.balance : 0
        };
        
        logger.info(`✅ تسجيل دخول ناجح: ${email} (ID: ${user.id})`);
        
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
            error: 'حدث خطأ أثناء تسجيل الدخول',
            details: IS_PRODUCTION ? undefined : error.message
        });
    }
});

app.post('/api/logout', requireAuth, (req, res) => {
    logger.info(`👋 تسجيل خروج: ${req.session.userEmail}`);
    
    req.session.destroy((err) => {
        if (err) {
            logger.error(`❌ خطأ في تسجيل الخروج: ${err.message}`);
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

app.get('/api/auth/check', (req, res) => {
    if (req.session.userId) {
        if (!db) {
            return res.json({ isAuthenticated: false });
        }
        
        db.getQuery(
            'SELECT id, name, email, phone, role, avatar FROM users WHERE id = ?',
            [req.session.userId]
        ).then(user => {
            if (!user) {
                return res.json({ isAuthenticated: false });
            }
            res.json({ isAuthenticated: true, user });
        }).catch(error => {
            logger.error(`❌ خطأ في التحقق من المصادقة: ${error.message}`);
            res.json({ isAuthenticated: false });
        });
    } else {
        res.json({ isAuthenticated: false });
    }
});

// 🔄 الملف الشخصي
app.get('/api/profile', requireAuth, async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({
                success: false,
                error: 'قاعدة البيانات غير جاهزة'
            });
        }
        
        const user = await db.getQuery(
            `SELECT u.*, w.balance, 
                    s.store_name, s.rating as seller_rating, s.total_sales,
                    d.vehicle_type, d.rating as driver_rating, d.status as driver_status,
                    d.market_id, m.name as market_name
             FROM users u
             LEFT JOIN wallets w ON u.id = w.user_id
             LEFT JOIN sellers s ON u.id = s.user_id
             LEFT JOIN drivers d ON u.id = d.user_id
             LEFT JOIN markets m ON d.market_id = m.id
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

// 🏪 الأسواق
app.get('/api/markets', async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({
                success: false,
                error: 'قاعدة البيانات غير جاهزة'
            });
        }
        
        logger.info('🏪 جلب قائمة الأسواق');
        
        const markets = await db.allQuery(
            `SELECT m.*, 
                    COUNT(DISTINCT p.id) as product_count,
                    COUNT(DISTINCT s.id) as seller_count,
                    COUNT(DISTINCT d.id) as driver_count
             FROM markets m
             LEFT JOIN products p ON m.id = p.market_id AND p.status = 'active'
             LEFT JOIN sellers s ON p.seller_id = s.user_id
             LEFT JOIN drivers d ON m.id = d.market_id AND d.status = 'available'
             WHERE m.status = 'active'
             GROUP BY m.id
             ORDER BY m.name`,
            []
        );
        
        logger.info(`✅ تم جلب ${markets.length} سوق`);
        
        res.json({
            success: true,
            data: markets,
            meta: {
                count: markets.length,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error(`❌ خطأ في جلب الأسواق: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// 🛒 المنتجات
app.get('/api/products', async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({
                success: false,
                error: 'قاعدة البيانات غير جاهزة'
            });
        }
        
        const {
            category,
            market_id,
            seller_id,
            min_price,
            max_price,
            search,
            sort_by = 'created_at',
            sort_order = 'DESC',
            page = 1,
            limit = 20
        } = req.query;
        
        logger.info(`🛒 جلب المنتجات: ${JSON.stringify(req.query)}`);
        
        let query = `
            SELECT p.*, u.name as seller_name, u.avatar as seller_avatar,
                   s.store_name, s.rating as seller_rating,
                   m.name as market_name, m.location as market_location,
                   (SELECT AVG(rating) FROM reviews WHERE product_id = p.id) as average_rating,
                   (SELECT COUNT(*) FROM reviews WHERE product_id = p.id) as review_count
            FROM products p
            LEFT JOIN users u ON p.seller_id = u.id
            LEFT JOIN sellers s ON p.seller_id = s.user_id
            LEFT JOIN markets m ON p.market_id = m.id
            WHERE p.status = 'active'
        `;
        
        const params = [];
        
        if (category) {
            query += ' AND p.category = ?';
            params.push(category);
        }
        
        if (market_id) {
            query += ' AND p.market_id = ?';
            params.push(market_id);
        }
        
        if (seller_id) {
            query += ' AND p.seller_id = ?';
            params.push(seller_id);
        }
        
        if (min_price) {
            query += ' AND p.price >= ?';
            params.push(min_price);
        }
        
        if (max_price) {
            query += ' AND p.price <= ?';
            params.push(max_price);
        }
        
        if (search) {
            query += ' AND (p.name LIKE ? OR p.description LIKE ? OR p.specifications LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }
        
        const countQuery = `SELECT COUNT(*) as total ${query.substring(query.indexOf('FROM'))}`;
        const countResult = await db.getQuery(countQuery, params);
        const total = countResult ? countResult.total : 0;
        
        const validSortColumns = ['price', 'created_at', 'average_rating'];
        const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
        const order = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        
        query += ` ORDER BY ${sortColumn} ${order}`;
        
        const offset = (page - 1) * limit;
        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);
        
        const products = await db.allQuery(query, params);
        
        logger.info(`✅ تم جلب ${products.length} منتج من أصل ${total}`);
        
        res.json({
            success: true,
            data: products,
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit),
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error(`❌ خطأ في جلب المنتجات: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// 💰 المحفظة
app.get('/api/wallet', requireAuth, async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({
                success: false,
                error: 'قاعدة البيانات غير جاهزة'
            });
        }
        
        const wallet = await db.getQuery(
            `SELECT w.*, u.name as user_name
             FROM wallets w
             LEFT JOIN users u ON w.user_id = u.id
             WHERE w.user_id = ?`,
            [req.session.userId]
        );
        
        if (!wallet) {
            const result = await db.runQuery(
                'INSERT INTO wallets (user_id, balance, created_at) VALUES (?, 0, ?)',
                [req.session.userId, new Date().toISOString()]
            );
            
            res.json({
                success: true,
                data: {
                    id: result.lastID,
                    user_id: req.session.userId,
                    balance: 0,
                    created_at: new Date().toISOString()
                }
            });
        } else {
            const transactions = await db.allQuery(
                `SELECT * FROM transactions 
                 WHERE user_id = ? 
                 ORDER BY created_at DESC 
                 LIMIT 10`,
                [req.session.userId]
            );
            
            res.json({
                success: true,
                data: {
                    ...wallet,
                    transactions
                }
            });
        }
    } catch (error) {
        logger.error(`❌ خطأ في جلب المحفظة: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// 📋 الطلبات
app.get('/api/orders', requireAuth, async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        
        let query = `
            SELECT o.*, 
                   u.name as buyer_name,
                   d.user_id as driver_user_id,
                   du.name as driver_name,
                   COUNT(oi.id) as item_count
            FROM orders o
            LEFT JOIN users u ON o.buyer_id = u.id
            LEFT JOIN drivers d ON o.driver_id = d.id
            LEFT JOIN users du ON d.user_id = du.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            WHERE o.buyer_id = ?
        `;
        
        const params = [req.session.userId];
        
        if (status) {
            query += ' AND o.status = ?';
            params.push(status);
        }
        
        query += ' GROUP BY o.id ORDER BY o.created_at DESC';
        
        const offset = (page - 1) * limit;
        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);
        
        const orders = await db.allQuery(query, params);
        
        // جلب العناصر لكل طلب
        for (const order of orders) {
            const items = await db.allQuery(
                `SELECT oi.*, p.name as product_name, p.image as product_image
                 FROM order_items oi
                 LEFT JOIN products p ON oi.product_id = p.id
                 WHERE oi.order_id = ?`,
                [order.id]
            );
            order.items = items;
        }
        
        res.json({
            success: true,
            data: orders,
            meta: {
                page: parseInt(page),
                limit: parseInt(limit),
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error(`❌ خطأ في جلب الطلبات: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

app.post('/api/orders', requireAuth, requireBuyer, async (req, res) => {
    try {
        const { items, shipping_address, payment_method, wash_qat = 0 } = req.body;
        
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'يجب اختيار منتجات للطلب'
            });
        }
        
        if (!shipping_address) {
            return res.status(400).json({
                success: false,
                error: 'عنوان التوصيل مطلوب'
            });
        }
        
        await db.runQuery('BEGIN TRANSACTION');
        
        try {
            // حساب المجموع
            let total = 0;
            const orderItems = [];
            
            for (const item of items) {
                const product = await db.getQuery(
                    'SELECT id, seller_id, price, quantity, name FROM products WHERE id = ? AND status = "active"',
                    [item.product_id]
                );
                
                if (!product) {
                    throw new Error(`المنتج غير موجود: ${item.product_id}`);
                }
                
                if (product.quantity < item.quantity) {
                    throw new Error(`الكمية غير متوفرة للمنتج: ${product.name}`);
                }
                
                const itemTotal = product.price * item.quantity;
                total += itemTotal;
                
                orderItems.push({
                    product_id: product.id,
                    seller_id: product.seller_id,
                    quantity: item.quantity,
                    unit_price: product.price,
                    total_price: itemTotal
                });
                
                // تحديث كمية المنتج
                await db.runQuery(
                    'UPDATE products SET quantity = quantity - ? WHERE id = ?',
                    [item.quantity, product.id]
                );
            }
            
            // خصم تكلفة الغسيل إن وجدت
            if (wash_qat > 0) {
                total += wash_qat * 500; // سعر افتراضي للغسيل
            }
            
            // التحقق من رصيد المحفظة إذا كان الدفع بالمحفظة
            if (payment_method === 'wallet') {
                const wallet = await db.getQuery(
                    'SELECT balance FROM wallets WHERE user_id = ?',
                    [req.session.userId]
                );
                
                if (!wallet || wallet.balance < total) {
                    throw new Error('رصيد المحفظة غير كافي');
                }
            }
            
            // إنشاء الطلب
            const orderCode = helpers.generateOrderCode();
            const orderResult = await db.runQuery(
                `INSERT INTO orders (buyer_id, total, shipping_address, payment_method, wash_qat, order_code, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [req.session.userId, total, shipping_address, payment_method, wash_qat, orderCode, new Date().toISOString()]
            );
            
            const orderId = orderResult.lastID;
            
            // إضافة عناصر الطلب
            for (const item of orderItems) {
                await db.runQuery(
                    `INSERT INTO order_items (order_id, product_id, seller_id, quantity, unit_price, total_price)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [orderId, item.product_id, item.seller_id, item.quantity, item.unit_price, item.total_price]
                );
            }
            
            // خصم المبلغ من المحفظة إذا كان الدفع بالمحفظة
            if (payment_method === 'wallet') {
                await db.runQuery(
                    'UPDATE wallets SET balance = balance - ? WHERE user_id = ?',
                    [total, req.session.userId]
                );
                
                // تسجيل المعاملة
                await db.runQuery(
                    `INSERT INTO transactions (user_id, amount, type, method, status, created_at)
                     VALUES (?, ?, 'purchase', 'wallet', 'completed', ?)`,
                    [req.session.userId, total, new Date().toISOString()]
                );
            }
            
            // إنشاء إشعار للمشتري
            await db.runQuery(
                `INSERT INTO notifications (user_id, title, message, type, created_at)
                 VALUES (?, ?, ?, 'success', ?)`,
                [req.session.userId, 'طلب جديد', `تم إنشاء طلبك #${orderCode} بنجاح`, new Date().toISOString()]
            );
            
            // إشعار البائعين
            const sellerIds = [...new Set(orderItems.map(item => item.seller_id))];
            for (const sellerId of sellerIds) {
                await db.runQuery(
                    `INSERT INTO notifications (user_id, title, message, type, created_at)
                     VALUES (?, ?, ?, 'info', ?)`,
                    [sellerId, 'طلب جديد', `لديك طلب جديد #${orderCode}`, new Date().toISOString()]
                );
                
                // إرسال إشعار عبر WebSocket
                notificationManager.sendNotification(sellerId, {
                    title: 'طلب جديد',
                    message: `لديك طلب جديد #${orderCode}`,
                    type: 'info',
                    timestamp: new Date().toISOString()
                });
            }
            
            // إرسال بريد تأكيد
            const buyer = await db.getQuery('SELECT name, email FROM users WHERE id = ?', [req.session.userId]);
            const order = await db.getQuery('SELECT * FROM orders WHERE id = ?', [orderId]);
            
            if (emailService.transporter && buyer && order) {
                try {
                    await emailService.sendOrderConfirmation(order, buyer);
                } catch (emailError) {
                    logger.error(`❌ خطأ في إرسال بريد التأكيد: ${emailError.message}`);
                }
            }
            
            await db.runQuery('COMMIT');
            
            res.json({
                success: true,
                message: 'تم إنشاء الطلب بنجاح',
                order: {
                    id: orderId,
                    order_code: orderCode,
                    total,
                    status: 'pending'
                }
            });
            
        } catch (error) {
            await db.runQuery('ROLLBACK');
            throw error;
        }
        
    } catch (error) {
        logger.error(`❌ خطأ في إنشاء الطلب: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ أثناء إنشاء الطلب',
            details: IS_PRODUCTION ? undefined : error.message
        });
    }
});

// 🚗 السائقين
app.get('/api/drivers', async (req, res) => {
    try {
        const { market_id, status = 'available' } = req.query;
        
        let query = `
            SELECT d.*, u.name, u.phone, u.avatar, m.name as market_name
            FROM drivers d
            LEFT JOIN users u ON d.user_id = u.id
            LEFT JOIN markets m ON d.market_id = m.id
            WHERE d.status = ?
        `;
        
        const params = [status];
        
        if (market_id) {
            query += ' AND d.market_id = ?';
            params.push(market_id);
        }
        
        query += ' ORDER BY d.rating DESC';
        
        const drivers = await db.allQuery(query, params);
        
        res.json({
            success: true,
            data: drivers,
            meta: {
                count: drivers.length,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error(`❌ خطأ في جلب السائقين: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// 🔔 الإشعارات
app.get('/api/notifications', requireAuth, async (req, res) => {
    try {
        const { page = 1, limit = 20, unread_only } = req.query;
        
        let query = 'SELECT * FROM notifications WHERE user_id = ?';
        const params = [req.session.userId];
        
        if (unread_only === 'true') {
            query += ' AND is_read = 0';
        }
        
        query += ' ORDER BY created_at DESC';
        
        const offset = (page - 1) * limit;
        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);
        
        const notifications = await db.allQuery(query, params);
        
        res.json({
            success: true,
            data: notifications,
            meta: {
                page: parseInt(page),
                limit: parseInt(limit),
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error(`❌ خطأ في جلب الإشعارات: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

app.put('/api/notifications/:id/read', requireAuth, async (req, res) => {
    try {
        await db.runQuery(
            'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
            [req.params.id, req.session.userId]
        );
        
        res.json({
            success: true,
            message: 'تم تحديث حالة الإشعار'
        });
    } catch (error) {
        logger.error(`❌ خطأ في تحديث الإشعار: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// 📊 التقارير
app.get('/api/reports/sales', requireAuth, requireAdminOrSeller, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        let query = `
            SELECT 
                DATE(o.created_at) as date,
                COUNT(*) as order_count,
                SUM(o.total) as total_sales,
                AVG(o.total) as avg_order_value
            FROM orders o
            WHERE 1=1
        `;
        
        const params = [];
        
        if (start_date) {
            query += ' AND DATE(o.created_at) >= ?';
            params.push(start_date);
        }
        
        if (end_date) {
            query += ' AND DATE(o.created_at) <= ?';
            params.push(end_date);
        }
        
        if (req.session.role === 'seller') {
            query += `
                AND o.id IN (
                    SELECT oi.order_id 
                    FROM order_items oi 
                    WHERE oi.seller_id = ?
                )
            `;
            params.push(req.session.userId);
        }
        
        query += ' GROUP BY DATE(o.created_at) ORDER BY date DESC';
        
        const report = await db.allQuery(query, params);
        
        res.json({
            success: true,
            data: report,
            meta: {
                period: `${start_date || 'البداية'} - ${end_date || 'النهاية'}`,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error(`❌ خطأ في جلب تقرير المبيعات: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// 📥 رفع الملفات
app.post('/api/upload', requireAuth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'لم يتم رفع أي ملف'
            });
        }
        
        const uploadsDir = path.join(__dirname, 'uploads');
        await fs.mkdir(uploadsDir, { recursive: true });
        
        const fileExt = path.extname(req.file.originalname);
        const fileName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${fileExt}`;
        const filePath = path.join(uploadsDir, fileName);
        
        await fs.writeFile(filePath, req.file.buffer);
        
        res.json({
            success: true,
            data: {
                filename: fileName,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                path: `/uploads/${fileName}`
            }
        });
    } catch (error) {
        logger.error(`❌ خطأ في رفع الملف: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في رفع الملف' });
    }
});

// 📁 خدمة الملفات المحملة
app.get('/uploads/*', (req, res) => {
    const filePath = path.join(__dirname, req.path);
    
    fs.access(filePath)
        .then(() => {
            res.setHeader('Cache-Control', 'public, max-age=31536000');
            res.sendFile(filePath);
        })
        .catch(() => {
            res.status(404).json({
                success: false,
                error: 'الملف غير موجود'
            });
        });
});

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

const startServer = async () => {
    try {
        // إنشاء المجلدات المطلوبة
        const requiredDirs = [
            'uploads',
            'uploads/products',
            'uploads/ads',
            'uploads/avatars',
            'data',
            'logs',
            'backups',
            'public'
        ];
        
        for (const dir of requiredDirs) {
            const dirPath = path.join(__dirname, dir);
            try {
                await fs.access(dirPath);
            } catch {
                await fs.mkdir(dirPath, { recursive: true });
                logger.info(`📁 تم إنشاء مجلد: ${dir}`);
            }
        }
        
        // التحقق من وجود مجلد public
        const publicPath = path.join(__dirname, 'public');
        try {
            await fs.access(publicPath);
        } catch {
            // إنشاء ملف index.html بسيط إذا لم يكن موجوداً
            const htmlContent = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>تطبيق قات PRO</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2E7D32;
        }
        .status {
            background: #4CAF50;
            color: white;
            padding: 10px;
            border-radius: 5px;
            margin: 20px 0;
        }
        .info {
            text-align: right;
            margin-top: 30px;
            padding: 15px;
            background: #f9f9f9;
            border-right: 4px solid #2E7D32;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 تطبيق قات PRO</h1>
        <div class="status">
            ✅ الخادم يعمل بنجاح
        </div>
        <p>نظام البيع والتوصيل المتكامل للقات</p>
        
        <div class="info">
            <h3>📊 معلومات النظام:</h3>
            <p><strong>الإصدار:</strong> ${VERSION}</p>
            <p><strong>البيئة:</strong> ${process.env.NODE_ENV || 'development'}</p>
            <p><strong>المنفذ:</strong> ${PORT}</p>
            <p><strong>التاريخ:</strong> ${new Date().toLocaleString('ar-YE')}</p>
        </div>
        
        <div style="margin-top: 30px;">
            <h3>📚 وثائق API:</h3>
            <p><a href="/api/health">فحص صحة الخادم</a></p>
            <p><a href="/api/markets">قائمة الأسواق</a></p>
            <p><a href="/api/products">المنتجات</a></p>
            <p><a href="/api/drivers">السائقين المتاحين</a></p>
        </div>
    </div>
</body>
</html>`;
            await fs.writeFile(path.join(publicPath, 'index.html'), htmlContent);
            logger.info('📄 تم إنشاء صفحة رئيسية افتراضية');
        }
        
        server.listen(PORT, () => {
            logger.info(`🚀 تطبيق قات PRO يعمل على المنفذ ${PORT}`);
            logger.info(`🌐 الإصدار: ${VERSION}`);
            logger.info(`⚙️  البيئة: ${process.env.NODE_ENV || 'development'}`);
            logger.info(`📊 التطبيق جاهز للاستخدام`);
        });
    } catch (error) {
        logger.error(`❌ خطأ في بدء الخادم: ${error.message}`);
        process.exit(1);
    }
};

startServer();

// معالج إيقاف التشغيل
const shutdown = () => {
    logger.info('🛑 إيقاف الخادم...');
    
    notificationManager.activeConnections.clear();
    
    if (db) {
        db.close((err) => {
            if (err) {
                logger.error(`❌ خطأ في إغلاق قاعدة البيانات: ${err.message}`);
            } else {
                logger.info('✅ تم إغلاق قاعدة البيانات');
            }
        });
    }
    
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
