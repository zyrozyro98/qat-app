const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');

// Middleware
const { validateRequest } = require('../middleware/validator');
const { requireAuth } = require('../config/middleware');

// Models
const { WalletModel, TransactionModel } = require('../database/models');
const database = require('../config/database');

// تهيئة الموديلات
const walletModel = new WalletModel(database);
const transactionModel = new TransactionModel(database);

// مسار جلب معلومات المحفظة
router.get('/', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        
        // جلب معلومات المحفظة
        let wallet = await walletModel.findByUser(userId);
        
        // إذا لم تكن المحفظة موجودة، نقوم بإنشائها
        if (!wallet) {
            wallet = await walletModel.create({
                user_id: userId,
                balance: 0
            });
        }
        
        // جلب آخر المعاملات
        const transactions = await transactionModel.findByUser(userId, {
            limit: 10,
            orderBy: 'created_at',
            order: 'DESC'
        });
        
        res.json({
            success: true,
            data: {
                wallet,
                recent_transactions: transactions
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب معلومات المحفظة:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب معلومات المحفظة'
        });
    }
});

// مسار شحن الرصيد
router.post('/topup', requireAuth, [
    body('amount')
        .isFloat({ min: 1000 })
        .withMessage('المبلغ يجب أن يكون 1000 ريال على الأقل'),
    
    body('method')
        .isIn(['manual', 'wallet'])
        .withMessage('طريقة الدفع غير صحيحة'),
    
    body('wallet_type')
        .optional()
        .isString()
        .withMessage('نوع المحفظة غير صحيح'),
    
    body('reference')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('رقم المرجع يجب ألا يتجاوز 100 حرف')
], validateRequest, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { amount, method, wallet_type, reference } = req.body;
        
        // إنشاء معاملة
        const transactionData = {
            user_id: userId,
            amount: parseFloat(amount),
            type: 'deposit',
            method: method,
            wallet_type: wallet_type || '',
            status: method === 'wallet' ? 'completed' : 'pending'
        };
        
        if (reference) {
            transactionData.reference = reference;
        }
        
        const transaction = await transactionModel.create(transactionData);
        
        // إذا كانت العملية فورية (محفظة إلكترونية)
        if (method === 'wallet') {
            // تحديث رصيد المحفظة
            await walletModel.updateBalance(userId, amount);
            
            // تحديث حالة المعاملة
            await transactionModel.updateStatus(transaction.id, 'completed');
            
            // جلب الرصيد الجديد
            const newBalance = await walletModel.getBalance(userId);
            
            res.json({
                success: true,
                message: 'تم شحن الرصيد بنجاح',
                data: {
                    transaction_id: transaction.transaction_id,
                    amount: amount,
                    new_balance: newBalance,
                    transaction: transaction
                }
            });
        } else {
            // عملية يدوية تحتاج موافقة
            res.json({
                success: true,
                message: 'تم تقديم طلب الشحن بنجاح. سيتم إضافة الرصيد بعد التحقق من التحويل.',
                data: {
                    transaction_id: transaction.transaction_id,
                    amount: amount,
                    instructions: {
                        transfer_to: '771831482',
                        name: 'يوسف محمد علي حمود زهير',
                        note: 'يرجى إرسال إيصال التحويل عبر الواتساب أو إرفاقه في التطبيق'
                    },
                    transaction: transaction
                }
            });
        }
        
    } catch (error) {
        console.error('❌ خطأ في شحن الرصيد:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في شحن الرصيد'
        });
    }
});

// مسار سحب الرصيد
router.post('/withdraw', requireAuth, [
    body('amount')
        .isFloat({ min: 1000 })
        .withMessage('المبلغ يجب أن يكون 1000 ريال على الأقل'),
    
    body('method')
        .isIn(['bank', 'wallet'])
        .withMessage('طريقة السحب غير صحيحة'),
    
    body('account_details')
        .trim()
        .notEmpty()
        .withMessage('تفاصيل الحساب مطلوبة')
        .isLength({ max: 500 })
        .withMessage('تفاصيل الحساب يجب ألا تتجاوز 500 حرف')
], validateRequest, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { amount, method, account_details } = req.body;
        
        // التحقق من الرصيد الكافي
        const currentBalance = await walletModel.getBalance(userId);
        if (currentBalance < amount) {
            return res.status(400).json({
                success: false,
                error: 'رصيد المحفظة غير كافي'
            });
        }
        
        // إنشاء معاملة سحب
        const transactionData = {
            user_id: userId,
            amount: -parseFloat(amount), // سالب لأنه سحب
            type: 'withdrawal',
            method: method,
            status: 'pending',
            notes: account_details
        };
        
        const transaction = await transactionModel.create(transactionData);
        
        // خصم المبلغ من المحفظة
        await walletModel.updateBalance(userId, -amount);
        
        res.json({
            success: true,
            message: 'تم تقديم طلب السحب بنجاح. سيتم تحويل المبلغ خلال 24-48 ساعة.',
            data: {
                transaction_id: transaction.transaction_id,
                amount: amount,
                new_balance: currentBalance - amount,
                transaction: transaction
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في سحب الرصيد:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في سحب الرصيد'
        });
    }
});

