const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const xlsx = require('xlsx');
const PDFDocument = require('pdfkit');
const moment = require('moment');

// Middleware
const { validateRequest } = require('../middleware/validator');
const { requireAuth, requireAdmin } = require('../config/middleware');

// Database
const database = require('../config/database');

// مسار جلب إحصائيات النظام
router.get('/stats/overview', requireAuth, requireAdmin, async (req, res) => {
    try {
        const stats = await database.all(`
            SELECT 
                -- إحصائيات المستخدمين
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM users WHERE role = 'buyer') as total_buyers,
                (SELECT COUNT(*) FROM users WHERE role = 'seller') as total_sellers,
                (SELECT COUNT(*) FROM users WHERE role = 'driver') as total_drivers,
                (SELECT COUNT(*) FROM users WHERE DATE(created_at) = DATE('now')) as today_users,
                
                -- إحصائيات المنتجات
                (SELECT COUNT(*) FROM products) as total_products,
                (SELECT COUNT(*) FROM products WHERE status = 'active') as active_products,
                (SELECT COUNT(*) FROM products WHERE status = 'out_of_stock') as out_of_stock_products,
                (SELECT COUNT(*) FROM products WHERE DATE(created_at) = DATE('now')) as today_products,
                
                -- إحصائيات الطلبات
                (SELECT COUNT(*) FROM orders) as total_orders,
                (SELECT COUNT(*) FROM orders WHERE DATE(created_at) = DATE('now')) as today_orders,
                (SELECT COUNT(*) FROM orders WHERE status = 'pending') as pending_orders,
                (SELECT COUNT(*) FROM orders WHERE status = 'delivered') as delivered_orders,
                (SELECT SUM(total) FROM orders WHERE DATE(created_at) = DATE('now')) as today_revenue,
                (SELECT SUM(total) FROM orders) as total_revenue,
                
                -- إحصائيات الأسواق
                (SELECT COUNT(*) FROM markets) as total_markets,
                (SELECT COUNT(*) FROM markets WHERE status = 'active') as active_markets,
                
                -- إحصائيات السائقين
                (SELECT COUNT(*) FROM drivers) as total_drivers_count,
                (SELECT COUNT(*) FROM drivers WHERE status = 'available') as available_drivers,
                (SELECT COUNT(*) FROM drivers WHERE status = 'busy') as busy_drivers,
                
                -- إحصائيات المعاملات
                (SELECT COUNT(*) FROM transactions) as total_transactions,
                (SELECT SUM(amount) FROM transactions WHERE type = 'deposit' AND status = 'completed') as total_deposits,
                (SELECT SUM(amount) FROM transactions WHERE type = 'withdrawal' AND status = 'completed') as total_withdrawals
        `);
        
        res.json({
            success: true,
            data: stats[0]
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب إحصائيات النظام:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب إحصائيات النظام'
        });
    }
});

// مسار جلب تقرير المبيعات
router.get('/reports/sales', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { start_date, end_date, group_by = 'day' } = req.query;
        
        let dateFormat;
        switch (group_by) {
            case 'hour':
                dateFormat = '%Y-%m-%d %H:00';
                break;
            case 'day':
                dateFormat = '%Y-%m-%d';
                break;
            case 'week':
                dateFormat = '%Y-%W';
                break;
            case 'month':
                dateFormat = '%Y-%m';
                break;
            default:
                dateFormat = '%Y-%m-%d';
        }
        
        const defaultStartDate = new Date();
        defaultStartDate.setDate(defaultStartDate.getDate() - 30);
        
        const reports = await database.all(`
            SELECT 
                strftime(?, o.created_at) as period,
                COUNT(*) as order_count,
                SUM(o.total) as total_sales,
                AVG(o.total) as avg_order_value,
                COUNT(DISTINCT o.buyer_id) as unique_customers,
                COUNT(DISTINCT oi.seller_id) as unique_sellers
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            WHERE o.created_at BETWEEN ? AND ?
            GROUP BY period
            ORDER BY period DESC
        `, [
            dateFormat,
            start_date || defaultStartDate.toISOString().split('T')[0],
            end_date || new Date().toISOString().split('T')[0]
        ]);
        
        // حساب الإجماليات
        const totals = await database.get(`
            SELECT 
                COUNT(*) as total_orders,
                SUM(o.total) as total_sales,
                AVG(o.total) as overall_avg_value,
                COUNT(DISTINCT o.buyer_id) as total_customers
            FROM orders o
            WHERE o.created_at BETWEEN ? AND ?
        `, [
            start_date || defaultStartDate.toISOString().split('T')[0],
            end_date || new Date().toISOString().split('T')[0]
        ]);
        
        res.json({
            success: true,
            data: {
                reports,
                totals: totals || {}
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب تقرير المبيعات:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب تقرير المبيعات'
        });
    }
});

