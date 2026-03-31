/**
 * Mini POS - Modern Frontend Application
 * APIs: User Service, Product Service, Order Service (via API Gateway)
 * Gateway URL: http://localhost:8080
 */


const API_BASE = window.location.port === '3000' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8080'
  : (window.location.origin.includes('8080') ? '' : 'http://localhost:8080');

// Global state
let token = localStorage.getItem('pos_token');
let currentUser = JSON.parse(localStorage.getItem('pos_user') || 'null');
let products = [];
let cart = [];
let orders = [];
let isRegister = false;
let detailProductId = null;
let detailOrderId = null;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Show toast notification
 * @param {string} msg - Message to display
 * @param {string} type - Type: 'info', 'success', 'error', 'warn'
 */
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/**
 * Make authenticated API requests to the gateway
 * @param {string} path - API endpoint path
 * @param {object} opts - Fetch options
 * @returns {Promise} Response data
 */
async function api(path, opts = {}) {
  const headers = { ...opts.headers };
  
  // Add authorization header if token exists
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }
  
  // Handle JSON body
  if (opts.body && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  
  try {
    const res = await fetch(API_BASE + path, { 
      ...opts, 
      headers 
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || err.error || 'API Request failed');
    }
    
    if (res.status === 204) return null;
    return res.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Decode JWT token to extract claims
 * @param {string} token - JWT token
 * @returns {object} Token payload
 */
function decodeJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

/**
 * Format currency value
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount) {
  return '$' + parseFloat(amount).toFixed(2);
}

/**
 * Get badge HTML for order status
 * @param {string} status - Order status
 * @returns {string} Badge HTML
 */
function getStatusBadge(status) {
  const statusMap = {
    'DELIVERED': 'badge-success',
    'CONFIRMED': 'badge-success',
    'PENDING': 'badge-pending',
    'SHIPPED': 'badge-warn',
    'CANCELLED': 'badge-danger'
  };
  const badgeClass = statusMap[status] || 'badge-pending';
  return `<span class="badge ${badgeClass}">${status || 'PENDING'}</span>`;
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * Toggle between login and register modes
 */
function toggleAuthMode() {
  isRegister = !isRegister;
  const title = document.getElementById('auth-title');
  const btn = document.getElementById('auth-btn');
  const fields = document.getElementById('register-fields');
  const toggleText = document.getElementById('auth-toggle-text');
  const toggleLink = document.getElementById('auth-toggle-link');
  
  title.textContent = isRegister ? 'Create Account' : 'Sign In';
  btn.textContent = isRegister ? 'Register' : 'Sign In';
  fields.style.display = isRegister ? 'block' : 'none';
  toggleText.textContent = isRegister ? 'Already have an account?' : "Don't have an account?";
  toggleLink.textContent = isRegister ? 'Sign In' : 'Register';
}

/**
 * Handle user authentication (login/register)
 * Calls: POST /auth/register or POST /auth/login
 */
async function handleAuth() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  
  if (!email || !password) {
    return toast('Please fill all fields', 'error');
  }
  
  try {
    let data;
    
    if (isRegister) {
      const name = document.getElementById('reg-name').value.trim();
      if (!name) return toast('Name is required', 'error');
      
      // POST /auth/register
      data = await api('/auth/register', {
        method: 'POST',
        body: { name, email, password }
      });
      toast('Account created! Logging in...', 'success');
    } else {
      // POST /auth/login
      data = await api('/auth/login', {
        method: 'POST',
        body: { email, password }
      });
    }
    
    // Store token and user
    token = data.token;
    localStorage.setItem('pos_token', token);
    
    // Extract user info from JWT
    const payload = decodeJwt(token);
    currentUser = {
      id: parseInt(payload.sub),
      email: payload.email || email,
      name: payload.name || email.split('@')[0]
    };
    localStorage.setItem('pos_user', JSON.stringify(currentUser));
    
    toast('Welcome to LapShop POS!', 'success');
    enterApp();
  } catch (error) {
    toast(error.message || 'Authentication failed', 'error');
  }
}

/**
 * Enter the main application after successful auth
 */
function enterApp() {
  document.getElementById('auth-page').classList.remove('active');
  document.getElementById('main-nav').style.display = 'flex';
  document.getElementById('header-user').style.display = 'flex';
  document.getElementById('header-username').textContent = currentUser.name || currentUser.email;
  
  showPage('dashboard');
  loadProducts();
  loadOrders();
}

/**
 * Logout and return to auth page
 */
function logout() {
  token = null;
  currentUser = null;
  cart = [];
  
  localStorage.removeItem('pos_token');
  localStorage.removeItem('pos_user');
  
  document.getElementById('main-nav').style.display = 'none';
  document.getElementById('header-user').style.display = 'none';
  
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('auth-page').classList.add('active');
  
  toast('Logged out successfully', 'info');
}

// ============================================================================
// PAGE NAVIGATION
// ============================================================================

/**
 * Show a page and hide others
 * @param {string} id - Page ID to show
 */
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  
  document.querySelectorAll('#main-nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.page === id);
  });
  
  // Trigger page-specific rendering
  switch(id) {
    case 'dashboard': renderDashboard(); break;
    case 'products': renderProducts(); break;
    case 'pos': renderPosProducts(); break;
    case 'orders': renderOrders(); break;
  }
}

