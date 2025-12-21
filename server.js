// server.js - تطبيق قات PRO - النسخة الكاملة
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

// تهيئة التطبيق
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// الوسائط
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// متغيرات البيئة
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/qat_pro';

// اتصال MongoDB
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ تم الاتصال بقاعدة البيانات بنجاح'))
    .catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));

// نماذج Mongoose
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    role: { 
        type: String, 
        enum: ['buyer', 'seller', 'driver'], 
        required: true 
    },
    storeName: { type: String, default: '' },
    vehicleType: { type: String, default: '' },
    balance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    category: { type: String, required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    imageUrl: { type: String, default: '' },
    isAvailable: { type: Boolean, default: true },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    createdAt: { type: Date, default: Date.now }
});

const OrderSchema = new mongoose.Schema({
    orderNumber: { type: String, unique: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    products: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true }
    }],
    totalAmount: { type: Number, required: true },
    deliveryAddress: { type: String, required: true },
    status: { 
        type: String, 
        enum: ['pending', 'confirmed', 'preparing', 'on_the_way', 'delivered', 'cancelled'],
        default: 'pending'
    },
    paymentMethod: { 
        type: String, 
        enum: ['cash', 'wallet', 'card'], 
        required: true 
    },
    paymentStatus: { 
        type: String, 
        enum: ['pending', 'paid', 'failed'], 
        default: 'pending' 
    },
    deliveryNotes: { type: String, default: '' },
    estimatedDelivery: { type: Date },
    actualDelivery: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

const TransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    type: { 
        type: String, 
        enum: ['deposit', 'withdrawal', 'payment', 'refund', 'order_income'],
        required: true 
    },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    description: { type: String, required: true },
    balanceAfter: { type: Number, required: true },
    status: { 
        type: String, 
        enum: ['pending', 'completed', 'failed'], 
        default: 'pending' 
    },
    createdAt: { type: Date, default: Date.now }
});

const NotificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['order', 'payment', 'system', 'alert', 'promotion'],
        default: 'system'
    },
    isRead: { type: Boolean, default: false },
    link: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

// النماذج
const User = mongoose.model('User', UserSchema);
const Product = mongoose.model('Product', ProductSchema);
const Order = mongoose.model('Order', OrderSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);
const Notification = mongoose.model('Notification', NotificationSchema);

// وظيفة المساعدين
function generateOrderNumber() {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    return `ORD-${year}${month}${day}-${random}`;
}

async function createNotification(userId, title, message, type = 'system', link = '') {
    try {
        const notification = new Notification({
            userId,
            title,
            message,
            type,
            link
        });
        await notification.save();
        
        // إرسال الإشعار عبر WebSocket
        io.to(`user_${userId}`).emit('new_notification', notification);
        
        return notification;
    } catch (error) {
        console.error('خطأ في إنشاء الإشعار:', error);
    }
}

