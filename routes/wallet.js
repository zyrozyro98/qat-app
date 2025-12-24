const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const logger = require('../config/logger');
const helpers = require('../utils/helpers');

module.exports = (db) => {
    // جلب معلومات المحفظة
    router.get('/', requireAuth, async (req, res) => {
        try {
            const wallet = await db.getQuery(
                `SELECT w.*, u.name as user_name
                 FROM wallets w
                 LEFT JOIN users u ON w.user_id = u.id
                 WHERE w.user_id = ?`,
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
                        created_at: new Date().toISOString(),
                        transactions: []
                    }
                });
            } else {
                // جلب آخر 10 معاملات
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
                        ...wallet,
                        transactions
                    }
                });
            }
        } catch (error) {
            logger.error(`❌ خطأ في جلب المحفظة: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // شحن المحفظة
    router.post('/deposit', requireAuth, async (req, res) => {
        try {
            const { amount, method } = req.body;
            
            if (!amount || amount <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'المبلغ يجب أن يكون أكبر من صفر'
                });
            }
            
            if (!method || !['cash', 'bank_transfer', 'card'].includes(method)) {
                return res.status(400).json({
                    success: false,
                    error: 'طريقة الدفع غير صالحة'
                });
            }
            
            await db.runQuery('BEGIN TRANSACTION');
            
            try {
                // إنشاء معاملة
                const transactionId = helpers.generateTransactionId();
                
                await db.runQuery(
                    `INSERT INTO transactions (user_id, amount, type, method, transaction_id, status, created_at)
                     VALUES (?, ?, 'deposit', ?, ?, 'pending', ?)`,
                    [req.session.userId, amount, method, transactionId, new Date().toISOString()]
                );
                
                // في بيئة حقيقية، هنا ستقوم بالاتصال ببوابة الدفع
                // للتبسيط، سنفترض أن الدفع ناجح فوراً
                
                // تحديث حالة المعاملة إلى مكتمل
                await db.runQuery(
                    'UPDATE transactions SET status = "completed" WHERE transaction_id = ?',
                    [transactionId]
                );
                
                // تحديث رصيد المحفظة
                await db.runQuery(
                    'UPDATE wallets SET balance = balance + ? WHERE user_id = ?',
                    [amount, req.session.userId]
                );
                
                // إنشاء إشعار
                await db.runQuery(
                    `INSERT INTO notifications (user_id, title, message, type, created_at)
                     VALUES (?, ?, ?, 'success', ?)`,
                    [req.session.userId, 'شحن المحفظة', `تم شحن محفظتك بمبلغ ${helpers.formatCurrency(amount)}`, new Date().toISOString()]
                );
                
                await db.runQuery('COMMIT');
                
                res.json({
                    success: true,
                    message: 'تم شحن المحفظة بنجاح',
                    data: {
                        transaction_id: transactionId,
                        amount,
                        new_balance: await getWalletBalance(req.session.userId)
                    }
                });
                
            } catch (error) {
                await db.runQuery('ROLLBACK');
                throw error;
            }
            
        } catch (error) {
            logger.error(`❌ خطأ في شحن المحفظة: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // سحب من المحفظة
    router.post('/withdraw', requireAuth, async (req, res) => {
        try {
            const { amount, method, wallet_type } = req.body;
            
            if (!amount || amount <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'المبلغ يجب أن يكون أكبر من صفر'
                });
            }
            
            if (!method || !['bank_transfer', 'cash'].includes(method)) {
                return res.status(400).json({
                    success: false,
                    error: 'طريقة السحب غير صالحة'
                });
            }
            
            // التحقق من رصيد المحفظة
            const wallet = await db.getQuery(
                'SELECT balance FROM wallets WHERE user_id = ?',
                [req.session.userId]
            );
            
            if (!wallet || wallet.balance < amount) {
                return res.status(400).json({
                    success: false,
                    error: 'رصيد المحفظة غير كافي'
                });
            }
            
            await db.runQuery('BEGIN TRANSACTION');
            
            try {
                // إنشاء معاملة
                const transactionId = helpers.generateTransactionId();
                
                await db.runQuery(
                    `INSERT INTO transactions (user_id, amount, type, method, wallet_type, transaction_id, status, created_at)
                     VALUES (?, ?, 'withdrawal', ?, ?, ?, 'pending', ?)`,
                    [req.session.userId, amount, method, wallet_type || '', transactionId, new Date().toISOString()]
                );
                
                // خصم المبلغ من المحفظة
                await db.runQuery(
                    'UPDATE wallets SET balance = balance - ? WHERE user_id = ?',
                    [amount, req.session.userId]
                );
                
                // تحديث حالة المعاملة إلى مكتمل
                await db.runQuery(
                    'UPDATE transactions SET status = "completed" WHERE transaction_id = ?',
                    [transactionId]
                );
                
                // إنشاء إشعار
                await db.runQuery(
                    `INSERT INTO notifications (user_id, title, message, type, created_at)
                     VALUES (?, ?, ?, 'success', ?)`,
                    [req.session.userId, 'سحب من المحفظة', `تم سحب مبلغ ${helpers.formatCurrency(amount)} من محفظتك`, new Date().toISOString()]
                );
                
                await db.runQuery('COMMIT');
                
                res.json({
                    success: true,
                    message: 'تم السحب من المحفظة بنجاح',
                    data: {
                        transaction_id: transactionId,
                        amount,
                        new_balance: await getWalletBalance(req.session.userId)
                    }
                });
                
            } catch (error) {
                await db.runQuery('ROLLBACK');
                throw error;
            }
            
        } catch (error) {
            logger.error(`❌ خطأ في السحب من المحفظة: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // جلب سجل المعاملات
    router.get('/transactions', requireAuth, async (req, res) => {
        try {
            const { type, page = 1, limit = 20 } = req.query;
            
            let query = 'SELECT * FROM transactions WHERE user_id = ?';
            const params = [req.session.userId];
            
            if (type) {
                query += ' AND type = ?';
                params.push(type);
            }
            
            query += ' ORDER BY created_at DESC';
            
            const offset = (page - 1) * limit;
            query += ' LIMIT ? OFFSET ?';
            params.push(parseInt(limit), offset);
            
            const transactions = await db.allQuery(query, params);
            
            // حساب العدد الإجمالي
            const countQuery = `SELECT COUNT(*) as total FROM transactions WHERE user_id = ? ${type ? 'AND type = ?' : ''}`;
            const countParams = type ? [req.session.userId, type] : [req.session.userId];
            const countResult = await db.getQuery(countQuery, countParams);
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
            logger.error(`❌ خطأ في جلب سجل المعاملات: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // جلب إحصائيات المحفظة
    router.get('/stats', requireAuth, async (req, res) => {
        try {
            const stats = await db.allQuery(`
                SELECT 
                    type,
                    COUNT(*) as transaction_count,
                    SUM(amount) as total_amount,
                    MIN(created_at) as first_transaction,
                    MAX(created_at) as last_transaction
                FROM transactions 
                WHERE user_id = ? AND status = 'completed'
                GROUP BY type
            `, [req.session.userId]);
            
            // جلب الرصيد الحالي
            const wallet = await db.getQuery(
                'SELECT balance FROM wallets WHERE user_id = ?',
                [req.session.userId]
            );
            
            res.json({
                success: true,
                data: {
                    stats,
                    current_balance: wallet ? wallet.balance : 0
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب إحصائيات المحفظة: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // دالة مساعدة للحصول على رصيد المحفظة
    async function getWalletBalance(userId) {
        const wallet = await db.getQuery(
            'SELECT balance FROM wallets WHERE user_id = ?',
            [userId]
        );
        return wallet ? wallet.balance : 0;
    }
    
    // نقل أموال بين المستخدمين
    router.post('/transfer', requireAuth, async (req, res) => {
        try {
            const { to_user_id, amount, note } = req.body;
            
            if (!to_user_id || !amount || amount <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'المستخدم الهدف والمبلغ مطلوبان'
                });
            }
            
            if (to_user_id === req.session.userId) {
                return res.status(400).json({
                    success: false,
                    error: 'لا يمكن التحويل لنفسك'
                });
            }
            
            // التحقق من وجود المستخدم الهدف
            const targetUser = await db.getQuery(
                'SELECT id, name FROM users WHERE id = ? AND status = "active"',
                [to_user_id]
            );
            
            if (!targetUser) {
                return res.status(404).json({
                    success: false,
                    error: 'المستخدم الهدف غير موجود'
                });
            }
            
            // التحقق من رصيد المحفظة
            const wallet = await db.getQuery(
                'SELECT balance FROM wallets WHERE user_id = ?',
                [req.session.userId]
            );
            
            if (!wallet || wallet.balance < amount) {
                return res.status(400).json({
                    success: false,
                    error: 'رصيد المحفظة غير كافي'
                });
            }
            
            await db.runQuery('BEGIN TRANSACTION');
            
            try {
                // خصم من المرسل
                await db.runQuery(
                    'UPDATE wallets SET balance = balance - ? WHERE user_id = ?',
                    [amount, req.session.userId]
                );
                
                // إضافة للمستلم
                await db.runQuery(
                    'UPDATE wallets SET balance = balance + ? WHERE user_id = ?',
                    [amount, to_user_id]
                );
                
                // تسجيل معاملة للمرسل
                const transactionId1 = helpers.generateTransactionId();
                await db.runQuery(
                    `INSERT INTO transactions (user_id, amount, type, method, transaction_id, status, created_at)
                     VALUES (?, ?, 'withdrawal', 'transfer', ?, 'completed', ?)`,
                    [req.session.userId, amount, transactionId1, new Date().toISOString()]
                );
                
                // تسجيل معاملة للمستلم
                const transactionId2 = helpers.generateTransactionId();
                await db.runQuery(
                    `INSERT INTO transactions (user_id, amount, type, method, transaction_id, status, created_at)
                     VALUES (?, ?, 'deposit', 'transfer', ?, 'completed', ?)`,
                    [to_user_id, amount, transactionId2, new Date().toISOString()]
                );
                
                // إشعار للمرسل
                await db.runQuery(
                    `INSERT INTO notifications (user_id, title, message, type, created_at)
                     VALUES (?, ?, ?, 'info', ?)`,
                    [req.session.userId, 'تحويل أموال', `تم تحويل مبلغ ${helpers.formatCurrency(amount)} إلى ${targetUser.name}`, new Date().toISOString()]
                );
                
                // إشعار للمستلم
                const sender = await db.getQuery('SELECT name FROM users WHERE id = ?', [req.session.userId]);
                await db.runQuery(
                    `INSERT INTO notifications (user_id, title, message, type, created_at)
                     VALUES (?, ?, ?, 'success', ?)`,
                    [to_user_id, 'استلام أموال', `تم استلام مبلغ ${helpers.formatCurrency(amount)} من ${sender.name}`, new Date().toISOString()]
                );
                
                await db.runQuery('COMMIT');
                
                res.json({
                    success: true,
                    message: 'تم التحويل بنجاح',
                    data: {
                        amount,
                        to_user: targetUser.name,
                        new_balance: await getWalletBalance(req.session.userId)
                    }
                });
                
            } catch (error) {
                await db.runQuery('ROLLBACK');
                throw error;
            }
            
        } catch (error) {
            logger.error(`❌ خطأ في تحويل الأموال: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    return router;
};
