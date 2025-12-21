// أدوات مساعدة لتطبيق قات PRO
class Utils {
    constructor() {
        this.formatters = new Formatters();
        this.validators = new Validators();
        this.storage = new StorageManager();
        this.helpers = new Helpers();
    }
    
    // دوال سريعة للوصول
    static formatCurrency(amount) {
        return new Formatters().currency(amount);
    }
    
    static validateEmail(email) {
        return new Validators().email(email);
    }
    
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    static throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
}

// مصنفات البيانات
class Formatters {
    currency(amount) {
        if (typeof amount !== 'number') {
            amount = parseFloat(amount) || 0;
        }
        
        return new Intl.NumberFormat('ar-YE', {
            style: 'currency',
            currency: 'YER',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    }
    
    date(date, format = 'full') {
        if (!date) return '';
        
        const d = new Date(date);
        
        if (isNaN(d.getTime())) return '';
        
        const formats = {
            short: {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            },
            medium: {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            },
            full: {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            },
            time: {
                hour: '2-digit',
                minute: '2-digit'
            },
            hijri: (date) => {
                // يمكن إضافة دعم للتاريخ الهجري هنا
                return this.date(date, 'medium');
            }
        };
        
        if (format === 'hijri') {
            return formats.hijri(date);
        }
        
        return d.toLocaleDateString('ar-SA', formats[format] || formats.medium);
    }
    
    phone(phoneNumber) {
        if (!phoneNumber) return '';
        
        // تنسيق رقم الهاتف اليمني
        const cleaned = phoneNumber.toString().replace(/\D/g, '');
        
        if (cleaned.length === 9) {
            return cleaned.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
        } else if (cleaned.length === 10) {
            return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
        }
        
        return phoneNumber;
    }
    
    truncate(text, length = 100) {
        if (!text || text.length <= length) return text;
        
        return text.substring(0, length) + '...';
    }
    
    percentage(value, total) {
        if (!total || total === 0) return '0%';
        
        const percentage = (value / total) * 100;
        return `${percentage.toFixed(1)}%`;
    }
}

// المدققون
class Validators {
    email(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
    
    phone(phone) {
        const re = /^(77|73|71|70)\d{7}$/;
        return re.test(phone.toString().replace(/\D/g, ''));
    }
    
    password(password) {
        // كلمة مرور قوية: 8 أحرف على الأقل، تحتوي على حروف كبيرة وصغيرة وأرقام
        const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
        return re.test(password);
    }
    
    yemeniId(id) {
        // تحقق من الرقم الوطني اليمني (10 أرقام)
        const re = /^\d{10}$/;
        return re.test(id);
    }
    
    required(value) {
        return value !== null && value !== undefined && value.toString().trim() !== '';
    }
    
    minLength(value, min) {
        return value && value.length >= min;
    }
    
    maxLength(value, max) {
        return value && value.length <= max;
    }
    
    number(value, min = null, max = null) {
        const num = parseFloat(value);
        if (isNaN(num)) return false;
        
        if (min !== null && num < min) return false;
        if (max !== null && num > max) return false;
        
        return true;
    }
    
    date(value) {
        const date = new Date(value);
        return !isNaN(date.getTime());
    }
}

// مدير التخزين
class StorageManager {
    constructor() {
        this.prefix = 'qat_';
    }
    
    set(key, value, ttl = null) {
        const item = {
            value: value,
            expires: ttl ? Date.now() + (ttl * 1000) : null
        };
        
        try {
            localStorage.setItem(this.prefix + key, JSON.stringify(item));
            return true;
        } catch (error) {
            console.error('❌ خطأ في حفظ البيانات:', error);
            return false;
        }
    }
    
    get(key) {
        try {
            const item = localStorage.getItem(this.prefix + key);
            if (!item) return null;
            
            const parsed = JSON.parse(item);
            
            // التحقق من انتهاء الصلاحية
            if (parsed.expires && Date.now() > parsed.expires) {
                this.remove(key);
                return null;
            }
            
            return parsed.value;
        } catch (error) {
            console.error('❌ خطأ في قراءة البيانات:', error);
            return null;
        }
    }
    
    remove(key) {
        try {
            localStorage.removeItem(this.prefix + key);
            return true;
        } catch (error) {
            console.error('❌ خطأ في حذف البيانات:', error);
            return false;
        }
    }
    
    clear(prefixOnly = true) {
        try {
            if (prefixOnly) {
                // حذف المفاتيح التي تبدأ بالبادئة فقط
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key.startsWith(this.prefix)) {
                        localStorage.removeItem(key);
                        i--; // لأن الطول تغير
                    }
                }
            } else {
                localStorage.clear();
            }
            return true;
        } catch (error) {
            console.error('❌ خطأ في مسح التخزين:', error);
            return false;
        }
    }
    
    exists(key) {
        return this.get(key) !== null;
    }
    
    // تخزين الجلسة (يتم مسحه عند إغلاق المتصفح)
    setSession(key, value) {
        try {
            sessionStorage.setItem(this.prefix + key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('❌ خطأ في حفظ الجلسة:', error);
            return false;
        }
    }
    
    getSession(key) {
        try {
            const item = sessionStorage.getItem(this.prefix + key);
            return item ? JSON.parse(item) : null;
        } catch (error) {
            console.error('❌ خطأ في قراءة الجلسة:', error);
            return null;
        }
    }
}

// مساعدات إضافية
class Helpers {
    generateId(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    
    generateOrderCode() {
        const prefix = 'QAT';
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.random().toString(36).substr(2, 4).toUpperCase();
        return `${prefix}${timestamp}${random}`;
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 بايت';
        
        const k = 1024;
        const sizes = ['بايت', 'كيلوبايت', 'ميجابايت', 'جيجابايت'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    slugify(text) {
        return text
            .toString()
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')           // استبدال المسافات بشرطة
            .replace(/[^\w\-]+/g, '')       // إزالة الحروف غير المرغوبة
            .replace(/\-\-+/g, '-')         // استبدال الشرطات المتعددة بشرطة واحدة
            .replace(/^-+/, '')             // إزالة الشرطات من البداية
            .replace(/-+$/, '');            // إزالة الشرطات من النهاية
    }
    
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            console.error('❌ خطأ في النسخ للحافظة:', error);
            
            // طريقة بديلة
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                document.execCommand('copy');
                document.body.removeChild(textArea);
                return true;
            } catch (err) {
                document.body.removeChild(textArea);
                return false;
            }
        }
    }
    
    detectDevice() {
        const ua = navigator.userAgent;
        
        return {
            isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua),
            isTablet: /iPad|Android(?!.*Mobile)|Tablet/i.test(ua),
            isDesktop: !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua),
            isIOS: /iPad|iPhone|iPod/.test(ua),
            isAndroid: /Android/.test(ua),
            isWindows: /Windows/.test(ua),
            isMac: /Mac/.test(ua),
            isLinux: /Linux/.test(ua)
        };
    }
    