// ============================================================================
// DATA LOADING
// ============================================================================

/**
 * Load all products from API
 * GET /products
 */
async function loadProducts() {
  try {
    products = await api('/products');
    console.log('Products loaded:', products.length);
  } catch (error) {
    console.error('Failed to load products:', error);
    toast('Failed to load products', 'error');
  }
}

/**
 * Load orders for current user
 * GET /orders?userId={userId}
 */
async function loadOrders() {
  if (!currentUser) return;
  
  try {
    orders = await api('/orders?userId=' + currentUser.id);
    console.log('Orders loaded:', orders.length);
  } catch (error) {
    console.error('Failed to load orders:', error);
    toast('Failed to load orders', 'error');
  }
}

// ============================================================================
// DASHBOARD PAGE
// ============================================================================

/**
 * Render dashboard with statistics and recent orders
 */
function renderDashboard() {
  // Calculate statistics
  const totalProducts = products.length;
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => {
    const p = products.find(pr => pr.id === o.productId);
    return sum + (p ? p.price * o.quantity : 0);
  }, 0);
  
  // Update stat cards
  document.getElementById('stat-products').textContent = totalProducts;
  document.getElementById('stat-orders').textContent = totalOrders;
  document.getElementById('stat-revenue').textContent = formatCurrency(totalRevenue);
  
  // Render recent orders table
  const tbody = document.getElementById('dash-orders');
  const recent = orders.slice(-5).reverse();
  
  if (recent.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">No orders yet</td></tr>';
  } else {
    tbody.innerHTML = recent.map(o => {
      const p = products.find(pr => pr.id === o.productId);
      const orderDate = new Date(o.createdAt || new Date()).toLocaleDateString();
      return `<tr>
        <td style="font-family:monospace;font-size:12px">${o.id.substring(0, 8)}...</td>
        <td>${p ? p.name : 'Unknown'}</td>
        <td>${o.quantity}</td>
        <td>${getStatusBadge(o.status || 'PENDING')}</td>
        <td>${orderDate}</td>
      </tr>`;
    }).join('');
  }
}

// ============================================================================
// PRODUCTS PAGE
// ============================================================================

/**
 * Render products inventory with search
 */
