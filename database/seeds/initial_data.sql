-- بيانات البداية لتطبيق قات PRO
-- تشغيل هذا الملف بعد إنشاء الجداول

-- إضافة مستخدم مسؤول
INSERT OR IGNORE INTO users (name, email, phone, password, role, status, created_at) 
VALUES (
    'المسؤول الرئيسي',
    'admin@qat.com',
    '777777777',
    '$2a$12$K9q8r6d5f3g2h1j8l0m9n8b7v6c5x4z3a2s1d4f7g8h9j0k1l2m3n4o5p6', -- admin123
    'admin',
    'active',
    datetime('now')
);

-- إضافة سوق افتراضي
INSERT OR IGNORE INTO markets (name, description, location, status, created_at)
VALUES (
    'سوق صنعاء المركزي',
    'أكبر وأشهر سوق للقات في العاصمة صنعاء، يضم أفضل أنواع القات اليمني',
    'صنعاء - شارع الزبيري',
    'active',
    datetime('now')
);

INSERT OR IGNORE INTO markets (name, description, location, status, created_at)
VALUES (
    'سوق تعز',
    'سوق تعز الشهير بأنواع القات المميزة والطازجة',
    'تعز - منطقة القاهرة',
    'active',
    datetime('now')
);

INSERT OR IGNORE INTO markets (name, description, location, status, created_at)
VALUES (
    'سوق الحديدة',
    'سوق الحديدة الساحلي للقات الطازج',
    'الحديدة - شارع الجمهورية',
    'active',
    datetime('now')
);

-- إضافة محطات غسيل
INSERT OR IGNORE INTO wash_stations (market_id, name, location, status, created_at)
SELECT id, 'محطة الغسيل المركزية', 'داخل السوق', 'active', datetime('now')
FROM markets WHERE name = 'سوق صنعاء المركزي';

INSERT OR IGNORE INTO wash_stations (market_id, name, location, status, created_at)
SELECT id, 'محطة الغسيل الشرقية', 'الجهة الشرقية', 'active', datetime('now')
FROM markets WHERE name = 'سوق صنعاء المركزي';

-- إضافة فئات المنتجات
-- (سيتم إضافة المنتجات من خلال الواجهة)

-- ملاحظة: بيانات البائعين والمشتريين والسائقين سيتم إضافتها من خلال التسجيل في التطبيق
