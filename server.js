import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT || 4174);
const DATA_DIR = resolve(process.env.DATA_DIR || join(__dirname, "server-data"));
const DB_FILE = join(DATA_DIR, "store.json");
const PUBLIC_DIR = resolve(__dirname, "dist");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || ADMIN_PASSWORD || randomUUID();
const DATABASE_URL = process.env.DATABASE_URL || "";
const STORAGE_DRIVER = DATABASE_URL ? "postgres" : "json";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;
const ORDER_STATUSES = new Set(["booked", "confirmed", "packed", "dispatched", "delivered"]);
const WHOLESALE_STATUSES = new Set(["new", "contacted", "quoted", "sample-sent", "converted", "closed"]);
const API_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS"
};

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"]
]);

function jsonResponse(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...API_CORS_HEADERS
  });
  res.end(JSON.stringify(payload));
}

function csvResponse(res, filename, rows) {
  const csv = rowsToCsv(rows);
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="${filename}"`,
    ...API_CORS_HEADERS
  });
  res.end(csv);
}

function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanPhone(value) {
  return text(value, 40).replace(/\D/g, "");
}

function cleanOrderId(value) {
  return text(value, 32).toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function csvCell(value) {
  const raw = String(value ?? "");
  if (/[",\n\r]/.test(raw)) return `"${raw.replaceAll('"', '""')}"`;
  return raw;
}

function rowsToCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n");
}

function publicOrder(order) {
  return {
    id: order.id,
    source: order.source,
    status: order.status,
    placedAt: order.placedAt,
    updatedAt: order.updatedAt,
    orderType: order.orderType,
    customer: order.customer,
    countryCity: order.countryCity,
    postalCode: order.postalCode,
    address: order.address,
    payment: order.payment,
    paymentState: order.paymentState,
    paymentNote: order.paymentNote,
    courier: order.courier,
    trackingCode: order.trackingCode,
    eta: order.eta,
    adminNote: order.adminNote,
    totals: order.totals,
    items: order.items,
    statusHistory: order.statusHistory || []
  };
}

function publicCustomer(customer) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    location: customer.location,
    status: customer.status || "active",
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
    lastOrderAt: customer.lastOrderAt,
    orderCount: Number(customer.orderCount || 0),
    totalSpend: Number(customer.totalSpend || 0),
    tags: Array.isArray(customer.tags) ? customer.tags : []
  };
}

function adminCustomer(customer) {
  return {
    ...publicCustomer(customer),
    adminNote: customer.adminNote || ""
  };
}

function publicEnquiry(enquiry) {
  return {
    id: enquiry.id,
    businessName: enquiry.businessName,
    contactName: enquiry.contactName,
    phone: enquiry.phone,
    email: enquiry.email,
    country: enquiry.country,
    volume: enquiry.volume,
    message: enquiry.message,
    status: enquiry.status || "new",
    note: enquiry.note,
    placedAt: enquiry.placedAt,
    updatedAt: enquiry.updatedAt,
    history: enquiry.history || []
  };
}

function emptyDb() {
  return { orders: [], wholesale: [], customers: [], events: [] };
}

function normalizeDb(db) {
  const safeDb = db && typeof db === "object" ? db : {};
  return {
    ...emptyDb(),
    ...safeDb,
    orders: Array.isArray(safeDb.orders) ? safeDb.orders : [],
    wholesale: Array.isArray(safeDb.wholesale) ? safeDb.wholesale : [],
    customers: Array.isArray(safeDb.customers) ? safeDb.customers : [],
    events: Array.isArray(safeDb.events) ? safeDb.events : []
  };
}

function normalizeCustomer(input = {}, existing = {}) {
  const now = new Date().toISOString();
  const tags = Array.isArray(input.tags || existing.tags) ? (input.tags || existing.tags).slice(0, 12).map((tag) => text(tag, 50)) : [];

  return {
    id: text(existing.id || input.id, 40) || `CU${Math.floor(10000 + Math.random() * 90000)}`,
    name: text(input.name || existing.name, 120),
    phone: cleanPhone(input.phone || existing.phone),
    email: text(input.email || existing.email, 160),
    location: text(input.location || existing.location, 160),
    createdAt: existing.createdAt || input.createdAt || now,
    updatedAt: now,
    lastOrderAt: input.lastOrderAt || existing.lastOrderAt || "",
    orderCount: Number(existing.orderCount || input.orderCount || 0),
    totalSpend: Number(existing.totalSpend || input.totalSpend || 0),
    status: text(input.status || existing.status || "active", 40),
    adminNote: text(input.adminNote || existing.adminNote, 500),
    tags
  };
}

