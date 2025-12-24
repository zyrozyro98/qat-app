const { initializeDatabase } = require('./init');
const logger = require('../config/logger');

const migrate = async () => {
    try {
        logger.info('🚀 بدء عملية ترحيل قاعدة البيانات...');
        const db = await initializeDatabase();
        
        // إضافة أي تحديثات إضافية هنا
        logger.info('✅ تم اكتمال الترحيل بنجاح');
        
        db.close();
    } catch (error) {
        logger.error(`❌ خطأ في الترحيل: ${error.message}`);
        process.exit(1);
    }
};

if (require.main === module) {
    migrate();
}

module.exports = { migrate };
