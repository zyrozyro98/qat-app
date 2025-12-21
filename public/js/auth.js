/**
 * تطبيق قات PRO - إدارة المصادقة
 * ملف JavaScript لمعالجة تسجيل الدخول والتسجيل
 */

// حالة المصادقة
const AuthState = {
    isAuthenticated: false,
    user: null,
    token: null,
    sessionExpiry: null
};

// تهيئة المصادقة
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔐 تهيئة نظام المصادقة...');
    
    // التحقق من جلسة موجودة
    checkExistingSession();
    
    // إعداد مستمعي الأحداث
    setupAuthEventListeners();
    
    // إعداد التحقق من الصحة للنماذج
    setupFormValidation();
});

// التحقق من جلسة موجودة
async function checkExistingSession() {
    try {
        const token = localStorage.getItem('qat_token');
        const userId = localStorage.getItem('qat_user_id');
        const userData = localStorage.getItem('qat_user_data');
        
        if (!token || !userId) {
            console.log('⚠️ لا توجد جلسة نشطة');
            return;
        }
        
        // التحقق من صلاحية التوكن
        const response = await fetch('/api/auth/check', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.isAuthenticated && data.user) {
                AuthState.isAuthenticated = true;
                AuthState.user = data.user;
                AuthState.token = token;
                
                console.log('✅ جلسة نشطة للمستخدم:', data.user.name);
                
                // توجيه إلى لوحة التحكم
                window.location.href = '/dashboard.html';
            } else {
                clearAuthStorage();
            }
        } else {
            clearAuthStorage();
        }
    } catch (error) {
        console.error('❌ خطأ في التحقق من الجلسة:', error);
        clearAuthStorage();
    }
}

// إعداد مستمعي الأحداث
function setupAuthEventListeners() {
    // مستمعات نموذج تسجيل الدخول
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        const loginEmail = document.getElementById('loginEmail');
        const loginPassword = document.getElementById('loginPassword');
        
        if (loginEmail && loginPassword) {
            loginEmail.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    loginPassword.focus();
                }
            });
            
            loginPassword.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLogin();
                }
            });
        }
    }
    
    // مستمعات نموذج التسجيل
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        const regPassword = document.getElementById('regPassword');
        const regConfirmPassword = document.getElementById('regConfirmPassword');
        
        if (regPassword && regConfirmPassword) {
            regPassword.addEventListener('input', validatePasswordMatch);
            regConfirmPassword.addEventListener('input', validatePasswordMatch);
        }
    }
}

// إعداد التحقق من صحة النماذج
function setupFormValidation() {
    // التحقق من البريد الإلكتروني
    const emailInputs = document.querySelectorAll('input[type="email"]');
    emailInputs.forEach(input => {
        input.addEventListener('blur', validateEmail);
    });
    
    // التحقق من الهاتف
    const phoneInputs = document.querySelectorAll('input[type="tel"]');
    phoneInputs.forEach(input => {
        input.addEventListener('blur', validatePhone);
    });
    
    // التحقق من كلمة المرور
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    passwordInputs.forEach(input => {
        input.addEventListener('blur', validatePasswordStrength);
    });
}

// التحقق من البريد الإلكتروني
function validateEmail(e) {
    const input = e.target;
    const email = input.value.trim();
    const errorElement = document.getElementById(`${input.id}Error`) || 
                         input.parentElement.querySelector('.error-message');
    
    if (!errorElement) return;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!email) {
        showError(input, errorElement, 'البريد الإلكتروني مطلوب');
        return false;
    }
    
    if (!emailRegex.test(email)) {
        showError(input, errorElement, 'البريد الإلكتروني غير صحيح');
        return false;
    }
    
    clearError(input, errorElement);
    return true;
}

