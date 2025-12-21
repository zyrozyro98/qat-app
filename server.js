const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
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
    origin: process.env.NODE_ENV === 'production' ? 'https://yourdomain.com' : 'http://localhost:3000',
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
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
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

// 1. المصادقة والمستخدمين
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, phone, password, role, storeName, vehicleType } = req.body;
        
        // التحقق من البيانات
        if (!name || !email || !phone || !password || !role) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        
        // التحقق من وجود المستخدم
        const existingUser = db.prepare('SELECT id FROM users WHERE email = ? OR phone = ?').get(email, phone);
        if (existingUser) {
            return res.status(400).json({ error: 'البريد الإلكتروني أو رقم الهاتف مستخدم بالفعل' });
        }
        
        // تشفير كلمة المرور
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // إنشاء الحساب
        const result = db.prepare(`
            INSERT INTO users (name, email, phone, password, role, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))
        `).run(name, email, phone, hashedPassword, role);
        
        const userId = result.lastInsertRowid;
        
        // إنشاء المحفظة
        db.prepare(`
            INSERT INTO wallets (user_id, balance, created_at)
            VALUES (?, 0, datetime('now'))
        `).run(userId);
        
        // إذا كان بائعاً، إضافة متجر
        if (role === 'seller' && storeName) {
            db.prepare(`
                INSERT INTO sellers (user_id, store_name, rating, total_sales, created_at)
                VALUES (?, ?, 0, 0, datetime('now'))
            `).run(userId, storeName);
        }
        
        // إذا كان مندوب توصيل
        if (role === 'driver' && vehicleType) {
            db.prepare(`
                INSERT INTO drivers (user_id, vehicle_type, rating, status, created_at)
                VALUES (?, ?, 0, 'available', datetime('now'))
            `).run(userId, vehicleType);
        }
        
        // تسجيل الدخول التلقائي
        req.session.userId = userId;
        req.session.role = role;
        req.session.userEmail = email;
        
        // إرسال بريد ترحيبي
        sendWelcomeEmail(email, name, role);
        
        res.json({ 
            success: true, 
            message: 'تم إنشاء الحساب بنجاح',
            user: { id: userId, name, email, phone, role }
        });
        
    } catch (error) {
        console.error('خطأ في التسجيل:', error);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = db.prepare('SELECT * FROM users WHERE email = ? AND status = "active"').get(email);
        
        if (!user) {
            return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
        }
        
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
        console.error('خطأ في تسجيل الدخول:', error);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: 'تم تسجيل الخروج' });
});

