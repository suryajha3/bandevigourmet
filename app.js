import {
  BadgeCheck,
  ChevronDown,
  Clipboard,
  Factory,
  FlaskConical,
  Globe2,
  Handshake,
  Leaf,
  MessageCircle,
  PackageCheck,
  PackageOpen,
  Plus,
  Search,
  Send,
  ShoppingBag,
  Store,
  ShieldCheck,
  Wheat,
  X,
  createIcons
} from "lucide";
import productDetails from "./product-details.json";
import products from "./products.json";
import { STORE_CONFIG } from "./store-config.js";

const API_TIMEOUT_MS = 6000;

const catalog = products.map((product) => ({
  ...product,
  details: productDetails[product.id] || {}
}));

const STORAGE_KEYS = {
  customer: "bandevi-gourmet-customer",
  orders: "bandevi-gourmet-orders"
};

const ORDER_STEPS = [
  { key: "booked", label: "Booked", helper: "ID created" },
  { key: "confirmed", label: "Confirmed", helper: "Seller approved" },
  { key: "packed", label: "Packed", helper: "Ready to ship" },
  { key: "dispatched", label: "Dispatched", helper: "On the way" },
  { key: "delivered", label: "Delivered", helper: "Completed" }
];

const state = {
  filter: "all",
  search: "",
  sort: "featured",
  couponApplied: false,
  cart: new Map(),
  customer: loadCustomer(),
  orders: loadOrders(),
  trackedOrder: null
};

const rupee = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0
});

const productGrid = document.querySelector("#productGrid");
const makhanaProductGrid = document.querySelector("#makhanaProductGrid");
const masalaProductGrid = document.querySelector("#masalaProductGrid");
const pohaProductGrid = document.querySelector("#pohaProductGrid");
const cartItems = document.querySelector("#cartItems");
const cartTotals = document.querySelector("#cartTotals");
const cartDrawer = document.querySelector(".cart-drawer");
const productDetailDrawer = document.querySelector(".product-detail-drawer");
const productDetailContent = document.querySelector("#productDetailContent");
const checkoutForm = document.querySelector("#checkoutForm");
const wholesaleForm = document.querySelector("#wholesaleForm");
const paymentMethod = document.querySelector("#paymentMethod");
const paymentDetails = document.querySelector("#paymentDetails");
const customerLoginForm = document.querySelector("#customerLoginForm");
const orderLookupForm = document.querySelector("#orderLookupForm");
const customerDashboard = document.querySelector("#customerDashboard");
const overlay = document.querySelector("[data-overlay]");
const toast = document.querySelector("#toast");
const couponInput = document.querySelector("#couponInput");
const couponMessage = document.querySelector("#couponMessage");

