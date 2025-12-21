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
 // الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// لوحة التحكم
app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// الملفات الثابتة
app.use(express.static(path.join(__dirname, 'public')));
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

// 📊 قاعدة البيانات
const db = require('./database');

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
        // إرسال إشعار لكل المستخدمين بلون معين
        this.activeConnections.forEach((socketId, userId) => {
            // هنا يمكن إضافة منطق للتحقق من دور المستخدم
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
            // التحقق من صحة التوكن (مبسط)
            if (userId && token) {
                socket.join(`user_${userId}`);
                socket.userId = userId;
                notificationManager.addConnection(userId, socket.id);
                
                logger.info(`✅ مصادقة ناجحة: المستخدم ${userId} انضم للغرفة`);
                
                // إرسال ترحيب
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
            
            // تحسين الصورة
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
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    emailService.initialize();
}

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
                
                // محتوى التقرير
                doc.font('Helvetica-Bold')
                   .fontSize(20)
                   .text(title, { align: 'center' });
                
                doc.moveDown();
                doc.fontSize(12);
                doc.text(`تاريخ التقرير: ${helpers.formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')}`);
                doc.text(`نسخة: ${VERSION}`);
                
                // إضافة البيانات
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
    
    // تحليل معلومات الزائر
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
        const { name, email, phone, password, role, storeName, vehicleType } = req.body;
        
        logger.info(`📝 محاولة تسجيل جديد: ${email}`);
        
        // التحقق من وجود المستخدم
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
        
        // تشفير كلمة المرور
        const hashedPassword = await helpers.hashPassword(password);
        const createdAt = new Date().toISOString();
        
        // بدء معاملة قاعدة البيانات
        await db.run('BEGIN TRANSACTION');
        
        try {
            // إنشاء المستخدم
            const userResult = await db.run(
                `INSERT INTO users (name, email, phone, password, role, status, created_at)
                 VALUES (?, ?, ?, ?, ?, 'active', ?)`,
                [name, email, phone, hashedPassword, role, createdAt]
            );
            
            const userId = userResult.lastID;
            
            // إنشاء المحفظة
            await db.run(
                `INSERT INTO wallets (user_id, balance, created_at)
                 VALUES (?, 0, ?)`,
                [userId, createdAt]
            );
            
            // إنشاء متجر إذا كان بائعاً
            if (role === 'seller' && storeName) {
                await db.run(
                    `INSERT INTO sellers (user_id, store_name, rating, total_sales, created_at)
                     VALUES (?, ?, 0, 0, ?)`,
                    [userId, storeName, createdAt]
                );
            }
            
            // إنشاء سجل مندوب إذا كان مندوب توصيل
            if (role === 'driver' && vehicleType) {
                await db.run(
                    `INSERT INTO drivers (user_id, vehicle_type, rating, status, created_at)
                     VALUES (?, ?, 0, 'available', ?)`,
                    [userId, vehicleType, createdAt]
                );
            }
            
            // إنشاء إشعار ترحيبي
            await db.run(
                `INSERT INTO notifications (user_id, title, message, is_read, created_at)
                 VALUES (?, ?, ?, 0, ?)`,
                [userId, 'مرحباً بك!', 'تم إنشاء حسابك بنجاح في تطبيق قات PRO', createdAt]
            );
            
            await db.run('COMMIT');
            
            // تسجيل الدخول التلقائي
            req.session.userId = userId;
            req.session.role = role;
            req.session.userEmail = email;
            
            // إعداد بيانات المستخدم للرد
            const userData = {
                id: userId,
                name,
                email,
                phone,
                role,
                storeName: role === 'seller' ? storeName : undefined,
                vehicleType: role === 'driver' ? vehicleType : undefined
            };
            
            // إرسال بريد ترحيبي
            if (emailService.transporter) {
                try {
                    await emailService.sendWelcomeEmail(userData);
                } catch (emailError) {
                    logger.error(`❌ خطأ في إرسال البريد الترحيبي: ${emailError.message}`);
                }
            }
            
            // إرسال إشعار مباشر
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
            await db.run('ROLLBACK');
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
        
        // جلب المستخدم
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
        
        // التحقق من كلمة المرور
        const validPassword = await helpers.verifyPassword(password, user.password);
        if (!validPassword) {
            logger.warn(`❌ كلمة مرور خاطئة: ${email}`);
            return res.status(401).json({
                success: false,
                error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
            });
        }
        
        // تحديث الجلسة
        req.session.userId = user.id;
        req.session.role = user.role;
        req.session.userEmail = user.email;
        
        // تحديث آخر دخول
        await db.run(
            'UPDATE users SET last_login = ? WHERE id = ?',
            [new Date().toISOString(), user.id]
        );
        
        // جلب معلومات إضافية
        let additionalInfo = {};
        if (user.role === 'seller') {
            const sellerInfo = await db.getQuery(
                'SELECT store_name, rating, total_sales FROM sellers WHERE user_id = ?',
                [user.id]
            );
            additionalInfo = sellerInfo || {};
        } else if (user.role === 'driver') {
            const driverInfo = await db.getQuery(
                'SELECT vehicle_type, rating, status FROM drivers WHERE user_id = ?',
                [user.id]
            );
            additionalInfo = driverInfo || {};
        }
        
        // جلب المحفظة
        const wallet = await db.getQuery(
            'SELECT balance FROM wallets WHERE user_id = ?',
            [user.id]
        );
        
        // إعداد بيانات المستخدم
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
        const user = await db.getQuery(
            `SELECT u.*, w.balance, 
                    s.store_name, s.rating as seller_rating, s.total_sales,
                    d.vehicle_type, d.rating as driver_rating, d.status as driver_status
             FROM users u
             LEFT JOIN wallets w ON u.id = w.user_id
             LEFT JOIN sellers s ON u.id = s.user_id
             LEFT JOIN drivers d ON u.id = d.user_id
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

app.put('/api/profile', requireAuth, [
    body('name').optional().trim().notEmpty().withMessage('الاسم لا يمكن أن يكون فارغاً'),
    body('phone').optional().trim().matches(/^[0-9]{9,15}$/).withMessage('رقم الهاتف غير صحيح')
], validateRequest, async (req, res) => {
    try {
        const { name, phone } = req.body;
        
        await db.run(
            'UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE id = ?',
            [name, phone, new Date().toISOString(), req.session.userId]
        );
        
        logger.info(`📝 تم تحديث الملف الشخصي للمستخدم: ${req.session.userId}`);
        
        res.json({
            success: true,
            message: 'تم تحديث الملف الشخصي بنجاح'
        });
    } catch (error) {
        logger.error(`❌ خطأ في تحديث الملف الشخصي: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

app.post('/api/profile/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'يرجى اختيار صورة'
            });
        }
        
        // معالجة الصورة
        const processedImage = await imageProcessor.createThumbnail(req.file.buffer);
        
        // حفظ الصورة
        const filename = `avatar_${req.session.userId}_${Date.now()}.webp`;
        const filepath = path.join(__dirname, 'uploads', 'avatars', filename);
        
        await fs.writeFile(filepath, processedImage.buffer);
        
        // تحديث قاعدة البيانات
        await db.run(
            'UPDATE users SET avatar = ? WHERE id = ?',
            [`/uploads/avatars/${filename}`, req.session.userId]
        );
        
        logger.info(`🖼️ تم تحديث صورة الملف الشخصي للمستخدم: ${req.session.userId}`);
        
        res.json({
            success: true,
            message: 'تم تحديث الصورة بنجاح',
            avatar: `/uploads/avatars/${filename}`
        });
    } catch (error) {
        logger.error(`❌ خطأ في تحديث الصورة: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في تحديث الصورة' });
    }
});

// 🏪 الأسواق (كاملة)
app.get('/api/markets', async (req, res) => {
    try {
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

app.get('/api/markets/:id', async (req, res) => {
    try {
        const marketId = req.params.id;
        
        logger.info(`🏪 جلب تفاصيل السوق: ${marketId}`);
        
        const market = await db.getQuery(
            `SELECT m.*,
                    COUNT(DISTINCT p.id) as product_count,
                    COUNT(DISTINCT s.id) as seller_count,
                    COUNT(DISTINCT ws.id) as wash_station_count
             FROM markets m
             LEFT JOIN products p ON m.id = p.market_id AND p.status = 'active'
             LEFT JOIN sellers s ON p.seller_id = s.user_id
             LEFT JOIN wash_stations ws ON m.id = ws.market_id AND ws.status = 'active'
             WHERE m.id = ? AND m.status = 'active'
             GROUP BY m.id`,
            [marketId]
        );
        
        if (!market) {
            return res.status(404).json({
                success: false,
                error: 'السوق غير موجود'
            });
        }
        
        // جلب المنتجات الرائجة في هذا السوق
        const topProducts = await db.allQuery(
            `SELECT p.*, u.name as seller_name, s.store_name
             FROM products p
             LEFT JOIN users u ON p.seller_id = u.id
             LEFT JOIN sellers s ON p.seller_id = s.user_id
             WHERE p.market_id = ? AND p.status = 'active'
             ORDER BY p.created_at DESC
             LIMIT 10`,
            [marketId]
        );
        
        // جلب محطات الغسيل
        const washStations = await db.allQuery(
            `SELECT * FROM wash_stations 
             WHERE market_id = ? AND status = 'active'
             ORDER BY name`,
            [marketId]
        );
        
        res.json({
            success: true,
            data: {
                ...market,
                top_products: topProducts,
                wash_stations: washStations
            }
        });
    } catch (error) {
        logger.error(`❌ خطأ في جلب تفاصيل السوق: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// 🛒 المنتجات (كاملة)
app.get('/api/products', async (req, res) => {
    try {
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
        
        // جلب العدد الكلي
        const countQuery = `SELECT COUNT(*) as total ${query.substring(query.indexOf('FROM'))}`;
        const countResult = await db.getQuery(countQuery, params);
        const total = countResult.total;
        
        // إضافة الترتيب والمحدودية
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

app.get('/api/products/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        
        logger.info(`🛒 جلب تفاصيل المنتج: ${productId}`);
        
        const product = await db.getQuery(
            `SELECT p.*, u.name as seller_name, u.avatar as seller_avatar,
                    u.phone as seller_phone, u.email as seller_email,
                    s.store_name, s.rating as seller_rating, s.total_sales,
                    m.name as market_name, m.location as market_location,
                    (SELECT AVG(rating) FROM reviews WHERE product_id = p.id) as average_rating,
                    (SELECT COUNT(*) FROM reviews WHERE product_id = p.id) as review_count
             FROM products p
             LEFT JOIN users u ON p.seller_id = u.id
             LEFT JOIN sellers s ON p.seller_id = s.user_id
             LEFT JOIN markets m ON p.market_id = m.id
             WHERE p.id = ? AND p.status = 'active'`,
            [productId]
        );
        
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'المنتج غير موجود'
            });
        }
        
        // جلب التقييمات
        const reviews = await db.allQuery(
            `SELECT r.*, u.name as user_name, u.avatar as user_avatar
             FROM reviews r
             LEFT JOIN users u ON r.user_id = u.id
             WHERE r.product_id = ?
             ORDER BY r.created_at DESC
             LIMIT 20`,
            [productId]
        );
        
        // جلب منتجات مشابهة
        const similarProducts = await db.allQuery(
            `SELECT p.*, u.name as seller_name, s.store_name
             FROM products p
             LEFT JOIN users u ON p.seller_id = u.id
             LEFT JOIN sellers s ON p.seller_id = s.user_id
             WHERE p.category = ? AND p.id != ? AND p.status = 'active'
             ORDER BY RANDOM()
             LIMIT 6`,
            [product.category, productId]
        );
        
        res.json({
            success: true,
            data: {
                ...product,
                reviews,
                similar_products: similarProducts
            }
        });
    } catch (error) {
        logger.error(`❌ خطأ في جلب تفاصيل المنتج: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

app.post('/api/products', requireAuth, requireSeller, [
    body('name').trim().notEmpty().withMessage('اسم المنتج مطلوب'),
    body('price').isFloat({ min: 1 }).withMessage('السعر يجب أن يكون رقم صحيح'),
    body('category').trim().notEmpty().withMessage('الفئة مطلوبة'),
    body('quantity').isInt({ min: 0 }).withMessage('الكمية يجب أن تكون رقم صحيح'),
    body('market_id').isInt().withMessage('معرف السوق غير صحيح')
], validateRequest, upload.single('image'), async (req, res) => {
    try {
        const { name, description, price, category, quantity, market_id, specifications } = req.body;
        
        logger.info(`➕ إضافة منتج جديد: ${name} بواسطة البائع ${req.session.userId}`);
        
        let imagePath = null;
        if (req.file) {
            // معالجة وحفظ الصورة
            const processedImage = await imageProcessor.processImage(req.file.buffer);
            const filename = `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.webp`;
            const filepath = path.join(__dirname, 'uploads', 'products', filename);
            
            await fs.writeFile(filepath, processedImage.buffer);
            imagePath = `/uploads/products/${filename}`;
        }
        
        const productData = {
            seller_id: req.session.userId,
            market_id,
            name,
            description: description || '',
            price: parseFloat(price),
            image: imagePath,
            category,
            quantity: parseInt(quantity),
            specifications: specifications || '',
            status: 'active',
            created_at: new Date().toISOString()
        };
        
        const result = await db.run(
            `INSERT INTO products 
             (seller_id, market_id, name, description, price, image, category, quantity, specifications, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            Object.values(productData)
        );
        
        const productId = result.lastID;
        
        logger.info(`✅ تم إضافة المنتج بنجاح: ${productId}`);
        
        // إرسال إشعار للبائع
        notificationManager.sendNotification(req.session.userId, {
            title: 'تم إضافة منتج جديد',
            message: `تمت إضافة المنتج "${name}" بنجاح`,
            type: 'success',
            timestamp: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'تم إضافة المنتج بنجاح',
            data: { id: productId, ...productData }
        });
    } catch (error) {
        logger.error(`❌ خطأ في إضافة المنتج: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في إضافة المنتج' });
    }
});

// 💰 المحفظة والمعاملات
app.get('/api/wallet', requireAuth, async (req, res) => {
    try {
        const wallet = await db.getQuery(
            `SELECT w.*, u.name as user_name
             FROM wallets w
             LEFT JOIN users u ON w.user_id = u.id
             WHERE w.user_id = ?`,
            [req.session.userId]
        );
        
        if (!wallet) {
            // إنشاء محفظة إذا لم تكن موجودة
            const result = await db.run(
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
            // جلب آخر المعاملات
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

app.post('/api/wallet/topup', requireAuth, [
    body('amount').isFloat({ min: 1000 }).withMessage('المبلغ يجب أن يكون 1000 ريال على الأقل'),
    body('method').isIn(['manual', 'wallet']).withMessage('طريقة الدفع غير صحيحة'),
    body('wallet_type').optional().isString()
], validateRequest, async (req, res) => {
    try {
        const { amount, method, wallet_type } = req.body;
        
        logger.info(`💰 طلب شحن رصيد: ${amount} ريال للمستخدم ${req.session.userId}`);
        
        // إنشاء معاملة
        const transactionId = helpers.generateTransactionId();
        const transactionData = {
            user_id: req.session.userId,
            amount: parseFloat(amount),
            type: 'deposit',
            method: method || 'manual',
            wallet_type: wallet_type || '',
            transaction_id: transactionId,
            status: method === 'wallet' ? 'completed' : 'pending',
            created_at: new Date().toISOString()
        };
        
        const result = await db.run(
            `INSERT INTO transactions 
             (user_id, amount, type, method, wallet_type, transaction_id, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            Object.values(transactionData)
        );
        
        // إذا كانت العملية فورية (محفظة إلكترونية)
        if (method === 'wallet') {
            // تحديث رصيد المحفظة
            await db.run(
                'UPDATE wallets SET balance = balance + ? WHERE user_id = ?',
                [amount, req.session.userId]
            );
            
            // تحديث حالة المعاملة
            await db.run(
                'UPDATE transactions SET status = "completed" WHERE id = ?',
                [result.lastID]
            );
            
            logger.info(`✅ تم شحن الرصيد بنجاح: ${amount} ريال للمستخدم ${req.session.userId}`);
            
            // إرسال إشعار
            notificationManager.sendNotification(req.session.userId, {
                title: 'تم شحن الرصيد',
                message: `تم شحن ${helpers.formatCurrency(amount)} إلى محفظتك`,
                type: 'success',
                timestamp: new Date().toISOString()
            });
            
            res.json({
                success: true,
                message: 'تم شحن الرصيد بنجاح',
                data: {
                    transaction_id: transactionId,
                    amount,
                    new_balance: await getWalletBalance(req.session.userId)
                }
            });
        } else {
            // عملية يدوية تحتاج موافقة
            logger.info(`⏳ طلب شحن يدوي بانتظار الموافقة: ${transactionId}`);
            
            res.json({
                success: true,
                message: 'تم تقديم طلب الشحن بنجاح. سيتم إضافة الرصيد بعد التحقق من التحويل.',
                data: {
                    transaction_id: transactionId,
                    amount,
                    instructions: {
                        transfer_to: '771831482',
                        name: 'يوسف محمد علي حمود زهير',
                        note: 'أرسل إيصال التحويل عبر الواتساب'
                    }
                }
            });
        }
    } catch (error) {
        logger.error(`❌ خطأ في شحن الرصيد: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في شحن الرصيد' });
    }
});

// دالة مساعدة لجلب رصيد المحفظة
async function getWalletBalance(userId) {
    const wallet = await db.getQuery(
        'SELECT balance FROM wallets WHERE user_id = ?',
        [userId]
    );
    return wallet ? wallet.balance : 0;
}

// 🛍️ الطلبات (كاملة)
app.get('/api/orders', requireAuth, async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        
        let query = `
            SELECT o.*, u.name as buyer_name, u.phone as buyer_phone,
                   d.user_id as driver_id, du.name as driver_name,
                   COUNT(oi.id) as item_count,
                   SUM(oi.total_price) as items_total
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
        
        // جلب العدد الكلي
        const countQuery = `SELECT COUNT(DISTINCT o.id) as total ${query.substring(query.indexOf('FROM'), query.indexOf('GROUP BY'))}`;
        const countResult = await db.getQuery(countQuery, params.slice(0, status ? 2 : 1));
        const total = countResult.total;
        
        // إضافة المحدودية
        const offset = (page - 1) * limit;
        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);
        
        const orders = await db.allQuery(query, params);
        
        // جلب العناصر لكل طلب
        for (let order of orders) {
            const items = await db.allQuery(
                `SELECT oi.*, p.name as product_name, p.image as product_image,
                        u.name as seller_name, s.store_name
                 FROM order_items oi
                 LEFT JOIN products p ON oi.product_id = p.id
                 LEFT JOIN users u ON oi.seller_id = u.id
                 LEFT JOIN sellers s ON oi.seller_id = s.user_id
                 WHERE oi.order_id = ?`,
                [order.id]
            );
            order.items = items;
        }
        
        res.json({
            success: true,
            data: orders,
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error(`❌ خطأ في جلب الطلبات: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

app.post('/api/orders', requireAuth, requireBuyer, [
    body('items').isArray({ min: 1 }).withMessage('يجب اختيار منتج واحد على الأقل'),
    body('shipping_address').trim().notEmpty().withMessage('عنوان التوصيل مطلوب'),
    body('payment_method').isIn(['wallet', 'cash']).withMessage('طريقة الدفع غير صحيحة'),
    body('wash_qat').optional().isBoolean().withMessage('قيمة غسيل القات غير صحيحة')
], validateRequest, async (req, res) => {
    try {
        const { items, shipping_address, payment_method, wash_qat = false } = req.body;
        
        logger.info(`🛍️ إنشاء طلب جديد بواسطة المشتري ${req.session.userId}`);
        
        // التحقق من المنتجات والكميات
        let totalAmount = 0;
        const orderItems = [];
        
        for (const item of items) {
            const product = await db.getQuery(
                'SELECT * FROM products WHERE id = ? AND status = "active"',
                [item.product_id]
            );
            
            if (!product) {
                return res.status(400).json({
                    success: false,
                    error: `المنتج ${item.product_id} غير موجود`
                });
            }
            
            if (product.quantity < item.quantity) {
                return res.status(400).json({
                    success: false,
                    error: `الكمية غير متوفرة للمنتج ${product.name}`
                });
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
        
        // إضافة تكلفة الغسيل إذا طلب
        if (wash_qat) {
            totalAmount += 100; // سعر غسيل القات
        }
        
        // التحقق من الرصيد إذا كانت الدفع بالمحفظة
        if (payment_method === 'wallet') {
            const wallet = await db.getQuery(
                'SELECT balance FROM wallets WHERE user_id = ?',
                [req.session.userId]
            );
            
            if (!wallet || wallet.balance < totalAmount) {
                return res.status(400).json({
                    success: false,
                    error: 'رصيد المحفظة غير كافي'
                });
            }
        }
        
        // بدء معاملة قاعدة البيانات
        await db.run('BEGIN TRANSACTION');
        
        try {
            // إنشاء الطلب
            const orderCode = helpers.generateOrderCode();
            const orderData = {
                buyer_id: req.session.userId,
                total: totalAmount,
                shipping_address,
                payment_method,
                wash_qat: wash_qat ? 1 : 0,
                status: payment_method === 'wallet' ? 'paid' : 'pending',
                order_code: orderCode,
                created_at: new Date().toISOString()
            };
            
            const orderResult = await db.run(
                `INSERT INTO orders 
                 (buyer_id, total, shipping_address, payment_method, wash_qat, status, order_code, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                Object.values(orderData)
            );
            
            const orderId = orderResult.lastID;
            
            // إضافة عناصر الطلب
            for (const item of orderItems) {
                await db.run(
                    `INSERT INTO order_items 
                     (order_id, product_id, seller_id, quantity, unit_price, total_price)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [orderId, item.product_id, item.seller_id, item.quantity, item.unit_price, item.total_price]
                );
                
                // تحديث كمية المنتج
                await db.run(
                    'UPDATE products SET quantity = quantity - ? WHERE id = ?',
                    [item.quantity, item.product_id]
                );
            }
            
            // خصم المبلغ من المحفظة إذا كانت الدفع بالمحفظة
            if (payment_method === 'wallet') {
                await db.run(
                    'UPDATE wallets SET balance = balance - ? WHERE user_id = ?',
                    [totalAmount, req.session.userId]
                );
                
                // تسجيل المعاملة
                await db.run(
                    `INSERT INTO transactions 
                     (user_id, amount, type, method, status, created_at)
                     VALUES (?, ?, 'purchase', 'wallet', 'completed', ?)`,
                    [req.session.userId, totalAmount * -1, new Date().toISOString()]
                );
            }
            
            // إنشاء طلب غسيل إذا طلب
            if (wash_qat) {
                // الحصول على محطة غسيل عشوائية في نفس سوق المنتج الأول
                const firstProductMarket = await db.getQuery(
                    'SELECT market_id FROM products WHERE id = ?',
                    [orderItems[0].product_id]
                );
                
                if (firstProductMarket) {
                    const washStation = await db.getQuery(
                        'SELECT id FROM wash_stations WHERE market_id = ? AND status = "active" ORDER BY RANDOM() LIMIT 1',
                        [firstProductMarket.market_id]
                    );
                    
                    if (washStation) {
                        await db.run(
                            `INSERT INTO wash_orders 
                             (order_id, wash_station_id, status, created_at)
                             VALUES (?, ?, 'pending', ?)`,
                            [orderId, washStation.id, new Date().toISOString()]
                        );
                    }
                }
            }
            
            // إرسال إشعارات للبائعين
            for (const item of orderItems) {
                notificationManager.sendNotification(item.seller_id, {
                    title: 'طلب جديد',
                    message: `طلب جديد للمنتج ${item.product_name}`,
                    type: 'info',
                    timestamp: new Date().toISOString()
                });
            }
            
            // إرسال إشعار للمشتري
            notificationManager.sendNotification(req.session.userId, {
                title: 'تم إنشاء الطلب',
                message: `تم إنشاء طلبك بنجاح برقم ${orderCode}`,
                type: 'success',
                timestamp: new Date().toISOString()
            });
            
            // إرسال بريد إلكتروني
            const buyer = await db.getQuery(
                'SELECT name, email FROM users WHERE id = ?',
                [req.session.userId]
            );
            
            if (buyer && emailService.transporter) {
                await emailService.sendOrderConfirmation({
                    ...orderData,
                    id: orderId
                }, buyer);
            }
            
            await db.run('COMMIT');
            
            logger.info(`✅ تم إنشاء الطلب بنجاح: ${orderCode} (ID: ${orderId})`);
            
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
        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    } catch (error) {
        logger.error(`❌ خطأ في إنشاء الطلب: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في إنشاء الطلب' });
    }
});

// 📊 تقارير الإدارة
app.get('/api/admin/reports/sales', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { start_date, end_date, group_by = 'day' } = req.query;
        
        let dateFormat;
        switch (group_by) {
            case 'hour':
                dateFormat = '%Y-%m-%d %H:00';
                break;
            case 'day':
                dateFormat = '%Y-%m-%d';
                break;
            case 'week':
                dateFormat = '%Y-%W';
                break;
            case 'month':
                dateFormat = '%Y-%m';
                break;
            default:
                dateFormat = '%Y-%m-%d';
        }
        
        const query = `
            SELECT 
                strftime(?, o.created_at) as period,
                COUNT(*) as order_count,
                SUM(o.total) as total_sales,
                AVG(o.total) as avg_order_value,
                COUNT(DISTINCT o.buyer_id) as unique_customers
            FROM orders o
            WHERE o.created_at BETWEEN ? AND ?
            GROUP BY period
            ORDER BY period DESC
        `;
        
        const defaultStartDate = new Date();
        defaultStartDate.setDate(defaultStartDate.getDate() - 30);
        
        const reports = await db.allQuery(query, [
            dateFormat,
            start_date || defaultStartDate.toISOString().split('T')[0],
            end_date || new Date().toISOString().split('T')[0]
        ]);
        
        res.json({
            success: true,
            data: reports
        });
    } catch (error) {
        logger.error(`❌ خطأ في جلب تقرير المبيعات: ${error.message}`);
        res.status(500).json({ success: false, error: 'خطأ في الخادم' });
    }
});

// 🔧 المهام المجدولة
if (IS_PRODUCTION) {
    // تنظيف الجلسات القديمة يومياً
    cron.schedule('0 0 * * *', async () => {
        try {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 7); // جلسات أقدم من 7 أيام
            
            // يمكن هنا إضافة منطق لتنظيف الجلسات من التخزين
            logger.info('🧹 تم تشغيل مهمة تنظيف الجلسات القديمة');
        } catch (error) {
            logger.error(`❌ خطأ في مهمة التنظيف: ${error.message}`);
        }
    });
    
    // نسخ احتياطي لقاعدة البيانات أسبوعياً
    cron.schedule('0 2 * * 0', async () => {
        try {
            const backupDir = path.join(__dirname, 'backups');
            if (!(await fs.access(backupDir).catch(() => false))) {
                await fs.mkdir(backupDir, { recursive: true });
            }
            
            const backupFile = path.join(backupDir, `backup_${new Date().toISOString().split('T')[0]}.db`);
            
            // نسخ قاعدة البيانات
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

// 📁 خدمة الملفات المحملة
app.get('/uploads/*', (req, res) => {
    const filePath = path.join(__dirname, req.path);
    
    // التحقق من وجود الملف
    fs.access(filePath)
        .then(() => {
            // تعيين رأس Cache-Control
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
server.listen(PORT, () => {
    logger.info(`🚀 تطبيق قات PRO يعمل على المنفذ ${PORT}`);
    logger.info(`🌐 الإصدار: ${VERSION}`);
    logger.info(`⚙️  البيئة: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`📊 التطبيق جاهز للاستخدام`);
    
    // إنشاء المجلدات المطلوبة
    const requiredDirs = [
        'uploads/products',
        'uploads/ads',
        'uploads/avatars',
        'data',
        'logs',
        'backups'
    ];
    
    requiredDirs.forEach(async (dir) => {
        const dirPath = path.join(__dirname, dir);
        try {
            await fs.access(dirPath);
        } catch {
            await fs.mkdir(dirPath, { recursive: true });
            logger.info(`📁 تم إنشاء مجلد: ${dir}`);
        }
    });
});

// معالج إيقاف التشغيل
const shutdown = () => {
    logger.info('🛑 إيقاف الخادم...');
    
    // إغلاق جميع الاتصالات
    notificationManager.activeConnections.clear();
    
    server.close(() => {
        logger.info('✅ تم إيقاف الخادم');
        process.exit(0);
    });
    
    // إجبار الإيقاف بعد 10 ثواني
    setTimeout(() => {
        logger.error('❌ تم إجبار إيقاف الخادم بعد التأخير');
        process.exit(1);
    }, 10000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);



