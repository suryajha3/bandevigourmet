import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { STORE_CONFIG } from "./store-config.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT || 4175);
const DATA_DIR = resolve(process.env.DATA_DIR || join(__dirname, "server-data"));
const DB_FILE = join(DATA_DIR, "store.json");
const PUBLIC_DIR = resolve(__dirname, "dist");
const PRODUCTS_FILE = join(__dirname, "products.json");
const PRODUCT_DETAILS_FILE = join(__dirname, "product-details.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || ADMIN_PASSWORD || randomUUID();
const CUSTOMER_PIN_SECRET =
  process.env.CUSTOMER_PIN_SECRET || process.env.ADMIN_TOKEN_SECRET || ADMIN_PASSWORD || "bandevi-gourmet-local-customer-pin";
const DATABASE_URL = process.env.DATABASE_URL || "";
const STORAGE_DRIVER = DATABASE_URL ? "postgres" : "json";
const PUBLIC_SITE_URL = (process.env.PUBLIC_SITE_URL || "https://bandevigourmet.com").replace(/\/+$/, "");
const ADMIN_NOTIFICATION_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL || "";
const ADMIN_WHATSAPP_NUMBER = process.env.ADMIN_WHATSAPP_NUMBER || process.env.STORE_WHATSAPP_NUMBER || STORE_CONFIG.whatsappNumber || "";
const NOTIFICATION_FROM_EMAIL = process.env.NOTIFICATION_FROM_EMAIL || ADMIN_NOTIFICATION_EMAIL || "";
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_SECURE = process.env.SMTP_SECURE === "true" || SMTP_PORT === 465;
const ORDER_WEBHOOK_URL = process.env.ORDER_WEBHOOK_URL || "";
const ORDER_WEBHOOK_SECRET = process.env.ORDER_WEBHOOK_SECRET || "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;
const CLOSED_ORDER_STATUSES = new Set(["delivered", "cancelled"]);
const ORDER_STATUSES = new Set(["booked", "confirmed", "packed", "dispatched", "delivered", "cancelled"]);
const WHOLESALE_STATUSES = new Set(["new", "contacted", "quoted", "sample-sent", "converted", "closed"]);
const SUPPORT_STATUSES = new Set(["new", "reviewing", "waiting-customer", "resolved", "closed"]);
const PRODUCT_STOCK_STATUSES = new Set(["in-stock", "low-stock", "out-of-stock", "preorder"]);
const COUPON_TYPES = new Set(["percent", "fixed", "free-delivery"]);
const FREE_DELIVERY_AT = Number(process.env.FREE_DELIVERY_AT || 999);
const DEFAULT_DELIVERY_FEE = Number(process.env.DEFAULT_DELIVERY_FEE || 69);
const DEFAULT_MRP_MULTIPLIERS = {
  makhana: 1.18,
  masala: 1.22,
  poha: 1.16,
  combo: 1.14
};
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

function booleanFlag(value, fallback = false) {
  if (value === undefined || value === null || value === "") return Boolean(fallback);
  return value === true || value === "true" || value === "on" || value === "1" || value === 1;
}

function cleanPhone(value) {
  return text(value, 40).replace(/\D/g, "");
}

function cleanOrderId(value) {
  return text(value, 32).toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function cleanProductId(value) {
  return text(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanCouponCode(value) {
  return text(value, 40)
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
}

function cleanAccessPin(value) {
  return text(value, 20).replace(/\D/g, "").slice(0, 6);
}

function hashCustomerPin(phone, pin) {
  const cleanPin = cleanAccessPin(pin);
  const clean = cleanPhone(phone);
  if (!clean || cleanPin.length < 4) return "";
  return createHmac("sha256", CUSTOMER_PIN_SECRET).update(`${clean}:${cleanPin}`).digest("base64url");
}

function verifyCustomerPin(customer, pin) {
  if (!customer?.accessPinHash) return true;
  const actual = hashCustomerPin(customer.phone, pin);
  if (!actual) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(customer.accessPinHash);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function findCustomerByPhone(db, phone) {
  const clean = cleanPhone(phone);
  if (!clean) return null;
  return (db.customers || []).find((item) => cleanPhone(item.phone) === clean) || null;
}

function notificationId() {
  return `NT${Math.floor(100000 + Math.random() * 900000)}`;
}

function money(value) {
  return `Rs. ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Number(value || 0))}`;
}

function getDefaultMrp(offerPrice, category) {
  const offer = Math.max(0, Number(offerPrice || 0));
  if (!offer) return 0;
  const multiplier = DEFAULT_MRP_MULTIPLIERS[category] || 1.18;
  const rounded = Math.ceil((offer * multiplier) / 10) * 10 - 1;
  return Math.max(offer, rounded);
}

function normalizeProductPricing(input = {}, existing = {}, category = "masala") {
  const offerPrice = Math.max(0, Number(input.offerPrice ?? input.price ?? existing.offerPrice ?? existing.price ?? 0));
  const explicitMrp = Number(input.mrp ?? existing.mrp ?? 0);
  const explicitDiscount = Number(input.discountPrice ?? existing.discountPrice ?? 0);
  const mrp = Math.max(
    offerPrice,
    explicitMrp > 0 ? explicitMrp : explicitDiscount > 0 ? offerPrice + explicitDiscount : getDefaultMrp(offerPrice, category)
  );
  const discountPrice = Math.max(0, mrp - offerPrice);
  const discountPercent = mrp > offerPrice && mrp > 0 ? Math.round((discountPrice / mrp) * 100) : 0;
  return { mrp, offerPrice, discountPrice, discountPercent };
}

function html(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function siteLink(path) {
  return `${PUBLIC_SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function orderTrackingUrl(order) {
  const params = new URLSearchParams({ id: order.id, phone: cleanPhone(order.customer?.phone) });
  return siteLink(`/track.html?${params.toString()}`);
}

function orderConfirmationUrl(order) {
  const params = new URLSearchParams({ id: order.id, phone: cleanPhone(order.customer?.phone) });
  return siteLink(`/confirmation.html?${params.toString()}`);
}

function orderItemsText(order) {
  return (order.items || [])
    .map((item, index) => `${index + 1}. ${item.name} (${item.size || "Pack"}) x ${item.quantity} = ${money(item.lineTotal)}`)
    .join("\n");
}

function whatsappUrl(number, message) {
  const clean = cleanPhone(number);
  if (!clean) return "";
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
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
    trackingUrl: order.trackingUrl,
    dispatchDate: order.dispatchDate,
    eta: order.eta,
    adminNote: order.adminNote,
    coupon: order.coupon || null,
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
    supportCount: Number(customer.supportCount || 0),
    openSupportCount: Number(customer.openSupportCount || 0),
    hasAccountPin: Boolean(customer.accessPinHash),
    tags: Array.isArray(customer.tags) ? customer.tags : []
  };
}

function adminCustomer(customer) {
  return {
    ...publicCustomer(customer),
    adminNote: customer.adminNote || ""
  };
}

function publicSupportRequest(request) {
  return {
    id: request.id,
    orderId: request.orderId,
    phone: request.phone,
    name: request.name,
    email: request.email,
    topic: request.topic,
    message: request.message,
    status: request.status || "new",
    resolutionNote: request.resolutionNote || "",
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    history: request.history || []
  };
}

function adminSupportRequest(request) {
  return {
    ...publicSupportRequest(request),
    internalNote: request.internalNote || ""
  };
}

function publicProduct(product) {
  const pricing = normalizeProductPricing(product, product, product.category || "masala");
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    price: pricing.offerPrice,
    offerPrice: pricing.offerPrice,
    mrp: pricing.mrp,
    discountPrice: pricing.discountPrice,
    discountPercent: pricing.discountPercent,
    size: product.size,
    badge: product.badge,
    rating: Number(product.rating || 0),
    description: product.description,
    image: product.image || "",
    position: product.position || "center",
    fit: product.fit || "contain",
    scale: product.scale || "1",
    featured: product.featured === true,
    active: product.active !== false,
    stock: Number(product.stock ?? 100),
    stockStatus: product.stockStatus || "in-stock",
    lowStockThreshold: Number(product.lowStockThreshold || 10),
    tags: Array.isArray(product.tags) ? product.tags : [],
    details: product.details || {},
    updatedAt: product.updatedAt || ""
  };
}

function adminProduct(product) {
  return {
    ...publicProduct(product),
    adminNote: product.adminNote || ""
  };
}

function defaultCoupons() {
  return [
    normalizeCoupon({
      code: "SPICE10",
      label: "Launch 10% off",
      type: "percent",
      value: 10,
      minSubtotal: 0,
      maxDiscount: 250,
      usageLimit: 0,
      usedCount: 0,
      active: true,
      autoShow: true,
      adminNote: "Default launch coupon for storefront checkout."
    })
  ];
}

function normalizeCoupon(input = {}, existing = {}) {
  const now = new Date().toISOString();
  const requestedType = text(input.type ?? existing.type ?? "percent", 40);
  const type = COUPON_TYPES.has(requestedType) ? requestedType : "percent";
  const rawValue = Number(input.value ?? existing.value ?? (type === "percent" ? 10 : 0));
  const value =
    type === "percent"
      ? Math.max(0, Math.min(90, rawValue || 0))
      : type === "fixed"
        ? Math.max(0, rawValue || 0)
        : 0;
  const code = cleanCouponCode(input.code || existing.code) || "SPICE10";

  return {
    code,
    label: text(input.label ?? existing.label ?? `${code} offer`, 120),
    type,
    value,
    minSubtotal: Math.max(0, Number(input.minSubtotal ?? existing.minSubtotal ?? 0) || 0),
    maxDiscount: Math.max(0, Number(input.maxDiscount ?? existing.maxDiscount ?? 0) || 0),
    usageLimit: Math.max(0, Number(input.usageLimit ?? existing.usageLimit ?? 0) || 0),
    usedCount: Math.max(0, Number(input.usedCount ?? existing.usedCount ?? 0) || 0),
    active: input.active === undefined ? existing.active !== false : booleanFlag(input.active, false),
    autoShow: input.autoShow === undefined ? existing.autoShow === true : booleanFlag(input.autoShow, false),
    startsAt: text(input.startsAt ?? existing.startsAt ?? "", 80),
    endsAt: text(input.endsAt ?? existing.endsAt ?? "", 80),
    adminNote: text(input.adminNote ?? existing.adminNote ?? "", 500),
    createdAt: existing.createdAt || input.createdAt || now,
    updatedAt: now
  };
}

function publicCoupon(coupon) {
  return {
    code: coupon.code,
    label: coupon.label,
    type: coupon.type,
    value: Number(coupon.value || 0),
    minSubtotal: Number(coupon.minSubtotal || 0),
    maxDiscount: Number(coupon.maxDiscount || 0),
    autoShow: coupon.autoShow === true,
    startsAt: coupon.startsAt || "",
    endsAt: coupon.endsAt || ""
  };
}

function adminCoupon(coupon) {
  return {
    ...publicCoupon(coupon),
    active: coupon.active !== false,
    usageLimit: Number(coupon.usageLimit || 0),
    usedCount: Number(coupon.usedCount || 0),
    adminNote: coupon.adminNote || "",
    createdAt: coupon.createdAt || "",
    updatedAt: coupon.updatedAt || ""
  };
}

function listFromInput(value, maxItems = 20, maxLength = 120) {
  const source = Array.isArray(value)
    ? value
    : text(value, 3000)
        .split(/\r?\n|,/)
        .map((item) => item.trim());
  return source.map((item) => text(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

function normalizeProductDetails(input = {}, existing = {}) {
  const source = input && typeof input === "object" ? input : {};
  const prior = existing && typeof existing === "object" ? existing : {};
  return {
    ingredients: listFromInput(source.ingredients ?? prior.ingredients, 40, 100),
    nutrition: listFromInput(source.nutrition ?? prior.nutrition, 20, 120),
    usage: listFromInput(source.usage ?? prior.usage, 20, 120),
    trust: listFromInput(source.trust ?? prior.trust, 12, 120),
    shelfLife: text(source.shelfLife ?? prior.shelfLife ?? "", 220),
    storage: text(source.storage ?? prior.storage ?? "", 260),
    origin: text(source.origin ?? prior.origin ?? "", 260),
    flavorNotes: text(source.flavorNotes ?? prior.flavorNotes ?? "", 260),
    allergen: text(source.allergen ?? prior.allergen ?? "", 260),
    disclaimer: text(source.disclaimer ?? prior.disclaimer ?? "", 420)
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

function publicNotification(notification) {
  return {
    id: notification.id,
    orderId: notification.orderId,
    eventType: notification.eventType,
    audience: notification.audience,
    channel: notification.channel,
    status: notification.status,
    recipient: notification.recipient,
    subject: notification.subject,
    message: notification.message,
    url: notification.url,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
    sentAt: notification.sentAt || "",
    error: notification.error || ""
  };
}

function isClosedOrder(order) {
  return CLOSED_ORDER_STATUSES.has(order.status || "");
}

function emptyDb() {
  return { orders: [], wholesale: [], customers: [], notifications: [], supportRequests: [], products: [], coupons: [], events: [] };
}

function normalizeDb(db) {
  const safeDb = db && typeof db === "object" ? db : {};
  return {
    ...emptyDb(),
    ...safeDb,
    orders: Array.isArray(safeDb.orders) ? safeDb.orders : [],
    wholesale: Array.isArray(safeDb.wholesale) ? safeDb.wholesale : [],
    customers: Array.isArray(safeDb.customers) ? safeDb.customers : [],
    notifications: Array.isArray(safeDb.notifications) ? safeDb.notifications : [],
    supportRequests: Array.isArray(safeDb.supportRequests) ? safeDb.supportRequests : [],
    products: Array.isArray(safeDb.products) ? safeDb.products : [],
    coupons: Array.isArray(safeDb.coupons) ? safeDb.coupons : [],
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
    accessPinHash: text(input.accessPinHash || existing.accessPinHash, 160),
    tags
  };
}

let staticProductsPromise = null;

async function readJsonFile(filePath, fallback) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

async function loadStaticProducts() {
  if (!staticProductsPromise) {
    staticProductsPromise = (async () => {
      const [staticProducts, staticDetails] = await Promise.all([
        readJsonFile(PRODUCTS_FILE, []),
        readJsonFile(PRODUCT_DETAILS_FILE, {})
      ]);
      return Array.isArray(staticProducts)
        ? staticProducts.map((product) =>
            normalizeProduct({
              ...product,
              details: staticDetails[product.id] || product.details || {},
              active: true,
              stock: 100,
              stockStatus: "in-stock",
              lowStockThreshold: 10
            })
          )
        : [];
    })();
  }
  return staticProductsPromise;
}

function normalizeProduct(input = {}, existing = {}) {
  const now = new Date().toISOString();
  const id = cleanProductId(input.id || existing.id || input.name) || `product-${Math.floor(10000 + Math.random() * 90000)}`;
  const stock = Number(input.stock ?? existing.stock ?? 100);
  const lowStockThreshold = Number(input.lowStockThreshold ?? existing.lowStockThreshold ?? 10);
  const requestedStockStatus = input.stockStatus ?? existing.stockStatus;
  const stockStatus = PRODUCT_STOCK_STATUSES.has(requestedStockStatus)
    ? requestedStockStatus
    : stock <= 0
      ? "out-of-stock"
      : stock <= lowStockThreshold
        ? "low-stock"
        : "in-stock";
  const tagsSource = input.tags ?? existing.tags ?? [];
  const tags = Array.isArray(tagsSource)
    ? tagsSource.slice(0, 12).map((tag) => text(tag, 50)).filter(Boolean)
    : text(tagsSource, 300)
        .split(",")
        .map((tag) => text(tag, 50))
        .filter(Boolean)
        .slice(0, 12);
  const category = text(input.category ?? existing.category ?? "masala", 40).toLowerCase();
  const pricing = normalizeProductPricing(input, existing, category);

  return {
    id,
    name: text(input.name ?? existing.name ?? "New product", 160),
    category,
    price: pricing.offerPrice,
    offerPrice: pricing.offerPrice,
    mrp: pricing.mrp,
    discountPrice: pricing.discountPrice,
    discountPercent: pricing.discountPercent,
    size: text(input.size ?? existing.size ?? "100 g", 80),
    badge: text(input.badge ?? existing.badge ?? "Pure", 80),
    rating: Math.max(0, Math.min(5, Number(input.rating ?? existing.rating ?? 4.8))),
    description: text(input.description ?? existing.description ?? "", 420),
    image: text(input.image ?? existing.image ?? "", 2_400_000),
    position: text(input.position ?? existing.position ?? "center", 80),
    fit: text(input.fit ?? existing.fit ?? "contain", 40),
    scale: text(input.scale ?? existing.scale ?? "1", 20),
    featured: booleanFlag(input.featured, existing.featured === true),
    active: input.active === undefined ? existing.active !== false : booleanFlag(input.active, false),
    stock: Number.isFinite(stock) ? Math.max(0, stock) : 0,
    stockStatus,
    lowStockThreshold: Number.isFinite(lowStockThreshold) ? Math.max(0, lowStockThreshold) : 10,
    tags,
    details: normalizeProductDetails(input.details, existing.details),
    adminNote: text(input.adminNote ?? existing.adminNote ?? "", 500),
    createdAt: existing.createdAt || input.createdAt || now,
    updatedAt: now
  };
}

async function ensureManagedProducts(db) {
  if (!Array.isArray(db.products) || !db.products.length) {
    db.products = await loadStaticProducts();
  } else {
    db.products = db.products.map((product) => normalizeProduct(product, product));
  }
  return db.products;
}

function ensureManagedCoupons(db) {
  if (!Array.isArray(db.coupons) || !db.coupons.length) {
    db.coupons = defaultCoupons();
  } else {
    db.coupons = db.coupons.map((coupon) => normalizeCoupon(coupon, coupon));
  }
  return db.coupons;
}

function findCoupon(db, code) {
  const couponCode = cleanCouponCode(code);
  if (!couponCode) return null;
  return ensureManagedCoupons(db).find((coupon) => cleanCouponCode(coupon.code) === couponCode) || null;
}

function dateHasPassed(value, nowTime, direction) {
  const time = Date.parse(value || "");
  if (Number.isNaN(time)) return false;
  return direction === "start" ? nowTime < time : nowTime > time;
}

function couponIsActiveNow(coupon, now = new Date()) {
  if (!coupon || coupon.active === false) return false;
  if (Number(coupon.usageLimit || 0) > 0 && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit || 0)) return false;
  const nowTime = now.getTime();
  if (dateHasPassed(coupon.startsAt, nowTime, "start")) return false;
  if (dateHasPassed(coupon.endsAt, nowTime, "end")) return false;
  return true;
}

function calculateCouponDiscount(coupon, subtotal) {
  const amount = Math.max(0, Number(subtotal || 0));
  if (!coupon || amount < Number(coupon.minSubtotal || 0)) {
    return { discount: 0, freeDelivery: false };
  }
  if (coupon.type === "free-delivery") return { discount: 0, freeDelivery: true };
  const rawDiscount = coupon.type === "fixed" ? Number(coupon.value || 0) : Math.round((amount * Number(coupon.value || 0)) / 100);
  const cappedDiscount = Number(coupon.maxDiscount || 0) > 0 ? Math.min(rawDiscount, Number(coupon.maxDiscount || 0)) : rawDiscount;
  return { discount: Math.max(0, Math.min(amount, Math.round(cappedDiscount))), freeDelivery: false };
}

function couponValidationPayload(coupon, subtotal, delivery = DEFAULT_DELIVERY_FEE) {
  const cleanSubtotal = Math.max(0, Number(subtotal || 0));
  const currentDelivery = Math.max(0, Number(delivery || 0));
  if (!coupon) {
    return { valid: false, message: "Coupon code was not found.", discount: 0, freeDelivery: false };
  }
  if (!couponIsActiveNow(coupon)) {
    return { valid: false, message: "This coupon is not active right now.", discount: 0, freeDelivery: false, coupon: publicCoupon(coupon) };
  }
  const minimum = Number(coupon.minSubtotal || 0);
  if (cleanSubtotal < minimum) {
    return {
      valid: false,
      message: `${money(Math.max(0, minimum - cleanSubtotal))} more needed for this coupon.`,
      discount: 0,
      freeDelivery: false,
      coupon: publicCoupon(coupon)
    };
  }

  const couponValue = calculateCouponDiscount(coupon, cleanSubtotal);
  const deliveryAfterCoupon = couponValue.freeDelivery || cleanSubtotal - couponValue.discount >= FREE_DELIVERY_AT ? 0 : currentDelivery;
  const total = Math.max(0, cleanSubtotal - couponValue.discount + deliveryAfterCoupon);
  return {
    valid: true,
    message: couponValue.freeDelivery ? `${coupon.code} gives free delivery.` : `${coupon.code} applied.`,
    coupon: publicCoupon(coupon),
    discount: couponValue.discount,
    freeDelivery: couponValue.freeDelivery,
    delivery: deliveryAfterCoupon,
    total
  };
}

function applyManagedCouponToOrder(db, order) {
  const subtotal = (order.items || []).reduce((sum, item) => {
    const quantity = Math.max(0, Number(item.quantity || 0));
    const lineTotal = Number(item.lineTotal || 0);
    const fallbackLineTotal = Number(item.offerPrice || item.price || 0) * quantity;
    return sum + Math.max(0, lineTotal || fallbackLineTotal);
  }, 0);
  const requestedCode = cleanCouponCode(order.coupon?.code || order.totals?.couponCode || "");
  const coupon = requestedCode ? findCoupon(db, requestedCode) : null;
  const validation = requestedCode ? couponValidationPayload(coupon, subtotal, DEFAULT_DELIVERY_FEE) : null;
  const discount = validation?.valid ? Number(validation.discount || 0) : 0;
  const delivery = validation?.valid && validation.freeDelivery ? 0 : subtotal === 0 || subtotal - discount >= FREE_DELIVERY_AT ? 0 : DEFAULT_DELIVERY_FEE;

  order.totals = {
    subtotal,
    discount,
    delivery,
    total: Math.max(0, subtotal - discount + delivery)
  };
  order.coupon =
    validation?.valid && coupon
      ? {
          code: coupon.code,
          label: coupon.label,
          type: coupon.type,
          value: Number(coupon.value || 0),
          discount,
          freeDelivery: validation.freeDelivery,
          appliedAt: new Date().toISOString()
        }
      : null;

  return validation?.valid ? coupon : null;
}

function productIsOrderable(product, quantity = 1) {
  if (!product || product.active === false) return false;
  if (product.stockStatus === "out-of-stock") return false;
  if (product.stockStatus === "preorder") return true;
  return Number(product.stock ?? 0) >= quantity;
}

function validateOrderStock(order, products) {
  for (const item of order.items || []) {
    const product = products.find((candidate) => candidate.id === item.id);
    if (!product || !productIsOrderable(product, Number(item.quantity || 0))) {
      return `${item.name || item.id} is not available for the requested quantity.`;
    }
  }
  return "";
}

function reserveOrderStock(order, products) {
  (order.items || []).forEach((item) => {
    const product = products.find((candidate) => candidate.id === item.id);
    if (!product || product.stockStatus === "preorder") return;
    const nextStock = Math.max(0, Number(product.stock || 0) - Number(item.quantity || 0));
    product.stock = nextStock;
    if (nextStock <= 0) product.stockStatus = "out-of-stock";
    else if (nextStock <= Number(product.lowStockThreshold || 10)) product.stockStatus = "low-stock";
    else product.stockStatus = "in-stock";
    product.updatedAt = new Date().toISOString();
  });
}

function upsertCustomer(db, input = {}) {
  const phone = cleanPhone(input.phone);
  if (!phone) return null;

  db.customers = Array.isArray(db.customers) ? db.customers : [];
  const existingIndex = db.customers.findIndex((item) => cleanPhone(item.phone) === phone);
  const existing = existingIndex >= 0 ? db.customers[existingIndex] : {};
  const nextInput = { ...existing, ...input, phone };
  const accountPin = cleanAccessPin(input.accountPin || input.pin);
  if (accountPin.length >= 4) nextInput.accessPinHash = hashCustomerPin(phone, accountPin);
  const customer = normalizeCustomer(nextInput, existing);
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
  const supportRequests = (db.supportRequests || [])
    .filter((item) => cleanPhone(item.phone) === clean)
    .slice(0, 20)
    .map(publicSupportRequest);
  const customer =
    (db.customers || []).find((item) => cleanPhone(item.phone) === clean) ||
    (orders[0]?.customer ? normalizeCustomer({ ...orders[0].customer, phone: clean, lastOrderAt: orders[0].placedAt }) : null);
  const activeOrders = orders.filter((order) => !isClosedOrder(order)).length;
  const openSupportRequests = supportRequests.filter((item) => !["resolved", "closed"].includes(item.status || "")).length;

  return {
    customer: customer ? publicCustomer(customer) : null,
    orders,
    enquiries,
    supportRequests,
    summary: {
      totalOrders: orders.length,
      activeOrders,
      deliveredOrders: orders.filter((order) => order.status === "delivered").length,
      closedOrders: orders.filter((order) => isClosedOrder(order)).length,
      totalSpend: orders.reduce((sum, order) => sum + Number(order.totals?.total || 0), 0),
      wholesaleEnquiries: enquiries.length,
      supportRequests: supportRequests.length,
      openSupportRequests,
      latestStatus: orders[0]?.status || "",
      latestOrderId: orders[0]?.id || "",
      nextAction: orders[0] ? getCustomerNextAction(orders[0]) : "Place a booking to start order tracking."
    }
  };
}

function getCustomerNextAction(order) {
  const status = order?.status || "booked";
  const messages = {
    booked: "Seller confirmation and stock check are pending.",
    confirmed: "Order is confirmed and will move to packing.",
    packed: "Packing is complete. Dispatch details are the next update.",
    dispatched: "Order is on the way. Watch courier and ETA updates.",
    delivered: "Order is delivered. Repeat order or raise support if needed.",
    cancelled: "Order is cancelled. Contact support for refund or replacement review."
  };
  return messages[status] || messages.booked;
}

function buildAdminSummary(db) {
  const orders = db.orders || [];
  const enquiries = db.wholesale || [];
  const notifications = db.notifications || [];
  const supportRequests = db.supportRequests || [];
  const products = db.products || [];
  const coupons = db.coupons || [];
  const activeOrders = orders.filter((order) => !isClosedOrder(order));
  const openWholesale = enquiries.filter((item) => !["converted", "closed"].includes(item.status || "new"));
  const pendingNotifications = notifications.filter((item) => ["queued", "ready", "failed"].includes(item.status || "")).length;
  const openSupportRequests = supportRequests.filter((item) => !["resolved", "closed"].includes(item.status || "")).length;

  return {
    totalOrders: orders.length,
    activeOrders: activeOrders.length,
    deliveredOrders: orders.filter((order) => order.status === "delivered").length,
    closedOrders: orders.filter((order) => isClosedOrder(order)).length,
    bookingValue: orders.reduce((sum, order) => sum + Number(order.totals?.total || 0), 0),
    customers: (db.customers || []).length,
    wholesaleEnquiries: enquiries.length,
    supportRequests: supportRequests.length,
    openSupportRequests,
    products: products.length,
    activeProducts: products.filter((product) => product.active !== false).length,
    featuredProducts: products.filter((product) => product.featured === true).length,
    missingImageProducts: products.filter((product) => !product.image).length,
    lowStockProducts: products.filter((product) => ["low-stock", "out-of-stock"].includes(product.stockStatus || "")).length,
    coupons: coupons.length,
    activeCoupons: coupons.filter((coupon) => couponIsActiveNow(coupon)).length,
    visibleCoupons: coupons.filter((coupon) => coupon.autoShow === true && couponIsActiveNow(coupon)).length,
    notifications: notifications.length,
    pendingNotifications,
    openWholesale: openWholesale.length,
    lastOrderAt: orders[0]?.updatedAt || orders[0]?.placedAt || "",
    countries: [...new Set(orders.map((order) => text(order.countryCity, 80)).filter(Boolean))].slice(0, 12)
  };
}

function notificationConfig() {
  return {
    smtpConfigured: Boolean(SMTP_HOST && NOTIFICATION_FROM_EMAIL),
    adminEmailConfigured: Boolean(ADMIN_NOTIFICATION_EMAIL),
    adminWhatsAppConfigured: Boolean(cleanPhone(ADMIN_WHATSAPP_NUMBER)),
    webhookConfigured: Boolean(ORDER_WEBHOOK_URL)
  };
}

function buildCustomerNotificationMessage(order, eventType) {
  const name = order.customer?.name || "Customer";
  const title =
    eventType === "status_updated"
      ? `Your ${STORE_CONFIG.shopName} booking ${order.id} is now ${order.status}.`
      : `Your ${STORE_CONFIG.shopName} booking ${order.id} has been received.`;

  return [
    `Hi ${name},`,
    title,
    "",
    `Total: ${money(order.totals?.total)}`,
    `Payment: ${order.paymentState || order.payment || "To be confirmed"}`,
    `Delivery location: ${order.countryCity || order.customer?.location || "To be confirmed"}`,
    order.dispatchDate ? `Dispatch date: ${order.dispatchDate}` : "",
    order.courier ? `Courier: ${order.courier}` : "",
    order.trackingCode ? `Tracking code: ${order.trackingCode}` : "",
    order.trackingUrl ? `Courier tracking: ${order.trackingUrl}` : "",
    "",
    "Items:",
    orderItemsText(order) || "Product details will be confirmed by our order desk.",
    "",
    `Track order: ${orderTrackingUrl(order)}`,
    `Confirmation page: ${orderConfirmationUrl(order)}`,
    "",
    "Thank you for choosing BandEvi Gourmet."
  ].join("\n");
}

function buildAdminNotificationMessage(order, eventType) {
  const heading = eventType === "status_updated" ? "Order status updated" : "New website order";

  return [
    `${heading}: ${order.id}`,
    "",
    `Customer: ${order.customer?.name || "No name"}`,
    `Phone: ${order.customer?.phone || "No phone"}`,
    `Email: ${order.customer?.email || "No email"}`,
    `Location: ${order.countryCity || "Not added"}`,
    `Address: ${order.address || "Not added"}`,
    "",
    `Status: ${order.status}`,
    `Payment: ${order.paymentState || order.payment || "To be confirmed"}`,
    `Total: ${money(order.totals?.total)}`,
    order.dispatchDate ? `Dispatch date: ${order.dispatchDate}` : "",
    order.courier ? `Courier: ${order.courier}` : "",
    order.trackingCode ? `Tracking code: ${order.trackingCode}` : "",
    order.trackingUrl ? `Courier tracking: ${order.trackingUrl}` : "",
    "",
    "Items:",
    orderItemsText(order) || "No item details",
    "",
    `Admin order desk: ${siteLink("/admin.html")}`,
    `Customer tracking: ${orderTrackingUrl(order)}`
  ].join("\n");
}

function emailHtml(message) {
  return `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1c2521;white-space:pre-line">${html(message)}</div>`;
}

function mailtoUrl(recipient, subject, message) {
  if (!recipient) return "";
  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}

function createNotification({ order, eventType, audience, channel, recipient, subject, message, url, status = "ready" }) {
  const now = new Date().toISOString();
  return {
    id: notificationId(),
    orderId: order.id,
    eventType,
    audience,
    channel,
    status,
    recipient: text(recipient, 240),
    subject: text(subject, 240),
    message: text(message, 3000),
    url: text(url, 3000),
    createdAt: now,
    updatedAt: now,
    sentAt: "",
    error: ""
  };
}

function buildSupportNotificationMessage(request, order = null) {
  return [
    `Support request: ${request.id}`,
    "",
    `Topic: ${request.topic || "Order support"}`,
    `Status: ${request.status || "new"}`,
    `Order ID: ${request.orderId || "General account support"}`,
    `Customer: ${request.name || order?.customer?.name || "Customer"}`,
    `Phone: ${request.phone || order?.customer?.phone || "No phone"}`,
    `Email: ${request.email || order?.customer?.email || "No email"}`,
    order ? `Order total: ${money(order.totals?.total)}` : "",
    "",
    "Message:",
    request.message || "No message added.",
    "",
    request.orderId ? `Track order: ${orderTrackingUrl(order || { id: request.orderId, customer: { phone: request.phone } })}` : "",
    "Review this request in the BandEvi Gourmet admin panel."
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function createSupportNotifications(request, order = null) {
  const pseudoOrder = order || { id: request.orderId || request.id, customer: { phone: request.phone } };
  const subject = `${STORE_CONFIG.shopName} support request ${request.id}`;
  const message = buildSupportNotificationMessage(request, order);
  const notifications = [];

  if (cleanPhone(ADMIN_WHATSAPP_NUMBER)) {
    notifications.push(
      createNotification({
        order: pseudoOrder,
        eventType: "support_request",
        audience: "admin",
        channel: "whatsapp",
        recipient: ADMIN_WHATSAPP_NUMBER,
        subject,
        message,
        url: whatsappUrl(ADMIN_WHATSAPP_NUMBER, message)
      })
    );
  }

  if (ADMIN_NOTIFICATION_EMAIL) {
    notifications.push(
      createNotification({
        order: pseudoOrder,
        eventType: "support_request",
        audience: "admin",
        channel: "email",
        recipient: ADMIN_NOTIFICATION_EMAIL,
        subject,
        message,
        url: mailtoUrl(ADMIN_NOTIFICATION_EMAIL, subject, message),
        status: SMTP_HOST && NOTIFICATION_FROM_EMAIL ? "queued" : "ready"
      })
    );
  }

  return notifications;
}

function createOrderNotifications(order, eventType = "order_created") {
  const customerSubject =
    eventType === "status_updated"
      ? `${STORE_CONFIG.shopName} booking ${order.id} status update`
      : `${STORE_CONFIG.shopName} booking ${order.id} confirmation`;
  const adminSubject =
    eventType === "status_updated"
      ? `${STORE_CONFIG.shopName} order ${order.id} updated`
      : `New ${STORE_CONFIG.shopName} order ${order.id}`;
  const customerMessage = buildCustomerNotificationMessage(order, eventType);
  const adminMessage = buildAdminNotificationMessage(order, eventType);
  const notifications = [];

  if (cleanPhone(order.customer?.phone)) {
    notifications.push(
      createNotification({
        order,
        eventType,
        audience: "customer",
        channel: "whatsapp",
        recipient: order.customer.phone,
        subject: customerSubject,
        message: customerMessage,
        url: whatsappUrl(order.customer.phone, customerMessage)
      })
    );
  }

  if (order.customer?.email) {
    notifications.push(
      createNotification({
        order,
        eventType,
        audience: "customer",
        channel: "email",
        recipient: order.customer.email,
        subject: customerSubject,
        message: customerMessage,
        url: mailtoUrl(order.customer.email, customerSubject, customerMessage),
        status: SMTP_HOST && NOTIFICATION_FROM_EMAIL ? "queued" : "ready"
      })
    );
  }

  if (cleanPhone(ADMIN_WHATSAPP_NUMBER)) {
    notifications.push(
      createNotification({
        order,
        eventType,
        audience: "admin",
        channel: "whatsapp",
        recipient: ADMIN_WHATSAPP_NUMBER,
        subject: adminSubject,
        message: adminMessage,
        url: whatsappUrl(ADMIN_WHATSAPP_NUMBER, adminMessage)
      })
    );
  }

  if (ADMIN_NOTIFICATION_EMAIL) {
    notifications.push(
      createNotification({
        order,
        eventType,
        audience: "admin",
        channel: "email",
        recipient: ADMIN_NOTIFICATION_EMAIL,
        subject: adminSubject,
        message: adminMessage,
        url: mailtoUrl(ADMIN_NOTIFICATION_EMAIL, adminSubject, adminMessage),
        status: SMTP_HOST && NOTIFICATION_FROM_EMAIL ? "queued" : "ready"
      })
    );
  }

  if (ORDER_WEBHOOK_URL) {
    notifications.push(
      createNotification({
        order,
        eventType,
        audience: "automation",
        channel: "webhook",
        recipient: "ORDER_WEBHOOK_URL",
        subject: adminSubject,
        message: adminMessage,
        url: ORDER_WEBHOOK_URL,
        status: "queued"
      })
    );
  }

  return notifications;
}

let mailerPromise = null;

async function getMailer() {
  if (!mailerPromise) {
    mailerPromise = (async () => {
      const nodemailerModule = await import("nodemailer");
      const nodemailer = nodemailerModule.default || nodemailerModule;
      return nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: SMTP_USER || SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
        connectionTimeout: 6000,
        greetingTimeout: 6000,
        socketTimeout: 8000
      });
    })();
  }
  return mailerPromise;
}

async function sendNotificationEmail(notification) {
  if (!SMTP_HOST || !NOTIFICATION_FROM_EMAIL) {
    notification.status = "ready";
    notification.error = "SMTP not configured. Use the email link or add SMTP settings.";
    return;
  }

  const mailer = await getMailer();
  await mailer.sendMail({
    from: NOTIFICATION_FROM_EMAIL,
    to: notification.recipient,
    subject: notification.subject,
    text: notification.message,
    html: emailHtml(notification.message)
  });
  notification.status = "sent";
  notification.sentAt = new Date().toISOString();
  notification.error = "";
}

async function postNotificationWebhook(notification, order) {
  if (!ORDER_WEBHOOK_URL) {
    notification.status = "ready";
    notification.error = "Webhook not configured.";
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const headers = {
      "Content-Type": "application/json",
      ...(ORDER_WEBHOOK_SECRET ? { Authorization: `Bearer ${ORDER_WEBHOOK_SECRET}` } : {})
    };
    const response = await fetch(ORDER_WEBHOOK_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        eventType: notification.eventType,
        notification: publicNotification(notification),
        order: publicOrder(order)
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
    notification.status = "sent";
    notification.sentAt = new Date().toISOString();
    notification.error = "";
  } finally {
    clearTimeout(timer);
  }
}

async function dispatchNotifications(notifications, order) {
  for (const notification of notifications) {
    if (!["queued", "failed"].includes(notification.status)) continue;
    try {
      if (notification.channel === "email") await sendNotificationEmail(notification);
      if (notification.channel === "webhook") await postNotificationWebhook(notification, order);
    } catch (error) {
      notification.status = "failed";
      notification.error = text(error.message || "Notification failed", 300);
    }
    notification.updatedAt = new Date().toISOString();
  }
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
    subtotal: order.totals?.subtotal || 0,
    discount: order.totals?.discount || 0,
    delivery: order.totals?.delivery || 0,
    total: order.totals?.total || 0,
    couponCode: order.coupon?.code || "",
    couponDiscount: order.coupon?.discount || 0,
    payment: order.payment || "",
    paymentState: order.paymentState || "",
    courier: order.courier || "",
    trackingCode: order.trackingCode || "",
    trackingUrl: order.trackingUrl || "",
    dispatchDate: order.dispatchDate || "",
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

function notificationExportRows(db) {
  return (db.notifications || []).map((notification) => ({
    id: notification.id,
    orderId: notification.orderId || "",
    eventType: notification.eventType || "",
    audience: notification.audience || "",
    channel: notification.channel || "",
    status: notification.status || "",
    recipient: notification.recipient || "",
    subject: notification.subject || "",
    createdAt: notification.createdAt || "",
    updatedAt: notification.updatedAt || "",
    sentAt: notification.sentAt || "",
    error: notification.error || ""
  }));
}

function supportExportRows(db) {
  return (db.supportRequests || []).map((request) => ({
    id: request.id,
    orderId: request.orderId || "",
    status: request.status || "",
    topic: request.topic || "",
    name: request.name || "",
    phone: request.phone || "",
    email: request.email || "",
    message: request.message || "",
    resolutionNote: request.resolutionNote || "",
    internalNote: request.internalNote || "",
    createdAt: request.createdAt || "",
    updatedAt: request.updatedAt || ""
  }));
}

function productExportRows(db) {
  return (db.products || []).map((product) => ({
    id: product.id,
    name: product.name || "",
    category: product.category || "",
    mrp: product.mrp || 0,
    offerPrice: product.offerPrice || product.price || 0,
    discountPrice: product.discountPrice || 0,
    discountPercent: product.discountPercent || 0,
    price: product.price || 0,
    size: product.size || "",
    badge: product.badge || "",
    featured: product.featured === true,
    active: product.active !== false,
    stock: product.stock ?? 0,
    stockStatus: product.stockStatus || "",
    lowStockThreshold: product.lowStockThreshold || 0,
    image: product.image?.startsWith("data:image/") ? "uploaded image" : product.image || "",
    ingredients: (product.details?.ingredients || []).join("; "),
    shelfLife: product.details?.shelfLife || "",
    storage: product.details?.storage || "",
    allergen: product.details?.allergen || "",
    tags: (product.tags || []).join("; "),
    updatedAt: product.updatedAt || ""
  }));
}

function couponExportRows(db) {
  return (db.coupons || []).map((coupon) => ({
    code: coupon.code,
    label: coupon.label || "",
    type: coupon.type || "",
    value: coupon.value || 0,
    minSubtotal: coupon.minSubtotal || 0,
    maxDiscount: coupon.maxDiscount || 0,
    active: coupon.active !== false,
    autoShow: coupon.autoShow === true,
    usageLimit: coupon.usageLimit || 0,
    usedCount: coupon.usedCount || 0,
    startsAt: coupon.startsAt || "",
    endsAt: coupon.endsAt || "",
    adminNote: coupon.adminNote || "",
    updatedAt: coupon.updatedAt || ""
  }));
}

function exportRows(type, db) {
  if (type === "customers") return customerExportRows(db);
  if (type === "wholesale") return wholesaleExportRows(db);
  if (type === "notifications") return notificationExportRows(db);
  if (type === "support") return supportExportRows(db);
  if (type === "products") return productExportRows(db);
  if (type === "coupons") return couponExportRows(db);
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
      if (body.length > 4_000_000) {
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
    trackingUrl: text(input.trackingUrl, 500),
    dispatchDate: text(input.dispatchDate, 80),
    eta: text(input.eta, 80),
    adminNote: text(input.adminNote, 400),
    coupon: input.coupon
      ? {
          code: cleanCouponCode(input.coupon.code),
          label: text(input.coupon.label, 120),
          type: text(input.coupon.type, 40),
          value: Number(input.coupon.value || 0),
          discount: Number(input.coupon.discount || 0),
          freeDelivery: input.coupon.freeDelivery === true
        }
      : null,
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
      offerPrice: Number(item.offerPrice || item.price || 0),
      mrp: Number(item.mrp || item.price || 0),
      discountPrice: Number(item.discountPrice || 0),
      discountPercent: Number(item.discountPercent || 0),
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

  if (url.pathname === "/api/products" && req.method === "GET") {
    const db = await readDb();
    const shouldPersist = !Array.isArray(db.products) || !db.products.length;
    const products = await ensureManagedProducts(db);
    if (shouldPersist) await writeDb(db);
    jsonResponse(res, 200, { products: products.filter((product) => product.active !== false).map(publicProduct) });
    return true;
  }

  if (url.pathname === "/api/coupons" && req.method === "GET") {
    const db = await readDb();
    const shouldPersist = !Array.isArray(db.coupons) || !db.coupons.length;
    const coupons = ensureManagedCoupons(db);
    if (shouldPersist) await writeDb(db);
    jsonResponse(res, 200, {
      coupons: coupons.filter((coupon) => coupon.autoShow === true && couponIsActiveNow(coupon)).map(publicCoupon)
    });
    return true;
  }

  if (url.pathname === "/api/coupons/validate" && req.method === "POST") {
    const payload = await readBody(req);
    const db = await readDb();
    const shouldPersist = !Array.isArray(db.coupons) || !db.coupons.length;
    const coupon = findCoupon(db, payload.code);
    if (shouldPersist) await writeDb(db);
    jsonResponse(
      res,
      200,
      couponValidationPayload(coupon, Number(payload.subtotal || 0), Number(payload.delivery || DEFAULT_DELIVERY_FEE))
    );
    return true;
  }

  if (url.pathname === "/api/auth/config" && req.method === "GET") {
    jsonResponse(res, 200, { googleClientId: GOOGLE_CLIENT_ID });
    return true;
  }

  if (url.pathname === "/api/auth/google" && req.method === "POST") {
    if (!GOOGLE_CLIENT_ID) {
      jsonResponse(res, 400, { error: "Google login is not configured yet." });
      return true;
    }

    const payload = await readBody(req);
    const credential = text(payload.credential, 5000);
    if (!credential) {
      jsonResponse(res, 400, { error: "Google credential is required." });
      return true;
    }

    try {
      const tokenResponse = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
      );
      const tokenInfo = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || tokenInfo.aud !== GOOGLE_CLIENT_ID) {
        jsonResponse(res, 401, { error: "Google login could not be verified." });
        return true;
      }

      jsonResponse(res, 200, {
        profile: {
          name: text(tokenInfo.name, 120),
          email: text(tokenInfo.email, 160),
          picture: text(tokenInfo.picture, 300),
          emailVerified: tokenInfo.email_verified === true || tokenInfo.email_verified === "true",
          googleSub: text(tokenInfo.sub, 120)
        }
      });
      return true;
    } catch {
      jsonResponse(res, 502, { error: "Google login verification is temporarily unavailable." });
      return true;
    }
  }

  if (url.pathname === "/api/orders" && req.method === "POST") {
    const payload = await readBody(req);
    const order = normalizeOrder(payload);
    if (!order.customer.phone || !order.items.length) {
      jsonResponse(res, 400, { error: "Phone and at least one item are required." });
      return true;
    }

    const db = await readDb();
    const existingOrder = (db.orders || []).find((item) => cleanOrderId(item.id) === cleanOrderId(order.id));
    if (existingOrder) {
      if (cleanPhone(existingOrder.customer?.phone) !== cleanPhone(order.customer?.phone)) {
        jsonResponse(res, 409, { error: "This booking ID is already connected with another customer." });
        return true;
      }

      jsonResponse(res, 200, {
        order: publicOrder(existingOrder),
        duplicate: true,
        notifications: []
      });
      return true;
    }

    const products = await ensureManagedProducts(db);
    const appliedCoupon = applyManagedCouponToOrder(db, order);
    const stockError = validateOrderStock(order, products);
    if (stockError) {
      jsonResponse(res, 409, { error: stockError });
      return true;
    }
    reserveOrderStock(order, products);
    if (appliedCoupon) {
      appliedCoupon.usedCount = Number(appliedCoupon.usedCount || 0) + 1;
      appliedCoupon.updatedAt = new Date().toISOString();
    }
    db.orders = [order, ...(db.orders || []).filter((item) => item.id !== order.id)].slice(0, 1000);
    upsertCustomer(db, order.customer);
    const notifications = createOrderNotifications(order, "order_created");
    await dispatchNotifications(notifications, order);
    db.notifications = [...notifications, ...(db.notifications || [])].slice(0, 2000);
    db.events = [
      { id: randomUUID(), type: "order_created", ref: order.id, at: order.updatedAt },
      ...(db.events || [])
    ].slice(0, 1000);
    await writeDb(db);
    jsonResponse(res, 201, {
      order: publicOrder(order),
      notifications: notifications.map(publicNotification)
    });
    return true;
  }

  if (url.pathname === "/api/customers" && req.method === "POST") {
    const payload = await readBody(req);
    const db = await readDb();
    const existingCustomer = findCustomerByPhone(db, payload.phone);
    if (existingCustomer?.accessPinHash && !verifyCustomerPin(existingCustomer, payload.accountPin || payload.pin)) {
      jsonResponse(res, 401, { error: "Account PIN is required for this customer profile." });
      return true;
    }

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
    const customer = findCustomerByPhone(db, phone);
    if (customer?.accessPinHash && !verifyCustomerPin(customer, url.searchParams.get("pin"))) {
      jsonResponse(res, 401, { error: "Account PIN is required to view order history." });
      return true;
    }

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
    const customer = findCustomerByPhone(db, phone);
    if (customer?.accessPinHash && !verifyCustomerPin(customer, url.searchParams.get("pin"))) {
      jsonResponse(res, 401, { error: "Account PIN is required to open this dashboard." });
      return true;
    }

    jsonResponse(res, 200, buildCustomerDashboard(db, phone));
    return true;
  }

  if (url.pathname === "/api/customer/support" && req.method === "POST") {
    const payload = await readBody(req);
    const phone = cleanPhone(payload.phone);
    const orderId = cleanOrderId(payload.orderId);
    const message = text(payload.message, 1200);
    const topic = text(payload.topic || "Order support", 80);
    if (!phone || !message) {
      jsonResponse(res, 400, { error: "Phone and message are required." });
      return true;
    }

    const db = await readDb();
    const order = orderId
      ? (db.orders || []).find((item) => cleanOrderId(item.id) === orderId && cleanPhone(item.customer?.phone) === phone)
      : null;
    if (orderId && !order) {
      jsonResponse(res, 404, { error: "No matching booking found for this support request." });
      return true;
    }

    const customer = findCustomerByPhone(db, phone);
    const now = new Date().toISOString();
    const supportRequest = {
      id: `SR${Math.floor(100000 + Math.random() * 900000)}`,
      orderId: order?.id || orderId || "",
      phone,
      name: text(payload.name || order?.customer?.name || customer?.name || "Customer", 120),
      email: text(payload.email || order?.customer?.email || customer?.email || "", 160),
      topic,
      message,
      status: "new",
      resolutionNote: "",
      internalNote: "",
      createdAt: now,
      updatedAt: now,
      history: [
        {
          status: "new",
          note: "Support request submitted from customer portal.",
          at: now
        }
      ]
    };

    db.supportRequests = [supportRequest, ...(db.supportRequests || [])].slice(0, 1000);
    db.events = [
      { id: randomUUID(), type: "support_request", ref: supportRequest.id, at: now },
      ...(db.events || [])
    ].slice(0, 1000);
    const notifications = createSupportNotifications(supportRequest, order);
    await dispatchNotifications(notifications, order || { id: supportRequest.orderId || supportRequest.id, customer: { phone } });
    db.notifications = [...notifications, ...(db.notifications || [])].slice(0, 2000);
    await writeDb(db);
    jsonResponse(res, 201, {
      supportRequest: publicSupportRequest(supportRequest),
      notifications: notifications.map(publicNotification)
    });
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
    const shouldPersist = !Array.isArray(db.products) || !db.products.length || !Array.isArray(db.coupons) || !db.coupons.length;
    await ensureManagedProducts(db);
    ensureManagedCoupons(db);
    if (shouldPersist) await writeDb(db);
    jsonResponse(res, 200, { summary: buildAdminSummary(db) });
    return true;
  }

  if (url.pathname === "/api/admin/storage" && req.method === "GET") {
    if (!requireAdmin(req, res)) return true;
    jsonResponse(res, 200, { storage: { ...storageInfo(), notifications: notificationConfig() } });
    return true;
  }

  if (url.pathname === "/api/admin/notifications" && req.method === "GET") {
    if (!requireAdmin(req, res)) return true;
    const db = await readDb();
    const notifications = (db.notifications || []).slice(0, 100).map(publicNotification);
    jsonResponse(res, 200, { notifications, config: notificationConfig() });
    return true;
  }

  if (url.pathname === "/api/admin/export" && req.method === "GET") {
    if (!requireAdmin(req, res)) return true;
    const type = text(url.searchParams.get("type") || "orders", 40);
    const format = text(url.searchParams.get("format") || "csv", 20);
    const db = await readDb();
    if (type === "products") await ensureManagedProducts(db);
    if (type === "coupons") ensureManagedCoupons(db);
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
    jsonResponse(res, 200, {
      customers: (db.customers || []).map((customer) => {
        const phone = cleanPhone(customer.phone);
        const supportRequests = (db.supportRequests || []).filter((item) => cleanPhone(item.phone) === phone);
        return adminCustomer({
          ...customer,
          supportCount: supportRequests.length,
          openSupportCount: supportRequests.filter((item) => !["resolved", "closed"].includes(item.status || "")).length
        });
      })
    });
    return true;
  }

  if (url.pathname === "/api/admin/products" && req.method === "GET") {
    if (!requireAdmin(req, res)) return true;
    const db = await readDb();
    const shouldPersist = !Array.isArray(db.products) || !db.products.length;
    const products = await ensureManagedProducts(db);
    if (shouldPersist) await writeDb(db);
    jsonResponse(res, 200, { products: products.map(adminProduct) });
    return true;
  }

  if (url.pathname === "/api/admin/coupons" && req.method === "GET") {
    if (!requireAdmin(req, res)) return true;
    const db = await readDb();
    const shouldPersist = !Array.isArray(db.coupons) || !db.coupons.length;
    const coupons = ensureManagedCoupons(db);
    if (shouldPersist) await writeDb(db);
    jsonResponse(res, 200, { coupons: coupons.map(adminCoupon) });
    return true;
  }

  if (url.pathname === "/api/admin/coupons" && req.method === "POST") {
    if (!requireAdmin(req, res)) return true;
    const payload = await readBody(req);
    const db = await readDb();
    const coupons = ensureManagedCoupons(db);
    const code = cleanCouponCode(payload.code || payload.label);
    if (!code) {
      jsonResponse(res, 400, { error: "Coupon code is required." });
      return true;
    }
    if (coupons.some((coupon) => cleanCouponCode(coupon.code) === code)) {
      jsonResponse(res, 409, { error: "Use a unique coupon code." });
      return true;
    }

    const coupon = normalizeCoupon({ ...payload, code });
    db.coupons = [coupon, ...coupons].slice(0, 200);
    await writeDb(db);
    jsonResponse(res, 201, { coupon: adminCoupon(coupon) });
    return true;
  }

  if (url.pathname === "/api/admin/products" && req.method === "POST") {
    if (!requireAdmin(req, res)) return true;
    const payload = await readBody(req);
    const db = await readDb();
    const products = await ensureManagedProducts(db);
    const productId = cleanProductId(payload.id || payload.name);
    if (!productId || products.some((product) => product.id === productId)) {
      jsonResponse(res, 409, { error: "Use a unique product name or product ID." });
      return true;
    }

    const product = normalizeProduct({ ...payload, id: productId });
    db.products = [product, ...products].slice(0, 1000);
    await writeDb(db);
    jsonResponse(res, 201, { product: adminProduct(product) });
    return true;
  }

  const productMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
  if (productMatch && req.method === "PATCH") {
    if (!requireAdmin(req, res)) return true;
    const productId = cleanProductId(decodeURIComponent(productMatch[1]));
    const payload = await readBody(req);
    const db = await readDb();
    const products = await ensureManagedProducts(db);
    const index = products.findIndex((product) => product.id === productId);
    if (index < 0) {
      jsonResponse(res, 404, { error: "Product not found." });
      return true;
    }

    const product = normalizeProduct({ ...products[index], ...payload, id: productId }, products[index]);
    db.products = products.map((item, itemIndex) => (itemIndex === index ? product : item));
    await writeDb(db);
    jsonResponse(res, 200, { product: adminProduct(product) });
    return true;
  }

  const couponMatch = url.pathname.match(/^\/api\/admin\/coupons\/([^/]+)$/);
  if (couponMatch && req.method === "PATCH") {
    if (!requireAdmin(req, res)) return true;
    const couponCode = cleanCouponCode(decodeURIComponent(couponMatch[1]));
    const payload = await readBody(req);
    const db = await readDb();
    const coupons = ensureManagedCoupons(db);
    const index = coupons.findIndex((coupon) => cleanCouponCode(coupon.code) === couponCode);
    if (index < 0) {
      jsonResponse(res, 404, { error: "Coupon not found." });
      return true;
    }

    const coupon = normalizeCoupon({ ...coupons[index], ...payload, code: couponCode }, coupons[index]);
    db.coupons = coupons.map((item, itemIndex) => (itemIndex === index ? coupon : item));
    await writeDb(db);
    jsonResponse(res, 200, { coupon: adminCoupon(coupon) });
    return true;
  }

  if (url.pathname === "/api/admin/support" && req.method === "GET") {
    if (!requireAdmin(req, res)) return true;
    const db = await readDb();
    jsonResponse(res, 200, { supportRequests: (db.supportRequests || []).map(adminSupportRequest) });
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

  const supportMatch = url.pathname.match(/^\/api\/admin\/support\/([^/]+)$/);
  if (supportMatch && req.method === "PATCH") {
    if (!requireAdmin(req, res)) return true;
    const supportId = cleanOrderId(supportMatch[1]);
    const payload = await readBody(req);
    const nextStatus = text(payload.status, 40) || "reviewing";
    if (!SUPPORT_STATUSES.has(nextStatus)) {
      jsonResponse(res, 400, { error: "Invalid support status." });
      return true;
    }

    const db = await readDb();
    const request = (db.supportRequests || []).find((item) => cleanOrderId(item.id) === supportId);
    if (!request) {
      jsonResponse(res, 404, { error: "Support request not found." });
      return true;
    }

    request.status = nextStatus;
    request.resolutionNote = text(payload.resolutionNote || request.resolutionNote, 800);
    request.internalNote = text(payload.internalNote || request.internalNote, 800);
    request.updatedAt = new Date().toISOString();
    request.history = [
      ...(request.history || []),
      {
        status: nextStatus,
        note: text(payload.resolutionNote || payload.internalNote || "Support request updated from admin panel.", 240),
        at: request.updatedAt
      }
    ];
    await writeDb(db);
    jsonResponse(res, 200, { supportRequest: adminSupportRequest(request) });
    return true;
  }

  if (url.pathname === "/api/admin/wholesale" && req.method === "GET") {
    if (!requireAdmin(req, res)) return true;
    const db = await readDb();
    jsonResponse(res, 200, { enquiries: (db.wholesale || []).map(publicEnquiry) });
    return true;
  }

  const notificationMatch = url.pathname.match(/^\/api\/admin\/notifications\/([^/]+)$/);
  if (notificationMatch && req.method === "PATCH") {
    if (!requireAdmin(req, res)) return true;
    const notificationKey = decodeURIComponent(notificationMatch[1]);
    const payload = await readBody(req);
    const nextStatus = text(payload.status, 40);
    if (!["ready", "sent", "archived"].includes(nextStatus)) {
      jsonResponse(res, 400, { error: "Invalid notification status." });
      return true;
    }

    const db = await readDb();
    const notification = (db.notifications || []).find((item) => item.id === notificationKey);
    if (!notification) {
      jsonResponse(res, 404, { error: "Notification not found." });
      return true;
    }

    notification.status = nextStatus;
    notification.updatedAt = new Date().toISOString();
    if (nextStatus === "sent" && !notification.sentAt) notification.sentAt = notification.updatedAt;
    await writeDb(db);
    jsonResponse(res, 200, { notification: publicNotification(notification) });
    return true;
  }

  const retryNotificationMatch = url.pathname.match(/^\/api\/admin\/notifications\/([^/]+)\/retry$/);
  if (retryNotificationMatch && req.method === "POST") {
    if (!requireAdmin(req, res)) return true;
    const notificationKey = decodeURIComponent(retryNotificationMatch[1]);
    const db = await readDb();
    const notification = (db.notifications || []).find((item) => item.id === notificationKey);
    const order = (db.orders || []).find((item) => item.id === notification?.orderId);
    if (!notification || !order) {
      jsonResponse(res, 404, { error: "Notification or order not found." });
      return true;
    }

    notification.status = "queued";
    notification.error = "";
    await dispatchNotifications([notification], order);
    await writeDb(db);
    jsonResponse(res, 200, { notification: publicNotification(notification) });
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
    order.trackingUrl = text(payload.trackingUrl || order.trackingUrl, 500);
    order.dispatchDate = text(payload.dispatchDate || order.dispatchDate, 80);
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
    const shouldNotifyCustomer = payload.notifyCustomer !== false && payload.notifyCustomer !== "false";
    if (shouldNotifyCustomer) {
      const notifications = createOrderNotifications(order, "status_updated").filter((item) => item.audience === "customer");
      await dispatchNotifications(notifications, order);
      db.notifications = [...notifications, ...(db.notifications || [])].slice(0, 2000);
    }
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