// مسار جلب سجل المعاملات
router.get('/transactions', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { 
            type, 
            status, 
            start_date, 
            end_date, 
            page = 1, 
            limit = 20 
        } = req.query;
        
        // بناء شروط البحث
        const conditions = { user_id: userId };
        if (type) conditions.type = type;
        if (status) conditions.status = status;
        
        let dateFilter = '';
        const params = [userId];
        
        if (start_date && end_date) {
            dateFilter = 'AND created_at BETWEEN ? AND ?';
            params.push(start_date, end_date);
        } else if (start_date) {
            dateFilter = 'AND created_at >= ?';
            params.push(start_date);
        } else if (end_date) {
            dateFilter = 'AND created_at <= ?';
            params.push(end_date);
        }
        
        // جلب المعاملات
        const offset = (page - 1) * limit;
        const transactions = await database.all(`
            SELECT * FROM transactions 
            WHERE user_id = ? ${dateFilter}
            ${type ? 'AND type = ?' : ''}
            ${status ? 'AND status = ?' : ''}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, ...(type ? [type] : []), ...(status ? [status] : []), limit, offset]);
        
        // جلب العدد الكلي
        const countResult = await database.get(`
            SELECT COUNT(*) as total FROM transactions 
            WHERE user_id = ? ${dateFilter}
            ${type ? 'AND type = ?' : ''}
            ${status ? 'AND status = ?' : ''}
        `, [...params, ...(type ? [type] : []), ...(status ? [status] : [])]);
        
        const total = countResult ? countResult.total : 0;
        
        // حساب الإجماليات
        const summary = await database.get(`
            SELECT 
                SUM(CASE WHEN type = 'deposit' AND status = 'completed' THEN amount ELSE 0 END) as total_deposits,
                SUM(CASE WHEN type = 'withdrawal' AND status = 'completed' THEN amount ELSE 0 END) as total_withdrawals,
                SUM(CASE WHEN type = 'purchase' AND status = 'completed' THEN amount ELSE 0 END) as total_purchases,
                SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as net_balance
            FROM transactions 
            WHERE user_id = ? ${dateFilter}
        `, [...params]);
        
        res.json({
            success: true,
            data: {
                transactions,
                summary: summary || {
                    total_deposits: 0,
                    total_withdrawals: 0,
                    total_purchases: 0,
                    net_balance: 0
                }
            },
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب سجل المعاملات:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب سجل المعاملات'
        });
    }
});

// مسار تحويل رصيد بين المستخدمين
router.post('/transfer', requireAuth, [
    body('recipient_id')
        .isInt()
        .withMessage('معرف المستلم غير صحيح'),
    
    body('amount')
        .isFloat({ min: 100 })
        .withMessage('المبلغ يجب أن يكون 100 ريال على الأقل'),
    
    body('notes')
        .optional()
        .trim()
        .isLength({ max: 200 })
        .withMessage('الملاحظات يجب ألا تتجاوز 200 حرف')
], validateRequest, async (req, res) => {
    try {
        const senderId = req.session.userId;
        const { recipient_id, amount, notes } = req.body;
        
        // التحقق من أن المرسل والمستلم ليسوا نفس الشخص
        if (senderId === recipient_id) {
            return res.status(400).json({
                success: false,
                error: 'لا يمكن تحويل الرصيد لنفسك'
            });
        }
        
        // التحقق من وجود المستلم
        const recipient = await database.get(
            'SELECT id, name FROM users WHERE id = ? AND status = "active"',
            [recipient_id]
        );
        
        if (!recipient) {
            return res.status(404).json({
                success: false,
                error: 'المستلم غير موجود أو غير نشط'
            });
        }
        
        // التحقق من رصيد المرسل
        const senderBalance = await walletModel.getBalance(senderId);
        if (senderBalance < amount) {
            return res.status(400).json({
                success: false,
                error: 'رصيد المحفظة غير كافي'
            });
        }
        
        // بدء معاملة قاعدة البيانات
        await database.run('BEGIN TRANSACTION');
        
        try {
            // خصم المبلغ من المرسل
            await walletModel.updateBalance(senderId, -amount);
            
            // إضافة المبلغ للمستلم
            await walletModel.updateBalance(recipient_id, amount);
            
            // تسجيل معاملة التحويل للمرسل
            await transactionModel.create({
                user_id: senderId,
                amount: -amount,
                type: 'withdrawal',
                method: 'transfer',
                status: 'completed',
                notes: `تحويل إلى ${recipient.name}: ${notes || 'بدون ملاحظات'}`
            });
            
            // تسجيل معاملة الاستلام للمستلم
            await transactionModel.create({
                user_id: recipient_id,
                amount: amount,
                type: 'deposit',
                method: 'transfer',
                status: 'completed',
                notes: `تحويل من المستخدم #${senderId}: ${notes || 'بدون ملاحظات'}`
            });
            
            await database.run('COMMIT');
            
            // جلب الرصيد الجديد
            const newBalance = await walletModel.getBalance(senderId);
            
            res.json({
                success: true,
                message: 'تم تحويل الرصيد بنجاح',
                data: {
                    recipient: {
                        id: recipient.id,
                        name: recipient.name
                    },
                    amount: amount,
                    new_balance: newBalance
                }
            });
            
        } catch (error) {
            await database.run('ROLLBACK');
            throw error;
        }
        
    } catch (error) {
        console.error('❌ خطأ في تحويل الرصيد:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في تحويل الرصيد'
        });
    }
});