// التحقق من الهاتف
function validatePhone(e) {
    const input = e.target;
    const phone = input.value.trim();
    const errorElement = document.getElementById(`${input.id}Error`) || 
                         input.parentElement.querySelector('.error-message');
    
    if (!errorElement) return;
    
    const phoneRegex = /^[0-9]{9,15}$/;
    
    if (!phone) {
        showError(input, errorElement, 'رقم الهاتف مطلوب');
        return false;
    }
    
    if (!phoneRegex.test(phone)) {
        showError(input, errorElement, 'رقم الهاتف غير صحيح (9-15 رقم)');
        return false;
    }
    
    clearError(input, errorElement);
    return true;
}

// التحقق من قوة كلمة المرور
function validatePasswordStrength(e) {
    const input = e.target;
    const password = input.value;
    const errorElement = document.getElementById(`${input.id}Error`) || 
                         input.parentElement.querySelector('.error-message');
    
    if (!errorElement) return;
    
    if (!password) {
        showError(input, errorElement, 'كلمة المرور مطلوبة');
        return false;
    }
    
    if (password.length < 6) {
        showError(input, errorElement, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل');
        return false;
    }
    
    clearError(input, errorElement);
    return true;
}

// التحقق من تطابق كلمات المرور
function validatePasswordMatch() {
    const password = document.getElementById('regPassword');
    const confirmPassword = document.getElementById('regConfirmPassword');
    
    if (!password || !confirmPassword) return;
    
    const errorElement = confirmPassword.parentElement.querySelector('.error-message');
    
    if (!errorElement) return;
    
    if (password.value !== confirmPassword.value) {
        showError(confirmPassword, errorElement, 'كلمات المرور غير متطابقة');
        return false;
    }
    
    clearError(confirmPassword, errorElement);
    return true;
}

// إظهار الخطأ
function showError(input, errorElement, message) {
    input.classList.add('is-invalid');
    errorElement.textContent = message;
    errorElement.classList.add('show');
}

// مسح الخطأ
function clearError(input, errorElement) {
    input.classList.remove('is-invalid');
    errorElement.textContent = '';
    errorElement.classList.remove('show');
}

// إظهار تبويب المصادقة
function showAuthTab(tabName) {
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    if (tabName === 'login') {
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    } else {
        registerTab.classList.add('active');
        loginTab.classList.remove('active');
        registerForm.style.display = 'block';
        loginForm.style.display = 'none';
    }
    
    // إعادة تعيين النماذج
    clearFormErrors();
}

// تبديل حقول الدور
function toggleRoleFields() {
    const role = document.getElementById('regRole').value;
    const storeField = document.getElementById('storeField');
    const vehicleField = document.getElementById('vehicleField');
    
    if (role === 'seller') {
        storeField.style.display = 'block';
        vehicleField.style.display = 'none';
        document.getElementById('regStore').required = true;
        document.getElementById('regVehicle').required = false;
    } else if (role === 'driver') {
        vehicleField.style.display = 'block';
        storeField.style.display = 'none';
        document.getElementById('regVehicle').required = true;
        document.getElementById('regStore').required = false;
    } else {
        storeField.style.display = 'none';
        vehicleField.style.display = 'none';
        document.getElementById('regStore').required = false;
        document.getElementById('regVehicle').required = false;
    }
}

// معالجة تسجيل الدخول
async function handleLogin() {
    try {
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        
        // التحقق من الصحة
        if (!validateLoginForm()) {
            return;
        }
        
        // إظهار حالة التحميل
        const loginBtn = document.getElementById('loginButton');
        const originalText = loginBtn.innerHTML;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري تسجيل الدخول...';
        loginBtn.disabled = true;
        
        // إرسال طلب تسجيل الدخول
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                password: password
            })
        });
        
        const data = await response.json();
        
        // إعادة زر تسجيل الدخول إلى حالته الأصلية
        loginBtn.innerHTML = originalText;
        loginBtn.disabled = false;
        
        if (response.ok && data.success) {
            // حفظ بيانات المصادقة
            saveAuthData(data);
            
            // إظهار رسالة نجاح
            showMessage('success', data.message || 'تم تسجيل الدخول بنجاح');
            
            // توجيه إلى لوحة التحكم بعد تأخير بسيط
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 1500);
            
        } else {
            // إظهار رسالة الخطأ
            showMessage('error', data.error || 'فشل تسجيل الدخول');
            
            // إظهار أخطاء النموذج إذا وجدت
            if (data.errors) {
                displayFormErrors(data.errors);
            }
        }
        
    } catch (error) {
        console.error('❌ خطأ في تسجيل الدخول:', error);
        
        // إعادة زر تسجيل الدخول إلى حالته الأصلية
        const loginBtn = document.getElementById('loginButton');
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> تسجيل الدخول';
        loginBtn.disabled = false;
        
        // إظهار رسالة الخطأ
        showMessage('error', 'حدث خطأ في الاتصال بالخادم. يرجى المحاولة مرة أخرى.');
    }
}

