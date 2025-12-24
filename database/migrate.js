const fs = require('fs').promises;
const path = require('path');
const database = require('../config/database');

async function runMigration() {
    try {
        console.log('🚀 بدء عملية هجرة قاعدة البيانات...');
        
        // قراءة ملف الهجرة
        const migrationPath = path.join(__dirname, 'migrations', '001_initial_schema.sql');
        const migrationSQL = await fs.readFile(migrationPath, 'utf8');
        
        // تنفيذ الهجرة
        await database.exec(migrationSQL);
        console.log('✅ تم تنفيذ هجرة الجداول بنجاح');
        
        // قراءة وتنفيذ بيانات البداية
        const seedsPath = path.join(__dirname, 'seeds', 'initial_data.sql');
        const seedsSQL = await fs.readFile(seedsPath, 'utf8');
        
        await database.exec(seedsSQL);
        console.log('✅ تم إضافة بيانات البداية بنجاح');
        
        // التحقق من الهجرة
        const tables = await database.all(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        `);
        
        console.log('📊 الجداول المنشأة:');
        tables.forEach(table => {
            console.log(`   - ${table.name}`);
        });
        
        console.log('🎉 اكتملت عملية الهجرة بنجاح!');
        
    } catch (error) {
        console.error('❌ خطأ في عملية الهجرة:', error.message);
        process.exit(1);
    }
}

// تشغيل الهجرة إذا تم تنفيذ الملف مباشرة
if (require.main === module) {
    runMigration().then(() => {
        database.close();
        process.exit(0);
    }).catch(error => {
        console.error('❌ فشل في عملية الهجرة:', error);
        database.close();
        process.exit(1);
    });
}

module.exports = runMigration;