// 2. الأسواق والمغاسل (المدير فقط)
app.post('/api/admin/markets', requireAdmin, (req, res) => {
    try {
        const { name, location, description, phone, manager } = req.body;
        
        const result = db.prepare(`
            INSERT INTO markets (name, location, description, phone, manager, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))
        `).run(name, location, description, phone, manager);
        
        io.emit('marketAdded', { id: result.lastInsertRowid, name });
        
        res.json({ success: true, message: 'تم إضافة السوق' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/wash-stations', requireAdmin, (req, res) => {
    try {
        const { market_id, name, phone, washer_name, wash_price } = req.body;
        
        const result = db.prepare(`
            INSERT INTO wash_stations (market_id, name, phone, washer_name, wash_price, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))
        `).run(market_id, name, phone, washer_name, wash_price || 100);
        
        res.json({ success: true, message: 'تم إضافة مغسلة' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/drivers', requireAdmin, (req, res) => {
    try {
        const { user_id, market_id, vehicle_type, license_plate } = req.body;
        
        const result = db.prepare(`
            INSERT INTO drivers (user_id, market_id, vehicle_type, license_plate, status, created_at)
            VALUES (?, ?, ?, ?, 'available', datetime('now'))
        `).run(user_id, market_id, vehicle_type, license_plate);
        
        res.json({ success: true, message: 'تم إضافة مندوب' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. المنتجات
app.get('/api/products', (req, res) => {
    try {
        const { category, market_id, seller_id, min_price, max_price, search } = req.query;
        
        let query = `
            SELECT p.*, u.name as seller_name, u.avatar as seller_avatar,
                   s.store_name, s.rating as seller_rating,
                   m.name as market_name,
                   (SELECT AVG(rating) FROM reviews WHERE product_id = p.id) as avg_rating,
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
            query += ' AND (p.name LIKE ? OR p.description LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        
        query += ' ORDER BY p.created_at DESC';
        
        const products = db.prepare(query).all(...params);
        
        res.json({ success: true, products });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/products', requireSeller, upload.single('productImage'), (req, res) => {
    try {
        const { name, description, price, category, quantity, market_id, specifications } = req.body;
        const seller_id = req.session.userId;
        
        const image = req.file ? `/uploads/products/${req.file.filename}` : null;
        
        const result = db.prepare(`
            INSERT INTO products (seller_id, market_id, name, description, price, image, 
                                  category, quantity, specifications, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))
        `).run(seller_id, market_id, name, description, price, image, category, quantity, specifications);
        
        res.json({ 
            success: true, 
            message: 'تم إضافة المنتج',
            product_id: result.lastInsertRowid 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. عملية الشراء
app.post('/api/orders', requireBuyer, async (req, res) => {
    const transaction = db.transaction(() => {
        try {
            const { items, shipping_address, payment_method, wash_qat } = req.body;
            const buyer_id = req.session.userId;
            
            // حساب المبلغ الإجمالي
            let total = 0;
            for (const item of items) {
                const product = db.prepare('SELECT price FROM products WHERE id = ?').get(item.product_id);
                total += product.price * item.quantity;
            }
            
            // إضافة تكلفة الغسيل إذا تم اختياره
            if (wash_qat) {
                total += 100;
            }
            
            // التحقق من رصيد المشتري
            const wallet = db.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(buyer_id);
            if (wallet.balance < total) {
                throw new Error('رصيد غير كافٍ');
            }
            
            // خصم المبلغ من المشتري
            db.prepare('UPDATE wallets SET balance = balance - ? WHERE user_id = ?').run(total, buyer_id);
            
            // إنشاء الطلب
            const orderResult = db.prepare(`
                INSERT INTO orders (buyer_id, total, shipping_address, payment_method, 
                                    wash_qat, status, order_code, created_at)
                VALUES (?, ?, ?, ?, ?, 'pending', ?, datetime('now'))
            `).run(buyer_id, total, shipping_address, payment_method, wash_qat ? 1 : 0, 
                  generateOrderCode());
            
            const orderId = orderResult.lastInsertRowid;
            
            // إضافة العناصر
            for (const item of items) {
                const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
                
                db.prepare(`
                    INSERT INTO order_items (order_id, product_id, seller_id, quantity, 
                                            unit_price, total_price)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(orderId, item.product_id, product.seller_id, item.quantity, 
                      product.price, product.price * item.quantity);
                
                // تقليل الكمية المتاحة
                db.prepare('UPDATE products SET quantity = quantity - ? WHERE id = ?')
                   .run(item.quantity, item.product_id);
                
                // إرسال إشعار للبائع
                sendNotification(product.seller_id, 'طلب جديد', 
                    `لديك طلب جديد للمنتج: ${product.name}`);
                
                // إرسال بريد للبائع
                const seller = db.prepare('SELECT email FROM users WHERE id = ?').get(product.seller_id);
                sendOrderNotification(seller.email, orderId, product.name);
            }
            
            // إذا كان هناك غسيل، إرسال إشعار لمغسلة القات
            if (wash_qat) {
                const product = db.prepare('SELECT market_id FROM products WHERE id = ?').get(items[0].product_id);
                const washStation = db.prepare(`
                    SELECT * FROM wash_stations WHERE market_id = ? AND status = 'active' LIMIT 1
                `).get(product.market_id);
                
                if (washStation) {
                    db.prepare(`
                        INSERT INTO wash_orders (order_id, wash_station_id, status, created_at)
                        VALUES (?, ?, 'pending', datetime('now'))
                    `).run(orderId, washStation.id);
                    
                    // إرسال إشعار لمغسلة القات
                    sendWashStationNotification(washStation.id, orderId);
                }
            }
            
            // تعيين مندوب توصيل
            assignDriverToOrder(orderId, product.market_id);
            
            res.json({ 
                success: true, 
                message: 'تم إنشاء الطلب بنجاح',
                order_id: orderId,
                order_code: db.prepare('SELECT order_code FROM orders WHERE id = ?').get(orderId).order_code
            });
            
        } catch (error) {
            throw error;
        }
    });
    
    try {
        transaction();
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// 5. المحفظة والشحن
app.post('/api/wallet/topup', requireAuth, (req, res) => {
    try {
        const { amount, method, transaction_id, wallet_type } = req.body;
        const user_id = req.session.userId;
        
        // تسجيل العملية
        const result = db.prepare(`
            INSERT INTO transactions (user_id, amount, type, method, transaction_id, 
                                    wallet_type, status, created_at)
            VALUES (?, ?, 'deposit', ?, ?, ?, 'pending', datetime('now'))
        `).run(user_id, amount, method, transaction_id, wallet_type);
        
        // في حالة الدفع الفوري، تأكيد العملية
        if (method === 'instant') {
            db.prepare('UPDATE wallets SET balance = balance + ? WHERE user_id = ?').run(amount, user_id);
            db.prepare('UPDATE transactions SET status = "completed" WHERE id = ?')
               .run(result.lastInsertRowid);
        }
        
        res.json({ 
            success: true, 
            message: 'تم بدء عملية الشحن',
            transaction_id: result.lastInsertRowid 
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/wallet/withdraw', requireSeller, (req, res) => {
    try {
        const { amount, wallet_number, wallet_type, full_name } = req.body;
        const user_id = req.session.userId;
        
        // التحقق من الرصيد
        const wallet = db.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(user_id);
        if (wallet.balance < amount) {
            return res.status(400).json({ error: 'رصيد غير كافٍ' });
        }
        
        // خصم المبلغ
        db.prepare('UPDATE wallets SET balance = balance - ? WHERE user_id = ?').run(amount, user_id);
        
        // تسجيل عملية السحب
        db.prepare(`
            INSERT INTO withdrawals (user_id, amount, wallet_number, wallet_type, 
                                   full_name, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))
        `).run(user_id, amount, wallet_number, wallet_type, full_name);
        
        // إرسال إشعار للمدير
        const admin = db.prepare('SELECT id FROM users WHERE role = "admin" LIMIT 1').get();
        if (admin) {
            sendNotification(admin.id, 'طلب سحب جديد', 
                `طلب سحب بمبلغ ${amount} من البائع ${user_id}`);
        }
        
        res.json({ success: true, message: 'تم تقديم طلب السحب' });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 6. الإعلانات
app.post('/api/admin/ads', requireAdmin, upload.single('adImage'), (req, res) => {
    try {
        const { title, description, link, position, is_active, package_id } = req.body;
        const image = req.file ? `/uploads/ads/${req.file.filename}` : null;
        
        const result = db.prepare(`
            INSERT INTO ads (title, description, image, link, position, is_active, 
                           package_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(title, description, image, link, position, is_active ? 1 : 0, package_id);
        
        res.json({ success: true, message: 'تم إضافة الإعلان' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/ad-packages', requireAdmin, (req, res) => {
    try {
        const { name, description, price, duration, features } = req.body;
        
        const result = db.prepare(`
            INSERT INTO ad_packages (name, description, price, duration, features, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).run(name, description, price, duration, features);
        
        res.json({ success: true, message: 'تم إضافة باقة الإعلانات' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/ads/purchase', requireSeller, (req, res) => {
    try {
        const { package_id, ad_data } = req.body;
        const seller_id = req.session.userId;
        
        // الحصول على سعر الباقة
        const package = db.prepare('SELECT price FROM ad_packages WHERE id = ?').get(package_id);
        
        // التحقق من الرصيد
        const wallet = db.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(seller_id);
        if (wallet.balance < package.price) {
            return res.status(400).json({ error: 'رصيد غير كافٍ' });
        }
        
        // خصم المبلغ
        db.prepare('UPDATE wallets SET balance = balance - ? WHERE user_id = ?')
           .run(package.price, seller_id);
        
        // إنشاء الإعلان
        db.prepare(`
            INSERT INTO ads (title, description, image, link, position, is_active, 
                           package_id, seller_id, created_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?, datetime('now'))
        `).run(ad_data.title, ad_data.description, ad_data.image, ad_data.link, 
              ad_data.position, package_id, seller_id);
        
        res.json({ success: true, message: 'تم شراء الإعلان بنجاح' });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 7. إدارة المدير
app.get('/api/admin/backup', requireAdmin, (req, res) => {
    try {
        const tables = ['users', 'products', 'orders', 'transactions', 'markets', 
                       'wash_stations', 'drivers', 'ads', 'reviews'];
        
        const backupData = {};
        
        for (const table of tables) {
            backupData[table] = db.prepare(`SELECT * FROM ${table}`).all();
        }
        
        // حفظ كملف Excel
        const workbook = xlsx.utils.book_new();
        
        for (const [table, data] of Object.entries(backupData)) {
            const worksheet = xlsx.utils.json_to_sheet(data);
            xlsx.utils.book_append_sheet(workbook, worksheet, table);
        }
        
        const fileName = `backup_${Date.now()}.xlsx`;
        const filePath = path.join(__dirname, 'data', 'backups', fileName);
        
        if (!fs.existsSync(path.dirname(filePath))) {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
        }
        
        xlsx.writeFile(workbook, filePath);
        
        res.json({ 
            success: true, 
            message: 'تم إنشاء النسخة الاحتياطية',
            file: fileName 
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
    try {
        const stats = {
            total_users: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
            total_sellers: db.prepare('SELECT COUNT(*) as count FROM users WHERE role = "seller"').get().count,
            total_buyers: db.prepare('SELECT COUNT(*) as count FROM users WHERE role = "buyer"').get().count,
            total_orders: db.prepare('SELECT COUNT(*) as count FROM orders').get().count,
            total_revenue: db.prepare('SELECT SUM(total) as total FROM orders WHERE status = "completed"').get().total || 0,
            pending_orders: db.prepare('SELECT COUNT(*) as count FROM orders WHERE status = "pending"').get().count,
            active_products: db.prepare('SELECT COUNT(*) as count FROM products WHERE status = "active"').get().count,
            today_orders: db.prepare(`
                SELECT COUNT(*) as count FROM orders 
                WHERE DATE(created_at) = DATE('now')
            `).get().count
        };
        
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 8. التقييمات والتعليقات
app.post('/api/reviews', requireAuth, (req, res) => {
    try {
        const { order_id, product_id, seller_id, rating, comment } = req.body;
        const user_id = req.session.userId;
        
        // التحقق من أن المستخدم قام بشراء المنتج
        const orderCheck = db.prepare(`
            SELECT 1 FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE o.buyer_id = ? AND oi.product_id = ? AND o.status = 'completed'
        `).get(user_id, product_id);
        
        if (!orderCheck) {
            return res.status(400).json({ error: 'يجب شراء المنتج أولاً لتقييمه' });
        }
        
        db.prepare(`
            INSERT INTO reviews (user_id, order_id, product_id, seller_id, rating, comment, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(user_id, order_id, product_id, seller_id, rating, comment);
        
        // تحديث تقييم البائع
        if (seller_id) {
            const avgRating = db.prepare(`
                SELECT AVG(rating) as avg FROM reviews WHERE seller_id = ?
            `).get(seller_id).avg;
            
            db.prepare('UPDATE sellers SET rating = ? WHERE user_id = ?').run(avgRating, seller_id);
        }
        
        res.json({ success: true, message: 'تم إضافة التقييم' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 9. الإشعارات
app.get('/api/notifications', requireAuth, (req, res) => {
    try {
        const user_id = req.session.userId;
        
        const notifications = db.prepare(`
            SELECT * FROM notifications 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT 50
        `).all(user_id);
        
        // تحديث حالة القراءة
        db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(user_id);
        
        res.json({ success: true, notifications });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 10. كود الهدايا
app.post('/api/admin/gift-codes', requireAdmin, (req, res) => {
    try {
        const { amount, expires_at, max_uses } = req.body;
        const code = generateGiftCode();
        
        db.prepare(`
            INSERT INTO gift_codes (code, amount, expires_at, max_uses, remaining_uses, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).run(code, amount, expires_at, max_uses, max_uses);
        
        res.json({ success: true, code, message: 'تم إنشاء كود الهدية' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/wallet/redeem-gift', requireAuth, (req, res) => {
    try {
        const { code } = req.body;
        const user_id = req.session.userId;
        
        const giftCode = db.prepare(`
            SELECT * FROM gift_codes 
            WHERE code = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
            AND remaining_uses > 0
        `).get(code);
        
        if (!giftCode) {
            return res.status(400).json({ error: 'كود الهدية غير صالح' });
        }
        
        // التحقق من أن المستخدم لم يستخدم الكود من قبل
        const usedBefore = db.prepare(`
            SELECT 1 FROM gift_code_uses WHERE code = ? AND user_id = ?
        `).get(code, user_id);
        
        if (usedBefore) {
            return res.status(400).json({ error: 'لقد استخدمت هذا الكود من قبل' });
        }
        
        // إضافة الرصيد
        db.prepare('UPDATE wallets SET balance = balance + ? WHERE user_id = ?').run(giftCode.amount, user_id);
        
        // تحديث عدد الاستخدامات المتبقية
        db.prepare('UPDATE gift_codes SET remaining_uses = remaining_uses - 1 WHERE id = ?')
           .run(giftCode.id);
        
        // تسجيل الاستخدام
        db.prepare(`
            INSERT INTO gift_code_uses (code, user_id, amount, created_at)
            VALUES (?, ?, ?, datetime('now'))
        `).run(code, user_id, giftCode.amount);
        
        res.json({ 
            success: true, 
            message: `تم إضافة ${giftCode.amount} ريال إلى رصيدك` 
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
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
    db.prepare(`
        INSERT INTO notifications (user_id, title, message, is_read, created_at)
        VALUES (?, ?, ?, 0, datetime('now'))
    `).run(user_id, title, message);
    
    // إرسال عبر WebSocket
    io.to(`user_${user_id}`).emit('notification', { title, message });
}

function sendWelcomeEmail(email, name, role) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'مرحباً بك في تطبيق قات',
        html: `
            <div dir="rtl">
                <h2>مرحباً ${name}!</h2>
                <p>شكراً لتسجيلك في تطبيق قات</p>
                <p>نوع حسابك: ${role === 'seller' ? 'بائع' : role === 'buyer' ? 'مشتري' : 'مندوب توصيل'}</p>
                <p>يمكنك الآن بدء استخدام التطبيق والاستفادة من جميع المميزات</p>
                <hr>
                <p>مع تحيات فريق تطبيق قات</p>
            </div>
        `
    };
    
    transporter.sendMail(mailOptions, (error) => {
        if (error) console.error('خطأ في إرسال البريد:', error);
    });
}

function sendOrderNotification(email, orderId, productName) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'طلب جديد على منتجك',
        html: `
            <div dir="rtl">
                <h2>طلب جديد!</h2>
                <p>لديك طلب جديد على المنتج: ${productName}</p>
                <p>رقم الطلب: ${orderId}</p>
                <p>يرجى التحقق من لوحة التحكم لمزيد من التفاصيل</p>
                <hr>
                <p>تطبيق قات</p>
            </div>
        `
    };
    
    transporter.sendMail(mailOptions);
}

function sendWashStationNotification(wash_station_id, order_id) {
    // إرسال إشعار لمغسلة القات
    db.prepare(`
        INSERT INTO notifications (title, message, is_read, created_at)
        VALUES ('طلب غسيل جديد', 'طلب غسيل جديد رقم ${order_id}', 0, datetime('now'))
    `).run();
}

function assignDriverToOrder(order_id, market_id) {
    const driver = db.prepare(`
        SELECT d.* FROM drivers d
        WHERE d.market_id = ? AND d.status = 'available'
        ORDER BY RANDOM() LIMIT 1
    `).get(market_id);
    
    if (driver) {
        db.prepare('UPDATE drivers SET status = "busy" WHERE id = ?').run(driver.id);
        db.prepare('UPDATE orders SET driver_id = ? WHERE id = ?').run(driver.id, order_id);
        
        sendNotification(driver.user_id, 'طلب توصيل جديد', 
            `لديك طلب توصيل جديد رقم ${order_id}`);
    }
}

// الصفحة الرئيسية
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// بدء الخادم
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ الخادم يعمل على المنفذ ${PORT}`);
});