// مسار تصدير تقرير المبيعات إلى Excel
router.get('/reports/sales/export', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        const defaultStartDate = new Date();
        defaultStartDate.setDate(defaultStartDate.getDate() - 30);
        
        const reports = await database.all(`
            SELECT 
                DATE(o.created_at) as date,
                o.order_code,
                u.name as buyer_name,
                u.phone as buyer_phone,
                o.total,
                o.status,
                o.payment_method,
                COUNT(oi.id) as item_count
            FROM orders o
            LEFT JOIN users u ON o.buyer_id = u.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            WHERE o.created_at BETWEEN ? AND ?
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `, [
            start_date || defaultStartDate.toISOString().split('T')[0],
            end_date || new Date().toISOString().split('T')[0]
        ]);
        
        // إنشاء ملف Excel
        const ws = xlsx.utils.json_to_sheet(reports);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, 'تقرير المبيعات');
        
        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        const filename = `sales_report_${moment().format('YYYY-MM-DD')}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
        
    } catch (error) {
        console.error('❌ خطأ في تصدير تقرير المبيعات:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في تصدير تقرير المبيعات'
        });
    }
});

// مسار جلب تقرير المنتجات
router.get('/reports/products', requireAuth, requireAdmin, async (req, res) => {
    try {
        const productReport = await database.all(`
            SELECT 
                p.name,
                p.category,
                u.name as seller_name,
                s.store_name,
                m.name as market_name,
                p.price,
                p.quantity,
                p.status,
                COUNT(oi.id) as units_sold,
                SUM(oi.total_price) as revenue,
                AVG(r.rating) as avg_rating,
                COUNT(r.id) as review_count
            FROM products p
            LEFT JOIN users u ON p.seller_id = u.id
            LEFT JOIN sellers s ON p.seller_id = s.user_id
            LEFT JOIN markets m ON p.market_id = m.id
            LEFT JOIN order_items oi ON p.id = oi.product_id
            LEFT JOIN reviews r ON p.id = r.product_id
            GROUP BY p.id
            ORDER BY revenue DESC
        `);
        
        res.json({
            success: true,
            data: productReport
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب تقرير المنتجات:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب تقرير المنتجات'
        });
    }
});

// مسار جلب تقرير المستخدمين
router.get('/reports/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { role, start_date, end_date } = req.query;
        
        let whereClause = '';
        const params = [];
        
        if (role) {
            whereClause += ' WHERE u.role = ?';
            params.push(role);
        }
        
        if (start_date && end_date) {
            whereClause += whereClause ? ' AND ' : ' WHERE ';
            whereClause += 'u.created_at BETWEEN ? AND ?';
            params.push(start_date, end_date);
        }
        
        const userReport = await database.all(`
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                u.role,
                u.status,
                u.created_at,
                u.last_login,
                w.balance,
                
                CASE u.role 
                    WHEN 'seller' THEN (SELECT store_name FROM sellers WHERE user_id = u.id)
                    WHEN 'driver' THEN (SELECT vehicle_type FROM drivers WHERE user_id = u.id)
                    ELSE NULL 
                END as additional_info,
                
                CASE u.role 
                    WHEN 'buyer' THEN (SELECT COUNT(*) FROM orders WHERE buyer_id = u.id)
                    WHEN 'seller' THEN (SELECT COUNT(*) FROM products WHERE seller_id = u.id)
                    WHEN 'driver' THEN (SELECT COUNT(*) FROM orders WHERE driver_id = d.id)
                    ELSE 0 
                END as activity_count
                
            FROM users u
            LEFT JOIN wallets w ON u.id = w.user_id
            LEFT JOIN drivers d ON u.id = d.user_id
            ${whereClause}
            ORDER BY u.created_at DESC
        `, params);
        
        res.json({
            success: true,
            data: userReport
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب تقرير المستخدمين:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب تقرير المستخدمين'
        });
    }
});

// مسار إدارة المعاملات المالية
router.get('/transactions', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { 
            type, 
            status, 
            user_id, 
            start_date, 
            end_date, 
            page = 1, 
            limit = 50 
        } = req.query;
        
        let whereClause = 'WHERE 1=1';
        const params = [];
        
        if (type) {
            whereClause += ' AND t.type = ?';
            params.push(type);
        }
        
        if (status) {
            whereClause += ' AND t.status = ?';
            params.push(status);
        }
        
        if (user_id) {
            whereClause += ' AND t.user_id = ?';
            params.push(user_id);
        }
        
        if (start_date && end_date) {
            whereClause += ' AND t.created_at BETWEEN ? AND ?';
            params.push(start_date, end_date);
        }
        
        const offset = (page - 1) * limit;
        
        const transactions = await database.all(`
            SELECT 
                t.*,
                u.name as user_name,
                u.email as user_email,
                u.phone as user_phone
            FROM transactions t
            LEFT JOIN users u ON t.user_id = u.id
            ${whereClause}
            ORDER BY t.created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);
        
        const countResult = await database.get(`
            SELECT COUNT(*) as total 
            FROM transactions t
            ${whereClause}
        `, params);
        
        const total = countResult ? countResult.total : 0;
        
        res.json({
            success: true,
            data: transactions,
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب المعاملات:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب المعاملات'
        });
    }
});

