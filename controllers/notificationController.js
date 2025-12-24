const logger = require('../config/logger');

module.exports = (io) => {
    const notificationManager = {
        activeConnections: new Map(),
        
        addConnection(userId, socketId) {
            this.activeConnections.set(userId, socketId);
            logger.info(`🔌 اتصال جديد: المستخدم ${userId}, السوكيت ${socketId}`);
        },
        
        removeConnection(userId) {
            this.activeConnections.delete(userId);
            logger.info(`🔌 اتصال مغلق: المستخدم ${userId}`);
        },
        
        sendNotification(userId, notification) {
            const socketId = this.activeConnections.get(userId);
            if (socketId && io.sockets.sockets.get(socketId)) {
                io.to(socketId).emit('notification', notification);
                logger.info(`🔔 إشعار مرسل للمستخدم ${userId}: ${notification.title}`);
                return true;
            }
            return false;
        }
    };

    // WebSocket handlers
    io.on('connection', (socket) => {
        logger.info(`🌐 اتصال سوكيت جديد: ${socket.id}`);
        
        socket.on('authenticate', ({ userId, token }) => {
            try {
                if (userId && token) {
                    socket.join(`user_${userId}`);
                    socket.userId = userId;
                    notificationManager.addConnection(userId, socket.id);
                    
                    logger.info(`✅ مصادقة ناجحة: المستخدم ${userId} انضم للغرفة`);
                    
                    socket.emit('welcome', {
                        message: 'مرحباً بك في نظام الإشعارات المباشرة',
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (error) {
                logger.error(`❌ خطأ في مصادقة السوكيت: ${error.message}`);
                socket.emit('error', { message: 'فشل المصادقة' });
            }
        });
        
        socket.on('disconnect', () => {
            if (socket.userId) {
                notificationManager.removeConnection(socket.userId);
            }
            logger.info(`🌐 اتصال سوكيت مغلق: ${socket.id}`);
        });
    });

    return notificationManager;
};
