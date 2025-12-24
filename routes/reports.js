const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin, requireSeller } = require('../middleware/auth');
const logger = require('../config/logger');
const xlsx = require('xlsx');
const PDFDocument = require('pdfkit');
const helpers = require('../utils/helpers');

module.exports = (db) => {
    // تقرير المبيعات
    router.get('/sales', requireAuth, requireAdmin, async (req, res) => {
        try {
            const { start_date, end_date, period = 'daily', format = 'json' } = req.query;
            
            let query;
            if (period === 'daily') {
                query = `
                    SELECT 
                        DATE(o.created_at) as date,
                        COUNT(*) as order_count,
                        SUM(o.total) as total_sales,
                        AVG(o.total) as avg_order_value,
                        SUM(CASE WHEN o.payment_method = 'wallet' THEN 1 ELSE 0 END) as wallet_payments,
                        SUM(CASE WHEN o.payment_method = 'cash' THEN 1 ELSE 0 END) as cash_payments
                    FROM orders o
                    WHERE o.status != 'cancelled'
                `;
            } else if (period === 'monthly') {
                query = `
                    SELECT 
                        strftime('%Y-%m', o.created_at) as month,
                        COUNT(*) as order_count,
                        SUM(o.total) as total_sales,
                        AVG(o.total) as avg_order_value,
                        SUM(CASE WHEN o.payment_method = 'wallet' THEN 1 ELSE 0 END) as wallet_payments,
                        SUM(CASE WHEN o.payment_method = 'cash' THEN 1 ELSE 0 END) as cash_payments
                    FROM orders o
                    WHERE o.status != 'cancelled'
                `;
            } else {
                query = `
                    SELECT 
                        strftime('%Y', o.created_at) as year,
                        COUNT(*) as order_count,
                        SUM(o.total) as total_sales,
                        AVG(o.total) as avg_order_value,
                        SUM(CASE WHEN o.payment_method = 'wallet' THEN 1 ELSE 0 END) as wallet_payments,
                        SUM(CASE WHEN o.payment_method = 'cash' THEN 1 ELSE 0 END) as cash_payments
                    FROM orders o
                    WHERE o.status != 'cancelled'
                `;
            }
            
            const params = [];
            if (start_date) {
                query += ' AND DATE(o.created_at) >= ?';
                params.push(start_date);
            }
            if (end_date) {
                query += ' AND DATE(o.created_at) <= ?';
                params.push(end_date);
            }
            
            if (period === 'daily') {
                query += ' GROUP BY DATE(o.created_at) ORDER BY date DESC';
            } else if (period === 'monthly') {
                query += ' GROUP BY strftime("%Y-%m", o.created_at) ORDER BY month DESC';
            } else {
                query += ' GROUP BY strftime("%Y", o.created_at) ORDER BY year DESC';
            }
            
            const report = await db.allQuery(query, params);
            
            // حساب الإجماليات
            const totals = {
                total_orders: 0,
                total_sales: 0,
                total_wallet_payments: 0,
                total_cash_payments: 0
            };
            
            report.forEach(item => {
                totals.total_orders += item.order_count || 0;
                totals.total_sales += item.total_sales || 0;
                totals.total_wallet_payments += item.wallet_payments || 0;
                totals.total_cash_payments += item.cash_payments || 0;
            });
            
            if (format === 'excel') {
                const workbook = xlsx.utils.book_new();
                const worksheet = xlsx.utils.json_to_sheet(report);
                xlsx.utils.book_append_sheet(workbook, worksheet, 'Sales Report');
                
                const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
                
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename=sales_report_${helpers.formatDate(new Date(), 'YYYY-MM-DD')}.xlsx`);
                res.send(buffer);
            } else if (format === 'pdf') {
                const doc = new PDFDocument({ margin: 50 });
                const buffers = [];
                
                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => {
                    const pdfData = Buffer.concat(buffers);
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Disposition', `attachment; filename=sales_report_${helpers.formatDate(new Date(), 'YYYY-MM-DD')}.pdf`);
                    res.send(pdfData);
                });
                
                doc.font('Helvetica-Bold').fontSize(20).text('تقرير المبيعات', { align: 'center' });
                doc.moveDown();
                doc.fontSize(12);
                doc.text(`تاريخ التقرير: ${helpers.formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')}`);
                doc.text(`الفترة: ${period === 'daily' ? 'يومي' : period === 'monthly' ? 'شهري' : 'سنوي'}`);
                if (start_date) doc.text(`من: ${start_date}`);
                if (end_date) doc.text(`إلى: ${end_date}`);
                
                doc.moveDown();
                doc.font('Helvetica-Bold').text('الإجماليات:');
                doc.font('Helvetica');
                doc.text(`إجمالي الطلبات: ${totals.total_orders}`);
                doc.text(`إجمالي المبيعات: ${helpers.formatCurrency(totals.total_sales)}`);
                doc.text(`المدفوعات بالمحفظة: ${totals.total_wallet_payments}`);
                doc.text(`المدفوعات نقداً: ${totals.total_cash_payments}`);
                
                if (report.length > 0) {
                    doc.moveDown();
                    doc.font('Helvetica-Bold').text('التفاصيل:');
                    
                    report.forEach((item, index) => {
                        doc.moveDown();
                        doc.text(`${index + 1}. ${item.date || item.month || item.year}:`);
                        doc.text(`   عدد الطلبات: ${item.order_count}`);
                        doc.text(`   المبيعات: ${helpers.formatCurrency(item.total_sales)}`);
                        doc.text(`   متوسط قيمة الطلب: ${helpers.formatCurrency(item.avg_order_value || 0)}`);
                    });
                }
                
                doc.end();
            } else {
                res.json({
                    success: true,
                    data: {
                        report,
                        totals,
                        summary: {
                            period,
                            start_date,
                            end_date,
                            report_date: new Date().toISOString()
                        }
                    }
                });
            }
        } catch (error) {
            logger.error(`❌ خطأ في جلب تقرير المبيعات: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // تقرير المنتجات
    router.get('/products', requireAuth, requireAdmin, async (req, res) => {
        try {
            const { category, market_id, top_n = 10, format = 'json' } = req.query;
            
            let query = `
                SELECT 
                    p.id,
                    p.name,
                    p.category,
                    p.price,
                    p.quantity,
                    p.status,
                    m.name as market_name,
                    u.name as seller_name,
                    s.store_name,
                    COUNT(oi.product_id) as units_sold,
                    SUM(oi.total_price) as revenue,
                    AVG(r.rating) as avg_rating,
                    COUNT(r.id) as review_count
                FROM products p
                LEFT JOIN markets m ON p.market_id = m.id
                LEFT JOIN users u ON p.seller_id = u.id
                LEFT JOIN sellers s ON p.seller_id = s.user_id
                LEFT JOIN order_items oi ON p.id = oi.product_id
                LEFT JOIN reviews r ON p.id = r.product_id
                WHERE 1=1
            `;
            
            const params = [];
            
            if (category) {
                query += ' AND p.category = ?';
                params.push(category);
            }
            
            if (market_id) {
                query += ' AND p.market_id = ?';
                params.push(market_id);
            }
            
            query += ` GROUP BY p.id
                       ORDER BY revenue DESC
                       LIMIT ?`;
            params.push(parseInt(top_n));
            
            const report = await db.allQuery(query, params);
            
            if (format === 'excel') {
                const workbook = xlsx.utils.book_new();
                const worksheet = xlsx.utils.json_to_sheet(report);
                xlsx.utils.book_append_sheet(workbook, worksheet, 'Products Report');
                
                const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
                
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename=products_report_${helpers.formatDate(new Date(), 'YYYY-MM-DD')}.xlsx`);
                res.send(buffer);
            } else {
                // حساب الإحصائيات
                const stats = {
                    total_products: report.length,
                    total_revenue: report.reduce((sum, item) => sum + (item.revenue || 0), 0),
                    total_units_sold: report.reduce((sum, item) => sum + (item.units_sold || 0), 0),
                    avg_price: report.reduce((sum, item) => sum + (item.price || 0), 0) / report.length,
                    categories: {}
                };
                
                // تجميع حسب الفئة
                report.forEach(item => {
                    if (!stats.categories[item.category]) {
                        stats.categories[item.category] = {
                            count: 0,
                            revenue: 0,
                            units_sold: 0
                        };
                    }
                    stats.categories[item.category].count++;
                    stats.categories[item.category].revenue += item.revenue || 0;
                    stats.categories[item.category].units_sold += item.units_sold || 0;
                });
                
                res.json({
                    success: true,
                    data: {
                        report,
                        stats,
                        summary: {
                            top_n: parseInt(top_n),
                            report_date: new Date().toISOString()
                        }
                    }
                });
            }
        } catch (error) {
            logger.error(`❌ خطأ في جلب تقرير المنتجات: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // تقرير المستخدمين
    router.get('/users', requireAuth, requireAdmin, async (req, res) => {
        try {
            const { role, status, registration_date, format = 'json' } = req.query;
            
            let query = `
                SELECT 
                    u.id,
                    u.name,
                    u.email,
                    u.phone,
                    u.role,
                    u.status,
                    u.created_at as registration_date,
                    u.last_login,
                    w.balance,
                    s.store_name,
                    d.vehicle_type,
                    d.status as driver_status,
                    (SELECT COUNT(*) FROM orders WHERE buyer_id = u.id) as total_orders,
                    (SELECT SUM(total) FROM orders WHERE buyer_id = u.id AND status = 'delivered') as total_spent,
                    (SELECT COUNT(*) FROM reviews WHERE user_id = u.id) as total_reviews
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
            
            if (registration_date) {
                query += ' AND DATE(u.created_at) = ?';
                params.push(registration_date);
            }
            
            query += ' ORDER BY u.created_at DESC';
            
            const report = await db.allQuery(query, params);
            
            if (format === 'excel') {
                const workbook = xlsx.utils.book_new();
                const worksheet = xlsx.utils.json_to_sheet(report);
                xlsx.utils.book_append_sheet(workbook, worksheet, 'Users Report');
                
                const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
                
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename=users_report_${helpers.formatDate(new Date(), 'YYYY-MM-DD')}.xlsx`);
                res.send(buffer);
            } else {
                // حساب الإحصائيات
                const stats = {
                    total_users: report.length,
                    by_role: {},
                    by_status: {},
                    total_wallet_balance: 0,
                    active_today: 0
                };
                
                // تجميع حسب الدور والحالة
                report.forEach(user => {
                    // حسب الدور
                    if (!stats.by_role[user.role]) {
                        stats.by_role[user.role] = 0;
                    }
                    stats.by_role[user.role]++;
                    
                    // حسب الحالة
                    if (!stats.by_status[user.status]) {
                        stats.by_status[user.status] = 0;
                    }
                    stats.by_status[user.status]++;
                    
                    // رصيد المحفظة
                    stats.total_wallet_balance += user.balance || 0;
                    
                    // نشط اليوم
                    if (user.last_login && helpers.formatDate(user.last_login, 'YYYY-MM-DD') === helpers.formatDate(new Date(), 'YYYY-MM-DD')) {
                        stats.active_today++;
                    }
                });
                
                res.json({
                    success: true,
                    data: {
                        report,
                        stats,
                        summary: {
                            report_date: new Date().toISOString(),
                            filters: {
                                role,
                                status,
                                registration_date
                            }
                        }
                    }
                });
            }
        } catch (error) {
            logger.error(`❌ خطأ في جلب تقرير المستخدمين: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // تقرير المدفوعات
    router.get('/payments', requireAuth, requireAdmin, async (req, res) => {
        try {
            const { start_date, end_date, method, format = 'json' } = req.query;
            
            let query = `
                SELECT 
                    t.*,
                    u.name as user_name,
                    u.email as user_email,
                    u.role as user_role
                FROM transactions t
                LEFT JOIN users u ON t.user_id = u.id
                WHERE t.status = 'completed'
            `;
            
            const params = [];
            
            if (start_date) {
                query += ' AND DATE(t.created_at) >= ?';
                params.push(start_date);
            }
            
            if (end_date) {
                query += ' AND DATE(t.created_at) <= ?';
                params.push(end_date);
            }
            
            if (method) {
                query += ' AND t.method = ?';
                params.push(method);
            }
            
            query += ' ORDER BY t.created_at DESC';
            
            const report = await db.allQuery(query, params);
            
            if (format === 'excel') {
                const workbook = xlsx.utils.book_new();
                const worksheet = xlsx.utils.json_to_sheet(report);
                xlsx.utils.book_append_sheet(workbook, worksheet, 'Payments Report');
                
                const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
                
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename=payments_report_${helpers.formatDate(new Date(), 'YYYY-MM-DD')}.xlsx`);
                res.send(buffer);
            } else {
                // حساب الإحصائيات
                const stats = {
                    total_transactions: report.length,
                    total_amount: 0,
                    by_type: {},
                    by_method: {},
                    daily_average: 0
                };
                
                // حساب الإجماليات
                report.forEach(transaction => {
                    stats.total_amount += transaction.amount || 0;
                    
                    // حسب النوع
                    if (!stats.by_type[transaction.type]) {
                        stats.by_type[transaction.type] = {
                            count: 0,
                            amount: 0
                        };
                    }
                    stats.by_type[transaction.type].count++;
                    stats.by_type[transaction.type].amount += transaction.amount || 0;
                    
                    // حسب الطريقة
                    if (!stats.by_method[transaction.method]) {
                        stats.by_method[transaction.method] = {
                            count: 0,
                            amount: 0
                        };
                    }
                    stats.by_method[transaction.method].count++;
                    stats.by_method[transaction.method].amount += transaction.amount || 0;
                });
                
                // حساب المتوسط اليومي
                if (report.length > 0) {
                    const firstDate = new Date(report[report.length - 1].created_at);
                    const lastDate = new Date(report[0].created_at);
                    const daysDiff = Math.ceil((lastDate - firstDate) / (1000 * 60 * 60 * 24)) || 1;
                    stats.daily_average = stats.total_amount / daysDiff;
                }
                
                res.json({
                    success: true,
                    data: {
                        report,
                        stats,
                        summary: {
                            start_date,
                            end_date,
                            method,
                            report_date: new Date().toISOString()
                        }
                    }
                });
            }
        } catch (error) {
            logger.error(`❌ خطأ في جلب تقرير المدفوعات: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // تقرير البائع
    router.get('/seller', requireAuth, requireSeller, async (req, res) => {
        try {
            const { start_date, end_date, format = 'json' } = req.query;
            
            // تقرير مبيعات البائع
            const salesReport = await db.allQuery(`
                SELECT 
                    DATE(o.created_at) as date,
                    COUNT(DISTINCT o.id) as order_count,
                    SUM(oi.total_price) as total_sales,
                    SUM(oi.quantity) as total_quantity,
                    AVG(oi.total_price) as avg_order_value
                FROM orders o
                LEFT JOIN order_items oi ON o.id = oi.order_id
                WHERE oi.seller_id = ? 
                AND o.status = 'delivered'
                ${start_date ? 'AND DATE(o.created_at) >= ?' : ''}
                ${end_date ? 'AND DATE(o.created_at) <= ?' : ''}
                GROUP BY DATE(o.created_at)
                ORDER BY date DESC
            `, [req.session.userId, ...(start_date ? [start_date] : []), ...(end_date ? [end_date] : [])]);
            
            // أفضل المنتجات مبيعاً
            const topProducts = await db.allQuery(`
                SELECT 
                    p.id,
                    p.name,
                    p.price,
                    p.image,
                    SUM(oi.quantity) as total_quantity,
                    SUM(oi.total_price) as total_revenue
                FROM products p
                LEFT JOIN order_items oi ON p.id = oi.product_id
                LEFT JOIN orders o ON oi.order_id = o.id
                WHERE p.seller_id = ? 
                AND o.status = 'delivered'
                GROUP BY p.id
                ORDER BY total_revenue DESC
                LIMIT 10
            `, [req.session.userId]);
            
            // إحصائيات البائع
            const stats = await db.getQuery(`
                SELECT 
                    (SELECT COUNT(*) FROM products WHERE seller_id = ?) as total_products,
                    (SELECT COUNT(*) FROM products WHERE seller_id = ? AND status = 'active') as active_products,
                    (SELECT COUNT(*) FROM products WHERE seller_id = ? AND status = 'out_of_stock') as out_of_stock_products,
                    (SELECT SUM(oi.total_price) FROM order_items oi 
                     LEFT JOIN orders o ON oi.order_id = o.id 
                     WHERE oi.seller_id = ? AND o.status = 'delivered') as total_earnings,
                    (SELECT COUNT(DISTINCT o.buyer_id) FROM orders o 
                     LEFT JOIN order_items oi ON o.id = oi.order_id 
                     WHERE oi.seller_id = ? AND o.status = 'delivered') as total_customers,
                    (SELECT AVG(r.rating) FROM reviews r 
                     LEFT JOIN products p ON r.product_id = p.id 
                     WHERE p.seller_id = ?) as avg_rating,
                    (SELECT COUNT(*) FROM reviews r 
                     LEFT JOIN products p ON r.product_id = p.id 
                     WHERE p.seller_id = ?) as total_reviews
            `, [req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId]);
            
            // العملاء المتكررين
            const repeatCustomers = await db.allQuery(`
                SELECT 
                    u.id,
                    u.name,
                    u.avatar,
                    COUNT(DISTINCT o.id) as order_count,
                    SUM(oi.total_price) as total_spent
                FROM users u
                LEFT JOIN orders o ON u.id = o.buyer_id
                LEFT JOIN order_items oi ON o.id = oi.order_id
                WHERE oi.seller_id = ? 
                AND o.status = 'delivered'
                GROUP BY u.id
                HAVING order_count > 1
                ORDER BY total_spent DESC
                LIMIT 10
            `, [req.session.userId]);
            
            if (format === 'excel') {
                const workbook = xlsx.utils.book_new();
                
                // ورقة المبيعات
                const salesSheet = xlsx.utils.json_to_sheet(salesReport);
                xlsx.utils.book_append_sheet(workbook, salesSheet, 'المبيعات');
                
                // ورقة المنتجات
                const productsSheet = xlsx.utils.json_to_sheet(topProducts);
                xlsx.utils.book_append_sheet(workbook, productsSheet, 'المنتجات');
                
                const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
                
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename=seller_report_${helpers.formatDate(new Date(), 'YYYY-MM-DD')}.xlsx`);
                res.send(buffer);
            } else {
                res.json({
                    success: true,
                    data: {
                        salesReport,
                        topProducts,
                        stats: stats || {},
                        repeatCustomers,
                        summary: {
                            start_date,
                            end_date,
                            report_date: new Date().toISOString()
                        }
                    }
                });
            }
        } catch (error) {
            logger.error(`❌ خطأ في جلب تقرير البائع: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // تقرير النظام العام
    router.get('/system', requireAuth, requireAdmin, async (req, res) => {
        try {
            const systemReport = {
                timestamp: new Date().toISOString(),
                users: await db.getQuery(`
                    SELECT 
                        COUNT(*) as total,
                        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
                        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive,
                        COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended,
                        COUNT(CASE WHEN role = 'buyer' THEN 1 END) as buyers,
                        COUNT(CASE WHEN role = 'seller' THEN 1 END) as sellers,
                        COUNT(CASE WHEN role = 'driver' THEN 1 END) as drivers,
                        COUNT(CASE WHEN role = 'admin' THEN 1 END) as admins
                    FROM users
                `),
                orders: await db.getQuery(`
                    SELECT 
                        COUNT(*) as total,
                        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid,
                        COUNT(CASE WHEN status = 'preparing' THEN 1 END) as preparing,
                        COUNT(CASE WHEN status = 'shipping' THEN 1 END) as shipping,
                        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
                        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
                        SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END) as total_revenue,
                        AVG(CASE WHEN status != 'cancelled' THEN total ELSE NULL END) as avg_order_value
                    FROM orders
                `),
                products: await db.getQuery(`
                    SELECT 
                        COUNT(*) as total,
                        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
                        COUNT(CASE WHEN status = 'out_of_stock' THEN 1 END) as out_of_stock,
                        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive,
                        AVG(price) as avg_price,
                        SUM(quantity) as total_quantity
                    FROM products
                `),
                markets: await db.getQuery(`
                    SELECT 
                        COUNT(*) as total,
                        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
                        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive
                    FROM markets
                `),
                drivers: await db.getQuery(`
                    SELECT 
                        COUNT(*) as total,
                        COUNT(CASE WHEN status = 'available' THEN 1 END) as available,
                        COUNT(CASE WHEN status = 'busy' THEN 1 END) as busy,
                        COUNT(CASE WHEN status = 'offline' THEN 1 END) as offline,
                        AVG(rating) as avg_rating
                    FROM drivers
                `),
                wallets: await db.getQuery(`
                    SELECT 
                        COUNT(*) as total,
                        SUM(balance) as total_balance,
                        AVG(balance) as avg_balance,
                        MAX(balance) as max_balance,
                        MIN(balance) as min_balance
                    FROM wallets
                `),
                recent_activity: {
                    new_users_today: await db.getQuery('SELECT COUNT(*) as count FROM users WHERE DATE(created_at) = DATE("now")'),
                    orders_today: await db.getQuery('SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = DATE("now")'),
                    revenue_today: await db.getQuery('SELECT SUM(total) as amount FROM orders WHERE DATE(created_at) = DATE("now") AND status != "cancelled"'),
                    active_users_today: await db.getQuery('SELECT COUNT(DISTINCT user_id) as count FROM orders WHERE DATE(created_at) = DATE("now")')
                }
            };
            
            res.json({
                success: true,
                data: systemReport
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب تقرير النظام: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    return router;
};