// معالجة التسجيل
async function handleRegister() {
    try {
        // جمع بيانات النموذج
        const formData = {
            name: document.getElementById('regName').value.trim(),
            email: document.getElementById('regEmail').value.trim(),
            phone: document.getElementById('regPhone').value.trim(),
            password: document.getElementById('regPassword').value,
            role: document.getElementById('regRole').value
        };
        
        // إضافة بيانات إضافية حسب الدور
        if (formData.role === 'seller') {
            formData.storeName = document.getElementById('regStore').value.trim();
        } else if (formData.role === 'driver') {
            formData.vehicleType = document.getElementById('regVehicle').value.trim();
        }
        
        // التحقق من الصحة
        if (!validateRegisterForm()) {
            return;
        }
        
        // إظهار حالة التحميل
        const registerBtn = document.getElementById('registerButton');
        const originalText = registerBtn.innerHTML;
        registerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري إنشاء الحساب...';
        registerBtn.disabled = true;
        
        // إرسال طلب التسجيل
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        // إعادة زر التسجيل إلى حالته الأصلية
        registerBtn.innerHTML = originalText;
        registerBtn.disabled = false;
        
        if (response.ok && data.success) {
            // إظهار رسالة النجاح
            showMessage('success', data.message || 'تم إنشاء الحساب بنجاح');
            
            // حفظ بيانات المصادقة إذا تم التسجيل الدخول تلقائياً
            if (data.user && data.token) {
                saveAuthData(data);
                
                // توجيه إلى لوحة التحكم بعد تأخير بسيط
                setTimeout(() => {
                    window.location.href = '/dashboard.html';
                }, 2000);
            } else {
                // التبديل إلى تبويب تسجيل الدخول
                setTimeout(() => {
                    showAuthTab('login');
                    document.getElementById('loginEmail').value = formData.email;
                    document.getElementById('loginPassword').value = '';
                    document.getElementById('loginEmail').focus();
                }, 1500);
            }
            
        } else {
            // إظهار رسالة الخطأ
            showMessage('error', data.error || 'فشل إنشاء الحساب');
            
            // إظهار أخطاء النموذج إذا وجدت
            if (data.errors) {
                displayFormErrors(data.errors);
            }
        }
        
    } catch (error) {
        console.error('❌ خطأ في التسجيل:', error);
        
        // إعادة زر التسجيل إلى حالته الأصلية
        const registerBtn = document.getElementById('registerButton');
        registerBtn.innerHTML = '<i class="fas fa-user-plus"></i> إنشاء الحساب';
        registerBtn.disabled = false;
        
        // إظهار رسالة الخطأ
        showMessage('error', 'حدث خطأ في الاتصال بالخادم. يرجى المحاولة مرة أخرى.');
    }
}

// التحقق من صحة نموذج تسجيل الدخول
function validateLoginForm() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    let isValid = true;
    
    // التحقق من البريد الإلكتروني
    if (!email) {
        showFieldError('loginEmail', 'البريد الإلكتروني مطلوب');
        isValid = false;
    } else {
        clearFieldError('loginEmail');
    }
    
    // التحقق من كلمة المرور
    if (!password) {
        showFieldError('loginPassword', 'كلمة المرور مطلوبة');
        isValid = false;
    } else {
        clearFieldError('loginPassword');
    }
    
    return isValid;
}

