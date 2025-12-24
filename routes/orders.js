const express = require('express');
const router = express.Router();
const { requireAuth, requireBuyer, requireSeller } = require('../middleware/auth');
const logger = require('../config/logger');
const helpers = require('../utils/helpers');
const emailService = require('../config/email');

module.exports = (db) => {
    // جلب طلبات المستخدم
    router.get('/', requireAuth, async (req, res) => {
        try {
            const { status, page = 1, limit = 10 } = req.query;
            
            let query = `
                SELECT o.*, 
                       u.name as buyer_name,
                       d.user_id as driver_user_id,
                       du.name as driver_name,
                       COUNT(oi.id) as item_count
                FROM orders o
                LEFT JOIN users u ON o.buyer_id = u.id
                LEFT JOIN drivers d ON o.driver_id = d.id
                LEFT JOIN users du ON d.user_id = du.id
                LEFT JOIN order_items oi ON o.id = oi.order_id
                WHERE o.buyer_id = ?
            `;
            
            const params = [req.session.userId];
            
            if (status) {
                query += ' AND o.status = ?';
                params.push(status);
            }
            
            query += ' GROUP BY o.id ORDER BY o.created_at DESC';
            
            const offset = (page - 1) * limit;
            query += ' LIMIT ? OFFSET ?';
            params.push(parseInt(limit), offset);
            
            const orders = await db.allQuery(query, params);
            
            // جلب العناصر لكل طلب
            for (const order of orders) {
                const items = await db.allQuery(
                    `SELECT oi.*, p.name as product_name, p.image as product_image,
                            pu.name as seller_name, s.store_name
                     FROM order_items oi
                     LEFT JOIN products p ON oi.product_id = p.id
                     LEFT JOIN users pu ON oi.seller_id = pu.id
                     LEFT JOIN sellers s ON oi.seller_id = s.user_id
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
                    limit: parseInt(limit),
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب الطلبات: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // إنشاء طلب جديد
    router.post('/', requireAuth, requireBuyer, async (req, res) => {
        try {
            const { items, shipping_address, payment_method, wash_qat = 0 } = req.body;
            
            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'يجب اختيار منتجات للطلب'
                });
            }
            
            if (!shipping_address) {
                return res.status(400).json({
                    success: false,
                    error: 'عنوان التوصيل مطلوب'
                });
            }
            
            await db.runQuery('BEGIN TRANSACTION');
            
            try {
                let total = 0;
                const orderItems = [];
                
                for (const item of items) {
                    const product = await db.getQuery(
                        'SELECT id, seller_id, price, quantity, name, market_id FROM products WHERE id = ? AND status = "active"',
                        [item.product_id]
                    );
                    
                    if (!product) {
                        throw new Error(`المنتج غير موجود: ${item.product_id}`);
                    }
                    
                    if (product.quantity < item.quantity) {
                        throw new Error(`الكمية غير متوفرة للمنتج: ${product.name}`);
                    }
                    
                    const itemTotal = product.price * item.quantity;
                    total += itemTotal;
                    
                    orderItems.push({
                        product_id: product.id,
                        seller_id: product.seller_id,
                        market_id: product.market_id,
                        quantity: item.quantity,
                        unit_price: product.price,
                        total_price: itemTotal
                    });
                    
                    // تحديث كمية المنتج
                    await db.runQuery(
                        'UPDATE products SET quantity = quantity - ? WHERE id = ?',
                        [item.quantity, product.id]
                    );
                }
                
                // إضافة تكلفة الغسيل إذا وجدت
                if (wash_qat > 0) {
                    total += wash_qat * 500; // سعر افتراضي للغسيل
                }
                
                // التحقق من رصيد المحفظة إذا كان الدفع بالمحفظة
                if (payment_method === 'wallet') {
                    const wallet = await db.getQuery(
                        'SELECT balance FROM wallets WHERE user_id = ?',
                        [req.session.userId]
                    );
                    
                    if (!wallet || wallet.balance < total) {
                        throw new Error('رصيد المحفظة غير كافي');
                    }
                }
                
                // إنشاء كود الطلب
                const orderCode = helpers.generateOrderCode();
                
                // إنشاء الطلب
                const orderResult = await db.runQuery(
                    `INSERT INTO orders (buyer_id, total, shipping_address, payment_method, wash_qat, order_code, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [req.session.userId, total, shipping_address, payment_method, wash_qat, orderCode, new Date().toISOString()]
                );
                
                const orderId = orderResult.lastID;
                
                // إضافة عناصر الطلب
                for (const item of orderItems) {
                    await db.runQuery(
                        `INSERT INTO order_items (order_id, product_id, seller_id, quantity, unit_price, total_price)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [orderId, item.product_id, item.seller_id, item.quantity, item.unit_price, item.total_price]
                    );
                }
                
                // خصم المبلغ من المحفظة إذا كان الدفع بالمحفظة
                if (payment_method === 'wallet') {
                    await db.runQuery(
                        'UPDATE wallets SET balance = balance - ? WHERE user_id = ?',
                        [total, req.session.userId]
                    );
                    
                    // تسجيل المعاملة
                    await db.runQuery(
                        `INSERT INTO transactions (user_id, amount, type, method, status, created_at)
                         VALUES (?, ?, 'purchase', 'wallet', 'completed', ?)`,
                        [req.session.userId, total, new Date().toISOString()]
                    );
                }
                
                // إنشاء إشعار للمشتري
                await db.runQuery(
                    `INSERT INTO notifications (user_id, title, message, type, created_at)
                     VALUES (?, ?, ?, 'success', ?)`,
                    [req.session.userId, 'طلب جديد', `تم إنشاء طلبك #${orderCode} بنجاح`, new Date().toISOString()]
                );
                
                // إشعار البائعين
                const sellerIds = [...new Set(orderItems.map(item => item.seller_id))];
                for (const sellerId of sellerIds) {
                    await db.runQuery(
                        `INSERT INTO notifications (user_id, title, message, type, created_at)
                         VALUES (?, ?, ?, 'info', ?)`,
                        [sellerId, 'طلب جديد', `لديك طلب جديد #${orderCode}`, new Date().toISOString()]
                    );
                }
                
                // إرسال بريد تأكيد الطلب
                try {
                    const buyer = await db.getQuery('SELECT name, email FROM users WHERE id = ?', [req.session.userId]);
                    if (buyer && emailService.transporter) {
                        await emailService.sendEmail(
                            buyer.email,
                            `تأكيد طلبك #${orderCode}`,
                            `<div dir="rtl">
                                <h2>مرحباً ${buyer.name}!</h2>
                                <p>تم استلام طلبك بنجاح. رقم الطلب: ${orderCode}</p>
                                <p>المبلغ الإجمالي: ${helpers.formatCurrency(total)}</p>
                                <p>سيتم تحديثك على حالة الطلب.</p>
                            </div>`
                        );
                    }
                } catch (emailError) {
                    logger.error(`❌ خطأ في إرسال بريد التأكيد: ${emailError.message}`);
                }
                
                await db.runQuery('COMMIT');
                
                res.json({
                    success: true,
                    message: 'تم إنشاء الطلب بنجاح',
                    data: {
                        id: orderId,
                        order_code: orderCode,
                        total: total,
                        status: 'pending'
                    }
                });
                
            } catch (error) {
                await db.runQuery('ROLLBACK');
                throw error;
            }
            
        } catch (error) {
            logger.error(`❌ خطأ في إنشاء الطلب: ${error.message}`);
            res.status(500).json({
                success: false,
                error: 'حدث خطأ أثناء إنشاء الطلب',
                details: error.message
            });
        }
    });
    
    // جلب تفاصيل طلب معين
    router.get('/:id', requireAuth, async (req, res) => {
        try {
            const order = await db.getQuery(
                `SELECT o.*, 
                        u.name as buyer_name, u.phone as buyer_phone,
                        d.user_id as driver_user_id, du.name as driver_name, du.phone as driver_phone
                 FROM orders o
                 LEFT JOIN users u ON o.buyer_id = u.id
                 LEFT JOIN drivers d ON o.driver_id = d.id
                 LEFT JOIN users du ON d.user_id = du.id
                 WHERE o.id = ? AND (o.buyer_id = ? OR ? IN (SELECT seller_id FROM order_items WHERE order_id = o.id))`,
                [req.params.id, req.session.userId, req.session.userId]
            );
            
            if (!order) {
                return res.status(404).json({
                    success: false,
                    error: 'الطلب غير موجود أو ليس لديك صلاحية للوصول إليه'
                });
            }
            
            // جلب عناصر الطلب
            const items = await db.allQuery(
                `SELECT oi.*, p.name as product_name, p.image as product_image,
                        pu.name as seller_name, s.store_name
                 FROM order_items oi
                 LEFT JOIN products p ON oi.product_id = p.id
                 LEFT JOIN users pu ON oi.seller_id = pu.id
                 LEFT JOIN sellers s ON oi.seller_id = s.user_id
                 WHERE oi.order_id = ?`,
                [req.params.id]
            );
            
            // جلب سجل تحديثات الطلب
            const updates = await db.allQuery(
                `SELECT * FROM notifications 
                 WHERE user_id = ? 
                 AND message LIKE '%${order.order_code}%'
                 ORDER BY created_at DESC`,
                [req.session.userId]
            );
            
            res.json({
                success: true,
                data: {
                    ...order,
                    items,
                    updates
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب تفاصيل الطلب: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // إلغاء الطلب (المشتري فقط)
    router.post('/:id/cancel', requireAuth, requireBuyer, async (req, res) => {
        try {
            const order = await db.getQuery(
                'SELECT * FROM orders WHERE id = ? AND buyer_id = ? AND status IN ("pending", "paid")',
                [req.params.id, req.session.userId]
            );
            
            if (!order) {
                return res.status(404).json({
                    success: false,
                    error: 'لا يمكن إلغاء هذا الطلب'
                });
            }
            
            await db.runQuery('BEGIN TRANSACTION');
            
            try {
                // تحديث حالة الطلب
                await db.runQuery(
                    'UPDATE orders SET status = "cancelled", updated_at = ? WHERE id = ?',
                    [new Date().toISOString(), req.params.id]
                );
                
                // إرجاع الكميات إلى المخزون
                const items = await db.allQuery(
                    'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
                    [req.params.id]
                );
                
                for (const item of items) {
                    await db.runQuery(
                        'UPDATE products SET quantity = quantity + ? WHERE id = ?',
                        [item.quantity, item.product_id]
                    );
                }
                
                // إرجاع المبلغ إلى المحفظة إذا كان الدفع بالمحفظة
                if (order.payment_method === 'wallet') {
                    await db.runQuery(
                        'UPDATE wallets SET balance = balance + ? WHERE user_id = ?',
                        [order.total, req.session.userId]
                    );
                    
                    // تسجيل معاملة الاسترداد
                    await db.runQuery(
                        `INSERT INTO transactions (user_id, amount, type, method, status, created_at)
                         VALUES (?, ?, 'refund', 'wallet', 'completed', ?)`,
                        [req.session.userId, order.total, new Date().toISOString()]
                    );
                }
                
                // إشعار المشتري
                await db.runQuery(
                    `INSERT INTO notifications (user_id, title, message, type, created_at)
                     VALUES (?, ?, ?, 'warning', ?)`,
                    [req.session.userId, 'تم إلغاء الطلب', `تم إلغاء طلبك #${order.order_code}`, new Date().toISOString()]
                );
                
                await db.runQuery('COMMIT');
                
                res.json({
                    success: true,
                    message: 'تم إلغاء الطلب بنجاح'
                });
                
            } catch (error) {
                await db.runQuery('ROLLBACK');
                throw error;
            }
            
        } catch (error) {
            logger.error(`❌ خطأ في إلغاء الطلب: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // جلب طلبات البائع
    router.get('/seller/orders', requireAuth, requireSeller, async (req, res) => {
        try {
            const { status, page = 1, limit = 10 } = req.query;
            
            let query = `
                SELECT DISTINCT o.*, 
                       u.name as buyer_name, u.phone as buyer_phone,
                       COUNT(oi.id) as item_count
                FROM orders o
                LEFT JOIN users u ON o.buyer_id = u.id
                LEFT JOIN order_items oi ON o.id = oi.order_id
                WHERE oi.seller_id = ?
            `;
            
            const params = [req.session.userId];
            
            if (status) {
                query += ' AND o.status = ?';
                params.push(status);
            }
            
            query += ' GROUP BY o.id ORDER BY o.created_at DESC';
            
            const offset = (page - 1) * limit;
            query += ' LIMIT ? OFFSET ?';
            params.push(parseInt(limit), offset);
            
            const orders = await db.allQuery(query, params);
            
            // جلب العناصر الخاصة بالبائع لكل طلب
            for (const order of orders) {
                const items = await db.allQuery(
                    `SELECT oi.*, p.name as product_name, p.image as product_image
                     FROM order_items oi
                     LEFT JOIN products p ON oi.product_id = p.id
                     WHERE oi.order_id = ? AND oi.seller_id = ?`,
                    [order.id, req.session.userId]
                );
                order.items = items;
            }
            
            res.json({
                success: true,
                data: orders,
                meta: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب طلبات البائع: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // تحديث حالة طلب (للبائع)
    router.put('/:id/status', requireAuth, requireSeller, async (req, res) => {
        try {
            const { status } = req.body;
            
            const validStatuses = ['preparing', 'ready_for_delivery'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    error: 'حالة غير صالحة'
                });
            }
            
            // التحقق من أن الطلب يحتوي على منتجات هذا البائع
            const orderExists = await db.getQuery(
                'SELECT 1 FROM order_items WHERE order_id = ? AND seller_id = ? LIMIT 1',
                [req.params.id, req.session.userId]
            );
            
            if (!orderExists) {
                return res.status(403).json({
                    success: false,
                    error: 'ليس لديك صلاحية لتحديث حالة هذا الطلب'
                });
            }
            
            // يمكن للبائع تحديث حالة الطلب إذا كانت لا تزال pending أو paid
            await db.runQuery(
                'UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status IN ("pending", "paid")',
                [status, new Date().toISOString(), req.params.id]
            );
            
            res.json({
                success: true,
                message: 'تم تحديث حالة الطلب بنجاح'
            });
        } catch (error) {
            logger.error(`❌ خطأ في تحديث حالة الطلب: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    return router;
};
