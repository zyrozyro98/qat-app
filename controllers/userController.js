const logger = require('../config/logger');

module.exports = (db) => {
    return {
        async getProfile(req, res) {
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
        },
        
        async updateProfile(req, res) {
            try {
                const { name, phone, avatar } = req.body;
                
                await db.runQuery(
                    'UPDATE users SET name = ?, phone = ?, avatar = ?, updated_at = ? WHERE id = ?',
                    [name, phone, avatar, new Date().toISOString(), req.session.userId]
                );
                
                res.json({
                    success: true,
                    message: 'تم تحديث الملف الشخصي بنجاح'
                });
            } catch (error) {
                logger.error(`❌ خطأ في تحديث الملف الشخصي: ${error.message}`);
                res.status(500).json({ success: false, error: 'خطأ في الخادم' });
            }
        }
    };
};
