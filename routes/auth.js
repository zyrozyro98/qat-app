const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const cryptoJS = require('crypto-js');
const moment = require('moment');

// Middleware
const { validateRequest } = require('../middleware/validator');
const { requireAuth, requireRole } = require('../config/middleware');

// Models
const { UserModel, WalletModel } = require('../database/models');
const database = require('../config/database');

// تهيئة الموديلات
const userModel = new UserModel(database);
const walletModel = new WalletModel(database);

// مسار التسجيل
router.post('/register', [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('الاسم مطلوب')
        .isLength({ min: 2, max: 50 })
        .withMessage('الاسم يجب أن يكون بين 2 و 50 حرفاً'),
    
    body('email')
        .trim()
        .isEmail()
        .withMessage('البريد الإلكتروني غير صحيح')
        .normalizeEmail(),
    
    body('phone')
        .trim()
        .matches(/^[0-9]{9,15}$/)
        .withMessage('رقم الهاتف غير صحيح'),
    
    body('password')
        .isLength({ min: 6 })
        .withMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم'),
    
    body('role')
        .isIn(['buyer', 'seller', 'driver'])
        .withMessage('نوع الحساب غير صحيح'),
    
    body('storeName')
        .if(body('role').equals('seller'))
        .trim()
        .notEmpty()
        .withMessage('اسم المتجر مطلوب للبائع'),
    
    body('vehicleType')
        .if(body('role').equals('driver'))
        .trim()
        .notEmpty()
        .withMessage('نوع المركبة مطلوب للسائق')
], validateRequest, async (req, res) => {
    try {
        const { name, email, phone, password, role, storeName, vehicleType } = req.body;
        
        // التحقق من عدم وجود المستخدم مسبقاً
        const existingUser = await userModel.findByEmail(email) || await userModel.findByPhone(phone);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'البريد الإلكتروني أو رقم الهاتف مستخدم بالفعل'
            });
        }
        
        // إنشاء المستخدم
        const userData = {
            name,
            email,
            phone,
            password,
            role,
            status: 'active'
        };
        
        const user = await userModel.create(userData);
        
        // إنشاء محفظة للمستخدم
        await walletModel.create({
            user_id: user.id,
            balance: 0
        });
        
        // إعداد البيانات للاستجابة
        const responseData = {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            createdAt: user.created_at
        };
        
        // إضافة بيانات إضافية بناءً على الدور
        if (role === 'seller' && storeName) {
            // هنا يمكن إضافة منطق لإنشاء سجل بائع
            responseData.storeName = storeName;
        }
        
        if (role === 'driver' && vehicleType) {
            // هنا يمكن إضافة منطق لإنشاء سجل سائق
            responseData.vehicleType = vehicleType;
        }
        
        // إنشاء توكن المصادقة
        const tokenData = {
            userId: user.id,
            email: user.email,
            role: user.role,
            timestamp: Date.now()
        };
        
        const token = cryptoJS.AES.encrypt(
            JSON.stringify(tokenData),
            process.env.ENCRYPTION_KEY || 'default-secret'
        ).toString();
        
        // إعداد الجلسة
        req.session.userId = user.id;
        req.session.role = user.role;
        req.session.userEmail = user.email;
        
        res.status(201).json({
            success: true,
            message: 'تم إنشاء الحساب بنجاح',
            data: responseData,
            token: token
        });
        
    } catch (error) {
        console.error('❌ خطأ في التسجيل:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ أثناء إنشاء الحساب',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// مسار تسجيل الدخول
router.post('/login', [
    body('email')
        .trim()
        .isEmail()
        .withMessage('البريد الإلكتروني غير صحيح')
        .normalizeEmail(),
    
    body('password')
        .notEmpty()
        .withMessage('كلمة المرور مطلوبة')
], validateRequest, async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // البحث عن المستخدم
        const user = await userModel.findByEmail(email);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
            });
        }
        
        // التحقق من حالة الحساب
        if (user.status !== 'active') {
            return res.status(403).json({
                success: false,
                error: 'الحساب غير نشط أو معلق'
            });
        }
        
        // التحقق من كلمة المرور
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
            });
        }
        
        // تحديث آخر وقت دخول
        await userModel.updateLastLogin(user.id);
        
        // إنشاء توكن المصادقة
        const tokenData = {
            userId: user.id,
            email: user.email,
            role: user.role,
            timestamp: Date.now()
        };
        
        const token = cryptoJS.AES.encrypt(
            JSON.stringify(tokenData),
            process.env.ENCRYPTION_KEY || 'default-secret'
        ).toString();
        
        // إعداد الجلسة
        req.session.userId = user.id;
        req.session.role = user.role;
        req.session.userEmail = user.email;
        
        // جلب بيانات المحفظة
        const wallet = await walletModel.findByUser(user.id);
        
        // إعداد بيانات الاستجابة
        const userData = {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            avatar: user.avatar,
            balance: wallet ? wallet.balance : 0,
            lastLogin: user.last_login
        };
        
        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            data: userData,
            token: token
        });
        
    } catch (error) {
        console.error('❌ خطأ في تسجيل الدخول:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ أثناء تسجيل الدخول'
        });
    }
});

// مسار تسجيل الخروج
router.post('/logout', requireAuth, (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('❌ خطأ في تسجيل الخروج:', err);
            return res.status(500).json({
                success: false,
                error: 'خطأ في تسجيل الخروج'
            });
        }
        
        res.clearCookie('qat_pro_session');
        res.json({
            success: true,
            message: 'تم تسجيل الخروج بنجاح'
        });
    });
});