// مسار تحديث حالة معاملة
router.put('/transactions/:id/status', requireAuth, requireAdmin, [
    body('status')
        .isIn(['pending', 'completed', 'failed', 'cancelled'])
        .withMessage('حالة غير صحيحة'),
    
    body('notes')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('الملاحظات يجب ألا تتجاوز 500 حرف')
], validateRequest, async (req, res) => {
    try {
        const transactionId = req.params.id;
        const { status, notes } = req.body;
        
        // جلب المعاملة
        const transaction = await database.get(
            'SELECT * FROM transactions WHERE id = ?',
            [transactionId]
        );
        
        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: 'المعاملة غير موجودة'
            });
        }
        
        // إذا كانت المعاملة إيداع وتم الموافقة عليها
        if (transaction.type === 'deposit' && status === 'completed' && transaction.status !== 'completed') {
            await database.run('BEGIN TRANSACTION');
            
            try {
                // تحديث حالة المعاملة
                await database.run(
                    'UPDATE transactions SET status = ?, updated_at = datetime("now"), notes = ? WHERE id = ?',
                    [status, notes || transaction.notes, transactionId]
                );
                
                // إضافة الرصيد للمستخدم
                await database.run(
                    'UPDATE wallets SET balance = balance + ? WHERE user_id = ?',
                    [transaction.amount, transaction.user_id]
                );
                
                await database.run('COMMIT');
                
            } catch (error) {
                await database.run('ROLLBACK');
                throw error;
            }
        } else {
            // تحديث الحالة فقط
            await database.run(
                'UPDATE transactions SET status = ?, updated_at = datetime("now"), notes = ? WHERE id = ?',
                [status, notes || transaction.notes, transactionId]
            );
        }
        
        // جلب المعاملة المحدثة
        const updatedTransaction = await database.get(
            'SELECT * FROM transactions WHERE id = ?',
            [transactionId]
        );
        
        res.json({
            success: true,
            message: 'تم تحديث حالة المعاملة بنجاح',
            data: updatedTransaction
        });
        
    } catch (error) {
        console.error('❌ خطأ في تحديث حالة المعاملة:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في تحديث حالة المعاملة'
        });
    }
});

