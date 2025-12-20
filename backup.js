const db = require('./database');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

async function backupDatabase() {
    try {
        const backupDir = path.join(__dirname, 'data', 'backups');
        
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        const tables = [
            'users', 'products', 'orders', 'order_items', 'transactions',
            'withdrawals', 'markets', 'wash_stations', 'drivers',
            'ads', 'ad_packages', 'reviews', 'notifications',
            'gift_codes', 'gift_code_uses', 'sellers', 'wallets', 'wash_orders'
        ];
        
        const workbook = xlsx.utils.book_new();
        const backupData = {};
        
        for (const table of tables) {
            try {
                const data = await db.prepare(`SELECT * FROM ${table}`).all();
                backupData[table] = data;
                
                const worksheet = xlsx.utils.json_to_sheet(data);
                xlsx.utils.book_append_sheet(workbook, worksheet, table);
            } catch (error) {
                console.error(`خطأ في جدول ${table}:`, error.message);
            }
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `backup_${timestamp}.xlsx`;
        const filePath = path.join(backupDir, fileName);
        
        xlsx.writeFile(workbook, filePath);
        
        // حذف الملفات القديمة (احتفظ بـ 30 ملفاً فقط)
        const files = fs.readdirSync(backupDir)
            .filter(file => file.startsWith('backup_'))
            .sort()
            .reverse();
        
        if (files.length > 30) {
            const filesToDelete = files.slice(30);
            filesToDelete.forEach(file => {
                fs.unlinkSync(path.join(backupDir, file));
            });
        }
        
        console.log(`✅ تم إنشاء النسخة الاحتياطية: ${fileName}`);
        
        // حفظ كنسخة JSON أيضاً
        const jsonPath = path.join(backupDir, `backup_${timestamp}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(backupData, null, 2));
        
        console.log(`✅ تم حفظ نسخة JSON: ${jsonPath}`);
        
    } catch (error) {
        console.error('❌ خطأ في النسخ الاحتياطي:', error);
    }
}

// تشغيل النسخ الاحتياطي تلقائياً كل 24 ساعة
setInterval(backupDatabase, 24 * 60 * 60 * 1000);

// النسخ الاحتياطي الأولي
backupDatabase();

module.exports = backupDatabase;