// التحقق من صحة نموذج التسجيل
function validateRegisterForm() {
    const formData = {
        name: document.getElementById('regName').value.trim(),
        email: document.getElementById('regEmail').value.trim(),
        phone: document.getElementById('regPhone').value.trim(),
        password: document.getElementById('regPassword').value,
        confirmPassword: document.getElementById('regConfirmPassword').value,
        role: document.getElementById('regRole').value
    };
    
    let isValid = true;
    
    // التحقق من الاسم
    if (!formData.name) {
        showFieldError('regName', 'الاسم الكامل مطلوب');
        isValid = false;
    } else {
        clearFieldError('regName');
    }
    
    // التحقق من البريد الإلكتروني
    if (!formData.email) {
        showFieldError('regEmail', 'البريد الإلكتروني مطلوب');
        isValid = false;
    } else if (!isValidEmail(formData.email)) {
        showFieldError('regEmail', 'البريد الإلكتروني غير صحيح');
        isValid = false;
    } else {
        clearFieldError('regEmail');
    }
    
    // التحقق من الهاتف
    if (!formData.phone) {
        showFieldError('regPhone', 'رقم الهاتف مطلوب');
        isValid = false;
    } else if (!isValidPhone(formData.phone)) {
        showFieldError('regPhone', 'رقم الهاتف غير صحيح');
        isValid = false;
    } else {
        clearFieldError('regPhone');
    }
    
    // التحقق من الدور
    if (!formData.role) {
        showFieldError('regRole', 'نوع الحساب مطلوب');
        isValid = false;
    } else {
        clearFieldError('regRole');
        
        // التحقق من الحقول الإضافية حسب الدور
        if (formData.role === 'seller') {
            const storeName = document.getElementById('regStore').value.trim();
            if (!storeName) {
                showFieldError('regStore', 'اسم المتجر مطلوب');
                isValid = false;
            } else {
                clearFieldError('regStore');
            }
        } else if (formData.role === 'driver') {
            const vehicleType = document.getElementById('regVehicle').value.trim();
            if (!vehicleType) {
                showFieldError('regVehicle', 'نوع المركبة مطلوب');
                isValid = false;
            } else {
                clearFieldError('regVehicle');
            }
        }
    }
    
    // التحقق من كلمة المرور
    if (!formData.password) {
        showFieldError('regPassword', 'كلمة المرور مطلوبة');
        isValid = false;
    } else if (formData.password.length < 6) {
        showFieldError('regPassword', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل');
        isValid = false;
    } else {
        clearFieldError('regPassword');
    }
    
    // التحقق من تأكيد كلمة المرور
    if (!formData.confirmPassword) {
        showFieldError('regConfirmPassword', 'تأكيد كلمة المرور مطلوب');
        isValid = false;
    } else if (formData.password !== formData.confirmPassword) {
        showFieldError('regConfirmPassword', 'كلمات المرور غير متطابقة');
        isValid = false;
    } else {
        clearFieldError('regConfirmPassword');
    }
    
    return isValid;
}

// التحقق من صحة البريد الإلكتروني
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// التحقق من صحة الهاتف
function isValidPhone(phone) {
    const phoneRegex = /^[0-9]{9,15}$/;
    return phoneRegex.test(phone);
}

// إظهار خطأ لحقل معين
function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const errorElement = document.getElementById(`${fieldId}Error`) || 
                         field.parentElement.querySelector('.error-message');
    
    if (field && errorElement) {
        field.classList.add('is-invalid');
        errorElement.textContent = message;
        errorElement.classList.add('show');
    }
}

// مسح خطأ لحقل معين
function clearFieldError(fieldId) {
    const field = document.getElementById(fieldId);
    const errorElement = document.getElementById(`${fieldId}Error`) || 
                         field.parentElement.querySelector('.error-message');
    
    if (field && errorElement) {
        field.classList.remove('is-invalid');
        errorElement.textContent = '';
        errorElement.classList.remove('show');
    }
}

