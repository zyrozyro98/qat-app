const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

module.exports = (db) => {
    const userController = require('../controllers/userController')(db);
    
    router.get('/profile', requireAuth, userController.getProfile);
    router.put('/profile', requireAuth, userController.updateProfile);
    
    return router;
};

// Middleware
const { validateRequest } = require('../middleware/validator');
const { requireAuth, requireRole, requireAdmin } = require('../config/middleware');

// Models
const { UserModel, WalletModel } = require('../database/models');
const database = require('../config/database');

// تهيئة الموديلات
const userModel = new UserModel(database);
const walletModel = new WalletModel(database);

// إعدادات تحميل الملفات
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            cb(null, true);
        } else {
            cb(new Error('نوع الصورة غير مدعوم. يرجى رفع صور (JPEG, PNG, GIF, WebP) فقط'));
        }
    }
});

// مسار جلب الملف الشخصي
router.get('/profile', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        
        // جلب بيانات المستخدم
        const user = await userModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'المستخدم غير موجود'
            });
        }
        
        // إزالة الحقول الحساسة
        delete user.password;
        
        // جلب بيانات المحفظة
        const wallet = await walletModel.findByUser(userId);
        
        // جلب بيانات إضافية بناءً على الدور
        let additionalData = {};
        if (user.role === 'seller') {
            // هنا يمكن جلب بيانات البائع
            additionalData.storeName = 'اسم المتجر'; // مؤقت
            additionalData.rating = 4.5;
            additionalData.totalSales = 120;
        } else if (user.role === 'driver') {
            // هنا يمكن جلب بيانات السائق
            additionalData.vehicleType = 'دراجة نارية'; // مؤقت
            additionalData.rating = 4.8;
            additionalData.status = 'available';
        }
        
        res.json({
            success: true,
            data: {
                ...user,
                ...additionalData,
                balance: wallet ? wallet.balance : 0
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب الملف الشخصي:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب الملف الشخصي'
        });
    }
});

// مسار تحديث الملف الشخصي
router.put('/profile', requireAuth, [
    body('name')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('الاسم لا يمكن أن يكون فارغاً')
        .isLength({ min: 2, max: 50 })
        .withMessage('الاسم يجب أن يكون بين 2 و 50 حرفاً'),
    
    body('phone')
        .optional()
        .trim()
        .matches(/^[0-9]{9,15}$/)
        .withMessage('رقم الهاتف غير صحيح')
], validateRequest, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { name, phone } = req.body;
        
        // التحقق من أن رقم الهاتف غير مستخدم
        if (phone) {
            const existingUser = await userModel.findByPhone(phone);
            if (existingUser && existingUser.id !== userId) {
                return res.status(400).json({
                    success: false,
                    error: 'رقم الهاتف مستخدم بالفعل'
                });
            }
        }
        
        // تحديث بيانات المستخدم
        const updateData = {};
        if (name) updateData.name = name;
        if (phone) updateData.phone = phone;
        
        const updatedUser = await userModel.updateProfile(userId, updateData);
        
        // إزالة الحقول الحساسة
        delete updatedUser.password;
        
        res.json({
            success: true,
            message: 'تم تحديث الملف الشخصي بنجاح',
            data: updatedUser
        });
        
    } catch (error) {
        console.error('❌ خطأ في تحديث الملف الشخصي:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في تحديث الملف الشخصي'
        });
    }
});

// مسار تحديث صورة الملف الشخصي
router.post('/profile/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'يرجى اختيار صورة'
            });
        }
        
        const userId = req.session.userId;
        
        // هنا يمكن إضافة منطق لمعالجة الصورة وحفظها
        // مؤقتاً، سنستخدم اسم ملف عشوائي
        
        const filename = `avatar_${userId}_${Date.now()}${path.extname(req.file.originalname)}`;
        const uploadDir = path.join(__dirname, '..', 'uploads', 'avatars');
        
        // إنشاء المجلد إذا لم يكن موجوداً
        await fs.mkdir(uploadDir, { recursive: true });
        
        // حفظ الملف
        const filePath = path.join(uploadDir, filename);
        await fs.writeFile(filePath, req.file.buffer);
        
        // تحديث مسار الصورة في قاعدة البيانات
        const avatarPath = `/uploads/avatars/${filename}`;
        await userModel.update(userId, { avatar: avatarPath });
        
        res.json({
            success: true,
            message: 'تم تحديث صورة الملف الشخصي بنجاح',
            data: {
                avatar: avatarPath
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في تحديث صورة الملف الشخصي:', error);
        
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'حجم الصورة كبير جداً (الحد الأقصى 5MB)'
            });
        }
        
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في تحديث صورة الملف الشخصي'
        });
    }
});

