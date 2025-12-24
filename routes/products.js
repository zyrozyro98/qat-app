const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { requireAuth, requireSeller } = require('../middleware/auth');
const logger = require('../config/logger');

// إعداد Multer للرفع
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            cb(null, true);
        } else {
            cb(new Error('نوع الملف غير مدعوم. يرجى رفع صور فقط (JPEG, PNG, GIF, WebP)'));
        }
    }
});

module.exports = (db) => {
    // جلب جميع المنتجات
    router.get('/', async (req, res) => {
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
    });
    
    // جلب منتج معين
    router.get('/:id', async (req, res) => {
        try {
            const product = await db.getQuery(
                `SELECT p.*, u.name as seller_name, u.avatar as seller_avatar,
                        s.store_name, s.rating as seller_rating, s.total_sales,
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
                 ORDER BY r.created_at DESC
                 LIMIT 10`,
                [req.params.id]
            );
            
            // جلب متوسط التقييم
            const avgRating = await db.getQuery(
                'SELECT AVG(rating) as avg_rating, COUNT(*) as total_reviews FROM reviews WHERE product_id = ?',
                [req.params.id]
            );
            
            // جلب منتجات مشابهة
            const similarProducts = await db.allQuery(
                `SELECT p.*, u.name as seller_name
                 FROM products p
                 LEFT JOIN users u ON p.seller_id = u.id
                 WHERE p.category = ? 
                 AND p.id != ? 
                 AND p.status = 'active'
                 ORDER BY RANDOM()
                 LIMIT 4`,
                [product.category, req.params.id]
            );
            
            res.json({
                success: true,
                data: {
                    ...product,
                    reviews,
                    rating: avgRating || { avg_rating: 0, total_reviews: 0 },
                    similarProducts
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب تفاصيل المنتج: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // إنشاء منتج جديد (للبائع فقط)
    router.post('/', requireAuth, requireSeller, upload.single('image'), async (req, res) => {
        try {
            const { name, description, price, category, quantity, specifications, market_id } = req.body;
            
            if (!name || !price || !category || !market_id) {
                return res.status(400).json({
                    success: false,
                    error: 'الاسم والسعر والفئة والسوق مطلوبة'
                });
            }
            
            let imageUrl = '';
            if (req.file) {
                // حفظ الصورة
                const uploadsDir = path.join(__dirname, '../../uploads/products');
                await fs.mkdir(uploadsDir, { recursive: true });
                
                const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(req.file.originalname)}`;
                const filePath = path.join(uploadsDir, fileName);
                
                await fs.writeFile(filePath, req.file.buffer);
                imageUrl = `/uploads/products/${fileName}`;
            }
            
            const result = await db.runQuery(
                `INSERT INTO products (seller_id, market_id, name, description, price, image, category, quantity, specifications, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [req.session.userId, market_id, name, description || '', price, imageUrl, category, quantity || 0, specifications || '', new Date().toISOString()]
            );
            
            res.json({
                success: true,
                message: 'تم إنشاء المنتج بنجاح',
                data: {
                    id: result.lastID,
                    name,
                    price,
                    category,
                    image: imageUrl
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في إنشاء المنتج: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // تحديث منتج (للبائع فقط)
    router.put('/:id', requireAuth, requireSeller, upload.single('image'), async (req, res) => {
        try {
            // التحقق من ملكية المنتج
            const product = await db.getQuery(
                'SELECT * FROM products WHERE id = ? AND seller_id = ?',
                [req.params.id, req.session.userId]
            );
            
            if (!product) {
                return res.status(404).json({
                    success: false,
                    error: 'المنتج غير موجود أو ليس لديك صلاحية لتعديله'
                });
            }
            
            const { name, description, price, category, quantity, specifications, status, market_id } = req.body;
            
            let imageUrl = product.image;
            if (req.file) {
                // حفظ الصورة الجديدة
                const uploadsDir = path.join(__dirname, '../../uploads/products');
                await fs.mkdir(uploadsDir, { recursive: true });
                
                const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(req.file.originalname)}`;
                const filePath = path.join(uploadsDir, fileName);
                
                await fs.writeFile(filePath, req.file.buffer);
                imageUrl = `/uploads/products/${fileName}`;
                
                // حذف الصورة القديمة إذا كانت موجودة
                if (product.image && product.image.startsWith('/uploads/')) {
                    try {
                        await fs.unlink(path.join(__dirname, '../..', product.image));
                    } catch (error) {
                        logger.warn(`⚠️ خطأ في حذف الصورة القديمة: ${error.message}`);
                    }
                }
            }
            
            await db.runQuery(
                `UPDATE products 
                 SET name = ?, description = ?, price = ?, image = ?, category = ?, 
                     quantity = ?, specifications = ?, status = ?, market_id = ?, updated_at = ?
                 WHERE id = ?`,
                [name || product.name, 
                 description || product.description, 
                 price || product.price, 
                 imageUrl,
                 category || product.category,
                 quantity !== undefined ? quantity : product.quantity,
                 specifications || product.specifications,
                 status || product.status,
                 market_id || product.market_id,
                 new Date().toISOString(),
                 req.params.id]
            );
            
            res.json({
                success: true,
                message: 'تم تحديث المنتج بنجاح'
            });
        } catch (error) {
            logger.error(`❌ خطأ في تحديث المنتج: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // حذف منتج (للبائع فقط)
    router.delete('/:id', requireAuth, requireSeller, async (req, res) => {
        try {
            // التحقق من ملكية المنتج
            const product = await db.getQuery(
                'SELECT * FROM products WHERE id = ? AND seller_id = ?',
                [req.params.id, req.session.userId]
            );
            
            if (!product) {
                return res.status(404).json({
                    success: false,
                    error: 'المنتج غير موجود أو ليس لديك صلاحية لحذفه'
                });
            }
            
            // لا يمكن حذف المنتج إذا كان لديه طلبات نشطة
            const hasOrders = await db.getQuery(
                'SELECT 1 FROM order_items oi LEFT JOIN orders o ON oi.order_id = o.id WHERE oi.product_id = ? AND o.status IN ("pending", "paid", "preparing") LIMIT 1',
                [req.params.id]
            );
            
            if (hasOrders) {
                return res.status(400).json({
                    success: false,
                    error: 'لا يمكن حذف المنتج لأنه لديه طلبات نشطة'
                });
            }
            
            // حذف الصورة إذا كانت موجودة
            if (product.image && product.image.startsWith('/uploads/')) {
                try {
                    await fs.unlink(path.join(__dirname, '../..', product.image));
                } catch (error) {
                    logger.warn(`⚠️ خطأ في حذف الصورة: ${error.message}`);
                }
            }
            
            // حذف المنتج (تحديث الحالة بدلاً من الحذف الفعلي)
            await db.runQuery(
                'UPDATE products SET status = "inactive", updated_at = ? WHERE id = ?',
                [new Date().toISOString(), req.params.id]
            );
            
            res.json({
                success: true,
                message: 'تم حذف المنتج بنجاح'
            });
        } catch (error) {
            logger.error(`❌ خطأ في حذف المنتج: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // إضافة تقييم للمنتج
    router.post('/:id/reviews', requireAuth, async (req, res) => {
        try {
            const { rating, comment } = req.body;
            
            if (!rating || rating < 1 || rating > 5) {
                return res.status(400).json({
                    success: false,
                    error: 'التقييم يجب أن يكون بين 1 و 5'
                });
            }
            
            // التحقق من أن المستخدم قد اشترى هذا المنتج
            const hasPurchased = await db.getQuery(
                `SELECT 1 FROM order_items oi 
                 LEFT JOIN orders o ON oi.order_id = o.id 
                 WHERE oi.product_id = ? AND o.buyer_id = ? AND o.status = "delivered" 
                 LIMIT 1`,
                [req.params.id, req.session.userId]
            );
            
            if (!hasPurchased) {
                return res.status(403).json({
                    success: false,
                    error: 'يجب شراء المنتج أولاً قبل تقييمه'
                });
            }
            
            // التحقق من عدم إضافة تقييم سابق
            const existingReview = await db.getQuery(
                'SELECT id FROM reviews WHERE product_id = ? AND user_id = ?',
                [req.params.id, req.session.userId]
            );
            
            if (existingReview) {
                return res.status(400).json({
                    success: false,
                    error: 'لقد قمت بتقييم هذا المنتج مسبقاً'
                });
            }
            
            await db.runQuery(
                'INSERT INTO reviews (user_id, product_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)',
                [req.session.userId, req.params.id, rating, comment || '', new Date().toISOString()]
            );
            
            res.json({
                success: true,
                message: 'تم إضافة التقييم بنجاح'
            });
        } catch (error) {
            logger.error(`❌ خطأ في إضافة التقييم: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // جلب منتجات البائع
    router.get('/seller/products', requireAuth, requireSeller, async (req, res) => {
        try {
            const { status, page = 1, limit = 20 } = req.query;
            
            let query = `
                SELECT p.*, m.name as market_name
                FROM products p
                LEFT JOIN markets m ON p.market_id = m.id
                WHERE p.seller_id = ?
            `;
            
            const params = [req.session.userId];
            
            if (status) {
                query += ' AND p.status = ?';
                params.push(status);
            }
            
            query += ' ORDER BY p.created_at DESC';
            
            const offset = (page - 1) * limit;
            query += ' LIMIT ? OFFSET ?';
            params.push(parseInt(limit), offset);
            
            const products = await db.allQuery(query, params);
            
            // حساب الإحصائيات
            const stats = await db.getQuery(`
                SELECT 
                    (SELECT COUNT(*) FROM products WHERE seller_id = ? AND status = 'active') as active_products,
                    (SELECT COUNT(*) FROM products WHERE seller_id = ? AND status = 'out_of_stock') as out_of_stock_products,
                    (SELECT COUNT(*) FROM products WHERE seller_id = ? AND status = 'inactive') as inactive_products,
                    (SELECT SUM(total_sales) FROM order_items oi 
                     LEFT JOIN products p ON oi.product_id = p.id 
                     WHERE p.seller_id = ?) as total_sales_amount
            `, [req.session.userId, req.session.userId, req.session.userId, req.session.userId]);
            
            res.json({
                success: true,
                data: {
                    products,
                    stats: stats || {}
                },
                meta: {
                    page: parseInt(page),
                    limit: parseInt(limit)
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب منتجات البائع: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    return router;
};
