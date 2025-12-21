/**
 * تطبيق قات PRO - إدارة المنتجات
 * معالجة المنتجات، الفلترة، الإضافة، التعديل والحذف
 */

// حالة إدارة المنتجات
const ProductsManager = {
    currentProducts: [],
    filteredProducts: [],
    currentPage: 1,
    itemsPerPage: 10,
    totalPages: 1,
    filters: {
        category: '',
        minPrice: '',
        maxPrice: '',
        search: '',
        status: 'active'
    },
    sortBy: 'created_at',
    sortOrder: 'DESC'
};

// تهيئة إدارة المنتجات
function initProductsManager() {
    console.log('🛒 تهيئة مدير المنتجات...');
    
    // إعداد مستمعي الأحداث
    setupProductsEventListeners();
    
    // تحميل الفئات
    loadCategories();
    
    // تحميل المنتجات
    loadProducts();
}

// إعداد مستمعي الأحداث للمنتجات
function setupProductsEventListeners() {
    // فلترة المنتجات
    document.getElementById('categoryFilter')?.addEventListener('change', updateFilters);
    document.getElementById('minPrice')?.addEventListener('input', updateFilters);
    document.getElementById('maxPrice')?.addEventListener('input', updateFilters);
    document.getElementById('productSearch')?.addEventListener('input', debounce(updateFilters, 300));
    
    // زر البحث
    document.getElementById('searchProductsBtn')?.addEventListener('click', searchProducts);
    
    // زر إعادة التعيين
    document.getElementById('resetFiltersBtn')?.addEventListener('click', resetFilters);
    
    // ترتيب المنتجات
    document.getElementById('sortBy')?.addEventListener('change', updateSorting);
    document.getElementById('sortOrder')?.addEventListener('change', updateSorting);
    
    // أحداث الترقيم
    document.addEventListener('click', handlePaginationClick);
}

// تحميل المنتجات
async function loadProducts() {
    try {
        showProductsLoading();
        
        // بناء معاملات البحث
        const params = new URLSearchParams();
        
        // إضافة الفلاتر
        if (ProductsManager.filters.category) {
            params.append('category', ProductsManager.filters.category);
        }
        if (ProductsManager.filters.minPrice) {
            params.append('min_price', ProductsManager.filters.minPrice);
        }
        if (ProductsManager.filters.maxPrice) {
            params.append('max_price', ProductsManager.filters.maxPrice);
        }
        if (ProductsManager.filters.search) {
            params.append('search', ProductsManager.filters.search);
        }
        if (ProductsManager.filters.status) {
            params.append('status', ProductsManager.filters.status);
        }
        
        // إضافة الترتيب
        params.append('sort_by', ProductsManager.sortBy);
        params.append('sort_order', ProductsManager.sortOrder);
        
        // إضافة الترقيم
        params.append('page', ProductsManager.currentPage);
        params.append('limit', ProductsManager.itemsPerPage);
        
        // جلب المنتجات من الخادم
        const response = await fetch(`/api/products?${params.toString()}`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            
            ProductsManager.currentProducts = data.data || [];
            ProductsManager.filteredProducts = data.data || [];
            ProductsManager.totalPages = data.meta?.pages || 1;
            
            renderProductsTable();
            renderProductsPagination();
            updateProductsStats();
            
        } else {
            throw new Error('فشل في جلب المنتجات');
        }
        
        hideProductsLoading();
        
    } catch (error) {
        console.error('❌ خطأ في تحميل المنتجات:', error);
        showMessage('error', 'حدث خطأ في تحميل المنتجات');
        hideProductsLoading();
    }
}