// middleware المصادقة
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'رمز الوصول مطلوب' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user) {
            return res.status(401).json({ message: 'المستخدم غير موجود' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(403).json({ message: 'رمز وصول غير صالح' });
    }
};

// WebSocket connection handling
const connectedUsers = new Map();

io.on('connection', (socket) => {
    console.log('✅ مستخدم متصل:', socket.id);

    socket.on('register_user', (userId) => {
        socket.join(`user_${userId}`);
        connectedUsers.set(userId, socket.id);
        console.log(`👤 المستخدم ${userId} مسجل في WebSocket`);
    });

    socket.on('user_activity', (data) => {
        socket.broadcast.emit('user_status', {
            userId: data.userId,
            status: data.status || 'online'
        });
    });

    socket.on('new_message', (data) => {
        const { orderId, senderId, receiverId, message } = data;
        const receiverSocket = connectedUsers.get(receiverId);
        
        if (receiverSocket) {
            io.to(receiverSocket).emit('order_message', {
                orderId,
                senderId,
                message,
                timestamp: new Date()
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('❌ مستخدم منقطع:', socket.id);
        for (const [userId, socketId] of connectedUsers.entries()) {
            if (socketId === socket.id) {
                connectedUsers.delete(userId);
                break;
            }
        }
    });
});

// ============== Routes ==============

// 1. Routes المصادقة
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, phone, password, role, storeName, vehicleType } = req.body;

        // التحقق من وجود المستخدم
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'البريد الإلكتروني مسجل مسبقاً' });
        }

        // تشفير كلمة المرور
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // إنشاء المستخدم
        const user = new User({
            name,
            email,
            phone,
            password: hashedPassword,
            role,
            storeName: role === 'seller' ? storeName : '',
            vehicleType: role === 'driver' ? vehicleType : ''
        });

        await user.save();

        // إنشاء إشعار ترحيبي
        await createNotification(
            user._id,
            'مرحباً بك في تطبيق قات PRO!',
            'تم إنشاء حسابك بنجاح. يمكنك الآن بدء استخدام التطبيق.',
            'system',
            '/dashboard'
        );

        res.status(201).json({
            message: 'تم إنشاء الحساب بنجاح',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('خطأ في التسجيل:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // البحث عن المستخدم
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
        }

        if (!user.isActive) {
            return res.status(403).json({ message: 'الحساب موقوف' });
        }

        // التحقق من كلمة المرور
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
        }

        // إنشاء رمز الوصول
        const token = jwt.sign(
            { userId: user._id, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'تم تسجيل الدخول بنجاح',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                balance: user.balance
            }
        });
    } catch (error) {
        console.error('خطأ في تسجيل الدخول:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// 2. Routes المستخدمين
app.get('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.put('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const updates = req.body;
        
        // منع تحديث بعض الحقول
        delete updates.password;
        delete updates.email;
        delete updates.balance;

        const user = await User.findByIdAndUpdate(
            req.user._id,
            updates,
            { new: true, runValidators: true }
        ).select('-password');

        res.json({
            message: 'تم تحديث الملف الشخصي بنجاح',
            user
        });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// 3. Routes المنتجات
app.get('/api/products', async (req, res) => {
    try {
        const { category, minPrice, maxPrice, search, sellerId } = req.query;
        const query = { isAvailable: true };

        if (category) query.category = category;
        if (sellerId) query.sellerId = sellerId;
        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = parseFloat(minPrice);
            if (maxPrice) query.price.$lte = parseFloat(maxPrice);
        }
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        const products = await Product.find(query)
            .populate('sellerId', 'name storeName')
            .sort({ createdAt: -1 });

        res.json(products);
    } catch (error) {
        console.error('خطأ في جلب المنتجات:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.post('/api/products', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'seller') {
            return res.status(403).json({ message: 'غير مسموح لك بإضافة منتجات' });
        }

        const product = new Product({
            ...req.body,
            sellerId: req.user._id
        });

        await product.save();

        res.status(201).json({
            message: 'تم إضافة المنتج بنجاح',
            product
        });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.put('/api/products/:id', authenticateToken, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        
        if (!product) {
            return res.status(404).json({ message: 'المنتج غير موجود' });
        }

        // التحقق من ملكية المنتج
        if (product.sellerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'غير مسموح لك بتعديل هذا المنتج' });
        }

        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        res.json({
            message: 'تم تحديث المنتج بنجاح',
            product: updatedProduct
        });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// 4. Routes الطلبات
app.post('/api/orders', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'buyer') {
            return res.status(403).json({ message: 'غير مسموح لك بإنشاء طلبات' });
        }

        const { products, deliveryAddress, paymentMethod, deliveryNotes } = req.body;

        // حساب المبلغ الإجمالي والتأكد من توفر المنتجات
        let totalAmount = 0;
        const orderProducts = [];

        for (const item of products) {
            const product = await Product.findById(item.productId);
            
            if (!product || !product.isAvailable) {
                return res.status(400).json({ 
                    message: `المنتج ${product?.name || 'غير موجود'} غير متوفر` 
                });
            }

            if (product.quantity < item.quantity) {
                return res.status(400).json({ 
                    message: `الكمية المطلوبة للمنتج ${product.name} غير متوفرة` 
                });
            }

            totalAmount += product.price * item.quantity;
            
            orderProducts.push({
                productId: product._id,
                quantity: item.quantity,
                price: product.price
            });

            // تحديث كمية المنتج
            product.quantity -= item.quantity;
            if (product.quantity <= 0) {
                product.isAvailable = false;
            }
            await product.save();
        }

        // الحصول على البائع (أول منتج في الطلب)
        const firstProduct = await Product.findById(products[0].productId);
        const sellerId = firstProduct.sellerId;

        // إنشاء الطلب
        const order = new Order({
            orderNumber: generateOrderNumber(),
            buyerId: req.user._id,
            sellerId: sellerId,
            products: orderProducts,
            totalAmount,
            deliveryAddress,
            paymentMethod,
            deliveryNotes,
            estimatedDelivery: new Date(Date.now() + 24 * 60 * 60 * 1000) // بعد 24 ساعة
        });

        await order.save();

        // إضافة المعاملة للمشتري
        const transaction = new Transaction({
            userId: req.user._id,
            amount: -totalAmount,
            type: 'payment',
            orderId: order._id,
            description: `دفع مقابل الطلب ${order.orderNumber}`,
            balanceAfter: req.user.balance - totalAmount,
            status: paymentMethod === 'cash' ? 'pending' : 'completed'
        });
        await transaction.save();

        // تحديث رصيد المشتري (إذا لم تكن نقداً)
        if (paymentMethod !== 'cash') {
            req.user.balance -= totalAmount;
            await req.user.save();
        }

        // إرسال إشعارات
        await createNotification(
            sellerId,
            'طلب جديد',
            `لديك طلب جديد برقم ${order.orderNumber}`,
            'order',
            `/orders/${order._id}`
        );

        await createNotification(
            req.user._id,
            'تم إنشاء الطلب',
            `تم إنشاء طلبك برقم ${order.orderNumber} بنجاح`,
            'order',
            `/orders/${order._id}`
        );

        // إشعار للسائقين المتاحين عبر WebSocket
        io.emit('new_order_available', {
            orderId: order._id,
            orderNumber: order.orderNumber,
            totalAmount,
            deliveryAddress
        });

        res.status(201).json({
            message: 'تم إنشاء الطلب بنجاح',
            order
        });
    } catch (error) {
        console.error('خطأ في إنشاء الطلب:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.get('/api/orders', authenticateToken, async (req, res) => {
    try {
        let query = {};
        
        switch (req.user.role) {
            case 'buyer':
                query.buyerId = req.user._id;
                break;
            case 'seller':
                query.sellerId = req.user._id;
                break;
            case 'driver':
                query.driverId = req.user._id;
                break;
        }

        const orders = await Order.find(query)
            .populate('buyerId', 'name phone')
            .populate('sellerId', 'name storeName phone')
            .populate('driverId', 'name phone vehicleType')
            .populate('products.productId', 'name price')
            .sort({ createdAt: -1 });

        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.put('/api/orders/:id/accept', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'driver') {
            return res.status(403).json({ message: 'غير مسموح لك بقبول الطلبات' });
        }

        const order = await Order.findById(req.params.id);
        
        if (!order) {
            return res.status(404).json({ message: 'الطلب غير موجود' });
        }

        if (order.status !== 'confirmed') {
            return res.status(400).json({ message: 'الطلب غير جاهز للتسليم' });
        }

        order.driverId = req.user._id;
        order.status = 'on_the_way';
        await order.save();

        // إشعارات
        await createNotification(
            order.buyerId,
            'مندوب التوصيل في الطريق',
            `مندوب التوصيل ${req.user.name} في طريقه إليك`,
            'order',
            `/orders/${order._id}`
        );

        await createNotification(
            order.sellerId,
            'بدء التوصيل',
            `بدأ مندوب التوصيل ${req.user.name} توصيل الطلب ${order.orderNumber}`,
            'order',
            `/orders/${order._id}`
        );

        res.json({
            message: 'تم قبول الطلب بنجاح',
            order
        });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// 5. Routes المحفظة
app.get('/api/wallet/balance', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('balance');
        res.json({ balance: user.balance });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.get('/api/wallet/transactions', authenticateToken, async (req, res) => {
    try {
        const transactions = await Transaction.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50);

        res.json(transactions);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.post('/api/wallet/deposit', authenticateToken, async (req, res) => {
    try {
        const { amount, method } = req.body;

        if (amount <= 0) {
            return res.status(400).json({ message: 'المبلغ يجب أن يكون أكبر من صفر' });
        }

        // تحديث الرصيد
        req.user.balance += amount;
        await req.user.save();

        // تسجيل المعاملة
        const transaction = new Transaction({
            userId: req.user._id,
            amount,
            type: 'deposit',
            description: `إيداع عبر ${method}`,
            balanceAfter: req.user.balance,
            status: 'completed'
        });
        await transaction.save();

        // إشعار
        await createNotification(
            req.user._id,
            'تم الإيداع بنجاح',
            `تم إيداع ${amount} ريال إلى محفظتك`,
            'payment'
        );

        res.json({
            message: 'تم الإيداع بنجاح',
            newBalance: req.user.balance,
            transaction
        });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// 6. Routes الإشعارات
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(20);

        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
        res.json({ message: 'تم تحديث حالة الإشعار' });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.put('/api/notifications/read-all', authenticateToken, async (req, res) => {
    try {
        await Notification.updateMany(
            { userId: req.user._id, isRead: false },
            { isRead: true }
        );
        res.json({ message: 'تم تحديد جميع الإشعارات كمقروءة' });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// 7. Routes الإحصائيات
app.get('/api/stats/dashboard', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        let stats = {};

        switch (user.role) {
            case 'seller':
                stats = {
                    totalProducts: await Product.countDocuments({ sellerId: user._id }),
                    availableProducts: await Product.countDocuments({ 
                        sellerId: user._id, 
                        isAvailable: true 
                    }),
                    totalOrders: await Order.countDocuments({ sellerId: user._id }),
                    pendingOrders: await Order.countDocuments({ 
                        sellerId: user._id, 
                        status: 'pending' 
                    }),
                    monthlyRevenue: await Order.aggregate([
                        { 
                            $match: { 
                                sellerId: user._id,
                                status: 'delivered',
                                createdAt: { 
                                    $gte: new Date(new Date().setDate(new Date().getDate() - 30))
                                }
                            }
                        },
                        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
                    ])
                };
                break;

            case 'buyer':
                stats = {
                    totalOrders: await Order.countDocuments({ buyerId: user._id }),
                    pendingOrders: await Order.countDocuments({ 
                        buyerId: user._id, 
                        status: { $in: ['pending', 'confirmed', 'on_the_way'] } 
                    }),
                    totalSpent: await Order.aggregate([
                        { 
                            $match: { 
                                buyerId: user._id,
                                status: 'delivered'
                            }
                        },
                        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
                    ])
                };
                break;

            case 'driver':
                stats = {
                    deliveredOrders: await Order.countDocuments({ 
                        driverId: user._id, 
                        status: 'delivered' 
                    }),
                    pendingDeliveries: await Order.countDocuments({ 
                        driverId: user._id, 
                        status: 'on_the_way' 
                    }),
                    totalEarnings: await Order.aggregate([
                        { 
                            $match: { 
                                driverId: user._id,
                                status: 'delivered'
                            }
                        },
                        { $group: { _id: null, total: { $sum: { $multiply: ['$totalAmount', 0.1] } } } }
                    ])
                };
                break;
        }

        res.json(stats);
    } catch (error) {
        console.error('خطأ في جلب الإحصائيات:', error);
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// 8. Routes إضافية
app.get('/api/categories', async (req, res) => {
    try {
        const categories = await Product.distinct('category');
        res.json(categories);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.get('/api/drivers/available', authenticateToken, async (req, res) => {
    try {
        const drivers = await User.find({ 
            role: 'driver', 
            isActive: true 
        }).select('name phone vehicleType');

        res.json(drivers);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// صفحة الواجهة الرئيسية
app.get('*', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// بدء الخادم
server.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على: http://localhost:${PORT}`);
    console.log(`📡 WebSocket جاهز للاتصالات`);
});

// معالجة الأخطاء غير المتوقعة
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ رفض غير معالج:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ استثناء غير معالج:', error);
});
