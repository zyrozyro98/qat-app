const logger = require('../config/logger');
const helpers = require('../utils/helpers');

module.exports = (db) => {
    return {
        // جلب الإحصائيات
        async getStats(req, res) {
            try {
                const stats = await db.allQuery(`
                    SELECT 
                        (SELECT COUNT(*) FROM users) as total_users,
                        (SELECT COUNT(*) FROM users WHERE role = 'buyer') as total_buyers,
                        (SELECT COUNT(*) FROM users WHERE role = 'seller') as total_sellers,
                        (SELECT COUNT(*) FROM users WHERE role = 'driver') as total_drivers,
                        (SELECT COUNT(*) FROM products WHERE status = 'active') as active_products,
                        (SELECT COUNT(*) FROM orders WHERE DATE(created_at) = DATE('now')) as today_orders,
                        (SELECT SUM(total) FROM orders WHERE DATE(created_at) = DATE('now')) as today_revenue,
                        (SELECT COUNT(*) FROM orders WHERE status = 'pending') as pending_orders,
                        (SELECT COUNT(*) FROM drivers WHERE status = 'available') as available_drivers,
                        (SELECT COUNT(*) FROM markets WHERE status = 'active') as active_markets,
                        (SELECT SUM(balance) FROM wallets) as total_wallet_balance
                `);
                
                res.json({
                    success: true,
                    data: stats[0] || {}
                });
            } catch (error) {
                logger.error(`❌ خطأ في جلب الإحصائيات: ${error.message}`);
                res.status(500).json({ success: false, error: 'خطأ في الخادم' });
            }
        },

        // جلب تقرير المبيعات
        async getSalesReport(req, res) {
            try {
                const { start_date, end_date, period = 'daily' } = req.query;
                
                let query;
                if (period === 'daily') {
                    query = `
                        SELECT 
                            DATE(created_at) as date,
                            COUNT(*) as order_count,
                            SUM(total) as total_sales,
                            AVG(total) as avg_order_value
                        FROM orders
                        WHERE 1=1
                    `;
                } else if (period === 'monthly') {
                    query = `
                        SELECT 
                            strftime('%Y-%m', created_at) as month,
                            COUNT(*) as order_count,
                            SUM(total) as total_sales,
                            AVG(total) as avg_order_value
                        FROM orders
                        WHERE 1=1
                    `;
                } else {
                    query = `
                        SELECT 
                            strftime('%Y', created_at) as year,
                            COUNT(*) as order_count,
                            SUM(total) as total_sales,
                            AVG(total) as avg_order_value
                        FROM orders
                        WHERE 1=1
                    `;
                }
                
                const params = [];
                if (start_date) {
                    query += ' AND DATE(created_at) >= ?';
                    params.push(start_date);
                }
                if (end_date) {
                    query += ' AND DATE(created_at) <= ?';
                    params.push(end_date);
                }
                
                if (period === 'daily') {
                    query += ' GROUP BY DATE(created_at) ORDER BY date DESC';
                } else if (period === 'monthly') {
                    query += ' GROUP BY strftime("%Y-%m", created_at) ORDER BY month DESC';
                } else {
                    query += ' GROUP BY strftime("%Y", created_at) ORDER BY year DESC';
                }
                
                const report = await db.allQuery(query, params);
                
                res.json({
                    success: true,
                    data: report,
                    meta: {
                        period,
                        start_date,
                        end_date,
                        count: report.length
                    }
                });
            } catch (error) {
                logger.error(`❌ خطأ في جلب تقرير المبيعات: ${error.message}`);
                res.status(500).json({ success: false, error: 'خطأ في الخادم' });
            }
        },

        // جلب جميع المستخدمين
        async getAllUsers(req, res) {
            try {
                const { role, status, page = 1, limit = 20 } = req.query;
                
                let query = `
                    SELECT u.*, 
                           w.balance,
                           s.store_name,
                           d.vehicle_type,
                           d.status as driver_status
                    FROM users u
                    LEFT JOIN wallets w ON u.id = w.user_id
                    LEFT JOIN sellers s ON u.id = s.user_id
                    LEFT JOIN drivers d ON u.id = d.user_id
                    WHERE 1=1
                `;
                
                const params = [];
                
                if (role) {
                    query += ' AND u.role = ?';
                    params.push(role);
                }
                
                if (status) {
                    query += ' AND u.status = ?';
                    params.push(status);
                }
                
                // حساب العدد الإجمالي
                const countQuery = `SELECT COUNT(*) as total ${query.substring(query.indexOf('FROM'))}`;
                const countResult = await db.getQuery(countQuery, params);
                const total = countResult ? countResult.total : 0;
                
                query += ' ORDER BY u.created_at DESC';
                
                const offset = (page - 1) * limit;
                query += ' LIMIT ? OFFSET ?';
                params.push(parseInt(limit), offset);
                
                const users = await db.allQuery(query, params);
                
                res.json({
                    success: true,
                    data: users,
                    meta: {
                        total,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        pages: Math.ceil(total / limit)
                    }
                });
            } catch (error) {
                logger.error(`❌ خطأ في جلب المستخدمين: ${error.message}`);
                res.status(500).json({ success: false, error: 'خطأ في الخادم' });
            }
        },

        // تحديث حالة المستخدم
        async updateUserStatus(req, res) {
            try {
                const { userId } = req.params;
                const { status } = req.body;
                
                const validStatuses = ['active', 'inactive', 'suspended'];
                if (!validStatuses.includes(status)) {
                    return res.status(400).json({
                        success: false,
                        error: 'حالة غير صالحة'
                    });
                }
                
                await db.runQuery(
                    'UPDATE users SET status = ?, updated_at = ? WHERE id = ?',
                    [status, new Date().toISOString(), userId]
                );
                
                res.json({
                    success: true,
                    message: 'تم تحديث حالة المستخدم بنجاح'
                });
            } catch (error) {
                logger.error(`❌ خطأ في تحديث حالة المستخدم: ${error.message}`);
                res.status(500).json({ success: false, error: 'خطأ في الخادم' });
            }
        },

        // جلب جميع الطلبات
        async getAllOrders(req, res) {
            try {
                const { status, payment_method, page = 1, limit = 20 } = req.query;
                
                let query = `
                    SELECT o.*, 
                           u.name as buyer_name,
                           u.phone as buyer_phone,
                           d.user_id as driver_user_id,
                           du.name as driver_name
                    FROM orders o
                    LEFT JOIN users u ON o.buyer_id = u.id
                    LEFT JOIN drivers d ON o.driver_id = d.id
                    LEFT JOIN users du ON d.user_id = du.id
                    WHERE 1=1
                `;
                
                const params = [];
                
                if (status) {
                    query += ' AND o.status = ?';
                    params.push(status);
                }
                
                if (payment_method) {
                    query += ' AND o.payment_method = ?';
                    params.push(payment_method);
                }
                
                // حساب العدد الإجمالي
                const countQuery = `SELECT COUNT(*) as total ${query.substring(query.indexOf('FROM'))}`;
                const countResult = await db.getQuery(countQuery, params);
                const total = countResult ? countResult.total : 0;
                
                query += ' ORDER BY o.created_at DESC';
                
                const offset = (page - 1) * limit;
                query += ' LIMIT ? OFFSET ?';
                params.push(parseInt(limit), offset);
                
                const orders = await db.allQuery(query, params);
                
                // جلب العناصر لكل طلب
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
                        total,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        pages: Math.ceil(total / limit)
                    }
                });
            } catch (error) {
                logger.error(`❌ خطأ في جلب الطلبات: ${error.message}`);
                res.status(500).json({ success: false, error: 'خطأ في الخادم' });
            }
        },

        // تحديث حالة الطلب
        async updateOrderStatus(req, res) {
            try {
                const { orderId } = req.params;
                const { status, driver_id } = req.body;
                
                const validStatuses = ['pending', 'paid', 'preparing', 'shipping', 'delivered', 'cancelled'];
                if (!validStatuses.includes(status)) {
                    return res.status(400).json({
                        success: false,
                        error: 'حالة غير صالحة'
                    });
                }
                
                await db.runQuery(
                    'UPDATE orders SET status = ?, driver_id = ?, updated_at = ? WHERE id = ?',
                    [status, driver_id || null, new Date().toISOString(), orderId]
                );
                
                // إضافة إشعار للمشتري
                const order = await db.getQuery('SELECT buyer_id, order_code FROM orders WHERE id = ?', [orderId]);
                if (order) {
                    await db.runQuery(
                        `INSERT INTO notifications (user_id, title, message, type, created_at)
                         VALUES (?, ?, ?, 'info', ?)`,
                        [order.buyer_id, 'تحديث حالة الطلب', `تم تحديث حالة طلبك #${order.order_code} إلى ${status}`, new Date().toISOString()]
                    );
                }
                
                res.json({
                    success: true,
                    message: 'تم تحديث حالة الطلب بنجاح'
                });
            } catch (error) {
                logger.error(`❌ خطأ في تحديث حالة الطلب: ${error.message}`);
                res.status(500).json({ success: false, error: 'خطأ في الخادم' });
            }
        }
    };
};