// عرض جدول المنتجات
function renderProductsTable() {
    const tableBody = document.getElementById('productsTableBody');
    if (!tableBody) return;
    
    if (ProductsManager.filteredProducts.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-5">
                    <div class="empty-state-sm">
                        <i class="fas fa-shopping-basket"></i>
                        <p>لا توجد منتجات</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = ProductsManager.filteredProducts.map(product => `
        <tr data-product-id="${product.id}">
            <td>
                <div class="product-image-cell">
                    ${product.image ? 
                        `<img src="${product.image}" alt="${product.name}" class="table-product-image">` : 
                        `<div class="table-product-placeholder">
                            <i class="fas fa-leaf"></i>
                        </div>`
                    }
                </div>
            </td>
            <td>
                <div class="product-info-cell">
                    <h6 class="product-name mb-1">${product.name}</h6>
                    <p class="product-description text-muted mb-0">${product.description || 'لا يوجد وصف'}</p>
                </div>
            </td>
            <td>
                <span class="badge badge-category">${product.category || 'غير محدد'}</span>
            </td>
            <td>
                <span class="product-price">${formatCurrency(product.price)} ريال</span>
            </td>
            <td>
                <span class="badge ${product.quantity > 0 ? 'badge-success' : 'badge-danger'}">
                    ${product.quantity > 0 ? `${product.quantity} متوفر` : 'نفذت الكمية'}
                </span>
            </td>
            <td>
                <span class="badge ${product.status === 'active' ? 'badge-success' : 'badge-secondary'}">
                    ${product.status === 'active' ? 'نشط' : 'غير نشط'}
                </span>
            </td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="viewProduct(${product.id})" title="عرض">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-outline-warning" onclick="editProduct(${product.id})" title="تعديل">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="deleteProduct(${product.id})" title="حذف">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// عرض ترقيم المنتجات
function renderProductsPagination() {
    const pagination = document.getElementById('productsPagination');
    if (!pagination) return;
    
    if (ProductsManager.totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let paginationHTML = '';
    
    // زر السابق
    paginationHTML += `
        <button class="pagination-btn ${ProductsManager.currentPage === 1 ? 'disabled' : ''}" 
                onclick="changeProductsPage(${ProductsManager.currentPage - 1})" 
                ${ProductsManager.currentPage === 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-right"></i>
        </button>
    `;
    
    // أرقام الصفحات
    const maxPagesToShow = 5;
    let startPage = Math.max(1, ProductsManager.currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(ProductsManager.totalPages, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage + 1 < maxPagesToShow) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <button class="pagination-btn ${i === ProductsManager.currentPage ? 'active' : ''}" 
                    onclick="changeProductsPage(${i})">
                ${i}
            </button>
        `;
    }
    
    // زر التالي
    paginationHTML += `
        <button class="pagination-btn ${ProductsManager.currentPage === ProductsManager.totalPages ? 'disabled' : ''}" 
                onclick="changeProductsPage(${ProductsManager.currentPage + 1})" 
                ${ProductsManager.currentPage === ProductsManager.totalPages ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i>
        </button>
    `;
    
    pagination.innerHTML = paginationHTML;
}

// تغيير صفحة المنتجات
function changeProductsPage(page) {
    if (page < 1 || page > ProductsManager.totalPages) return;
    
    ProductsManager.currentPage = page;
    loadProducts();
    
    // التمرير إلى أعلى الجدول
    const table = document.getElementById('productsTable');
    if (table) {
        table.scrollIntoView({ behavior: 'smooth' });
    }
}

// تحديث الفلاتر
function updateFilters() {
    ProductsManager.filters = {
        category: document.getElementById('categoryFilter')?.value || '',
        minPrice: document.getElementById('minPrice')?.value || '',
        maxPrice: document.getElementById('maxPrice')?.value || '',
        search: document.getElementById('productSearch')?.value || '',
        status: document.getElementById('statusFilter')?.value || 'active'
    };
    
    ProductsManager.currentPage = 1;
    loadProducts();
}

// تحديث الترتيب
function updateSorting() {
    ProductsManager.sortBy = document.getElementById('sortBy')?.value || 'created_at';
    ProductsManager.sortOrder = document.getElementById('sortOrder')?.value || 'DESC';
    
    ProductsManager.currentPage = 1;
    loadProducts();
}

// بحث المنتجات
function searchProducts() {
    const searchInput = document.getElementById('productSearch');
    if (searchInput) {
        ProductsManager.filters.search = searchInput.value;
        ProductsManager.currentPage = 1;
        loadProducts();
    }
}

// إعادة تعيين الفلاتر
function resetFilters() {
    // إعادة تعيين عناصر الفلترة
    const categoryFilter = document.getElementById('categoryFilter');
    const minPrice = document.getElementById('minPrice');
    const maxPrice = document.getElementById('maxPrice');
    const searchInput = document.getElementById('productSearch');
    const statusFilter = document.getElementById('statusFilter');
    
    if (categoryFilter) categoryFilter.value = '';
    if (minPrice) minPrice.value = '';
    if (maxPrice) maxPrice.value = '';
    if (searchInput) searchInput.value = '';
    if (statusFilter) statusFilter.value = 'active';
    
    // إعادة تعيين حالة الفلاتر
    ProductsManager.filters = {
        category: '',
        minPrice: '',
        maxPrice: '',
        search: '',
        status: 'active'
    };
    
    ProductsManager.sortBy = 'created_at';
    ProductsManager.sortOrder = 'DESC';
    ProductsManager.currentPage = 1;
    
    // إعادة تعيين عناصر الترتيب
    const sortBy = document.getElementById('sortBy');
    const sortOrder = document.getElementById('sortOrder');
    
    if (sortBy) sortBy.value = 'created_at';
    if (sortOrder) sortOrder.value = 'DESC';
    
    // إعادة تحميل المنتجات
    loadProducts();
}

// تحميل الفئات
async function loadCategories() {
    try {
        const response = await fetch('/api/products/categories', {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            populateCategoryFilter(data.data || []);
        }
    } catch (error) {
        console.error('❌ خطأ في تحميل الفئات:', error);
    }
}

// تعبئة فلتر الفئات
function populateCategoryFilter(categories) {
    const categoryFilter = document.getElementById('categoryFilter');
    if (!categoryFilter) return;
    
    // الحفاظ على الخيار الحالي
    const currentValue = categoryFilter.value;
    
    // مسح الخيارات الحالية (باستثناء الخيار الأول)
    while (categoryFilter.options.length > 1) {
        categoryFilter.remove(1);
    }
    
    // إضافة الفئات
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
    });
    
    // استعادة القيمة السابقة
    categoryFilter.value = currentValue;
}

// تحديث إحصائيات المنتجات
function updateProductsStats() {
    const statsElement = document.getElementById('productsStats');
    if (!statsElement) return;
    
    const total = ProductsManager.filteredProducts.length;
    const active = ProductsManager.filteredProducts.filter(p => p.status === 'active').length;
    const outOfStock = ProductsManager.filteredProducts.filter(p => p.quantity === 0).length;
    
    statsElement.innerHTML = `
        <div class="stats-summary">
            <span class="stat-item">
                <i class="fas fa-box"></i>
                <strong>${total}</strong> منتج
            </span>
            <span class="stat-item">
                <i class="fas fa-check-circle"></i>
                <strong>${active}</strong> نشط
            </span>
            <span class="stat-item">
                <i class="fas fa-times-circle"></i>
                <strong>${outOfStock}</strong> نفذت الكمية
            </span>
        </div>
    `;
}

// عرض منتج
async function viewProduct(productId) {
    try {
        showLoading();
        
        const response = await fetch(`/api/products/${productId}`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            showProductModal(data.data, 'view');
        } else {
            throw new Error('فشل في جلب بيانات المنتج');
        }
        
        hideLoading();
        
    } catch (error) {
        console.error('❌ خطأ في عرض المنتج:', error);
        showMessage('error', 'حدث خطأ في عرض بيانات المنتج');
        hideLoading();
    }
}

// تعديل منتج
async function editProduct(productId) {
    try {
        showLoading();
        
        const response = await fetch(`/api/products/${productId}`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            showProductModal(data.data, 'edit');
        } else {
            throw new Error('فشل في جلب بيانات المنتج');
        }
        
        hideLoading();
        
    } catch (error) {
        console.error('❌ خطأ في تحميل بيانات المنتج:', error);
        showMessage('error', 'حدث خطأ في تحميل بيانات المنتج');
        hideLoading();
    }
}

// حذف منتج
async function deleteProduct(productId) {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟ لا يمكن التراجع عن هذا الإجراء.')) {
        return;
    }
    
    try {
        showLoading();
        
        const response = await fetch(`/api/products/${productId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            showMessage('success', 'تم حذف المنتج بنجاح');
            
            // إزالة المنتج من القائمة
            ProductsManager.filteredProducts = ProductsManager.filteredProducts.filter(
                product => product.id !== productId
            );
            
            // إعادة عرض الجدول
            renderProductsTable();
            updateProductsStats();
            
        } else {
            const data = await response.json();
            throw new Error(data.error || 'فشل في حذف المنتج');
        }
        
        hideLoading();
        
    } catch (error) {
        console.error('❌ خطأ في حذف المنتج:', error);
        showMessage('error', 'حدث خطأ في حذف المنتج');
        hideLoading();
    }
}

// عرض نافذة المنتج (عرض/تعديل/إضافة)
function showProductModal(productData = null, mode = 'view') {
    // إنشاء النافذة المنبثقة
    const modal = createProductModal(mode);
    
    if (productData) {
        populateProductForm(productData, mode);
    } else {
        clearProductForm();
    }
    
    // إظهار النافذة
    showModal('productModal');
}

// إنشاء نافذة المنتج
function createProductModal(mode) {
    const modalTitle = mode === 'add' ? 'إضافة منتج جديد' :
                      mode === 'edit' ? 'تعديل المنتج' : 'عرض المنتج';
    
    const modalHTML = `
        <div class="modal fade" id="productModal" tabindex="-1" role="dialog" aria-labelledby="productModalLabel">
            <div class="modal-dialog modal-lg" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="productModalLabel">
                            <i class="fas fa-${mode === 'add' ? 'plus-circle' : mode === 'edit' ? 'edit' : 'eye'}"></i>
                            ${modalTitle}
                        </h5>
                        <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                            <span aria-hidden="true">&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="productForm" enctype="multipart/form-data">
                            <div class="row">
                                <div class="col-md-8">
                                    <!-- معلومات أساسية -->
                                    <div class="form-group">
                                        <label for="productName">اسم المنتج *</label>
                                        <input type="text" class="form-control" id="productName" name="name" required 
                                               ${mode === 'view' ? 'readonly' : ''}>
                                    </div>
                                    
                                    <div class="form-group">
                                        <label for="productDescription">الوصف</label>
                                        <textarea class="form-control" id="productDescription" name="description" rows="3"
                                                  ${mode === 'view' ? 'readonly' : ''}></textarea>
                                    </div>
                                    
                                    <div class="row">
                                        <div class="col-md-6">
                                            <div class="form-group">
                                                <label for="productPrice">السعر (ريال) *</label>
                                                <input type="number" class="form-control" id="productPrice" name="price" 
                                                       min="0" step="100" required ${mode === 'view' ? 'readonly' : ''}>
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="form-group">
                                                <label for="productQuantity">الكمية *</label>
                                                <input type="number" class="form-control" id="productQuantity" name="quantity" 
                                                       min="0" required ${mode === 'view' ? 'readonly' : ''}>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="row">
                                        <div class="col-md-6">
                                            <div class="form-group">
                                                <label for="productCategory">الفئة *</label>
                                                <select class="form-control" id="productCategory" name="category" 
                                                        ${mode === 'view' ? 'disabled' : ''} required>
                                                    <option value="">اختر الفئة</option>
                                                    <option value="يمني">يمني</option>
                                                    <option value="حاربي">حاربي</option>
                                                    <option value="يافعي">يافعي</option>
                                                    <option value="حدائدي">حدائدي</option>
                                                    <option value="مخلوط">مخلوط</option>
                                                    <option value="يومي">يومي</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="form-group">
                                                <label for="productStatus">الحالة</label>
                                                <select class="form-control" id="productStatus" name="status" 
                                                        ${mode === 'view' ? 'disabled' : ''}>
                                                    <option value="active">نشط</option>
                                                    <option value="inactive">غير نشط</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="form-group">
                                        <label for="productSpecifications">المواصفات</label>
                                        <textarea class="form-control" id="productSpecifications" name="specifications" rows="2"
                                                  ${mode === 'view' ? 'readonly' : ''}
                                                  placeholder="مثال: طازج، ممتاز الجودة، من أفضل المزارع..."></textarea>
                                    </div>
                                </div>
                                
                                <div class="col-md-4">
                                    <!-- صورة المنتج -->
                                    <div class="form-group">
                                        <label for="productImage">صورة المنتج</label>
                                        <div class="image-upload-container">
                                            <div class="image-preview" id="imagePreview">
                                                <i class="fas fa-image"></i>
                                                <span>لم يتم اختيار صورة</span>
                                            </div>
                                            ${mode !== 'view' ? `
                                                <input type="file" class="form-control-file" id="productImage" 
                                                       name="image" accept="image/*" onchange="previewImage(event)">
                                                <small class="form-text text-muted">الحد الأقصى 5MB، الأنواع المدعومة: JPG, PNG, GIF, WebP</small>
                                            ` : ''}
                                        </div>
                                    </div>
                                    
                                    <!-- معلومات إضافية -->
                                    <div class="card">
                                        <div class="card-header">
                                            <h6 class="mb-0"><i class="fas fa-info-circle"></i> معلومات إضافية</h6>
                                        </div>
                                        <div class="card-body">
                                            <div class="form-group">
                                                <label for="productMarket">السوق</label>
                                                <select class="form-control" id="productMarket" name="market_id" 
                                                        ${mode === 'view' ? 'disabled' : ''}>
                                                    <option value="">اختر السوق</option>
                                                    <!-- سيتم تعبئته بـ JavaScript -->
                                                </select>
                                            </div>
                                            
                                            <div class="form-check">
                                                <input type="checkbox" class="form-check-input" id="productFeatured" 
                                                       name="is_featured" ${mode === 'view' ? 'disabled' : ''}>
                                                <label class="form-check-label" for="productFeatured">
                                                    منتج مميز
                                                </label>
                                            </div>
                                            
                                            <div class="form-check">
                                                <input type="checkbox" class="form-check-input" id="productDiscounted" 
                                                       name="is_discounted" ${mode === 'view' ? 'disabled' : ''}>
                                                <label class="form-check-label" for="productDiscounted">
                                                    مخفض
                                                </label>
                                            </div>
                                            
                                            <div class="form-group discount-field" style="display: none;">
                                                <label for="productDiscount">نسبة الخصم (%)</label>
                                                <input type="number" class="form-control" id="productDiscount" 
                                                       name="discount_percent" min="0" max="100" 
                                                       ${mode === 'view' ? 'readonly' : ''}>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div id="productFormErrors" class="alert alert-danger" style="display: none;"></div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">
                            <i class="fas fa-times"></i> إغلاق
                        </button>
                        ${mode !== 'view' ? `
                            <button type="button" class="btn btn-primary" onclick="${mode === 'add' ? 'addNewProduct()' : 'updateProduct()'}">
                                <i class="fas fa-${mode === 'add' ? 'plus' : 'save'}"></i>
                                ${mode === 'add' ? 'إضافة' : 'حفظ'}
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // إضافة النافذة إلى DOM إذا لم تكن موجودة
    if (!document.getElementById('productModal')) {
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
    
    // إعداد الأحداث
    if (mode !== 'view') {
        setupProductFormEvents();
        loadMarketsForSelect();
    }
    
    return document.getElementById('productModal');
}

// تعبئة نموذج المنتج
function populateProductForm(productData, mode) {
    document.getElementById('productName').value = productData.name || '';
    document.getElementById('productDescription').value = productData.description || '';
    document.getElementById('productPrice').value = productData.price || 0;
    document.getElementById('productQuantity').value = productData.quantity || 0;
    document.getElementById('productCategory').value = productData.category || '';
    document.getElementById('productStatus').value = productData.status || 'active';
    document.getElementById('productSpecifications').value = productData.specifications || '';
    document.getElementById('productMarket').value = productData.market_id || '';
    document.getElementById('productFeatured').checked = productData.is_featured || false;
    document.getElementById('productDiscounted').checked = productData.is_discounted || false;
    document.getElementById('productDiscount').value = productData.discount_percent || 0;
    
    // عرض صورة المنتج إذا كانت موجودة
    if (productData.image) {
        const imagePreview = document.getElementById('imagePreview');
        imagePreview.innerHTML = `
            <img src="${productData.image}" alt="${productData.name}" class="img-thumbnail">
        `;
    }
    
    // إظهار/إخفاء حقل الخصم
    toggleDiscountField(productData.is_discounted);
}

// مسح نموذج المنتج
function clearProductForm() {
    const form = document.getElementById('productForm');
    if (form) {
        form.reset();
    }
    
    const imagePreview = document.getElementById('imagePreview');
    if (imagePreview) {
        imagePreview.innerHTML = `
            <i class="fas fa-image"></i>
            <span>لم يتم اختيار صورة</span>
        `;
    }
    
    toggleDiscountField(false);
}

// إعداد أحداث نموذج المنتج
function setupProductFormEvents() {
    // إظهار/إخفاء حقل الخصم
    const discountedCheckbox = document.getElementById('productDiscounted');
    if (discountedCheckbox) {
        discountedCheckbox.addEventListener('change', function() {
            toggleDiscountField(this.checked);
        });
    }
}

// تبديل حقل الخصم
function toggleDiscountField(show) {
    const discountField = document.querySelector('.discount-field');
    if (discountField) {
        discountField.style.display = show ? 'block' : 'none';
    }
}

// معاينة الصورة
function previewImage(event) {
    const input = event.target;
    const preview = document.getElementById('imagePreview');
    
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            preview.innerHTML = `
                <img src="${e.target.result}" alt="معاينة الصورة" class="img-thumbnail">
                <button type="button" class="btn btn-sm btn-danger remove-image" onclick="removeImagePreview()">
                    <i class="fas fa-times"></i>
                </button>
            `;
        };
        
        reader.readAsDataURL(input.files[0]);
    }
}

// إزالة معاينة الصورة
function removeImagePreview() {
    const input = document.getElementById('productImage');
    const preview = document.getElementById('imagePreview');
    
    if (input) {
        input.value = '';
    }
    
    preview.innerHTML = `
        <i class="fas fa-image"></i>
        <span>لم يتم اختيار صورة</span>
    `;
}

// تحميل الأسواق للقائمة المنسدلة
async function loadMarketsForSelect() {
    try {
        const response = await fetch('/api/markets', {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            populateMarketSelect(data.data || []);
        }
    } catch (error) {
        console.error('❌ خطأ في تحميل الأسواق:', error);
    }
}

// تعبئة قائمة الأسواق
function populateMarketSelect(markets) {
    const select = document.getElementById('productMarket');
    if (!select) return;
    
    // الحفاظ على القيمة الحالية
    const currentValue = select.value;
    
    // مسح الخيارات الحالية (باستثناء الخيار الأول)
    while (select.options.length > 1) {
        select.remove(1);
    }
    
    // إضافة الأسواق
    markets.forEach(market => {
        const option = document.createElement('option');
        option.value = market.id;
        option.textContent = market.name;
        select.appendChild(option);
    });
    
    // استعادة القيمة السابقة
    select.value = currentValue;
}

// إضافة منتج جديد
async function addNewProduct() {
    try {
        const formData = new FormData(document.getElementById('productForm'));
        
        // التحقق من صحة البيانات
        if (!validateProductForm(formData)) {
            return;
        }
        
        showLoading();
        
        const response = await fetch('/api/products', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${App.auth.token}`
                // لا تضيف Content-Type، سيقوم المتصفح بتعيينه تلقائياً مع FormData
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showMessage('success', data.message || 'تم إضافة المنتج بنجاح');
            closeModal('productModal');
            
            // إعادة تحميل المنتجات
            loadProducts();
            
        } else {
            throw new Error(data.error || 'فشل في إضافة المنتج');
        }
        
        hideLoading();
        
    } catch (error) {
        console.error('❌ خطأ في إضافة المنتج:', error);
        showMessage('error', 'حدث خطأ في إضافة المنتج');
        hideLoading();
    }
}

// تحديث المنتج
async function updateProduct() {
    try {
        const formData = new FormData(document.getElementById('productForm'));
        const productId = formData.get('id') || getCurrentProductId();
        
        if (!productId) {
            showMessage('error', 'معرف المنتج غير موجود');
            return;
        }
        
        // التحقق من صحة البيانات
        if (!validateProductForm(formData, false)) {
            return;
        }
        
        showLoading();
        
        const response = await fetch(`/api/products/${productId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${App.auth.token}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showMessage('success', data.message || 'تم تحديث المنتج بنجاح');
            closeModal('productModal');
            
            // إعادة تحميل المنتجات
            loadProducts();
            
        } else {
            throw new Error(data.error || 'فشل في تحديث المنتج');
        }
        
        hideLoading();
        
    } catch (error) {
        console.error('❌ خطأ في تحديث المنتج:', error);
        showMessage('error', 'حدث خطأ في تحديث المنتج');
        hideLoading();
    }
}

// الحصول على معرف المنتج الحالي
function getCurrentProductId() {
    const modal = document.getElementById('productModal');
    return modal ? modal.dataset.productId : null;
}

// التحقق من صحة نموذج المنتج
function validateProductForm(formData, isNew = true) {
    const errors = [];
    
    // التحقق من الاسم
    const name = formData.get('name');
    if (!name || name.trim().length < 2) {
        errors.push('اسم المنتج يجب أن يكون على الأقل حرفين');
    }
    
    // التحقق من السعر
    const price = parseFloat(formData.get('price'));
    if (!price || price < 0) {
        errors.push('السعر يجب أن يكون أكبر من صفر');
    }
    
    // التحقق من الكمية
    const quantity = parseInt(formData.get('quantity'));
    if (quantity < 0) {
        errors.push('الكمية يجب أن تكون صفر أو أكبر');
    }
    
    // التحقق من الفئة
    const category = formData.get('category');
    if (!category) {
        errors.push('يرجى اختيار فئة المنتج');
    }
    
    // عرض الأخطاء إذا وجدت
    if (errors.length > 0) {
        const errorContainer = document.getElementById('productFormErrors');
        if (errorContainer) {
            errorContainer.innerHTML = `
                <h6><i class="fas fa-exclamation-triangle"></i> الأخطاء:</h6>
                <ul class="mb-0">
                    ${errors.map(error => `<li>${error}</li>`).join('')}
                </ul>
            `;
            errorContainer.style.display = 'block';
        }
        
        // التمرير إلى الأعلى
        errorContainer?.scrollIntoView({ behavior: 'smooth' });
        
        return false;
    }
    
    return true;
}

// إظهار تحميل المنتجات
function showProductsLoading() {
    const tableBody = document.getElementById('productsTableBody');
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="sr-only">جاري التحميل...</span>
                    </div>
                    <p class="mt-2">جاري تحميل المنتجات...</p>
                </td>
            </tr>
        `;
    }
}

// إخفاء تحميل المنتجات
function hideProductsLoading() {
    // يتم التعامل معه في renderProductsTable
}

// دالة تأخير للبحث
function debounce(func, wait) {
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

// معالجة النقر على الترقيم
function handlePaginationClick(event) {
    const target = event.target.closest('.pagination-btn');
    if (!target) return;
    
    event.preventDefault();
    
    if (target.classList.contains('disabled')) {
        return;
    }
    
    const page = parseInt(target.dataset.page);
    if (!isNaN(page)) {
        changeProductsPage(page);
    }
}

// ============ تصدير الدوال الهامة ============
window.initProductsManager = initProductsManager;
window.viewProduct = viewProduct;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.showProductModal = showProductModal;
window.addNewProduct = addNewProduct;
window.updateProduct = updateProduct;
window.searchProducts = searchProducts;
window.resetFilters = resetFilters;
window.changeProductsPage = changeProductsPage;
window.previewImage = previewImage;
window.removeImagePreview = removeImagePreview;

console.log('✅ مدير المنتجات جاهز للاستخدام');
