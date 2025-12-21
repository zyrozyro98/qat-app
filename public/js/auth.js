// نظام إدارة المصادقة
class AuthManager {
    constructor(app) {
        this.app = app;
        this.currentUser = null;
    }
    
    // دوال المصادقة
}

// إضافة للكائن العام
if (typeof window !== 'undefined') {
    window.AuthManager = AuthManager;
}
