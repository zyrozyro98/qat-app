const express = require('express');
const router = express.Router();
const logger = require('../config/logger');

module.exports = (db) => {
    router.get('/', async (req, res) => {
        try {
            const markets = await db.allQuery(
                `SELECT m.*, 
                        COUNT(DISTINCT p.id) as product_count,
                        COUNT(DISTINCT s.id) as seller_count,
                        COUNT(DISTINCT d.id) as driver_count
                 FROM markets m
                 LEFT JOIN products p ON m.id = p.market_id AND p.status = 'active'
                 LEFT JOIN sellers s ON p.seller_id = s.user_id
                 LEFT JOIN drivers d ON m.id = d.market_id AND d.status = 'available'
                 WHERE m.status = 'active'
                 GROUP BY m.id
                 ORDER BY m.name`,
                []
            );
            
            res.json({
                success: true,
                data: markets,
                meta: {
                    count: markets.length,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب الأسواق: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    return router;
};

// Middleware
const { validateRequest } = require('../middleware/validator');
const { requireAuth, requireAdmin } = require('../config/middleware');

// Models
const { MarketModel } = require('../database/models');
const database = require('../config/database');

// تهيئة الموديل
const marketModel = new MarketModel(database);

// مسار جلب جميع الأسواق
router.get('/', async (req, res) => {
    try {
        const { status = 'active' } = req.query;
        
        let markets;
        if (status === 'all') {
            markets = await marketModel.findAll({}, {
                orderBy: 'name',
                order: 'ASC'
            });
        } else {
            markets = await marketModel.getActiveMarkets();
        }
        
        res.json({
            success: true,
            data: markets
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب الأسواق:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب الأسواق'
        });
    }
});

// مسار جلب سوق معين
router.get('/:id', async (req, res) => {
    try {
        const marketId = req.params.id;
        
        const market = await marketModel.getMarketStats(marketId);
        if (!market) {
            return res.status(404).json({
                success: false,
                error: 'السوق غير موجود'
            });
        }
        
        // جلب المنتجات الرائجة في هذا السوق
        const topProducts = await database.all(`
            SELECT p.*, u.name as seller_name, s.store_name,
                   (SELECT COUNT(*) FROM order_items oi WHERE oi.product_id = p.id) as order_count
            FROM products p
            LEFT JOIN users u ON p.seller_id = u.id
            LEFT JOIN sellers s ON p.seller_id = s.user_id
            WHERE p.market_id = ? AND p.status = 'active'
            ORDER BY order_count DESC
            LIMIT 10
        `, [marketId]);
        
        // جلب محطات الغسيل
        const washStations = await database.all(`
            SELECT * FROM wash_stations 
            WHERE market_id = ? AND status = 'active'
            ORDER BY name
        `, [marketId]);
        
        // جلب السائقين المتاحين
        const availableDrivers = await database.all(`
            SELECT d.*, u.name, u.phone, u.avatar
            FROM drivers d
            LEFT JOIN users u ON d.user_id = u.id
            WHERE d.market_id = ? AND d.status = 'available'
            ORDER BY d.rating DESC
            LIMIT 10
        `, [marketId]);
        
        res.json({
            success: true,
            data: {
                ...market,
                top_products: topProducts,
                wash_stations: washStations,
                available_drivers: availableDrivers
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب تفاصيل السوق:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب تفاصيل السوق'
        });
    }
});

// مسار إضافة سوق جديد (للمسؤول فقط)
router.post('/', requireAuth, requireAdmin, [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('اسم السوق مطلوب')
        .isLength({ min: 3, max: 100 })
        .withMessage('اسم السوق يجب أن يكون بين 3 و 100 حرف'),
    
    body('description')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('الوصف يجب ألا يتجاوز 1000 حرف'),
    
    body('location')
        .trim()
        .notEmpty()
        .withMessage('موقع السوق مطلوب')
        .isLength({ min: 10, max: 200 })
        .withMessage('الموقع يجب أن يكون بين 10 و 200 حرف')
], validateRequest, async (req, res) => {
    try {
        const { name, description, location } = req.body;
        
        const marketData = {
            name,
            description: description || '',
            location,
            status: 'active'
        };
        
        const market = await marketModel.create(marketData);
        
        res.status(201).json({
            success: true,
            message: 'تم إضافة السوق بنجاح',
            data: market
        });
        
    } catch (error) {
        console.error('❌ خطأ في إضافة السوق:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في إضافة السوق'
        });
    }
});

// مسار تحديث السوق (للمسؤول فقط)
router.put('/:id', requireAuth, requireAdmin, [
    body('name')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('اسم السوق لا يمكن أن يكون فارغاً')
        .isLength({ min: 3, max: 100 })
        .withMessage('اسم السوق يجب أن يكون بين 3 و 100 حرف'),
    
    body('description')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('الوصف يجب ألا يتجاوز 1000 حرف'),
    
    body('location')
        .optional()
        .trim()
        .isLength({ min: 10, max: 200 })
        .withMessage('الموقع يجب أن يكون بين 10 و 200 حرف'),
    
    body('status')
        .optional()
        .isIn(['active', 'inactive'])
        .withMessage('حالة غير صحيحة')
], validateRequest, async (req, res) => {
    try {
        const marketId = req.params.id;
        const updateData = req.body;
        
        const market = await marketModel.findById(marketId);
        if (!market) {
            return res.status(404).json({
                success: false,
                error: 'السوق غير موجود'
            });
        }
        
        const updatedMarket = await marketModel.update(marketId, updateData);
        
        res.json({
            success: true,
            message: 'تم تحديث السوق بنجاح',
            data: updatedMarket
        });
        
    } catch (error) {
        console.error('❌ خطأ في تحديث السوق:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في تحديث السوق'
        });
    }
});

// مسار إضافة محطة غسيل (للمسؤول فقط)
router.post('/:id/wash-stations', requireAuth, requireAdmin, [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('اسم المحطة مطلوب')
        .isLength({ min: 3, max: 100 })
        .withMessage('اسم المحطة يجب أن يكون بين 3 و 100 حرف'),
    
    body('location')
        .optional()
        .trim()
        .isLength({ max: 200 })
        .withMessage('الموقع يجب ألا يتجاوز 200 حرف')
], validateRequest, async (req, res) => {
    try {
        const marketId = req.params.id;
        const { name, location } = req.body;
        
        // التحقق من وجود السوق
        const market = await marketModel.findById(marketId);
        if (!market) {
            return res.status(404).json({
                success: false,
                error: 'السوق غير موجود'
            });
        }
        
        // إضافة محطة الغسيل
        await database.run(
            `INSERT INTO wash_stations (market_id, name, location, status, created_at)
             VALUES (?, ?, ?, 'active', datetime('now'))`,
            [marketId, name, location || '']
        );
        
        res.status(201).json({
            success: true,
            message: 'تم إضافة محطة الغسيل بنجاح'
        });
        
    } catch (error) {
        console.error('❌ خطأ في إضافة محطة غسيل:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في إضافة محطة غسيل'
        });
    }
});

// مسار جلب إحصائيات السوق
router.get('/:id/stats', requireAuth, requireAdmin, async (req, res) => {
    try {
        const marketId = req.params.id;
        
        const stats = await database.all(`
            SELECT 
                -- إحصائيات المنتجات
                (SELECT COUNT(*) FROM products WHERE market_id = ? AND status = 'active') as active_products,
                (SELECT COUNT(*) FROM products WHERE market_id = ? AND status = 'out_of_stock') as out_of_stock_products,
                (SELECT COUNT(*) FROM products WHERE market_id = ? AND status = 'inactive') as inactive_products,
                (SELECT COUNT(DISTINCT seller_id) FROM products WHERE market_id = ?) as total_sellers,
                
                -- إحصائيات المبيعات
                (SELECT COUNT(*) FROM orders o 
                 JOIN order_items oi ON o.id = oi.order_id 
                 JOIN products p ON oi.product_id = p.id 
                 WHERE p.market_id = ?) as total_orders,
                (SELECT SUM(o.total) FROM orders o 
                 JOIN order_items oi ON o.id = oi.order_id 
                 JOIN products p ON oi.product_id = p.id 
                 WHERE p.market_id = ?) as total_revenue,
                
                -- إحصائيات السائقين
                (SELECT COUNT(*) FROM drivers WHERE market_id = ? AND status = 'available') as available_drivers,
                (SELECT COUNT(*) FROM drivers WHERE market_id = ? AND status = 'busy') as busy_drivers,
                
                -- إحصائيات محطات الغسيل
                (SELECT COUNT(*) FROM wash_stations WHERE market_id = ? AND status = 'active') as active_wash_stations,
                (SELECT COUNT(*) FROM wash_orders wo 
                 JOIN wash_stations ws ON wo.wash_station_id = ws.id 
                 WHERE ws.market_id = ? AND DATE(wo.created_at) = DATE('now')) as today_wash_orders
        `, [
            marketId, marketId, marketId, marketId,
            marketId, marketId,
            marketId, marketId,
            marketId, marketId
        ]);
        
        res.json({
            success: true,
            data: stats[0]
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب إحصائيات السوق:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب إحصائيات السوق'
        });
    }
});

// مسار البحث عن أسواق قريبة
router.get('/search/nearby', async (req, res) => {
    try {
        const { lat, lng, radius = 10 } = req.query;
        
        if (!lat || !lng) {
            return res.status(400).json({
                success: false,
                error: 'إحداثيات الموقع مطلوبة'
            });
        }
        
        // في الإصدار الحالي، نعيد جميع الأسواق النشطة
        // في الإصدارات المستقبلية، يمكن إضافة حساب المسافات الحقيقي
        const markets = await marketModel.getActiveMarkets();
        
        // إضافة مسافة وهمية للتوضيح
        const marketsWithDistance = markets.map((market, index) => ({
            ...market,
            distance: (Math.random() * radius).toFixed(2), // مسافة وهمية
            estimated_time: Math.floor(Math.random() * 30) + 5 // وقت تقديري
        }));
        
        // ترتيب حسب المسافة
        marketsWithDistance.sort((a, b) => a.distance - b.distance);
        
        res.json({
            success: true,
            data: marketsWithDistance
        });
        
    } catch (error) {
        console.error('❌ خطأ في البحث عن أسواق قريبة:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في البحث عن أسواق قريبة'
        });
    }
});

// مسار جلب الأسواق الأكثر نشاطاً
router.get('/trending/markets', async (req, res) => {
    try {
        const trendingMarkets = await database.all(`
            SELECT m.*, 
                   COUNT(DISTINCT p.id) as product_count,
                   COUNT(DISTINCT oi.order_id) as order_count,
                   SUM(o.total) as total_revenue
            FROM markets m
            LEFT JOIN products p ON m.id = p.market_id AND p.status = 'active'
            LEFT JOIN order_items oi ON p.id = oi.product_id
            LEFT JOIN orders o ON oi.order_id = o.id
            WHERE m.status = 'active'
            GROUP BY m.id
            ORDER BY order_count DESC, product_count DESC
            LIMIT 5
        `);
        
        res.json({
            success: true,
            data: trendingMarkets
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب الأسواق الأكثر نشاطاً:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب الأسواق الأكثر نشاطاً'
        });
    }
});

module.exports = router;
