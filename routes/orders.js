const express = require('express');
const router = express.Router();
const { requireAuth, requireBuyer } = require('../middleware/auth');
const logger = require('../config/logger');
const helpers = require('../utils/helpers');

module.exports = (db) => {
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
                    limit: parseInt(limit),
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب الطلبات: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
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
                        'SELECT id, seller_id, price, quantity, name FROM products WHERE id = ? AND status = "active"',
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
                        quantity: item.quantity,
                        unit_price: product.price,
                        total_price: itemTotal
                    });
                    
                    await db.runQuery(
                        'UPDATE products SET quantity = quantity - ? WHERE id = ?',
                        [item.quantity, product.id]
                    );
                }
                
                if (wash_qat > 0) {
                    total += wash_qat * 500;
                }
                
                if (payment_method === 'wallet') {
                    const wallet = await db.getQuery(
                        'SELECT balance FROM wallets WHERE user_id = ?',
                        [req.session.userId]
                    );
                    
                    if (!wallet || wallet.balance < total) {
                        throw new Error('رصيد المحفظة غير كافي');
                    }
                }
                
                const orderCode = helpers.generateOrderCode();
                const orderResult = await db.runQuery(
                    `INSERT INTO orders (buyer_id, total, shipping_address, payment_method, wash_qat, order_code, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [req.session.userId, total, shipping_address, payment_method, wash_qat, orderCode, new Date().toISOString()]
                );
                
                const orderId = orderResult.lastID;
                
                for (const item of orderItems) {
                    await db.runQuery(
                        `INSERT INTO order_items (order_id, product_id, seller_id, quantity, unit_price, total_price)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [orderId, item.product_id, item.seller_id, item.quantity, item.unit_price, item.total_price]
                    );
                }
                
                if (payment_method === 'wallet') {
                    await db.runQuery(
                        'UPDATE wallets SET balance = balance - ? WHERE user_id = ?',
                        [total, req.session.userId]
                    );
                    
                    await db.runQuery(
                        `INSERT INTO transactions (user_id, amount, type, method, status, created_at)
                         VALUES (?, ?, 'purchase', 'wallet', 'completed', ?)`,
                        [req.session.userId, total, new Date().toISOString()]
                    );
                }
                
                await db.runQuery('COMMIT');
                
                res.json({
                    success: true,
                    message: 'تم إنشاء الطلب بنجاح',
                    order: {
                        id: orderId,
                        order_code: orderCode,
                        total,
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
                error: 'حدث خطأ أثناء إنشاء الطلب'
            });
        }
    });
    
    return router;
};

// Middleware
const { validateRequest } = require('../middleware/validator');
const { 
    requireAuth, 
    requireRole, 
    requireBuyer,
    requireSeller,
    requireDriver 
} = require('../config/middleware');

// Models
const { OrderModel, ProductModel, WalletModel } = require('../database/models');
const database = require('../config/database');

// تهيئة الموديلات
const orderModel = new OrderModel(database);
const productModel = new ProductModel(database);
const walletModel = new WalletModel(database);