function money(value) {
  return `Rs. ${rupee.format(value)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function readJson(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(path, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed");
    return payload;
  } finally {
    window.clearTimeout(timer);
  }
}

function loadCustomer() {
  return readJson(STORAGE_KEYS.customer, null);
}

function loadOrders() {
  return readJson(STORAGE_KEYS.orders, []);
}

function saveCustomer(customer) {
  state.customer = customer;
  writeJson(STORAGE_KEYS.customer, customer);
}

function saveOrders(orders) {
  state.orders = orders;
  writeJson(STORAGE_KEYS.orders, orders);
}

function getStatusIndex(status) {
  const index = ORDER_STEPS.findIndex((step) => step.key === status);
  return index >= 0 ? index : 0;
}

function productImage(product) {
  return product.image || "/assets/makhana-masala-hero.png";
}

function imagePosition(product) {
  return product.position || "center";
}

function getFilteredProducts() {
  const search = state.search.trim().toLowerCase();
  let visible = catalog.filter((product) => {
    const categoryMatch = state.filter === "all" || product.category === state.filter;
    const text = `${product.name} ${product.category} ${product.description} ${(product.details.ingredients || []).join(" ")}`.toLowerCase();
    return categoryMatch && (!search || text.includes(search));
  });

  if (state.sort === "low") visible = visible.toSorted((a, b) => a.price - b.price);
  if (state.sort === "high") visible = visible.toSorted((a, b) => b.price - a.price);
  if (state.sort === "rating") visible = visible.toSorted((a, b) => b.rating - a.rating);

  return visible;
}

function renderProductCard(product) {
  return `
    <article class="product-card">
      <div class="product-media">
        <img src="${productImage(product)}" alt="${product.name}" style="--position: ${imagePosition(product)}" />
        <span class="product-badge">${product.badge}</span>
      </div>
      <div class="product-body">
        <div class="product-meta">
          <span>${product.category}</span>
          <span class="rating">${product.rating}/5</span>
        </div>
        <h3>${product.name}</h3>
        <p>${product.description}</p>
        <div class="price-row">
          <span class="price">${money(product.price)}</span>
          <span class="pack-size">${product.size}</span>
        </div>
        <div class="card-actions">
          <button class="detail-button" type="button" data-detail="${product.id}">View details</button>
          <button type="button" data-add="${product.id}">
            <i data-lucide="plus"></i>
            Add to cart
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderCategoryCard(product) {
  return `
    <article class="category-card">
      <div class="category-thumb">
        <img src="${productImage(product)}" alt="${product.name}" style="--position: ${imagePosition(product)}" />
      </div>
      <div class="category-info">
        <span>${product.badge}</span>
        <h3>${product.name}</h3>
        <p>${product.size} - ${money(product.price)}</p>
        <div class="category-actions">
          <button class="detail-button" type="button" data-detail="${product.id}">Details</button>
          <button type="button" data-add="${product.id}">
            <i data-lucide="plus"></i>
            Add
          </button>
        </div>
      </div>
    </article>
  `;
}

function bindAddButtons(root) {
  root.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => addToCart(button.dataset.add));
  });
}

function bindDetailButtons(root) {
  root.querySelectorAll("[data-detail]").forEach((button) => {
    button.addEventListener("click", () => openProductDetail(button.dataset.detail));
  });
}

function renderProducts() {
  const visible = getFilteredProducts();

  productGrid.innerHTML = visible.length
    ? visible.map(renderProductCard).join("")
    : `<div class="empty-cart">No products matched that search.</div>`;

  bindAddButtons(productGrid);
  bindDetailButtons(productGrid);

  refreshIcons();
}

function renderCategoryProducts() {
  const categorySections = [
    { category: "makhana", grid: makhanaProductGrid },
    { category: "masala", grid: masalaProductGrid },
    { category: "poha", grid: pohaProductGrid }
  ];

  categorySections.forEach(({ category, grid }) => {
    const categoryProducts = catalog.filter((product) => product.category === category);
    grid.innerHTML = categoryProducts.map(renderCategoryCard).join("");
    bindAddButtons(grid);
    bindDetailButtons(grid);
  });

  refreshIcons();
}

function setProductFilter(filter) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.filter === filter);
  });
  state.filter = filter;
  renderProducts();
}

function renderList(items) {
  return (items || []).map((item) => `<li>${item}</li>`).join("");
}