// مسار التحقق من حالة معاملة
router.get('/transaction/:id', requireAuth, async (req, res) => {
    try {
        const transactionId = req.params.id;
        const userId = req.session.userId;
        
        const transaction = await database.get(`
            SELECT * FROM transactions 
            WHERE (id = ? OR transaction_id = ?) AND user_id = ?
        `, [transactionId, transactionId, userId]);
        
        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: 'المعاملة غير موجودة'
            });
        }
        
        res.json({
            success: true,
            data: transaction
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب تفاصيل المعاملة:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب تفاصيل المعاملة'
        });
    }
});

// مسار جلب إحصائيات المحفظة
router.get('/stats/overview', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { period = 'month' } = req.query;
        
        let dateFilter = '';
        switch (period) {
            case 'day':
                dateFilter = "AND DATE(created_at) = DATE('now')";
                break;
            case 'week':
                dateFilter = "AND created_at >= DATE('now', '-7 days')";
                break;
            case 'month':
                dateFilter = "AND created_at >= DATE('now', '-30 days')";
                break;
            case 'year':
                dateFilter = "AND created_at >= DATE('now', '-365 days')";
                break;
        }
        
        const stats = await database.all(`
            SELECT 
                -- الرصيد الحالي
                (SELECT balance FROM wallets WHERE user_id = ?) as current_balance,
                
                -- إحصائيات الفترة
                SUM(CASE WHEN type = 'deposit' AND status = 'completed' ${dateFilter} THEN amount ELSE 0 END) as period_deposits,
                SUM(CASE WHEN type = 'withdrawal' AND status = 'completed' ${dateFilter} THEN amount ELSE 0 END) as period_withdrawals,
                SUM(CASE WHEN type = 'purchase' AND status = 'completed' ${dateFilter} THEN amount ELSE 0 END) as period_purchases,
                
                -- عدد المعاملات
                COUNT(CASE WHEN type = 'deposit' ${dateFilter} THEN 1 END) as deposit_count,
                COUNT(CASE WHEN type = 'withdrawal' ${dateFilter} THEN 1 END) as withdrawal_count,
                COUNT(CASE WHEN type = 'purchase' ${dateFilter} THEN 1 END) as purchase_count,
                
                -- إحصائيات الحالة
                COUNT(CASE WHEN status = 'pending' ${dateFilter} THEN 1 END) as pending_count,
                COUNT(CASE WHEN status = 'completed' ${dateFilter} THEN 1 END) as completed_count,
                COUNT(CASE WHEN status = 'failed' ${dateFilter} THEN 1 END) as failed_count
            FROM transactions 
            WHERE user_id = ?
        `, [userId, userId]);
        
        res.json({
            success: true,
            data: stats[0] || {}
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب إحصائيات المحفظة:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب إحصائيات المحفظة'
        });
    }
});