function renderProducts() {
  const searchQuery = (document.getElementById('product-search').value || '').toLowerCase();
  const filtered = products.filter(p => p.name.toLowerCase().includes(searchQuery));
  
  const grid = document.getElementById('product-grid');
  
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="icon">📦</div><p>No products found</p></div>';
    return;
  }
  
  grid.innerHTML = filtered.map(p => `
    <div class="card product-card">
      <div style="overflow:hidden;cursor:pointer;position:relative" onclick="showProductDetail('${p.id}')">
        ${p.imageUrl 
          ? `<img src="${p.imageUrl}" class="product-img" onerror="this.style.display='none'" alt="${p.name}">` 
          : `<div class="product-img" style="display:flex;align-items:center;justify-content:center;font-size:48px">📷</div>`}
      </div>
      <div class="product-info">
        <div class="product-name" title="${p.name}">${p.name}</div>
        <div class="product-price">${formatCurrency(p.price)}</div>
      </div>
      <div class="card-actions">
        <button class="btn btn-outline btn-xs" onclick="openUpload('${p.id}'); event.stopPropagation()">📸 Image</button>
        <button class="btn btn-warn btn-xs" onclick="openEditProduct('${p.id}'); event.stopPropagation()">✏️ Edit</button>
        <button class="btn btn-danger btn-xs" onclick="deleteProduct('${p.id}'); event.stopPropagation()">🗑️ Delete</button>
      </div>
    </div>
  `).join('');
}

/**
 * Show product detail modal
 * @param {string} productId - Product ID
 */
function showProductDetail(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  
  detailProductId = productId;
  document.getElementById('detail-product-name').textContent = product.name;
  document.getElementById('detail-product-price').textContent = formatCurrency(product.price);
  
  const imgEl = document.getElementById('detail-product-img');
  if (product.imageUrl) {
    imgEl.src = product.imageUrl;
    imgEl.style.display = 'block';
  } else {
    imgEl.style.display = 'none';
  }
  
  document.getElementById('product-detail-modal').classList.add('show');
}

/**
 * Open add product modal
 */
function openAddProduct() {
  document.getElementById('edit-product-id').value = '';
  document.getElementById('product-modal-title').textContent = 'Add New Product';
  document.getElementById('prod-name').value = '';
  document.getElementById('prod-price').value = '';
  document.getElementById('product-modal').classList.add('show');
}

/**
 * Open edit product modal
 * @param {string} productId - Product ID
 */
function openEditProduct(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  
  detailProductId = null;
  closeModal('product-detail-modal');
  
  document.getElementById('edit-product-id').value = productId;
  document.getElementById('product-modal-title').textContent = 'Edit Product';
  document.getElementById('prod-name').value = product.name;
  document.getElementById('prod-price').value = product.price;
  document.getElementById('product-modal').classList.add('show');
}

/**
 * Save product (create or update)
 * POST /products or PUT /products/{id}
 */
async function saveProduct() {
  const productId = document.getElementById('edit-product-id').value;
  const name = document.getElementById('prod-name').value.trim();
  const price = parseFloat(document.getElementById('prod-price').value);
  
  if (!name || !price || price <= 0) {
    return toast('Please fill all fields with valid data', 'error');
  }
  
  try {
    if (productId) {
      // Update existing product
      await api('/products/' + productId, {
        method: 'PUT',
        body: { name, price }
      });
      toast('Product updated successfully!', 'success');
    } else {
      // Create new product
      const newProduct = await api('/products', {
        method: 'POST',
        body: { name, price }
      });
      products.push(newProduct);
      toast('Product created successfully!', 'success');
    }
    
    closeModal('product-modal');
    await loadProducts();
    renderProducts();
  } catch (error) {
    toast(error.message || 'Failed to save product', 'error');
  }
}

/**
 * Delete product
 * DELETE /products/{id}
 */
async function deleteProduct(productId) {
  if (!confirm('Are you sure you want to delete this product?')) return;
  
  try {
    await api('/products/' + productId, { method: 'DELETE' });
    toast('Product deleted successfully!', 'success');
    closeModal('product-detail-modal');
    await loadProducts();
    renderProducts();
  } catch (error) {
    toast(error.message || 'Failed to delete product', 'error');
  }
}

/**
 * Open image upload modal
 * @param {string} productId - Product ID
 */
function openUpload(productId) {
  document.getElementById('upload-product-id').value = productId;
  document.getElementById('upload-file').value = '';
  document.getElementById('upload-modal').classList.add('show');
}

/**
 * Upload product image to GCS
 * POST /products/{id}/image
 */