// مسار حذف الحساب
router.delete('/account', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        
        // حذف المستخدم
        await userModel.delete(userId);
        
        // إنهاء الجلسة
        req.session.destroy();
        res.clearCookie('qat_pro_session');
        
        res.json({
            success: true,
            message: 'تم حذف الحساب بنجاح'
        });
        
    } catch (error) {
        console.error('❌ خطأ في حذف الحساب:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في حذف الحساب'
        });
    }
});

// مسار جلب جميع المستخدمين (للمسؤول فقط)
router.get('/', requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, role, status } = req.query;
        const offset = (page - 1) * limit;
        
        // بناء شروط البحث
        const conditions = {};
        if (role) conditions.role = role;
        if (status) conditions.status = status;
        
        // جلب المستخدمين
        const users = await userModel.findAll(conditions, {
            limit: parseInt(limit),
            offset: parseInt(offset),
            orderBy: 'created_at',
            order: 'DESC'
        });
        
        // إزالة كلمات المرور
        const sanitizedUsers = users.map(user => {
            const { password, ...userWithoutPassword } = user;
            return userWithoutPassword;
        });
        
        // جلب العدد الكلي
        const total = await userModel.count(conditions);
        
        res.json({
            success: true,
            data: sanitizedUsers,
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب المستخدمين:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب المستخدمين'
        });
    }
});

// مسار جلب مستخدم معين (للمسؤول فقط)
router.get('/:id', requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        
        const user = await userModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'المستخدم غير موجود'
            });
        }
        
        // إزالة كلمة المرور
        const { password, ...userWithoutPassword } = user;
        
        // جلب بيانات المحفظة
        const wallet = await walletModel.findByUser(userId);
        
        res.json({
            success: true,
            data: {
                ...userWithoutPassword,
                balance: wallet ? wallet.balance : 0
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب بيانات المستخدم:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب بيانات المستخدم'
        });
    }
});

// مسار تحديث حالة المستخدم (للمسؤول فقط)
router.put('/:id/status', requireAdmin, [
    body('status')
        .isIn(['active', 'inactive', 'suspended'])
        .withMessage('حالة غير صحيحة')
], validateRequest, async (req, res) => {
    try {
        const userId = req.params.id;
        const { status } = req.body;
        
        // التحقق من وجود المستخدم
        const user = await userModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'المستخدم غير موجود'
            });
        }
        
        // تحديث الحالة
        const updatedUser = await userModel.update(userId, { status });
        
        // إزالة كلمة المرور
        const { password, ...userWithoutPassword } = updatedUser;
        
        res.json({
            success: true,
            message: 'تم تحديث حالة المستخدم بنجاح',
            data: userWithoutPassword
        });
        
    } catch (error) {
        console.error('❌ خطأ في تحديث حالة المستخدم:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في تحديث حالة المستخدم'
        });
    }
});

// مسار تحديث دور المستخدم (للمسؤول فقط)
router.put('/:id/role', requireAdmin, [
    body('role')
        .isIn(['admin', 'buyer', 'seller', 'driver'])
        .withMessage('دور غير صحيح')
], validateRequest, async (req, res) => {
    try {
        const userId = req.params.id;
        const { role } = req.body;
        
        // التحقق من وجود المستخدم
        const user = await userModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'المستخدم غير موجود'
            });
        }
        
        // تحديث الدور
        const updatedUser = await userModel.update(userId, { role });
        
        // إزالة كلمة المرور
        const { password, ...userWithoutPassword } = updatedUser;
        
        res.json({
            success: true,
            message: 'تم تحديث دور المستخدم بنجاح',
            data: userWithoutPassword
        });
        
    } catch (error) {
        console.error('❌ خطأ في تحديث دور المستخدم:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في تحديث دور المستخدم'
        });
    }
});

// مسار جلب إحصائيات المستخدمين (للمسؤول فقط)
router.get('/stats/overview', requireAdmin, async (req, res) => {
    try {
        const stats = await database.all(`
            SELECT 
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM users WHERE role = 'buyer') as total_buyers,
                (SELECT COUNT(*) FROM users WHERE role = 'seller') as total_sellers,
                (SELECT COUNT(*) FROM users WHERE role = 'driver') as total_drivers,
                (SELECT COUNT(*) FROM users WHERE role = 'admin') as total_admins,
                (SELECT COUNT(*) FROM users WHERE status = 'active') as active_users,
                (SELECT COUNT(*) FROM users WHERE status = 'inactive') as inactive_users,
                (SELECT COUNT(*) FROM users WHERE DATE(created_at) = DATE('now')) as today_registrations,
                (SELECT COUNT(*) FROM users WHERE DATE(created_at) >= DATE('now', '-7 days')) as weekly_registrations
        `);
        
        res.json({
            success: true,
            data: stats[0]
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب إحصائيات المستخدمين:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب إحصائيات المستخدمين'
        });
    }
});

module.exports = router;