function openProductDetail(id) {
  const product = catalog.find((item) => item.id === id);
  if (!product) return;

  const details = product.details || {};
  closeCart();
  productDetailContent.innerHTML = `
    <div class="detail-hero">
      <img src="${productImage(product)}" alt="${product.name}" style="--position: ${imagePosition(product)}" />
      <div>
        <span class="product-badge">${product.badge}</span>
        <h3>${product.name}</h3>
        <p>${product.description}</p>
        <div class="detail-price">
          <strong>${money(product.price)}</strong>
          <span>${product.size}</span>
          <span>${product.rating}/5 rating</span>
        </div>
        <button type="button" data-add="${product.id}">
          <i data-lucide="plus"></i>
          Add to cart
        </button>
      </div>
    </div>

    <div class="detail-grid">
      <article>
        <h4>Ingredients</h4>
        <ul>${renderList(details.ingredients)}</ul>
      </article>
      <article>
        <h4>Nutrition snapshot</h4>
        <ul>${renderList(details.nutrition)}</ul>
      </article>
      <article>
        <h4>Shelf life</h4>
        <p>${details.shelfLife || "Add shelf-life details after final packaging."}</p>
      </article>
      <article>
        <h4>Storage</h4>
        <p>${details.storage || "Store sealed in a cool, dry place."}</p>
      </article>
      <article>
        <h4>Origin note</h4>
        <p>${details.origin || "Add sourcing and origin notes."}</p>
      </article>
      <article>
        <h4>Flavor notes</h4>
        <p>${details.flavorNotes || "Add flavor notes."}</p>
      </article>
    </div>

    <div class="usage-panel">
      <h4>Usage ideas</h4>
      <div>${(details.usage || []).map((item) => `<span>${item}</span>`).join("")}</div>
    </div>

    <p class="detail-disclaimer">${details.disclaimer || "Replace display values with verified packaging details before final commercial launch."}</p>
  `;

  bindAddButtons(productDetailContent);
  productDetailDrawer.classList.add("is-open");
  overlay.classList.add("is-open");
  productDetailDrawer.setAttribute("aria-hidden", "false");
  refreshIcons();
}

function closeProductDetail() {
  productDetailDrawer.classList.remove("is-open");
  overlay.classList.remove("is-open");
  productDetailDrawer.setAttribute("aria-hidden", "true");
}

function addToCart(id) {
  state.cart.set(id, (state.cart.get(id) || 0) + 1);
  renderCart();
  showToast("Added to cart");
}

function setQuantity(id, quantity) {
  if (quantity <= 0) {
    state.cart.delete(id);
  } else {
    state.cart.set(id, quantity);
  }
  renderCart();
}

function getCartLines() {
  return [...state.cart.entries()].map(([id, quantity]) => {
    const product = catalog.find((item) => item.id === id);
    return { ...product, quantity, lineTotal: product.price * quantity };
  });
}

function getTotals() {
  const subtotal = getCartLines().reduce((sum, item) => sum + item.lineTotal, 0);
  const discount = state.couponApplied ? Math.round(subtotal * 0.1) : 0;
  const delivery = subtotal === 0 || subtotal - discount >= 999 ? 0 : 69;
  const total = subtotal - discount + delivery;
  return { subtotal, discount, delivery, total };
}

function createOrderId() {
  return `MM${Math.floor(10000 + Math.random() * 90000)}`;
}

function getUpiPayUrl(amount, orderId) {
  const upiId = STORE_CONFIG.upiId.trim();
  if (!upiId) return "";

  const params = new URLSearchParams({
    pa: upiId,
    pn: STORE_CONFIG.upiPayeeName || STORE_CONFIG.shopName,
    am: String(amount),
    cu: "INR",
    tn: `${STORE_CONFIG.shopName} order ${orderId}`
  });

  return `upi://pay?${params.toString()}`;
}

function getPaymentNote(payment, total) {
  if (payment === "UPI prepaid") {
    return STORE_CONFIG.upiId
      ? `Pay ${money(total)} to UPI ID ${STORE_CONFIG.upiId} before delivery.`
      : "UPI ID is not added yet. Payment details will be shared on WhatsApp.";
  }

  if (payment === "UPI on delivery") {
    return "Customer will pay by UPI when the order is delivered.";
  }

  if (payment === "Card on delivery") {
    return "Customer will pay by card when the order is delivered.";
  }

  return "Customer will pay cash when the order is delivered.";
}

