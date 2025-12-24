const express = require('express');
const router = express.Router();

// Database
const database = require('../config/database');

// مسار إحصائيات الصفحة الرئيسية
router.get('/stats/home', async (req, res) => {
    try {
        // جلب إحصائيات سريعة للصفحة الرئيسية
        const stats = await database.all(`
            SELECT 
                (SELECT COUNT(*) FROM users WHERE role = 'buyer' AND status = 'active') as total_buyers,
                (SELECT COUNT(*) FROM users WHERE role = 'seller' AND status = 'active') as total_sellers,
                (SELECT COUNT(*) FROM products WHERE status = 'active') as active_products,
                (SELECT COUNT(*) FROM orders WHERE DATE(created_at) = DATE('now')) as today_orders,
                (SELECT SUM(total) FROM orders WHERE DATE(created_at) = DATE('now')) as today_revenue,
                (SELECT COUNT(*) FROM markets WHERE status = 'active') as active_markets,
                (SELECT COUNT(*) FROM drivers WHERE status = 'available') as available_drivers
        `);
        
        res.json({
            success: true,
            data: stats[0] || {}
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب إحصائيات الصفحة الرئيسية:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ في جلب الإحصائيات'
        });
    }
});

// مسار المنتجات المميزة (مع الحل السليم)
router.get('/featured/products', async (req, res) => {
    try {
        const { limit = 8 } = req.query;
        
        // جلب المنتجات المميزة
        const featuredProducts = await database.all(`
            SELECT p.*, u.name as seller_name, s.store_name,
                   m.name as market_name,
                   (SELECT AVG(rating) FROM reviews WHERE product_id = p.id) as average_rating
            FROM products p
            LEFT JOIN users u ON p.seller_id = u.id
            LEFT JOIN sellers s ON p.seller_id = s.user_id
            LEFT JOIN markets m ON p.market_id = m.id
            WHERE p.status = 'active'
            ORDER BY p.created_at DESC
            LIMIT ?
        `, [parseInt(limit)]);
        
        res.json({
            success: true,
            data: featuredProducts
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب المنتجات المميزة:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ في جلب المنتجات المميزة'
        });
    }
});

// مسار الأسواق المميزة
router.get('/featured/markets', async (req, res) => {
    try {
        const { limit = 3 } = req.query;
        
        const featuredMarkets = await database.all(`
            SELECT m.*,
                   COUNT(DISTINCT p.id) as product_count,
                   COUNT(DISTINCT d.id) as driver_count
            FROM markets m
            LEFT JOIN products p ON m.id = p.market_id AND p.status = 'active'
            LEFT JOIN drivers d ON m.id = d.market_id AND d.status = 'available'
            WHERE m.status = 'active'
            GROUP BY m.id
            ORDER BY product_count DESC
            LIMIT ?
        `, [parseInt(limit)]);
        
        res.json({
            success: true,
            data: featuredMarkets
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب الأسواق المميزة:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ في جلب الأسواق المميزة'
        });
    }
});

// مسار أحدث الطلبات (للعرض العام)
router.get('/recent/orders', async (req, res) => {
    try {
        const { limit = 5 } = req.query;
        
        const recentOrders = await database.all(`
            SELECT o.*, u.name as buyer_name,
                   (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
            FROM orders o
            LEFT JOIN users u ON o.buyer_id = u.id
            WHERE o.status IN ('delivered', 'shipping')
            ORDER BY o.created_at DESC
            LIMIT ?
        `, [parseInt(limit)]);
        
        res.json({
            success: true,
            data: recentOrders
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب أحدث الطلبات:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ في جلب أحدث الطلبات'
        });
    }
});

// مسار فئات المنتجات الرئيسية
router.get('/categories/main', async (req, res) => {
    try {
        const mainCategories = await database.all(`
            SELECT category, 
                   COUNT(*) as product_count,
                   MIN(price) as min_price,
                   MAX(price) as max_price,
                   AVG(price) as avg_price
            FROM products
            WHERE status = 'active'
            GROUP BY category
            ORDER BY product_count DESC
            LIMIT 6
        `);
        
        res.json({
            success: true,
            data: mainCategories
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب الفئات الرئيسية:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ في جلب الفئات الرئيسية'
        });
    }
});

module.exports = router;
