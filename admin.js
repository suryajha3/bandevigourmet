const TOKEN_KEY = "bandevi-admin-token";
const API_ORIGIN = window.location.origin;
const STATUS_LABELS = {
  booked: "Booked",
  confirmed: "Confirmed",
  packed: "Packed",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled"
};
const ORDER_FLOW = ["booked", "confirmed", "packed", "dispatched", "delivered", "cancelled"];
const ACTIVE_ORDER_FLOW = ORDER_FLOW.filter((status) => status !== "cancelled");
const WHOLESALE_LABELS = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  "sample-sent": "Sample sent",
  converted: "Converted",
  closed: "Closed"
};
const PAYMENT_STATES = ["Payment pending", "Advance requested", "Paid", "COD", "Refund pending", "Refunded"];
const CUSTOMER_STATUSES = ["active", "repeat", "wholesale", "watchlist", "inactive"];
const SUPPORT_STATUSES = ["new", "reviewing", "waiting-customer", "resolved", "closed"];

const state = {
  token: window.sessionStorage.getItem(TOKEN_KEY) || "",
  summary: null,
  storage: null,
  orders: [],
  enquiries: [],
  customers: [],
  notifications: [],
  supportRequests: [],
  products: [],
  coupons: [],
  notificationConfig: null,
  search: "",
  orderFilter: "all",
  leadFilter: "all"
};

const loginForm = document.querySelector("#adminLoginForm");
const loginMessage = document.querySelector("#adminLoginMessage");
const dashboard = document.querySelector("#adminDashboard");
const adminHero = document.querySelector(".admin-hero");
const adminNavLinks = Array.from(document.querySelectorAll("[data-admin-nav]"));
const statusBox = document.querySelector("#adminStatus");
const statsBox = document.querySelector("#adminStats");
const pipelineBox = document.querySelector("#adminPipeline");
const storageBox = document.querySelector("#adminStorage");
const orderList = document.querySelector("#adminOrderList");
const wholesaleList = document.querySelector("#adminWholesaleList");
const customerList = document.querySelector("#adminCustomerList");
const notificationList = document.querySelector("#adminNotificationList");
const supportList = document.querySelector("#adminSupportList");
const productList = document.querySelector("#adminProductList");
const couponList = document.querySelector("#adminCouponList");
const searchInput = document.querySelector("#adminSearchInput");
const orderFilterInput = document.querySelector("#adminOrderFilter");
const leadFilterInput = document.querySelector("#adminLeadFilter");
const toast = document.querySelector("#adminToast");
const ADMIN_SECTIONS = ["orders", "products", "coupons", "notifications", "support", "wholesale", "customers"];

function money(value) {
  return `Rs. ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value || 0)}`;
}

function getProductPricing(product = {}) {
  const offerPrice = Math.max(0, Number(product.offerPrice ?? product.price ?? 0));
  const explicitDiscount = Math.max(0, Number(product.discountPrice || 0));
  const mrp = Math.max(offerPrice, Number(product.mrp || 0) || offerPrice + explicitDiscount);
  const discountPrice = Math.max(0, Number(product.discountPrice ?? mrp - offerPrice));
  const discountPercent = mrp > offerPrice && mrp > 0 ? Math.round((discountPrice / mrp) * 100) : Number(product.discountPercent || 0);
  return { mrp, offerPrice, discountPrice, discountPercent };
}

function pricingSummary(product = {}) {
  const pricing = getProductPricing(product);
  const discount = pricing.discountPrice ? `${money(pricing.discountPrice)} saved / ${pricing.discountPercent}% off` : "No discount";
  return `MRP ${money(pricing.mrp)} | Offer ${money(pricing.offerPrice)} | ${discount}`;
}

function productReadinessChecks(product = {}) {
  const details = product.details || {};
  const pricing = getProductPricing(product);
  return [
    { label: "Packet photo", ok: Boolean(product.image), fix: "Add a real product image" },
    { label: "MRP and offer", ok: pricing.mrp > 0 && pricing.offerPrice > 0 && pricing.mrp >= pricing.offerPrice, fix: "Add MRP and offer price" },
    { label: "Stock ready", ok: product.stockStatus !== "out-of-stock" && Number(product.stock || 0) > 0, fix: "Add stock or mark preorder" },
    {
      label: "Ingredients",
      ok: Array.isArray(details.ingredients) && details.ingredients.length > 0,
      fix: "Add ingredients"
    },
    {
      label: "Label proof",
      ok: Boolean(details.shelfLife && details.storage && details.allergen),
      fix: "Add shelf life, storage, and allergen notes"
    },
    { label: "Storefront live", ok: product.active !== false, fix: "Turn on storefront visibility" }
  ];
}

function getProductReadiness(product = {}) {
  const checks = productReadinessChecks(product);
  const passed = checks.filter((check) => check.ok).length;
  const score = Math.round((passed / checks.length) * 100);
  return {
    checks,
    score,
    ready: checks.every((check) => check.ok),
    missing: checks.filter((check) => !check.ok)
  };
}

function renderProductReadiness(product = {}) {
  const readiness = getProductReadiness(product);
  const nextFix = readiness.missing[0]?.fix || "Ready for buyers";
  return `
    <div class="admin-product-readiness ${readiness.ready ? "is-ready" : "needs-work"}">
      <div>
        <strong>${readiness.score}% catalog ready</strong>
        <small>${escapeHtml(nextFix)}</small>
      </div>
      <div class="admin-readiness-chips">
        ${readiness.checks
          .map(
            (check) => `
              <span class="${check.ok ? "is-ok" : "is-missing"}">${escapeHtml(check.label)}</span>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderProductManagerBoard(products = [], visibleCount = products.length) {
  const activeProducts = products.filter((product) => product.active !== false);
  const featuredProducts = products.filter((product) => product.featured === true);
  const missingImages = products.filter((product) => !product.image);
  const lowStock = products.filter((product) => ["low-stock", "out-of-stock"].includes(product.stockStatus || ""));
  const readyProducts = products.filter((product) => getProductReadiness(product).ready);
  return `
    <div class="admin-product-board" aria-label="Catalog readiness summary">
      <article><strong>${products.length}</strong><span>Total products</span></article>
      <article><strong>${activeProducts.length}</strong><span>Live on storefront</span></article>
      <article><strong>${featuredProducts.length}</strong><span>Homepage featured</span></article>
      <article><strong>${readyProducts.length}</strong><span>Buyer-ready labels</span></article>
      <article><strong>${missingImages.length}</strong><span>Missing packet photo</span></article>
      <article><strong>${lowStock.length}</strong><span>Stock warnings</span></article>
      <article><strong>${visibleCount}</strong><span>Showing after search</span></article>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isUploadedImage(value) {
  return String(value || "").startsWith("data:image/");
}

function listToLines(value) {
  return Array.isArray(value) ? value.join("\n") : String(value || "");
}

function formList(value) {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function productImagePreviewMarkup(image = "", name = "Product") {
  return image
    ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" />`
    : `<span>No image uploaded</span>`;
}

function compressProductImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Upload a PNG, JPG, or WebP product image."));
      return;
    }
    if (file.size > 8_000_000) {
      reject(new Error("Image is too large. Please use a file under 8 MB."));
      return;
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const maxSide = 1000;
      const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * ratio));
      canvas.height = Math.max(1, Math.round(image.height * ratio));
      const context = canvas.getContext("2d");
      context.fillStyle = "#f8f5ed";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      let quality = 0.82;
      let dataUrl = canvas.toDataURL("image/webp", quality);
      while (dataUrl.length > 1_500_000 && quality > 0.48) {
        quality -= 0.08;
        dataUrl = canvas.toDataURL("image/webp", quality);
      }
      if (dataUrl.length > 2_300_000) {
        reject(new Error("Compressed image is still too large. Try a smaller product photo."));
        return;
      }
      resolve(dataUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read this image file."));
    };
    image.src = objectUrl;
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

