const { validationResult } = require('express-validator');

// Middleware للتحقق من صحة البيانات المدخلة
const validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array().map(error => ({
                field: error.path,
                message: error.msg,
                value: error.value
            })),
            message: 'البيانات المدخلة غير صحيحة'
        });
    }
    
    next();
};

// مدقق للأرقام الصحيحة الموجبة
const validatePositiveInt = (field) => {
    return (value) => {
        if (value && (isNaN(value) || parseInt(value) <= 0)) {
            throw new Error(`${field} يجب أن يكون رقم صحيح موجب`);
        }
        return true;
    };
};

// مدقق للأرقام العشرية الموجبة
const validatePositiveFloat = (field) => {
    return (value) => {
        if (value && (isNaN(value) || parseFloat(value) <= 0)) {
            throw new Error(`${field} يجب أن يكون رقم عشري موجب`);
        }
        return true;
    };
};

// مدقق للتواريخ
const validateDate = (field) => {
    return (value) => {
        if (value) {
            const date = new Date(value);
            if (isNaN(date.getTime())) {
                throw new Error(`${field} غير صحيح`);
            }
        }
        return true;
    };
};

// مدقق للبريد الإلكتروني الفريد
const validateUniqueEmail = async (email, { req }) => {
    const database = require('../config/database');
    
    if (email) {
        const existingUser = await database.get(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );
        
        if (existingUser && existingUser.id !== req.params?.id) {
            throw new Error('البريد الإلكتروني مستخدم بالفعل');
        }
    }
    
    return true;
};

// مدقق لرقم الهاتف الفريد
const validateUniquePhone = async (phone, { req }) => {
    const database = require('../config/database');
    
    if (phone) {
        const existingUser = await database.get(
            'SELECT id FROM users WHERE phone = ?',
            [phone]
        );
        
        if (existingUser && existingUser.id !== req.params?.id) {
            throw new Error('رقم الهاتف مستخدم بالفعل');
        }
    }
    
    return true;
};

// مدقق للرصيد الكافي
const validateSufficientBalance = async (amount, { req }) => {
    const database = require('../config/database');
    
    if (amount && req.session?.userId) {
        const wallet = await database.get(
            'SELECT balance FROM wallets WHERE user_id = ?',
            [req.session.userId]
        );
        
        if (wallet && wallet.balance < parseFloat(amount)) {
            throw new Error('رصيد المحفظة غير كافي');
        }
    }
    
    return true;
};

// مدقق لتوفر المنتج
const validateProductAvailability = async (productId, { req }) => {
    const database = require('../config/database');
    
    if (productId) {
        const product = await database.get(
            'SELECT quantity, status FROM products WHERE id = ?',
            [productId]
        );
        
        if (!product) {
            throw new Error('المنتج غير موجود');
        }
        
        if (product.status !== 'active') {
            throw new Error('المنتج غير متوفر');
        }
        
        // التحقق من الكمية إذا كانت مطلوبة
        const quantity = req.body?.quantity || 1;
        if (product.quantity < quantity) {
            throw new Error('الكمية غير متوفرة');
        }
    }
    
    return true;
};

// مدقق للصورة
const validateImage = (file) => {
    if (file) {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        const maxSize = 10 * 1024 * 1024; // 10MB
        
        if (!allowedTypes.includes(file.mimetype)) {
            throw new Error('نوع الصورة غير مدعوم');
        }
        
        if (file.size > maxSize) {
            throw new Error('حجم الصورة كبير جداً (الحد الأقصى 10MB)');
        }
    }
    
    return true;
};

module.exports = {
    validateRequest,
    validatePositiveInt,
    validatePositiveFloat,
    validateDate,
    validateUniqueEmail,
    validateUniquePhone,
    validateSufficientBalance,
    validateProductAvailability,
    validateImage
};
