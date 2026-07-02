const TOKEN_KEY = "bandevi-admin-token";
const LIVE_API_ORIGIN = "https://bandevigourmet-web.onrender.com";
const STATUS_LABELS = {
  booked: "Booked",
  confirmed: "Confirmed",
  packed: "Packed",
  dispatched: "Dispatched",
  delivered: "Delivered"
};
const WHOLESALE_LABELS = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  "sample-sent": "Sample sent",
  converted: "Converted",
  closed: "Closed"
};
const PAYMENT_STATES = ["Payment pending", "Advance requested", "Paid", "COD", "Refund pending", "Refunded"];

const state = {
  token: window.sessionStorage.getItem(TOKEN_KEY) || "",
  summary: null,
  orders: [],
  enquiries: [],
  customers: [],
  search: ""
};

const loginForm = document.querySelector("#adminLoginForm");
const loginMessage = document.querySelector("#adminLoginMessage");
const dashboard = document.querySelector("#adminDashboard");
const statusBox = document.querySelector("#adminStatus");
const statsBox = document.querySelector("#adminStats");
const orderList = document.querySelector("#adminOrderList");
const wholesaleList = document.querySelector("#adminWholesaleList");
const customerList = document.querySelector("#adminCustomerList");
const searchInput = document.querySelector("#adminSearchInput");
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
  const apiPath = path.startsWith("http") ? path : `${LIVE_API_ORIGIN}${path}`;
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
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
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

function renderStats() {
  const summary = state.summary || {
    totalOrders: state.orders.length,
    activeOrders: state.orders.filter((order) => order.status !== "delivered").length,
    bookingValue: state.orders.reduce((sum, order) => sum + Number(order.totals?.total || 0), 0),
    customers: state.customers.length,
    wholesaleEnquiries: state.enquiries.length
  };

  statsBox.innerHTML = `
    <article><strong>${summary.totalOrders}</strong><span>Total bookings</span></article>
    <article><strong>${summary.activeOrders}</strong><span>Active orders</span></article>
    <article><strong>${money(summary.bookingValue)}</strong><span>Booking value</span></article>
    <article><strong>${summary.customers}</strong><span>Customers</span></article>
    <article><strong>${summary.wholesaleEnquiries}</strong><span>Wholesale leads</span></article>
  `;
}

function renderOrders() {
  const visibleOrders = state.orders.filter(orderMatchesSearch);

  orderList.innerHTML = visibleOrders.length
    ? visibleOrders.map(renderOrder).join("")
    : `<div class="admin-empty">No orders found.</div>`;

  orderList.querySelectorAll("[data-status-form]").forEach((form) => {
    form.addEventListener("submit", updateOrderStatus);
  });
}

function renderOrder(order) {
  const items = (order.items || []).map((item) => `${escapeHtml(item.name)} x ${item.quantity}`).join(", ");
  const history = order.statusHistory || [];
  const latestHistory = history[history.length - 1];
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
      </div>
      <p class="admin-items">${items || "No item details"}</p>
      <p class="admin-address">${escapeHtml(order.address || "No address")}</p>
      <p class="admin-history">${latestHistory ? `${escapeHtml(STATUS_LABELS[latestHistory.status] || latestHistory.status)}: ${escapeHtml(latestHistory.note || "")}` : "No status history"}</p>
      <form class="admin-status-form" data-status-form="${escapeHtml(order.id)}">
        <select name="status" aria-label="Order status">${statusOptions}</select>
        <select name="paymentState" aria-label="Payment status">${paymentOptions}</select>
        <input name="courier" type="text" placeholder="Courier name" value="${escapeHtml(order.courier || "")}" />
        <input name="trackingCode" type="text" placeholder="Tracking code" value="${escapeHtml(order.trackingCode || "")}" />
        <input name="eta" type="text" placeholder="Expected delivery" value="${escapeHtml(order.eta || "")}" />
        <input name="adminNote" type="text" placeholder="Seller note visible to customer" value="${escapeHtml(order.adminNote || "")}" />
        <input name="note" type="text" placeholder="Timeline note" />
        <button type="submit">Update order</button>
      </form>
    </article>
  `;
}

function renderWholesale() {
  const visibleEnquiries = state.enquiries.filter(enquiryMatchesSearch);

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
}

function renderCustomer(customer) {
  return `
    <article class="admin-customer-card">
      <header>
        <div>
          <h3>${escapeHtml(customer.name || "Unnamed customer")}</h3>
          <p>${escapeHtml(customer.phone || "No phone")} ${customer.email ? `| ${escapeHtml(customer.email)}` : ""}</p>
        </div>
        <span class="status-pill">${Number(customer.orderCount || 0)} orders</span>
      </header>
      <div class="admin-order-grid">
        <span><strong>Location</strong>${escapeHtml(customer.location || "Not added")}<small>Customer profile</small></span>
        <span><strong>Total spend</strong>${money(customer.totalSpend)}<small>Website bookings</small></span>
        <span><strong>Last order</strong>${formatDate(customer.lastOrderAt)}<small>${escapeHtml(customer.updatedAt ? `Updated ${formatDate(customer.updatedAt)}` : "")}</small></span>
      </div>
    </article>
  `;
}

function renderAll() {
  renderStats();
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
    const [ordersPayload, wholesalePayload, summaryPayload, customersPayload] = await Promise.all([
      api("/api/admin/orders"),
      api("/api/admin/wholesale"),
      api("/api/admin/summary").catch(() => ({ summary: null })),
      api("/api/admin/customers").catch(() => ({ customers: [] }))
    ]);
    state.orders = ordersPayload.orders || [];
    state.enquiries = wholesalePayload.enquiries || [];
    state.summary = summaryPayload.summary || null;
    state.customers = customersPayload.customers || [];
    dashboard.hidden = false;
    setStatus("Admin backend connected.", "success");
    renderAll();
  } catch (error) {
    dashboard.hidden = true;
    setStatus(error.message, "error");
  }
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
        eta: data.get("eta"),
        adminNote: data.get("adminNote"),
        note: data.get("note")
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

document.querySelector("#refreshAdmin").addEventListener("click", loadDashboard);
document.querySelector("#logoutAdmin").addEventListener("click", () => {
  state.token = "";
  state.summary = null;
  state.orders = [];
  state.enquiries = [];
  state.customers = [];
  window.sessionStorage.removeItem(TOKEN_KEY);
  dashboard.hidden = true;
  setStatus("Logged out.");
});

loadDashboard();
