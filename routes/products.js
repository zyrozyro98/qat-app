const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

// Middleware
const { validateRequest } = require('../middleware/validator');
const { requireAuth, requireRole, requireSeller } = require('../config/middleware');

// Models
const { ProductModel } = require('../database/models');
const database = require('../config/database');

// تهيئة الموديل
const productModel = new ProductModel(database);

// إعدادات تحميل الملفات
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 5
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            cb(null, true);
        } else {
            cb(new Error('نوع الصورة غير مدعوم. يرجى رفع صور (JPEG, PNG, GIF, WebP) فقط'));
        }
    }
});

// مسار جلب جميع المنتجات
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
        
        // بناء شروط البحث
        const conditions = { status: 'active' };
        if (category) conditions.category = category;
        if (market_id) conditions.market_id = market_id;
        if (seller_id) conditions.seller_id = seller_id;
        if (min_price) conditions.price = { $gte: min_price };
        if (max_price) conditions.price = { $lte: max_price };
        
        // البحث النصي
        let searchResults = [];
        if (search) {
            searchResults = await productModel.search(search, {
                limit: parseInt(limit),
                offset: (page - 1) * limit
            });
        }
        
        // جلب المنتجات مع الفلترة
        const products = search ? searchResults : await productModel.findAll(conditions, {
            limit: parseInt(limit),
            offset: (page - 1) * limit,
            orderBy: sort_by,
            order: sort_order
        });
        
        // جلب العدد الكلي
        const total = await productModel.count(conditions);
        
        res.json({
            success: true,
            data: products,
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب المنتجات:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب المنتجات'
        });
    }
});

// مسار جلب منتج معين
router.get('/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        
        const product = await productModel.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'المنتج غير موجود'
            });
        }
        
        // جلب بيانات البائع
        const seller = await database.get(
            'SELECT name, email, phone, avatar FROM users WHERE id = ?',
            [product.seller_id]
        );
        
        // جلب بيانات السوق
        const market = await database.get(
            'SELECT name, location FROM markets WHERE id = ?',
            [product.market_id]
        );
        
        // جلب التقييمات
        const reviews = await database.all(`
            SELECT r.*, u.name as user_name, u.avatar as user_avatar
            FROM reviews r
            LEFT JOIN users u ON r.user_id = u.id
            WHERE r.product_id = ?
            ORDER BY r.created_at DESC
            LIMIT 10
        `, [productId]);
        
        // حساب متوسط التقييم
        const avgRating = await database.get(`
            SELECT AVG(rating) as average_rating, COUNT(*) as review_count
            FROM reviews WHERE product_id = ?
        `, [productId]);
        
        // جلب منتجات مشابهة
        const similarProducts = await database.all(`
            SELECT * FROM products 
            WHERE category = ? AND id != ? AND status = 'active'
            ORDER BY RANDOM()
            LIMIT 6
        `, [product.category, productId]);
        
        res.json({
            success: true,
            data: {
                ...product,
                seller: seller || {},
                market: market || {},
                reviews: reviews || [],
                average_rating: avgRating ? avgRating.average_rating : 0,
                review_count: avgRating ? avgRating.review_count : 0,
                similar_products: similarProducts
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب تفاصيل المنتج:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب تفاصيل المنتج'
        });
    }
});

