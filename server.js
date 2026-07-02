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
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;
const ORDER_STATUSES = new Set(["booked", "confirmed", "packed", "dispatched", "delivered"]);
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

function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanPhone(value) {
  return text(value, 40).replace(/\D/g, "");
}

function cleanOrderId(value) {
  return text(value, 32).toUpperCase().replace(/[^A-Z0-9-]/g, "");
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
    paymentNote: order.paymentNote,
    totals: order.totals,
    items: order.items,
    statusHistory: order.statusHistory || []
  };
}

async function ensureDb() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) {
    await writeFile(DB_FILE, JSON.stringify({ orders: [], wholesale: [] }, null, 2));
  }
}

async function readDb() {
  await ensureDb();
  try {
    return JSON.parse(await readFile(DB_FILE, "utf8"));
  } catch {
    return { orders: [], wholesale: [] };
  }
}

async function writeDb(db) {
  await ensureDb();
  const tempFile = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempFile, JSON.stringify(db, null, 2));
  await rename(tempFile, DB_FILE);
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
    paymentNote: text(input.paymentNote, 240),
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
      adminConfigured: Boolean(ADMIN_PASSWORD)
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
    await writeDb(db);
    jsonResponse(res, 201, { order: publicOrder(order) });
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

  if (url.pathname === "/api/wholesale" && req.method === "POST") {
    const payload = await readBody(req);
    const enquiry = {
      id: `BQ${Math.floor(10000 + Math.random() * 90000)}`,
      businessName: text(payload.businessName, 180),
      contactName: text(payload.contactName, 120),
      country: text(payload.country, 120),
      volume: text(payload.volume, 80),
      message: text(payload.message, 800),
      placedAt: new Date().toISOString()
    };
    const db = await readDb();
    db.wholesale = [enquiry, ...(db.wholesale || [])].slice(0, 500);
    await writeDb(db);
    jsonResponse(res, 201, { enquiry });
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

  if (url.pathname === "/api/admin/wholesale" && req.method === "GET") {
    if (!requireAdmin(req, res)) return true;
    const db = await readDb();
    jsonResponse(res, 200, { enquiries: db.wholesale || [] });
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
    order.statusHistory = [
      ...(order.statusHistory || []),
      {
        status: nextStatus,
        note: text(payload.note || "Status updated from admin panel.", 240),
        at: order.updatedAt
      }
    ];
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