function buildWhatsAppMessage(form, orderId) {
  const data = new FormData(form);
  const lines = getCartLines();
  const totals = getTotals();
  const payment = data.get("payment");
  const items = lines
    .map((item, index) => `${index + 1}. ${item.name} (${item.size}) x ${item.quantity} = ${money(item.lineTotal)}`)
    .join("\n");

  return [
    `New ${STORE_CONFIG.shopName} Order`,
    `Order ID: ${orderId}`,
    `Delivery Area: ${STORE_CONFIG.deliveryArea}`,
    "",
    "Items:",
    items,
    "",
    `Subtotal: ${money(totals.subtotal)}`,
    `Discount: ${totals.discount ? `-${money(totals.discount)}` : money(0)}`,
    `Delivery: ${totals.delivery ? money(totals.delivery) : "Free"}`,
    `Total: ${money(totals.total)}`,
    "",
    "Customer:",
    `Name: ${data.get("name")}`,
    `Phone: ${data.get("phone")}`,
    `Email: ${data.get("email") || "Not shared"}`,
    `Country / City: ${data.get("countryCity")}`,
    `Pincode / ZIP: ${data.get("postalCode") || "Not shared"}`,
    `Address: ${data.get("address")}`,
    `Order Type: ${data.get("orderType")}`,
    `Payment: ${payment}`,
    `Payment Note: ${getPaymentNote(payment, totals.total)}`
  ].join("\n");
}

function createOrderRecord(form, orderId, source) {
  const data = new FormData(form);
  const lines = getCartLines();
  const totals = getTotals();
  const payment = data.get("payment");
  const phone = String(data.get("phone") || "").trim();
  const name = String(data.get("name") || "").trim();
  const email = String(data.get("email") || state.customer?.email || "").trim();
  const countryCity = String(data.get("countryCity") || state.customer?.location || "").trim();
  const postalCode = String(data.get("postalCode") || "").trim();
  const orderType = String(data.get("orderType") || "Retail home order").trim();
  const address = String(data.get("address") || "").trim();

  return {
    id: orderId,
    source,
    status: "booked",
    placedAt: new Date().toISOString(),
    orderType,
    customer: {
      name,
      phone,
      email,
      location: countryCity
    },
    countryCity,
    postalCode,
    address,
    payment,
    paymentNote: getPaymentNote(payment, totals.total),
    totals,
    items: lines.map((item) => ({
      id: item.id,
      name: item.name,
      size: item.size,
      quantity: item.quantity,
      price: item.price,
      lineTotal: item.lineTotal
    }))
  };
}

function upsertOrderRecords(orders, trackedOrder = null) {
  const incoming = Array.isArray(orders) ? orders : [orders];
  const byId = new Map(state.orders.map((item) => [item.id, item]));
  incoming.forEach((order) => {
    if (order?.id) byId.set(order.id, order);
  });
  const nextOrders = [...byId.values()]
    .toSorted((a, b) => new Date(b.updatedAt || b.placedAt || 0) - new Date(a.updatedAt || a.placedAt || 0))
    .slice(0, 30);
  saveOrders(nextOrders);
  if (trackedOrder) state.trackedOrder = trackedOrder;
  renderCustomerPortal();
}

async function syncOrderRecord(order) {
  try {
    const payload = await apiRequest("/api/orders", {
      method: "POST",
      body: JSON.stringify(order)
    });
    upsertOrderRecords(payload.order, payload.order);
    return payload.order;
  } catch {
    return null;
  }
}

function saveOrderRecord(order, options = {}) {
  const { sync = true } = options;
  const nextOrders = [order, ...state.orders.filter((item) => item.id !== order.id)].slice(0, 30);
  saveOrders(nextOrders);
  state.trackedOrder = order;
  renderCustomerPortal();
  if (sync) syncOrderRecord(order);
}

async function loadCustomerOrdersFromBackend(phone) {
  try {
    const params = new URLSearchParams({ phone: normalizePhone(phone) });
    const payload = await apiRequest(`/api/orders/customer?${params.toString()}`);
    if (payload.orders?.length) upsertOrderRecords(payload.orders);
    return payload.orders || [];
  } catch {
    return [];
  }
}

