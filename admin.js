const TOKEN_KEY = "bandevi-admin-token";
const STATUS_LABELS = {
  booked: "Booked",
  confirmed: "Confirmed",
  packed: "Packed",
  dispatched: "Dispatched",
  delivered: "Delivered"
};

const state = {
  token: window.sessionStorage.getItem(TOKEN_KEY) || "",
  orders: [],
  enquiries: [],
  search: ""
};

const loginForm = document.querySelector("#adminLoginForm");
const loginMessage = document.querySelector("#adminLoginMessage");
const dashboard = document.querySelector("#adminDashboard");
const statusBox = document.querySelector("#adminStatus");
const statsBox = document.querySelector("#adminStats");
const orderList = document.querySelector("#adminOrderList");
const wholesaleList = document.querySelector("#adminWholesaleList");
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
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(path, {
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

function orderMatchesSearch(order) {
  const q = state.search.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    order.id,
    order.status,
    order.orderType,
    order.customer?.name,
    order.customer?.phone,
    order.customer?.email,
    order.countryCity,
    order.address,
    ...(order.items || []).map((item) => item.name)
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function renderStats() {
  const total = state.orders.length;
  const active = state.orders.filter((order) => order.status !== "delivered").length;
  const revenue = state.orders.reduce((sum, order) => sum + Number(order.totals?.total || 0), 0);
  const wholesale = state.enquiries.length;

  statsBox.innerHTML = `
    <article><strong>${total}</strong><span>Total bookings</span></article>
    <article><strong>${active}</strong><span>Active orders</span></article>
    <article><strong>${money(revenue)}</strong><span>Booking value</span></article>
    <article><strong>${wholesale}</strong><span>Wholesale enquiries</span></article>
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
  const latestHistory = (order.statusHistory || []).at(-1);
  const statusOptions = Object.entries(STATUS_LABELS)
    .map(([value, label]) => `<option value="${value}" ${order.status === value ? "selected" : ""}>${label}</option>`)
    .join("");

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
      </div>
      <p class="admin-items">${items || "No item details"}</p>
      <p class="admin-address">${escapeHtml(order.address || "No address")}</p>
      <p class="admin-history">${latestHistory ? `${escapeHtml(STATUS_LABELS[latestHistory.status] || latestHistory.status)}: ${escapeHtml(latestHistory.note || "")}` : "No status history"}</p>
      <form class="admin-status-form" data-status-form="${escapeHtml(order.id)}">
        <select name="status">${statusOptions}</select>
        <input name="note" type="text" placeholder="Status note for customer history" />
        <button type="submit">Update</button>
      </form>
    </article>
  `;
}

function renderWholesale() {
  wholesaleList.innerHTML = state.enquiries.length
    ? state.enquiries.map(renderEnquiry).join("")
    : `<div class="admin-empty">No wholesale enquiries yet.</div>`;
}

function renderEnquiry(enquiry) {
  return `
    <article class="admin-order-card">
      <header>
        <div>
          <h3>${escapeHtml(enquiry.businessName || enquiry.id)}</h3>
          <p>${formatDate(enquiry.placedAt)} | ${escapeHtml(enquiry.country || "No location")}</p>
        </div>
        <span class="status-pill">${escapeHtml(enquiry.volume || "Volume pending")}</span>
      </header>
      <p><strong>Contact:</strong> ${escapeHtml(enquiry.contactName || "Not added")}</p>
      <p>${escapeHtml(enquiry.message || "No product interest added")}</p>
    </article>
  `;
}

function renderAll() {
  renderStats();
  renderOrders();
  renderWholesale();
}

async function loadDashboard() {
  if (!state.token) {
    dashboard.hidden = true;
    setStatus("Login with the admin password to manage orders.");
    return;
  }

  try {
    setStatus("Loading admin data...");
    const [ordersPayload, wholesalePayload] = await Promise.all([
      api("/api/admin/orders"),
      api("/api/admin/wholesale")
    ]);
    state.orders = ordersPayload.orders || [];
    state.enquiries = wholesalePayload.enquiries || [];
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
        note: data.get("note")
      })
    });
    state.orders = state.orders.map((order) => (order.id === payload.order.id ? payload.order : order));
    renderAll();
    showToast(`${orderId} updated`);
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
  renderOrders();
});

document.querySelector("#refreshAdmin").addEventListener("click", loadDashboard);
document.querySelector("#logoutAdmin").addEventListener("click", () => {
  state.token = "";
  window.sessionStorage.removeItem(TOKEN_KEY);
  dashboard.hidden = true;
  setStatus("Logged out.");
});

loadDashboard();
