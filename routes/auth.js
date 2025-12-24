const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

module.exports = (db) => {
    const authController = require('../controllers/authController')(db);
    
    // قواعد التحقق من البيانات
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

    const registerValidations = [
        body('name').trim().notEmpty().withMessage('الاسم مطلوب'),
        body('email').trim().isEmail().withMessage('البريد الإلكتروني غير صحيح'),
        body('phone').trim().matches(/^[0-9]{9,15}$/).withMessage('رقم الهاتف غير صحيح'),
        body('password').isLength({ min: 6 }).withMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
        body('role').isIn(['buyer', 'seller', 'driver']).withMessage('نوع الحساب غير صحيح')
    ];

    const loginValidations = [
        body('email').trim().isEmail().withMessage('البريد الإلكتروني غير صحيح'),
        body('password').notEmpty().withMessage('كلمة المرور مطلوبة')
    ];

    // المسارات
    router.post('/register', registerValidations, validateRequest, authController.register);
    router.post('/login', loginValidations, validateRequest, authController.login);
    router.post('/logout', authController.logout);
    router.get('/check', authController.checkAuth);
    
    return router;
};