function formatOrderDate(value) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function renderStatusSteps(order) {
  const current = getStatusIndex(order.status);
  return ORDER_STEPS.map(
    (step, index) => `
      <span class="${index <= current ? "is-done" : ""}">
        <strong>${step.label}</strong>
        <small>${step.helper}</small>
      </span>
    `
  ).join("");
}

function getOrderNextAction(order) {
  const status = order.status || "booked";
  const messages = {
    booked: "Seller confirmation and stock check are pending.",
    confirmed: "Order is confirmed and will move to packing.",
    packed: "Packing is complete and dispatch details will be shared next.",
    dispatched: "Order is on the way. Delivery confirmation is the next step.",
    delivered: "Order is marked delivered. Support remains available for product concerns."
  };

  return messages[status] || messages.booked;
}

function renderOrderCard(order) {
  const items = order.items || [];
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const itemSummary = items.length
    ? items.map((item) => `${escapeHtml(item.name)} x ${item.quantity}`).join(", ")
    : "Products to be confirmed";
  const statusLabel = ORDER_STEPS[getStatusIndex(order.status)].label;
  const orderType = order.orderType || order.source || "Website booking";
  const countryCity = order.countryCity || order.customer?.location || "Location to be confirmed";
  const total = order.totals?.total || 0;
  const supportUrl = getWhatsAppUrl(`Support request for ${STORE_CONFIG.shopName} booking ${order.id}`);

  return `
    <article class="order-card">
      <header>
        <div>
          <h4>${escapeHtml(order.id)}</h4>
          <p>${escapeHtml(order.source)} - ${formatOrderDate(order.placedAt)}</p>
        </div>
        <span class="status-pill">${statusLabel}</span>
      </header>
      <p><strong>${totalQuantity} item${totalQuantity === 1 ? "" : "s"}</strong> - ${itemSummary}</p>
      <div class="order-meta-grid">
        <span><strong>Total</strong>${money(total)}</span>
        <span><strong>Payment</strong>${escapeHtml(order.payment || "To be confirmed")}</span>
        <span><strong>Order type</strong>${escapeHtml(orderType)}</span>
        <span><strong>Location</strong>${escapeHtml(countryCity)}</span>
      </div>
      <p class="order-next"><strong>Next step:</strong> ${getOrderNextAction(order)}</p>
      <div class="status-steps" aria-label="Order status timeline">${renderStatusSteps(order)}</div>
      <div class="order-actions">
        <button type="button" data-copy-order="${escapeHtml(order.id)}">Copy booking ID</button>
        <a href="${supportUrl}" target="_blank" rel="noopener noreferrer">Support on WhatsApp</a>
      </div>
    </article>
  `;
}

function prefillCheckoutFromCustomer() {
  if (!state.customer) return;

  const nameInput = checkoutForm.elements.name;
  const phoneInput = checkoutForm.elements.phone;
  const emailInput = checkoutForm.elements.email;
  const countryCityInput = checkoutForm.elements.countryCity;
  if (nameInput && !nameInput.value) nameInput.value = state.customer.name || "";
  if (phoneInput && !phoneInput.value) phoneInput.value = state.customer.phone || "";
  if (emailInput && !emailInput.value) emailInput.value = state.customer.email || "";
  if (countryCityInput && !countryCityInput.value) countryCityInput.value = state.customer.location || "";
}

function prefillCustomerLoginForm() {
  if (!state.customer || !customerLoginForm) return;

  customerLoginForm.elements.customerName.value = state.customer.name || "";
  customerLoginForm.elements.customerPhone.value = state.customer.phone || "";
  customerLoginForm.elements.customerEmail.value = state.customer.email || "";
  customerLoginForm.elements.customerLocation.value = state.customer.location || "";
}

