const express = require('express');
const router = express.Router();
const logger = require('../config/logger');

module.exports = (db) => {
    // الصفحة الرئيسية - جلب الإحصائيات العامة
    router.get('/stats', async (req, res) => {
        try {
            const stats = await db.allQuery(`
                SELECT 
                    (SELECT COUNT(*) FROM markets WHERE status = 'active') as total_markets,
                    (SELECT COUNT(*) FROM products WHERE status = 'active') as total_products,
                    (SELECT COUNT(*) FROM drivers WHERE status = 'available') as available_drivers,
                    (SELECT COUNT(DISTINCT seller_id) FROM products WHERE status = 'active') as active_sellers
            `);
            
            // جلب المنتجات الأكثر مبيعاً
            const topProducts = await db.allQuery(`
                SELECT p.*, 
                       COUNT(oi.product_id) as sales_count,
                       u.name as seller_name,
                       s.store_name
                FROM products p
                LEFT JOIN order_items oi ON p.id = oi.product_id
                LEFT JOIN users u ON p.seller_id = u.id
                LEFT JOIN sellers s ON p.seller_id = s.user_id
                WHERE p.status = 'active'
                GROUP BY p.id
                ORDER BY sales_count DESC
                LIMIT 10
            `);
            
            // جلب أحدث المنتجات
            const latestProducts = await db.allQuery(`
                SELECT p.*, u.name as seller_name, s.store_name
                FROM products p
                LEFT JOIN users u ON p.seller_id = u.id
                LEFT JOIN sellers s ON p.seller_id = s.user_id
                WHERE p.status = 'active'
                ORDER BY p.created_at DESC
                LIMIT 10
            `);
            
            // جلب الأسواق النشطة
            const activeMarkets = await db.allQuery(`
                SELECT m.*, 
                       COUNT(DISTINCT p.id) as product_count,
                       COUNT(DISTINCT d.id) as driver_count
                FROM markets m
                LEFT JOIN products p ON m.id = p.market_id AND p.status = 'active'
                LEFT JOIN drivers d ON m.id = d.market_id AND d.status = 'available'
                WHERE m.status = 'active'
                GROUP BY m.id
                ORDER BY product_count DESC
                LIMIT 5
            `);
            
            res.json({
                success: true,
                data: {
                    stats: stats[0] || {},
                    topProducts,
                    latestProducts,
                    activeMarkets
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب إحصائيات الصفحة الرئيسية: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // جلب الفئات الرئيسية
    router.get('/categories', async (req, res) => {
        try {
            const categories = await db.allQuery(`
                SELECT category, 
                       COUNT(*) as product_count,
                       AVG(price) as avg_price
                FROM products 
                WHERE status = 'active'
                GROUP BY category
                ORDER BY product_count DESC
            `);
            
            res.json({
                success: true,
                data: categories
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب الفئات: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // البحث العام
    router.get('/search', async (req, res) => {
        try {
            const { q, type = 'all' } = req.query;
            
            if (!q || q.trim().length < 2) {
                return res.json({
                    success: true,
                    data: {
                        products: [],
                        markets: [],
                        sellers: []
                    }
                });
            }
            
            const searchTerm = `%${q.trim()}%`;
            const results = {};
            
            if (type === 'all' || type === 'products') {
                results.products = await db.allQuery(`
                    SELECT p.*, u.name as seller_name, s.store_name
                    FROM products p
                    LEFT JOIN users u ON p.seller_id = u.id
                    LEFT JOIN sellers s ON p.seller_id = s.user_id
                    WHERE p.status = 'active'
                    AND (p.name LIKE ? OR p.description LIKE ? OR p.category LIKE ?)
                    LIMIT 10
                `, [searchTerm, searchTerm, searchTerm]);
            }
            
            if (type === 'all' || type === 'markets') {
                results.markets = await db.allQuery(`
                    SELECT * FROM markets 
                    WHERE status = 'active'
                    AND (name LIKE ? OR description LIKE ? OR location LIKE ?)
                    LIMIT 5
                `, [searchTerm, searchTerm, searchTerm]);
            }
            
            if (type === 'all' || type === 'sellers') {
                results.sellers = await db.allQuery(`
                    SELECT u.*, s.store_name, s.rating, s.total_sales
                    FROM users u
                    LEFT JOIN sellers s ON u.id = s.user_id
                    WHERE u.role = 'seller' 
                    AND u.status = 'active'
                    AND (u.name LIKE ? OR s.store_name LIKE ?)
                    LIMIT 5
                `, [searchTerm, searchTerm]);
            }
            
            res.json({
                success: true,
                data: results
            });
        } catch (error) {
            logger.error(`❌ خطأ في البحث: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    return router;
};