function upsertCustomer(db, input = {}) {
  const phone = cleanPhone(input.phone);
  if (!phone) return null;

  db.customers = Array.isArray(db.customers) ? db.customers : [];
  const existingIndex = db.customers.findIndex((item) => cleanPhone(item.phone) === phone);
  const existing = existingIndex >= 0 ? db.customers[existingIndex] : {};
  const customer = normalizeCustomer({ ...existing, ...input, phone }, existing);
  const customerOrders = (db.orders || []).filter((order) => cleanPhone(order.customer?.phone) === phone);

  if (customerOrders.length) {
    customer.orderCount = customerOrders.length;
    customer.totalSpend = customerOrders.reduce((sum, order) => sum + Number(order.totals?.total || 0), 0);
    customer.lastOrderAt = customerOrders
      .map((order) => order.updatedAt || order.placedAt)
      .filter(Boolean)
      .sort((a, b) => new Date(b) - new Date(a))[0];
  }

  db.customers = [customer, ...db.customers.filter((_, index) => index !== existingIndex)].slice(0, 2000);
  return customer;
}

function buildCustomerDashboard(db, phone) {
  const clean = cleanPhone(phone);
  const orders = (db.orders || [])
    .filter((item) => cleanPhone(item.customer?.phone) === clean)
    .slice(0, 50)
    .map(publicOrder);
  const enquiries = (db.wholesale || [])
    .filter((item) => cleanPhone(item.phone) === clean)
    .slice(0, 20)
    .map(publicEnquiry);
  const customer =
    (db.customers || []).find((item) => cleanPhone(item.phone) === clean) ||
    (orders[0]?.customer ? normalizeCustomer({ ...orders[0].customer, phone: clean, lastOrderAt: orders[0].placedAt }) : null);
  const activeOrders = orders.filter((order) => order.status !== "delivered").length;

  return {
    customer: customer ? publicCustomer(customer) : null,
    orders,
    enquiries,
    summary: {
      totalOrders: orders.length,
      activeOrders,
      deliveredOrders: orders.length - activeOrders,
      totalSpend: orders.reduce((sum, order) => sum + Number(order.totals?.total || 0), 0),
      wholesaleEnquiries: enquiries.length,
      latestStatus: orders[0]?.status || "",
      latestOrderId: orders[0]?.id || ""
    }
  };
}

function buildAdminSummary(db) {
  const orders = db.orders || [];
  const enquiries = db.wholesale || [];
  const activeOrders = orders.filter((order) => order.status !== "delivered");
  const openWholesale = enquiries.filter((item) => !["converted", "closed"].includes(item.status || "new"));

  return {
    totalOrders: orders.length,
    activeOrders: activeOrders.length,
    deliveredOrders: orders.length - activeOrders.length,
    bookingValue: orders.reduce((sum, order) => sum + Number(order.totals?.total || 0), 0),
    customers: (db.customers || []).length,
    wholesaleEnquiries: enquiries.length,
    openWholesale: openWholesale.length,
    lastOrderAt: orders[0]?.updatedAt || orders[0]?.placedAt || "",
    countries: [...new Set(orders.map((order) => text(order.countryCity, 80)).filter(Boolean))].slice(0, 12)
  };
}

function orderExportRows(db) {
  return (db.orders || []).map((order) => ({
    id: order.id,
    status: order.status,
    placedAt: order.placedAt,
    updatedAt: order.updatedAt,
    customerName: order.customer?.name || "",
    phone: order.customer?.phone || "",
    email: order.customer?.email || "",
    location: order.countryCity || order.customer?.location || "",
    total: order.totals?.total || 0,
    payment: order.payment || "",
    paymentState: order.paymentState || "",
    courier: order.courier || "",
    trackingCode: order.trackingCode || "",
    eta: order.eta || "",
    items: (order.items || []).map((item) => `${item.name} x ${item.quantity}`).join("; ")
  }));
}

