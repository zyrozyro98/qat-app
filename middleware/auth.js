const logger = require('../config/logger');

const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        logger.warn(`🚫 محاولة وصول غير مصرح بها إلى ${req.path}`);
        return res.status(401).json({ 
            success: false, 
            error: 'يجب تسجيل الدخول للوصول إلى هذا المورد' 
        });
    }
    next();
};

const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.session.userId || !roles.includes(req.session.role)) {
            logger.warn(`🚫 محاولة وصول غير مصرح بها لدور ${req.session.role} إلى ${req.path}`);
            return res.status(403).json({ 
                success: false, 
                error: 'صلاحية مرفوضة. لا تملك الصلاحيات الكافية' 
            });
        }
        next();
    };
};

// متغيرات الصلاحيات المسبقة
const requireAdmin = requireRole('admin');
const requireSeller = requireRole('seller');
const requireBuyer = requireRole('buyer');
const requireDriver = requireRole('driver');
const requireAdminOrSeller = requireRole('admin', 'seller');

module.exports = {
    requireAuth,
    requireRole,
    requireAdmin,
    requireSeller,
    requireBuyer,
    requireDriver,
    requireAdminOrSeller
};
