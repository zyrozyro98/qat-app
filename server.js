const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const http = require('http');
const nodemailer = require('nodemailer');
const xlsx = require('xlsx');

// تهيئة التطبيق
const app = express();
const server = http.createServer(app);

// 🔧 إصلاح: إضافة trust proxy لـ Render.com
app.set('trust proxy', 1);

// الإعدادات الأمنية
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"]
        }
    }
}));

app.use(compression());
app.use(cors({
    origin: true,
    credentials: true
}));

// 🔧 إصلاح: تكوين rate limit مع trust proxy
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100, // 100 طلب لكل IP
    message: 'لقد تجاوزت الحد المسموح به من الطلبات، يرجى المحاولة لاحقاً',
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true // تمكين trust proxy
});
app.use('/api/', limiter);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// جلسات المستخدمين
app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex'),
    resave: false,
    saveUninitialized: false,
    store: new session.MemoryStore(),
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 ساعة
    },
    proxy: true // مهم لـ Render.com
}));

// قواعد التحقق من الصلاحيات
const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'يجب تسجيل الدخول' });
    }
    next();
};

const requireAdmin = (req, res, next) => {
    if (!req.session.userId || req.session.role !== 'admin') {
        return res.status(403).json({ error: 'صلاحية مرفوضة' });
    }
    next();
};

const requireSeller = (req, res, next) => {
    if (!req.session.userId || req.session.role !== 'seller') {
        return res.status(403).json({ error: 'يجب أن تكون بائعاً' });
    }
    next();
};

const requireBuyer = (req, res, next) => {
    if (!req.session.userId || req.session.role !== 'buyer') {
        return res.status(403).json({ error: 'يجب أن تكون مشترياً' });
    }
    next();
};

// قاعدة البيانات
const db = require('./database');

// WebSocket للتنبيهات في الوقت الحقيقي
const io = new Server(server);
io.on('connection', (socket) => {
    console.log('🌐 مستخدم متصل:', socket.id);
    
    socket.on('joinRoom', (userId) => {
        socket.join(`user_${userId}`);
        console.log(`👤 المستخدم ${userId} انضم للغرفة`);
    });
    
    socket.on('disconnect', () => {
        console.log('🌐 مستخدم انقطع:', socket.id);
    });
});

// إعداد التحميل
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadPath = 'uploads/';
        if (file.fieldname === 'productImage') uploadPath += 'products/';
        else if (file.fieldname === 'adImage') uploadPath += 'ads/';
        else if (file.fieldname === 'avatar') uploadPath += 'avatars/';
        
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('نوع الملف غير مدعوم'));
        }
    }
});

// دوال مساعدة
function generateOrderCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function generateGiftCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 10; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
        if (i === 4) code += '-';
    }
    return code;
}

function sendNotification(user_id, title, message) {
    db.run(
        `INSERT INTO notifications (user_id, title, message, is_read, created_at)
         VALUES (?, ?, ?, 0, datetime('now'))`,
        [user_id, title, message],
        (err) => {
            if (err) {
                console.error('❌ خطأ في إرسال الإشعار:', err.message);
            } else {
                // إرسال عبر WebSocket
                io.to(`user_${user_id}`).emit('notification', { title, message });
            }
        }
    );
}

// ============ API Routes ============

// 1. الصحة والاختبار
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'الخادم يعمل بشكل صحيح',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    });
});

