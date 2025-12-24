const express = require('express');
const path = require('path');
const fs = require('fs').promises;

// تهيئة التطبيق
const app = express();
const server = require('http').createServer(app);

// 🔧 إعدادات PRO
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const VERSION = '2.0.0-PRO';

// 🔧 إعدادات الأمان المتقدمة
app.set('trust proxy', 1);
app.set('x-powered-by', false);

// 📦 Middleware الأساسية
app.use(require('helmet')());
app.use(require('compression')({ level: 6 }));
app.use(require('cors')({
    origin: IS_PRODUCTION ? [
        'https://qat-app.onrender.com',
        'https://www.qat-app.com',
        'https://qat-app.com'
    ] : true,
    credentials: true
}));

// ⚡ Rate Limiting
const rateLimit = require('express-rate-limit');
app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { error: 'لقد تجاوزت الحد المسموح به من الطلبات' }
}));

// 📦 Middleware للبيانات
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 🔐 إعدادات الجلسات
const session = require('express-session');
const crypto = require('crypto');
app.use(session({
    name: 'qat_pro_session',
    secret: process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex'),
    resave: false,
    saveUninitialized: false,
    store: new session.MemoryStore(),
    cookie: {
        secure: IS_PRODUCTION,
        httpOnly: true,
        sameSite: IS_PRODUCTION ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
    }
}));

// 📁 الملفات الثابتة
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: IS_PRODUCTION ? '1y' : '0',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    }
}));

// 📊 تهيئة التسجيل (Logging)
const logger = require('./config/logger');
app.use(require('morgan')('combined', { 
    stream: { write: (message) => logger.info(message.trim()) }
}));

// 📊 تهيئة قاعدة البيانات
const { initializeDatabase } = require('./database/init');
let db;

// 📊 Middleware للتحليلات
app.use(require('./middleware/analytics'));

// 📊 Middleware للصلاحيات
const { requireAuth, requireRole } = require('./middleware/auth');

// 🔌 WebSocket للتنبيهات الحية
const io = require('socket.io')(server, {
    cors: {
        origin: IS_PRODUCTION ? [
            'https://qat-app.onrender.com',
            'https://www.qat-app.com'
        ] : '*',
        methods: ['GET', 'POST']
    }
});

// تهيئة نظام الإشعارات
const notificationManager = require('./controllers/notificationController')(io);

// 📧 تهيئة خدمة البريد الإلكتروني
const emailService = require('./config/email');

// 🔧 دوال مساعدة
const helpers = require('./utils/helpers');

// ============ تحميل المسارات ============
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const marketRoutes = require('./routes/markets');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const walletRoutes = require('./routes/wallets');
const driverRoutes = require('./routes/drivers');
const notificationRoutes = require('./routes/notifications');
const reportRoutes = require('./routes/reports');
const uploadRoutes = require('./routes/uploads');

// ============ تسجيل المسارات ============
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/markets', marketRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/uploads', uploadRoutes);

// 📊 الصحة والمراقبة
app.get('/api/health', async (req, res) => {
    try {
        const dbStatus = await db ? await db.getQuery('SELECT 1 as status') : null;
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
                }
            }
        });
    } catch (error) {
        logger.error(`❌ خطأ في فحص الصحة: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'الخادم يعاني من مشاكل فنية'
        });
    }
});

// ⚠️ معالج الأخطاء
app.use((err, req, res, next) => {
    logger.error(`❌ خطأ غير متوقع: ${err.message}`, {
        stack: err.stack,
        path: req.path,
        method: req.method,
        user: req.session.userId || 'guest'
    });
    
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
            'data',
            'uploads',
            'uploads/products',
            'uploads/avatars',
            'logs',
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
        
        // تهيئة قاعدة البيانات
        db = await initializeDatabase();
        logger.info('✅ قاعدة البيانات جاهزة للاستخدام');
        
        // تهيئة خدمة البريد
        emailService.initialize();
        
        // إنشاء صفحة رئيسية افتراضية إذا لم تكن موجودة
        const publicPath = path.join(__dirname, 'public');
        try {
            await fs.access(path.join(publicPath, 'index.html'));
        } catch {
            const htmlContent = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>تطبيق قات PRO</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
        h1 { color: #2E7D32; }
        .status { background: #4CAF50; color: white; padding: 10px; border-radius: 5px; margin: 20px 0; }
        .info { text-align: right; margin-top: 30px; padding: 15px; background: #f9f9f9; border-right: 4px solid #2E7D32; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 تطبيق قات PRO</h1>
        <div class="status">✅ الخادم يعمل بنجاح</div>
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

// تصدير للتجارب
module.exports = { app, server, db };