function renderCustomerPortal() {
  if (!customerDashboard) return;

  const customer = state.customer;
  const ordersForCustomer = customer
    ? state.orders.filter((order) => normalizePhone(order.customer.phone) === normalizePhone(customer.phone))
    : state.orders;
  const visibleOrders = state.trackedOrder ? [state.trackedOrder] : ordersForCustomer.slice(0, 3);
  const activeOrders = ordersForCustomer.filter((order) => order.status !== "delivered").length;
  const latestOrder = ordersForCustomer[0];

  customerDashboard.innerHTML = `
    <h3>${customer ? `Welcome, ${escapeHtml(customer.name)}` : "Customer dashboard"}</h3>
    ${
      customer
        ? `<div class="portal-profile">
            <span>${escapeHtml(customer.phone)}</span>
            ${customer.email ? `<span>${escapeHtml(customer.email)}</span>` : ""}
            ${customer.location ? `<span>${escapeHtml(customer.location)}</span>` : ""}
          </div>`
        : `<p class="portal-empty">Save your login details first, then place an order or track an existing order ID.</p>`
    }
    ${
      customer
        ? `<div class="portal-stats" aria-label="Customer booking summary">
            <span><strong>${ordersForCustomer.length}</strong><small>Total bookings</small></span>
            <span><strong>${activeOrders}</strong><small>Active orders</small></span>
            <span><strong>${latestOrder ? ORDER_STEPS[getStatusIndex(latestOrder.status)].label : "None"}</strong><small>Latest status</small></span>
          </div>`
        : ""
    }
    <h4 class="portal-subtitle">${state.trackedOrder ? "Tracked booking" : "Recent bookings"}</h4>
    ${
      visibleOrders.length
        ? visibleOrders.map(renderOrderCard).join("")
        : `<p class="portal-empty">No saved orders yet. Place an order from the cart to create your first booking ID.</p>`
    }
  `;

  bindPortalActions();
  refreshIcons();
}

function copyText(value) {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(value);
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
  return Promise.resolve();
}

function bindPortalActions() {
  customerDashboard.querySelectorAll("[data-copy-order]").forEach((button) => {
    button.addEventListener("click", async () => {
      await copyText(button.dataset.copyOrder);
      showToast("Booking ID copied");
    });
  });
}

function buildWholesaleMessage(form) {
  const data = new FormData(form);

  return [
    `New ${STORE_CONFIG.shopName} Wholesale Enquiry`,
    "",
    `Business: ${data.get("businessName")}`,
    `Contact: ${data.get("contactName")}`,
    `Country / City: ${data.get("country")}`,
    `Monthly Volume: ${data.get("volume")}`,
    "",
    "Product Interest:",
    data.get("message") || "Not specified"
  ].join("\n");
}

async function syncWholesaleEnquiry(form) {
  const data = new FormData(form);
  try {
    await apiRequest("/api/wholesale", {
      method: "POST",
      body: JSON.stringify({
        businessName: data.get("businessName"),
        contactName: data.get("contactName"),
        country: data.get("country"),
        volume: data.get("volume"),
        message: data.get("message")
      })
    });
  } catch {
    // WhatsApp remains the fallback while backend hosting is being activated.
  }
}

function getWhatsAppUrl(message) {
  const number = STORE_CONFIG.whatsappNumber.replace(/\D/g, "");
  const text = encodeURIComponent(message);
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}

