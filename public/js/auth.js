// auth.js - إدارة المصادقة
async function showTab(tabName) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const loginTab = document.querySelector('.tab-btn.active');
    const registerTab = document.querySelectorAll('.tab-btn')[1];

    if (tabName === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        loginTab.classList.remove('active');
        registerTab.classList.add('active');
    }
}

function toggleRoleFields() {
    const role = document.getElementById('regRole').value;
    const storeField = document.getElementById('storeField');
    const vehicleField = document.getElementById('vehicleField');

    storeField.style.display = role === 'seller' ? 'block' : 'none';
    vehicleField.style.display = role === 'driver' ? 'block' : 'none';
}

function showMessage(type, text) {
    const messagesDiv = document.getElementById('messages');
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
        <span>${text}</span>
    `;
    messagesDiv.appendChild(message);

    setTimeout(() => {
        message.remove();
    }, 5000);
}

async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (!email || !password) {
        showMessage('error', 'يرجى ملء جميع الحقول');
        return;
    }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (data.success) {
            showMessage('success', 'تم تسجيل الدخول بنجاح');
            localStorage.setItem('token', data.user.id);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            // إعادة التوجيه إلى لوحة التحكم بعد 2 ثانية
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 2000);
        } else {
            showMessage('error', data.error || 'فشل تسجيل الدخول');
        }
    } catch (error) {
        showMessage('error', 'حدث خطأ في الاتصال بالخادم');
        console.error('Login error:', error);
    }
}

async function register() {
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const phone = document.getElementById('regPhone').value;
    const role = document.getElementById('regRole').value;
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    const storeName = document.getElementById('regStore').value;
    const vehicleType = document.getElementById('regVehicle').value;

    // التحقق من كلمات المرور
    if (password !== confirmPassword) {
        showMessage('error', 'كلمتا المرور غير متطابقتين');
        return;
    }

    // التحقق من الحقول المطلوبة بناءً على الدور
    if (role === 'seller' && !storeName) {
        showMessage('error', 'يرجى إدخال اسم المتجر');
        return;
    }

    if (role === 'driver' && !vehicleType) {
        showMessage('error', 'يرجى إدخال نوع المركبة');
        return;
    }

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name,
                email,
                phone,
                password,
                role,
                storeName,
                vehicleType
            })
        });

        const data = await response.json();

        if (data.success) {
            showMessage('success', 'تم إنشاء الحساب بنجاح');
            localStorage.setItem('token', data.user.id);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            // إعادة التوجيه إلى لوحة التحكم بعد 2 ثانية
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 2000);
        } else {
            showMessage('error', data.error || 'فشل إنشاء الحساب');
        }
    } catch (error) {
        showMessage('error', 'حدث خطأ في الاتصال بالخادم');
        console.error('Register error:', error);
    }
}

// التحقق من حالة تسجيل الدخول عند تحميل الصفحة
async function checkAuth() {
    try {
        const response = await fetch('/api/auth/check');
        const data = await response.json();
        
        if (data.isAuthenticated && window.location.pathname === '/') {
            // المستخدم مسجل دخول بالفعل، إعادة التوجيه إلى لوحة التحكم
            window.location.href = '/dashboard.html';
        }
    } catch (error) {
        console.error('Auth check error:', error);
    }
}

// تشغيل التحقق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', checkAuth);
