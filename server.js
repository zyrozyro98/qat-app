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
const io = new Server(server);

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

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100 // 100 طلب لكل IP
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
    store: new session.MemoryStore(), // إصلاح تحذير MemoryStore
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 ساعة
    }
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

// إعداد البريد الإلكتروني
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'test@example.com',
        pass: process.env.EMAIL_PASS || 'password'
    }
});

// WebSocket للتنبيهات في الوقت الحقيقي
io.on('connection', (socket) => {
    console.log('مستخدم متصل:', socket.id);
    
    socket.on('joinRoom', (userId) => {
        socket.join(`user_${userId}`);
    });
    
    socket.on('disconnect', () => {
        console.log('مستخدم انقطع:', socket.id);
    });
});

// ============ API Routes ============

// 1. الصحة والاختبار
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'الخادم يعمل بشكل صحيح',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// 2. المصادقة والمستخدمين
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, phone, password, role, storeName, vehicleType } = req.body;
        
        // التحقق من البيانات
        if (!name || !email || !phone || !password || !role) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        
        // التحقق من وجود المستخدم
        db.get('SELECT id FROM users WHERE email = ? OR phone = ?', [email, phone], async (err, existingUser) => {
            if (err) {
                console.error('خطأ في التحقق من المستخدم:', err);
                return res.status(500).json({ error: 'خطأ في الخادم' });
            }
            
            if (existingUser) {
                return res.status(400).json({ error: 'البريد الإلكتروني أو رقم الهاتف مستخدم بالفعل' });
            }
            
            try {
                // تشفير كلمة المرور
                const hashedPassword = await bcrypt.hash(password, 12);
                
                // إنشاء الحساب
                db.run(
                    `INSERT INTO users (name, email, phone, password, role, status, created_at)
                     VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))`,
                    [name, email, phone, hashedPassword, role],
                    function(err) {
                        if (err) {
                            console.error('خطأ في إنشاء المستخدم:', err);
                            return res.status(500).json({ error: 'خطأ في إنشاء الحساب' });
                        }
                        
                        const userId = this.lastID;
                        
                        // إنشاء المحفظة
                        db.run(
                            `INSERT INTO wallets (user_id, balance, created_at)
                             VALUES (?, 0, datetime('now'))`,
                            [userId],
                            (err) => {
                                if (err) {
                                    console.error('خطأ في إنشاء المحفظة:', err);
                                }
                            }
                        );
                        
                        // إذا كان بائعاً، إضافة متجر
                        if (role === 'seller' && storeName) {
                            db.run(
                                `INSERT INTO sellers (user_id, store_name, rating, total_sales, created_at)
                                 VALUES (?, ?, 0, 0, datetime('now'))`,
                                [userId, storeName],
                                (err) => {
                                    if (err) {
                                        console.error('خطأ في إنشاء البائع:', err);
                                    }
                                }
                            );
                        }
                        
                        // إذا كان مندوب توصيل
                        if (role === 'driver' && vehicleType) {
                            db.run(
                                `INSERT INTO drivers (user_id, vehicle_type, rating, status, created_at)
                                 VALUES (?, ?, 0, 'available', datetime('now'))`,
                                [userId, vehicleType],
                                (err) => {
                                    if (err) {
                                        console.error('خطأ في إنشاء المندوب:', err);
                                    }
                                }
                            );
                        }
                        
                        // تسجيل الدخول التلقائي
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
                
            } catch (error) {
                console.error('خطأ في عملية التسجيل:', error);
                res.status(500).json({ error: 'خطأ في الخادم' });
            }
        });
        
    } catch (error) {
        console.error('خطأ في التسجيل:', error);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
        }
        
        db.get('SELECT * FROM users WHERE email = ? AND status = "active"', [email], async (err, user) => {
            if (err) {
                console.error('خطأ في استعلام قاعدة البيانات:', err);
                return res.status(500).json({ error: 'خطأ في الخادم' });
            }
            
            if (!user) {
                return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
            }
            
            try {
                const validPassword = await bcrypt.compare(password, user.password);
                if (!validPassword) {
                    return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
                }
                
                // تحديث الجلسة
                req.session.userId = user.id;
                req.session.role = user.role;
                req.session.userEmail = user.email;
                
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
                console.error('خطأ في التحقق من كلمة المرور:', error);
                res.status(500).json({ error: 'خطأ في الخادم' });
            }
        });
        
    } catch (error) {
        console.error('خطأ في تسجيل الدخول:', error);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('خطأ في تسجيل الخروج:', err);
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
                    return res.json({ isAuthenticated: false });
                }
                res.json({ isAuthenticated: true, user });
            }
        );
    } else {
        res.json({ isAuthenticated: false });
    }
});

// 3. الأسواق والمغاسل (المدير فقط)
app.get('/api/markets', (req, res) => {
    db.all('SELECT * FROM markets WHERE status = "active" ORDER BY name', [], (err, markets) => {
        if (err) {
            console.error('خطأ في جلب الأسواق:', err);
            return res.status(500).json({ error: 'خطأ في الخادم' });
        }
        res.json({ success: true, markets });
    });
});