// مسار التحقق من المصادقة
router.get('/check', (req, res) => {
    if (req.session && req.session.userId) {
        userModel.findById(req.session.userId)
            .then(user => {
                if (!user) {
                    return res.json({ isAuthenticated: false });
                }
                
                res.json({
                    isAuthenticated: true,
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        avatar: user.avatar
                    }
                });
            })
            .catch(error => {
                console.error('❌ خطأ في التحقق من المصادقة:', error);
                res.json({ isAuthenticated: false });
            });
    } else {
        res.json({ isAuthenticated: false });
    }
});

// مسار تحديث التوكن
router.post('/refresh-token', requireAuth, async (req, res) => {
    try {
        const user = await userModel.findById(req.session.userId);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'المستخدم غير موجود'
            });
        }
        
        // إنشاء توكن جديد
        const tokenData = {
            userId: user.id,
            email: user.email,
            role: user.role,
            timestamp: Date.now()
        };
        
        const token = cryptoJS.AES.encrypt(
            JSON.stringify(tokenData),
            process.env.ENCRYPTION_KEY || 'default-secret'
        ).toString();
        
        res.json({
            success: true,
            message: 'تم تحديث التوكن بنجاح',
            token: token
        });
        
    } catch (error) {
        console.error('❌ خطأ في تحديث التوكن:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ أثناء تحديث التوكن'
        });
    }
});

// مسار تغيير كلمة المرور
router.post('/change-password', requireAuth, [
    body('currentPassword')
        .notEmpty()
        .withMessage('كلمة المرور الحالية مطلوبة'),
    
    body('newPassword')
        .isLength({ min: 6 })
        .withMessage('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم'),
    
    body('confirmPassword')
        .custom((value, { req }) => value === req.body.newPassword)
        .withMessage('كلمتا المرور غير متطابقتين')
], validateRequest, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.session.userId;
        
        // التحقق من كلمة المرور الحالية
        const validPassword = await userModel.verifyPassword(userId, currentPassword);
        if (!validPassword) {
            return res.status(400).json({
                success: false,
                error: 'كلمة المرور الحالية غير صحيحة'
            });
        }
        
        // تحديث كلمة المرور
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await userModel.update(userId, { password: hashedPassword });
        
        res.json({
            success: true,
            message: 'تم تغيير كلمة المرور بنجاح'
        });
        
    } catch (error) {
        console.error('❌ خطأ في تغيير كلمة المرور:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ أثناء تغيير كلمة المرور'
        });
    }
});

// مسار طلب إعادة تعيين كلمة المرور
router.post('/forgot-password', [
    body('email')
        .trim()
        .isEmail()
        .withMessage('البريد الإلكتروني غير صحيح')
        .normalizeEmail()
], validateRequest, async (req, res) => {
    try {
        const { email } = req.body;
        
        // البحث عن المستخدم
        const user = await userModel.findByEmail(email);
        if (!user) {
            // نعود بنفس الاستجابة للأمان
            return res.json({
                success: true,
                message: 'إذا كان البريد الإلكتروني مسجلاً، ستتلقى رابط إعادة التعيين'
            });
        }
        
        // إنشاء توكن إعادة تعيين
        const resetTokenData = {
            userId: user.id,
            email: user.email,
            expires: Date.now() + 3600000 // ساعة واحدة
        };
        
        const resetToken = cryptoJS.AES.encrypt(
            JSON.stringify(resetTokenData),
            process.env.ENCRYPTION_KEY || 'default-secret'
        ).toString();
        
        // هنا يمكن إرسال البريد الإلكتروني برابط إعادة التعيين
        // await sendResetEmail(user.email, resetToken);
        
        // لأغراض الاختبار، نعيد التوكن في الاستجابة
        if (process.env.NODE_ENV === 'development') {
            return res.json({
                success: true,
                message: 'رابط إعادة التعيين تم إنشاؤه',
                resetToken: resetToken // فقط في بيئة التطوير
            });
        }
        
        res.json({
            success: true,
            message: 'إذا كان البريد الإلكتروني مسجلاً، ستتلقى رابط إعادة التعيين'
        });
        
    } catch (error) {
        console.error('❌ خطأ في طلب إعادة تعيين كلمة المرور:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ أثناء معالجة طلبك'
        });
    }
});

// مسار إعادة تعيين كلمة المرور
router.post('/reset-password', [
    body('token')
        .notEmpty()
        .withMessage('توكن إعادة التعيين مطلوب'),
    
    body('newPassword')
        .isLength({ min: 6 })
        .withMessage('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم'),
    
    body('confirmPassword')
        .custom((value, { req }) => value === req.body.newPassword)
        .withMessage('كلمتا المرور غير متطابقتين')
], validateRequest, async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        // فك تشفير التوكن
        const bytes = cryptoJS.AES.decrypt(token, process.env.ENCRYPTION_KEY || 'default-secret');
        const resetTokenData = JSON.parse(bytes.toString(cryptoJS.enc.Utf8));
        
        // التحقق من صلاحية التوكن
        if (!resetTokenData || Date.now() > resetTokenData.expires) {
            return res.status(400).json({
                success: false,
                error: 'رابط إعادة التعيين غير صالح أو منتهي الصلاحية'
            });
        }
        
        // التحقق من وجود المستخدم
        const user = await userModel.findById(resetTokenData.userId);
        if (!user || user.email !== resetTokenData.email) {
            return res.status(400).json({
                success: false,
                error: 'رابط إعادة التعيين غير صالح'
            });
        }
        
        // تحديث كلمة المرور
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await userModel.update(user.id, { password: hashedPassword });
        
        res.json({
            success: true,
            message: 'تم إعادة تعيين كلمة المرور بنجاح'
        });
        
    } catch (error) {
        console.error('❌ خطأ في إعادة تعيين كلمة المرور:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ أثناء إعادة تعيين كلمة المرور'
        });
    }
});

module.exports = router;