// مسار إضافة منتج جديد
router.post('/', requireAuth, requireSeller, upload.array('images', 5), [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('اسم المنتج مطلوب')
        .isLength({ min: 3, max: 100 })
        .withMessage('اسم المنتج يجب أن يكون بين 3 و 100 حرف'),
    
    body('description')
        .trim()
        .optional()
        .isLength({ max: 1000 })
        .withMessage('الوصف يجب ألا يتجاوز 1000 حرف'),
    
    body('price')
        .isFloat({ min: 1 })
        .withMessage('السعر يجب أن يكون رقم موجب'),
    
    body('category')
        .trim()
        .notEmpty()
        .withMessage('فئة المنتج مطلوبة'),
    
    body('market_id')
        .isInt()
        .withMessage('معرف السوق غير صحيح'),
    
    body('quantity')
        .isInt({ min: 0 })
        .withMessage('الكمية يجب أن تكون رقم صحيح موجب'),
    
    body('specifications')
        .trim()
        .optional()
], validateRequest, async (req, res) => {
    try {
        const sellerId = req.session.userId;
        const { 
            name, description, price, category, market_id, quantity, specifications 
        } = req.body;
        
        // التحقق من وجود السوق
        const market = await database.get('SELECT id FROM markets WHERE id = ? AND status = "active"', [market_id]);
        if (!market) {
            return res.status(400).json({
                success: false,
                error: 'السوق غير موجود أو غير نشط'
            });
        }
        
        // معالجة الصور
        let imagePaths = [];
        if (req.files && req.files.length > 0) {
            const uploadDir = path.join(__dirname, '..', 'uploads', 'products');
            await fs.mkdir(uploadDir, { recursive: true });
            
            for (const file of req.files) {
                const filename = `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.webp`;
                const filePath = path.join(uploadDir, filename);
                
                // تحسين الصورة وحفظها كـ WebP
                await sharp(file.buffer)
                    .resize(800, 600, { fit: 'cover' })
                    .webp({ quality: 80 })
                    .toFile(filePath);
                
                imagePaths.push(`/uploads/products/${filename}`);
            }
        }
        
        // إنشاء المنتج
        const productData = {
            seller_id: sellerId,
            market_id,
            name,
            description: description || '',
            price: parseFloat(price),
            image: imagePaths.length > 0 ? imagePaths[0] : null,
            category,
            quantity: parseInt(quantity),
            specifications: specifications || '',
            status: quantity > 0 ? 'active' : 'out_of_stock'
        };
        
        const product = await productModel.create(productData);
        
        res.status(201).json({
            success: true,
            message: 'تم إضافة المنتج بنجاح',
            data: product
        });
        
    } catch (error) {
        console.error('❌ خطأ في إضافة المنتج:', error);
        
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'حجم الصورة كبير جداً (الحد الأقصى 10MB)'
            });
        }
        
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في إضافة المنتج'
        });
    }
});

// مسار تحديث المنتج
router.put('/:id', requireAuth, requireSeller, [
    body('name')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('اسم المنتج لا يمكن أن يكون فارغاً')
        .isLength({ min: 3, max: 100 })
        .withMessage('اسم المنتج يجب أن يكون بين 3 و 100 حرف'),
    
    body('description')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('الوصف يجب ألا يتجاوز 1000 حرف'),
    
    body('price')
        .optional()
        .isFloat({ min: 1 })
        .withMessage('السعر يجب أن يكون رقم موجب'),
    
    body('quantity')
        .optional()
        .isInt({ min: 0 })
        .withMessage('الكمية يجب أن تكون رقم صحيح موجب'),
    
    body('specifications')
        .optional()
        .trim()
], validateRequest, async (req, res) => {
    try {
        const productId = req.params.id;
        const sellerId = req.session.userId;
        const updateData = req.body;
        
        // التحقق من ملكية المنتج
        const product = await productModel.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'المنتج غير موجود'
            });
        }
        
        if (product.seller_id !== sellerId) {
            return res.status(403).json({
                success: false,
                error: 'لا تملك الصلاحية لتعديل هذا المنتج'
            });
        }
        
        // تحديث حالة المنتج بناءً على الكمية
        if (updateData.quantity !== undefined) {
            updateData.status = updateData.quantity > 0 ? 'active' : 'out_of_stock';
        }
        
        // تحديث المنتج
        const updatedProduct = await productModel.update(productId, updateData);
        
        res.json({
            success: true,
            message: 'تم تحديث المنتج بنجاح',
            data: updatedProduct
        });
        
    } catch (error) {
        console.error('❌ خطأ في تحديث المنتج:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في تحديث المنتج'
        });
    }
});