    getBrowser() {
        const ua = navigator.userAgent;
        
        if (ua.includes('Chrome') && !ua.includes('Edge')) return 'chrome';
        if (ua.includes('Firefox')) return 'firefox';
        if (ua.includes('Safari') && !ua.includes('Chrome')) return 'safari';
        if (ua.includes('Edge')) return 'edge';
        if (ua.includes('Opera') || ua.includes('OPR')) return 'opera';
        if (ua.includes('Trident') || ua.includes('MSIE')) return 'ie';
        
        return 'unknown';
    }
    
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
    
    mergeObjects(target, source) {
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key] || typeof target[key] !== 'object') {
                    target[key] = {};
                }
                this.mergeObjects(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }
    
    debounce(func, wait, immediate = false) {
        let timeout;
        return function() {
            const context = this;
            const args = arguments;
            
            const later = function() {
                timeout = null;
                if (!immediate) func.apply(context, args);
            };
            
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            
            if (callNow) func.apply(context, args);
        };
    }
    
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    formatNumberWithCommas(number) {
        return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // نصف قطر الأرض بالكيلومتر
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; // المسافة بالكيلومتر
    }
    
    deg2rad(deg) {
        return deg * (Math.PI/180);
    }
}

// مصنف API
class ApiClient {
    constructor(baseUrl = '/api') {
        this.baseUrl = baseUrl;
        this.defaultHeaders = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
    }
    
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = { ...this.defaultHeaders, ...options.headers };
        