// مسار إدارة الطلبات
router.get('/orders', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { 
            status, 
            payment_method, 
            start_date, 
            end_date, 
            page = 1, 
            limit = 50 
        } = req.query;
        
        let whereClause = 'WHERE 1=1';
        const params = [];
        
        if (status) {
            whereClause += ' AND o.status = ?';
            params.push(status);
        }
        
        if (payment_method) {
            whereClause += ' AND o.payment_method = ?';
            params.push(payment_method);
        }
        
        if (start_date && end_date) {
            whereClause += ' AND o.created_at BETWEEN ? AND ?';
            params.push(start_date, end_date);
        }
        
        const offset = (page - 1) * limit;
        
        const orders = await database.all(`
            SELECT 
                o.*,
                u.name as buyer_name,
                u.phone as buyer_phone,
                d.user_id as driver_user_id,
                du.name as driver_name,
                COUNT(oi.id) as item_count,
                SUM(oi.total_price) as items_total
            FROM orders o
            LEFT JOIN users u ON o.buyer_id = u.id
            LEFT JOIN drivers d ON o.driver_id = d.id
            LEFT JOIN users du ON d.user_id = du.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            ${whereClause}
            GROUP BY o.id
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);
        
        const countResult = await database.get(`
            SELECT COUNT(*) as total 
            FROM orders o
            ${whereClause}
        `, params);
        
        const total = countResult ? countResult.total : 0;
        
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

// مسار تحديث حالة الطلب
router.put('/orders/:id/status', requireAuth, requireAdmin, [
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
        const { status, notes } = req.body;
        
        // تحديث حالة الطلب
        await database.run(
            'UPDATE orders SET status = ?, updated_at = datetime("now"), notes = ? WHERE id = ?',
            [status, notes || '', orderId]
        );
        
        const updatedOrder = await database.get(
            'SELECT * FROM orders WHERE id = ?',
            [orderId]
        );
        
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
router.post('/orders/:id/assign-driver', requireAuth, requireAdmin, [
    body('driver_id')
        .isInt()
        .withMessage('معرف السائق غير صحيح')
], validateRequest, async (req, res) => {
    try {
        const orderId = req.params.id;
        const { driver_id } = req.body;
        
        // التحقق من وجود الطلب
        const order = await database.get(
            'SELECT * FROM orders WHERE id = ?',
            [orderId]
        );
        
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'الطلب غير موجود'
            });
        }
        
        // التحقق من وجود السائق
        const driver = await database.get(`
            SELECT d.*, u.name FROM drivers d
            LEFT JOIN users u ON d.user_id = u.id
            WHERE d.id = ?
        `, [driver_id]);
        
        if (!driver) {
            return res.status(404).json({
                success: false,
                error: 'السائق غير موجود'
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

// مسار حذف مستخدم
router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        
        // التحقق من وجود المستخدم
        const user = await database.get(
            'SELECT * FROM users WHERE id = ?',
            [userId]
        );
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'المستخدم غير موجود'
            });
        }
        
        // حذف المستخدم
        await database.run('DELETE FROM users WHERE id = ?', [userId]);
        
        res.json({
            success: true,
            message: 'تم حذف المستخدم بنجاح'
        });
        
    } catch (error) {
        console.error('❌ خطأ في حذف المستخدم:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في حذف المستخدم'
        });
    }
});

// مسار حذف منتج
router.delete('/products/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const productId = req.params.id;
        
        // التحقق من وجود المنتج
        const product = await database.get(
            'SELECT * FROM products WHERE id = ?',
            [productId]
        );
        
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'المنتج غير موجود'
            });
        }
        
        // حذف المنتج
        await database.run('DELETE FROM products WHERE id = ?', [productId]);
        
        res.json({
            success: true,
            message: 'تم حذف المنتج بنجاح'
        });
        
    } catch (error) {
        console.error('❌ خطأ في حذف المنتج:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في حذف المنتج'
        });
    }
});

// مسار نسخ احتياطي لقاعدة البيانات
router.get('/backup/database', requireAuth, requireAdmin, async (req, res) => {
    try {
        const backupDir = 'backups';
        const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
        const backupFile = `${backupDir}/backup_${timestamp}.sqlite`;
        
        // إنشاء نسخة احتياطية
        const fs = require('fs').promises;
        await fs.copyFile('data/database.sqlite', backupFile);
        
        // الحصول على قائمة النسخ الاحتياطية
        const backups = await fs.readdir(backupDir);
        const backupList = backups
            .filter(file => file.endsWith('.sqlite'))
            .map(file => ({
                filename: file,
                path: `${backupDir}/${file}`,
                size: fs.statSync(`${backupDir}/${file}`).size
            }))
            .sort((a, b) => b.filename.localeCompare(a.filename));
        
        res.json({
            success: true,
            message: 'تم إنشاء نسخة احتياطية بنجاح',
            data: {
                backup_file: backupFile,
                backup_list: backupList
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في نسخ قاعدة البيانات:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في نسخ قاعدة البيانات'
        });
    }
});

// مسار استعادة نسخة احتياطية
router.post('/restore/database', requireAuth, requireAdmin, [
    body('backup_file')
        .trim()
        .notEmpty()
        .withMessage('اسم ملف النسخة الاحتياطية مطلوب')
], validateRequest, async (req, res) => {
    try {
        const { backup_file } = req.body;
        
        // التحقق من وجود ملف النسخة الاحتياطية
        const fs = require('fs').promises;
        try {
            await fs.access(backup_file);
        } catch {
            return res.status(404).json({
                success: false,
                error: 'ملف النسخة الاحتياطية غير موجود'
            });
        }
        
        // إنشاء نسخة احتياطية من قاعدة البيانات الحالية
        const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
        const currentBackup = `backups/before_restore_${timestamp}.sqlite`;
        await fs.copyFile('data/database.sqlite', currentBackup);
        
        // استعادة النسخة الاحتياطية
        await fs.copyFile(backup_file, 'data/database.sqlite');
        
        res.json({
            success: true,
            message: 'تم استعادة قاعدة البيانات بنجاح',
            data: {
                restored_file: backup_file,
                current_backup: currentBackup
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في استعادة قاعدة البيانات:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في استعادة قاعدة البيانات'
        });
    }
});

// مسار توليد تقرير PDF
router.get('/reports/pdf', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { report_type, start_date, end_date } = req.query;
        
        // جلب البيانات حسب نوع التقرير
        let data = [];
        let title = '';
        
        switch (report_type) {
            case 'sales':
                title = 'تقرير المبيعات';
                data = await database.all(`
                    SELECT 
                        DATE(o.created_at) as date,
                        COUNT(*) as order_count,
                        SUM(o.total) as total_sales,
                        AVG(o.total) as avg_order_value
                    FROM orders o
                    WHERE o.created_at BETWEEN ? AND ?
                    GROUP BY DATE(o.created_at)
                    ORDER BY date DESC
                `, [start_date || '2023-01-01', end_date || new Date().toISOString().split('T')[0]]);
                break;
                
            case 'products':
                title = 'تقرير المنتجات';
                data = await database.all(`
                    SELECT 
                        p.name,
                        p.category,
                        COUNT(oi.product_id) as units_sold,
                        SUM(oi.total_price) as revenue
                    FROM products p
                    LEFT JOIN order_items oi ON p.id = oi.product_id
                    GROUP BY p.id
                    ORDER BY revenue DESC
                    LIMIT 20
                `);
                break;
                
            case 'users':
                title = 'تقرير المستخدمين';
                data = await database.all(`
                    SELECT 
                        role,
                        COUNT(*) as count,
                        DATE(MIN(created_at)) as first_registration,
                        DATE(MAX(created_at)) as last_registration
                    FROM users
                    GROUP BY role
                    ORDER BY count DESC
                `);
                break;
                
            default:
                return res.status(400).json({
                    success: false,
                    error: 'نوع التقرير غير صحيح'
                });
        }
        
        // إنشاء PDF
        const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'portrait' });
        
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            const pdfData = Buffer.concat(buffers);
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${title}_${moment().format('YYYY-MM-DD')}.pdf"`);
            res.send(pdfData);
        });
        
        // إضافة المحتوى إلى PDF
        doc.font('Helvetica-Bold')
           .fontSize(20)
           .text(title, { align: 'center' });
        
        doc.moveDown();
        doc.fontSize(12);
        doc.text(`تاريخ التقرير: ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
        doc.text(`الفترة: ${start_date || 'بداية'} - ${end_date || 'نهاية'}`);
        
        doc.moveDown();
        
        if (data.length > 0) {
            doc.font('Helvetica-Bold').text('البيانات:', { underline: true });
            doc.moveDown();
            
            data.forEach((item, index) => {
                doc.font('Helvetica').text(`${index + 1}. ${JSON.stringify(item, null, 2)}`);
                doc.moveDown(0.5);
            });
        } else {
            doc.text('لا توجد بيانات في الفترة المحددة');
        }
        
        doc.end();
        
    } catch (error) {
        console.error('❌ خطأ في توليد تقرير PDF:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في توليد تقرير PDF'
        });
    }
});

module.exports = router;