async function api(path, options = {}) {
  const apiPath = path.startsWith("http") ? path : `${API_ORIGIN}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(apiPath, {
    ...options,
    headers
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function setStatus(message, type = "info") {
  statusBox.innerHTML = `<div class="admin-alert ${type}">${escapeHtml(message)}</div>`;
}

function setAdminAuthenticated(isAuthenticated) {
  document.body.classList.toggle("admin-authed", Boolean(isAuthenticated));
  if (adminHero) adminHero.hidden = Boolean(isAuthenticated);
  if (!dashboard) return;
  dashboard.hidden = !isAuthenticated;
}

function getActiveAdminSection() {
  const hash = window.location.hash.replace("#", "");
  return ADMIN_SECTIONS.includes(hash) ? hash : "orders";
}

function updateAdminNavState(section = getActiveAdminSection()) {
  adminNavLinks.forEach((link) => {
    const active = link.dataset.adminNav === section;
    link.classList.toggle("is-active", active);
    link.setAttribute("aria-current", active ? "page" : "false");
  });
}

function showAdminSection(section = getActiveAdminSection(), scroll = true) {
  updateAdminNavState(section);
  if (!state.token || dashboard?.hidden) return;
  const target = document.getElementById(section);
  if (target && scroll) target.scrollIntoView({ block: "start", behavior: "smooth" });
}

function formatDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "No date";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function getOrderTrackingPath(order) {
  return `./track.html?id=${encodeURIComponent(order.id)}&phone=${encodeURIComponent(cleanPhone(order.customer?.phone || ""))}`;
}

function getOrderTrackingUrl(order) {
  return new URL(getOrderTrackingPath(order), window.location.href).href;
}

function buildCustomerStatusMessage(order) {
  const status = STATUS_LABELS[order.status] || order.status || "Booked";
  const trackingUrl = getOrderTrackingUrl(order);
  const courierLine = order.courier ? `Courier: ${order.courier}` : "Courier: will be shared after packing";
  const codeLine = order.trackingCode ? `Tracking code: ${order.trackingCode}` : "Tracking code: pending";
  const etaLine = order.eta ? `ETA: ${order.eta}` : "ETA: will be shared after dispatch";

  return [
    `BandEvi Gourmet order update`,
    `Booking ID: ${order.id}`,
    `Status: ${status}`,
    `Payment: ${order.paymentState || order.payment || "Payment pending"}`,
    courierLine,
    codeLine,
    etaLine,
    `Track here: ${trackingUrl}`,
    order.adminNote ? `Seller note: ${order.adminNote}` : "",
    "Thank you for choosing BandEvi Gourmet."
  ]
    .filter(Boolean)
    .join("\n");
}

function getWhatsAppUpdateUrl(order) {
  const phone = cleanPhone(order.customer?.phone || "");
  if (!phone) return "";
  return `https://wa.me/${phone}?text=${encodeURIComponent(buildCustomerStatusMessage(order))}`;
}

function matchesSearch(values) {
  const q = state.search.trim().toLowerCase();
  if (!q) return true;
  return values.join(" ").toLowerCase().includes(q);
}

function orderMatchesSearch(order) {
  return matchesSearch([
    order.id,
    order.status,
    order.orderType,
    order.customer?.name,
    order.customer?.phone,
    order.customer?.email,
    order.countryCity,
    order.address,
    order.paymentState,
    order.courier,
    order.trackingCode,
    order.adminNote,
    ...(order.items || []).map((item) => item.name)
  ]);
}

function enquiryMatchesSearch(enquiry) {
  return matchesSearch([
    enquiry.id,
    enquiry.status,
    enquiry.businessName,
    enquiry.contactName,
    enquiry.phone,
    enquiry.email,
    enquiry.country,
    enquiry.volume,
    enquiry.message,
    enquiry.note
  ]);
}

function customerMatchesSearch(customer) {
  return matchesSearch([
    customer.name,
    customer.phone,
    customer.email,
    customer.location,
    customer.orderCount,
    customer.totalSpend,
    customer.supportCount,
    customer.openSupportCount,
    customer.adminNote
  ]);
}

function supportMatchesSearch(request) {
  return matchesSearch([
    request.id,
    request.orderId,
    request.status,
    request.topic,
    request.name,
    request.phone,
    request.email,
    request.message,
    request.resolutionNote,
    request.internalNote
  ]);
}

function productMatchesSearch(product) {
  const details = product.details || {};
  return matchesSearch([
    product.id,
    product.name,
    product.category,
    product.size,
    product.badge,
    product.description,
    product.featured ? "featured homepage" : "",
    product.stock,
    product.stockStatus,
    product.tags,
    product.adminNote,
    details.ingredients,
    details.shelfLife,
    details.storage,
    details.origin,
    details.flavorNotes,
    details.allergen
  ]);
}

function notificationMatchesSearch(notification) {
  return matchesSearch([
    notification.id,
    notification.orderId,
    notification.eventType,
    notification.audience,
    notification.channel,
    notification.status,
    notification.recipient,
    notification.subject,
    notification.message,
    notification.error
  ]);
}

function isClosedOrder(order) {
  return ["delivered", "cancelled"].includes(order?.status || "");
}

function renderStats() {
  const summary = state.summary || {
    totalOrders: state.orders.length,
    activeOrders: state.orders.filter((order) => !isClosedOrder(order)).length,
    bookingValue: state.orders.reduce((sum, order) => sum + Number(order.totals?.total || 0), 0),
    customers: state.customers.length,
    wholesaleEnquiries: state.enquiries.length,
    openSupportRequests: state.supportRequests.filter((item) => !["resolved", "closed"].includes(item.status)).length,
    products: state.products.length,
    activeProducts: state.products.filter((item) => item.active !== false).length,
    featuredProducts: state.products.filter((item) => item.featured === true).length,
    missingImageProducts: state.products.filter((item) => !item.image).length,
    lowStockProducts: state.products.filter((item) => ["low-stock", "out-of-stock"].includes(item.stockStatus)).length,
    coupons: state.coupons.length,
    activeCoupons: state.coupons.filter((item) => item.active !== false).length,
    pendingNotifications: state.notifications.filter((item) => ["queued", "ready", "failed"].includes(item.status)).length
  };

  statsBox.innerHTML = `
    <article><strong>${summary.totalOrders}</strong><span>Total bookings</span></article>
    <article><strong>${summary.activeOrders}</strong><span>Active orders</span></article>
    <article><strong>${money(summary.bookingValue)}</strong><span>Booking value</span></article>
    <article><strong>${summary.customers}</strong><span>Customers</span></article>
    <article><strong>${summary.wholesaleEnquiries}</strong><span>Wholesale leads</span></article>
    <article><strong>${summary.products || 0}</strong><span>Products</span></article>
    <article><strong>${summary.activeProducts || 0}</strong><span>Live products</span></article>
    <article><strong>${summary.featuredProducts || 0}</strong><span>Featured</span></article>
    <article><strong>${summary.missingImageProducts || 0}</strong><span>Missing photos</span></article>
    <article><strong>${summary.lowStockProducts || 0}</strong><span>Low stock</span></article>
    <article><strong>${summary.activeCoupons || 0}</strong><span>Active offers</span></article>
    <article><strong>${summary.openSupportRequests || 0}</strong><span>Open support</span></article>
    <article><strong>${summary.pendingNotifications || 0}</strong><span>Open alerts</span></article>
  `;
}

function renderPipeline() {
  if (!pipelineBox) return;

  const counts = ORDER_FLOW.reduce((acc, status) => {
    acc[status] = state.orders.filter((order) => order.status === status).length;
    return acc;
  }, {});

  pipelineBox.innerHTML = ORDER_FLOW.map(
    (status) => `
      <button class="${state.orderFilter === status ? "is-active" : ""}" type="button" data-pipeline-status="${status}">
        <strong>${counts[status] || 0}</strong>
        <span>${escapeHtml(STATUS_LABELS[status])}</span>
      </button>
    `
  ).join("");

  pipelineBox.querySelectorAll("[data-pipeline-status]").forEach((button) => {
    button.addEventListener("click", () => {
      state.orderFilter = state.orderFilter === button.dataset.pipelineStatus ? "all" : button.dataset.pipelineStatus;
      if (orderFilterInput) orderFilterInput.value = state.orderFilter;
      renderPipeline();
      renderOrders();
    });
  });
}

function renderStorage() {
  if (!storageBox) return;
  const storage = state.storage || {};
  const notifications = storage.notifications || state.notificationConfig || {};
  const durable = storage.durable ? "Database storage active" : "JSON fallback active";
  const helper = storage.durable
    ? "Orders, customers, and leads are connected to PostgreSQL."
    : "Add DATABASE_URL on Render to switch this project to permanent PostgreSQL storage.";
  const notificationStatus = [
    notifications.smtpConfigured ? "SMTP email ready" : "SMTP email not connected",
    notifications.adminWhatsAppConfigured ? "Admin WhatsApp ready" : "Admin WhatsApp not added",
    notifications.webhookConfigured ? "Webhook ready" : "Webhook not connected"
  ].join(" | ");

  storageBox.innerHTML = `
    <article>
      <strong>${escapeHtml(durable)}</strong>
      <span>${escapeHtml(helper)}</span>
    </article>
    <article>
      <strong>${escapeHtml(storage.driver || "json")}</strong>
      <span>Current storage driver</span>
    </article>
    <article>
      <strong>${storage.databaseConfigured ? "Ready" : "Not connected"}</strong>
      <span>Database URL</span>
    </article>
    <article>
      <strong>Notifications</strong>
      <span>${escapeHtml(notificationStatus)}</span>
    </article>
  `;
}

function notificationChannelLabel(notification) {
  const channel = notification.channel === "email" ? "Email" : notification.channel === "webhook" ? "Webhook" : "WhatsApp";
  return `${channel} to ${notification.audience}`;
}

function notificationActionLabel(notification) {
  if (!notification.url) return "";
  if (notification.channel === "email") return "Open email";
  if (notification.channel === "whatsapp") return "Open WhatsApp";
  return "Open link";
}

function notificationStatusTone(notification) {
  return String(notification.status || "ready").toLowerCase().replace(/[^a-z-]/g, "-");
}

function renderNotifications() {
  if (!notificationList) return;
  const visibleNotifications = state.notifications.filter(notificationMatchesSearch).slice(0, 40);

  notificationList.innerHTML = visibleNotifications.length
    ? visibleNotifications.map(renderNotification).join("")
    : `<div class="admin-empty">No notification alerts yet.</div>`;

  notificationList.querySelectorAll("[data-copy-notification]").forEach((button) => {
    button.addEventListener("click", () => copyNotificationMessage(button.dataset.copyNotification));
  });
  notificationList.querySelectorAll("[data-mark-notification]").forEach((button) => {
    button.addEventListener("click", () => updateNotificationStatus(button.dataset.markNotification, button.dataset.status));
  });
  notificationList.querySelectorAll("[data-retry-notification]").forEach((button) => {
    button.addEventListener("click", () => retryNotification(button.dataset.retryNotification));
  });
}

