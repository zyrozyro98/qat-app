const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const sharp = require('sharp');
const { requireAuth } = require('../middleware/auth');
const logger = require('../config/logger');

// إنشاء مجلد التحميلات إذا لم يكن موجوداً
const uploadsDir = path.join(__dirname, '../../uploads');
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

// إعدادات التخزين
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let folder = 'general';
        
        if (req.baseUrl.includes('products')) {
            folder = 'products';
        } else if (req.baseUrl.includes('avatars')) {
            folder = 'avatars';
        } else if (req.baseUrl.includes('ads')) {
            folder = 'ads';
        }
        
        const dir = path.join(uploadsDir, folder);
        fs.mkdir(dir, { recursive: true }).then(() => {
            cb(null, dir);
        }).catch(err => {
            cb(err, dir);
        });
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

// فلترة الملفات
const fileFilter = (req, file, cb) => {
    const allowedTypes = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'application/pdf': 'pdf',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
    };
    
    if (allowedTypes[file.mimetype]) {
        cb(null, true);
    } else {
        cb(new Error('نوع الملف غير مدعوم'), false);
    }
};

// تهيئة multer
const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 5
    },
    fileFilter
});

// دالة لمعالجة الصور
const processImage = async (buffer, options = {}) => {
    const {
        width = 800,
        height = 600,
        quality = 80,
        format = 'webp'
    } = options;
    
    try {
        const image = sharp(buffer);
        const metadata = await image.metadata();
        
        const processed = await image
            .resize(width, height, {
                fit: 'cover',
                position: 'center'
            })
            .webp({ quality })
            .toBuffer();
        
        return {
            buffer: processed,
            format,
            originalSize: buffer.length,
            processedSize: processed.length,
            metadata
        };
    } catch (error) {
        throw new Error(`خطأ في معالجة الصورة: ${error.message}`);
    }
};

