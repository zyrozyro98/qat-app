const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { requireAuth } = require('../middleware/auth');
const logger = require('../config/logger');

// إعداد Multer للرفع
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            cb(null, true);
        } else {
            cb(new Error('نوع الملف غير مدعوم. يرجى رفع صور فقط (JPEG, PNG, GIF, WebP)'));
        }
    }
});

module.exports = (db) => {
    // جلب الملف الشخصي
    router.get('/profile', requireAuth, async (req, res) => {
        try {
            const user = await db.getQuery(
                `SELECT u.*, w.balance, 
                        s.store_name, s.rating as seller_rating, s.total_sales,
                        d.vehicle_type, d.rating as driver_rating, d.status as driver_status,
                        d.market_id, m.name as market_name
                 FROM users u
                 LEFT JOIN wallets w ON u.id = w.user_id
                 LEFT JOIN sellers s ON u.id = s.user_id
                 LEFT JOIN drivers d ON u.id = d.user_id
                 LEFT JOIN markets m ON d.market_id = m.id
                 WHERE u.id = ?`,
                [req.session.userId]
            );
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'المستخدم غير موجود'
                });
            }
            
            res.json({
                success: true,
                data: user
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب الملف الشخصي: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // تحديث الملف الشخصي
    router.put('/profile', requireAuth, upload.single('avatar'), async (req, res) => {
        try {
            const { name, phone } = req.body;
            
            let avatarUrl = '';
            if (req.file) {
                // حفظ الصورة
                const uploadsDir = path.join(__dirname, '../../uploads/avatars');
                await fs.mkdir(uploadsDir, { recursive: true });
                
                const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(req.file.originalname)}`;
                const filePath = path.join(uploadsDir, fileName);
                
                await fs.writeFile(filePath, req.file.buffer);
                avatarUrl = `/uploads/avatars/${fileName}`;
                
                // حذف الصورة القديمة إذا كانت موجودة
                const user = await db.getQuery('SELECT avatar FROM users WHERE id = ?', [req.session.userId]);
                if (user.avatar && user.avatar.startsWith('/uploads/')) {
                    try {
                        await fs.unlink(path.join(__dirname, '../..', user.avatar));
                    } catch (error) {
                        logger.warn(`⚠️ خطأ في حذف الصورة القديمة: ${error.message}`);
                    }
                }
            }
            
            const updates = [];
            const params = [];
            
            if (name) {
                updates.push('name = ?');
                params.push(name);
            }
            
            if (phone) {
                // التحقق من عدم تكرار رقم الهاتف
                const existingPhone = await db.getQuery(
                    'SELECT id FROM users WHERE phone = ? AND id != ?',
                    [phone, req.session.userId]
                );
                
                if (existingPhone) {
                    return res.status(400).json({
                        success: false,
                        error: 'رقم الهاتف مستخدم بالفعل'
                    });
                }
                
                updates.push('phone = ?');
                params.push(phone);
            }
            
            if (avatarUrl) {
                updates.push('avatar = ?');
                params.push(avatarUrl);
            }
            
            if (updates.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'لا توجد بيانات للتحديث'
                });
            }
            
            updates.push('updated_at = ?');
            params.push(new Date().toISOString());
            params.push(req.session.userId);
            
            const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
            await db.runQuery(query, params);
            
            res.json({
                success: true,
                message: 'تم تحديث الملف الشخصي بنجاح'
            });
        } catch (error) {
            logger.error(`❌ خطأ في تحديث الملف الشخصي: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // تحديث كلمة المرور
    router.put('/password', requireAuth, async (req, res) => {
        try {
            const { current_password, new_password } = req.body;
            
            if (!current_password || !new_password) {
                return res.status(400).json({
                    success: false,
                    error: 'كلمة المرور الحالية والجديدة مطلوبتان'
                });
            }
            
            if (new_password.length < 6) {
                return res.status(400).json({
                    success: false,
                    error: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل'
                });
            }
            
            // جلب كلمة المرور الحالية
            const user = await db.getQuery(
                'SELECT password FROM users WHERE id = ?',
                [req.session.userId]
            );
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'المستخدم غير موجود'
                });
            }
            
            // التحقق من كلمة المرور الحالية
            const bcrypt = require('bcryptjs');
            const validPassword = await bcrypt.compare(current_password, user.password);
            
            if (!validPassword) {
                return res.status(401).json({
                    success: false,
                    error: 'كلمة المرور الحالية غير صحيحة'
                });
            }
            
            // تشفير كلمة المرور الجديدة
            const hashedPassword = await bcrypt.hash(new_password, 12);
            
            // تحديث كلمة المرور
            await db.runQuery(
                'UPDATE users SET password = ?, updated_at = ? WHERE id = ?',
                [hashedPassword, new Date().toISOString(), req.session.userId]
            );
            
            res.json({
                success: true,
                message: 'تم تحديث كلمة المرور بنجاح'
            });
        } catch (error) {
            logger.error(`❌ خطأ في تحديث كلمة المرور: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // جلب نشاط المستخدم
    router.get('/activity', requireAuth, async (req, res) => {
        try {
            const { page = 1, limit = 10 } = req.query;
            
            // جلب الطلبات الأخيرة
            const orders = await db.allQuery(
                `SELECT o.*, COUNT(oi.id) as item_count
                 FROM orders o
                 LEFT JOIN order_items oi ON o.id = oi.order_id
                 WHERE o.buyer_id = ?
                 GROUP BY o.id
                 ORDER BY o.created_at DESC
                 LIMIT ?`,
                [req.session.userId, parseInt(limit)]
            );
            
            // جلب التقييمات الأخيرة
            const reviews = await db.allQuery(
                `SELECT r.*, p.name as product_name
                 FROM reviews r
                 LEFT JOIN products p ON r.product_id = p.id
                 WHERE r.user_id = ?
                 ORDER BY r.created_at DESC
                 LIMIT 5`,
                [req.session.userId]
            );
            
            // جلب المعاملات الأخيرة
            const transactions = await db.allQuery(
                `SELECT * FROM transactions 
                 WHERE user_id = ?
                 ORDER BY created_at DESC
                 LIMIT 10`,
                [req.session.userId]
            );
            
            res.json({
                success: true,
                data: {
                    orders,
                    reviews,
                    transactions
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب نشاط المستخدم: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // جلب الإحصائيات الشخصية
    router.get('/stats', requireAuth, async (req, res) => {
        try {
            const user = await db.getQuery(
                'SELECT role FROM users WHERE id = ?',
                [req.session.userId]
            );
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'المستخدم غير موجود'
                });
            }
            
            let stats = {};
            
            if (user.role === 'buyer') {
                stats = await db.getQuery(`
                    SELECT 
                        (SELECT COUNT(*) FROM orders WHERE buyer_id = ?) as total_orders,
                        (SELECT COUNT(*) FROM orders WHERE buyer_id = ? AND status = 'delivered') as delivered_orders,
                        (SELECT SUM(total) FROM orders WHERE buyer_id = ? AND status = 'delivered') as total_spent,
                        (SELECT COUNT(*) FROM reviews WHERE user_id = ?) as total_reviews,
                        (SELECT COUNT(*) FROM orders WHERE buyer_id = ? AND status = 'pending') as pending_orders
                `, [req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId]);
            } else if (user.role === 'seller') {
                stats = await db.getQuery(`
                    SELECT 
                        (SELECT COUNT(*) FROM products WHERE seller_id = ?) as total_products,
                        (SELECT COUNT(*) FROM products WHERE seller_id = ? AND status = 'active') as active_products,
                        (SELECT COUNT(DISTINCT o.id) FROM orders o 
                         LEFT JOIN order_items oi ON o.id = oi.order_id 
                         WHERE oi.seller_id = ?) as total_orders,
                        (SELECT COUNT(DISTINCT o.id) FROM orders o 
                         LEFT JOIN order_items oi ON o.id = oi.order_id 
                         WHERE oi.seller_id = ? AND o.status = 'delivered') as delivered_orders,
                        (SELECT SUM(oi.total_price) FROM order_items oi 
                         LEFT JOIN orders o ON oi.order_id = o.id 
                         WHERE oi.seller_id = ? AND o.status = 'delivered') as total_earnings,
                        (SELECT AVG(rating) FROM reviews r 
                         LEFT JOIN products p ON r.product_id = p.id 
                         WHERE p.seller_id = ?) as avg_rating
                `, [req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId]);
            } else if (user.role === 'driver') {
                stats = await db.getQuery(`
                    SELECT 
                        (SELECT COUNT(*) FROM orders WHERE driver_id = ?) as total_deliveries,
                        (SELECT COUNT(*) FROM orders WHERE driver_id = ? AND status = 'delivered') as completed_deliveries,
                        (SELECT COUNT(*) FROM orders WHERE driver_id = ? AND status = 'shipping') as active_deliveries,
                        (SELECT AVG(rating) FROM drivers WHERE user_id = ?) as avg_rating,
                        (SELECT COUNT(*) FROM orders WHERE driver_id = ? AND status = 'cancelled') as cancelled_deliveries
                `, [req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId]);
            }
            
            res.json({
                success: true,
                data: stats || {}
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب إحصائيات المستخدم: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // جلب الإعدادات
    router.get('/settings', requireAuth, async (req, res) => {
        try {
            const user = await db.getQuery(
                'SELECT id, name, email, phone, avatar, role, created_at FROM users WHERE id = ?',
                [req.session.userId]
            );
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'المستخدم غير موجود'
                });
            }
            
            res.json({
                success: true,
                data: user
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب الإعدادات: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // تحديث الإعدادات
    router.put('/settings', requireAuth, async (req, res) => {
        try {
            const { email_notifications, sms_notifications, language, theme } = req.body;
            
            // هنا يمكنك حفظ الإعدادات في قاعدة بيانات منفصلة أو في جدول users
            // للتبسيط، سنخزنها في حقل settings كـ JSON
            const settings = JSON.stringify({
                email_notifications: email_notifications !== undefined ? email_notifications : true,
                sms_notifications: sms_notifications !== undefined ? sms_notifications : true,
                language: language || 'ar',
                theme: theme || 'light'
            });
            
            await db.runQuery(
                'UPDATE users SET settings = ?, updated_at = ? WHERE id = ?',
                [settings, new Date().toISOString(), req.session.userId]
            );
            
            res.json({
                success: true,
                message: 'تم تحديث الإعدادات بنجاح'
            });
        } catch (error) {
            logger.error(`❌ خطأ في تحديث الإعدادات: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // جلب المحفظة (يوجد ملف wallet.js منفصل)
    router.get('/wallet', requireAuth, async (req, res) => {
        try {
            const wallet = await db.getQuery(
                'SELECT * FROM wallets WHERE user_id = ?',
                [req.session.userId]
            );
            
            if (!wallet) {
                // إنشاء محفظة إذا لم تكن موجودة
                const result = await db.runQuery(
                    'INSERT INTO wallets (user_id, balance, created_at) VALUES (?, 0, ?)',
                    [req.session.userId, new Date().toISOString()]
                );
                
                res.json({
                    success: true,
                    data: {
                        id: result.lastID,
                        user_id: req.session.userId,
                        balance: 0,
                        created_at: new Date().toISOString()
                    }
                });
            } else {
                res.json({
                    success: true,
                    data: wallet
                });
            }
        } catch (error) {
            logger.error(`❌ خطأ في جلب المحفظة: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    return router;
};
