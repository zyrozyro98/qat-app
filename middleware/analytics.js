const geoip = require('geoip-lite');
const uaParser = require('ua-parser-js');
const logger = require('../config/logger');

const analyticsMiddleware = (req, res, next) => {
    req.analytics = {
        timestamp: new Date().toISOString(),
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent'),
        method: req.method,
        path: req.path,
        query: req.query,
        user: req.session.userId || 'guest'
    };
    
    const geo = geoip.lookup(req.ip);
    const ua = uaParser(req.get('user-agent'));
    
    req.analytics.geo = geo || {};
    req.analytics.device = {
        browser: `${ua.browser.name} ${ua.browser.version}`,
        os: `${ua.os.name} ${ua.os.version}`,
        device: ua.device.type || 'desktop'
    };
    
    // تسجيل الطلبات المهمة فقط
    if (!req.path.includes('/health') && !req.path.includes('/status')) {
        logger.info(`📊 ${req.method} ${req.path} - ${req.analytics.user} - ${req.analytics.device.browser}`);
    }
    
    next();
};

module.exports = analyticsMiddleware;