function renderPaymentDetails() {
  const totals = getTotals();
  const payment = paymentMethod.value;
  const upiReady = Boolean(STORE_CONFIG.upiId.trim());
  const pendingMessage = "UPI ID is not added yet. Add it in store-config.js to accept direct UPI payment.";

  if (payment !== "UPI prepaid") {
    paymentDetails.innerHTML = `
      <p>${getPaymentNote(payment, totals.total)}</p>
    `;
    return;
  }

  const orderId = "cart";
  const upiUrl = getUpiPayUrl(totals.total, orderId);
  paymentDetails.innerHTML = `
    <p>${upiReady ? `Pay ${money(totals.total)} before delivery.` : pendingMessage}</p>
    ${
      upiReady
        ? `<div class="upi-row">
            <span>${STORE_CONFIG.upiId}</span>
            <button type="button" id="copyUpi">
              <i data-lucide="clipboard"></i>
              Copy
            </button>
          </div>
          <a class="upi-pay-link" href="${upiUrl}">Pay with UPI App</a>`
        : ""
    }
  `;

  const copyUpi = document.querySelector("#copyUpi");
  if (copyUpi) {
    copyUpi.addEventListener("click", async () => {
      await navigator.clipboard.writeText(STORE_CONFIG.upiId);
      showToast("UPI ID copied");
    });
  }

  refreshIcons();
}

function renderCart() {
  const lines = getCartLines();
  const count = lines.reduce((sum, item) => sum + item.quantity, 0);
  document.querySelector("[data-cart-count]").textContent = count;

  cartItems.innerHTML = lines.length
    ? lines
        .map(
          (item) => `
          <div class="cart-line">
            <div>
              <h3>${item.name}</h3>
              <p>${item.size} - ${money(item.price)} each</p>
            </div>
            <div>
              <div class="quantity" aria-label="${item.name} quantity">
                <button type="button" data-minus="${item.id}" aria-label="Decrease ${item.name}">-</button>
                <span>${item.quantity}</span>
                <button type="button" data-plus="${item.id}" aria-label="Increase ${item.name}">+</button>
              </div>
            </div>
          </div>
        `
        )
        .join("")
    : `<div class="empty-cart">Your cart is empty.</div>`;

  cartItems.querySelectorAll("[data-minus]").forEach((button) => {
    button.addEventListener("click", () => setQuantity(button.dataset.minus, (state.cart.get(button.dataset.minus) || 0) - 1));
  });
  cartItems.querySelectorAll("[data-plus]").forEach((button) => {
    button.addEventListener("click", () => setQuantity(button.dataset.plus, (state.cart.get(button.dataset.plus) || 0) + 1));
  });

  const totals = getTotals();
  cartTotals.innerHTML = `
    <div><span>Subtotal</span><span>${money(totals.subtotal)}</span></div>
    <div><span>Discount</span><span>${totals.discount ? `-${money(totals.discount)}` : money(0)}</span></div>
    <div><span>Delivery</span><span>${totals.delivery ? money(totals.delivery) : "Free"}</span></div>
    <div><strong>Total</strong><strong>${money(totals.total)}</strong></div>
  `;
  renderPaymentDetails();
}

function openCart() {
  closeProductDetail();
  prefillCheckoutFromCustomer();
  cartDrawer.classList.add("is-open");
  overlay.classList.add("is-open");
  cartDrawer.setAttribute("aria-hidden", "false");
}

function closeCart() {
  cartDrawer.classList.remove("is-open");
  overlay.classList.remove("is-open");
  cartDrawer.setAttribute("aria-hidden", "true");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function refreshIcons() {
  createIcons({
    icons: {
      BadgeCheck,
      ChevronDown,
      Clipboard,
      Factory,
      FlaskConical,
      Globe2,
      Handshake,
      Leaf,
      MessageCircle,
      PackageCheck,
      PackageOpen,
      Plus,
      Search,
      Send,
      ShoppingBag,
      Store,
      ShieldCheck,
      Wheat,
      X
    }
  });
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    setProductFilter(button.dataset.filter);
  });
});

document.querySelectorAll("[data-category-jump]").forEach((link) => {
  link.addEventListener("click", () => {
    setProductFilter(link.dataset.categoryJump);
  });
});

document.querySelector("#searchInput").addEventListener("input", (event) => {
  state.search = event.target.value;
  renderProducts();
});

document.querySelector("#sortSelect").addEventListener("change", (event) => {
  state.sort = event.target.value;
  renderProducts();
});