function renderNotification(notification) {
  const order = state.orders.find((item) => item.id === notification.orderId);
  const actionLabel = notificationActionLabel(notification);
  const orderLabel = order ? `${order.customer?.name || "Customer"} | ${money(order.totals?.total)}` : "Order details saved in alert";
  const status = notification.status || "ready";
  const channel = notification.channel || "whatsapp";

  return `
    <article class="admin-notification-card" data-status="${escapeHtml(notificationStatusTone(notification))}" data-channel="${escapeHtml(channel)}">
      <header>
        <div>
          <h3>${escapeHtml(notification.subject || notification.id)}</h3>
          <p>${escapeHtml(notificationChannelLabel(notification))} | ${formatDate(notification.createdAt)}</p>
        </div>
        <span class="status-pill">${escapeHtml(status)}</span>
      </header>
      <div class="admin-notification-topline">
        <span><strong>${escapeHtml(channel)}</strong><small>Alert channel</small></span>
        <span><strong>${escapeHtml(notification.audience || "customer")}</strong><small>Audience</small></span>
        <span><strong>${escapeHtml(notification.eventType || "order alert")}</strong><small>Event type</small></span>
      </div>
      <div class="admin-notification-meta">
        <span><strong>Order</strong>${escapeHtml(notification.orderId || "No order")}<small>${escapeHtml(orderLabel)}</small></span>
        <span><strong>Recipient</strong>${escapeHtml(notification.recipient || "Not configured")}<small>${escapeHtml(notification.eventType || "order alert")}</small></span>
        <span><strong>Updated</strong>${formatDate(notification.updatedAt)}<small>${escapeHtml(notification.error || notification.sentAt || "Ready for action")}</small></span>
      </div>
      <p class="admin-notification-message">${escapeHtml(notification.message || "No message body")}</p>
      <div class="admin-notification-actions">
        <button type="button" data-copy-notification="${escapeHtml(notification.id)}">Copy message</button>
        ${notification.url ? `<a href="${escapeHtml(notification.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(actionLabel)}</a>` : ""}
        ${["email", "webhook"].includes(notification.channel) ? `<button type="button" data-retry-notification="${escapeHtml(notification.id)}">Retry send</button>` : ""}
        <button type="button" data-mark-notification="${escapeHtml(notification.id)}" data-status="sent">Mark sent</button>
        <button type="button" data-mark-notification="${escapeHtml(notification.id)}" data-status="archived">Archive</button>
      </div>
    </article>
  `;
}

function getAdminOrderAction(order) {
  const actions = {
    booked: ["Confirm stock", "Check product packs, customer phone, and serviceable location."],
    confirmed: ["Start packing", "Prepare products, verify labels, and move order to packed."],
    packed: ["Dispatch order", "Add courier name, tracking code, dispatch date, and ETA."],
    dispatched: ["Monitor delivery", "Keep courier link updated until the customer receives the order."],
    delivered: ["Retain customer", "Close the order and keep details ready for repeat purchase."],
    cancelled: ["Order closed", "Review refund or replacement notes before archiving."]
  };
  return actions[order.status] || actions.booked;
}

function renderAdminOrderProgress(order) {
  if (order.status === "cancelled") {
    return `
      <div class="admin-order-progress is-cancelled" aria-label="Order progress">
        <span class="is-done is-active"><b>!</b><strong>Cancelled</strong><small>Order closed</small></span>
      </div>
    `;
  }

  const currentIndex = Math.max(0, ACTIVE_ORDER_FLOW.indexOf(order.status));
  return `
    <div class="admin-order-progress" aria-label="Order progress">
      ${ACTIVE_ORDER_FLOW.map((status, index) => {
        const className = [index <= currentIndex ? "is-done" : "", order.status === status ? "is-active" : ""]
          .filter(Boolean)
          .join(" ");
        return `<span class="${className}"><b>${index + 1}</b><strong>${escapeHtml(STATUS_LABELS[status])}</strong><small>${index <= currentIndex ? "Done" : "Pending"}</small></span>`;
      }).join("")}
    </div>
  `;
}

function renderAdminOrderItems(order) {
  const items = order.items || [];
  if (!items.length) return `<p class="admin-items">No item details</p>`;

  return `
    <div class="admin-order-items" aria-label="Order item list">
      ${items
        .map((item) => {
          const itemTotal = item.lineTotal || (item.price || 0) * (item.quantity || 0);
          const pricing = getProductPricing(item);
          const priceNote = pricing.discountPrice
            ? `Offer ${money(pricing.offerPrice)} / MRP ${money(pricing.mrp)} / ${pricing.discountPercent}% off`
            : `Offer ${money(pricing.offerPrice)}`;
          return `
            <div class="admin-order-item">
              <span>
                <strong>${escapeHtml(item.name || "Product")}</strong>
                <small>${escapeHtml(item.size || "Pack size pending")} x ${item.quantity || 0} | ${escapeHtml(priceNote)}</small>
              </span>
              <b>${money(itemTotal)}</b>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderOrders() {
  const visibleOrders = state.orders.filter(orderMatchesSearch).filter((order) => {
    return state.orderFilter === "all" || order.status === state.orderFilter;
  });

  orderList.innerHTML = visibleOrders.length
    ? visibleOrders.map(renderOrder).join("")
    : `<div class="admin-empty">No orders found.</div>`;

  orderList.querySelectorAll("[data-status-form]").forEach((form) => {
    form.addEventListener("submit", updateOrderStatus);
  });
  orderList.querySelectorAll("[data-quick-status]").forEach((button) => {
    button.addEventListener("click", updateOrderQuickStatus);
  });
  orderList.querySelectorAll("[data-print-pack]").forEach((button) => {
    button.addEventListener("click", () => printPackingSlip(button.dataset.printPack));
  });
  orderList.querySelectorAll("[data-copy-track]").forEach((button) => {
    button.addEventListener("click", () => copyTrackingLink(button.dataset.copyTrack));
  });
  orderList.querySelectorAll("[data-copy-update]").forEach((button) => {
    button.addEventListener("click", () => copyCustomerStatusUpdate(button.dataset.copyUpdate));
  });
}

function renderOrder(order) {
  const history = order.statusHistory || [];
  const latestHistory = history[history.length - 1];
  const trackingUrl = getOrderTrackingPath(order);
  const absoluteTrackingUrl = getOrderTrackingUrl(order);
  const whatsappUpdateUrl = getWhatsAppUpdateUrl(order);
  const [nextAction, nextActionNote] = getAdminOrderAction(order);
  const statusOptions = Object.entries(STATUS_LABELS)
    .map(([value, label]) => `<option value="${value}" ${order.status === value ? "selected" : ""}>${label}</option>`)
    .join("");
  const paymentOptions = PAYMENT_STATES.map(
    (label) => `<option value="${label}" ${order.paymentState === label ? "selected" : ""}>${label}</option>`
  ).join("");

  return `
    <article class="admin-order-card" data-status="${escapeHtml(order.status || "booked")}">
      <header>
        <div>
          <h3>${escapeHtml(order.id)}</h3>
          <p>${formatDate(order.placedAt)} | ${escapeHtml(order.source || "Website booking")}</p>
        </div>
        <span class="status-pill">${escapeHtml(STATUS_LABELS[order.status] || order.status)}</span>
      </header>
      ${renderAdminOrderProgress(order)}
      <div class="admin-order-grid">
        <span><strong>Customer</strong>${escapeHtml(order.customer?.name || "No name")}<small>${escapeHtml(order.customer?.phone || "")}</small></span>
        <span><strong>Location</strong>${escapeHtml(order.countryCity || "Not added")}<small>${escapeHtml(order.postalCode || "")}</small></span>
        <span><strong>Total</strong>${money(order.totals?.total)}<small>${escapeHtml(order.payment || "Payment pending")}</small></span>
        <span><strong>Type</strong>${escapeHtml(order.orderType || "Retail order")}<small>${escapeHtml(order.customer?.email || "")}</small></span>
        <span><strong>Delivery</strong>${escapeHtml(order.courier || "Courier pending")}<small>${escapeHtml(order.trackingCode || order.eta || "Tracking pending")}</small></span>
        <span><strong>Dispatch</strong>${escapeHtml(order.dispatchDate || "Not dispatched")}<small>${escapeHtml(order.trackingUrl || "Courier link pending")}</small></span>
      </div>
      ${renderAdminOrderItems(order)}
      <p class="admin-address">${escapeHtml(order.address || "No address")}</p>
      <div class="admin-action-strip">
        <span><strong>${escapeHtml(nextAction)}</strong><small>${escapeHtml(nextActionNote)}</small></span>
        <span><strong>Latest timeline</strong><small>${latestHistory ? `${escapeHtml(STATUS_LABELS[latestHistory.status] || latestHistory.status)}: ${escapeHtml(latestHistory.note || "")}` : "No status history"}</small></span>
        <span><strong>Customer tracking</strong><small>${escapeHtml(absoluteTrackingUrl)}</small></span>
      </div>
      <div class="admin-quick-status" aria-label="Quick order status actions">
        ${ORDER_FLOW.map(
          (status) => `
            <button class="${order.status === status ? "is-active" : ""}" type="button" data-quick-status="${status}" data-order-id="${escapeHtml(order.id)}">
              ${escapeHtml(STATUS_LABELS[status])}
            </button>
          `
        ).join("")}
        <a href="${trackingUrl}" target="_blank" rel="noopener noreferrer">Customer view</a>
        ${order.trackingUrl ? `<a href="${escapeHtml(order.trackingUrl)}" target="_blank" rel="noopener noreferrer">Courier link</a>` : ""}
        <button type="button" data-copy-track="${escapeHtml(order.id)}">Copy track link</button>
        <button type="button" data-copy-update="${escapeHtml(order.id)}">Copy update</button>
        ${whatsappUpdateUrl ? `<a href="${escapeHtml(whatsappUpdateUrl)}" target="_blank" rel="noopener noreferrer">WhatsApp update</a>` : ""}
        <button type="button" data-print-pack="${escapeHtml(order.id)}">Packing slip</button>
      </div>
      <form class="admin-status-form" data-status-form="${escapeHtml(order.id)}">
        <select name="status" aria-label="Order status">${statusOptions}</select>
        <select name="paymentState" aria-label="Payment status">${paymentOptions}</select>
        <input name="courier" type="text" placeholder="Courier name" value="${escapeHtml(order.courier || "")}" />
        <input name="trackingCode" type="text" placeholder="Tracking code" value="${escapeHtml(order.trackingCode || "")}" />
        <input name="trackingUrl" type="url" placeholder="Courier tracking URL" value="${escapeHtml(order.trackingUrl || "")}" />
        <input name="dispatchDate" type="text" placeholder="Dispatch date" value="${escapeHtml(order.dispatchDate || "")}" />
        <input name="eta" type="text" placeholder="Expected delivery" value="${escapeHtml(order.eta || "")}" />
        <input name="adminNote" type="text" placeholder="Seller note visible to customer" value="${escapeHtml(order.adminNote || "")}" />
        <input name="note" type="text" placeholder="Timeline note" />
        <label class="admin-checkbox">
          <input name="notifyCustomer" type="checkbox" checked />
          <span>Notify customer</span>
        </label>
        <button type="submit">Update order</button>
      </form>
    </article>
  `;
}

function renderWholesale() {
  const visibleEnquiries = state.enquiries.filter(enquiryMatchesSearch).filter((enquiry) => {
    return state.leadFilter === "all" || enquiry.status === state.leadFilter;
  });

  wholesaleList.innerHTML = visibleEnquiries.length
    ? visibleEnquiries.map(renderEnquiry).join("")
    : `<div class="admin-empty">No wholesale enquiries yet.</div>`;

  wholesaleList.querySelectorAll("[data-wholesale-form]").forEach((form) => {
    form.addEventListener("submit", updateWholesaleStatus);
  });
}

function renderEnquiry(enquiry) {
  const statusOptions = Object.entries(WHOLESALE_LABELS)
    .map(([value, label]) => `<option value="${value}" ${enquiry.status === value ? "selected" : ""}>${label}</option>`)
    .join("");

  return `
    <article class="admin-order-card">
      <header>
        <div>
          <h3>${escapeHtml(enquiry.businessName || enquiry.id)}</h3>
          <p>${formatDate(enquiry.placedAt)} | ${escapeHtml(enquiry.country || "No location")}</p>
        </div>
        <span class="status-pill">${escapeHtml(WHOLESALE_LABELS[enquiry.status] || enquiry.status || "New")}</span>
      </header>
      <div class="admin-order-grid">
        <span><strong>Contact</strong>${escapeHtml(enquiry.contactName || "Not added")}<small>${escapeHtml(enquiry.phone || "")}</small></span>
        <span><strong>Email</strong>${escapeHtml(enquiry.email || "Not added")}<small>${escapeHtml(enquiry.country || "")}</small></span>
        <span><strong>Volume</strong>${escapeHtml(enquiry.volume || "Pending")}<small>${escapeHtml(enquiry.id || "")}</small></span>
        <span><strong>Buyer type</strong>${escapeHtml(enquiry.buyerType || "Not added")}<small>${escapeHtml(enquiry.targetMarket || "")}</small></span>
        <span><strong>Pack format</strong>${escapeHtml(enquiry.packFormat || "Not added")}<small>${escapeHtml(enquiry.destinationPort || "")}</small></span>
        <span><strong>Product range</strong>${escapeHtml(enquiry.productRange || "Not added")}<small>${escapeHtml(enquiry.packRequest || "")}</small></span>
        <span><strong>Documents</strong>${escapeHtml(enquiry.documentNeed || "Not added")}<small>${escapeHtml(enquiry.timeline || "")}</small></span>
        <span><strong>Quote basis</strong>${escapeHtml(enquiry.quoteBasis || "Not added")}<small>${escapeHtml(enquiry.labelRequirement || "")}</small></span>
        <span><strong>Updated</strong>${formatDate(enquiry.updatedAt || enquiry.placedAt)}<small>${escapeHtml(enquiry.note || "No admin note")}</small></span>
      </div>
      <p class="admin-items">${escapeHtml(enquiry.message || "No product interest added")}</p>
      <form class="admin-status-form" data-wholesale-form="${escapeHtml(enquiry.id)}">
        <select name="status" aria-label="Wholesale status">${statusOptions}</select>
        <input name="note" type="text" placeholder="Follow-up note" value="${escapeHtml(enquiry.note || "")}" />
        <button type="submit">Update lead</button>
      </form>
    </article>
  `;
}

function renderSupportRequests() {
  if (!supportList) return;
  const visibleRequests = state.supportRequests.filter(supportMatchesSearch);

  supportList.innerHTML = visibleRequests.length
    ? visibleRequests.map(renderSupportRequest).join("")
    : `<div class="admin-empty">No customer support requests yet.</div>`;

  supportList.querySelectorAll("[data-support-form]").forEach((form) => {
    form.addEventListener("submit", updateSupportRequest);
  });
}

function renderSupportRequest(request) {
  const statusOptions = SUPPORT_STATUSES.map(
    (status) => `<option value="${status}" ${request.status === status ? "selected" : ""}>${status}</option>`
  ).join("");
  const trackingUrl = request.orderId
    ? `./track.html?id=${encodeURIComponent(request.orderId)}&phone=${encodeURIComponent(request.phone || "")}`
    : "";

  return `
    <article class="admin-support-card" data-status="${escapeHtml(request.status || "new")}">
      <header>
        <div>
          <h3>${escapeHtml(request.id)}</h3>
          <p>${escapeHtml(request.topic || "Support request")} | ${formatDate(request.createdAt)}</p>
        </div>
        <span class="status-pill">${escapeHtml(request.status || "new")}</span>
      </header>
      <div class="admin-order-grid">
        <span><strong>Customer</strong>${escapeHtml(request.name || "Customer")}<small>${escapeHtml(request.phone || "")}</small></span>
        <span><strong>Order</strong>${escapeHtml(request.orderId || "General support")}<small>${trackingUrl ? "Tracking page ready" : "No order linked"}</small></span>
        <span><strong>Email</strong>${escapeHtml(request.email || "Not added")}<small>${escapeHtml(request.topic || "")}</small></span>
        <span><strong>Updated</strong>${formatDate(request.updatedAt)}<small>${escapeHtml(request.resolutionNote || request.internalNote || "No note yet")}</small></span>
      </div>
      <p class="admin-items">${escapeHtml(request.message || "No support message")}</p>
      ${request.resolutionNote ? `<p class="admin-history">${escapeHtml(request.resolutionNote)}</p>` : ""}
      <div class="admin-quick-status">
        ${trackingUrl ? `<a href="${trackingUrl}" target="_blank" rel="noopener noreferrer">Customer view</a>` : ""}
        <a href="https://wa.me/${encodeURIComponent(request.phone || "")}?text=${encodeURIComponent(`Support request ${request.id}`)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
      </div>
      <form class="admin-status-form" data-support-form="${escapeHtml(request.id)}">
        <select name="status" aria-label="Support status">${statusOptions}</select>
        <input name="resolutionNote" type="text" placeholder="Customer-visible resolution note" value="${escapeHtml(request.resolutionNote || "")}" />
        <input name="internalNote" type="text" placeholder="Internal note" value="${escapeHtml(request.internalNote || "")}" />
        <button type="submit">Update support</button>
      </form>
    </article>
  `;
}

function productCategoryOptions(value = "masala") {
  return ["makhana", "masala", "poha", "combo"].map(
    (category) => `<option value="${category}" ${value === category ? "selected" : ""}>${category}</option>`
  ).join("");
}

function productStockOptions(value = "in-stock") {
  return ["in-stock", "low-stock", "out-of-stock", "preorder"].map(
    (status) => `<option value="${status}" ${value === status ? "selected" : ""}>${status}</option>`
  ).join("");
}

function renderProductImageControls(product = {}) {
  const image = product.image || "";
  const pathValue = isUploadedImage(image) ? "" : image;
  return `
    <div class="admin-image-manager">
      <div class="admin-upload-preview" data-image-upload-preview>
        ${productImagePreviewMarkup(image, product.name || "Product")}
      </div>
      <div class="admin-image-fields">
        <input name="image" type="hidden" value="${escapeHtml(image)}" />
        <label class="admin-field-wide">
          <span>Image URL or asset path</span>
          <input name="imagePath" type="text" placeholder="/assets/product-image.jpg or https://..." value="${escapeHtml(pathValue)}" />
        </label>
        <label class="admin-file-upload">
          <span>Upload real packet photo</span>
          <input name="imageFile" type="file" accept="image/png,image/jpeg,image/webp" data-product-image-input />
          <small>Images are compressed for web and saved with this product.</small>
        </label>
      </div>
    </div>
  `;
}

function renderProductDetailsEditor(details = {}, open = false) {
  return `
    <details class="admin-product-details-editor" ${open ? "open" : ""}>
      <summary>Label, ingredient, and trust details</summary>
      <div class="admin-detail-grid">
        <label>
          <span>Ingredients</span>
          <textarea name="detailsIngredients" rows="4" placeholder="One ingredient per line">${escapeHtml(listToLines(details.ingredients))}</textarea>
        </label>
        <label>
          <span>Nutrition display</span>
          <textarea name="detailsNutrition" rows="4" placeholder="Serving, energy, protein...">${escapeHtml(listToLines(details.nutrition))}</textarea>
        </label>
        <label>
          <span>Usage ideas</span>
          <textarea name="detailsUsage" rows="3" placeholder="Tea-time snack, curry, gifting...">${escapeHtml(listToLines(details.usage))}</textarea>
        </label>
        <label>
          <span>Trust highlights</span>
          <textarea name="detailsTrust" rows="3" placeholder="No artificial color direction, batch-ready...">${escapeHtml(listToLines(details.trust))}</textarea>
        </label>
        <label>
          <span>Shelf life</span>
          <input name="detailsShelfLife" type="text" placeholder="Best before 9 months from packing" value="${escapeHtml(details.shelfLife || "")}" />
        </label>
        <label>
          <span>Storage</span>
          <input name="detailsStorage" type="text" placeholder="Store sealed in a cool, dry place" value="${escapeHtml(details.storage || "")}" />
        </label>
        <label>
          <span>Origin note</span>
          <input name="detailsOrigin" type="text" placeholder="Sourced and packed in India" value="${escapeHtml(details.origin || "")}" />
        </label>
        <label>
          <span>Flavor notes</span>
          <input name="detailsFlavorNotes" type="text" placeholder="Aromatic, warm, balanced..." value="${escapeHtml(details.flavorNotes || "")}" />
        </label>
        <label>
          <span>Allergen note</span>
          <input name="detailsAllergen" type="text" placeholder="Packed in a facility that may handle nuts..." value="${escapeHtml(details.allergen || "")}" />
        </label>
        <label>
          <span>Claim disclaimer</span>
          <textarea name="detailsDisclaimer" rows="3" placeholder="Replace display values with verified label details before commercial launch.">${escapeHtml(details.disclaimer || "")}</textarea>
        </label>
      </div>
    </details>
  `;
}

function couponTypeOptions(selected = "percent") {
  const options = [
    ["percent", "Percent discount"],
    ["fixed", "Fixed amount off"],
    ["free-delivery", "Free delivery"]
  ];
  return options
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function couponTypeLabel(type) {
  if (type === "fixed") return "Fixed amount";
  if (type === "free-delivery") return "Free delivery";
  return "Percent discount";
}

function couponSavingsLabel(coupon = {}) {
  if (coupon.type === "free-delivery") return "Free delivery";
  if (coupon.type === "fixed") return `${money(Number(coupon.value || 0))} off`;
  return `${Number(coupon.value || 0)}% off`;
}

function couponMatchesSearch(coupon = {}) {
  const query = state.search.trim().toLowerCase();
  if (!query) return true;
  return [coupon.code, coupon.label, coupon.type, coupon.adminNote].some((value) => String(value || "").toLowerCase().includes(query));
}

function renderCouponManagerBoard(coupons = [], visibleCount = coupons.length) {
  const activeCoupons = coupons.filter((coupon) => coupon.active !== false);
  const shownCoupons = coupons.filter((coupon) => coupon.autoShow === true && coupon.active !== false);
  const limitedCoupons = coupons.filter((coupon) => Number(coupon.usageLimit || 0) > 0);
  const totalUsage = coupons.reduce((sum, coupon) => sum + Number(coupon.usedCount || 0), 0);
  return `
    <div class="admin-product-board" aria-label="Coupon summary">
      <article><strong>${coupons.length}</strong><span>Total offers</span></article>
      <article><strong>${activeCoupons.length}</strong><span>Active offers</span></article>
      <article><strong>${shownCoupons.length}</strong><span>Shown in cart</span></article>
      <article><strong>${limitedCoupons.length}</strong><span>Usage limited</span></article>
      <article><strong>${totalUsage}</strong><span>Total uses</span></article>
      <article><strong>${visibleCount}</strong><span>Showing after search</span></article>
    </div>
  `;
}

function renderCouponsAdmin() {
  if (!couponList) return;
  const visibleCoupons = state.coupons.filter(couponMatchesSearch);

  couponList.innerHTML = `
    ${renderCouponManagerBoard(state.coupons, visibleCoupons.length)}
    <article class="admin-product-card admin-new-product">
      <header>
        <div>
          <h3>Add new offer</h3>
          <p>Create a checkout coupon for launch offers, festive campaigns, or free-delivery campaigns.</p>
        </div>
      </header>
      <form class="admin-product-form" data-new-coupon-form>
        <input name="code" type="text" placeholder="Coupon code, e.g. SPICE10" required />
        <input name="label" type="text" placeholder="Offer label" required />
        <select name="type" aria-label="Coupon type">${couponTypeOptions()}</select>
        <input name="value" type="number" min="0" step="1" placeholder="Value: 10 or 100" value="10" />
        <input name="minSubtotal" type="number" min="0" step="1" placeholder="Minimum cart value" value="0" />
        <input name="maxDiscount" type="number" min="0" step="1" placeholder="Max discount cap" value="250" />
        <input name="usageLimit" type="number" min="0" step="1" placeholder="Usage limit, 0 = no limit" value="0" />
        <input name="startsAt" type="text" placeholder="Start date/time optional" />
        <input name="endsAt" type="text" placeholder="End date/time optional" />
        <input name="adminNote" type="text" placeholder="Internal note" />
        <label class="admin-checkbox">
          <input name="autoShow" type="checkbox" checked />
          <span>Show this offer inside cart</span>
        </label>
        <label class="admin-checkbox">
          <input name="active" type="checkbox" checked />
          <span>Active at checkout</span>
        </label>
        <button type="submit">Add offer</button>
      </form>
    </article>
    ${
      visibleCoupons.length
        ? visibleCoupons.map(renderCouponAdminCard).join("")
        : `<div class="admin-empty">No offers matched the current search.</div>`
    }
  `;

  couponList.querySelector("[data-new-coupon-form]")?.addEventListener("submit", createAdminCoupon);
  couponList.querySelectorAll("[data-coupon-form]").forEach((form) => {
    form.addEventListener("submit", updateAdminCoupon);
  });
}

function renderCouponAdminCard(coupon = {}) {
  const status = coupon.active === false ? "inactive" : "in-stock";
  const usageLimit = Number(coupon.usageLimit || 0);
  const usedCount = Number(coupon.usedCount || 0);
  return `
    <article class="admin-product-card" data-status="${status}">
      <header>
        <div>
          <h3>${escapeHtml(coupon.code || "Offer")}</h3>
          <p>${escapeHtml(coupon.label || "")} | ${escapeHtml(couponTypeLabel(coupon.type))} | ${escapeHtml(couponSavingsLabel(coupon))}</p>
        </div>
        <div class="admin-product-status-stack">
          <span class="status-pill">${coupon.active === false ? "inactive" : "active"}</span>
          ${coupon.autoShow ? `<span class="status-pill featured">Cart visible</span>` : ""}
        </div>
      </header>
      <div class="admin-product-kpi-grid">
        <span><strong>Savings</strong>${escapeHtml(couponSavingsLabel(coupon))}</span>
        <span><strong>Minimum</strong>${money(Number(coupon.minSubtotal || 0))}</span>
        <span><strong>Cap</strong>${Number(coupon.maxDiscount || 0) ? money(Number(coupon.maxDiscount || 0)) : "No cap"}</span>
        <span><strong>Usage</strong>${usedCount}${usageLimit ? ` / ${usageLimit}` : " used"}</span>
      </div>
      <form class="admin-product-form" data-coupon-form="${escapeHtml(coupon.code || "")}">
        <input name="code" type="text" value="${escapeHtml(coupon.code || "")}" readonly />
        <input name="label" type="text" placeholder="Offer label" value="${escapeHtml(coupon.label || "")}" required />
        <select name="type" aria-label="Coupon type">${couponTypeOptions(coupon.type)}</select>
        <input name="value" type="number" min="0" step="1" placeholder="Value" value="${Number(coupon.value || 0)}" />
        <input name="minSubtotal" type="number" min="0" step="1" placeholder="Minimum cart value" value="${Number(coupon.minSubtotal || 0)}" />
        <input name="maxDiscount" type="number" min="0" step="1" placeholder="Max discount cap" value="${Number(coupon.maxDiscount || 0)}" />
        <input name="usageLimit" type="number" min="0" step="1" placeholder="Usage limit" value="${usageLimit}" />
        <input name="usedCount" type="number" min="0" step="1" placeholder="Used count" value="${usedCount}" />
        <input name="startsAt" type="text" placeholder="Start date/time optional" value="${escapeHtml(coupon.startsAt || "")}" />
        <input name="endsAt" type="text" placeholder="End date/time optional" value="${escapeHtml(coupon.endsAt || "")}" />
        <input name="adminNote" type="text" placeholder="Internal note" value="${escapeHtml(coupon.adminNote || "")}" />
        <label class="admin-checkbox">
          <input name="autoShow" type="checkbox" ${coupon.autoShow ? "checked" : ""} />
          <span>Show this offer inside cart</span>
        </label>
        <label class="admin-checkbox">
          <input name="active" type="checkbox" ${coupon.active === false ? "" : "checked"} />
          <span>Active at checkout</span>
        </label>
        <button type="submit">Update offer</button>
      </form>
      <small>Updated ${escapeHtml(formatDate(coupon.updatedAt))}</small>
    </article>
  `;
}

function renderProductsAdmin() {
  if (!productList) return;
  const visibleProducts = state.products.filter(productMatchesSearch);

  productList.innerHTML = `
    ${renderProductManagerBoard(state.products, visibleProducts.length)}
    <article class="admin-product-card admin-new-product">
      <header>
        <div>
          <h3>Add new product</h3>
          <p>Create a live product with pricing, stock, packet image, and trust details.</p>
        </div>
      </header>
      <form class="admin-product-form" data-new-product-form>
        <input name="name" type="text" placeholder="Product name" required />
        <select name="category" aria-label="Product category">${productCategoryOptions()}</select>
        <input name="mrp" type="number" min="0" step="1" placeholder="MRP" />
        <input name="price" type="number" min="0" step="1" placeholder="Offer price" required />
        <input name="discountPrice" type="number" min="0" step="1" placeholder="Discount savings" />
        <input name="size" type="text" placeholder="Pack size" required />
        <input name="badge" type="text" placeholder="Badge" value="Pure" />
        <input name="stock" type="number" min="0" step="1" placeholder="Stock" value="100" />
        <input name="lowStockThreshold" type="number" min="0" step="1" placeholder="Low stock limit" value="10" />
        <select name="stockStatus" aria-label="Stock status">${productStockOptions()}</select>
        ${renderProductImageControls()}
        <input name="tags" type="text" placeholder="Tags: bestseller, export-ready" />
        <textarea name="description" rows="2" placeholder="Short product description"></textarea>
        ${renderProductDetailsEditor({}, true)}
        <label class="admin-checkbox">
          <input name="featured" type="checkbox" checked />
          <span>Feature on homepage category preview</span>
        </label>
        <label class="admin-checkbox">
          <input name="active" type="checkbox" checked />
          <span>Active on storefront</span>
        </label>
        <button type="submit">Add product</button>
      </form>
    </article>
    ${
      visibleProducts.length
        ? visibleProducts.map(renderProductAdminCard).join("")
        : `<div class="admin-empty">No products matched the current search.</div>`
    }
  `;

  productList.querySelector("[data-new-product-form]")?.addEventListener("submit", createAdminProduct);
  productList.querySelectorAll("[data-product-form]").forEach((form) => {
    form.addEventListener("submit", updateAdminProduct);
  });
  productList.querySelectorAll("[data-product-image-input]").forEach((input) => {
    input.addEventListener("change", handleProductImageUpload);
  });
}

function renderProductAdminCard(product) {
  const tags = Array.isArray(product.tags) ? product.tags.join(", ") : "";
  const details = product.details || {};
  const ingredientCount = Array.isArray(details.ingredients) ? details.ingredients.length : 0;
  const pricing = getProductPricing(product);
  const productStatus = product.active === false ? "inactive" : product.stockStatus || "in-stock";
  return `
    <article class="admin-product-card" data-status="${escapeHtml(productStatus)}">
      <header>
        <div>
          <h3>${escapeHtml(product.name || product.id)}</h3>
          <p>${escapeHtml(product.id)} | ${escapeHtml(product.category || "product")} | ${escapeHtml(pricingSummary(product))}</p>
        </div>
        <div class="admin-product-status-stack">
          <span class="status-pill">${product.active === false ? "inactive" : escapeHtml(product.stockStatus || "in-stock")}</span>
          ${product.featured ? `<span class="status-pill featured">Homepage</span>` : ""}
        </div>
      </header>
      <div class="admin-product-kpi-grid">
        <span><strong>MRP</strong>${money(pricing.mrp)}</span>
        <span><strong>Offer</strong>${money(pricing.offerPrice)}</span>
        <span><strong>Discount</strong>${pricing.discountPercent ? `${pricing.discountPercent}% / ${money(pricing.discountPrice)}` : "No offer"}</span>
        <span><strong>Homepage</strong>${product.featured ? "Featured" : "Not featured"}</span>
      </div>
      <div class="admin-product-preview">
        ${productImagePreviewMarkup(product.image, product.name)}
        <div>
          <strong>${escapeHtml(product.badge || "Pure")}</strong>
          <span>${escapeHtml(product.size || "")} / Stock ${Number(product.stock || 0)}</span>
          <small>${escapeHtml(product.description || "No description")}</small>
          <div class="admin-product-proof-line">
            <span>${ingredientCount ? `${ingredientCount} ingredients` : "Ingredients needed"}</span>
            <span>${escapeHtml(details.shelfLife || "Shelf life needed")}</span>
            <span>${escapeHtml(details.allergen || "Allergen note needed")}</span>
          </div>
        </div>
      </div>
      ${renderProductReadiness(product)}
      <form class="admin-product-form" data-product-form="${escapeHtml(product.id)}">
        <input name="name" type="text" placeholder="Product name" value="${escapeHtml(product.name || "")}" required />
        <select name="category" aria-label="Product category">${productCategoryOptions(product.category)}</select>
        <input name="mrp" type="number" min="0" step="1" placeholder="MRP" value="${pricing.mrp}" />
        <input name="price" type="number" min="0" step="1" placeholder="Offer price" value="${pricing.offerPrice}" />
        <input name="discountPrice" type="number" min="0" step="1" placeholder="Discount savings" value="${pricing.discountPrice}" />
        <input name="size" type="text" placeholder="Pack size" value="${escapeHtml(product.size || "")}" />
        <input name="badge" type="text" placeholder="Badge" value="${escapeHtml(product.badge || "")}" />
        <input name="stock" type="number" min="0" step="1" placeholder="Stock" value="${Number(product.stock || 0)}" />
        <input name="lowStockThreshold" type="number" min="0" step="1" placeholder="Low stock limit" value="${Number(product.lowStockThreshold || 10)}" />
        <select name="stockStatus" aria-label="Stock status">${productStockOptions(product.stockStatus)}</select>
        ${renderProductImageControls(product)}
        <input name="tags" type="text" placeholder="Tags" value="${escapeHtml(tags)}" />
        <input name="adminNote" type="text" placeholder="Admin note" value="${escapeHtml(product.adminNote || "")}" />
        <textarea name="description" rows="2" placeholder="Short product description">${escapeHtml(product.description || "")}</textarea>
        ${renderProductDetailsEditor(details)}
        <label class="admin-checkbox">
          <input name="featured" type="checkbox" ${product.featured ? "checked" : ""} />
          <span>Feature on homepage category preview</span>
        </label>
        <label class="admin-checkbox">
          <input name="active" type="checkbox" ${product.active === false ? "" : "checked"} />
          <span>Active on storefront</span>
        </label>
        <button type="submit">Update product</button>
      </form>
    </article>
  `;
}

function renderCustomers() {
  if (!customerList) return;
  const visibleCustomers = state.customers.filter(customerMatchesSearch);

  customerList.innerHTML = visibleCustomers.length
    ? visibleCustomers.map(renderCustomer).join("")
    : `<div class="admin-empty">No customer records yet.</div>`;

  customerList.querySelectorAll("[data-customer-form]").forEach((form) => {
    form.addEventListener("submit", updateCustomerStatus);
  });
}

function renderCustomer(customer) {
  const statusOptions = CUSTOMER_STATUSES.map(
    (status) => `<option value="${status}" ${customer.status === status ? "selected" : ""}>${status}</option>`
  ).join("");
  const tags = Array.isArray(customer.tags) ? customer.tags.join(", ") : "";
  const customerKey = customer.phone || customer.id;
  const accountAccess = customer.hasAccountPin ? "PIN protected" : "Phone profile";

  return `
    <article class="admin-customer-card">
      <header>
        <div>
          <h3>${escapeHtml(customer.name || "Unnamed customer")}</h3>
          <p>${escapeHtml(customer.phone || "No phone")} ${customer.email ? `| ${escapeHtml(customer.email)}` : ""}</p>
        </div>
        <span class="status-pill">${escapeHtml(customer.status || "active")}</span>
      </header>
      <div class="admin-order-grid">
        <span><strong>Location</strong>${escapeHtml(customer.location || "Not added")}<small>Customer profile</small></span>
        <span><strong>Total spend</strong>${money(customer.totalSpend)}<small>Website bookings</small></span>
        <span><strong>Last order</strong>${formatDate(customer.lastOrderAt)}<small>${escapeHtml(customer.updatedAt ? `Updated ${formatDate(customer.updatedAt)}` : "")}</small></span>
        <span><strong>Orders</strong>${Number(customer.orderCount || 0)}<small>${escapeHtml(tags || "No tags")}</small></span>
        <span><strong>Access</strong>${escapeHtml(accountAccess)}<small>Customer account</small></span>
        <span><strong>Support</strong>${Number(customer.openSupportCount || 0)} open<small>${Number(customer.supportCount || 0)} total requests</small></span>
      </div>
      <form class="admin-status-form" data-customer-form="${escapeHtml(customerKey)}">
        <select name="status" aria-label="Customer status">${statusOptions}</select>
        <input name="tags" type="text" placeholder="Tags: wholesale, repeat" value="${escapeHtml(tags)}" />
        <input name="adminNote" type="text" placeholder="Internal customer note" value="${escapeHtml(customer.adminNote || "")}" />
        <button type="submit">Update customer</button>
      </form>
    </article>
  `;
}

function renderAll() {
  renderStats();
  renderPipeline();
  renderStorage();
  renderNotifications();
  renderOrders();
  renderProductsAdmin();
  renderCouponsAdmin();
  renderWholesale();
  renderSupportRequests();
  renderCustomers();
}

async function loadDashboard() {
  if (!state.token) {
    setAdminAuthenticated(false);
    setStatus("Login with the admin password to manage orders.");
    updateAdminNavState();
    return;
  }

  try {
    setStatus("Loading admin data...");
    const [
      ordersPayload,
      wholesalePayload,
      summaryPayload,
      customersPayload,
      storagePayload,
      notificationsPayload,
      supportPayload,
      productsPayload,
      couponsPayload
    ] = await Promise.all([
      api("/api/admin/orders"),
      api("/api/admin/wholesale"),
      api("/api/admin/summary").catch(() => ({ summary: null })),
      api("/api/admin/customers").catch(() => ({ customers: [] })),
      api("/api/admin/storage").catch(() => ({ storage: null })),
      api("/api/admin/notifications").catch(() => ({ notifications: [], config: null })),
      api("/api/admin/support").catch(() => ({ supportRequests: [] })),
      api("/api/admin/products").catch(() => ({ products: [] })),
      api("/api/admin/coupons").catch(() => ({ coupons: [] }))
    ]);
    state.orders = ordersPayload.orders || [];
    state.enquiries = wholesalePayload.enquiries || [];
    state.summary = summaryPayload.summary || null;
    state.customers = customersPayload.customers || [];
    state.storage = storagePayload.storage || null;
    state.notifications = notificationsPayload.notifications || [];
    state.supportRequests = supportPayload.supportRequests || [];
    state.products = productsPayload.products || [];
    state.coupons = couponsPayload.coupons || [];
    state.notificationConfig = notificationsPayload.config || null;
    setAdminAuthenticated(true);
    setStatus("Admin backend connected.", "success");
    renderAll();
    showAdminSection(getActiveAdminSection(), Boolean(window.location.hash));
  } catch (error) {
    setAdminAuthenticated(false);
    setStatus(error.message, "error");
  }
}

function findNotification(id) {
  return state.notifications.find((item) => item.id === id);
}

async function copyText(value) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(value);
    return;
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
}

async function copyNotificationMessage(id) {
  const notification = findNotification(id);
  if (!notification) return;
  await copyText(notification.message || "");
  showToast("Notification message copied");
}

async function copyTrackingLink(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) {
    showToast("Order not found");
    return;
  }
  await copyText(getOrderTrackingUrl(order));
  showToast("Customer tracking link copied");
}

async function copyCustomerStatusUpdate(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) {
    showToast("Order not found");
    return;
  }
  await copyText(buildCustomerStatusMessage(order));
  showToast("Customer update copied");
}

async function updateNotificationStatus(id, status) {
  try {
    const payload = await api(`/api/admin/notifications/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    state.notifications = state.notifications.map((item) => (item.id === payload.notification.id ? payload.notification : item));
    renderAll();
    showToast(`Alert marked ${status}`);
  } catch (error) {
    showToast(error.message);
  }
}

async function retryNotification(id) {
  try {
    const payload = await api(`/api/admin/notifications/${encodeURIComponent(id)}/retry`, {
      method: "POST",
      body: JSON.stringify({})
    });
    state.notifications = state.notifications.map((item) => (item.id === payload.notification.id ? payload.notification : item));
    renderAll();
    showToast(`Alert ${payload.notification.status}`);
  } catch (error) {
    showToast(error.message);
  }
}

function printPackingSlip(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) {
    showToast("Order not found for packing slip");
    return;
  }

  const itemRows = (order.items || [])
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name || "Product")}</td>
          <td>${escapeHtml(item.size || "")}</td>
          <td>${Number(item.quantity || 0)}</td>
          <td>${money(item.lineTotal)}</td>
        </tr>
      `
    )
    .join("");
  const slip = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Packing Slip ${escapeHtml(order.id)}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 28px; color: #1c2521; font-family: Arial, sans-serif; }
          h1, h2, p { margin: 0; }
          .slip { display: grid; gap: 18px; }
          .top { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 16px; border-bottom: 2px solid #1e594b; }
          .brand { font-size: 28px; font-weight: 800; color: #1e594b; }
          .muted { color: #66736c; line-height: 1.5; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
          .box { padding: 14px; border: 1px solid #d8d2c1; border-radius: 8px; }
          .box strong { display: block; margin-bottom: 8px; text-transform: uppercase; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 10px; border: 1px solid #d8d2c1; text-align: left; }
          th { background: #f4f1e8; font-size: 12px; text-transform: uppercase; }
          .checks { display: grid; gap: 8px; }
          .checks span { min-height: 28px; padding-left: 28px; position: relative; }
          .checks span::before { content: ""; position: absolute; left: 0; top: 1px; width: 18px; height: 18px; border: 1px solid #1e594b; }
          @media print { body { padding: 0; } button { display: none; } }
        </style>
      </head>
      <body>
        <button onclick="window.print()" style="margin-bottom:16px;padding:10px 14px">Print / Save PDF</button>
        <main class="slip">
          <section class="top">
            <div>
              <p class="brand">BandEvi Gourmet</p>
              <p class="muted">Packing slip and dispatch checklist</p>
            </div>
            <div>
              <h1>${escapeHtml(order.id)}</h1>
              <p class="muted">${formatDate(order.placedAt)}</p>
            </div>
          </section>
          <section class="grid">
            <div class="box">
              <strong>Customer</strong>
              <p>${escapeHtml(order.customer?.name || "Customer")}</p>
              <p class="muted">${escapeHtml(order.customer?.phone || "")}</p>
              <p class="muted">${escapeHtml(order.customer?.email || "")}</p>
            </div>
            <div class="box">
              <strong>Delivery</strong>
              <p>${escapeHtml(order.countryCity || order.customer?.location || "Location pending")}</p>
              <p class="muted">${escapeHtml(order.postalCode || "")}</p>
              <p class="muted">${escapeHtml(order.address || "Address pending")}</p>
            </div>
            <div class="box">
              <strong>Courier</strong>
              <p>${escapeHtml(order.courier || "Courier pending")}</p>
              <p class="muted">${escapeHtml(order.trackingCode || "Tracking pending")}</p>
              <p class="muted">${escapeHtml(order.dispatchDate || "Dispatch date pending")}</p>
            </div>
            <div class="box">
              <strong>Payment</strong>
              <p>${escapeHtml(order.paymentState || order.payment || "Payment pending")}</p>
              <p class="muted">Total: ${money(order.totals?.total)}</p>
            </div>
          </section>
          <section>
            <table>
              <thead><tr><th>Product</th><th>Pack</th><th>Qty</th><th>Value</th></tr></thead>
              <tbody>${itemRows || `<tr><td colspan="4">No item details</td></tr>`}</tbody>
            </table>
          </section>
          <section class="box checks">
            <strong>Dispatch checklist</strong>
            <span>Products checked against order quantity</span>
            <span>Pack condition and seal checked</span>
            <span>Customer address and phone verified</span>
            <span>Courier label attached and tracking saved</span>
          </section>
        </main>
      </body>
    </html>
  `;
  const slipWindow = window.open("", "_blank");
  if (!slipWindow) {
    showToast("Allow popups to print packing slip");
    return;
  }
  slipWindow.document.write(slip);
  slipWindow.document.close();
}