// مسار حذف المنتج
router.delete('/:id', requireAuth, requireSeller, async (req, res) => {
    try {
        const productId = req.params.id;
        const sellerId = req.session.userId;
        
        // التحقق من ملكية المنتج
        const product = await productModel.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'المنتج غير موجود'
            });
        }
        
        if (product.seller_id !== sellerId) {
            return res.status(403).json({
                success: false,
                error: 'لا تملك الصلاحية لحذف هذا المنتج'
            });
        }
        
        // حذف المنتج
        await productModel.delete(productId);
        
        res.json({
            success: true,
            message: 'تم حذف المنتج بنجاح'
        });
        
    } catch (error) {
        console.error('❌ خطأ في حذف المنتج:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في حذف المنتج'
        });
    }
});

// مسار جلب منتجات البائع
router.get('/seller/my-products', requireAuth, requireSeller, async (req, res) => {
    try {
        const sellerId = req.session.userId;
        const { page = 1, limit = 20, status } = req.query;
        
        // بناء شروط البحث
        const conditions = { seller_id: sellerId };
        if (status) conditions.status = status;
        
        // جلب المنتجات
        const products = await productModel.findAll(conditions, {
            limit: parseInt(limit),
            offset: (page - 1) * limit,
            orderBy: 'created_at',
            order: 'DESC'
        });
        
        // جلب العدد الكلي
        const total = await productModel.count(conditions);
        
        res.json({
            success: true,
            data: products,
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب منتجات البائع:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب منتجات البائع'
        });
    }
});

// مسار إضافة تقييم للمنتج
router.post('/:id/reviews', requireAuth, [
    body('rating')
        .isInt({ min: 1, max: 5 })
        .withMessage('التقييم يجب أن يكون بين 1 و 5'),
    
    body('comment')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('التعليق يجب ألا يتجاوز 500 حرف')
], validateRequest, async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.userId;
        const { rating, comment } = req.body;
        
        // التحقق من وجود المنتج
        const product = await productModel.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'المنتج غير موجود'
            });
        }
        
        // التحقق من عدم إضافة تقييم مسبق
        const existingReview = await database.get(
            'SELECT id FROM reviews WHERE user_id = ? AND product_id = ?',
            [userId, productId]
        );
        
        if (existingReview) {
            return res.status(400).json({
                success: false,
                error: 'لقد قمت بتقييم هذا المنتج مسبقاً'
            });
        }
        
        // إضافة التقييم
        await database.run(
            `INSERT INTO reviews (user_id, product_id, rating, comment, created_at)
             VALUES (?, ?, ?, ?, datetime('now'))`,
            [userId, productId, rating, comment || '']
        );
        
        res.status(201).json({
            success: true,
            message: 'تم إضافة التقييم بنجاح'
        });
        
    } catch (error) {
        console.error('❌ خطأ في إضافة التقييم:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في إضافة التقييم'
        });
    }
});

// مسار جلب فئات المنتجات
router.get('/categories/list', async (req, res) => {
    try {
        const categories = await database.all(`
            SELECT category, COUNT(*) as product_count
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
        console.error('❌ خطأ في جلب الفئات:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب الفئات'
        });
    }
});

// مسار جلب المنتجات الرائجة
router.get('/trending/products', async (req, res) => {
    try {
        const trendingProducts = await database.all(`
            SELECT p.*, u.name as seller_name, s.store_name,
                   (SELECT COUNT(*) FROM order_items oi WHERE oi.product_id = p.id) as order_count
            FROM products p
            LEFT JOIN users u ON p.seller_id = u.id
            LEFT JOIN sellers s ON p.seller_id = s.user_id
            WHERE p.status = 'active'
            ORDER BY order_count DESC
            LIMIT 10
        `);
        
        res.json({
            success: true,
            data: trendingProducts
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب المنتجات الرائجة:', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ في جلب المنتجات الرائجة'
        });
    }
});

module.exports = router;