async function uploadImage() {
  const productId = document.getElementById('upload-product-id').value;
  const fileInput = document.getElementById('upload-file');
  const file = fileInput.files[0];
  
  if (!file) {
    return toast('Please select an image', 'error');
  }
  
  if (!file.type.startsWith('image/')) {
    return toast('Please select a valid image file', 'error');
  }
  
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    await api('/products/' + productId + '/image', {
      method: 'POST',
      body: formData
    });
    
    toast('Image uploaded successfully!', 'success');
    closeModal('upload-modal');
    await loadProducts();
    renderProducts();
  } catch (error) {
    toast(error.message || 'Failed to upload image', 'error');
  }
}

// ============================================================================
// POS (POINT OF SALE) PAGE
// ============================================================================

/**
 * Render POS products for sale
 */
function renderPosProducts() {
  const searchQuery = (document.getElementById('pos-search').value || '').toLowerCase();
  const filtered = products.filter(p => p.name.toLowerCase().includes(searchQuery));
  
  const grid = document.getElementById('pos-products');
  
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty"><div class="icon">🔍</div><p>No products found</p></div>';
  } else {
    grid.innerHTML = filtered.map(p => `
      <div class="card" style="cursor:pointer;transition:all .2s" onclick="addToCart('${p.id}')" onhover="this.style.transform='scale(1.05)'">
        ${p.imageUrl 
          ? `<img src="${p.imageUrl}" class="product-img" onerror="this.style.display='none'" alt="${p.name}">` 
          : `<div class="product-img" style="display:flex;align-items:center;justify-content:center;font-size:48px">📦</div>`}
        <h3 style="font-size:15px;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis">${p.name}</h3>
        <div class="price">${formatCurrency(p.price)}</div>
      </div>
    `).join('');
  }
  
  renderCart();
}

/**
 * Add product to cart
 * @param {string} productId - Product ID
 */
function addToCart(productId) {
  const existingItem = cart.find(c => c.productId === productId);
  
  if (existingItem) {
    existingItem.quantity++;
  } else {
    cart.push({ productId, quantity: 1 });
  }
  
  renderCart();
  toast('Added to cart', 'success');
}

/**
 * Remove product from cart
 * @param {string} productId - Product ID
 */
function removeFromCart(productId) {
  cart = cart.filter(c => c.productId !== productId);
  renderCart();
}

/**
 * Update quantity in cart
 * @param {string} productId - Product ID
 * @param {number} delta - Change amount
 */
function updateQty(productId, delta) {
  const item = cart.find(c => c.productId === productId);
  if (!item) return;
  
  item.quantity += delta;
  
  if (item.quantity <= 0) {
    cart = cart.filter(c => c.productId !== productId);
  }
  
  renderCart();
}

/**
 * Render shopping cart
 */
function renderCart() {
  const container = document.getElementById('cart-items');
  
  if (cart.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted)">🛒 Cart is empty</div>';
    document.getElementById('cart-total').textContent = '$0.00';
    document.getElementById('place-order-btn').disabled = true;
    return;
  }
  
  document.getElementById('place-order-btn').disabled = false;
  
  let total = 0;
  container.innerHTML = cart.map(cartItem => {
    const product = products.find(p => p.id === cartItem.productId);
    if (!product) return '';
    
    const subtotal = product.price * cartItem.quantity;
    total += subtotal;
    
    return `<div class="cart-item">
      <div>
        <div style="font-weight:600;font-size:14px">${product.name}</div>
        <div style="color:var(--muted);font-size:12px">${formatCurrency(product.price)} each</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <div class="qty-control">
          <button onclick="updateQty('${cartItem.productId}', -1)">−</button>
          <span>${cartItem.quantity}</span>
          <button onclick="updateQty('${cartItem.productId}', 1)">+</button>
        </div>
        <span class="price" style="min-width:60px;text-align:right">${formatCurrency(subtotal)}</span>
        <button class="btn btn-danger btn-sm" onclick="removeFromCart('${cartItem.productId}')" style="padding:4px 8px">✕</button>
      </div>
    </div>`;
  }).join('');
  
  document.getElementById('cart-total').textContent = formatCurrency(total);
}