app.post('/api/admin/markets', requireAdmin, (req, res) => {
    try {
        const { name, location, description, phone, manager } = req.body;
        
        if (!name || !location) {
            return res.status(400).json({ error: 'الاسم والموقع مطلوبان' });
        }
        
        db.run(
            `INSERT INTO markets (name, location, description, phone, manager, status, created_at)
             VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))`,
            [name, location, description || '', phone || '', manager || ''],
            function(err) {
                if (err) {
                    console.error('خطأ في إضافة السوق:', err);
                    return res.status(500).json({ error: 'خطأ في إضافة السوق' });
                }
                
                io.emit('marketAdded', { id: this.lastID, name });
                res.json({ success: true, message: 'تم إضافة السوق', marketId: this.lastID });
            }
        );
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/wash-stations', requireAdmin, (req, res) => {
    try {
        const { market_id, name, phone, washer_name, wash_price } = req.body;
        
        if (!market_id || !name) {
            return res.status(400).json({ error: 'معرف السوق والاسم مطلوبان' });
        }
        
        db.run(
            `INSERT INTO wash_stations (market_id, name, phone, washer_name, wash_price, status, created_at)
             VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))`,
            [market_id, name, phone || '', washer_name || '', wash_price || 100],
            function(err) {
                if (err) {
                    console.error('خطأ في إضافة مغسلة:', err);
                    return res.status(500).json({ error: 'خطأ في إضافة مغسلة' });
                }
                res.json({ success: true, message: 'تم إضافة مغسلة' });
            }
        );
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/drivers', requireAdmin, (req, res) => {
    try {
        const { user_id, market_id, vehicle_type, license_plate } = req.body;
        
        if (!user_id || !market_id) {
            return res.status(400).json({ error: 'معرف المستخدم والسوق مطلوبان' });
        }
        
        db.run(
            `INSERT INTO drivers (user_id, market_id, vehicle_type, license_plate, status, created_at)
             VALUES (?, ?, ?, ?, 'available', datetime('now'))`,
            [user_id, market_id, vehicle_type || '', license_plate || ''],
            function(err) {
                if (err) {
                    console.error('خطأ في إضافة مندوب:', err);
                    return res.status(500).json({ error: 'خطأ في إضافة مندوب' });
                }
                res.json({ success: true, message: 'تم إضافة مندوب' });
            }
        );
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. المنتجات
app.get('/api/products', (req, res) => {
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
        
        db.all(query, params, (err, products) => {
            if (err) {
                console.error('خطأ في جلب المنتجات:', err);
                return res.status(500).json({ error: 'خطأ في الخادم' });
            }
            
            // إضافة التقييمات لكل منتج
            const productsWithRatings = products.map(product => {
                return new Promise((resolve) => {
                    db.get(
                        `SELECT AVG(rating) as avg_rating, COUNT(*) as review_count 
                         FROM reviews WHERE product_id = ?`,
                        [product.id],
                        (err, ratingData) => {
                            if (err || !ratingData) {
                                product.avg_rating = 0;
                                product.review_count = 0;
                            } else {
                                product.avg_rating = ratingData.avg_rating || 0;
                                product.review_count = ratingData.review_count || 0;
                            }
                            resolve(product);
                        }
                    );
                });
            });
            
            Promise.all(productsWithRatings)
                .then(products => {
                    res.json({ success: true, products });
                })
                .catch(error => {
                    console.error('خطأ في معالجة التقييمات:', error);
                    res.json({ success: true, products });
                });
        });
    } catch (error) {
        console.error('خطأ في جلب المنتجات:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/products/:id', (req, res) => {
    const productId = req.params.id;
    
    db.get(
        `SELECT p.*, u.name as seller_name, u.avatar as seller_avatar,
                s.store_name, s.rating as seller_rating,
                m.name as market_name
         FROM products p
         LEFT JOIN users u ON p.seller_id = u.id
         LEFT JOIN sellers s ON p.seller_id = s.user_id
         LEFT JOIN markets m ON p.market_id = m.id
         WHERE p.id = ? AND p.status = 'active'`,
        [productId],
        (err, product) => {
            if (err) {
                console.error('خطأ في جلب المنتج:', err);
                return res.status(500).json({ error: 'خطأ في الخادم' });
            }
            
            if (!product) {
                return res.status(404).json({ error: 'المنتج غير موجود' });
            }
            
            // جلب التقييمات
            db.all(
                `SELECT r.*, u.name as user_name 
                 FROM reviews r 
                 LEFT JOIN users u ON r.user_id = u.id
                 WHERE r.product_id = ? 
                 ORDER BY r.created_at DESC`,
                [productId],
                (err, reviews) => {
                    if (err) {
                        console.error('خطأ في جلب التقييمات:', err);
                        reviews = [];
                    }
                    
                    product.reviews = reviews;
                    
                    // جلب متوسط التقييم
                    db.get(
                        `SELECT AVG(rating) as avg_rating, COUNT(*) as review_count 
                         FROM reviews WHERE product_id = ?`,
                        [productId],
                        (err, ratingData) => {
                            if (!err && ratingData) {
                                product.avg_rating = ratingData.avg_rating || 0;
                                product.review_count = ratingData.review_count || 0;
                            } else {
                                product.avg_rating = 0;
                                product.review_count = 0;
                            }
                            
                            res.json({ success: true, product });
                        }
                    );
                }
            );
        }
    );
});

app.post('/api/products', requireSeller, upload.single('productImage'), (req, res) => {
    try {
        const { name, description, price, category, quantity, market_id, specifications } = req.body;
        const seller_id = req.session.userId;
        
        if (!name || !price || !market_id) {
            return res.status(400).json({ error: 'الاسم والسعر والسوق مطلوبة' });
        }
        
        const image = req.file ? `/uploads/products/${req.file.filename}` : null;
        
        db.run(
            `INSERT INTO products (seller_id, market_id, name, description, price, image, 
                                  category, quantity, specifications, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))`,
            [seller_id, market_id, name, description || '', price, image, 
             category || 'عام', quantity || 1, specifications || ''],
            function(err) {
                if (err) {
                    console.error('خطأ في إضافة المنتج:', err);
                    return res.status(500).json({ error: 'خطأ في إضافة المنتج' });
                }
                
                res.json({ 
                    success: true, 
                    message: 'تم إضافة المنتج',
                    product_id: this.lastID 
                });
            }
        );
    } catch (error) {
        console.error('خطأ في إضافة المنتج:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/products/:id', requireSeller, upload.single('productImage'), (req, res) => {
    try {
        const productId = req.params.id;
        const { name, description, price, category, quantity, market_id, specifications } = req.body;
        const seller_id = req.session.userId;
        
        // التحقق من ملكية المنتج
        db.get('SELECT seller_id FROM products WHERE id = ?', [productId], (err, product) => {
            if (err || !product || product.seller_id !== seller_id) {
                return res.status(403).json({ error: 'غير مصرح لك بتعديل هذا المنتج' });
            }
            
            const image = req.file ? `/uploads/products/${req.file.filename}` : req.body.image;
            
            const updates = [];
            const params = [];
            
            if (name) { updates.push('name = ?'); params.push(name); }
            if (description !== undefined) { updates.push('description = ?'); params.push(description); }
            if (price) { updates.push('price = ?'); params.push(price); }
            if (category) { updates.push('category = ?'); params.push(category); }
            if (quantity !== undefined) { updates.push('quantity = ?'); params.push(quantity); }
            if (market_id) { updates.push('market_id = ?'); params.push(market_id); }
            if (specifications !== undefined) { updates.push('specifications = ?'); params.push(specifications); }
            if (image) { updates.push('image = ?'); params.push(image); }
            
            if (updates.length === 0) {
                return res.status(400).json({ error: 'لا توجد بيانات للتحديث' });
            }
            
            params.push(productId);
            
            db.run(
                `UPDATE products SET ${updates.join(', ')} WHERE id = ?`,
                params,
                function(err) {
                    if (err) {
                        console.error('خطأ في تحديث المنتج:', err);
                        return res.status(500).json({ error: 'خطأ في تحديث المنتج' });
                    }
                    
                    res.json({ success: true, message: 'تم تحديث المنتج' });
                }
            );
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/products/:id', requireSeller, (req, res) => {
    const productId = req.params.id;
    const seller_id = req.session.userId;
    
    db.get('SELECT seller_id FROM products WHERE id = ?', [productId], (err, product) => {
        if (err || !product || product.seller_id !== seller_id) {
            return res.status(403).json({ error: 'غير مصرح لك بحذف هذا المنتج' });
        }
        
        db.run('UPDATE products SET status = "deleted" WHERE id = ?', [productId], function(err) {
            if (err) {
                console.error('خطأ في حذف المنتج:', err);
                return res.status(500).json({ error: 'خطأ في حذف المنتج' });
            }
            
            res.json({ success: true, message: 'تم حذف المنتج' });
        });
    });
});

// 5. عملية الشراء
app.post('/api/orders', requireBuyer, async (req, res) => {
    const transaction = async () => {
        try {
            const { items, shipping_address, payment_method, wash_qat } = req.body;
            const buyer_id = req.session.userId;
            
            if (!items || !Array.isArray(items) || items.length === 0) {
                throw new Error('السلة فارغة');
            }
            
            if (!shipping_address) {
                throw new Error('عنوان التوصيل مطلوب');
            }
            
            // حساب المبلغ الإجمالي
            let total = 0;
            const productDetails = [];
            
            for (const item of items) {
                const product = await new Promise((resolve, reject) => {
                    db.get('SELECT * FROM products WHERE id = ? AND status = "active"', 
                        [item.product_id], (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        });
                });
                
                if (!product) {
                    throw new Error(`المنتج غير موجود: ${item.product_id}`);
                }
                
                if (product.quantity < item.quantity) {
                    throw new Error(`الكمية غير متوفرة للمنتج: ${product.name}`);
                }
                
                const itemTotal = product.price * item.quantity;
                total += itemTotal;
                productDetails.push({ product, quantity: item.quantity, itemTotal });
            }
            
            // إضافة تكلفة الغسيل إذا تم اختياره
            if (wash_qat) {
                total += 100;
            }
            
            // التحقق من رصيد المشتري
            const wallet = await new Promise((resolve, reject) => {
                db.get('SELECT balance FROM wallets WHERE user_id = ?', [buyer_id], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            
            if (!wallet || wallet.balance < total) {
                throw new Error('رصيد غير كافٍ');
            }
            
            // إنشاء رمز الطلب
            const order_code = generateOrderCode();
            
            // بدء المعاملة
            return new Promise((resolve, reject) => {
                db.serialize(() => {
                    db.run('BEGIN TRANSACTION');
                    
                    // خصم المبلغ من المشتري
                    db.run('UPDATE wallets SET balance = balance - ? WHERE user_id = ?', 
                        [total, buyer_id], function(err) {
                            if (err) {
                                db.run('ROLLBACK');
                                reject(err);
                            }
                        });
                    
                    // إنشاء الطلب
                    db.run(
                        `INSERT INTO orders (buyer_id, total, shipping_address, payment_method, 
                                            wash_qat, status, order_code, created_at)
                         VALUES (?, ?, ?, ?, ?, 'pending', ?, datetime('now'))`,
                        [buyer_id, total, shipping_address, payment_method || 'balance', 
                         wash_qat ? 1 : 0, order_code],
                        function(err) {
                            if (err) {
                                db.run('ROLLBACK');
                                reject(err);
                            }
                            
                            const orderId = this.lastID;
                            
                            // إضافة العناصر وتحديث الكميات
                            let itemsProcessed = 0;
                            
                            productDetails.forEach(({ product, quantity, itemTotal }) => {
                                db.run(
                                    `INSERT INTO order_items (order_id, product_id, seller_id, quantity, 
                                                            unit_price, total_price)
                                     VALUES (?, ?, ?, ?, ?, ?)`,
                                    [orderId, product.id, product.seller_id, quantity, product.price, itemTotal],
                                    function(err) {
                                        if (err) {
                                            db.run('ROLLBACK');
                                            reject(err);
                                        }
                                        
                                        // تقليل الكمية المتاحة
                                        db.run('UPDATE products SET quantity = quantity - ? WHERE id = ?',
                                            [quantity, product.id],
                                            function(err) {
                                                if (err) {
                                                    db.run('ROLLBACK');
                                                    reject(err);
                                                }
                                                
                                                itemsProcessed++;
                                                if (itemsProcessed === productDetails.length) {
                                                    // إضافة المبلغ للبائع
                                                    const sellers = {};
                                                    productDetails.forEach(({ product, itemTotal }) => {
                                                        if (!sellers[product.seller_id]) {
                                                            sellers[product.seller_id] = 0;
                                                        }
                                                        sellers[product.seller_id] += itemTotal;
                                                    });
                                                    
                                                    let sellersProcessed = 0;
                                                    const sellerIds = Object.keys(sellers);
                                                    
                                                    if (sellerIds.length === 0) {
                                                        db.run('COMMIT');
                                                        resolve({ orderId, order_code });
                                                    }
                                                    
                                                    sellerIds.forEach(sellerId => {
                                                        db.run('UPDATE wallets SET balance = balance + ? WHERE user_id = ?',
                                                            [sellers[sellerId], sellerId],
                                                            function(err) {
                                                                if (err) {
                                                                    db.run('ROLLBACK');
                                                                    reject(err);
                                                                }
                                                                
                                                                sellersProcessed++;
                                                                if (sellersProcessed === sellerIds.length) {
                                                                    db.run('COMMIT');
                                                                    resolve({ orderId, order_code });
                                                                }
                                                            }
                                                        );
                                                    });
                                                }
                                            }
                                        );
                                    }
                                );
                            });
                        }
                    );
                });
            });
            
        } catch (error) {
            throw error;
        }
    };
    
    try {
        const { orderId, order_code } = await transaction();
        
        // إرسال إشعارات
        sendOrderNotifications(orderId, req.session.userId);
        
        res.json({ 
            success: true, 
            message: 'تم إنشاء الطلب بنجاح',
            order_id: orderId,
            order_code: order_code
        });
        
    } catch (error) {
        console.error('خطأ في إنشاء الطلب:', error);
        res.status(400).json({ error: error.message });
    }
});

// 6. المحفظة والشحن
app.get('/api/wallet', requireAuth, (req, res) => {
    const user_id = req.session.userId;
    
    db.get('SELECT * FROM wallets WHERE user_id = ?', [user_id], (err, wallet) => {
        if (err) {
            console.error('خطأ في جلب المحفظة:', err);
            return res.status(500).json({ error: 'خطأ في الخادم' });
        }
        
        if (!wallet) {
            // إنشاء محفظة إذا لم تكن موجودة
            db.run('INSERT INTO wallets (user_id, balance, created_at) VALUES (?, 0, datetime("now"))',
                [user_id],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'خطأ في إنشاء المحفظة' });
                    }
                    res.json({ success: true, wallet: { user_id, balance: 0 } });
                }
            );
        } else {
            res.json({ success: true, wallet });
        }
    });
});

app.post('/api/wallet/topup', requireAuth, (req, res) => {
    try {
        const { amount, method, transaction_id, wallet_type } = req.body;
        const user_id = req.session.userId;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'المبلغ غير صحيح' });
        }
        
        // تسجيل العملية
        db.run(
            `INSERT INTO transactions (user_id, amount, type, method, transaction_id, 
                                    wallet_type, status, created_at)
             VALUES (?, ?, 'deposit', ?, ?, ?, 'pending', datetime('now'))`,
            [user_id, amount, method || 'manual', transaction_id || '', wallet_type || 'balance'],
            function(err) {
                if (err) {
                    console.error('خطأ في تسجيل المعاملة:', err);
                    return res.status(500).json({ error: 'خطأ في تسجيل المعاملة' });
                }
                
                // في حالة الدفع الفوري، تأكيد العملية
                if (method === 'instant' || method === 'manual') {
                    db.run('UPDATE wallets SET balance = balance + ? WHERE user_id = ?',
                        [amount, user_id],
                        (err) => {
                            if (err) {
                                console.error('خطأ في تحديث الرصيد:', err);
                                return res.status(500).json({ error: 'خطأ في تحديث الرصيد' });
                            }
                            
                            db.run('UPDATE transactions SET status = "completed" WHERE id = ?',
                                [this.lastID],
                                (err) => {
                                    if (err) {
                                        console.error('خطأ في تحديث حالة المعاملة:', err);
                                    }
                                }
                            );
                        }
                    );
                }
                
                res.json({ 
                    success: true, 
                    message: 'تم بدء عملية الشحن',
                    transaction_id: this.lastID 
                });
            }
        );
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/wallet/withdraw', requireSeller, (req, res) => {
    try {
        const { amount, wallet_number, wallet_type, full_name } = req.body;
        const user_id = req.session.userId;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'المبلغ غير صحيح' });
        }
        
        if (!wallet_number || !wallet_type || !full_name) {
            return res.status(400).json({ error: 'جميع بيانات السحب مطلوبة' });
        }
        
        // التحقق من الرصيد
        db.get('SELECT balance FROM wallets WHERE user_id = ?', [user_id], (err, wallet) => {
            if (err || !wallet) {
                return res.status(500).json({ error: 'خطأ في التحقق من الرصيد' });
            }
            
            if (wallet.balance < amount) {
                return res.status(400).json({ error: 'رصيد غير كافٍ' });
            }
            
            // خصم المبلغ
            db.run('UPDATE wallets SET balance = balance - ? WHERE user_id = ?',
                [amount, user_id],
                function(err) {
                    if (err) {
                        console.error('خطأ في خصم المبلغ:', err);
                        return res.status(500).json({ error: 'خطأ في خصم المبلغ' });
                    }
                    
                    // تسجيل عملية السحب
                    db.run(
                        `INSERT INTO withdrawals (user_id, amount, wallet_number, wallet_type, 
                                               full_name, status, created_at)
                         VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))`,
                        [user_id, amount, wallet_number, wallet_type, full_name],
                        function(err) {
                            if (err) {
                                console.error('خطأ في تسجيل السحب:', err);
                                return res.status(500).json({ error: 'خطأ في تسجيل السحب' });
                            }
                            
                            // إرسال إشعار للمدير
                            db.get('SELECT id FROM users WHERE role = "admin" LIMIT 1', [], (err, admin) => {
                                if (!err && admin) {
                                    sendNotification(admin.id, 'طلب سحب جديد', 
                                        `طلب سحب بمبلغ ${amount} ريال من البائع ${user_id}`);
                                }
                            });
                            
                            res.json({ success: true, message: 'تم تقديم طلب السحب' });
                        }
                    );
                }
            );
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 7. الإعلانات
app.get('/api/ads', (req, res) => {
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
                console.error('خطأ في جلب الإعلانات:', err);
                return res.status(500).json({ error: 'خطأ في الخادم' });
            }
            res.json({ success: true, ads });
        }
    );
});

app.post('/api/admin/ads', requireAdmin, upload.single('adImage'), (req, res) => {
    try {
        const { title, description, link, position, is_active, package_id } = req.body;
        
        if (!title || !position) {
            return res.status(400).json({ error: 'العنوان والموقع مطلوبان' });
        }
        
        const image = req.file ? `/uploads/ads/${req.file.filename}` : null;
        
        db.run(
            `INSERT INTO ads (title, description, image, link, position, is_active, 
                           package_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [title, description || '', image, link || '', position, is_active ? 1 : 0, package_id || null],
            function(err) {
                if (err) {
                    console.error('خطأ في إضافة الإعلان:', err);
                    return res.status(500).json({ error: 'خطأ في إضافة الإعلان' });
                }
                res.json({ success: true, message: 'تم إضافة الإعلان', adId: this.lastID });
            }
        );
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/ad-packages', requireAdmin, (req, res) => {
    try {
        const { name, description, price, duration, features } = req.body;
        
        if (!name || !price) {
            return res.status(400).json({ error: 'الاسم والسعر مطلوبان' });
        }
        
        db.run(
            `INSERT INTO ad_packages (name, description, price, duration, features, created_at)
             VALUES (?, ?, ?, ?, ?, datetime('now'))`,
            [name, description || '', price, duration || 30, features || ''],
            function(err) {
                if (err) {
                    console.error('خطأ في إضافة الباقة:', err);
                    return res.status(500).json({ error: 'خطأ في إضافة الباقة' });
                }
                res.json({ success: true, message: 'تم إضافة باقة الإعلانات' });
            }
        );
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/ads/purchase', requireSeller, (req, res) => {
    try {
        const { package_id, ad_data } = req.body;
        const seller_id = req.session.userId;
        
        if (!package_id || !ad_data || !ad_data.title) {
            return res.status(400).json({ error: 'بيانات الإعلان غير مكتملة' });
        }
        
        // الحصول على سعر الباقة
        db.get('SELECT price FROM ad_packages WHERE id = ?', [package_id], (err, package) => {
            if (err || !package) {
                return res.status(400).json({ error: 'الباقة غير موجودة' });
            }
            
            // التحقق من الرصيد
            db.get('SELECT balance FROM wallets WHERE user_id = ?', [seller_id], (err, wallet) => {
                if (err || !wallet || wallet.balance < package.price) {
                    return res.status(400).json({ error: 'رصيد غير كافٍ' });
                }
                
                // خصم المبلغ
                db.run('UPDATE wallets SET balance = balance - ? WHERE user_id = ?',
                    [package.price, seller_id],
                    function(err) {
                        if (err) {
                            console.error('خطأ في خصم المبلغ:', err);
                            return res.status(500).json({ error: 'خطأ في خصم المبلغ' });
                        }
                        
                        // إنشاء الإعلان
                        db.run(
                            `INSERT INTO ads (title, description, image, link, position, is_active, 
                                           package_id, seller_id, created_at)
                             VALUES (?, ?, ?, ?, ?, 1, ?, ?, datetime('now'))`,
                            [ad_data.title, ad_data.description || '', ad_data.image || null, 
                             ad_data.link || '', ad_data.position || 'middle', package_id, seller_id],
                            function(err) {
                                if (err) {
                                    console.error('خطأ في إنشاء الإعلان:', err);
                                    return res.status(500).json({ error: 'خطأ في إنشاء الإعلان' });
                                }
                                
                                res.json({ success: true, message: 'تم شراء الإعلان بنجاح', adId: this.lastID });
                            }
                        );
                    }
                );
            });
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 8. إدارة المدير
app.get('/api/admin/stats', requireAdmin, (req, res) => {
    try {
        const stats = {};
        
        // استخدام وعود لجلب جميع الإحصائيات
        const promises = [
            new Promise((resolve) => {
                db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
                    stats.total_users = err ? 0 : row.count;
                    resolve();
                });
            }),
            new Promise((resolve) => {
                db.get('SELECT COUNT(*) as count FROM users WHERE role = "seller"', [], (err, row) => {
                    stats.total_sellers = err ? 0 : row.count;
                    resolve();
                });
            }),
            new Promise((resolve) => {
                db.get('SELECT COUNT(*) as count FROM users WHERE role = "buyer"', [], (err, row) => {
                    stats.total_buyers = err ? 0 : row.count;
                    resolve();
                });
            }),
            new Promise((resolve) => {
                db.get('SELECT COUNT(*) as count FROM orders', [], (err, row) => {
                    stats.total_orders = err ? 0 : row.count;
                    resolve();
                });
            }),
            new Promise((resolve) => {
                db.get('SELECT SUM(total) as total FROM orders WHERE status = "completed"', [], (err, row) => {
                    stats.total_revenue = err ? 0 : (row.total || 0);
                    resolve();
                });
            }),
            new Promise((resolve) => {
                db.get('SELECT COUNT(*) as count FROM orders WHERE status = "pending"', [], (err, row) => {
                    stats.pending_orders = err ? 0 : row.count;
                    resolve();
                });
            }),
            new Promise((resolve) => {
                db.get('SELECT COUNT(*) as count FROM products WHERE status = "active"', [], (err, row) => {
                    stats.active_products = err ? 0 : row.count;
                    resolve();
                });
            }),
            new Promise((resolve) => {
                db.get(`SELECT COUNT(*) as count FROM orders 
                        WHERE DATE(created_at) = DATE('now')`, [], (err, row) => {
                    stats.today_orders = err ? 0 : row.count;
                    resolve();
                });
            })
        ];
        
        Promise.all(promises)
            .then(() => {
                res.json({ success: true, stats });
            })
            .catch(error => {
                console.error('خطأ في جلب الإحصائيات:', error);
                res.status(500).json({ error: 'خطأ في جلب الإحصائيات' });
            });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/backup', requireAdmin, (req, res) => {
    try {
        const tables = ['users', 'products', 'orders', 'transactions', 'markets', 
                       'wash_stations', 'drivers', 'ads', 'reviews', 'sellers', 
                       'wallets', 'order_items', 'withdrawals', 'ad_packages',
                       'notifications', 'gift_codes', 'gift_code_uses'];
        
        const backupData = {};
        const promises = [];
        
        for (const table of tables) {
            promises.push(
                new Promise((resolve) => {
                    db.all(`SELECT * FROM ${table}`, [], (err, rows) => {
                        if (!err) {
                            backupData[table] = rows;
                        }
                        resolve();
                    });
                })
            );
        }
        
        Promise.all(promises)
            .then(() => {
                // حفظ كملف JSON
                const fileName = `backup_${Date.now()}.json`;
                const filePath = path.join(__dirname, 'data', 'backups', fileName);
                
                if (!fs.existsSync(path.dirname(filePath))) {
                    fs.mkdirSync(path.dirname(filePath), { recursive: true });
                }
                
                fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));
                
                res.json({ 
                    success: true, 
                    message: 'تم إنشاء النسخة الاحتياطية',
                    file: fileName,
                    download_url: `/api/admin/backup/download/${fileName}`
                });
            })
            .catch(error => {
                console.error('خطأ في النسخ الاحتياطي:', error);
                res.status(500).json({ error: 'خطأ في النسخ الاحتياطي' });
            });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/backup/download/:filename', requireAdmin, (req, res) => {
    const fileName = req.params.filename;
    const filePath = path.join(__dirname, 'data', 'backups', fileName);
    
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).json({ error: 'الملف غير موجود' });
    }
});

// 9. التقييمات والتعليقات
app.post('/api/reviews', requireAuth, (req, res) => {
    try {
        const { order_id, product_id, seller_id, rating, comment } = req.body;
        const user_id = req.session.userId;
        
        if (!product_id || !rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'تقييم غير صحيح' });
        }
        
        // التحقق من أن المستخدم قام بشراء المنتج
        db.get(
            `SELECT 1 FROM orders o
             JOIN order_items oi ON o.id = oi.order_id
             WHERE o.buyer_id = ? AND oi.product_id = ? AND o.status = 'completed'`,
            [user_id, product_id],
            (err, orderCheck) => {
                if (err || !orderCheck) {
                    return res.status(400).json({ error: 'يجب شراء المنتج أولاً لتقييمه' });
                }
                
                db.run(
                    `INSERT INTO reviews (user_id, order_id, product_id, seller_id, rating, comment, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
                    [user_id, order_id || null, product_id, seller_id || null, rating, comment || ''],
                    function(err) {
                        if (err) {
                            console.error('خطأ في إضافة التقييم:', err);
                            return res.status(500).json({ error: 'خطأ في إضافة التقييم' });
                        }
                        
                        // تحديث تقييم البائع إذا كان هناك seller_id
                        if (seller_id) {
                            db.get(
                                `SELECT AVG(rating) as avg FROM reviews WHERE seller_id = ?`,
                                [seller_id],
                                (err, result) => {
                                    if (!err && result) {
                                        db.run('UPDATE sellers SET rating = ? WHERE user_id = ?',
                                            [result.avg || 0, seller_id]);
                                    }
                                }
                            );
                        }
                        
                        res.json({ success: true, message: 'تم إضافة التقييم', reviewId: this.lastID });
                    }
                );
            }
        );
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/products/:id/reviews', (req, res) => {
    const productId = req.params.id;
    
    db.all(
        `SELECT r.*, u.name as user_name, u.avatar as user_avatar
         FROM reviews r
         LEFT JOIN users u ON r.user_id = u.id
         WHERE r.product_id = ?
         ORDER BY r.created_at DESC`,
        [productId],
        (err, reviews) => {
            if (err) {
                console.error('خطأ في جلب التقييمات:', err);
                return res.status(500).json({ error: 'خطأ في الخادم' });
            }
            res.json({ success: true, reviews });
        }
    );
});

// 10. الإشعارات
app.get('/api/notifications', requireAuth, (req, res) => {
    const user_id = req.session.userId;
    
    db.all(
        `SELECT * FROM notifications 
         WHERE user_id = ? 
         ORDER BY created_at DESC 
         LIMIT 50`,
        [user_id],
        (err, notifications) => {
            if (err) {
                console.error('خطأ في جلب الإشعارات:', err);
                return res.status(500).json({ error: 'خطأ في الخادم' });
            }
            
            // تحديث حالة القراءة
            db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
                [user_id],
                (err) => {
                    if (err) console.error('خطأ في تحديث الإشعارات:', err);
                }
            );
            
            res.json({ success: true, notifications });
        }
    );
});

// 11. كود الهدايا
app.post('/api/admin/gift-codes', requireAdmin, (req, res) => {
    try {
        const { amount, expires_at, max_uses } = req.body;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'المبلغ غير صحيح' });
        }
        
        const code = generateGiftCode();
        
        db.run(
            `INSERT INTO gift_codes (code, amount, expires_at, max_uses, remaining_uses, created_at)
             VALUES (?, ?, ?, ?, ?, datetime('now'))`,
            [code, amount, expires_at || null, max_uses || 1, max_uses || 1],
            function(err) {
                if (err) {
                    console.error('خطأ في إنشاء كود الهدية:', err);
                    return res.status(500).json({ error: 'خطأ في إنشاء كود الهدية' });
                }
                res.json({ success: true, code, message: 'تم إنشاء كود الهدية' });
            }
        );
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/wallet/redeem-gift', requireAuth, (req, res) => {
    try {
        const { code } = req.body;
        const user_id = req.session.userId;
        
        if (!code) {
            return res.status(400).json({ error: 'كود الهدية مطلوب' });
        }
        
        db.get(
            `SELECT * FROM gift_codes 
             WHERE code = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
             AND remaining_uses > 0`,
            [code],
            (err, giftCode) => {
                if (err || !giftCode) {
                    return res.status(400).json({ error: 'كود الهدية غير صالح' });
                }
                
                // التحقق من أن المستخدم لم يستخدم الكود من قبل
                db.get(
                    `SELECT 1 FROM gift_code_uses WHERE code = ? AND user_id = ?`,
                    [code, user_id],
                    (err, usedBefore) => {
                        if (err || usedBefore) {
                            return res.status(400).json({ error: 'لقد استخدمت هذا الكود من قبل' });
                        }
                        
                        // إضافة الرصيد
                        db.run('UPDATE wallets SET balance = balance + ? WHERE user_id = ?',
                            [giftCode.amount, user_id],
                            function(err) {
                                if (err) {
                                    console.error('خطأ في إضافة الرصيد:', err);
                                    return res.status(500).json({ error: 'خطأ في إضافة الرصيد' });
                                }
                                
                                // تحديث عدد الاستخدامات المتبقية
                                db.run('UPDATE gift_codes SET remaining_uses = remaining_uses - 1 WHERE id = ?',
                                    [giftCode.id],
                                    (err) => {
                                        if (err) console.error('خطأ في تحديث الاستخدامات:', err);
                                    }
                                );
                                
                                // تسجيل الاستخدام
                                db.run(
                                    `INSERT INTO gift_code_uses (code, user_id, amount, created_at)
                                     VALUES (?, ?, ?, datetime('now'))`,
                                    [code, user_id, giftCode.amount],
                                    (err) => {
                                        if (err) console.error('خطأ في تسجيل الاستخدام:', err);
                                    }
                                );
                                
                                res.json({ 
                                    success: true, 
                                    message: `تم إضافة ${giftCode.amount} ريال إلى رصيدك` 
                                });
                            }
                        );
                    }
                );
            }
        );
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 12. الملفات الثابتة
app.get('/uploads/*', (req, res) => {
    const filePath = path.join(__dirname, req.path);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).json({ error: 'الملف غير موجود' });
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
            if (err) console.error('خطأ في إرسال الإشعار:', err);
            else {
                // إرسال عبر WebSocket
                io.to(`user_${user_id}`).emit('notification', { title, message });
            }
        }
    );
}

function sendOrderNotifications(orderId, buyerId) {
    // إشعار للمشتري
    sendNotification(buyerId, 'طلب جديد', `تم إنشاء طلبك بنجاح رقم #${orderId}`);
    
    // جلب تفاصيل الطلب لإرسال إشعارات للبائعين
    db.all(
        `SELECT DISTINCT oi.seller_id, p.name 
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ?`,
        [orderId],
        (err, sellers) => {
            if (!err && sellers) {
                sellers.forEach(seller => {
                    sendNotification(seller.seller_id, 'طلب جديد', 
                        `لديك طلب جديد على المنتج: ${seller.name}`);
                });
            }
        }
    );
    
    // إشعار للمدير
    db.get('SELECT id FROM users WHERE role = "admin" LIMIT 1', [], (err, admin) => {
        if (!err && admin) {
            sendNotification(admin.id, 'طلب جديد', `تم إنشاء طلب جديد رقم #${orderId}`);
        }
    });
}

// معالج الأخطاء
app.use((err, req, res, next) => {
    console.error('خطأ غير متوقع:', err);
    
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
    res.status(404).json({ error: 'الصفحة غير موجودة' });
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