// 2. المصادقة والمستخدمين
app.post('/api/register', async (req, res) => {
    try {
        console.log('📝 محاولة تسجيل جديد:', req.body.email);
        
        const { name, email, phone, password, role, storeName, vehicleType } = req.body;
        
        // التحقق من البيانات
        if (!name || !email || !phone || !password || !role) {
            console.log('❌ بيانات ناقصة في التسجيل');
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        
        // التحقق من وجود المستخدم
        db.get('SELECT id FROM users WHERE email = ? OR phone = ?', [email, phone], async (err, existingUser) => {
            if (err) {
                console.error('❌ خطأ في قاعدة البيانات:', err.message);
                return res.status(500).json({ error: 'خطأ في الخادم' });
            }
            
            if (existingUser) {
                console.log('❌ مستخدم موجود بالفعل:', email);
                return res.status(400).json({ error: 'البريد الإلكتروني أو رقم الهاتف مستخدم بالفعل' });
            }
            
            try {
                // تشفير كلمة المرور
                const hashedPassword = await bcrypt.hash(password, 12);
                const createdAt = new Date().toISOString();
                
                // إنشاء الحساب
                db.run(
                    `INSERT INTO users (name, email, phone, password, role, status, created_at)
                     VALUES (?, ?, ?, ?, ?, 'active', ?)`,
                    [name, email, phone, hashedPassword, role, createdAt],
                    function(err) {
                        if (err) {
                            console.error('❌ خطأ في إنشاء المستخدم:', err.message);
                            return res.status(500).json({ error: 'خطأ في إنشاء الحساب' });
                        }
                        
                        const userId = this.lastID;
                        console.log('✅ تم إنشاء حساب جديد ID:', userId);
                        
                        // إنشاء المحفظة
                        db.run(
                            `INSERT INTO wallets (user_id, balance, created_at)
                             VALUES (?, 0, ?)`,
                            [userId, createdAt],
                            (err) => {
                                if (err) {
                                    console.error('❌ خطأ في إنشاء المحفظة:', err.message);
                                } else {
                                    console.log('✅ تم إنشاء محفظة للمستخدم:', userId);
                                }
                            }
                        );
                        
                        // إذا كان بائعاً، إضافة متجر
                        if (role === 'seller' && storeName) {
                            db.run(
                                `INSERT INTO sellers (user_id, store_name, rating, total_sales, created_at)
                                 VALUES (?, ?, 0, 0, ?)`,
                                [userId, storeName, createdAt],
                                (err) => {
                                    if (err) {
                                        console.error('❌ خطأ في إنشاء البائع:', err.message);
                                    } else {
                                        console.log('✅ تم إنشاء متجر:', storeName);
                                    }
                                }
                            );
                        }
                        
                        // إذا كان مندوب توصيل
                        if (role === 'driver' && vehicleType) {
                            db.run(
                                `INSERT INTO drivers (user_id, vehicle_type, rating, status, created_at)
                                 VALUES (?, ?, 0, 'available', ?)`,
                                [userId, vehicleType, createdAt],
                                (err) => {
                                    if (err) {
                                        console.error('❌ خطأ في إنشاء المندوب:', err.message);
                                    } else {
                                        console.log('✅ تم إنشاء مندوب توصيل:', vehicleType);
                                    }
                                }
                            );
                        }
                        
                        // تسجيل الدخول التلقائي
                        req.session.userId = userId;
                        req.session.role = role;
                        req.session.userEmail = email;
                        
                        console.log('✅ تسجيل ناجح للمستخدم:', email);
                        
                        res.json({ 
                            success: true, 
                            message: 'تم إنشاء الحساب بنجاح',
                            user: { id: userId, name, email, phone, role }
                        });
                    }
                );
                
            } catch (error) {
                console.error('❌ خطأ في عملية التسجيل:', error);
                res.status(500).json({ error: 'خطأ في الخادم' });
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في التسجيل:', error);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        console.log('🔐 محاولة تسجيل دخول:', req.body.email);
        
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
        }
        
        db.get('SELECT * FROM users WHERE email = ? AND status = "active"', [email], async (err, user) => {
            if (err) {
                console.error('❌ خطأ في قاعدة البيانات:', err.message);
                return res.status(500).json({ error: 'خطأ في الخادم' });
            }
            
            if (!user) {
                console.log('❌ مستخدم غير موجود:', email);
                return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
            }
            
            try {
                const validPassword = await bcrypt.compare(password, user.password);
                if (!validPassword) {
                    console.log('❌ كلمة مرور خاطئة:', email);
                    return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
                }
                
                // تحديث الجلسة
                req.session.userId = user.id;
                req.session.role = user.role;
                req.session.userEmail = user.email;
                
                console.log('✅ تسجيل دخول ناجح:', user.email);
                
                res.json({ 
                    success: true, 
                    message: 'تم تسجيل الدخول بنجاح',
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        phone: user.phone,
                        role: user.role,
                        avatar: user.avatar
                    }
                });
                
            } catch (error) {
                console.error('❌ خطأ في التحقق من كلمة المرور:', error);
                res.status(500).json({ error: 'خطأ في الخادم' });
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في تسجيل الدخول:', error);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

app.post('/api/logout', (req, res) => {
    console.log('👋 تسجيل خروج:', req.session.userEmail);
    req.session.destroy((err) => {
        if (err) {
            console.error('❌ خطأ في تسجيل الخروج:', err);
            return res.status(500).json({ error: 'خطأ في تسجيل الخروج' });
        }
        res.json({ success: true, message: 'تم تسجيل الخروج' });
    });
});

app.get('/api/auth/check', (req, res) => {
    if (req.session.userId) {
        db.get('SELECT id, name, email, phone, role, avatar FROM users WHERE id = ?', 
            [req.session.userId], 
            (err, user) => {
                if (err || !user) {
                    console.error('❌ خطأ في التحقق من المصادقة:', err?.message);
                    return res.json({ isAuthenticated: false });
                }
                res.json({ isAuthenticated: true, user });
            }
        );
    } else {
        res.json({ isAuthenticated: false });
    }
});

// 3. الأسواق
app.get('/api/markets', (req, res) => {
    console.log('🏪 جلب قائمة الأسواق');
    
    db.all('SELECT * FROM markets WHERE status = "active" ORDER BY name', [], (err, markets) => {
        if (err) {
            console.error('❌ خطأ في جلب الأسواق:', err.message);
            return res.status(500).json({ error: 'خطأ في الخادم' });
        }
        res.json({ success: true, markets });
    });
});

// 4. المنتجات
app.get('/api/products', (req, res) => {
    console.log('🛒 جلب المنتجات', req.query);
    
    try {
        const { category, market_id, seller_id, min_price, max_price, search } = req.query;
        
        let query = `
            SELECT p.*, u.name as seller_name, u.avatar as seller_avatar,
                   s.store_name, s.rating as seller_rating,
                   m.name as market_name
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
            query += ' AND (p.name LIKE ? OR p.description LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        
        query += ' ORDER BY p.created_at DESC';
        
        console.log('📝 استعلام المنتجات:', query);
        console.log('🔢 معاملات:', params);
        
        db.all(query, params, (err, products) => {
            if (err) {
                console.error('❌ خطأ في جلب المنتجات:', err.message);
                return res.status(500).json({ error: 'خطأ في الخادم' });
            }
            
            console.log(`✅ تم جلب ${products.length} منتج`);
            res.json({ success: true, products });
        });
    } catch (error) {
        console.error('❌ خطأ في جلب المنتجات:', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. المحفظة
app.get('/api/wallet', requireAuth, (req, res) => {
    const user_id = req.session.userId;
    console.log('💰 جلب محفظة المستخدم:', user_id);
    
    db.get('SELECT * FROM wallets WHERE user_id = ?', [user_id], (err, wallet) => {
        if (err) {
            console.error('❌ خطأ في جلب المحفظة:', err.message);
            return res.status(500).json({ error: 'خطأ في الخادم' });
        }
        
        if (!wallet) {
            // إنشاء محفظة إذا لم تكن موجودة
            const createdAt = new Date().toISOString();
            db.run('INSERT INTO wallets (user_id, balance, created_at) VALUES (?, 0, ?)',
                [user_id, createdAt],
                function(err) {
                    if (err) {
                        console.error('❌ خطأ في إنشاء المحفظة:', err.message);
                        return res.status(500).json({ error: 'خطأ في إنشاء المحفظة' });
                    }
                    console.log('✅ تم إنشاء محفظة جديدة للمستخدم:', user_id);
                    res.json({ success: true, wallet: { user_id, balance: 0 } });
                }
            );
        } else {
            res.json({ success: true, wallet });
        }
    });
});

// 6. الإعلانات
app.get('/api/ads', (req, res) => {
    console.log('📢 جلب الإعلانات');
    
    db.all(
        `SELECT * FROM ads WHERE is_active = 1 
         ORDER BY CASE position 
            WHEN 'top' THEN 1 
            WHEN 'middle' THEN 2 
            WHEN 'bottom' THEN 3 
            ELSE 4 END`,
        [],
        (err, ads) => {
            if (err) {
                console.error('❌ خطأ في جلب الإعلانات:', err.message);
                return res.status(500).json({ error: 'خطأ في الخادم' });
            }
            console.log(`✅ تم جلب ${ads.length} إعلان`);
            res.json({ success: true, ads });
        }
    );
});

// 7. التقييمات
app.get('/api/products/:id/reviews', (req, res) => {
    const productId = req.params.id;
    console.log('⭐ جلب تقييمات المنتج:', productId);
    
    db.all(
        `SELECT r.*, u.name as user_name, u.avatar as user_avatar
         FROM reviews r
         LEFT JOIN users u ON r.user_id = u.id
         WHERE r.product_id = ?
         ORDER BY r.created_at DESC`,
        [productId],
        (err, reviews) => {
            if (err) {
                console.error('❌ خطأ في جلب التقييمات:', err.message);
                return res.status(500).json({ error: 'خطأ في الخادم' });
            }
            res.json({ success: true, reviews });
        }
    );
});

// 8. ملفات التحميل
app.get('/uploads/*', (req, res) => {
    const filePath = path.join(__dirname, req.path);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).json({ error: 'الملف غير موجود' });
    }
});

// معالج الأخطاء
app.use((err, req, res, next) => {
    console.error('❌ خطأ غير متوقع:', err);
    
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'حجم الملف كبير جداً (الحد الأقصى 5MB)' });
        }
        return res.status(400).json({ error: 'خطأ في رفع الملف' });
    }
    
    res.status(500).json({ error: 'حدث خطأ داخلي في الخادم' });
});

// 404 handler
app.use((req, res) => {
    console.log('❌ مسار غير موجود:', req.path);
    res.status(404).json({ error: 'الصفحة غير موجودة' });
});

// الصفحة الرئيسية
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// بدء الخادم
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ الخادم يعمل على المنفذ ${PORT}`);
    console.log(`🌐 يمكن الوصول للتطبيق عبر: https://qat-app.onrender.com`);
    
    // إنشاء مجلدات التحميل إذا لم تكن موجودة
    const uploadDirs = ['uploads/products', 'uploads/ads', 'uploads/avatars', 'data/backups'];
    uploadDirs.forEach(dir => {
        const dirPath = path.join(__dirname, dir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`📁 تم إنشاء مجلد: ${dir}`);
        }
    });
});

// معالج إيقاف التشغيل
process.on('SIGINT', () => {
    console.log('🛑 إيقاف الخادم...');
    server.close(() => {
        console.log('✅ تم إيقاف الخادم');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('🛑 إيقاف الخادم...');
    server.close(() => {
        console.log('✅ تم إيقاف الخادم');
        process.exit(0);
    });
});