/**
 * Place order with cart items
 * POST /orders (for each item in cart)
 */
async function placeOrder() {
  if (!cart.length || !currentUser) {
    return toast('Cart is empty', 'error');
  }
  
  document.getElementById('place-order-btn').disabled = true;
  
  try {
    // Create order for each cart item
    for (const item of cart) {
      await api('/orders', {
        method: 'POST',
        body: {
          userId: currentUser.id,
          productId: item.productId,
          quantity: item.quantity
        }
      });
    }
    
    const cartItemCount = cart.length;
    toast(`Order placed successfully! (${cartItemCount} item${cartItemCount > 1 ? 's' : ''})`, 'success');
    
    cart = [];
    renderCart();
    await loadOrders();
    renderDashboard();
  } catch (error) {
    toast(error.message || 'Failed to place order', 'error');
  }
  
  document.getElementById('place-order-btn').disabled = false;
}

// ============================================================================
// ORDERS PAGE
// ============================================================================

/**
 * Render orders list with filtering
 */
function renderOrders() {
  const statusFilter = document.getElementById('order-status-filter').value;
  const filtered = statusFilter 
    ? orders.filter(o => o.status === statusFilter) 
    : orders;
  
  const tbody = document.getElementById('orders-table');
  const emptyEl = document.getElementById('orders-empty');
  
  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  
  emptyEl.style.display = 'none';
  
  tbody.innerHTML = filtered.slice().reverse().map(order => {
    const product = products.find(p => p.id === order.productId);
    const orderDate = new Date(order.createdAt || new Date()).toLocaleDateString();
    const amount = product ? formatCurrency(product.price * order.quantity) : '$0.00';
    
    return `<tr>
      <td style="font-family:monospace;font-size:12px;cursor:pointer" onclick="showOrderDetail('${order.id}')">${order.id.substring(0, 12)}...</td>
      <td>${product ? product.name : 'Unknown'}</td>
      <td>${order.quantity}</td>
      <td class="price">${amount}</td>
      <td>${getStatusBadge(order.status || 'PENDING')}</td>
      <td>${orderDate}</td>
      <td><button class="btn btn-outline btn-xs" onclick="showOrderDetail('${order.id}')">Details</button></td>
    </tr>`;
  }).join('');
}

/**
 * Show order detail modal
 * @param {string} orderId - Order ID
 */
function showOrderDetail(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;
  
  const product = products.find(p => p.id === order.productId);
  
  detailOrderId = orderId;
  document.getElementById('detail-order-id').textContent = orderId;
  document.getElementById('detail-order-status-badge').innerHTML = getStatusBadge(order.status || 'PENDING');
  document.getElementById('detail-order-product').textContent = product ? product.name : 'Unknown';
  document.getElementById('detail-order-qty').textContent = order.quantity + ' units';
  document.getElementById('detail-order-status-select').value = order.status || 'PENDING';
  
  document.getElementById('order-detail-modal').classList.add('show');
}

/**
 * Update order status
 * PUT /orders/{id}
 */
async function updateOrderStatus() {
  if (!detailOrderId) return;
  
  const newStatus = document.getElementById('detail-order-status-select').value;
  
  try {
    await api('/orders/' + detailOrderId, {
      method: 'PUT',
      body: { status: newStatus }
    });
    
    toast('Order status updated!', 'success');
    await loadOrders();
    renderOrders();
    closeModal('order-detail-modal');
  } catch (error) {
    toast(error.message || 'Failed to update order', 'error');
  }
}

// ============================================================================
// MODAL UTILITIES
// ============================================================================

/**
 * Close a modal by ID
 * @param {string} modalId - Modal element ID
 */
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('show');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Check if user is already logged in
  if (token && currentUser) {
    enterApp();
  }
});

// Allow Enter key to submit auth form
document.addEventListener('DOMContentLoaded', () => {
  const authEmail = document.getElementById('auth-email');
  const authPassword = document.getElementById('auth-password');
  
  [authEmail, authPassword].forEach(el => {
    if (!el) return;
    el.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleAuth();
      }
    });
  });
});
