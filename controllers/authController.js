const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const logger = require('../config/logger');
const helpers = require('../utils/helpers');
const emailService = require('../config/email');

module.exports = (db) => {
    return {
        async register(req, res) {
            try {
                const errors = validationResult(req);
                if (!errors.isEmpty()) {
                    return res.status(400).json({
                        success: false,
                        errors: errors.array()
                    });
                }

                const { name, email, phone, password, role, storeName, vehicleType, market_id } = req.body;
                
                logger.info(`📝 محاولة تسجيل جديد: ${email}`);
                
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
                    
                    await db.runQuery('COMMIT');
                    
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
                    
                    // إرسال بريد ترحيبي
                    if (emailService.transporter) {
                        try {
                            await emailService.sendEmail(email, 'مرحباً بك في تطبيق قات PRO', 
                                `<div dir="rtl">
                                    <h2>مرحباً بك ${name}!</h2>
                                    <p>تم إنشاء حسابك بنجاح في تطبيق قات PRO</p>
                                </div>`
                            );
                        } catch (emailError) {
                            logger.error(`❌ خطأ في إرسال البريد الترحيبي: ${emailError.message}`);
                        }
                    }
                    
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
                    error: 'حدث خطأ أثناء إنشاء الحساب'
                });
            }
        },
        
        async login(req, res) {
            try {
                const errors = validationResult(req);
                if (!errors.isEmpty()) {
                    return res.status(400).json({
                        success: false,
                        errors: errors.array()
                    });
                }

                const { email, password } = req.body;
                
                logger.info(`🔐 محاولة تسجيل دخول: ${email}`);
                
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
                    error: 'حدث خطأ أثناء تسجيل الدخول'
                });
            }
        },
        
        logout(req, res) {
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
        },
        
        async checkAuth(req, res) {
            if (req.session.userId) {
                try {
                    const user = await db.getQuery(
                        'SELECT id, name, email, phone, role, avatar FROM users WHERE id = ?',
                        [req.session.userId]
                    );
                    
                    if (!user) {
                        return res.json({ isAuthenticated: false });
                    }
                    
                    res.json({ isAuthenticated: true, user });
                } catch (error) {
                    logger.error(`❌ خطأ في التحقق من المصادقة: ${error.message}`);
                    res.json({ isAuthenticated: false });
                }
            } else {
                res.json({ isAuthenticated: false });
            }
        }
    };
};