module.exports = (db) => {
    // رفع ملف واحد
    router.post('/single', requireAuth, upload.single('file'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'لم يتم رفع أي ملف'
                });
            }
            
            const fileInfo = {
                filename: req.file.filename,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                path: `/uploads/${req.file.destination.split('uploads/')[1]}/${req.file.filename}`,
                destination: req.file.destination,
                fieldname: req.file.fieldname
            };
            
            // إذا كانت صورة، قم بإنشاء thumbnail
            if (req.file.mimetype.startsWith('image/')) {
                try {
                    const thumbnail = await sharp(req.file.buffer)
                        .resize(200, 200, { fit: 'cover' })
                        .webp({ quality: 70 })
                        .toBuffer();
                    
                    const thumbFilename = `thumb-${req.file.filename.replace(path.extname(req.file.filename), '.webp')}`;
                    const thumbPath = path.join(req.file.destination, thumbFilename);
                    
                    await fs.writeFile(thumbPath, thumbnail);
                    
                    fileInfo.thumbnail = `/uploads/${req.file.destination.split('uploads/')[1]}/${thumbFilename}`;
                } catch (thumbError) {
                    logger.warn(`⚠️ خطأ في إنشاء thumbnail: ${thumbError.message}`);
                }
            }
            
            res.json({
                success: true,
                message: 'تم رفع الملف بنجاح',
                data: fileInfo
            });
        } catch (error) {
            logger.error(`❌ خطأ في رفع الملف: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في رفع الملف' });
        }
    });
    
    // رفع عدة ملفات
    router.post('/multiple', requireAuth, upload.array('files', 10), async (req, res) => {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'لم يتم رفع أي ملفات'
                });
            }
            
            const filesInfo = req.files.map(file => ({
                filename: file.filename,
                originalname: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
                path: `/uploads/${file.destination.split('uploads/')[1]}/${file.filename}`,
                destination: file.destination,
                fieldname: file.fieldname
            }));
            
            // معالجة الصور وإنشاء thumbnails
            for (let i = 0; i < req.files.length; i++) {
                const file = req.files[i];
                if (file.mimetype.startsWith('image/')) {
                    try {
                        const thumbnail = await sharp(file.buffer)
                            .resize(200, 200, { fit: 'cover' })
                            .webp({ quality: 70 })
                            .toBuffer();
                        
                        const thumbFilename = `thumb-${file.filename.replace(path.extname(file.filename), '.webp')}`;
                        const thumbPath = path.join(file.destination, thumbFilename);
                        
                        await fs.writeFile(thumbPath, thumbnail);
                        
                        filesInfo[i].thumbnail = `/uploads/${file.destination.split('uploads/')[1]}/${thumbFilename}`;
                    } catch (thumbError) {
                        logger.warn(`⚠️ خطأ في إنشاء thumbnail: ${thumbError.message}`);
                    }
                }
            }
            
            res.json({
                success: true,
                message: `تم رفع ${filesInfo.length} ملف بنجاح`,
                data: filesInfo
            });
        } catch (error) {
            logger.error(`❌ خطأ في رفع الملفات: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في رفع الملفات' });
        }
    });
    
    // رفع صورة منتج مع معالجة
    router.post('/product-image', requireAuth, upload.single('image'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'لم يتم رفع أي صورة'
                });
            }
            
            if (!req.file.mimetype.startsWith('image/')) {
                return res.status(400).json({
                    success: false,
                    error: 'الملف يجب أن يكون صورة'
                });
            }
            
            // معالجة الصورة الرئيسية
            const mainImage = await processImage(req.file.buffer, {
                width: 800,
                height: 600,
                quality: 85
            });
            
            // حفظ الصورة الرئيسية
            const mainFilename = `product-${Date.now()}.webp`;
            const mainPath = path.join(uploadsDir, 'products', mainFilename);
            await fs.writeFile(mainPath, mainImage.buffer);
            
            // إنشاء thumbnail
            const thumbnail = await processImage(req.file.buffer, {
                width: 300,
                height: 300,
                quality: 70
            });
            
            const thumbFilename = `thumb-${mainFilename}`;
            const thumbPath = path.join(uploadsDir, 'products', thumbFilename);
            await fs.writeFile(thumbPath, thumbnail.buffer);
            
            // إنشاء نسخة صغيرة للقائمة
            const smallImage = await processImage(req.file.buffer, {
                width: 150,
                height: 150,
                quality: 60
            });
            
            const smallFilename = `small-${mainFilename}`;
            const smallPath = path.join(uploadsDir, 'products', smallFilename);
            await fs.writeFile(smallPath, smallImage.buffer);
            
            const fileInfo = {
                original: {
                    filename: req.file.filename,
                    originalname: req.file.originalname,
                    size: req.file.size,
                    mimetype: req.file.mimetype
                },
                processed: {
                    main: {
                        filename: mainFilename,
                        path: `/uploads/products/${mainFilename}`,
                        size: mainImage.processedSize,
                        dimensions: `${mainImage.metadata.width}x${mainImage.metadata.height}`
                    },
                    thumbnail: {
                        filename: thumbFilename,
                        path: `/uploads/products/${thumbFilename}`,
                        size: thumbnail.processedSize,
                        dimensions: `${thumbnail.metadata.width}x${thumbnail.metadata.height}`
                    },
                    small: {
                        filename: smallFilename,
                        path: `/uploads/products/${smallFilename}`,
                        size: smallImage.processedSize,
                        dimensions: `${smallImage.metadata.width}x${smallImage.metadata.height}`
                    }
                },
                compression: {
                    original_size: req.file.size,
                    processed_size: mainImage.processedSize,
                    compression_ratio: ((req.file.size - mainImage.processedSize) / req.file.size * 100).toFixed(2) + '%'
                }
            };
            
            res.json({
                success: true,
                message: 'تم رفع ومعالجة صورة المنتج بنجاح',
                data: fileInfo
            });
        } catch (error) {
            logger.error(`❌ خطأ في رفع صورة المنتج: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في رفع الصورة' });
        }
    });
    
    // رفع صورة بروفايل
    router.post('/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'لم يتم رفع أي صورة'
                });
            }
            
            if (!req.file.mimetype.startsWith('image/')) {
                return res.status(400).json({
                    success: false,
                    error: 'الملف يجب أن يكون صورة'
                });
            }
            
            // حذف الصورة القديمة إذا كانت موجودة
            const user = await db.getQuery('SELECT avatar FROM users WHERE id = ?', [req.session.userId]);
            if (user && user.avatar && user.avatar.startsWith('/uploads/avatars/')) {
                try {
                    const oldAvatarPath = path.join(__dirname, '../..', user.avatar);
                    await fs.unlink(oldAvatarPath);
                    
                    // حذف النسخ الأخرى إذا كانت موجودة
                    const avatarName = path.basename(user.avatar);
                    const thumbPath = path.join(uploadsDir, 'avatars', `thumb-${avatarName}`);
                    const smallPath = path.join(uploadsDir, 'avatars', `small-${avatarName}`);
                    
                    try { await fs.unlink(thumbPath); } catch {}
                    try { await fs.unlink(smallPath); } catch {}
                } catch (error) {
                    logger.warn(`⚠️ خطأ في حذف الصورة القديمة: ${error.message}`);
                }
            }
            
            // معالجة الصورة الرئيسية
            const mainImage = await processImage(req.file.buffer, {
                width: 400,
                height: 400,
                quality: 90
            });
            
            // حفظ الصورة الرئيسية
            const mainFilename = `avatar-${req.session.userId}-${Date.now()}.webp`;
            const mainPath = path.join(uploadsDir, 'avatars', mainFilename);
            await fs.writeFile(mainPath, mainImage.buffer);
            
            // إنشاء thumbnail
            const thumbnail = await processImage(req.file.buffer, {
                width: 100,
                height: 100,
                quality: 80
            });
            
            const thumbFilename = `thumb-${mainFilename}`;
            const thumbPath = path.join(uploadsDir, 'avatars', thumbFilename);
            await fs.writeFile(thumbPath, thumbnail.buffer);
            
            // إنشاء نسخة صغيرة
            const smallImage = await processImage(req.file.buffer, {
                width: 50,
                height: 50,
                quality: 70
            });
            
            const smallFilename = `small-${mainFilename}`;
            const smallPath = path.join(uploadsDir, 'avatars', smallFilename);
            await fs.writeFile(smallPath, smallImage.buffer);
            
            const avatarUrl = `/uploads/avatars/${mainFilename}`;
            
            // تحديث قاعدة البيانات
            await db.runQuery(
                'UPDATE users SET avatar = ?, updated_at = ? WHERE id = ?',
                [avatarUrl, new Date().toISOString(), req.session.userId]
            );
            
            res.json({
                success: true,
                message: 'تم رفع صورة البروفايل بنجاح',
                data: {
                    avatar: avatarUrl,
                    thumbnail: `/uploads/avatars/${thumbFilename}`,
                    small: `/uploads/avatars/${smallFilename}`,
                    sizes: {
                        main: `${mainImage.metadata.width}x${mainImage.metadata.height}`,
                        thumb: `${thumbnail.metadata.width}x${thumbnail.metadata.height}`,
                        small: `${smallImage.metadata.width}x${smallImage.metadata.height}`
                    }
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في رفع صورة البروفايل: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في رفع الصورة' });
        }
    });
    
    // حذف ملف
    router.delete('/:filename', requireAuth, async (req, res) => {
        try {
            const { filename } = req.params;
            const { folder = 'general' } = req.query;
            
            const validFolders = ['products', 'avatars', 'ads', 'general'];
            if (!validFolders.includes(folder)) {
                return res.status(400).json({
                    success: false,
                    error: 'المجلد غير صالح'
                });
            }
            
            const filePath = path.join(uploadsDir, folder, filename);
            
            // التحقق من وجود الملف
            try {
                await fs.access(filePath);
            } catch {
                return res.status(404).json({
                    success: false,
                    error: 'الملف غير موجود'
                });
            }
            
            // حذف الملف
            await fs.unlink(filePath);
            
            // محاولة حذف النسخ الأخرى إذا كانت صورة
            if (filename.endsWith('.webp') || filename.endsWith('.jpg') || filename.endsWith('.png')) {
                const baseName = path.basename(filename, path.extname(filename));
                
                // حذف thumbnail إذا كان موجوداً
                if (filename.startsWith('product-') || filename.startsWith('avatar-')) {
                    try {
                        const thumbPath = path.join(uploadsDir, folder, `thumb-${baseName}.webp`);
                        await fs.unlink(thumbPath);
                    } catch {}
                    
                    try {
                        const smallPath = path.join(uploadsDir, folder, `small-${baseName}.webp`);
                        await fs.unlink(smallPath);
                    } catch {}
                }
            }
            
            res.json({
                success: true,
                message: 'تم حذف الملف بنجاح'
            });
        } catch (error) {
            logger.error(`❌ خطأ في حذف الملف: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في حذف الملف' });
        }
    });
    
    // جلب قائمة الملفات
    router.get('/list', requireAuth, async (req, res) => {
        try {
            const { folder = 'general', page = 1, limit = 20 } = req.query;
            
            const validFolders = ['products', 'avatars', 'ads', 'general'];
            if (!validFolders.includes(folder)) {
                return res.status(400).json({
                    success: false,
                    error: 'المجلد غير صالح'
                });
            }
            
            const folderPath = path.join(uploadsDir, folder);
            
            // التحقق من وجود المجلد
            try {
                await fs.access(folderPath);
            } catch {
                return res.json({
                    success: true,
                    data: [],
                    meta: {
                        total: 0,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        pages: 0
                    }
                });
            }
            
            // قراءة الملفات
            const files = await fs.readdir(folderPath);
            
            // تصفية الملفات المخفية والخاصة
            const filteredFiles = files.filter(file => 
                !file.startsWith('.') && 
                !file.startsWith('thumb-') && 
                !file.startsWith('small-')
            );
            
            // ترتيب حسب تاريخ الإنشاء
            const filesWithStats = await Promise.all(
                filteredFiles.map(async (file) => {
                    const filePath = path.join(folderPath, file);
                    const stats = await fs.stat(filePath);
                    
                    return {
                        filename: file,
                        path: `/uploads/${folder}/${file}`,
                        size: stats.size,
                        created: stats.birthtime,
                        modified: stats.mtime,
                        isImage: /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
                    };
                })
            );
            
            // الترتيب تنازلياً حسب تاريخ الإنشاء
            filesWithStats.sort((a, b) => b.created - a.created);
            
            // التقسيم إلى صفحات
            const startIndex = (page - 1) * limit;
            const endIndex = page * limit;
            const paginatedFiles = filesWithStats.slice(startIndex, endIndex);
            
            // إضافة معلومات الصور المصغرة للصور
            for (const file of paginatedFiles) {
                if (file.isImage) {
                    const baseName = path.basename(file.filename, path.extname(file.filename));
                    const thumbFilename = `thumb-${baseName}.webp`;
                    const thumbPath = path.join(folderPath, thumbFilename);
                    
                    try {
                        await fs.access(thumbPath);
                        file.thumbnail = `/uploads/${folder}/${thumbFilename}`;
                    } catch {}
                }
            }
            
            res.json({
                success: true,
                data: paginatedFiles,
                meta: {
                    total: filteredFiles.length,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(filteredFiles.length / limit),
                    folder
                }
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب قائمة الملفات: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // جلب معلومات ملف معين
    router.get('/info/:filename', requireAuth, async (req, res) => {
        try {
            const { filename } = req.params;
            const { folder = 'general' } = req.query;
            
            const filePath = path.join(uploadsDir, folder, filename);
            
            // التحقق من وجود الملف
            try {
                await fs.access(filePath);
            } catch {
                return res.status(404).json({
                    success: false,
                    error: 'الملف غير موجود'
                });
            }
            
            const stats = await fs.stat(filePath);
            const ext = path.extname(filename).toLowerCase();
            const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(filename);
            
            const fileInfo = {
                filename,
                path: `/uploads/${folder}/${filename}`,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                type: getFileType(ext),
                isImage,
                dimensions: null
            };
            
            // إذا كانت صورة، جلب الأبعاد
            if (isImage) {
                try {
                    const metadata = await sharp(filePath).metadata();
                    fileInfo.dimensions = {
                        width: metadata.width,
                        height: metadata.height,
                        format: metadata.format
                    };
                } catch (error) {
                    logger.warn(`⚠️ خطأ في قراءة بيانات الصورة: ${error.message}`);
                }
                
                // التحقق من وجود thumbnail
                const baseName = path.basename(filename, path.extname(filename));
                const thumbFilename = `thumb-${baseName}.webp`;
                const thumbPath = path.join(uploadsDir, folder, thumbFilename);
                
                try {
                    await fs.access(thumbPath);
                    fileInfo.thumbnail = `/uploads/${folder}/${thumbFilename}`;
                } catch {}
            }
            
            res.json({
                success: true,
                data: fileInfo
            });
        } catch (error) {
            logger.error(`❌ خطأ في جلب معلومات الملف: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // خدمة الملفات المحملة (عامة - لا تتطلب مصادقة)
    router.get('/:folder/:filename', async (req, res) => {
        try {
            const { folder, filename } = req.params;
            
            // التحقق من صحة المجلد
            const validFolders = ['products', 'avatars', 'ads', 'general'];
            if (!validFolders.includes(folder)) {
                return res.status(400).json({
                    success: false,
                    error: 'المجلد غير صالح'
                });
            }
            
            const filePath = path.join(uploadsDir, folder, filename);
            
            // التحقق من وجود الملف
            try {
                await fs.access(filePath);
            } catch {
                return res.status(404).json({
                    success: false,
                    error: 'الملف غير موجود'
                });
            }
            
            // تعيين رؤوس التخزين المؤقت
            const stats = await fs.stat(filePath);
            const ext = path.extname(filename).toLowerCase();
            
            res.setHeader('Content-Type', getMimeType(ext));
            res.setHeader('Content-Length', stats.size);
            res.setHeader('Cache-Control', 'public, max-age=31536000'); // سنة واحدة
            res.setHeader('Last-Modified', stats.mtime.toUTCString());
            res.setHeader('ETag', `"${stats.size}-${stats.mtime.getTime()}"`);
            
            // إرسال الملف
            res.sendFile(filePath);
        } catch (error) {
            logger.error(`❌ خطأ في خدمة الملف: ${error.message}`);
            res.status(500).json({ success: false, error: 'خطأ في الخادم' });
        }
    });
    
    // دالة لمعرفة نوع الملف
    function getFileType(ext) {
        const types = {
            '.jpg': 'image',
            '.jpeg': 'image',
            '.png': 'image',
            '.gif': 'image',
            '.webp': 'image',
            '.pdf': 'document',
            '.doc': 'document',
            '.docx': 'document'
        };
        
        return types[ext] || 'unknown';
    }
    
    // دالة لمعرفة MIME type
    function getMimeType(ext) {
        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        };
        
        return mimeTypes[ext] || 'application/octet-stream';
    }
    
    return router;
};
