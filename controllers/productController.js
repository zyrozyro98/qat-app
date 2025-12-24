const logger = require('../config/logger');

module.exports = (db) => {
    return {
        async getProducts(req, res) {
            try {
                const {
                    category,
                    market_id,
                    seller_id,
                    min_price,
                    max_price,
                    search,
                    sort_by = 'created_at',
                    sort_order = 'DESC',
                    page = 1,
                    limit = 20
                } = req.query;
                
                let query = `
                    SELECT p.*, u.name as seller_name, u.avatar as seller_avatar,
                           s.store_name, s.rating as seller_rating,
                           m.name as market_name, m.location as market_location,
                           (SELECT AVG(rating) FROM reviews WHERE product_id = p.id) as average_rating,
                           (SELECT COUNT(*) FROM reviews WHERE product_id = p.id) as review_count
                    FROM products p
                    LEFT JOIN users u ON p.seller_id = u.id
                    LEFT JOIN sellers s ON p.seller_id = s.user_id
                    LEFT JOIN markets m ON p.market_id = m.id
                    WHERE p.status = 'active'
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
                
                if (seller_id) {
                    query += ' AND p.seller_id = ?';
                    params.push(seller_id);
                }
                
                if (min_price) {
                    query += ' AND p.price >= ?';
                    params.push(min_price);
                }
                
                if (max_price) {
                    query += ' AND p.price <= ?';
                    params.push(max_price);
                }
                
                if (search) {
                    query += ' AND (p.name LIKE ? OR p.description LIKE ? OR p.specifications LIKE ?)';
                    const searchTerm = `%${search}%`;
                    params.push(searchTerm, searchTerm, searchTerm);
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
                
                logger.info(`✅ تم جلب ${products.length} منتج من أصل ${total}`);
                
                res.json({
                    success: true,
                    data: products,
                    meta: {
                        total,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        pages: Math.ceil(total / limit),
                        timestamp: new Date().toISOString()
                    }
                });
            } catch (error) {
                logger.error(`❌ خطأ في جلب المنتجات: ${error.message}`);
                res.status(500).json({ success: false, error: 'خطأ في الخادم' });
            }
        },
        
        async getProductById(req, res) {
            try {
                const product = await db.getQuery(
                    `SELECT p.*, u.name as seller_name, u.avatar as seller_avatar,
                            s.store_name, s.rating as seller_rating,
                            m.name as market_name, m.location as market_location
                     FROM products p
                     LEFT JOIN users u ON p.seller_id = u.id
                     LEFT JOIN sellers s ON p.seller_id = s.user_id
                     LEFT JOIN markets m ON p.market_id = m.id
                     WHERE p.id = ? AND p.status = 'active'`,
                    [req.params.id]
                );
                
                if (!product) {
                    return res.status(404).json({
                        success: false,
                        error: 'المنتج غير موجود'
                    });
                }
                
                // جلب التقييمات
                const reviews = await db.allQuery(
                    `SELECT r.*, u.name as user_name, u.avatar as user_avatar
                     FROM reviews r
                     LEFT JOIN users u ON r.user_id = u.id
                     WHERE r.product_id = ?
                     ORDER BY r.created_at DESC`,
                    [req.params.id]
                );
                
                res.json({
                    success: true,
                    data: {
                        ...product,
                        reviews
                    }
                });
            } catch (error) {
                logger.error(`❌ خطأ في جلب تفاصيل المنتج: ${error.message}`);
                res.status(500).json({ success: false, error: 'خطأ في الخادم' });
            }
        }
    };
};
