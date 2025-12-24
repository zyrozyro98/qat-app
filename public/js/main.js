// تهيئة التطبيق
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 تهيئة تطبيق قات PRO...');
    
    try {
        // التحقق من حالة المصادقة
        const authResponse = await fetch('/api/auth/check');
        const authData = await authResponse.json();
        
        if (authData.isAuthenticated) {
            // المستخدم مسجل دخول
            updateUIForLoggedInUser(authData.user);
        } else {
            // المستخدم غير مسجل دخول
            updateUIForGuest();
        }
        
        // جلب بيانات الصفحة الرئيسية
        await loadHomePageData();
        
    } catch (error) {
        console.error('❌ خطأ في تهيئة التطبيق:', error);
        showError('حدث خطأ في تحميل التطبيق');
    }
});

// دالة لتحميل بيانات الصفحة الرئيسية
async function loadHomePageData() {
    try {
        // جلب الإحصائيات
        const statsResponse = await fetch('/api/home/stats/home');
        if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            updateStats(statsData.data);
        }
        
        // جلب الأسواق المميزة
        const marketsResponse = await fetch('/api/home/featured/markets?limit=3');
        if (marketsResponse.ok) {
            const marketsData = await marketsResponse.json();
            displayFeaturedMarkets(marketsData.data);
        }
        
        // جلب المنتجات المميزة
        const productsResponse = await fetch('/api/home/featured/products?limit=4');
        if (productsResponse.ok) {
            const productsData = await productsResponse.json();
            displayFeaturedProducts(productsData.data);
        }
        
        // جلب الفئات
        const categoriesResponse = await fetch('/api/home/categories/main');
        if (categoriesResponse.ok) {
            const categoriesData = await categoriesResponse.json();
            displayCategories(categoriesData.data);
        }
        
    } catch (error) {
        console.error('❌ خطأ في تحميل بيانات الصفحة الرئيسية:', error);
    }
}

// دالة لتحديث الإحصائيات
function updateStats(stats) {
    const statsContainer = document.getElementById('stats-container');
    if (!statsContainer) return;
    
    statsContainer.innerHTML = `
        <div class="stat-card">
            <i class="fas fa-users"></i>
            <h3>${stats.total_buyers || 0}</h3>
            <p>مشتري نشط</p>
        </div>
        <div class="stat-card">
            <i class="fas fa-store"></i>
            <h3>${stats.total_sellers || 0}</h3>
            <p>بائع نشط</p>
        </div>
        <div class="stat-card">
            <i class="fas fa-shopping-bag"></i>
            <h3>${stats.active_products || 0}</h3>
            <p>منتج متوفر</p>
        </div>
        <div class="stat-card">
            <i class="fas fa-shipping-fast"></i>
            <h3>${stats.available_drivers || 0}</h3>
            <p>مندوب توصيل</p>
        </div>
    `;
}

// دالة لعرض الأسواق المميزة
function displayFeaturedMarkets(markets) {
    const container = document.getElementById('featured-markets');
    if (!container || !markets.length) return;
    
    container.innerHTML = markets.map(market => `
        <div class="market-card">
            <div class="market-image">
                <img src="${market.image || '/images/market-default.jpg'}" alt="${market.name}">
            </div>
            <div class="market-info">
                <h3>${market.name}</h3>
                <p><i class="fas fa-map-marker-alt"></i> ${market.location}</p>
                <div class="market-stats">
                    <span><i class="fas fa-box"></i> ${market.product_count || 0} منتج</span>
                    <span><i class="fas fa-motorcycle"></i> ${market.driver_count || 0} مندوب</span>
                </div>
                <button class="btn btn-outline" onclick="viewMarket(${market.id})">
                    تصفح السوق
                </button>
            </div>
        </div>
    `).join('');
}

// دالة لعرض المنتجات المميزة
function displayFeaturedProducts(products) {
    const container = document.getElementById('featured-products');
    if (!container || !products.length) return;
    
    container.innerHTML = products.map(product => `
        <div class="product-card">
            <div class="product-image">
                <img src="${product.image || '/images/product-default.jpg'}" alt="${product.name}">
                ${product.quantity === 0 ? '<span class="out-of-stock">نفذت الكمية</span>' : ''}
            </div>
            <div class="product-info">
                <h3>${product.name}</h3>
                <p class="product-description">${product.description?.substring(0, 60) || 'لا يوجد وصف'}...</p>
                <div class="product-price">
                    <span class="price">${formatCurrency(product.price)}</span>
                    <span class="seller">${product.seller_name || 'بائع'}</span>
                </div>
                <div class="product-actions">
                    <button class="btn btn-sm" onclick="addToCart(${product.id})">
                        <i class="fas fa-cart-plus"></i> أضف للسلة
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="viewProduct(${product.id})">
                        <i class="fas fa-eye"></i> تفاصيل
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// دالة لعرض الفئات
function displayCategories(categories) {
    const container = document.getElementById('categories-list');
    if (!container || !categories.length) return;
    
    container.innerHTML = categories.map(category => `
        <div class="category-card" onclick="browseCategory('${category.category}')">
            <div class="category-icon">
                <i class="fas fa-leaf"></i>
            </div>
            <h3>${category.category}</h3>
            <p>${category.product_count || 0} منتج</p>
            <span class="price-range">${formatCurrency(category.min_price || 0)} - ${formatCurrency(category.max_price || 0)}</span>
        </div>
    `).join('');
}

// دوال مساعدة
function updateUIForLoggedInUser(user) {
    // تحديث واجهة المستخدم للمستخدم المسجل دخول
    const authButtons = document.getElementById('auth-buttons');
    const userMenu = document.getElementById('user-menu');
    
    if (authButtons) authButtons.style.display = 'none';
    if (userMenu) {
        userMenu.style.display = 'block';
        document.getElementById('user-name').textContent = user.name;
        document.getElementById('user-avatar').src = user.avatar || '/images/avatar-default.png';
    }
}

function updateUIForGuest() {
    // تحديث واجهة المستخدم للزائر
    const authButtons = document.getElementById('auth-buttons');
    const userMenu = document.getElementById('user-menu');
    
    if (authButtons) authButtons.style.display = 'flex';
    if (userMenu) userMenu.style.display = 'none';
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('ar-YE', {
        style: 'currency',
        currency: 'YER',
        minimumFractionDigits: 0
    }).format(amount);
}

function showError(message) {
    // عرض رسالة خطأ
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <i class="fas fa-exclamation-circle"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

// دوال التنقل
function viewMarket(marketId) {
    window.location.href = `/market.html?id=${marketId}`;
}

function viewProduct(productId) {
    window.location.href = `/product.html?id=${productId}`;
}

function browseCategory(category) {
    window.location.href = `/products.html?category=${encodeURIComponent(category)}`;
}

function addToCart(productId) {
    // إضافة المنتج للسلة
    console.log(`إضافة المنتج ${productId} للسلة`);
    // هنا يمكن إضافة منطق السلة
}