// مسار إنشاء طلب جديد
router.post('/', requireAuth, requireBuyer, [
    body('items')
        .isArray({ min: 1 })
        .withMessage('يجب اختيار منتج واحد على الأقل'),
    
    body('items.*.product_id')
        .isInt()
        .withMessage('معرف المنتج غير صحيح'),
    
    body('items.*.quantity')
        .isInt({ min: 1 })
        .withMessage('الكمية يجب أن تكون 1 على الأقل'),
    
    body('shipping_address')
        .trim()
        .notEmpty()
        .withMessage('عنوان التوصيل مطلوب')
        .isLength({ min: 10, max: 200 })
        .withMessage('العنوان يجب أن يكون بين 10 و 200 حرف'),
    
    body('payment_method')
        .isIn(['wallet', 'cash'])
        .withMessage('طريقة الدفع غير صحيحة'),
    
    body('wash_qat')
        .optional()
        .isBoolean()
        .withMessage('قيمة غسيل القات غير صحيحة')
], validateRequest, async (req, res) => {
    try {
        const buyerId = req.session.userId;
        const { items, shipping_address, payment_method, wash_qat = false } = req.body;
        
        let totalAmount = 0;
        const orderItems = [];
        const sellers = new Set();
        
        // التحقق من المنتجات والكميات
        for (const item of items) {
            const product = await productModel.findById(item.product_id);
            
            if (!product || product.status !== 'active') {
                return res.status(400).json({
                    success: false,
                    error: `المنتج ${item.product_id} غير متوفر`
                });
            }
            
            if (product.quantity < item.quantity) {
                return res.status(400).json({
                    success: false,
                    error: `الكمية غير متوفرة للمنتج ${product.name}`
                });
            }
            
            const itemTotal = product.price * item.quantity;
            totalAmount += itemTotal;
            
            orderItems.push({
                product_id: product.id,
                seller_id: product.seller_id,
                quantity: item.quantity,
                unit_price: product.price,
                total_price: itemTotal,
                product_name: product.name
            });
            
            sellers.add(product.seller_id);
        }
        
        // إضافة تكلفة الغسيل إذا طلب
        if (wash_qat) {
            totalAmount += 100; // سعر غسيل القات
        }
        
        // التحقق من الرصيد إذا كانت الدفع بالمحفظة
        if (payment_method === 'wallet') {
            const walletBalance = await walletModel.getBalance(buyerId);
            if (walletBalance < totalAmount) {
                return res.status(400).json({
                    success: false,
                    error: 'رصيد المحفظة غير كافي'
                });
            }
        }
        
        // بدء معاملة قاعدة البيانات
        await database.run('BEGIN TRANSACTION');
        
        try {
            // إنشاء الطلب
            const orderData = {
                buyer_id: buyerId,
                total: totalAmount,
                shipping_address,
                payment_method,
                wash_qat: wash_qat ? 1 : 0,
                status: payment_method === 'wallet' ? 'paid' : 'pending'
            };
            
            const order = await orderModel.create(orderData);
            
            // إضافة عناصر الطلب وتحديث الكميات
            for (const item of orderItems) {
                await database.run(
                    `INSERT INTO order_items 
                     (order_id, product_id, seller_id, quantity, unit_price, total_price)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [order.id, item.product_id, item.seller_id, item.quantity, item.unit_price, item.total_price]
                );
                
                // تحديث كمية المنتج
                await productModel.updateStock(item.product_id, -item.quantity);
            }
            
            // خصم المبلغ من المحفظة إذا كانت الدفع بالمحفظة
            if (payment_method === 'wallet') {
                await walletModel.updateBalance(buyerId, -totalAmount);
                
                // تسجيل المعاملة
                await database.run(
                    `INSERT INTO transactions 
                     (user_id, amount, type, method, status, created_at)
                     VALUES (?, ?, 'purchase', 'wallet', 'completed', datetime('now'))`,
                    [buyerId, -totalAmount]
                );
            }
            
            // إنشاء طلب غسيل إذا طلب
            if (wash_qat) {
                const firstProduct = orderItems[0];
                const product = await productModel.findById(firstProduct.product_id);
                
                if (product && product.market_id) {
                    const washStation = await database.get(
                        'SELECT id FROM wash_stations WHERE market_id = ? AND status = "active" ORDER BY RANDOM() LIMIT 1',
                        [product.market_id]
                    );
                    
                    if (washStation) {
                        await database.run(
                            `INSERT INTO wash_orders 
                             (order_id, wash_station_id, status, created_at)
                             VALUES (?, ?, 'pending', datetime('now'))`,
                            [order.id, washStation.id]
                        );
                    }
                }
            }
            
            await database.run('COMMIT');
            
            // جلب بيانات الطلب الكاملة
            const fullOrder = await orderModel.getOrderWithItems(order.id);
            
            res.status(201).json({
                success: true,
                message: 'تم إنشاء الطلب بنجاح',
                data: fullOrder
            });
            
        } catch (error) {
            await database.run('ROLLBACK');
            throw error;
        }
        
    } catch (error) {
        console.error('❌ خطأ في إنشاء الطلب:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في إنشاء الطلب'
        });
    }
});

// مسار جلب طلبات المستخدم
router.get('/my-orders', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        const userRole = req.session.role;
        const { page = 1, limit = 10, status } = req.query;
        
        let orders = [];
        let total = 0;
        
        if (userRole === 'buyer') {
            // جلب طلبات المشتري
            const conditions = { buyer_id: userId };
            if (status) conditions.status = status;
            
            orders = await orderModel.findAll(conditions, {
                limit: parseInt(limit),
                offset: (page - 1) * limit,
                orderBy: 'created_at',
                order: 'DESC'
            });
            
            total = await orderModel.count(conditions);
            
        } else if (userRole === 'seller') {
            // جلب طلبات البائع
            const offset = (page - 1) * limit;
            
            orders = await database.all(`
                SELECT o.*, 
                       (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id AND oi.seller_id = ?) as item_count
                FROM orders o
                WHERE EXISTS (
                    SELECT 1 FROM order_items oi 
                    WHERE oi.order_id = o.id AND oi.seller_id = ?
                )
                ${status ? 'AND o.status = ?' : ''}
                ORDER BY o.created_at DESC
                LIMIT ? OFFSET ?
            `, status ? [userId, userId, status, limit, offset] : [userId, userId, limit, offset]);
            
            const countResult = await database.get(`
                SELECT COUNT(DISTINCT o.id) as total
                FROM orders o
                WHERE EXISTS (
                    SELECT 1 FROM order_items oi 
                    WHERE oi.order_id = o.id AND oi.seller_id = ?
                )
                ${status ? 'AND o.status = ?' : ''}
            `, status ? [userId, status] : [userId]);
            
            total = countResult ? countResult.total : 0;
            
        } else if (userRole === 'driver') {
            // جلب طلبات السائق
            const conditions = { driver_id: userId };
            if (status) conditions.status = status;
            
            orders = await orderModel.findAll(conditions, {
                limit: parseInt(limit),
                offset: (page - 1) * limit,
                orderBy: 'created_at',
                order: 'DESC'
            });
            
            total = await orderModel.count(conditions);
        }
        
        // جلب العناصر لكل طلب
        for (let order of orders) {
            const items = await database.all(`
                SELECT oi.*, p.name as product_name, p.image as product_image,
                       u.name as seller_name, s.store_name
                FROM order_items oi
                LEFT JOIN products p ON oi.product_id = p.id
                LEFT JOIN users u ON oi.seller_id = u.id
                LEFT JOIN sellers s ON oi.seller_id = s.user_id
                WHERE oi.order_id = ?
            `, [order.id]);
            
            order.items = items;
        }
        
        res.json({
            success: true,
            data: orders,
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب الطلبات:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب الطلبات'
        });
    }
});

// مسار جلب تفاصيل طلب معين
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.userId;
        const userRole = req.session.role;
        
        // جلب الطلب
        const order = await orderModel.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'الطلب غير موجود'
            });
        }
        
        // التحقق من الصلاحية
        const hasAccess = 
            order.buyer_id === userId || 
            (userRole === 'seller' && await isOrderForSeller(orderId, userId)) ||
            (userRole === 'driver' && order.driver_id === userId) ||
            userRole === 'admin';
        
        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                error: 'لا تملك الصلاحية لعرض هذا الطلب'
            });
        }
        
        // جلب بيانات الطلب الكاملة
        const fullOrder = await orderModel.getOrderWithItems(orderId);
        
        // جلب بيانات المشتري
        const buyer = await database.get(
            'SELECT name, phone, email FROM users WHERE id = ?',
            [order.buyer_id]
        );
        
        // جلب بيانات السائق إذا موجود
        let driver = null;
        if (order.driver_id) {
            driver = await database.get(`
                SELECT u.name, u.phone, d.vehicle_type, d.rating
                FROM drivers d
                LEFT JOIN users u ON d.user_id = u.id
                WHERE d.id = ?
            `, [order.driver_id]);
        }
        
        res.json({
            success: true,
            data: {
                ...fullOrder,
                buyer: buyer || {},
                driver: driver || {}
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب تفاصيل الطلب:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب تفاصيل الطلب'
        });
    }
});

// مسار تحديث حالة الطلب
router.put('/:id/status', requireAuth, [
    body('status')
        .isIn(['pending', 'paid', 'preparing', 'shipping', 'delivered', 'cancelled'])
        .withMessage('حالة غير صحيحة'),
    
    body('notes')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('الملاحظات يجب ألا تتجاوز 500 حرف')
], validateRequest, async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.userId;
        const userRole = req.session.role;
        const { status, notes } = req.body;
        
        // جلب الطلب
        const order = await orderModel.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'الطلب غير موجود'
            });
        }
        
        // التحقق من الصلاحية لتحديث الحالة
        let hasPermission = false;
        
        if (userRole === 'admin') {
            hasPermission = true;
        } else if (userRole === 'seller') {
            // يمكن للبائع تحديث الحالة إلى 'preparing'
            if (status === 'preparing' && await isOrderForSeller(orderId, userId)) {
                hasPermission = true;
            }
        } else if (userRole === 'driver') {
            // يمكن للسائق تحديث الحالة إلى 'shipping' أو 'delivered'
            if ((status === 'shipping' || status === 'delivered') && order.driver_id === userId) {
                hasPermission = true;
            }
        } else if (userRole === 'buyer') {
            // يمكن للمشتري إلغاء الطلب إذا كان في حالة 'pending'
            if (status === 'cancelled' && order.buyer_id === userId && order.status === 'pending') {
                hasPermission = true;
            }
        }
        
        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                error: 'لا تملك الصلاحية لتحديث حالة هذا الطلب'
            });
        }
        
        // تحديث حالة الطلب
        const updatedOrder = await orderModel.updateStatus(orderId, status);
        
        // إضافة ملاحظة إذا كانت موجودة
        if (notes) {
            await database.run(
                'UPDATE orders SET updated_at = datetime("now"), notes = ? WHERE id = ?',
                [notes, orderId]
            );
        }
        
        res.json({
            success: true,
            message: 'تم تحديث حالة الطلب بنجاح',
            data: updatedOrder
        });
        
    } catch (error) {
        console.error('❌ خطأ في تحديث حالة الطلب:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في تحديث حالة الطلب'
        });
    }
});

// مسار تعيين سائق للطلب
router.post('/:id/assign-driver', requireAuth, requireRole('admin', 'seller'), [
    body('driver_id')
        .isInt()
        .withMessage('معرف السائق غير صحيح')
], validateRequest, async (req, res) => {
    try {
        const orderId = req.params.id;
        const { driver_id } = req.body;
        
        // التحقق من وجود الطلب
        const order = await orderModel.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'الطلب غير موجود'
            });
        }
        
        // التحقق من حالة الطلب
        if (order.status !== 'preparing') {
            return res.status(400).json({
                success: false,
                error: 'لا يمكن تعيين سائق إلا للطلبات في مرحلة التحضير'
            });
        }
        
        // التحقق من وجود السائق وتوافره
        const driver = await database.get(`
            SELECT d.*, u.name FROM drivers d
            LEFT JOIN users u ON d.user_id = u.id
            WHERE d.id = ? AND d.status = 'available'
        `, [driver_id]);
        
        if (!driver) {
            return res.status(400).json({
                success: false,
                error: 'السائق غير موجود أو غير متوفر'
            });
        }
        
        // تعيين السائق وتحديث حالة الطلب
        await database.run(`
            UPDATE orders 
            SET driver_id = ?, status = 'shipping', updated_at = datetime('now')
            WHERE id = ?
        `, [driver_id, orderId]);
        
        // تحديث حالة السائق
        await database.run(
            'UPDATE drivers SET status = "busy" WHERE id = ?',
            [driver_id]
        );
        
        res.json({
            success: true,
            message: 'تم تعيين السائق للطلب بنجاح',
            data: {
                driver: {
                    id: driver.id,
                    name: driver.name,
                    vehicle_type: driver.vehicle_type
                }
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في تعيين سائق:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في تعيين سائق'
        });
    }
});

// مسار تتبع الطلب
router.get('/:id/tracking', requireAuth, async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.userId;
        const userRole = req.session.role;
        
        // جلب الطلب
        const order = await orderModel.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'الطلب غير موجود'
            });
        }
        
        // التحقق من الصلاحية
        const hasAccess = 
            order.buyer_id === userId || 
            (userRole === 'seller' && await isOrderForSeller(orderId, userId)) ||
            (userRole === 'driver' && order.driver_id === userId) ||
            userRole === 'admin';
        
        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                error: 'لا تملك الصلاحية لتتبع هذا الطلب'
            });
        }
        
        // جلب تاريخ التحديثات
        const timeline = await database.all(`
            SELECT 
                status,
                updated_at as timestamp,
                notes
            FROM orders 
            WHERE id = ? AND updated_at IS NOT NULL
            UNION
            SELECT 
                'created' as status,
                created_at as timestamp,
                'تم إنشاء الطلب' as notes
            FROM orders 
            WHERE id = ?
            ORDER BY timestamp
        `, [orderId, orderId]);
        
        // جلب موقع السائق إذا كان في مرحلة التوصيل
        let driverLocation = null;
        if (order.driver_id && (order.status === 'shipping' || order.status === 'delivered')) {
            const driver = await database.get(
                'SELECT current_location FROM drivers WHERE id = ?',
                [order.driver_id]
            );
            driverLocation = driver ? driver.current_location : null;
        }
        
        res.json({
            success: true,
            data: {
                order_id: orderId,
                current_status: order.status,
                timeline: timeline,
                driver_location: driverLocation,
                estimated_delivery: calculateEstimatedDelivery(order.created_at)
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في تتبع الطلب:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في تتبع الطلب'
        });
    }
});

// دالة مساعدة للتحقق من أن الطلب يحتوي على منتجات للبائع
async function isOrderForSeller(orderId, sellerId) {
    const result = await database.get(`
        SELECT 1 FROM order_items 
        WHERE order_id = ? AND seller_id = ?
        LIMIT 1
    `, [orderId, sellerId]);
    
    return result !== null;
}

// دالة مساعدة لحساب وقت التوصيل المتوقع
function calculateEstimatedDelivery(createdAt) {
    const created = new Date(createdAt);
    const estimated = new Date(created.getTime() + 2 * 60 * 60 * 1000); // +2 ساعة
    return estimated.toISOString();
}

module.exports = router;
