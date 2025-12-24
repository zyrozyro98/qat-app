const bcrypt = require('bcryptjs');
const moment = require('moment');

class BaseModel {
    constructor(db) {
        this.db = db;
        this.tableName = '';
        this.primaryKey = 'id';
    }

    async create(data) {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = keys.map(() => '?').join(', ');
        
        const sql = `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES (${placeholders})`;
        const result = await this.db.run(sql, values);
        
        return { id: result.lastID, ...data };
    }

    async findById(id) {
        const sql = `SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = ?`;
        return await this.db.get(sql, [id]);
    }

    async findOne(conditions) {
        const keys = Object.keys(conditions);
        const values = Object.values(conditions);
        const whereClause = keys.map(key => `${key} = ?`).join(' AND ');
        
        const sql = `SELECT * FROM ${this.tableName} WHERE ${whereClause} LIMIT 1`;
        return await this.db.get(sql, values);
    }

    async findAll(conditions = {}, options = {}) {
        const { limit = 100, offset = 0, orderBy = 'created_at', order = 'DESC' } = options;
        let sql = `SELECT * FROM ${this.tableName}`;
        const params = [];

        if (Object.keys(conditions).length > 0) {
            const keys = Object.keys(conditions);
            const whereClause = keys.map(key => `${key} = ?`).join(' AND ');
            sql += ` WHERE ${whereClause}`;
            params.push(...Object.values(conditions));
        }

        sql += ` ORDER BY ${orderBy} ${order} LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        return await this.db.all(sql, params);
    }

    async update(id, data) {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const setClause = keys.map(key => `${key} = ?`).join(', ');
        
        const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE ${this.primaryKey} = ?`;
        values.push(id);
        
        await this.db.run(sql, values);
        return await this.findById(id);
    }

    async delete(id) {
        const sql = `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = ?`;
        return await this.db.run(sql, [id]);
    }

    async count(conditions = {}) {
        let sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
        const params = [];

        if (Object.keys(conditions).length > 0) {
            const keys = Object.keys(conditions);
            const whereClause = keys.map(key => `${key} = ?`).join(' AND ');
            sql += ` WHERE ${whereClause}`;
            params.push(...Object.values(conditions));
        }

        const result = await this.db.get(sql, params);
        return result.count;
    }

    async exists(conditions) {
        const result = await this.findOne(conditions);
        return result !== null && result !== undefined;
    }
}

class UserModel extends BaseModel {
    constructor(db) {
        super(db);
        this.tableName = 'users';
    }

    async create(data) {
        // تشفير كلمة المرور
        if (data.password) {
            data.password = await bcrypt.hash(data.password, 12);
        }
        
        data.created_at = moment().format('YYYY-MM-DD HH:mm:ss');
        data.status = data.status || 'active';
        
        return await super.create(data);
    }

    async findByEmail(email) {
        return await this.findOne({ email });
    }

    async findByPhone(phone) {
        return await this.findOne({ phone });
    }

    async verifyPassword(userId, password) {
        const user = await this.findById(userId);
        if (!user) return false;
        
        return await bcrypt.compare(password, user.password);
    }

    async updateLastLogin(userId) {
        const lastLogin = moment().format('YYYY-MM-DD HH:mm:ss');
        return await this.update(userId, { last_login: lastLogin });
    }

    async updateProfile(userId, data) {
        // عدم السماح بتحديث بعض الحقول
        const forbiddenFields = ['id', 'email', 'password', 'role', 'created_at'];
        forbiddenFields.forEach(field => delete data[field]);
        
        data.updated_at = moment().format('YYYY-MM-DD HH:mm:ss');
        return await this.update(userId, data);
    }
}

class ProductModel extends BaseModel {
    constructor(db) {
        super(db);
        this.tableName = 'products';
    }

    async create(data) {
        data.created_at = moment().format('YYYY-MM-DD HH:mm:ss');
        data.status = data.status || 'active';
        
        return await super.create(data);
    }

    async findBySeller(sellerId, options = {}) {
        return await this.findAll({ seller_id: sellerId }, options);
    }

    async findByMarket(marketId, options = {}) {
        return await this.findAll({ market_id: marketId, status: 'active' }, options);
    }

    async updateStock(productId, quantityChange) {
        const product = await this.findById(productId);
        if (!product) return null;
        
        const newQuantity = product.quantity + quantityChange;
        const status = newQuantity > 0 ? 'active' : 'out_of_stock';
        
        return await this.update(productId, {
            quantity: newQuantity,
            status: status,
            updated_at: moment().format('YYYY-MM-DD HH:mm:ss')
        });
    }