function customerExportRows(db) {
  return (db.customers || []).map((customer) => ({
    id: customer.id,
    name: customer.name || "",
    phone: customer.phone || "",
    email: customer.email || "",
    location: customer.location || "",
    status: customer.status || "active",
    orderCount: customer.orderCount || 0,
    totalSpend: customer.totalSpend || 0,
    lastOrderAt: customer.lastOrderAt || "",
    tags: (customer.tags || []).join("; "),
    adminNote: customer.adminNote || ""
  }));
}

function wholesaleExportRows(db) {
  return (db.wholesale || []).map((enquiry) => ({
    id: enquiry.id,
    status: enquiry.status || "new",
    businessName: enquiry.businessName || "",
    contactName: enquiry.contactName || "",
    phone: enquiry.phone || "",
    email: enquiry.email || "",
    country: enquiry.country || "",
    volume: enquiry.volume || "",
    placedAt: enquiry.placedAt || "",
    updatedAt: enquiry.updatedAt || "",
    note: enquiry.note || "",
    message: enquiry.message || ""
  }));
}

function exportRows(type, db) {
  if (type === "customers") return customerExportRows(db);
  if (type === "wholesale") return wholesaleExportRows(db);
  return orderExportRows(db);
}

let pgPoolPromise = null;

function postgresSslConfig() {
  if (!DATABASE_URL || process.env.DATABASE_SSL === "false" || DATABASE_URL.includes("localhost")) return false;
  return { rejectUnauthorized: false };
}

async function getPgPool() {
  if (!pgPoolPromise) {
    pgPoolPromise = (async () => {
      const { Pool } = await import("pg");
      const pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: postgresSslConfig()
      });
      await pool.query(`
        CREATE TABLE IF NOT EXISTS store_documents (
          id text PRIMARY KEY,
          data jsonb NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      return pool;
    })();
  }
  return pgPoolPromise;
}

function storageInfo() {
  return {
    driver: STORAGE_DRIVER,
    durable: STORAGE_DRIVER === "postgres",
    databaseConfigured: Boolean(DATABASE_URL),
    jsonFallback: STORAGE_DRIVER === "json",
    jsonFile: STORAGE_DRIVER === "json" ? DB_FILE : ""
  };
}

async function ensureJsonDb() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) {
    await writeFile(DB_FILE, JSON.stringify(emptyDb(), null, 2));
  }
}

async function readJsonDb() {
  await ensureJsonDb();
  try {
    return normalizeDb(JSON.parse(await readFile(DB_FILE, "utf8")));
  } catch {
    return emptyDb();
  }
}

async function writeJsonDb(db) {
  await ensureJsonDb();
  const tempFile = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempFile, JSON.stringify(normalizeDb(db), null, 2));
  await rename(tempFile, DB_FILE);
}

async function readPostgresDb() {
  const pool = await getPgPool();
  const result = await pool.query("SELECT data FROM store_documents WHERE id = $1", ["main"]);
  if (!result.rows.length) {
    const db = emptyDb();
    await pool.query(
      "INSERT INTO store_documents (id, data, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (id) DO NOTHING",
      ["main", JSON.stringify(db)]
    );
    return db;
  }
  return normalizeDb(result.rows[0].data);
}

async function writePostgresDb(db) {
  const pool = await getPgPool();
  await pool.query(
    `INSERT INTO store_documents (id, data, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (id)
     DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    ["main", JSON.stringify(normalizeDb(db))]
  );
}

async function readDb() {
  if (STORAGE_DRIVER === "postgres") return readPostgresDb();
  return readJsonDb();
}

async function writeDb(db) {
  if (STORAGE_DRIVER === "postgres") return writePostgresDb(db);
  return writeJsonDb(db);
}

async function readBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        rejectBody(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch {
        rejectBody(new Error("Invalid JSON"));
      }
    });
    req.on("error", rejectBody);
  });
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function signToken(payload) {
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", TOKEN_SECRET).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  const [encodedPayload, signature] = String(token || "").split(".");
  if (!encodedPayload || !signature) return null;

  const expected = createHmac("sha256", TOKEN_SECRET).update(encodedPayload).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!payload.expiresAt || Date.now() > payload.expiresAt) return null;
    return payload;
  } catch {
    return null;
  }
}

function requireAdmin(req, res) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const payload = verifyToken(token);
  if (!payload) {
    jsonResponse(res, 401, { error: "Admin login required" });
    return false;
  }
  return true;
}

