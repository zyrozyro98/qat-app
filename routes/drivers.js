const express = require('express');
const router = express.Router();
const { requireAuth, requireDriver, requireAdmin } = require('../middleware/auth');
const logger = require('../config/logger');
const helpers = require('../utils/helpers');

module.exports = (db) => {
    // جلب جميع السائقين
    router.get('/', async (req, res) => {
        try {
            const { status, market_id, available_only = 'true', page = 1, limit = 20 } = req.query;
            
            let query = `
                SELECT d.*, 
                       u.name, u.phone, u.avatar, u.email,
                       m.name as market_name,
                       (SELECT COUNT(*) FROM orders WHERE driver_id = d.id AND status = 'delivered') as completed_deliveries,
                       (SELECT AVG(rating) FROM orders WHERE driver_id = d.id) as delivery_rating
                FROM drivers d
                LEFT JOIN users u ON d.user_id = u.id
                LEFT JOIN markets m ON d.market_id = m.id
                WHERE u.status = 'active'
            `;
            
            const params = [];
            
            if (status) {
                query += ' AND d.status = ?';
                params.push(status);
            }
            
            if (market_id) {
                query += ' AND d.market_id = ?';
                params.push(market_id);
            }
            
            if (available_only === 'true') {
                query += ' AND d.status = "available"';
            }
            
            // حساب العدد الإجمالي
            const countQuery = `SELECT COUNT(*) as total ${query.substring(query.indexOf('FROM'))}`;
            const countResult = await db.getQuery(countQuery, params);
            const total = countResult ? countResult.total : 0;
            
            query += ' ORDER BY d.rating DESC, d.created_at DESC';
            
            const offset = (page - 1) * limit;
            query += ' LIMIT ? OFFSET ?';
            params.push(parseInt(limit), offset);
            
            const drivers = await db.allQuery(query, params);
            
            res.json({
                success: true,
                data: drivers,
                meta: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب السائقين: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // جلب سائق معين
    router.get('/:id', async (req, res) => {
        try {
            const driver = await db.getQuery(
                `SELECT d.*, 
                        u.name, u.phone, u.avatar, u.email, u.created_at as joined_date,
                        m.name as market_name, m.location as market_location
                 FROM drivers d
                 LEFT JOIN users u ON d.user_id = u.id
                 LEFT JOIN markets m ON d.market_id = m.id
                 WHERE d.id = ? AND u.status = 'active'`,
                [req.params.id]
            );
            
            if (!driver) {
                return res.status(404).json({
                    success: false,
                    error: 'السائق غير موجود'
                });
            }
            
            // جلب إحصائيات التسليم
            const stats = await db.getQuery(`
                SELECT 
                    COUNT(*) as total_deliveries,
                    SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as completed_deliveries,
                    SUM(CASE WHEN status = 'shipping' THEN 1 ELSE 0 END) as active_deliveries,
                    AVG(CASE WHEN status = 'delivered' THEN total ELSE NULL END) as avg_order_value,
                    MIN(created_at) as first_delivery,
                    MAX(created_at) as last_delivery
                FROM orders 
                WHERE driver_id = ?
            `, [req.params.id]);
            
            // جلب آخر 10 تسليمات
            const recentDeliveries = await db.allQuery(
                `SELECT o.*, u.name as customer_name, u.phone as customer_phone
                 FROM orders o
                 LEFT JOIN users u ON o.buyer_id = u.id
                 WHERE o.driver_id = ?
                 ORDER BY o.created_at DESC
                 LIMIT 10`,
                [req.params.id]
            );
            
            // جلب التقييمات
            const reviews = await db.allQuery(
                `SELECT r.*, u.name as customer_name, p.name as product_name
                 FROM reviews r
                 LEFT JOIN users u ON r.user_id = u.id
                 LEFT JOIN products p ON r.product_id = p.id
                 LEFT JOIN order_items oi ON r.product_id = oi.product_id
                 LEFT JOIN orders o ON oi.order_id = o.id
                 WHERE o.driver_id = ?
                 ORDER BY r.created_at DESC
                 LIMIT 10`,
                [req.params.id]
            );
            
            res.json({
                success: true,
                data: {
                    ...driver,
                    stats: stats || {},
                    recentDeliveries,
                    reviews
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب تفاصيل السائق: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // تحديث حالة السائق (للسائق نفسه)
    router.put('/status', requireAuth, requireDriver, async (req, res) => {
        try {
            const { status, current_location } = req.body;
            
            const validStatuses = ['available', 'busy', 'offline'];
            if (!status || !validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    error: 'حالة غير صالحة'
                });
            }
            
            await db.runQuery(
                'UPDATE drivers SET status = ?, current_location = ? WHERE user_id = ?',
                [status, current_location || null, req.session.userId]
            );
            
            res.json({
                success: true,
                message: `تم تحديث حالتك إلى ${status}`
            });
        } catch (error) {
            logger.error(`❌ خطأ في تحديث حالة السائق: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // جلب طلبات السائق
    router.get('/orders', requireAuth, requireDriver, async (req, res) => {
        try {
            const { status, page = 1, limit = 10 } = req.query;
            
            // الحصول على ID السائق
            const driver = await db.getQuery(
                'SELECT id FROM drivers WHERE user_id = ?',
                [req.session.userId]
            );
            
            if (!driver) {
                return res.status(404).json({
                    success: false,
                    error: 'لم يتم العثور على بيانات السائق'
                });
            }
            
            let query = `
                SELECT o.*, 
                       u.name as customer_name, u.phone as customer_phone,
                       u.avatar as customer_avatar,
                       COUNT(oi.id) as item_count,
                       SUM(oi.quantity) as total_items
                FROM orders o
                LEFT JOIN users u ON o.buyer_id = u.id
                LEFT JOIN order_items oi ON o.id = oi.order_id
                WHERE o.driver_id = ?
            `;
            
            const params = [driver.id];
            
            if (status) {
                query += ' AND o.status = ?';
                params.push(status);
            }
            
            query += ' GROUP BY o.id ORDER BY o.created_at DESC';
            
            const offset = (page - 1) * limit;
            query += ' LIMIT ? OFFSET ?';
            params.push(parseInt(limit), offset);
            
            const orders = await db.allQuery(query, params);
            
            // جلب تفاصيل العناصر لكل طلب
            for (const order of orders) {
                const items = await db.allQuery(
                    `SELECT oi.*, p.name as product_name, p.image as product_image
                     FROM order_items oi
                     LEFT JOIN products p ON oi.product_id = p.id
                     WHERE oi.order_id = ?`,
                    [order.id]
                );
                order.items = items;
            }
            
            res.json({
                success: true,
                data: orders,
                meta: {
                    page: parseInt(page),
                    limit: parseInt(limit)
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب طلبات السائق: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // تحديث حالة التسليم
    router.put('/orders/:id/delivery-status', requireAuth, requireDriver, async (req, res) => {
        try {
            const { status } = req.body;
            
            const validStatuses = ['shipping', 'delivered'];
            if (!status || !validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    error: 'حالة التسليم غير صالحة'
                });
            }
            
            // الحصول على ID السائق
            const driver = await db.getQuery(
                'SELECT id FROM drivers WHERE user_id = ?',
                [req.session.userId]
            );
            
            if (!driver) {
                return res.status(404).json({
                    success: false,
                    error: 'لم يتم العثور على بيانات السائق'
                });
            }
            
            // التحقق من أن الطلب مخصص لهذا السائق
            const order = await db.getQuery(
                'SELECT * FROM orders WHERE id = ? AND driver_id = ?',
                [req.params.id, driver.id]
            );
            
            if (!order) {
                return res.status(404).json({
                    success: false,
                    error: 'الطلب غير موجود أو ليس مخصصاً لك'
                });
            }
            
            // التحقق من أن حالة الطلب الحالية تسمح بالتحديث
            if (order.status === 'cancelled') {
                return res.status(400).json({
                    success: false,
                    error: 'لا يمكن تحديث حالة طلب ملغى'
                });
            }
            
            if (status === 'delivered' && order.status !== 'shipping') {
                return res.status(400).json({
                    success: false,
                    error: 'يجب أن تكون حالة الطلب shipping قبل تحديثها إلى delivered'
                });
            }
            
            await db.runQuery('BEGIN TRANSACTION');
            
            try {
                // تحديث حالة الطلب
                await db.runQuery(
                    'UPDATE orders SET status = ?, updated_at = ? WHERE id = ?',
                    [status, new Date().toISOString(), req.params.id]
                );
                
                if (status === 'delivered') {
                    // تحديث حالة السائق إلى available
                    await db.runQuery(
                        'UPDATE drivers SET status = "available" WHERE id = ?',
                        [driver.id]
                    );
                    
                    // إنشاء إشعار للمشتري
                    await db.runQuery(
                        `INSERT INTO notifications (user_id, title, message, type, created_at)
                         VALUES (?, ?, ?, 'success', ?)`,
                        [order.buyer_id, 'تم التسليم', `تم تسليم طلبك #${order.order_code}`, new Date().toISOString()]
                    );
                    
                    // إنشاء إشعار للبائعين
                    const sellers = await db.allQuery(
                        'SELECT DISTINCT seller_id FROM order_items WHERE order_id = ?',
                        [order.id]
                    );
                    
                    for (const seller of sellers) {
                        await db.runQuery(
                            `INSERT INTO notifications (user_id, title, message, type, created_at)
                             VALUES (?, ?, ?, 'success', ?)`,
                            [seller.seller_id, 'تم التسليم', `تم تسليم طلب #${order.order_code}`, new Date().toISOString()]
                        );
                    }
                }
                
                await db.runQuery('COMMIT');
                
                res.json({
                    success: true,
                    message: `تم تحديث حالة التسليم إلى ${status}`
                });
                
            } catch (error) {
                await db.runQuery('ROLLBACK');
                throw error;
            }
            
        } catch (error) {
            logger.error(`❌ خطأ في تحديث حالة التسليم: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // جلب إحصائيات السائق
    router.get('/stats', requireAuth, requireDriver, async (req, res) => {
        try {
            // الحصول على ID السائق
            const driver = await db.getQuery(
                'SELECT id FROM drivers WHERE user_id = ?',
                [req.session.userId]
            );
            
            if (!driver) {
                return res.status(404).json({
                    success: false,
                    error: 'لم يتم العثور على بيانات السائق'
                });
            }
            
            const stats = await db.getQuery(`
                SELECT 
                    (SELECT COUNT(*) FROM orders WHERE driver_id = ?) as total_orders,
                    (SELECT COUNT(*) FROM orders WHERE driver_id = ? AND status = 'delivered') as completed_orders,
                    (SELECT COUNT(*) FROM orders WHERE driver_id = ? AND status = 'shipping') as active_orders,
                    (SELECT SUM(total) FROM orders WHERE driver_id = ? AND status = 'delivered') as total_earnings,
                    (SELECT AVG(total) FROM orders WHERE driver_id = ? AND status = 'delivered') as avg_order_value,
                    (SELECT COUNT(*) FROM orders WHERE driver_id = ? AND DATE(created_at) = DATE('now')) as today_orders,
                    (SELECT SUM(total) FROM orders WHERE driver_id = ? AND DATE(created_at) = DATE('now')) as today_earnings
            `, [driver.id, driver.id, driver.id, driver.id, driver.id, driver.id, driver.id]);
            
            // جلب طلبات اليوم
            const todayOrders = await db.allQuery(
                `SELECT o.*, u.name as customer_name
                 FROM orders o
                 LEFT JOIN users u ON o.buyer_id = u.id
                 WHERE o.driver_id = ? AND DATE(o.created_at) = DATE('now')
                 ORDER BY o.created_at DESC`,
                [driver.id]
            );
            
            // جلب التقييم
            const driverInfo = await db.getQuery(
                'SELECT rating, vehicle_type, status FROM drivers WHERE id = ?',
                [driver.id]
            );
            
            res.json({
                success: true,
                data: {
                    ...stats,
                    ...driverInfo,
                    todayOrders
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب إحصائيات السائق: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // تحديث موقع السائق
    router.put('/location', requireAuth, requireDriver, async (req, res) => {
        try {
            const { latitude, longitude } = req.body;
            
            if (!latitude || !longitude) {
                return res.status(400).json({
                    success: false,
                    error: 'إحداثيات الموقع مطلوبة'
                });
            }
            
            const location = `${latitude},${longitude}`;
            
            await db.runQuery(
                'UPDATE drivers SET current_location = ? WHERE user_id = ?',
                [location, req.session.userId]
            );
            
            res.json({
                success: true,
                message: 'تم تحديث الموقع بنجاح'
            });
        } catch (error) {
            logger.error(`❌ خطأ في تحديث موقع السائق: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // تقييم السائق
    router.post('/:id/rate', requireAuth, async (req, res) => {
        try {
            const { rating, comment } = req.body;
            
            if (!rating || rating < 1 || rating > 5) {
                return res.status(400).json({
                    success: false,
                    error: 'التقييم يجب أن يكون بين 1 و 5'
                });
            }
            
            // التحقق من أن المستخدم قد استخدم خدمات هذا السائق
            const hasOrders = await db.getQuery(
                `SELECT 1 FROM orders 
                 WHERE driver_id = ? 
                 AND buyer_id = ? 
                 AND status = 'delivered'
                 LIMIT 1`,
                [req.params.id, req.session.userId]
            );
            
            if (!hasOrders) {
                return res.status(403).json({
                    success: false,
                    error: 'يجب أن يكون لديك طلب مسلم من هذا السائق لتتمكن من تقييمه'
                });
            }
            
            // التحقق من عدم إضافة تقييم مسبق
            const existingRating = await db.getQuery(
                `SELECT 1 FROM orders 
                 WHERE driver_id = ? 
                 AND buyer_id = ? 
                 AND driver_rating IS NOT NULL
                 LIMIT 1`,
                [req.params.id, req.session.userId]
            );
            
            if (existingRating) {
                return res.status(400).json({
                    success: false,
                    error: 'لقد قمت بتقييم هذا السائق مسبقاً'
                });
            }
            
            // تحديث تقييم السائق في أحد الطلبات
            const order = await db.getQuery(
                `SELECT id FROM orders 
                 WHERE driver_id = ? 
                 AND buyer_id = ? 
                 AND status = 'delivered'
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [req.params.id, req.session.userId]
            );
            
            if (order) {
                await db.runQuery(
                    'UPDATE orders SET driver_rating = ?, driver_comment = ? WHERE id = ?',
                    [rating, comment || '', order.id]
                );
                
                // تحديث معدل تقييم السائق
                await db.runQuery(`
                    UPDATE drivers 
                    SET rating = (
                        SELECT AVG(driver_rating) 
                        FROM orders 
                        WHERE driver_id = ? 
                        AND driver_rating IS NOT NULL
                    )
                    WHERE id = ?
                `, [req.params.id, req.params.id]);
                
                res.json({
                    success: true,
                    message: 'تم إضافة التقييم بنجاح'
                });
            } else {
                res.status(404).json({
                    success: false,
                    error: 'لم يتم العثور على طلب للتقييم'
                });
            }
        } catch (error) {
            logger.error(`❌ خطأ في تقييم السائق: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // إدارة السائقين (للمسؤول فقط)
    router.put('/:id/manage', requireAuth, requireAdmin, async (req, res) => {
        try {
            const { status, market_id, vehicle_type } = req.body;
            
            const validStatuses = ['available', 'busy', 'offline', 'suspended'];
            if (status && !validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    error: 'حالة غير صالحة'
                });
            }
            
            const updates = [];
            const params = [];
            
            if (status) {
                updates.push('status = ?');
                params.push(status);
            }
            
            if (market_id) {
                updates.push('market_id = ?');
                params.push(market_id);
            }
            
            if (vehicle_type) {
                updates.push('vehicle_type = ?');
                params.push(vehicle_type);
            }
            
            if (updates.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'لا توجد بيانات للتحديث'
                });
            }
            
            params.push(req.params.id);
            
            const query = `UPDATE drivers SET ${updates.join(', ')} WHERE id = ?`;
            await db.runQuery(query, params);
            
            res.json({
                success: true,
                message: 'تم تحديث بيانات السائق بنجاح'
            });
        } catch (error) {
            logger.error(`❌ خطأ في تحديث بيانات السائق: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    return router;
};