        const config = {
            ...options,
            headers,
            credentials: 'include'
        };
        
        try {
            const response = await fetch(url, config);
            
            // تحويل النص أولاً ثم JSON
            const text = await response.text();
            let data;
            
            try {
                data = text ? JSON.parse(text) : {};
            } catch (e) {
                data = { message: text };
            }
            
            if (!response.ok) {
                throw {
                    status: response.status,
                    statusText: response.statusText,
                    data: data
                };
            }
            
            return {
                success: true,
                data: data.data || data,
                meta: data.meta,
                status: response.status
            };
        } catch (error) {
            console.error('❌ خطأ في طلب API:', error);
            
            return {
                success: false,
                error: error.data?.error || 'حدث خطأ في الاتصال بالخادم',
                details: error.data?.details,
                status: error.status
            };
        }
    }
    
    async get(endpoint, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;
        
        return this.request(url, {
            method: 'GET'
        });
    }
    
    async post(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
    
    async put(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }
    
    async patch(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    }
    
    async delete(endpoint) {
        return this.request(endpoint, {
            method: 'DELETE'
        });
    }
    
    async upload(endpoint, formData) {
        return this.request(endpoint, {
            method: 'POST',
            headers: {}, // سيتم تعيينه تلقائياً للـ FormData
            body: formData
        });
    }
}

// مصنف الإشعارات
class NotificationManager {
    constructor() {
        this.containerId = 'notificationsContainer';
        this.maxNotifications = 5;
        this.notifications = [];
    }
    
    show(type, message, duration = 5000) {
        const notification = {
            id: Date.now() + Math.random(),
            type,
            message,
            duration,
            timestamp: new Date()
        };
        
        this.notifications.unshift(notification);
        
        if (this.notifications.length > this.maxNotifications) {
            this.notifications.pop();
        }
        
        this.render();
        
        // إزالة الإشعار تلقائياً
        if (duration > 0) {
            setTimeout(() => {
                this.remove(notification.id);
            }, duration);
        }
        
        return notification.id;
    }
    
    success(message, duration = 5000) {
        return this.show('success', message, duration);
    }
    
    error(message, duration = 5000) {
        return this.show('error', message, duration);
    }
    
    warning(message, duration = 5000) {
        return this.show('warning', message, duration);
    }
    
    info(message, duration = 5000) {
        return this.show('info', message, duration);
    }
    
    remove(id) {
        this.notifications = this.notifications.filter(n => n.id !== id);
        this.render();
    }
    
    clear() {
        this.notifications = [];
        this.render();
    }
    
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        
        container.innerHTML = this.notifications.map(notification => `
            <div class="notification notification-${notification.type}" 
                 data-id="${notification.id}">
                <div class="notification-content">
                    <i class="fas fa-${this.getIcon(notification.type)}"></i>
                    <span>${notification.message}</span>
                </div>
                <button class="notification-close" 
                        onclick="window.utils.notification.remove('${notification.id}')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    }
    
    getIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }
}

// تصدير الأدوات للاستخدام العام
if (typeof window !== 'undefined') {
    window.utils = new Utils();
    window.api = new ApiClient();
    window.notification = new NotificationManager();
    
    // دوال سريعة للاستخدام
    window.formatCurrency = Utils.formatCurrency;
    window.validateEmail = Utils.validateEmail;
    window.debounce = Utils.debounce;
    window.throttle = Utils.throttle;
}