function normalizeOrder(input) {
  const id = cleanOrderId(input.id) || `MM${Math.floor(10000 + Math.random() * 90000)}`;
  const now = new Date().toISOString();
  const customer = input.customer || {};
  const totals = input.totals || {};
  const items = Array.isArray(input.items) ? input.items.slice(0, 80) : [];

  return {
    id,
    source: text(input.source || "Website booking", 80),
    status: ORDER_STATUSES.has(input.status) ? input.status : "booked",
    placedAt: input.placedAt || now,
    updatedAt: now,
    orderType: text(input.orderType || "Retail home order", 80),
    customer: {
      name: text(customer.name, 120),
      phone: text(customer.phone, 40),
      email: text(customer.email, 160),
      location: text(customer.location, 160)
    },
    countryCity: text(input.countryCity || customer.location, 160),
    postalCode: text(input.postalCode, 40),
    address: text(input.address, 600),
    payment: text(input.payment || "To be confirmed", 80),
    paymentState: text(input.paymentState || "Payment pending", 80),
    paymentNote: text(input.paymentNote, 240),
    courier: text(input.courier, 120),
    trackingCode: text(input.trackingCode, 120),
    eta: text(input.eta, 80),
    adminNote: text(input.adminNote, 400),
    totals: {
      subtotal: Number(totals.subtotal || 0),
      discount: Number(totals.discount || 0),
      delivery: Number(totals.delivery || 0),
      total: Number(totals.total || 0)
    },
    items: items.map((item) => ({
      id: text(item.id, 80),
      name: text(item.name, 160),
      size: text(item.size, 80),
      quantity: Number(item.quantity || 0),
      price: Number(item.price || 0),
      lineTotal: Number(item.lineTotal || 0)
    })),
    statusHistory: [
      {
        status: "booked",
        note: "Booking created from website.",
        at: now
      }
    ]
  };
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      ...API_CORS_HEADERS,
      "Access-Control-Max-Age": "86400"
    });
    res.end();
    return true;
  }

  if (url.pathname === "/api/health" && req.method === "GET") {
    jsonResponse(res, 200, {
      ok: true,
      service: "BandEvi Gourmet order backend",
      adminConfigured: Boolean(ADMIN_PASSWORD),
      storage: {
        driver: STORAGE_DRIVER,
        durable: STORAGE_DRIVER === "postgres",
        databaseConfigured: Boolean(DATABASE_URL)
      }
    });
    return true;
  }

  if (url.pathname === "/api/orders" && req.method === "POST") {
    const payload = await readBody(req);
    const order = normalizeOrder(payload);
    if (!order.customer.phone || !order.items.length) {
      jsonResponse(res, 400, { error: "Phone and at least one item are required." });
      return true;
    }

    const db = await readDb();
    db.orders = [order, ...(db.orders || []).filter((item) => item.id !== order.id)].slice(0, 1000);
    upsertCustomer(db, order.customer);
    db.events = [
      { id: randomUUID(), type: "order_created", ref: order.id, at: order.updatedAt },
      ...(db.events || [])
    ].slice(0, 1000);
    await writeDb(db);
    jsonResponse(res, 201, { order: publicOrder(order) });
    return true;
  }

  if (url.pathname === "/api/customers" && req.method === "POST") {
    const payload = await readBody(req);
    const db = await readDb();
    const customer = upsertCustomer(db, payload);
    if (!customer) {
      jsonResponse(res, 400, { error: "Phone is required." });
      return true;
    }

    await writeDb(db);
    jsonResponse(res, 201, { customer: publicCustomer(customer) });
    return true;
  }

  if (url.pathname === "/api/orders/track" && req.method === "GET") {
    const orderId = cleanOrderId(url.searchParams.get("id"));
    const phone = cleanPhone(url.searchParams.get("phone"));
    const db = await readDb();
    const order = (db.orders || []).find(
      (item) => cleanOrderId(item.id) === orderId && cleanPhone(item.customer?.phone) === phone
    );
    if (!order) {
      jsonResponse(res, 404, { error: "No matching booking found." });
      return true;
    }
    jsonResponse(res, 200, { order: publicOrder(order) });
    return true;
  }

  if (url.pathname === "/api/orders/customer" && req.method === "GET") {
    const phone = cleanPhone(url.searchParams.get("phone"));
    if (!phone) {
      jsonResponse(res, 400, { error: "Phone is required." });
      return true;
    }

    const db = await readDb();
    const orders = (db.orders || [])
      .filter((item) => cleanPhone(item.customer?.phone) === phone)
      .slice(0, 20)
      .map(publicOrder);
    jsonResponse(res, 200, { orders });
    return true;
  }

  if (url.pathname === "/api/customer/dashboard" && req.method === "GET") {
    const phone = cleanPhone(url.searchParams.get("phone"));
    if (!phone) {
      jsonResponse(res, 400, { error: "Phone is required." });
      return true;
    }

    const db = await readDb();
    jsonResponse(res, 200, buildCustomerDashboard(db, phone));
    return true;
  }

  if (url.pathname === "/api/wholesale" && req.method === "POST") {
    const payload = await readBody(req);
    const now = new Date().toISOString();
    const enquiry = {
      id: `BQ${Math.floor(10000 + Math.random() * 90000)}`,
      businessName: text(payload.businessName, 180),
      contactName: text(payload.contactName, 120),
      phone: text(payload.phone, 40),
      email: text(payload.email, 160),
      country: text(payload.country, 120),
      volume: text(payload.volume, 80),
      message: text(payload.message, 800),
      status: "new",
      note: "",
      placedAt: now,
      updatedAt: now,
      history: [
        {
          status: "new",
          note: "Wholesale enquiry submitted from website.",
          at: now
        }
      ]
    };
    const db = await readDb();
    db.wholesale = [enquiry, ...(db.wholesale || [])].slice(0, 500);
    await writeDb(db);
    jsonResponse(res, 201, { enquiry: publicEnquiry(enquiry) });
    return true;
  }

  if (url.pathname === "/api/admin/login" && req.method === "POST") {
    if (!ADMIN_PASSWORD) {
      jsonResponse(res, 503, { error: "Admin password is not configured on the server." });
      return true;
    }

    const payload = await readBody(req);
    if (String(payload.password || "") !== ADMIN_PASSWORD) {
      jsonResponse(res, 401, { error: "Wrong admin password." });
      return true;
    }

    const token = signToken({ role: "admin", expiresAt: Date.now() + TOKEN_TTL_MS });
    jsonResponse(res, 200, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
    return true;
  }

  if (url.pathname === "/api/admin/orders" && req.method === "GET") {
    if (!requireAdmin(req, res)) return true;
    const db = await readDb();
    jsonResponse(res, 200, { orders: (db.orders || []).map(publicOrder) });
    return true;
  }

  if (url.pathname === "/api/admin/summary" && req.method === "GET") {
    if (!requireAdmin(req, res)) return true;
    const db = await readDb();
    jsonResponse(res, 200, { summary: buildAdminSummary(db) });
    return true;
  }

  if (url.pathname === "/api/admin/storage" && req.method === "GET") {
    if (!requireAdmin(req, res)) return true;
    jsonResponse(res, 200, { storage: storageInfo() });
    return true;
  }

  if (url.pathname === "/api/admin/export" && req.method === "GET") {
    if (!requireAdmin(req, res)) return true;
    const type = text(url.searchParams.get("type") || "orders", 40);
    const format = text(url.searchParams.get("format") || "csv", 20);
    const db = await readDb();
    const rows = exportRows(type, db);
    if (format === "json") {
      jsonResponse(res, 200, { type, exportedAt: new Date().toISOString(), rows });
      return true;
    }
    csvResponse(res, `bandevi-${type}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    return true;
  }

  if (url.pathname === "/api/admin/customers" && req.method === "GET") {
    if (!requireAdmin(req, res)) return true;
    const db = await readDb();
    jsonResponse(res, 200, { customers: (db.customers || []).map(adminCustomer) });
    return true;
  }

  const customerMatch = url.pathname.match(/^\/api\/admin\/customers\/([^/]+)$/);
  if (customerMatch && req.method === "PATCH") {
    if (!requireAdmin(req, res)) return true;
    const customerKey = decodeURIComponent(customerMatch[1]);
    const phone = cleanPhone(customerKey);
    const payload = await readBody(req);
    const db = await readDb();
    const customer = (db.customers || []).find((item) => cleanPhone(item.phone) === phone || item.id === customerKey);
    if (!customer) {
      jsonResponse(res, 404, { error: "Customer not found." });
      return true;
    }

    customer.status = text(payload.status || customer.status || "active", 40);
    customer.adminNote = text(payload.adminNote || customer.adminNote, 500);
    customer.tags = Array.isArray(payload.tags)
      ? payload.tags.slice(0, 12).map((tag) => text(tag, 50)).filter(Boolean)
      : text(payload.tags || "", 300)
          .split(",")
          .map((tag) => text(tag, 50))
          .filter(Boolean)
          .slice(0, 12);
    customer.updatedAt = new Date().toISOString();
    await writeDb(db);
    jsonResponse(res, 200, { customer: adminCustomer(customer) });
    return true;
  }

  if (url.pathname === "/api/admin/wholesale" && req.method === "GET") {
    if (!requireAdmin(req, res)) return true;
    const db = await readDb();
    jsonResponse(res, 200, { enquiries: (db.wholesale || []).map(publicEnquiry) });
    return true;
  }

  const wholesaleMatch = url.pathname.match(/^\/api\/admin\/wholesale\/([^/]+)$/);
  if (wholesaleMatch && req.method === "PATCH") {
    if (!requireAdmin(req, res)) return true;
    const enquiryId = cleanOrderId(wholesaleMatch[1]);
    const payload = await readBody(req);
    const nextStatus = text(payload.status, 40) || "new";
    if (!WHOLESALE_STATUSES.has(nextStatus)) {
      jsonResponse(res, 400, { error: "Invalid wholesale status." });
      return true;
    }

    const db = await readDb();
    const enquiry = (db.wholesale || []).find((item) => cleanOrderId(item.id) === enquiryId);
    if (!enquiry) {
      jsonResponse(res, 404, { error: "Wholesale enquiry not found." });
      return true;
    }

    enquiry.status = nextStatus;
    enquiry.note = text(payload.note || enquiry.note, 500);
    enquiry.updatedAt = new Date().toISOString();
    enquiry.history = [
      ...(enquiry.history || []),
      {
        status: nextStatus,
        note: text(payload.note || "Wholesale enquiry updated from admin panel.", 240),
        at: enquiry.updatedAt
      }
    ];
    await writeDb(db);
    jsonResponse(res, 200, { enquiry: publicEnquiry(enquiry) });
    return true;
  }

  const statusMatch = url.pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
  if (statusMatch && req.method === "PATCH") {
    if (!requireAdmin(req, res)) return true;
    const orderId = cleanOrderId(statusMatch[1]);
    const payload = await readBody(req);
    const nextStatus = text(payload.status, 40);
    if (!ORDER_STATUSES.has(nextStatus)) {
      jsonResponse(res, 400, { error: "Invalid order status." });
      return true;
    }

    const db = await readDb();
    const order = (db.orders || []).find((item) => cleanOrderId(item.id) === orderId);
    if (!order) {
      jsonResponse(res, 404, { error: "Order not found." });
      return true;
    }

    order.status = nextStatus;
    order.updatedAt = new Date().toISOString();
    order.paymentState = text(payload.paymentState || order.paymentState || "Payment pending", 80);
    order.courier = text(payload.courier || order.courier, 120);
    order.trackingCode = text(payload.trackingCode || order.trackingCode, 120);
    order.eta = text(payload.eta || order.eta, 80);
    order.adminNote = text(payload.adminNote || order.adminNote, 400);
    order.statusHistory = [
      ...(order.statusHistory || []),
      {
        status: nextStatus,
        note: text(payload.note || "Order details updated from admin panel.", 240),
        at: order.updatedAt
      }
    ];
    upsertCustomer(db, order.customer);
    await writeDb(db);
    jsonResponse(res, 200, { order: publicOrder(order) });
    return true;
  }

  return false;
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const requestedPath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let filePath = resolve(PUBLIC_DIR, `.${requestedPath}`);

  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
    filePath = resolve(PUBLIC_DIR, "index.html");
  }

  const ext = extname(filePath);
  res.writeHead(200, {
    "Content-Type": mimeTypes.get(ext) || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable"
  });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(req, res, url);
      if (!handled) jsonResponse(res, 404, { error: "API route not found." });
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    jsonResponse(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`BandEvi Gourmet server running on port ${PORT}`);
});