async function updateOrderStatus(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const orderId = form.dataset.statusForm;
  const data = new FormData(form);

  try {
    const payload = await api(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: data.get("status"),
        paymentState: data.get("paymentState"),
        courier: data.get("courier"),
        trackingCode: data.get("trackingCode"),
        trackingUrl: data.get("trackingUrl"),
        dispatchDate: data.get("dispatchDate"),
        eta: data.get("eta"),
        adminNote: data.get("adminNote"),
        note: data.get("note"),
        notifyCustomer: data.get("notifyCustomer") === "on"
      })
    });
    state.orders = state.orders.map((order) => (order.id === payload.order.id ? payload.order : order));
    renderAll();
    showToast(`${orderId} updated`);
    loadDashboard();
  } catch (error) {
    showToast(error.message);
  }
}

async function updateOrderQuickStatus(event) {
  const button = event.currentTarget;
  const orderId = button.dataset.orderId;
  const status = button.dataset.quickStatus;
  const order = state.orders.find((item) => item.id === orderId);
  if (!orderId || !status || order?.status === status) return;

  button.disabled = true;
  try {
    const payload = await api(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status,
        note: `Order moved to ${STATUS_LABELS[status]} from admin quick action.`
      })
    });
    state.orders = state.orders.map((item) => (item.id === payload.order.id ? payload.order : item));
    renderAll();
    showToast(`${orderId} moved to ${STATUS_LABELS[status]}`);
    loadDashboard();
  } catch (error) {
    button.disabled = false;
    showToast(error.message);
  }
}

