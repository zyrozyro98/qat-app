const express = require('express');
const router = express.Router();
const logger = require('../config/logger');

module.exports = (db) => {
    // جلب جميع الأسواق
    router.get('/', async (req, res) => {
        try {
            const markets = await db.allQuery(`
                SELECT m.*, 
                       COUNT(DISTINCT p.id) as product_count,
                       COUNT(DISTINCT s.id) as seller_count,
                       COUNT(DISTINCT d.id) as driver_count
                FROM markets m
                LEFT JOIN products p ON m.id = p.market_id AND p.status = 'active'
                LEFT JOIN sellers s ON p.seller_id = s.user_id
                LEFT JOIN drivers d ON m.id = d.market_id AND d.status = 'available'
                WHERE m.status = 'active'
                GROUP BY m.id
                ORDER BY m.name
            `);
            
            logger.info(`✅ تم جلب ${markets.length} سوق`);
            
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
    
    // جلب تفاصيل سوق معين
    router.get('/:id', async (req, res) => {
        try {
            const market = await db.getQuery(
                'SELECT * FROM markets WHERE id = ? AND status = "active"',
                [req.params.id]
            );
            
            if (!market) {
                return res.status(404).json({
                    success: false,
                    error: 'السوق غير موجود'
                });
            }
            
            // جلب البائعين في هذا السوق
            const sellers = await db.allQuery(`
                SELECT DISTINCT u.*, s.store_name, s.rating, s.total_sales
                FROM products p
                LEFT JOIN users u ON p.seller_id = u.id
                LEFT JOIN sellers s ON p.seller_id = s.user_id
                WHERE p.market_id = ? 
                AND p.status = 'active'
                AND u.status = 'active'
            `, [req.params.id]);
            
            // جلب السائقين المتاحين في هذا السوق
            const drivers = await db.allQuery(`
                SELECT d.*, u.name, u.phone, u.avatar
                FROM drivers d
                LEFT JOIN users u ON d.user_id = u.id
                WHERE d.market_id = ? 
                AND d.status = 'available'
                AND u.status = 'active'
            `, [req.params.id]);
            
            // جلب الفئات المتاحة في هذا السوق
            const categories = await db.allQuery(`
                SELECT p.category, 
                       COUNT(*) as product_count,
                       MIN(p.price) as min_price,
                       MAX(p.price) as max_price,
                       AVG(p.price) as avg_price
                FROM products p
                WHERE p.market_id = ? 
                AND p.status = 'active'
                GROUP BY p.category
                ORDER BY product_count DESC
            `, [req.params.id]);
            
            res.json({
                success: true,
                data: {
                    ...market,
                    sellers,
                    drivers,
                    categories
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب تفاصيل السوق: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // إنشاء سوق جديد (للمسؤول فقط)
    router.post('/', async (req, res) => {
        try {
            const { name, description, location, image } = req.body;
            
            if (!name || !location) {
                return res.status(400).json({
                    success: false,
                    error: 'الاسم والموقع مطلوبان'
                });
            }
            
            const result = await db.runQuery(
                'INSERT INTO markets (name, description, location, image, created_at) VALUES (?, ?, ?, ?, ?)',
                [name, description || '', location, image || '', new Date().toISOString()]
            );
            
            res.json({
                success: true,
                message: 'تم إنشاء السوق بنجاح',
                data: {
                    id: result.lastID,
                    name,
                    description,
                    location,
                    image
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في إنشاء السوق: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // تحديث السوق (للمسؤول فقط)
    router.put('/:id', async (req, res) => {
        try {
            const { name, description, location, image, status } = req.body;
            
            await db.runQuery(
                'UPDATE markets SET name = ?, description = ?, location = ?, image = ?, status = ? WHERE id = ?',
                [name, description, location, image, status, req.params.id]
            );
            
            res.json({
                success: true,
                message: 'تم تحديث السوق بنجاح'
            });
        } catch (error) {
            logger.error(`❌ خطأ في تحديث السوق: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // جلب منتجات السوق
    router.get('/:id/products', async (req, res) => {
        try {
            const { category, min_price, max_price, sort_by = 'created_at', sort_order = 'DESC', page = 1, limit = 20 } = req.query;
            
            let query = `
                SELECT p.*, u.name as seller_name, u.avatar as seller_avatar,
                       s.store_name, s.rating as seller_rating,
                       (SELECT AVG(rating) FROM reviews WHERE product_id = p.id) as average_rating
                FROM products p
                LEFT JOIN users u ON p.seller_id = u.id
                LEFT JOIN sellers s ON p.seller_id = s.user_id
                WHERE p.market_id = ? AND p.status = 'active'
            `;
            
            const params = [req.params.id];
            
            if (category) {
                query += ' AND p.category = ?';
                params.push(category);
            }
            
            if (min_price) {
                query += ' AND p.price >= ?';
                params.push(min_price);
            }
            
            if (max_price) {
                query += ' AND p.price <= ?';
                params.push(max_price);
            }
            
            const countQuery = `SELECT COUNT(*) as total ${query.substring(query.indexOf('FROM'))}`;
            const countResult = await db.getQuery(countQuery, params);
            const total = countResult ? countResult.total : 0;
            
            const validSortColumns = ['price', 'created_at', 'average_rating'];
            const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
            const order = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
            
            query += ` ORDER BY ${sortColumn} ${order}`;
            
            const offset = (page - 1) * limit;
            query += ' LIMIT ? OFFSET ?';
            params.push(parseInt(limit), offset);
            
            const products = await db.allQuery(query, params);
            
            res.json({
                success: true,
                data: products,
                meta: {
                    market_id: req.params.id,
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب منتجات السوق: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    return router;
};