    async search(searchTerm, options = {}) {
        const { limit = 20, offset = 0 } = options;
        const sql = `
            SELECT * FROM ${this.tableName}
            WHERE status = 'active'
            AND (name LIKE ? OR description LIKE ? OR specifications LIKE ?)
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        const searchPattern = `%${searchTerm}%`;
        return await this.db.all(sql, [searchPattern, searchPattern, searchPattern, limit, offset]);
    }
}

class OrderModel extends BaseModel {
    constructor(db) {
        super(db);
        this.tableName = 'orders';
    }

    async create(data) {
        data.created_at = moment().format('YYYY-MM-DD HH:mm:ss');
        data.status = data.status || 'pending';
        
        if (!data.order_code) {
            // توليد كود طلب فريد
            const prefix = 'QAT';
            const timestamp = Date.now().toString().slice(-6);
            const random = Math.random().toString(36).substr(2, 4).toUpperCase();
            data.order_code = `${prefix}${timestamp}${random}`;
        }
        
        return await super.create(data);
    }

    async findByBuyer(buyerId, options = {}) {
        return await this.findAll({ buyer_id: buyerId }, options);
    }

    async findBySeller(sellerId, options = {}) {
        const sql = `
            SELECT o.* FROM orders o
            INNER JOIN order_items oi ON o.id = oi.order_id
            WHERE oi.seller_id = ?
            GROUP BY o.id
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        const { limit = 10, offset = 0 } = options;
        return await this.db.all(sql, [sellerId, limit, offset]);
    }

    async findByDriver(driverId, options = {}) {
        return await this.findAll({ driver_id: driverId }, options);
    }

    async updateStatus(orderId, status) {
        return await this.update(orderId, {
            status: status,
            updated_at: moment().format('YYYY-MM-DD HH:mm:ss')
        });
    }

    async getOrderWithItems(orderId) {
        const order = await this.findById(orderId);
        if (!order) return null;

        const sql = `
            SELECT oi.*, p.name as product_name, p.image as product_image,
                   u.name as seller_name, s.store_name
            FROM order_items oi
            LEFT JOIN products p ON oi.product_id = p.id
            LEFT JOIN users u ON oi.seller_id = u.id
            LEFT JOIN sellers s ON oi.seller_id = s.user_id
            WHERE oi.order_id = ?
        `;
        
        const items = await this.db.all(sql, [orderId]);
        order.items = items;
        
        return order;
    }
}

class WalletModel extends BaseModel {
    constructor(db) {
        super(db);
        this.tableName = 'wallets';
    }

    async create(data) {
        data.created_at = moment().format('YYYY-MM-DD HH:mm:ss');
        data.balance = data.balance || 0;
        
        return await super.create(data);
    }

    async findByUser(userId) {
        return await this.findOne({ user_id: userId });
    }

    async updateBalance(userId, amount) {
        const wallet = await this.findByUser(userId);
        if (!wallet) return null;
        
        const newBalance = wallet.balance + amount;
        if (newBalance < 0) {
            throw new Error('رصيد المحفظة غير كافي');
        }
        
        return await this.update(wallet.id, {
            balance: newBalance,
            updated_at: moment().format('YYYY-MM-DD HH:mm:ss')
        });
    }

    async getBalance(userId) {
        const wallet = await this.findByUser(userId);
        return wallet ? wallet.balance : 0;
    }
}

class MarketModel extends BaseModel {
    constructor(db) {
        super(db);
        this.tableName = 'markets';
    }

    async create(data) {
        data.created_at = moment().format('YYYY-MM-DD HH:mm:ss');
        data.status = data.status || 'active';
        
        return await super.create(data);
    }

    async getActiveMarkets() {
        return await this.findAll({ status: 'active' }, { orderBy: 'name', order: 'ASC' });
    }

    async getMarketStats(marketId) {
        const sql = `
            SELECT 
                m.*,
                COUNT(DISTINCT p.id) as product_count,
                COUNT(DISTINCT s.user_id) as seller_count,
                COUNT(DISTINCT d.id) as driver_count,
                COUNT(DISTINCT ws.id) as wash_station_count
            FROM markets m
            LEFT JOIN products p ON m.id = p.market_id AND p.status = 'active'
            LEFT JOIN sellers s ON p.seller_id = s.user_id
            LEFT JOIN drivers d ON m.id = d.market_id AND d.status = 'available'
            LEFT JOIN wash_stations ws ON m.id = ws.market_id AND ws.status = 'active'
            WHERE m.id = ?
            GROUP BY m.id
        `;
        
        return await this.db.get(sql, [marketId]);
    }
}

class TransactionModel extends BaseModel {
    constructor(db) {
        super(db);
        this.tableName = 'transactions';
    }

    async create(data) {
        data.created_at = moment().format('YYYY-MM-DD HH:mm:ss');
        data.status = data.status || 'pending';
        
        if (!data.transaction_id) {
            // توليد كود معاملة فريد
            const prefix = 'TXN';
            const timestamp = Date.now();
            const random = Math.random().toString(36).substr(2, 6).toUpperCase();
            data.transaction_id = `${prefix}${timestamp}${random}`;
        }
        
        return await super.create(data);
    }

    async findByUser(userId, options = {}) {
        return await this.findAll({ user_id: userId }, options);
    }

    async updateStatus(transactionId, status) {
        return await this.update(transactionId, { status: status });
    }

    async getTransactionSummary(userId, startDate, endDate) {
        const sql = `
            SELECT 
                type,
                COUNT(*) as count,
                SUM(amount) as total_amount
            FROM transactions
            WHERE user_id = ? 
            AND created_at BETWEEN ? AND ?
            AND status = 'completed'
            GROUP BY type
        `;
        
        return await this.db.all(sql, [userId, startDate, endDate]);
    }
}

module.exports = {
    BaseModel,
    UserModel,
    ProductModel,
    OrderModel,
    WalletModel,
    MarketModel,
    TransactionModel
};