async function updateWholesaleStatus(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const enquiryId = form.dataset.wholesaleForm;
  const data = new FormData(form);

  try {
    const payload = await api(`/api/admin/wholesale/${encodeURIComponent(enquiryId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: data.get("status"),
        note: data.get("note")
      })
    });
    state.enquiries = state.enquiries.map((enquiry) => (enquiry.id === payload.enquiry.id ? payload.enquiry : enquiry));
    renderAll();
    showToast(`${enquiryId} updated`);
  } catch (error) {
    showToast(error.message);
  }
}

async function updateCustomerStatus(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const customerKey = form.dataset.customerForm;
  const data = new FormData(form);

  try {
    const payload = await api(`/api/admin/customers/${encodeURIComponent(customerKey)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: data.get("status"),
        tags: data.get("tags"),
        adminNote: data.get("adminNote")
      })
    });
    state.customers = state.customers.map((customer) => {
      const key = customer.phone || customer.id;
      return key === customerKey ? payload.customer : customer;
    });
    renderAll();
    showToast("Customer updated");
  } catch (error) {
    showToast(error.message);
  }
}

async function updateSupportRequest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const supportId = form.dataset.supportForm;
  const data = new FormData(form);

  try {
    const payload = await api(`/api/admin/support/${encodeURIComponent(supportId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: data.get("status"),
        resolutionNote: data.get("resolutionNote"),
        internalNote: data.get("internalNote")
      })
    });
    state.supportRequests = state.supportRequests.map((request) =>
      request.id === payload.supportRequest.id ? payload.supportRequest : request
    );
    renderAll();
    showToast(`${supportId} updated`);
    loadDashboard();
  } catch (error) {
    showToast(error.message);
  }
}

function productPayloadFromForm(form) {
  const data = new FormData(form);
  const imagePath = String(data.get("imagePath") || "").trim();
  const storedImage = String(data.get("image") || "").trim();
  const discountValue = String(data.get("discountPrice") || "").trim();
  return {
    name: data.get("name"),
    category: data.get("category"),
    mrp: Number(data.get("mrp") || 0),
    price: Number(data.get("price") || 0),
    offerPrice: Number(data.get("price") || 0),
    ...(discountValue ? { discountPrice: Number(discountValue) } : {}),
    size: data.get("size"),
    badge: data.get("badge"),
    stock: Number(data.get("stock") || 0),
    lowStockThreshold: Number(data.get("lowStockThreshold") || 10),
    stockStatus: data.get("stockStatus"),
    image: imagePath || storedImage,
    tags: data.get("tags"),
    adminNote: data.get("adminNote"),
    description: data.get("description"),
    details: {
      ingredients: formList(data.get("detailsIngredients")),
      nutrition: formList(data.get("detailsNutrition")),
      usage: formList(data.get("detailsUsage")),
      trust: formList(data.get("detailsTrust")),
      shelfLife: data.get("detailsShelfLife"),
      storage: data.get("detailsStorage"),
      origin: data.get("detailsOrigin"),
      flavorNotes: data.get("detailsFlavorNotes"),
      allergen: data.get("detailsAllergen"),
      disclaimer: data.get("detailsDisclaimer")
    },
    featured: form.elements.featured ? data.get("featured") === "on" : false,
    active: form.elements.active ? data.get("active") === "on" : form.hasAttribute("data-new-product-form")
  };
}

async function handleProductImageUpload(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  const form = input.closest("form");
  const imageInput = form?.elements.image;
  const pathInput = form?.elements.imagePath;
  const preview = form?.querySelector("[data-image-upload-preview]");
  if (!form || !imageInput) return;

  try {
    showToast("Preparing product image...");
    const dataUrl = await compressProductImage(file);
    imageInput.value = dataUrl;
    if (pathInput) pathInput.value = "";
    if (preview) preview.innerHTML = productImagePreviewMarkup(dataUrl, form.elements.name?.value || "Product");
    showToast("Product image ready. Save product to apply.");
  } catch (error) {
    input.value = "";
    showToast(error.message);
  }
}

async function createAdminProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const payload = await api("/api/admin/products", {
      method: "POST",
      body: JSON.stringify(productPayloadFromForm(form))
    });
    state.products = [payload.product, ...state.products];
    form.reset();
    renderAll();
    showToast("Product added");
    loadDashboard();
  } catch (error) {
    showToast(error.message);
  }
}

async function updateAdminProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const productId = form.dataset.productForm;
  try {
    const payload = await api(`/api/admin/products/${encodeURIComponent(productId)}`, {
      method: "PATCH",
      body: JSON.stringify(productPayloadFromForm(form))
    });
    state.products = state.products.map((product) => (product.id === payload.product.id ? payload.product : product));
    renderAll();
    showToast(`${payload.product.name} updated`);
    loadDashboard();
  } catch (error) {
    showToast(error.message);
  }
}

function couponPayloadFromForm(form) {
  const data = new FormData(form);
  return {
    code: data.get("code"),
    label: data.get("label"),
    type: data.get("type"),
    value: Number(data.get("value") || 0),
    minSubtotal: Number(data.get("minSubtotal") || 0),
    maxDiscount: Number(data.get("maxDiscount") || 0),
    usageLimit: Number(data.get("usageLimit") || 0),
    usedCount: Number(data.get("usedCount") || 0),
    startsAt: data.get("startsAt"),
    endsAt: data.get("endsAt"),
    adminNote: data.get("adminNote"),
    autoShow: form.elements.autoShow ? data.get("autoShow") === "on" : false,
    active: form.elements.active ? data.get("active") === "on" : false
  };
}

async function createAdminCoupon(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const payload = await api("/api/admin/coupons", {
      method: "POST",
      body: JSON.stringify(couponPayloadFromForm(form))
    });
    state.coupons = [payload.coupon, ...state.coupons];
    form.reset();
    renderAll();
    showToast("Offer added");
    loadDashboard();
  } catch (error) {
    showToast(error.message);
  }
}

async function updateAdminCoupon(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const couponCode = form.dataset.couponForm;
  try {
    const payload = await api(`/api/admin/coupons/${encodeURIComponent(couponCode)}`, {
      method: "PATCH",
      body: JSON.stringify(couponPayloadFromForm(form))
    });
    state.coupons = state.coupons.map((coupon) => (coupon.code === payload.coupon.code ? payload.coupon : coupon));
    renderAll();
    showToast(`${payload.coupon.code} updated`);
    loadDashboard();
  } catch (error) {
    showToast(error.message);
  }
}

async function downloadAdminExport(type) {
  try {
    const response = await fetch(`${API_ORIGIN}/api/admin/export?type=${encodeURIComponent(type)}`, {
      headers: { Authorization: `Bearer ${state.token}` }
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Export failed");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bandevi-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast(`${type} export ready`);
  } catch (error) {
    showToast(error.message);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  loginMessage.textContent = "Checking password...";
  try {
    const payload = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: data.get("password") })
    });
    state.token = payload.token;
    window.sessionStorage.setItem(TOKEN_KEY, state.token);
    form.reset();
    loginMessage.textContent = "";
    showToast("Admin logged in");
    await loadDashboard();
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderAll();
});

orderFilterInput?.addEventListener("change", (event) => {
  state.orderFilter = event.target.value;
  renderPipeline();
  renderOrders();
});

leadFilterInput?.addEventListener("change", (event) => {
  state.leadFilter = event.target.value;
  renderWholesale();
});

document.querySelectorAll("[data-export]").forEach((button) => {
  button.addEventListener("click", () => downloadAdminExport(button.dataset.export));
});

adminNavLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const section = link.dataset.adminNav;
    if (!ADMIN_SECTIONS.includes(section)) return;
    history.replaceState(null, "", `#${section}`);
    showAdminSection(section);
  });
});

document.querySelector(".admin-header .brand")?.addEventListener("click", (event) => {
  event.preventDefault();
  history.replaceState(null, "", "#orders");
  showAdminSection("orders");
});

window.addEventListener("hashchange", () => showAdminSection(getActiveAdminSection(), true));

document.querySelector("#refreshAdmin").addEventListener("click", loadDashboard);
document.querySelector("#logoutAdmin").addEventListener("click", () => {
  state.token = "";
  state.summary = null;
  state.storage = null;
  state.orders = [];
  state.enquiries = [];
  state.customers = [];
  state.notifications = [];
  state.supportRequests = [];
  state.products = [];
  state.coupons = [];
  state.notificationConfig = null;
  window.sessionStorage.removeItem(TOKEN_KEY);
  setAdminAuthenticated(false);
  updateAdminNavState();
  setStatus("Logged out.");
});

loadDashboard();
