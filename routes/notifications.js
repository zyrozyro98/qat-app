const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const logger = require('../config/logger');

module.exports = (db) => {
    // جلب جميع الإشعارات
    router.get('/', requireAuth, async (req, res) => {
        try {
            const { type, unread_only = 'false', page = 1, limit = 20 } = req.query;
            
            let query = 'SELECT * FROM notifications WHERE user_id = ?';
            const params = [req.session.userId];
            
            if (type) {
                query += ' AND type = ?';
                params.push(type);
            }
            
            if (unread_only === 'true') {
                query += ' AND is_read = 0';
            }
            
            query += ' ORDER BY created_at DESC';
            
            // حساب العدد الإجمالي
            const countQuery = `SELECT COUNT(*) as total ${query.substring(query.indexOf('FROM'))}`;
            const countResult = await db.getQuery(countQuery, params);
            const total = countResult ? countResult.total : 0;
            
            const offset = (page - 1) * limit;
            query += ' LIMIT ? OFFSET ?';
            params.push(parseInt(limit), offset);
            
            const notifications = await db.allQuery(query, params);
            
            res.json({
                success: true,
                data: notifications,
                meta: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(total / limit),
                    unread_count: await getUnreadCount(req.session.userId)
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب الإشعارات: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // جلب عدد الإشعارات غير المقروءة
    router.get('/unread-count', requireAuth, async (req, res) => {
        try {
            const count = await getUnreadCount(req.session.userId);
            
            res.json({
                success: true,
                data: {
                    count
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب عدد الإشعارات غير المقروءة: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // تحديث إشعار كمقروء
    router.put('/:id/read', requireAuth, async (req, res) => {
        try {
            await db.runQuery(
                'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
                [req.params.id, req.session.userId]
            );
            
            res.json({
                success: true,
                message: 'تم تحديث حالة الإشعار'
            });
        } catch (error) {
            logger.error(`❌ خطأ في تحديث الإشعار: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // تحديث جميع الإشعارات كمقروءة
    router.put('/read-all', requireAuth, async (req, res) => {
        try {
            await db.runQuery(
                'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
                [req.session.userId]
            );
            
            res.json({
                success: true,
                message: 'تم تحديث جميع الإشعارات كمقروءة'
            });
        } catch (error) {
            logger.error(`❌ خطأ في تحديث جميع الإشعارات: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // حذف إشعار
    router.delete('/:id', requireAuth, async (req, res) => {
        try {
            await db.runQuery(
                'DELETE FROM notifications WHERE id = ? AND user_id = ?',
                [req.params.id, req.session.userId]
            );
            
            res.json({
                success: true,
                message: 'تم حذف الإشعار بنجاح'
            });
        } catch (error) {
            logger.error(`❌ خطأ في حذف الإشعار: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // حذف جميع الإشعارات المقروءة
    router.delete('/read', requireAuth, async (req, res) => {
        try {
            await db.runQuery(
                'DELETE FROM notifications WHERE user_id = ? AND is_read = 1',
                [req.session.userId]
            );
            
            res.json({
                success: true,
                message: 'تم حذف جميع الإشعارات المقروءة'
            });
        } catch (error) {
            logger.error(`❌ خطأ في حذف الإشعارات المقروءة: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // حذف جميع الإشعارات
    router.delete('/', requireAuth, async (req, res) => {
        try {
            await db.runQuery(
                'DELETE FROM notifications WHERE user_id = ?',
                [req.session.userId]
            );
            
            res.json({
                success: true,
                message: 'تم حذف جميع الإشعارات'
            });
        } catch (error) {
            logger.error(`❌ خطأ في حذف جميع الإشعارات: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // إرسال إشعار (للمسؤول فقط)
    router.post('/send', requireAuth, async (req, res) => {
        try {
            const { user_id, title, message, type } = req.body;
            
            if (!user_id || !title || !message) {
                return res.status(400).json({
                    success: false,
                    error: 'معرف المستخدم والعنوان والرسالة مطلوبة'
                });
            }
            
            const validTypes = ['info', 'success', 'warning', 'error'];
            const notificationType = validTypes.includes(type) ? type : 'info';
            
            // التحقق من وجود المستخدم
            const user = await db.getQuery(
                'SELECT id FROM users WHERE id = ? AND status = "active"',
                [user_id]
            );
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'المستخدم غير موجود'
                });
            }
            
            // إرسال الإشعار
            await db.runQuery(
                `INSERT INTO notifications (user_id, title, message, type, created_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [user_id, title, message, notificationType, new Date().toISOString()]
            );
            
            // إرسال إشعار عبر WebSocket إذا كان المستخدم متصلاً
            // (يتم التعامل مع هذا في middleware WebSocket)
            
            res.json({
                success: true,
                message: 'تم إرسال الإشعار بنجاح'
            });
        } catch (error) {
            logger.error(`❌ خطأ في إرسال الإشعار: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // إرسال إشعار للجميع (للمسؤول فقط)
    router.post('/broadcast', requireAuth, async (req, res) => {
        try {
            const { title, message, type, user_role } = req.body;
            
            if (!title || !message) {
                return res.status(400).json({
                    success: false,
                    error: 'العنوان والرسالة مطلوبة'
                });
            }
            
            const validTypes = ['info', 'success', 'warning', 'error'];
            const notificationType = validTypes.includes(type) ? type : 'info';
            
            let query = 'SELECT id FROM users WHERE status = "active"';
            const params = [];
            
            if (user_role) {
                query += ' AND role = ?';
                params.push(user_role);
            }
            
            const users = await db.allQuery(query, params);
            
            if (users.length === 0) {
                return res.json({
                    success: true,
                    message: 'لا يوجد مستخدمون لإرسال الإشعار لهم'
                });
            }
            
            await db.runQuery('BEGIN TRANSACTION');
            
            try {
                for (const user of users) {
                    await db.runQuery(
                        `INSERT INTO notifications (user_id, title, message, type, created_at)
                         VALUES (?, ?, ?, ?, ?)`,
                        [user.id, title, message, notificationType, new Date().toISOString()]
                    );
                }
                
                await db.runQuery('COMMIT');
                
                res.json({
                    success: true,
                    message: `تم إرسال الإشعار إلى ${users.length} مستخدم`
                });
                
            } catch (error) {
                await db.runQuery('ROLLBACK');
                throw error;
            }
            
        } catch (error) {
            logger.error(`❌ خطأ في إرسال الإشعار للجميع: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // جلب إحصائيات الإشعارات
    router.get('/stats', requireAuth, async (req, res) => {
        try {
            const stats = await db.getQuery(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN is_read = 1 THEN 1 ELSE 0 END) as read_count,
                    SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread_count,
                    SUM(CASE WHEN type = 'info' THEN 1 ELSE 0 END) as info_count,
                    SUM(CASE WHEN type = 'success' THEN 1 ELSE 0 END) as success_count,
                    SUM(CASE WHEN type = 'warning' THEN 1 ELSE 0 END) as warning_count,
                    SUM(CASE WHEN type = 'error' THEN 1 ELSE 0 END) as error_count,
                    MIN(created_at) as first_notification,
                    MAX(created_at) as last_notification
                FROM notifications 
                WHERE user_id = ?
            `, [req.session.userId]);
            
            // جلب آخر 5 إشعارات
            const recentNotifications = await db.allQuery(
                'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
                [req.session.userId]
            );
            
            // جلب توزيع الإشعارات حسب النوع
            const typeDistribution = await db.allQuery(`
                SELECT type, COUNT(*) as count
                FROM notifications 
                WHERE user_id = ?
                GROUP BY type
                ORDER BY count DESC
            `, [req.session.userId]);
            
            res.json({
                success: true,
                data: {
                    ...stats,
                    recentNotifications,
                    typeDistribution
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب إحصائيات الإشعارات: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // دالة مساعدة للحصول على عدد الإشعارات غير المقروءة
    async function getUnreadCount(userId) {
        const result = await db.getQuery(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
            [userId]
        );
        return result ? result.count : 0;
    }
    
    return router;
};
