const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const winston = require('winston');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// تسجيل الأخطاء
const logger = winston.createLogger({
    level: IS_PRODUCTION ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
    ),
    defaultMeta: { service: 'qat-app-pro' },
    transports: [
        new winston.transports.File({ 
            filename: 'logs/error.log', 
            level: 'error',
            maxsize: 5242880,
            maxFiles: 5
        }),
        new winston.transports.File({ 
            filename: 'logs/combined.log',
            maxsize: 5242880,
            maxFiles: 5
        })
    ]
});

if (!IS_PRODUCTION) {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

// Morgan مع Winston
const morganMiddleware = morgan('combined', { 
    stream: { write: (message) => logger.info(message.trim()) }
});

// إعدادات Helmet الأمنية
const helmetMiddleware = helmet({
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
});

// إعدادات CORS
const corsMiddleware = cors({
    origin: IS_PRODUCTION ? [
        'https://qat-app.onrender.com',
        'https://www.qat-app.com',
        'https://qat-app.com'
    ] : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
});

// ضغط البيانات
const compressionMiddleware = compression({
    level: 6,
    threshold: 100 * 1024
});

// Rate Limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: {
        error: 'لقد تجاوزت الحد المسموح به من الطلبات',
        retryAfter: '15 دقيقة'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip || req.connection.remoteAddress,
    skip: (req) => req.path.includes('/health') || req.path.includes('/status')
});

const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: {
        error: 'لقد تجاوزت عدد محاولات تسجيل الدخول المسموح بها',
        retryAfter: '60 دقيقة'
    }
});

// Middleware للتحقق من JSON
const jsonMiddleware = (err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        logger.error('❌ JSON غير صالح:', err.message);
        return res.status(400).json({
            success: false,
            error: 'JSON غير صالح',
            message: 'الرجاء التحقق من صحة البيانات المرسلة'
        });
    }
    next();
};

// Middleware للتحليلات
const analyticsMiddleware = (req, res, next) => {
    req.analytics = {
        timestamp: new Date().toISOString(),
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent'),
        method: req.method,
        path: req.path,
        query: req.query,
        user: req.session ? req.session.userId || 'guest' : 'guest'
    };
    next();
};

// Middleware للتحقق من المصادقة
const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.userId) {
        logger.warn(`🚫 محاولة وصول غير مصرح بها إلى ${req.path}`);
        return res.status(401).json({ 
            success: false, 
            error: 'يجب تسجيل الدخول للوصول إلى هذا المورد' 
        });
    }
    next();
};

// Middleware للتحقق من الصلاحيات
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.session || !req.session.userId || !roles.includes(req.session.role)) {
            logger.warn(`🚫 محاولة وصول غير مصرح بها لدور ${req.session?.role || 'none'} إلى ${req.path}`);
            return res.status(403).json({ 
                success: false, 
                error: 'صلاحية مرفوضة. لا تملك الصلاحيات الكافية' 
            });
        }
        next();
    };
};

// Middleware للتحقق من JSON payload size
const validatePayloadSize = (req, res, next) => {
    const contentLength = req.headers['content-length'];
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) { // 10MB
        return res.status(413).json({
            success: false,
            error: 'حجم البيانات كبير جداً',
            message: 'الحد الأقصى لحجم البيانات هو 10MB'
        });
    }
    next();
};

// Middleware للتحقق من Content-Type
const validateContentType = (req, res, next) => {
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        const contentType = req.headers['content-type'];
        if (!contentType || !contentType.includes('application/json')) {
            return res.status(415).json({
                success: false,
                error: 'نوع المحتوى غير مدعوم',
                message: 'يرجى استخدام Content-Type: application/json'
            });
        }
    }
    next();
};

// Middleware لضبط رأس الاستجابة
const responseHeaders = (req, res, next) => {
    res.setHeader('X-Powered-By', 'Qat App PRO');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
};

module.exports = {
    logger,
    morganMiddleware,
    helmetMiddleware,
    corsMiddleware,
    compressionMiddleware,
    apiLimiter,
    authLimiter,
    jsonMiddleware,
    analyticsMiddleware,
    requireAuth,
    requireRole,
    validatePayloadSize,
    validateContentType,
    responseHeaders,
    
    // دوال مساعدة للصلاحيات
    requireAdmin: requireRole('admin'),
    requireSeller: requireRole('seller'),
    requireBuyer: requireRole('buyer'),
    requireDriver: requireRole('driver'),
    requireAdminOrSeller: requireRole('admin', 'seller'),
    requireAdminOrDriver: requireRole('admin', 'driver')
};
