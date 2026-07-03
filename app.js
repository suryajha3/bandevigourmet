import {
  BadgeCheck,
  ChevronDown,
  CheckCircle2,
  Clipboard,
  FileText,
  Factory,
  FlaskConical,
  Globe2,
  Handshake,
  Leaf,
  LogOut,
  MessageCircle,
  PackageCheck,
  PackageOpen,
  Printer,
  Plus,
  RotateCw,
  Search,
  Send,
  ShoppingBag,
  Store,
  ShieldCheck,
  Truck,
  UserRound,
  Wheat,
  X,
  createIcons
} from "lucide";
import productDetails from "./product-details.json";
import products from "./products.json";
import { STORE_CONFIG } from "./store-config.js";

const API_TIMEOUT_MS = 6000;
const RENDER_API_ORIGIN = "https://bandevigourmet-web.onrender.com";
const API_ORIGIN = ["127.0.0.1", "localhost"].includes(window.location.hostname) ? RENDER_API_ORIGIN : window.location.origin;

const catalog = products.map((product) => ({
  ...product,
  details: productDetails[product.id] || {}
}));

const STORAGE_KEYS = {
  customer: "bandevi-gourmet-customer",
  orders: "bandevi-gourmet-orders",
  cart: "bandevi-gourmet-cart"
};

const ORDER_STEPS = [
  { key: "booked", label: "Booked", helper: "ID created" },
  { key: "confirmed", label: "Confirmed", helper: "Seller approved" },
  { key: "packed", label: "Packed", helper: "Ready to ship" },
  { key: "dispatched", label: "Dispatched", helper: "On the way" },
  { key: "delivered", label: "Delivered", helper: "Completed" }
];
const ORDER_LABELS = {
  booked: "Booked",
  confirmed: "Confirmed",
  packed: "Packed",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled"
};

const state = {
  filter: "all",
  search: "",
  sort: "featured",
  couponApplied: false,
  cart: loadCart(),
  customer: loadCustomer(),
  customerSummary: null,
  customerEnquiries: [],
  customerSyncStatus: "local",
  orders: loadOrders(),
  trackedOrder: null
};

ensureStoreShell();

const rupee = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0
});

const productGrid = document.querySelector("#productGrid");
const makhanaProductGrid = document.querySelector("#makhanaProductGrid");
const masalaProductGrid = document.querySelector("#masalaProductGrid");
const pohaProductGrid = document.querySelector("#pohaProductGrid");
const singleProductPage = document.querySelector("#singleProductPage");
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
const customerLoginStatus = document.querySelector("#customerLoginStatus");
const confirmationPage = document.querySelector("#confirmationPage");
const overlay = document.querySelector("[data-overlay]");
const toast = document.querySelector("#toast");
const couponInput = document.querySelector("#couponInput");
const couponMessage = document.querySelector("#couponMessage");