// مسح جميع أخطاء النماذج
function clearFormErrors() {
    const errorMessages = document.querySelectorAll('.error-message');
    errorMessages.forEach(error => {
        error.textContent = '';
        error.classList.remove('show');
    });
    
    const invalidFields = document.querySelectorAll('.is-invalid');
    invalidFields.forEach(field => {
        field.classList.remove('is-invalid');
    });
}

// إظهار أخطاء النموذج من الخادم
function displayFormErrors(errors) {
    clearFormErrors();
    
    errors.forEach(error => {
        const fieldId = mapServerErrorToField(error.param);
        if (fieldId) {
            showFieldError(fieldId, error.msg);
        }
    });
}

// تعيين أخطاء الخادم للحقول المحلية
function mapServerErrorToField(param) {
    const mapping = {
        'name': 'regName',
        'email': 'regEmail',
        'phone': 'regPhone',
        'password': 'regPassword',
        'role': 'regRole',
        'storeName': 'regStore',
        'vehicleType': 'regVehicle'
    };
    
    return mapping[param] || null;
}

// حفظ بيانات المصادقة
function saveAuthData(data) {
    try {
        localStorage.setItem('qat_token', data.token);
        localStorage.setItem('qat_user_id', data.user.id);
        localStorage.setItem('qat_user_data', JSON.stringify(data.user));
        
        // تحديث حالة المصادقة
        AuthState.isAuthenticated = true;
        AuthState.user = data.user;
        AuthState.token = data.token;
        AuthState.sessionExpiry = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 أيام
        
        console.log('✅ تم حفظ بيانات المصادقة');
        
    } catch (error) {
        console.error('❌ خطأ في حفظ بيانات المصادقة:', error);
    }
}

// مسح بيانات المصادقة
function clearAuthStorage() {
    localStorage.removeItem('qat_token');
    localStorage.removeItem('qat_user_id');
    localStorage.removeItem('qat_user_data');
    
    AuthState.isAuthenticated = false;
    AuthState.user = null;
    AuthState.token = null;
    AuthState.sessionExpiry = null;
    
    console.log('🧹 تم مسح بيانات المصادقة');
}

// إظهار رسالة
function showMessage(type, text) {
    const messagesDiv = document.getElementById('messages');
    
    if (!messagesDiv) {
        createMessagesContainer();
    }
    
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 
                         type === 'error' ? 'exclamation-circle' : 
                         type === 'warning' ? 'exclamation-triangle' : 
                         'info-circle'}"></i>
        <span>${text}</span>
        <button class="close-btn" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    document.getElementById('messages').appendChild(message);
    
    setTimeout(() => {
        if (message.parentElement) {
            message.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (message.parentElement) {
                    message.remove();
                }
            }, 300);
        }
    }, 5000);
}

// إنشاء حاوية الرسائل
function createMessagesContainer() {
    const div = document.createElement('div');
    div.id = 'messages';
    document.body.appendChild(div);
    return div;
}

// تسجيل الخروج
async function logout() {
    try {
        const token = localStorage.getItem('qat_token');
        
        if (token) {
            await fetch('/api/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
        }
        
    } catch (error) {
        console.error('❌ خطأ في تسجيل الخروج:', error);
    } finally {
        clearAuthStorage();
        window.location.href = '/';
    }
}

// التحقق من صلاحية الجلسة
function isSessionValid() {
    if (!AuthState.token || !AuthState.sessionExpiry) {
        return false;
    }
    
    return Date.now() < AuthState.sessionExpiry;
}

// تجديد الجلسة
async function refreshSession() {
    try {
        const token = localStorage.getItem('qat_token');
        
        if (!token) {
            return false;
        }
        
        const response = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.token) {
                localStorage.setItem('qat_token', data.token);
                AuthState.token = data.token;
                AuthState.sessionExpiry = Date.now() + (7 * 24 * 60 * 60 * 1000);
                return true;
            }
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ خطأ في تجديد الجلسة:', error);
        return false;
    }
}

// تصدير الدوال الهامة
window.showAuthTab = showAuthTab;
window.toggleRoleFields = toggleRoleFields;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.logout = logout;

console.log('✅ نظام المصادقة جاهز للاستخدام');
