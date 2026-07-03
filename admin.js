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

const state = {
  token: window.sessionStorage.getItem(TOKEN_KEY) || "",
  summary: null,
  storage: null,
  orders: [],
  enquiries: [],
  customers: [],
  notifications: [],
  notificationConfig: null,
  search: "",
  orderFilter: "all",
  leadFilter: "all"
};

const loginForm = document.querySelector("#adminLoginForm");
const loginMessage = document.querySelector("#adminLoginMessage");
const dashboard = document.querySelector("#adminDashboard");
const statusBox = document.querySelector("#adminStatus");
const statsBox = document.querySelector("#adminStats");
const pipelineBox = document.querySelector("#adminPipeline");
const storageBox = document.querySelector("#adminStorage");
const orderList = document.querySelector("#adminOrderList");
const wholesaleList = document.querySelector("#adminWholesaleList");
const customerList = document.querySelector("#adminCustomerList");
const notificationList = document.querySelector("#adminNotificationList");
const searchInput = document.querySelector("#adminSearchInput");
const orderFilterInput = document.querySelector("#adminOrderFilter");
const leadFilterInput = document.querySelector("#adminLeadFilter");
const toast = document.querySelector("#adminToast");

function money(value) {
  return `Rs. ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value || 0)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  return matchesSearch([customer.name, customer.phone, customer.email, customer.location, customer.orderCount, customer.totalSpend]);
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
    pendingNotifications: state.notifications.filter((item) => ["queued", "ready", "failed"].includes(item.status)).length
  };

  statsBox.innerHTML = `
    <article><strong>${summary.totalOrders}</strong><span>Total bookings</span></article>
    <article><strong>${summary.activeOrders}</strong><span>Active orders</span></article>
    <article><strong>${money(summary.bookingValue)}</strong><span>Booking value</span></article>
    <article><strong>${summary.customers}</strong><span>Customers</span></article>
    <article><strong>${summary.wholesaleEnquiries}</strong><span>Wholesale leads</span></article>
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

  return `
    <article class="admin-notification-card">
      <header>
        <div>
          <h3>${escapeHtml(notification.subject || notification.id)}</h3>
          <p>${escapeHtml(notificationChannelLabel(notification))} | ${formatDate(notification.createdAt)}</p>
        </div>
        <span class="status-pill">${escapeHtml(notification.status || "ready")}</span>
      </header>
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
}

function renderOrder(order) {
  const items = (order.items || []).map((item) => `${escapeHtml(item.name)} x ${item.quantity}`).join(", ");
  const history = order.statusHistory || [];
  const latestHistory = history[history.length - 1];
  const customerPhone = order.customer?.phone || "";
  const trackingUrl = `./track.html?id=${encodeURIComponent(order.id)}&phone=${encodeURIComponent(customerPhone)}`;
  const statusOptions = Object.entries(STATUS_LABELS)
    .map(([value, label]) => `<option value="${value}" ${order.status === value ? "selected" : ""}>${label}</option>`)
    .join("");
  const paymentOptions = PAYMENT_STATES.map(
    (label) => `<option value="${label}" ${order.paymentState === label ? "selected" : ""}>${label}</option>`
  ).join("");

  return `
    <article class="admin-order-card">
      <header>
        <div>
          <h3>${escapeHtml(order.id)}</h3>
          <p>${formatDate(order.placedAt)} | ${escapeHtml(order.source || "Website booking")}</p>
        </div>
        <span class="status-pill">${escapeHtml(STATUS_LABELS[order.status] || order.status)}</span>
      </header>
      <div class="admin-order-grid">
        <span><strong>Customer</strong>${escapeHtml(order.customer?.name || "No name")}<small>${escapeHtml(order.customer?.phone || "")}</small></span>
        <span><strong>Location</strong>${escapeHtml(order.countryCity || "Not added")}<small>${escapeHtml(order.postalCode || "")}</small></span>
        <span><strong>Total</strong>${money(order.totals?.total)}<small>${escapeHtml(order.payment || "Payment pending")}</small></span>
        <span><strong>Type</strong>${escapeHtml(order.orderType || "Retail order")}<small>${escapeHtml(order.customer?.email || "")}</small></span>
        <span><strong>Delivery</strong>${escapeHtml(order.courier || "Courier pending")}<small>${escapeHtml(order.trackingCode || order.eta || "Tracking pending")}</small></span>
        <span><strong>Dispatch</strong>${escapeHtml(order.dispatchDate || "Not dispatched")}<small>${escapeHtml(order.trackingUrl || "Courier link pending")}</small></span>
      </div>
      <p class="admin-items">${items || "No item details"}</p>
      <p class="admin-address">${escapeHtml(order.address || "No address")}</p>
      <p class="admin-history">${latestHistory ? `${escapeHtml(STATUS_LABELS[latestHistory.status] || latestHistory.status)}: ${escapeHtml(latestHistory.note || "")}` : "No status history"}</p>
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
  renderWholesale();
  renderCustomers();
}

async function loadDashboard() {
  if (!state.token) {
    dashboard.hidden = true;
    setStatus("Login with the admin password to manage orders.");
    return;
  }

  try {
    setStatus("Loading admin data...");
    const [ordersPayload, wholesalePayload, summaryPayload, customersPayload, storagePayload, notificationsPayload] = await Promise.all([
      api("/api/admin/orders"),
      api("/api/admin/wholesale"),
      api("/api/admin/summary").catch(() => ({ summary: null })),
      api("/api/admin/customers").catch(() => ({ customers: [] })),
      api("/api/admin/storage").catch(() => ({ storage: null })),
      api("/api/admin/notifications").catch(() => ({ notifications: [], config: null }))
    ]);
    state.orders = ordersPayload.orders || [];
    state.enquiries = wholesalePayload.enquiries || [];
    state.summary = summaryPayload.summary || null;
    state.customers = customersPayload.customers || [];
    state.storage = storagePayload.storage || null;
    state.notifications = notificationsPayload.notifications || [];
    state.notificationConfig = notificationsPayload.config || null;
    dashboard.hidden = false;
    setStatus("Admin backend connected.", "success");
    renderAll();
  } catch (error) {
    dashboard.hidden = true;
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
  const data = new FormData(event.currentTarget);
  loginMessage.textContent = "Checking password...";
  try {
    const payload = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: data.get("password") })
    });
    state.token = payload.token;
    window.sessionStorage.setItem(TOKEN_KEY, state.token);
    event.currentTarget.reset();
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

document.querySelector("#refreshAdmin").addEventListener("click", loadDashboard);
document.querySelector("#logoutAdmin").addEventListener("click", () => {
  state.token = "";
  state.summary = null;
  state.storage = null;
  state.orders = [];
  state.enquiries = [];
  state.customers = [];
  state.notifications = [];
  state.notificationConfig = null;
  window.sessionStorage.removeItem(TOKEN_KEY);
  dashboard.hidden = true;
  setStatus("Logged out.");
});

loadDashboard();