paymentMethod.addEventListener("change", renderPaymentDetails);

document.querySelector(".cart-trigger").addEventListener("click", openCart);
document.querySelector(".close-cart").addEventListener("click", closeCart);
document.querySelector(".close-detail").addEventListener("click", closeProductDetail);
overlay.addEventListener("click", () => {
  closeCart();
  closeProductDetail();
});

document.querySelector("#applyCoupon").addEventListener("click", () => {
  const code = couponInput.value.trim().toUpperCase();
  if (code === "SPICE10") {
    state.couponApplied = true;
    couponMessage.textContent = "SPICE10 applied.";
    renderCart();
  } else {
    state.couponApplied = false;
    couponMessage.textContent = "Try SPICE10 for 10% off.";
    renderCart();
  }
});

document.querySelector("#whatsappOrder").addEventListener("click", () => {
  if (!state.cart.size) {
    showToast("Add at least one product first");
    return;
  }

  if (!checkoutForm.reportValidity()) return;

  const orderId = createOrderId();
  const order = createOrderRecord(checkoutForm, orderId, "WhatsApp order request");
  const message = buildWhatsAppMessage(checkoutForm, orderId);
  saveOrderRecord(order);
  window.open(getWhatsAppUrl(message), "_blank", "noopener,noreferrer");
  showToast(`Order ${orderId} ready in WhatsApp`);
});

checkoutForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.cart.size) {
    showToast("Add at least one product first");
    return;
  }

  const orderId = createOrderId();
  const order = createOrderRecord(event.currentTarget, orderId, "Website cart booking");
  saveOrderRecord(order);
  state.cart.clear();
  state.couponApplied = false;
  couponInput.value = "";
  couponMessage.textContent = "";
  event.currentTarget.reset();
  renderCart();
  closeCart();
  showToast(`Order ${orderId} placed successfully`);
});

customerLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const customer = {
    name: String(data.get("customerName") || "").trim(),
    phone: String(data.get("customerPhone") || "").trim(),
    email: String(data.get("customerEmail") || "").trim(),
    location: String(data.get("customerLocation") || "").trim()
  };

  saveCustomer(customer);
  state.trackedOrder = null;
  prefillCheckoutFromCustomer();
  renderCustomerPortal();
  await loadCustomerOrdersFromBackend(customer.phone);
  showToast("Customer login saved");
});

orderLookupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const orderId = String(data.get("orderId") || "").trim().toUpperCase();
  const phone = normalizePhone(data.get("phone"));

  try {
    const params = new URLSearchParams({ id: orderId, phone });
    const payload = await apiRequest(`/api/orders/track?${params.toString()}`);
    upsertOrderRecords(payload.order, payload.order);
    showToast(`Tracking ${payload.order.id}`);
    return;
  } catch {
    // Fall back to this browser's saved orders when the backend is not active yet.
  }

  const order = state.orders.find((item) => item.id.toUpperCase() === orderId && normalizePhone(item.customer.phone) === phone);

  if (!order) {
    state.trackedOrder = null;
    renderCustomerPortal();
    showToast("No matching order found");
    return;
  }

  state.trackedOrder = order;
  renderCustomerPortal();
  showToast(`Tracking ${order.id}`);
});

wholesaleForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = buildWholesaleMessage(event.currentTarget);
  syncWholesaleEnquiry(event.currentTarget);
  window.open(getWhatsAppUrl(message), "_blank", "noopener,noreferrer");
  showToast("Wholesale enquiry ready in WhatsApp");
});

document.querySelectorAll(".faq-item button").forEach((button) => {
  button.addEventListener("click", () => {
    const item = button.closest(".faq-item");
    const isOpen = item.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(isOpen));
  });
});

renderProducts();
renderCategoryProducts();
renderCart();
prefillCustomerLoginForm();
renderCustomerPortal();
refreshIcons();