// مسار إنشاء رمز تحويل فريد
router.get('/transfer-code', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        
        // إنشاء رمز تحويل فريد
        const transferCode = crypto.randomBytes(8).toString('hex').toUpperCase();
        
        // حفظ الرمز مع تاريخ انتهاء الصلاحية (24 ساعة)
        await database.run(
            `INSERT INTO transfer_codes (user_id, code, expires_at) 
             VALUES (?, ?, datetime('now', '+24 hours'))`,
            [userId, transferCode]
        );
        
        res.json({
            success: true,
            data: {
                transfer_code: transferCode,
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في إنشاء رمز التحويل:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في إنشاء رمز التحويل'
        });
    }
});

// مسار التحويل باستخدام الرمز
router.post('/transfer-by-code', requireAuth, [
    body('code')
        .trim()
        .notEmpty()
        .withMessage('رمز التحويل مطلوب')
        .isLength({ min: 16, max: 16 })
        .withMessage('رمز التحويل غير صحيح'),
    
    body('amount')
        .isFloat({ min: 100 })
        .withMessage('المبلغ يجب أن يكون 100 ريال على الأقل')
], validateRequest, async (req, res) => {
    try {
        const senderId = req.session.userId;
        const { code, amount } = req.body;
        
        // التحقق من صحة الرمز وتاريخ انتهاء الصلاحية
        const transferCode = await database.get(`
            SELECT tc.*, u.name as recipient_name 
            FROM transfer_codes tc
            JOIN users u ON tc.user_id = u.id
            WHERE tc.code = ? AND tc.expires_at > datetime('now') AND tc.used = 0
        `, [code]);
        
        if (!transferCode) {
            return res.status(400).json({
                success: false,
                error: 'رمز التحويل غير صالح أو منتهي الصلاحية'
            });
        }
        
        // التحقق من أن المرسل ليس المستلم
        if (senderId === transferCode.user_id) {
            return res.status(400).json({
                success: false,
                error: 'لا يمكن تحويل الرصيد لنفسك'
            });
        }
        
        // التحقق من رصيد المرسل
        const senderBalance = await walletModel.getBalance(senderId);
        if (senderBalance < amount) {
            return res.status(400).json({
                success: false,
                error: 'رصيد المحفظة غير كافي'
            });
        }
        
        // بدء معاملة قاعدة البيانات
        await database.run('BEGIN TRANSACTION');
        
        try {
            // خصم المبلغ من المرسل
            await walletModel.updateBalance(senderId, -amount);
            
            // إضافة المبلغ للمستلم
            await walletModel.updateBalance(transferCode.user_id, amount);
            
            // تسجيل معاملة التحويل للمرسل
            await transactionModel.create({
                user_id: senderId,
                amount: -amount,
                type: 'withdrawal',
                method: 'transfer_code',
                status: 'completed',
                notes: `تحويل باستخدام الرمز إلى ${transferCode.recipient_name}`
            });
            
            // تسجيل معاملة الاستلام للمستلم
            await transactionModel.create({
                user_id: transferCode.user_id,
                amount: amount,
                type: 'deposit',
                method: 'transfer_code',
                status: 'completed',
                notes: `تحويل باستخدام الرمز من المستخدم #${senderId}`
            });
            
            // تحديث حالة الرمز ليشير إلى أنه تم استخدامه
            await database.run(
                'UPDATE transfer_codes SET used = 1, used_at = datetime("now") WHERE id = ?',
                [transferCode.id]
            );
            
            await database.run('COMMIT');
            
            // جلب الرصيد الجديد
            const newBalance = await walletModel.getBalance(senderId);
            
            res.json({
                success: true,
                message: 'تم تحويل الرصيد بنجاح',
                data: {
                    recipient: {
                        id: transferCode.user_id,
                        name: transferCode.recipient_name
                    },
                    amount: amount,
                    new_balance: newBalance
                }
            });
            
        } catch (error) {
            await database.run('ROLLBACK');
            throw error;
        }
        
    } catch (error) {
        console.error('❌ خطأ في التحويل باستخدام الرمز:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في التحويل باستخدام الرمز'
        });
    }
});

module.exports = router;