function ensureStoreShell() {
  if (!document.querySelector(".product-detail-drawer")) {
    document.body.insertAdjacentHTML(
      "beforeend",
      `
        <aside class="product-detail-drawer" aria-label="Product details" aria-hidden="true">
          <div class="drawer-header">
            <div>
              <p class="eyebrow">Product details</p>
              <h2>Buyer information</h2>
            </div>
            <button class="icon-button close-detail" type="button" aria-label="Close product details">
              <i data-lucide="x"></i>
            </button>
          </div>
          <div class="product-detail-content" id="productDetailContent"></div>
        </aside>
      `
    );
  }

  if (!document.querySelector(".cart-drawer")) {
    document.body.insertAdjacentHTML(
      "beforeend",
      `
        <aside class="cart-drawer" aria-label="Shopping cart" aria-hidden="true">
          <div class="drawer-header">
            <div>
              <p class="eyebrow">Your cart</p>
              <h2>Order summary</h2>
            </div>
            <button class="icon-button close-cart" type="button" aria-label="Close cart">
              <i data-lucide="x"></i>
            </button>
          </div>
          <div class="cart-items" id="cartItems"></div>
          <div class="coupon-row">
            <input id="couponInput" type="text" placeholder="Coupon code" aria-label="Coupon code" />
            <button id="applyCoupon" type="button">Apply</button>
          </div>
          <p class="coupon-message" id="couponMessage"></p>
          <form class="checkout-form" id="checkoutForm">
            <label>
              <span>Name</span>
              <input name="name" type="text" required />
            </label>
            <label>
              <span>Phone</span>
              <input name="phone" type="tel" required />
            </label>
            <label>
              <span>Email</span>
              <input name="email" type="email" placeholder="Email for updates" />
            </label>
            <label>
              <span>Country / city</span>
              <input name="countryCity" type="text" placeholder="Example: India, Patna" required />
            </label>
            <label>
              <span>Pincode / ZIP</span>
              <input name="postalCode" type="text" placeholder="Delivery postal code" />
            </label>
            <label>
              <span>Address</span>
              <textarea name="address" rows="3" required></textarea>
            </label>
            <label>
              <span>Order type</span>
              <select name="orderType">
                <option>Retail home order</option>
                <option>Gift order</option>
                <option>Wholesale sample request</option>
                <option>Export buyer enquiry</option>
              </select>
            </label>
            <label>
              <span>Payment</span>
              <select name="payment" id="paymentMethod">
                <option>Cash on delivery</option>
                <option>UPI prepaid</option>
                <option>UPI on delivery</option>
                <option>Card on delivery</option>
              </select>
            </label>
            <div class="payment-details" id="paymentDetails"></div>
            <div class="totals" id="cartTotals"></div>
            <button class="whatsapp-button" id="whatsappOrder" type="button">
              <i data-lucide="message-circle"></i>
              Send on WhatsApp
            </button>
            <button class="checkout-button" type="submit">
              <i data-lucide="badge-check"></i>
              Place order
            </button>
          </form>
        </aside>
      `
    );
  }

  if (!document.querySelector("[data-overlay]")) {
    document.body.insertAdjacentHTML("beforeend", `<div class="overlay" data-overlay></div>`);
  }

  if (!document.querySelector("#toast")) {
    document.body.insertAdjacentHTML("beforeend", `<div class="toast" id="toast" role="status" aria-live="polite"></div>`);
  }
}

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
  const apiPath = path.startsWith("http") ? path : `${API_ORIGIN}${path}`;

  try {
    const response = await fetch(apiPath, {
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

async function apiWriteOnly(path, payload) {
  await fetch(`${API_ORIGIN}${path}`, {
    method: "POST",
    mode: "no-cors",
    keepalive: true,
    headers: {
      "Content-Type": "text/plain;charset=UTF-8"
    },
    body: JSON.stringify(payload)
  });
}

function loadCustomer() {
  return readJson(STORAGE_KEYS.customer, null);
}

function loadOrders() {
  return readJson(STORAGE_KEYS.orders, []);
}

function loadCart() {
  const saved = readJson(STORAGE_KEYS.cart, []);
  const entries = Array.isArray(saved) ? saved : [];
  return new Map(
    entries
      .map(([id, quantity]) => [String(id), Number(quantity)])
      .filter(([id, quantity]) => catalog.some((product) => product.id === id) && quantity > 0)
  );
}

function saveCart() {
  writeJson(STORAGE_KEYS.cart, [...state.cart.entries()]);
}

function saveCustomer(customer) {
  state.customer = customer;
  writeJson(STORAGE_KEYS.customer, customer);
}

function saveOrders(orders) {
  state.orders = orders;
  writeJson(STORAGE_KEYS.orders, orders);
}

async function syncCustomerProfile(customer) {
  try {
    const payload = await apiRequest("/api/customers", {
      method: "POST",
      body: JSON.stringify(customer)
    });
    if (payload.customer) {
      state.customer = { ...customer, ...payload.customer };
      writeJson(STORAGE_KEYS.customer, state.customer);
    }
    state.customerSyncStatus = "synced";
    return payload.customer || null;
  } catch {
    state.customerSyncStatus = "local";
    return null;
  }
}

function getStatusIndex(status) {
  const index = ORDER_STEPS.findIndex((step) => step.key === status);
  return index >= 0 ? index : 0;
}

function getStatusLabel(status) {
  return ORDER_LABELS[status] || status || "Booked";
}

function isClosedOrder(order) {
  return ["delivered", "cancelled"].includes(order?.status || "");
}

function productImage(product) {
  return product.image || "/assets/makhana-masala-hero.png";
}

function productUrl(product) {
  return `./product.html?id=${encodeURIComponent(product.id)}`;
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
          <a class="detail-button" href="${productUrl(product)}">View details</a>
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
          <a class="detail-button" href="${productUrl(product)}">Details</a>
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
  if (!productGrid) return;
  const visible = getFilteredProducts();

  productGrid.innerHTML = visible.length
    ? visible.map(renderProductCard).join("")
    : `<div class="empty-cart">No products matched that search.</div>`;

  bindAddButtons(productGrid);

  refreshIcons();
}

function renderCategoryProducts() {
  const categorySections = [
    { category: "makhana", grid: makhanaProductGrid },
    { category: "masala", grid: masalaProductGrid },
    { category: "poha", grid: pohaProductGrid }
  ];

  categorySections.forEach(({ category, grid }) => {
    if (!grid) return;
    const categoryProducts = catalog.filter((product) => product.category === category);
    grid.innerHTML = categoryProducts.map(renderCategoryCard).join("");
    bindAddButtons(grid);
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

function renderProductFacts(details) {
  return `
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
  `;
}

function renderUsagePanel(details) {
  return `
    <div class="usage-panel">
      <h4>Usage ideas</h4>
      <div>${(details.usage || []).map((item) => `<span>${item}</span>`).join("")}</div>
    </div>
  `;
}

function renderSingleProductPage() {
  if (!singleProductPage) return;

  const params = new URLSearchParams(window.location.search);
  const product = catalog.find((item) => item.id === params.get("id")) || catalog[0];
  if (!product) {
    singleProductPage.innerHTML = `<section class="page-hero"><h1>Product not found.</h1><a class="primary-link" href="./products.html">Back to products</a></section>`;
    return;
  }

  const details = product.details || {};
  const sameCategory = catalog.filter((item) => item.category === product.category && item.id !== product.id).slice(0, 3);
  document.title = `${product.name} | BandEvi Gourmet`;

  singleProductPage.innerHTML = `
    <section class="single-product-hero" aria-labelledby="single-product-title">
      <div class="single-product-media">
        <img src="${productImage(product)}" alt="${product.name}" style="--position: ${imagePosition(product)}" />
      </div>
      <div class="single-product-copy">
        <p class="eyebrow">${escapeHtml(product.category)} product</p>
        <h1 id="single-product-title">${escapeHtml(product.name)}</h1>
        <p>${escapeHtml(product.description)}</p>
        <div class="single-product-meta" aria-label="Product highlights">
          <span>${escapeHtml(product.badge)}</span>
          <span>${escapeHtml(product.size)}</span>
          <span>${product.rating}/5 rating</span>
        </div>
        <div class="single-product-price">
          <strong>${money(product.price)}</strong>
          <span>Cart booking and WhatsApp support available</span>
        </div>
        <div class="single-product-actions">
          <button type="button" data-add="${product.id}">
            <i data-lucide="plus"></i>
            Add to cart
          </button>
          <button class="secondary-product-action cart-trigger" type="button">
            <i data-lucide="shopping-bag"></i>
            Open cart
          </button>
        </div>
      </div>
    </section>

    <section class="single-product-section" aria-labelledby="product-detail-title">
      <div class="section-head">
        <div>
          <p class="eyebrow">Product details</p>
          <h2 id="product-detail-title">Ingredients, usage, storage, and buyer notes</h2>
        </div>
        <a class="category-link" href="./products.html#${product.category}-products">Back to ${escapeHtml(product.category)}</a>
      </div>
      ${renderProductFacts(details)}
      ${renderUsagePanel(details)}
      <p class="detail-disclaimer">${details.disclaimer || "Replace display values with verified packaging details before final commercial launch."}</p>
    </section>

    <section class="single-product-section" aria-labelledby="related-products-title">
      <div class="section-head">
        <div>
          <p class="eyebrow">More options</p>
          <h2 id="related-products-title">Related ${escapeHtml(product.category)} products</h2>
        </div>
      </div>
      <div class="category-grid">${sameCategory.length ? sameCategory.map(renderCategoryCard).join("") : `<article class="admin-empty">Explore the full catalog for more products.</article>`}</div>
    </section>
  `;

  bindAddButtons(singleProductPage);
  bindDetailButtons(singleProductPage);
  singleProductPage.querySelectorAll(".cart-trigger").forEach((button) => {
    button.addEventListener("click", openCart);
  });
  refreshIcons();
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

    ${renderProductFacts(details)}
    ${renderUsagePanel(details)}

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
  saveCart();
  renderCart();
  showToast("Added to cart");
}

function setQuantity(id, quantity) {
  if (quantity <= 0) {
    state.cart.delete(id);
  } else {
    state.cart.set(id, quantity);
  }
  saveCart();
  renderCart();
}

function getCartLines() {
  return [...state.cart.entries()]
    .map(([id, quantity]) => {
      const product = catalog.find((item) => item.id === id);
      if (!product) return null;
      return { ...product, quantity, lineTotal: product.price * quantity };
    })
    .filter(Boolean);
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
  const placedAt = new Date().toISOString();

  return {
    id: orderId,
    source,
    status: "booked",
    placedAt,
    updatedAt: placedAt,
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
    paymentState: "Payment pending",
    paymentNote: getPaymentNote(payment, totals.total),
    courier: "",
    trackingCode: "",
    trackingUrl: "",
    dispatchDate: "",
    eta: "",
    adminNote: "",
    totals,
    items: lines.map((item) => ({
      id: item.id,
      name: item.name,
      size: item.size,
      quantity: item.quantity,
      price: item.price,
      lineTotal: item.lineTotal
    })),
    statusHistory: [
      {
        status: "booked",
        note: "Booking ID created from website checkout.",
        at: placedAt
      }
    ]
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
    try {
      await apiWriteOnly("/api/orders", order);
      return order;
    } catch {
      // Local booking ID remains available if the live backend is temporarily unreachable.
    }
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
  const cleanPhone = normalizePhone(phone);
  try {
    const params = new URLSearchParams({ phone: cleanPhone });
    const payload = await apiRequest(`/api/customer/dashboard?${params.toString()}`);
    if (payload.customer) {
      state.customer = { ...(state.customer || {}), ...payload.customer };
      writeJson(STORAGE_KEYS.customer, state.customer);
    }
    state.customerSummary = payload.summary || null;
    state.customerEnquiries = payload.enquiries || [];
    if (payload.orders?.length) upsertOrderRecords(payload.orders);
    else renderCustomerPortal();
    return payload.orders || [];
  } catch {
    try {
      const params = new URLSearchParams({ phone: cleanPhone });
      const payload = await apiRequest(`/api/orders/customer?${params.toString()}`);
      if (payload.orders?.length) upsertOrderRecords(payload.orders);
      return payload.orders || [];
    } catch {
      return [];
    }
  }
}

function formatOrderDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "Date pending";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function renderStatusSteps(order) {
  if (order.status === "cancelled") {
    return `
      <span class="is-done is-cancelled">
        <strong>Cancelled</strong>
        <small>Order closed</small>
      </span>
    `;
  }

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
    delivered: "Order is marked delivered. Support remains available for product concerns.",
    cancelled: "Order is closed as cancelled. Contact support if this needs review."
  };

  return messages[status] || messages.booked;
}

function renderDeliveryTrustPanel(order) {
  const dispatched = order.status === "dispatched" || order.status === "delivered";
  return `
    <div class="delivery-trust-panel" aria-label="Delivery support policy">
      <span>
        <strong>${dispatched ? "Parcel support" : "Dispatch support"}</strong>
        ${dispatched ? "Keep packaging photos if the parcel arrives damaged." : "Courier details are added by the order desk before dispatch."}
      </span>
      <span>
        <strong>Proof ready</strong>
        Booking ID, address, item list, and timeline are saved for support review.
      </span>
      <span>
        <strong>Delivery window</strong>
        ${escapeHtml(order.eta || "ETA is shared after packing and courier handover.")}
      </span>
    </div>
  `;
}

function renderOrderHistory(order) {
  const history = Array.isArray(order.statusHistory) ? order.statusHistory.slice(-5).reverse() : [];
  if (!history.length) return "";

  return `
    <div class="order-history" aria-label="Order update history">
      ${history
        .map(
          (item) => `
            <span>
              <strong>${escapeHtml(getStatusLabel(item.status))}</strong>
              <small>${escapeHtml(item.note || "Status updated")}</small>
              <time>${formatOrderDate(item.at || order.updatedAt || order.placedAt)}</time>
            </span>
          `
        )
        .join("")}
    </div>
  `;
}

function renderOrderCard(order) {
  const items = order.items || [];
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const itemSummary = items.length
    ? items.map((item) => `${escapeHtml(item.name)} x ${item.quantity}`).join(", ")
    : "Products to be confirmed";
  const statusLabel = getStatusLabel(order.status);
  const orderType = order.orderType || order.source || "Website booking";
  const countryCity = order.countryCity || order.customer?.location || "Location to be confirmed";
  const total = order.totals?.total || 0;
  const supportUrl = getWhatsAppUrl(`Support request for ${STORE_CONFIG.shopName} booking ${order.id}`);
  const trackingItems = [
    order.paymentState ? `<span><strong>Payment status</strong>${escapeHtml(order.paymentState)}</span>` : "",
    order.courier ? `<span><strong>Courier</strong>${escapeHtml(order.courier)}</span>` : "",
    order.trackingCode ? `<span><strong>Tracking code</strong>${escapeHtml(order.trackingCode)}</span>` : "",
    order.dispatchDate ? `<span><strong>Dispatch date</strong>${escapeHtml(order.dispatchDate)}</span>` : "",
    order.eta ? `<span><strong>Expected delivery</strong>${escapeHtml(order.eta)}</span>` : ""
  ].filter(Boolean);

  return `
    <article class="order-card">
      <header>
        <div>
          <h4>${escapeHtml(order.id)}</h4>
          <p>${escapeHtml(order.source || "Website booking")} - ${formatOrderDate(order.placedAt)}</p>
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
      ${
        trackingItems.length
          ? `<div class="tracking-panel" aria-label="Delivery tracking details">${trackingItems.join("")}</div>`
          : ""
      }
      ${renderDeliveryTrustPanel(order)}
      ${order.adminNote ? `<p class="order-note"><strong>Seller note:</strong> ${escapeHtml(order.adminNote)}</p>` : ""}
      <div class="status-steps" aria-label="Order status timeline">${renderStatusSteps(order)}</div>
      ${renderOrderHistory(order)}
      <div class="order-actions">
        <button type="button" data-copy-order="${escapeHtml(order.id)}">Copy booking ID</button>
        <button type="button" data-reorder="${escapeHtml(order.id)}">Reorder items</button>
        ${order.trackingUrl ? `<a href="${escapeHtml(order.trackingUrl)}" target="_blank" rel="noopener noreferrer">Courier tracking</a>` : ""}
        <a href="${supportUrl}" target="_blank" rel="noopener noreferrer">Support on WhatsApp</a>
      </div>
    </article>
  `;
}

function getConfirmationUrl(order) {
  const orderId = encodeURIComponent(order?.id || "");
  const phone = encodeURIComponent(normalizePhone(order?.customer?.phone || ""));
  return `./confirmation.html?id=${orderId}&phone=${phone}`;
}

function redirectToConfirmation(order) {
  window.location.assign(getConfirmationUrl(order));
}

function findLocalOrder(orderId, phone) {
  const cleanOrderId = String(orderId || "").trim().toUpperCase();
  const cleanPhone = normalizePhone(phone);
  return state.orders.find((order) => order.id?.toUpperCase() === cleanOrderId && normalizePhone(order.customer?.phone) === cleanPhone);
}

function renderConfirmationItems(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length) {
    return `<p class="confirmation-empty">Product details are not available for this booking yet.</p>`;
  }

  return `
    <div class="invoice-table" role="table" aria-label="Invoice items">
      <div class="invoice-row invoice-head" role="row">
        <span role="columnheader">Product</span>
        <span role="columnheader">Pack</span>
        <span role="columnheader">Qty</span>
        <span role="columnheader">Amount</span>
      </div>
      ${items
        .map(
          (item) => `
            <div class="invoice-row" role="row">
              <span role="cell">${escapeHtml(item.name || "Product")}</span>
              <span role="cell">${escapeHtml(item.size || "-")}</span>
              <span role="cell">${Number(item.quantity || 0)}</span>
              <span role="cell">${money(Number(item.lineTotal || 0))}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderConfirmationTotals(order) {
  const totals = order.totals || {};
  return `
    <div class="invoice-totals" aria-label="Invoice totals">
      <span><strong>Subtotal</strong>${money(Number(totals.subtotal || 0))}</span>
      <span><strong>Discount</strong>${totals.discount ? `-${money(Number(totals.discount || 0))}` : money(0)}</span>
      <span><strong>Delivery</strong>${totals.delivery ? money(Number(totals.delivery || 0)) : "Free"}</span>
      <span class="invoice-total"><strong>Total</strong>${money(Number(totals.total || 0))}</span>
    </div>
  `;
}

function renderConfirmationPage(order, source = "saved") {
  if (!confirmationPage) return;

  const statusLabel = getStatusLabel(order.status);
  const phone = normalizePhone(order.customer?.phone || "");
  const trackUrl = `./track.html?id=${encodeURIComponent(order.id)}&phone=${encodeURIComponent(phone)}`;
  const supportUrl = getWhatsAppUrl(`Support request for ${STORE_CONFIG.shopName} booking ${order.id}`);
  const invoiceId = `INV-${order.id}`;

  confirmationPage.innerHTML = `
    <section class="confirmation-hero" aria-labelledby="confirmation-title">
      <div>
        <p class="eyebrow">Booking confirmed</p>
        <h1 id="confirmation-title">Order ${escapeHtml(order.id)} is received.</h1>
        <p>
          Your booking ID has been generated. Keep this page for your invoice summary, tracking link, and support reference.
        </p>
        <div class="confirmation-badges" aria-label="Confirmation highlights">
          <span><i data-lucide="check-circle-2"></i>${escapeHtml(statusLabel)}</span>
          <span><i data-lucide="file-text"></i>${escapeHtml(invoiceId)}</span>
          <span><i data-lucide="badge-check"></i>${source === "live" ? "Live order desk synced" : "Saved on this device"}</span>
        </div>
      </div>
      <div class="confirmation-actions" aria-label="Order actions">
        <a class="primary-link" href="${trackUrl}">
          <i data-lucide="search"></i>
          Track order
        </a>
        <button type="button" data-copy-confirmation="${escapeHtml(order.id)}">
          <i data-lucide="clipboard"></i>
          Copy ID
        </button>
        <button type="button" data-print-confirmation>
          <i data-lucide="printer"></i>
          Print / Save PDF
        </button>
        <a href="${supportUrl}" target="_blank" rel="noopener noreferrer">
          <i data-lucide="message-circle"></i>
          WhatsApp support
        </a>
      </div>
    </section>

    <section class="invoice-card" aria-labelledby="invoice-title">
      <header class="invoice-header">
        <div>
          <p class="eyebrow">Invoice summary</p>
          <h2 id="invoice-title">${escapeHtml(invoiceId)}</h2>
          <p>Booking date: ${formatOrderDate(order.placedAt)}</p>
        </div>
        <div>
          <strong>${escapeHtml(STORE_CONFIG.shopName)}</strong>
          <span>${escapeHtml(STORE_CONFIG.deliveryArea)}</span>
          <span>Support: ${escapeHtml(STORE_CONFIG.whatsappNumber || "WhatsApp support")}</span>
        </div>
      </header>

      <div class="invoice-parties">
        <article>
          <strong>Customer</strong>
          <span>${escapeHtml(order.customer?.name || "Customer")}</span>
          <span>${escapeHtml(order.customer?.phone || "")}</span>
          ${order.customer?.email ? `<span>${escapeHtml(order.customer.email)}</span>` : ""}
        </article>
        <article>
          <strong>Delivery</strong>
          <span>${escapeHtml(order.countryCity || order.customer?.location || "Location pending")}</span>
          ${order.postalCode ? `<span>${escapeHtml(order.postalCode)}</span>` : ""}
          <span>${escapeHtml(order.address || "Address to be confirmed")}</span>
          ${order.dispatchDate ? `<span>Dispatch: ${escapeHtml(order.dispatchDate)}</span>` : ""}
          ${order.courier ? `<span>Courier: ${escapeHtml(order.courier)}</span>` : ""}
          ${order.trackingCode ? `<span>Tracking: ${escapeHtml(order.trackingCode)}</span>` : ""}
          ${order.trackingUrl ? `<span><a href="${escapeHtml(order.trackingUrl)}" target="_blank" rel="noopener noreferrer">Open courier tracking</a></span>` : ""}
        </article>
        <article>
          <strong>Payment</strong>
          <span>${escapeHtml(order.payment || "To be confirmed")}</span>
          <span>${escapeHtml(order.paymentState || "Payment pending")}</span>
          <span>${escapeHtml(order.paymentNote || "Payment will be confirmed by the order desk.")}</span>
        </article>
      </div>

      ${renderConfirmationItems(order)}
      ${renderConfirmationTotals(order)}

      <div class="invoice-status-panel">
        <div class="status-steps" aria-label="Order status timeline">${renderStatusSteps(order)}</div>
        <p><strong>Next step:</strong> ${escapeHtml(getOrderNextAction(order))}</p>
      </div>

      <p class="invoice-disclaimer">
        This page is a booking confirmation and invoice summary. Final tax invoice, GST/FSSAI details, and export documentation should be issued after verified business registration and packaging details are finalized.
      </p>
    </section>
  `;

  confirmationPage.querySelector("[data-copy-confirmation]")?.addEventListener("click", async (event) => {
    await copyText(event.currentTarget.dataset.copyConfirmation);
    showToast("Booking ID copied");
  });
  confirmationPage.querySelector("[data-print-confirmation]")?.addEventListener("click", () => window.print());
  refreshIcons();
}

function renderConfirmationFallback(title, message) {
  if (!confirmationPage) return;

  confirmationPage.innerHTML = `
    <section class="confirmation-hero is-empty" aria-labelledby="confirmation-title">
      <div>
        <p class="eyebrow">Order confirmation</p>
        <h1 id="confirmation-title">${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
      </div>
      <div class="confirmation-actions">
        <a class="primary-link" href="./track.html">
          <i data-lucide="search"></i>
          Track order
        </a>
        <a href="./products.html">
          <i data-lucide="store"></i>
          Continue shopping
        </a>
      </div>
    </section>
  `;
  refreshIcons();
}

async function hydrateConfirmationPage() {
  if (!confirmationPage) return;

  const params = new URLSearchParams(window.location.search);
  const orderId = String(params.get("id") || "").trim().toUpperCase();
  const phone = normalizePhone(params.get("phone"));
  if (!orderId || !phone) {
    renderConfirmationFallback("Booking details needed.", "Open this page from checkout or use the tracking page with your booking ID and phone number.");
    return;
  }

  try {
    const payload = await apiRequest(`/api/orders/track?${new URLSearchParams({ id: orderId, phone }).toString()}`);
    if (payload.order) {
      upsertOrderRecords(payload.order, payload.order);
      renderConfirmationPage(payload.order, "live");
      return;
    }
  } catch {
    // Local order fallback keeps the confirmation usable immediately after checkout.
  }

  const localOrder = findLocalOrder(orderId, phone);
  if (localOrder) {
    renderConfirmationPage(localOrder, "saved");
    return;
  }

  renderConfirmationFallback("Booking not found.", "Please check the booking ID and phone number, or contact WhatsApp support with your order details.");
}

function prefillCheckoutFromCustomer() {
  if (!state.customer || !checkoutForm) return;

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

  const portalMode = customerDashboard.dataset.mode || "account";
  const customer = state.customer;
  const ordersForCustomer = customer
    ? state.orders.filter((order) => normalizePhone(order.customer?.phone) === normalizePhone(customer.phone))
    : state.orders;
  const visibleOrders = state.trackedOrder ? [state.trackedOrder] : ordersForCustomer.slice(0, portalMode === "track" ? 1 : 10);
  const activeOrders = ordersForCustomer.filter((order) => !isClosedOrder(order)).length;
  const latestOrder = ordersForCustomer[0];
  const localSpend = ordersForCustomer.reduce((sum, order) => sum + Number(order.totals?.total || 0), 0);
  const summary = state.customerSummary || {
    totalOrders: ordersForCustomer.length,
    activeOrders,
    totalSpend: localSpend,
    latestStatus: latestOrder?.status || ""
  };

  customerDashboard.innerHTML = `
    <h3>${customer ? `Welcome, ${escapeHtml(customer.name)}` : portalMode === "track" ? "Order status result" : "Customer dashboard"}</h3>
    ${
      customer
        ? `<div class="portal-profile">
            <span><i data-lucide="user-round"></i>${escapeHtml(customer.name || "Customer")}</span>
            <span>${escapeHtml(customer.phone)}</span>
            ${customer.email ? `<span>${escapeHtml(customer.email)}</span>` : ""}
            ${customer.location ? `<span>${escapeHtml(customer.location)}</span>` : ""}
            <span>${state.customerSyncStatus === "synced" ? "Backend synced" : "Saved on this device"}</span>
          </div>`
        : `<p class="portal-empty">${portalMode === "track" ? "Enter your booking ID and phone number to see the latest status here." : "Save your login details first, then place an order or track an existing order ID."}</p>`
    }
    ${
      customer
        ? `<div class="portal-stats" aria-label="Customer booking summary">
            <span><strong>${summary.totalOrders || ordersForCustomer.length}</strong><small>Total bookings</small></span>
            <span><strong>${summary.activeOrders ?? activeOrders}</strong><small>Active orders</small></span>
            <span><strong>${money(summary.totalSpend || localSpend)}</strong><small>Total value</small></span>
            <span><strong>${summary.latestStatus ? getStatusLabel(summary.latestStatus) : latestOrder ? getStatusLabel(latestOrder.status) : "None"}</strong><small>Latest status</small></span>
          </div>`
        : ""
    }
    ${
      customer
        ? `<div class="portal-account-actions">
            <button type="button" data-refresh-customer>
              <i data-lucide="rotate-cw"></i>
              Refresh account
            </button>
            <a href="./products.html">
              <i data-lucide="store"></i>
              Shop again
            </a>
            <button type="button" data-logout-customer>
              <i data-lucide="log-out"></i>
              Log out
            </button>
          </div>`
        : ""
    }
    <h4 class="portal-subtitle">${state.trackedOrder ? "Tracked booking" : portalMode === "track" ? "Tracking result" : "Recent bookings"}</h4>
    ${
      visibleOrders.length
        ? visibleOrders.map(renderOrderCard).join("")
        : `<p class="portal-empty">${portalMode === "track" ? "No booking loaded yet. Submit the tracking form to view status." : "No saved orders yet. Place an order from the cart to create your first booking ID."}</p>`
    }
    ${
      state.customerEnquiries.length
        ? `<h4 class="portal-subtitle">Wholesale enquiries</h4>
          <div class="customer-enquiry-list">
            ${state.customerEnquiries.map(renderCustomerEnquiry).join("")}
          </div>`
        : ""
    }
  `;

  bindPortalActions();
  refreshIcons();
}

function renderCustomerEnquiry(enquiry) {
  return `
    <article class="customer-enquiry-card">
      <strong>${escapeHtml(enquiry.id)}</strong>
      <span>${escapeHtml(enquiry.status || "new")}</span>
      <p>${escapeHtml(enquiry.businessName || "Wholesale enquiry")} | ${escapeHtml(enquiry.country || "Location pending")}</p>
      ${enquiry.note ? `<p>${escapeHtml(enquiry.note)}</p>` : ""}
    </article>
  `;
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

function setCustomerLoginStatus(message) {
  if (customerLoginStatus) customerLoginStatus.textContent = message || "";
}

async function refreshCustomerAccount() {
  if (!state.customer?.phone) {
    showToast("Open your account with phone number first");
    return;
  }

  setCustomerLoginStatus("Refreshing account...");
  await loadCustomerOrdersFromBackend(state.customer.phone);
  setCustomerLoginStatus(state.customerSyncStatus === "synced" ? "Account synced with live orders." : "Showing saved account details.");
  showToast("Account refreshed");
}

function logoutCustomer() {
  state.customer = null;
  state.customerSummary = null;
  state.customerEnquiries = [];
  state.trackedOrder = null;
  window.localStorage.removeItem(STORAGE_KEYS.customer);
  if (customerLoginForm) customerLoginForm.reset();
  setCustomerLoginStatus("Logged out on this device.");
  renderCustomerPortal();
  showToast("Customer logged out");
}

function reorderItems(orderId) {
  const order = state.orders.find((item) => item.id === orderId) || state.trackedOrder;
  if (!order?.items?.length) {
    showToast("No items found for reorder");
    return;
  }

  order.items.forEach((item) => {
    const product = catalog.find((catalogItem) => catalogItem.id === item.id);
    if (product) {
      const current = state.cart.get(product.id) || 0;
      state.cart.set(product.id, current + Number(item.quantity || 1));
    }
  });
  saveCart();
  renderCart();
  showToast("Items added to cart");
  openCart();
}

function bindPortalActions() {
  customerDashboard.querySelectorAll("[data-copy-order]").forEach((button) => {
    button.addEventListener("click", async () => {
      await copyText(button.dataset.copyOrder);
      showToast("Booking ID copied");
    });
  });

  customerDashboard.querySelectorAll("[data-reorder]").forEach((button) => {
    button.addEventListener("click", () => reorderItems(button.dataset.reorder));
  });

  customerDashboard.querySelectorAll("[data-refresh-customer]").forEach((button) => {
    button.addEventListener("click", refreshCustomerAccount);
  });

  customerDashboard.querySelectorAll("[data-logout-customer]").forEach((button) => {
    button.addEventListener("click", logoutCustomer);
  });
}

function buildWholesaleMessage(form) {
  const data = new FormData(form);

  return [
    `New ${STORE_CONFIG.shopName} Wholesale Enquiry`,
    "",
    `Business: ${data.get("businessName")}`,
    `Contact: ${data.get("contactName")}`,
    `Phone: ${data.get("phone") || "Not added"}`,
    `Email: ${data.get("email") || "Not added"}`,
    `Country / City: ${data.get("country")}`,
    `Monthly Volume: ${data.get("volume")}`,
    "",
    "Product Interest:",
    data.get("message") || "Not specified"
  ].join("\n");
}

async function syncWholesaleEnquiry(form) {
  const data = new FormData(form);
  const enquiry = {
    businessName: data.get("businessName"),
    contactName: data.get("contactName"),
    phone: data.get("phone"),
    email: data.get("email"),
    country: data.get("country"),
    volume: data.get("volume"),
    message: data.get("message")
  };

  try {
    await apiRequest("/api/wholesale", {
      method: "POST",
      body: JSON.stringify(enquiry)
    });
  } catch {
    try {
      await apiWriteOnly("/api/wholesale", enquiry);
    } catch {
      // WhatsApp remains the fallback while backend hosting is being activated.
    }
  }
}

function getWhatsAppUrl(message) {
  const number = STORE_CONFIG.whatsappNumber.replace(/\D/g, "");
  const text = encodeURIComponent(message);
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}

function renderPaymentDetails() {
  if (!paymentMethod || !paymentDetails) return;
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
  if (!cartItems || !cartTotals) return;
  const lines = getCartLines();
  const count = lines.reduce((sum, item) => sum + item.quantity, 0);
  document.querySelectorAll("[data-cart-count]").forEach((item) => {
    item.textContent = count;
  });

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
  if (!cartDrawer || !overlay) return;
  cartDrawer.classList.add("is-open");
  overlay.classList.add("is-open");
  cartDrawer.setAttribute("aria-hidden", "false");
}

function closeCart() {
  if (!cartDrawer || !overlay) return;
  cartDrawer.classList.remove("is-open");
  overlay.classList.remove("is-open");
  cartDrawer.setAttribute("aria-hidden", "true");
}

function showToast(message) {
  if (!toast) return;
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
      CheckCircle2,
      Clipboard,
      FileText,
      Factory,
      FlaskConical,
      Globe2,
      Handshake,
      Leaf,
      LogOut,
      MessageCircle,
      PackageCheck,
      PackageOpen,
      Printer,
      Plus,
      RotateCw,
      Search,
      Send,
      ShoppingBag,
      Store,
      ShieldCheck,
      Truck,
      UserRound,
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

document.querySelector("#searchInput")?.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderProducts();
});

document.querySelector("#sortSelect")?.addEventListener("change", (event) => {
  state.sort = event.target.value;
  renderProducts();
});

paymentMethod?.addEventListener("change", renderPaymentDetails);

document.querySelectorAll(".cart-trigger").forEach((button) => {
  button.addEventListener("click", openCart);
});
document.querySelector(".close-cart")?.addEventListener("click", closeCart);
document.querySelector(".close-detail")?.addEventListener("click", closeProductDetail);
overlay?.addEventListener("click", () => {
  closeCart();
  closeProductDetail();
});

document.querySelector("#applyCoupon")?.addEventListener("click", () => {
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

document.querySelector("#whatsappOrder")?.addEventListener("click", () => {
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

checkoutForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.cart.size) {
    showToast("Add at least one product first");
    return;
  }

  const orderId = createOrderId();
  const order = createOrderRecord(event.currentTarget, orderId, "Website cart booking");
  saveCustomer(order.customer);
  const customerSync = syncCustomerProfile(order.customer);
  saveOrderRecord(order, { sync: false });
  const syncedOrder = await syncOrderRecord(order);
  await customerSync;
  state.cart.clear();
  saveCart();
  state.couponApplied = false;
  couponInput.value = "";
  couponMessage.textContent = "";
  event.currentTarget.reset();
  renderCart();
  closeCart();
  showToast(`Order ${orderId} placed successfully`);
  redirectToConfirmation(syncedOrder || order);
});

customerLoginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const customer = {
    name: String(data.get("customerName") || "").trim(),
    phone: String(data.get("customerPhone") || "").trim(),
    email: String(data.get("customerEmail") || "").trim(),
    location: String(data.get("customerLocation") || "").trim()
  };

  saveCustomer(customer);
  state.customerSummary = null;
  state.customerEnquiries = [];
  state.trackedOrder = null;
  prefillCheckoutFromCustomer();
  renderCustomerPortal();
  setCustomerLoginStatus("Opening account...");
  await syncCustomerProfile(customer);
  await loadCustomerOrdersFromBackend(customer.phone);
  setCustomerLoginStatus(state.customerSyncStatus === "synced" ? "Account synced with live orders." : "Saved on this device.");
  showToast("Customer profile saved");
});

orderLookupForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const orderId = String(data.get("orderId") || "").trim().toUpperCase();
  const phone = normalizePhone(data.get("phone"));

  try {
    const params = new URLSearchParams({ id: orderId, phone });
    const payload = await apiRequest(`/api/orders/track?${params.toString()}`);
    if (payload.order?.customer?.phone) {
      saveCustomer({
        ...(state.customer || {}),
        ...payload.order.customer,
        location: payload.order.countryCity || payload.order.customer.location || state.customer?.location || ""
      });
      prefillCustomerLoginForm();
    }
    upsertOrderRecords(payload.order, payload.order);
    showToast(`Tracking ${payload.order.id}`);
    return;
  } catch {
    // Fall back to this browser's saved orders when the backend is not active yet.
  }

  const order = state.orders.find((item) => item.id.toUpperCase() === orderId && normalizePhone(item.customer?.phone) === phone);

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

document.querySelector("#refreshCustomerOrders")?.addEventListener("click", refreshCustomerAccount);
document.querySelector("#customerLogout")?.addEventListener("click", logoutCustomer);

async function hydrateTrackingFromUrl() {
  if (!orderLookupForm) return;
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("id") || "";
  const phone = params.get("phone") || "";
  if (!orderId || !phone) return;

  orderLookupForm.elements.orderId.value = orderId;
  orderLookupForm.elements.phone.value = phone;
  orderLookupForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
}

wholesaleForm?.addEventListener("submit", (event) => {
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
renderSingleProductPage();
renderCart();
prefillCustomerLoginForm();
renderCustomerPortal();
if (state.customer?.phone) {
  loadCustomerOrdersFromBackend(state.customer.phone);
}
hydrateTrackingFromUrl();
hydrateConfirmationPage();
refreshIcons();
