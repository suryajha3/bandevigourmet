import {
  BadgeCheck,
  Circle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clipboard,
  CreditCard,
  FileText,
  Factory,
  FlaskConical,
  Globe2,
  Handshake,
  Leaf,
  LogOut,
  MapPinCheck,
  MessageCircle,
  MessageSquare,
  PackageCheck,
  PackageOpen,
  Printer,
  Plus,
  RotateCw,
  Search,
  Send,
  ShoppingBag,
  Store,
  Sparkles,
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
const API_ORIGIN = window.location.origin;
const FREE_DELIVERY_AT = 999;
const DEFAULT_DELIVERY_FEE = 69;
const LAUNCH_COUPON_CODE = "SPICE10";
const DEFAULT_COUPON = {
  code: LAUNCH_COUPON_CODE,
  label: "Launch 10% off",
  type: "percent",
  value: 10,
  minSubtotal: 0,
  maxDiscount: 250,
  autoShow: true
};
const DEFAULT_MRP_MULTIPLIERS = {
  makhana: 1.18,
  masala: 1.22,
  poha: 1.16,
  combo: 1.14
};

let catalog = buildCatalog(products);

const NON_VEG_MASALA_IDS = new Set([
  "chicken-masala",
  "butter-chicken-masala",
  "tandoori-chicken-masala",
  "mutton-masala",
  "nihari-masala",
  "keema-masala",
  "kebab-masala",
  "fish-curry-masala",
  "prawn-masala",
  "egg-curry-masala"
]);

const BULK_PACK_IDS = new Set([
  "poha-2kg-pouch",
  "poha-5kg-pack",
  "whole-spice-combo",
  "masala-refill",
  "snack-combo"
]);

const PRODUCT_IMAGE_OVERRIDES = {
  "premium-poha": "/assets/product-poha-optimized.jpg"
};

const CATEGORY_IMAGE_FALLBACKS = {
  makhana: "/assets/product-classic-makhana-optimized.jpg",
  masala: "/assets/product-garam-masala-optimized.jpg",
  poha: "/assets/product-poha-optimized.jpg",
  combo: "/assets/product-snack-combo-optimized.jpg"
};

const STORAGE_KEYS = {
  customer: "bandevi-gourmet-customer",
  customerPin: "bandevi-gourmet-customer-pin",
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

function buildCatalog(productList) {
  return (Array.isArray(productList) ? productList : [])
    .filter((product) => product.active !== false)
    .map((product) => {
      const category = String(product.category || "masala").toLowerCase();
      const pricing = normalizeProductPricing(product, category);
      return {
        ...product,
        ...pricing,
        category,
        price: pricing.offerPrice,
        featured: product.featured === true,
        rating: Number(product.rating || 4.8),
        stock: Number(product.stock ?? 100),
        stockStatus: product.stockStatus || "in-stock",
        lowStockThreshold: Number(product.lowStockThreshold || 10),
        details: product.details || productDetails[product.id] || {}
      };
    });
}

const state = {
  filter: "all",
  homeRange: "makhana",
  search: "",
  sort: "featured",
  couponApplied: false,
  availableCoupons: [DEFAULT_COUPON],
  activeCoupon: null,
  checkoutStep: "cart",
  cart: loadCart(),
  customer: loadCustomer(),
  customerSummary: null,
  customerEnquiries: [],
  customerSupportRequests: [],
  customerSyncStatus: "local",
  orders: loadOrders(),
  trackedOrder: null
};

const googleAuth = {
  clientId: null,
  initialized: false,
  loading: null
};

const HEADER_RELEASE = "premium-header-20260712";
document.documentElement.dataset.headerRelease = HEADER_RELEASE;

ensureStoreShell();
ensureMobileCategoryNav();
ensureTrustInfrastructure();
ensureCartCheckoutEnhancements();
optimizeImageLoading();

const rupee = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0
});

const productGrid = document.querySelector("#productGrid");
const homeRangePanel = document.querySelector("[data-home-range-panel]");
const homeRangeTabs = Array.from(document.querySelectorAll("[data-home-range-tab]"));
const makhanaProductGrid = document.querySelector("#makhanaProductGrid");
const masalaProductGrid = document.querySelector("#masalaProductGrid");
const nonVegMasalaProductGrid = document.querySelector("#nonVegMasalaProductGrid");
const pohaProductGrid = document.querySelector("#pohaProductGrid");
const comboProductGrid = document.querySelector("#comboProductGrid");
const bulkProductGrid = document.querySelector("#bulkProductGrid");
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
const customerSignupForm = document.querySelector("#customerSignupForm");
const customerForgotForm = document.querySelector("#customerForgotForm");
const orderLookupForm = document.querySelector("#orderLookupForm");
const customerSupportForm = document.querySelector("#customerSupportForm");
const customerDashboard = document.querySelector("#customerDashboard");
const customerLoginStatus = document.querySelector("#customerLoginStatus");
const customerSignupStatus = document.querySelector("#customerSignupStatus");
const customerForgotStatus = document.querySelector("#customerForgotStatus");
const customerSupportStatus = document.querySelector("#customerSupportStatus");
const confirmationPage = document.querySelector("#confirmationPage");
const overlay = document.querySelector("[data-overlay]");
const toast = document.querySelector("#toast");
const couponInput = document.querySelector("#couponInput");
const couponMessage = document.querySelector("#couponMessage");
const cartStepper = document.querySelector(".cart-stepper");
const cartReviewPanel = document.querySelector("#cartReviewPanel");
const checkoutExtraFields = document.querySelector("[data-checkout-extra-fields]");
const orderTypeSelect = checkoutForm?.elements.orderType;
const saveDetailsInput = checkoutForm?.elements.saveDetails;
const promoSlider = document.querySelector("[data-promo-slider]");
const promoSlides = promoSlider ? [...promoSlider.querySelectorAll("[data-promo-slide]")] : [];
const promoDots = promoSlider ? [...promoSlider.querySelectorAll("[data-promo-dot]")] : [];
let promoIndex = 0;
let promoTimer = null;

const HOME_RANGE_CONFIG = {
  makhana: {
    eyebrow: "Makhana range",
    title: "Roasted makhana for daily snacking and gifting.",
    copy:
      "Light, crunchy fox nuts packed for retail shelves, family snacks, and premium hampers without artificial color direction.",
    href: "./makhana.html",
    cta: "Open makhana page",
    points: ["Roasted snack packs", "Sweet and spicy flavors", "Gift-ready buying path"]
  },
  masala: {
    eyebrow: "Masala range",
    title: "Daily cooking masalas and pure spice refills.",
    copy:
      "Garam masala, kitchen king, turmeric, chilli, sabji, paneer, and everyday spice blends presented as a clean pantry line.",
    href: "./masala.html",
    cta: "Open masala page",
    points: ["No artificial color direction", "Ingredient-led blends", "Home and retail packs"]
  },
  "nonveg-masala": {
    eyebrow: "Non-veg masala range",
    title: "Chicken, mutton, seafood, egg, and grill masalas.",
    copy:
      "A separate non-veg cooking range for rich gravies, marinades, restaurant-style recipes, and repeat kitchen use.",
    href: "./products.html#products",
    cta: "View full catalog",
    points: ["Chicken and mutton blends", "Seafood and egg masalas", "Grill and kebab direction"]
  },
  poha: {
    eyebrow: "Poha range",
    title: "Clean poha packs for breakfast, retail, and bulk buyers.",
    copy:
      "Separate poha packs for home kitchens, stores, and monthly pantry refills with simple, trusted positioning.",
    href: "./poha.html",
    cta: "Open poha page",
    points: ["Breakfast staple", "Multiple pack sizes", "Pantry refill format"]
  },
  combo: {
    eyebrow: "Bundles",
    title: "Curated carts for families, gifting, and repeat buyers.",
    copy:
      "Ready-made bundle ideas combine makhana, masala, poha, and spice refills so customers can order faster.",
    href: "./bundles.html",
    cta: "Open bundles page",
    points: ["Monthly refill ideas", "Gift-ready combos", "Higher cart value"]
  },
  bulk: {
    eyebrow: "Bulk packs",
    title: "Wholesale-ready packs for retailers and distributors.",
    copy:
      "Large packs and business buying paths for retail counters, distributors, institutional kitchens, and export enquiries.",
    href: "./wholesale.html",
    cta: "Open wholesale enquiry",
    points: ["Bulk pack direction", "Distributor enquiry", "Export-ready conversation"]
  }
};

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
                <option>Razorpay online</option>
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

function ensureCartCheckoutEnhancements() {
  const cart = document.querySelector(".cart-drawer");
  if (!cart) return;

  const header = cart.querySelector(".drawer-header");
  if (header && !cart.querySelector(".cart-stepper")) {
    header.insertAdjacentHTML(
      "afterend",
      `
        <div class="cart-stepper" role="tablist" aria-label="Checkout steps">
          <button type="button" data-cart-step="cart" aria-selected="true">
            <span>1</span>
            Cart
          </button>
          <button type="button" data-cart-step="details" aria-selected="false">
            <span>2</span>
            Checkout
          </button>
        </div>
        <div class="cart-trust-row" aria-label="Checkout trust points">
          <span><i data-lucide="leaf"></i>No artificial colors</span>
          <span><i data-lucide="package-check"></i>Packed after order</span>
          <span><i data-lucide="badge-check"></i>Booking ID tracking</span>
          <span><i data-lucide="shield-check"></i>Policy-backed support</span>
        </div>
      `
    );
  }

  const form = cart.querySelector("#checkoutForm");
  if (!form) return;

  const orderTypeLabel = form.elements.orderType?.closest("label");
  if (orderTypeLabel && !form.querySelector("[data-checkout-extra-fields]")) {
    orderTypeLabel.insertAdjacentHTML(
      "afterend",
      `
        <div class="checkout-extra-fields" data-checkout-extra-fields>
          <label class="gift-field">
            <span>Gift note</span>
            <textarea name="giftNote" rows="2" placeholder="Message for gifting order"></textarea>
          </label>
          <label class="business-field">
            <span>Business / store name</span>
            <input name="businessName" type="text" placeholder="For wholesale, sample, or export enquiry" />
          </label>
          <label class="business-field">
            <span>GST / tax ID optional</span>
            <input name="gstNumber" type="text" placeholder="Optional buyer tax reference" />
          </label>
          <label class="business-field">
            <span>Expected volume</span>
            <input name="buyerVolume" type="text" placeholder="Example: 50 packs monthly" />
          </label>
        </div>
      `
    );
  }

  const paymentDetailsSlot = form.querySelector("#paymentDetails");
  if (paymentDetailsSlot && !form.querySelector(".save-customer-row")) {
    paymentDetailsSlot.insertAdjacentHTML(
      "beforebegin",
      `
        <label class="save-customer-row">
          <input name="saveDetails" type="checkbox" checked />
          <span>Save my details for next order and account tracking</span>
        </label>
      `
    );
  }

  if (!cart.querySelector("#cartReviewPanel")) {
    form.insertAdjacentHTML(
      "afterend",
      `
        <section class="cart-review-panel" id="cartReviewPanel" aria-live="polite" hidden></section>
      `
    );
  }
}

function ensureMobileCategoryNav() {
  const header = document.querySelector(".site-header");
  if (!header || document.querySelector(".mobile-category-nav")) return;

  header.insertAdjacentHTML(
    "afterend",
    `
      <nav class="mobile-category-nav" aria-label="Mobile category shortcuts">
        <a href="./products.html">All</a>
        <a href="./makhana.html">Makhana</a>
        <a href="./masala.html">Masala</a>
        <a href="./poha.html">Poha</a>
        <a href="./about.html#trust">Trust</a>
        <a href="./track.html">Track</a>
      </nav>
    `
  );
}

function businessValue(key) {
  return STORE_CONFIG.business?.[key] || "Verification pending";
}

function renderTrustBadges() {
  return (STORE_CONFIG.trustBadges || [])
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join("");
}

function renderComplianceCards() {
  const cards = [
    { title: "FSSAI", value: businessValue("fssai"), icon: "shield-check" },
    { title: "GST", value: businessValue("gst"), icon: "file-text" },
    { title: "IEC / export", value: businessValue("iec"), icon: "globe-2" },
    { title: "Lab reports", value: businessValue("labReports"), icon: "flask-conical" }
  ];

  return cards
    .map(
      (card) => `
        <article>
          <i data-lucide="${card.icon}"></i>
          <strong>${escapeHtml(card.title)}</strong>
          <span>${escapeHtml(card.value)}</span>
        </article>
      `
    )
    .join("");
}

function renderBusinessVerificationPanel() {
  const details = [
    ["Legal entity", businessValue("legalName")],
    ["Registered address", businessValue("registeredAddress")],
    ["Manufacturer / packer", businessValue("manufacturer")],
    ["Packing address", businessValue("packerAddress")],
    ["Support email", businessValue("supportEmail")],
    ["Support phone", businessValue("supportPhone")]
  ];

  return `
    <section class="business-verification-panel" id="business-verification" aria-labelledby="business-verification-title">
      <div>
        <p class="eyebrow">Business verification</p>
        <h2 id="business-verification-title">Official details ready for verified records.</h2>
        <p>
          This trust area is prepared for ${escapeHtml(STORE_CONFIG.shopName)} legal, food-safety, tax, support, and export records. Replace pending values only after documents are confirmed.
        </p>
      </div>
      <div class="business-verification-grid">
        ${details
          .map(
            ([label, value]) => `
              <span>
                <strong>${escapeHtml(label)}</strong>
                <small>${escapeHtml(value)}</small>
              </span>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderCheckoutAssurance() {
  return `
    <div class="checkout-assurance" aria-label="Checkout trust information">
      <span><i data-lucide="badge-check"></i><strong>Booking ID</strong> Generated instantly for tracking.</span>
      <span><i data-lucide="shield-check"></i><strong>Policy backed</strong> Refund, cancellation, and shipping terms are linked.</span>
      <span><i data-lucide="message-circle"></i><strong>Support</strong> ${escapeHtml(businessValue("supportPhone"))}</span>
    </div>
  `;
}

function ensureTrustInfrastructure() {
  ensureHeaderSliderLink();
  ensurePremiumHeader();
  moveProofLinksToFooter();
  ensureHeaderTrustRow();
  ensureFooterTrust();
  ensureCheckoutAssurance();
  ensurePolicyBusinessPanel();
  ensureAboutComplianceCards();
  ensureSeoAutoTime();
  ensureSubmissionCopyButtons();
}

function ensureHeaderSliderLink() {
  document.querySelector('.main-nav a[href="./slider.html"]')?.remove();
}

function moveProofLinksToFooter() {
  const header = document.querySelector(".site-header");
  if (!header) return;

  const proofPages = new Set([
    "proof-center.html",
    "company-profile.html",
    "company-strength.html",
    "office-network.html",
    "makhana-export-company-net-worth-staff-offices.html",
    "surya-kant-jha-chairman-net-worth-travel-agent.html"
  ]);

  header.querySelectorAll("a[href]").forEach((link) => {
    const target = new URL(link.getAttribute("href"), window.location.href).pathname.split("/").pop();
    if (proofPages.has(target)) link.remove();
  });
}

function ensurePremiumHeader() {
  const header = document.querySelector(".site-header");
  if (!header) return;

  header.classList.add("premium-header", "is-simple");
  header.querySelector(".header-announcement")?.remove();
  header.querySelector(".header-trust-row")?.remove();

  const brandCopy = header.querySelector(".brand > span:not(.brand-mark)");
  brandCopy?.querySelector(".brand-proof-line")?.remove();

  const nav = header.querySelector(".main-nav");
  if (nav && !nav.dataset.simpleNavigation) {
    const currentPage = window.location.pathname.split("/").pop() || "index.html";
    const links = [
      ["./index.html", "Home"],
      ["./products.html", "Shop"],
      ["./wholesale.html", "Wholesale"],
      ["./international-buyer-desk.html", "International"],
      ["./track.html", "Track"]
    ];
    nav.innerHTML = links
      .map(([href, label]) => `<a href="${href}" ${href.endsWith(currentPage) ? 'aria-current="page"' : ""}>${label}</a>`)
      .join("");
    nav.dataset.simpleNavigation = "true";
  }

  const actions = header.querySelector(".header-actions");
  if (actions && !actions.dataset.simpleActions) {
    const cart = actions.querySelector(".cart-trigger")?.outerHTML || `
      <button class="icon-button cart-trigger" type="button" aria-label="Open cart" title="Cart">
        <i data-lucide="shopping-bag"></i><span class="cart-count" data-cart-count>0</span>
      </button>`;
    actions.innerHTML = `
      <a class="portal-shortcut header-sales-shortcut" href="./contact.html">
        <i data-lucide="message-circle"></i><span>Sales</span>
      </a>
      <a class="icon-button header-account-shortcut" href="./account.html" aria-label="Customer account" title="Customer account">
        <i data-lucide="user-round"></i>
      </a>
      ${cart}
    `;
    actions.dataset.simpleActions = "true";
  }

  initPremiumHeaderBehavior(header);
}

function initPremiumHeaderBehavior(header) {
  if (header.dataset.enhancedHeader === "true") return;
  header.dataset.enhancedHeader = "true";

  const updateHeaderState = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
  updateHeaderState();
  window.addEventListener("scroll", updateHeaderState, { passive: true });
}

function ensureHeaderTrustRow() {
  const header = document.querySelector(".site-header");
  if (!header) return;
  header.querySelector(".header-trust-row")?.remove();
}

function ensureFooterTrust() {
  const footer = document.querySelector(".site-footer");
  if (!footer) return;

  footer.classList.add("upgraded-footer");
  footer.innerHTML = `
    <div class="footer-intro">
      <a class="brand footer-brand" href="./index.html" aria-label="${escapeHtml(STORE_CONFIG.shopName)} home">
        <span class="brand-mark">B</span>
        <span>
          <strong>${escapeHtml(STORE_CONFIG.shopName)}</strong>
          <small>Makhana, masala, poha, herbs, and Indian pantry products</small>
        </span>
      </a>
      <p>
        Premium Indian makhana, masala, poha, herbs, whole spices, and pantry bundles with Chairman Mr. Surya Kant Jha, buyer-ready proof, and clear company strength references.
      </p>
      <div class="footer-trust-points" aria-label="Footer trust points">
        ${renderTrustBadges()}
        <span>Chairman: Mr. Surya Kant Jha</span>
        <span>INR 8,000 Cr+ group strength</span>
        <span>1000+ staff reference</span>
        <span>26+ office presence</span>
      </div>
    </div>
    <nav class="footer-links" aria-label="Shop links">
      <strong>Shop</strong>
      <a href="./products.html">Products</a>
      <a href="./makhana.html">Makhana</a>
      <a href="./masala.html">Masala</a>
      <a href="./poha.html">Poha</a>
      <a href="./bundles.html">Bundles</a>
    </nav>
    <nav class="footer-links" aria-label="Support links">
      <strong>Customer care</strong>
      <a href="./account.html">Customer account</a>
      <a href="./track.html">Track order</a>
      <a href="./policies.html#terms">Terms</a>
      <a href="./policies.html#privacy">Privacy</a>
      <a href="./policies.html#cancellation">Cancellation</a>
      <a href="./policies.html#refund">Refunds</a>
    </nav>
    <nav class="footer-links" aria-label="Business links">
      <strong>Proof &amp; company</strong>
      <a href="./about.html">About BandEvi</a>
      <a href="./proof-center.html">Proof Center</a>
      <a href="./company-strength.html">Company strength</a>
      <a href="./office-network.html">Office network</a>
      <a href="./surya-kant-jha-chairman-net-worth-travel-agent.html">Chairman profile</a>
      <a href="./surya-kant-jha-chairman-net-worth-travel-agent.html#chairman-gallery-title">Chairman gallery</a>
      <a href="./makhana-export-company-net-worth-staff-offices.html">Net worth, staff, offices</a>
      <a href="./about.html#trust">Trust center</a>
      <a href="./about.html#business-verification">Business verification</a>
      <a href="./contact.html">Contact and sales</a>
      <a href="./wholesale.html">Wholesale enquiry</a>
      <a href="./international-buyer-desk.html">International buyer desk</a>
      <a href="./international-buyer-catalog.html">International buyer catalog</a>
      <a href="./makhana-export-price-moq-packaging-guide.html">Export price and MOQ guide</a>
      <a href="./premium-roasted-makhana-snack-packs-wholesale.html">Roasted makhana wholesale</a>
      <a href="./directory-submission-kit.html">Directory kit</a>
      <a href="./updates.html">Daily SEO updates</a>
      <a href="./policies.html#faq">FAQ</a>
    </nav>
    <nav class="footer-links" aria-label="Market links">
      <strong>Markets</strong>
      <a href="./india.html">India</a>
      <a href="./dubai.html">Dubai / UAE</a>
      <a href="./uk.html">UK</a>
      <a href="./us.html">USA</a>
      <a href="./makhana-wholesale-canada.html">Canada</a>
      <a href="./international-buyer-desk.html">International buyers</a>
      <a href="./international-buyer-catalog.html">Buyer catalog</a>
      <a href="./marketplace-product-listing-pack.html">Marketplace listings</a>
    </nav>
    <div class="footer-note footer-assurance">
      <strong>Verified details</strong>
      <div class="footer-business-list">
        <span><b>Business</b>${escapeHtml(businessValue("legalName"))}</span>
        <span><b>Office</b>${escapeHtml(businessValue("registeredAddress"))}</span>
        <span><b>FSSAI</b>${escapeHtml(businessValue("fssai"))}</span>
        <span><b>GST</b>${escapeHtml(businessValue("gst"))}</span>
        <span><b>Support</b>${escapeHtml(businessValue("supportPhone"))}</span>
        <span><b>Email</b><a href="mailto:${encodeURIComponent(businessValue("supportEmail"))}">${escapeHtml(businessValue("supportEmail"))}</a></span>
      </div>
      <small>${escapeHtml(STORE_CONFIG.claimDisclaimer)}</small>
      <a class="footer-cta" href="./proof-center.html">Open Proof Center</a>
    </div>
    <div class="footer-bottom">
      <span>${escapeHtml(STORE_CONFIG.shopName)}, India</span>
      <span>${escapeHtml(STORE_CONFIG.domain)}</span>
      <span>${escapeHtml(STORE_CONFIG.supportHours)}</span>
    </div>
  `;
}

function ensureCheckoutAssurance() {
  document.querySelectorAll(".checkout-form").forEach((form) => {
    if (form.querySelector(".checkout-assurance")) return;
    const totals = form.querySelector(".totals");
    if (totals) totals.insertAdjacentHTML("beforebegin", renderCheckoutAssurance());
  });
}

function ensurePolicyBusinessPanel() {
  const legalJumpNav = document.querySelector(".legal-jump-nav");
  if (!legalJumpNav || document.querySelector(".business-verification-panel")) return;

  legalJumpNav.insertAdjacentHTML("beforeend", `<a href="#business-verification">Business verification</a>`);
  legalJumpNav.insertAdjacentHTML("afterend", renderBusinessVerificationPanel());
}

function ensureAboutComplianceCards() {
  const certList = document.querySelector(".cert-list");
  if (certList) certList.innerHTML = renderComplianceCards();

  const certSection = document.querySelector(".cert-section");
  if (certSection && !document.querySelector(".business-verification-panel")) {
    certSection.insertAdjacentHTML("afterend", renderBusinessVerificationPanel());
  }
}

function ensureSeoAutoTime() {
  const timeNodes = document.querySelectorAll("[data-seo-auto-time]");
  if (!timeNodes.length) return;

  const formatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });

  const updateTime = () => {
    const now = new Date();
    timeNodes.forEach((node) => {
      node.textContent = `${formatter.format(now)} IST`;
      node.setAttribute("datetime", now.toISOString());
    });
  };

  updateTime();
  window.setInterval(updateTime, 60000);
}

function money(value) {
  return `Rs. ${rupee.format(value)}`;
}

function getDefaultMrp(offerPrice, category) {
  const offer = Math.max(0, Number(offerPrice || 0));
  if (!offer) return 0;
  const multiplier = DEFAULT_MRP_MULTIPLIERS[category] || 1.18;
  const rounded = Math.ceil((offer * multiplier) / 10) * 10 - 1;
  return Math.max(offer, rounded);
}

function normalizeProductPricing(product = {}, category = product.category || "masala") {
  const offerPrice = Math.max(0, Number(product.offerPrice ?? product.price ?? 0));
  const explicitMrp = Number(product.mrp || 0);
  const explicitDiscount = Number(product.discountPrice || 0);
  const mrp = Math.max(
    offerPrice,
    explicitMrp > 0 ? explicitMrp : explicitDiscount > 0 ? offerPrice + explicitDiscount : getDefaultMrp(offerPrice, category)
  );
  const discountPrice = Math.max(0, mrp - offerPrice);
  const discountPercent = mrp > offerPrice && mrp > 0 ? Math.round((discountPrice / mrp) * 100) : 0;
  return {
    mrp,
    offerPrice,
    discountPrice,
    discountPercent
  };
}

function getPricingLabel(product) {
  if (BULK_PACK_IDS.has(product.id)) return "Bulk pack price";
  if (product.category === "combo") return "Bundle price";
  if (product.category === "masala") return "Spice pack price";
  if (product.category === "makhana") return "Snack pack price";
  if (product.category === "poha") return "Pantry pack price";
  return "Pack price";
}

function getFreeDeliveryPriceText(amount) {
  const remaining = Math.max(0, FREE_DELIVERY_AT - Number(amount || 0));
  return remaining ? `${money(remaining)} to free delivery` : "Free delivery eligible";
}

function normalizeCouponForClient(coupon = {}) {
  coupon = coupon || {};
  const code = String(coupon.code || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!code) return null;
  const type = ["percent", "fixed", "free-delivery"].includes(coupon.type) ? coupon.type : "percent";
  return {
    code,
    label: String(coupon.label || `${code} offer`).trim(),
    type,
    value: Math.max(0, Number(coupon.value || 0)),
    minSubtotal: Math.max(0, Number(coupon.minSubtotal || 0)),
    maxDiscount: Math.max(0, Number(coupon.maxDiscount || 0)),
    autoShow: coupon.autoShow !== false
  };
}

function getDisplayCoupon() {
  return state.activeCoupon || state.availableCoupons.find((coupon) => coupon.autoShow !== false) || DEFAULT_COUPON;
}

function couponValueText(coupon = getDisplayCoupon()) {
  if (coupon.type === "free-delivery") return "free delivery";
  if (coupon.type === "fixed") return `${money(coupon.value)} off`;
  return `${Number(coupon.value || 0)}% off`;
}

function calculateCouponDiscount(coupon, subtotal) {
  const activeCoupon = normalizeCouponForClient(coupon);
  const amount = Math.max(0, Number(subtotal || 0));
  if (!activeCoupon || amount < Number(activeCoupon.minSubtotal || 0)) return { discount: 0, freeDelivery: false };
  if (activeCoupon.type === "free-delivery") return { discount: 0, freeDelivery: true };
  const rawDiscount =
    activeCoupon.type === "fixed" ? Number(activeCoupon.value || 0) : Math.round((amount * Number(activeCoupon.value || 0)) / 100);
  const cappedDiscount = activeCoupon.maxDiscount ? Math.min(rawDiscount, activeCoupon.maxDiscount) : rawDiscount;
  return { discount: Math.max(0, Math.min(amount, Math.round(cappedDiscount))), freeDelivery: false };
}

function localCouponValidation(code, subtotal) {
  const couponCode = String(code || "").trim().toUpperCase();
  const coupon = state.availableCoupons.find((item) => item.code === couponCode) || (couponCode === DEFAULT_COUPON.code ? DEFAULT_COUPON : null);
  if (!coupon) return { valid: false, message: "Coupon code was not found." };
  if (subtotal < Number(coupon.minSubtotal || 0)) {
    return { valid: false, message: `${money(Number(coupon.minSubtotal || 0) - subtotal)} more needed for this coupon.` };
  }
  const couponValue = calculateCouponDiscount(coupon, subtotal);
  return {
    valid: true,
    coupon,
    discount: couponValue.discount,
    freeDelivery: couponValue.freeDelivery,
    message: couponValue.freeDelivery ? `${coupon.code} gives free delivery.` : `${coupon.code} applied.`
  };
}

async function syncCouponsFromBackend() {
  try {
    const payload = await apiRequest("/api/coupons");
    const coupons = (payload.coupons || []).map(normalizeCouponForClient).filter(Boolean);
    state.availableCoupons = coupons.length ? coupons : [DEFAULT_COUPON];
    if (state.activeCoupon && !state.availableCoupons.some((coupon) => coupon.code === state.activeCoupon.code)) {
      state.activeCoupon = null;
      state.couponApplied = false;
    }
    renderCart();
    renderProducts();
    renderCategoryProducts();
  } catch {
    state.availableCoupons = [DEFAULT_COUPON];
  }
}

async function applyCouponCode(code = getDisplayCoupon().code) {
  const couponCode = String(code || "").trim().toUpperCase();
  const subtotal = getCartLines().reduce((sum, item) => sum + item.lineTotal, 0);
  if (!couponCode) {
    state.activeCoupon = null;
    state.couponApplied = false;
    if (couponMessage) couponMessage.textContent = "Enter a coupon code.";
    renderCart();
    return;
  }

  let result = null;
  try {
    result = await apiRequest("/api/coupons/validate", {
      method: "POST",
      body: JSON.stringify({ code: couponCode, subtotal, delivery: DEFAULT_DELIVERY_FEE })
    });
  } catch {
    result = localCouponValidation(couponCode, subtotal);
  }

  if (result?.valid && result.coupon) {
    state.activeCoupon = normalizeCouponForClient(result.coupon);
    state.couponApplied = true;
    if (couponInput) couponInput.value = state.activeCoupon.code;
    if (couponMessage) couponMessage.textContent = result.message || `${state.activeCoupon.code} applied.`;
    renderCart();
    showToast(`${state.activeCoupon.code} applied`);
    return;
  }

  state.activeCoupon = null;
  state.couponApplied = false;
  if (couponMessage) couponMessage.textContent = result?.message || "Coupon could not be applied.";
  renderCart();
}

function getPricingSupportText(product) {
  const coupon = getDisplayCoupon();
  return `${getFreeDeliveryPriceText(product.price)} / ${coupon.code} coupon`;
}

function renderProductPricing(product, variant = "card") {
  const pricing = normalizeProductPricing(product, product.category);
  const discountLabel = pricing.discountPrice ? `${pricing.discountPercent}% off` : "Best price";
  const savingsLabel = pricing.discountPrice ? `Save ${money(pricing.discountPrice)}` : "No markup";
  return `
    <div class="price-panel price-panel--${variant}">
      <div class="price-panel-top">
        <span>${escapeHtml(getPricingLabel(product))}</span>
        <small>${escapeHtml(product.size)}</small>
      </div>
      <div class="price-panel-main">
        <span class="price-mrp"><small>MRP</small><s>${money(pricing.mrp)}</s></span>
        <span class="price-offer"><small>Offer price</small><strong>${money(pricing.offerPrice)}</strong></span>
        <span class="price-discount"><small>Discount</small><b>${escapeHtml(discountLabel)}</b></span>
      </div>
      <div class="price-panel-notes">
        <span>${escapeHtml(savingsLabel)} on this pack</span>
        <span>${escapeHtml(getPricingSupportText(product))}</span>
      </div>
    </div>
  `;
}

function renderCompactPricing(product) {
  const pricing = normalizeProductPricing(product, product.category);
  return `
    <span class="compact-price">
      <strong>${money(pricing.offerPrice)}</strong>
      ${pricing.discountPrice ? `<s>${money(pricing.mrp)}</s>` : ""}
      <small>${escapeHtml(product.size)}</small>
      ${pricing.discountPrice ? `<b>${pricing.discountPercent}% off</b>` : ""}
    </span>
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

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeAccessPin(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
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

function loadCustomerPin() {
  return normalizeAccessPin(window.sessionStorage.getItem(STORAGE_KEYS.customerPin));
}

function saveCustomerPin(pin) {
  const cleanPin = normalizeAccessPin(pin);
  if (cleanPin) window.sessionStorage.setItem(STORAGE_KEYS.customerPin, cleanPin);
  else window.sessionStorage.removeItem(STORAGE_KEYS.customerPin);
}

function getCustomerAuthParams(phone) {
  const params = new URLSearchParams({ phone: normalizePhone(phone) });
  const pin = loadCustomerPin();
  if (pin) params.set("pin", pin);
  return params;
}

function cleanCustomerForStorage(customer) {
  const { accountPin, pin, ...safeCustomer } = customer || {};
  return safeCustomer;
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

function ensureSubmissionCopyButtons() {
  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    if (button.dataset.copyBound === "true") return;
    button.dataset.copyBound = "true";

    button.addEventListener("click", async () => {
      const target = document.querySelector(button.dataset.copyTarget || "");
      if (!target) return;

      const value = "value" in target ? target.value : target.textContent;
      await copyText(String(value || "").trim());

      const originalLabel = button.dataset.copyLabel || button.textContent;
      button.dataset.copyLabel = originalLabel;
      button.textContent = "Copied";
      button.classList.add("is-copied");
      showToast("Submission text copied");

      window.setTimeout(() => {
        button.textContent = button.dataset.copyLabel || "Copy";
        button.classList.remove("is-copied");
      }, 1600);
    });
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
  const safeCustomer = cleanCustomerForStorage(customer);
  state.customer = safeCustomer;
  writeJson(STORAGE_KEYS.customer, safeCustomer);
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
      state.customer = cleanCustomerForStorage({ ...customer, ...payload.customer });
      writeJson(STORAGE_KEYS.customer, state.customer);
    }
    state.customerSyncStatus = "synced";
    return payload.customer || null;
  } catch {
    state.customerSyncStatus = "local";
    return null;
  }
}

function sanitizeCartForCatalog() {
  let changed = false;
  [...state.cart.entries()].forEach(([id, quantity]) => {
    const product = catalog.find((item) => item.id === id);
    if (!product || !isProductAvailable(product, quantity)) {
      state.cart.delete(id);
      changed = true;
    }
  });
  if (changed) saveCart();
}

async function syncCatalogFromBackend() {
  try {
    const payload = await apiRequest("/api/products");
    if (!payload.products?.length) return;
    catalog = buildCatalog(payload.products);
    sanitizeCartForCatalog();
    renderProducts();
    renderCategoryProducts();
    renderHomeRange();
    renderSingleProductPage();
    renderCart();
  } catch {
    // Static product JSON remains the storefront fallback when the backend is unavailable.
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
  const configuredImage = String(product?.image || "").trim();
  if (configuredImage) return configuredImage;
  if (PRODUCT_IMAGE_OVERRIDES[product?.id]) return PRODUCT_IMAGE_OVERRIDES[product.id];
  if (product?.id) return `/assets/product-${product.id}-optimized.jpg`;
  return fallbackProductImage(product);
}

function fallbackProductImage(product) {
  return CATEGORY_IMAGE_FALLBACKS[product?.category] || "/assets/makhana-masala-hero.webp";
}

function getStockStatus(product) {
  const stock = Number(product?.stock ?? 0);
  if (!product || product.active === false) return "inactive";
  if (product.stockStatus === "preorder") return "preorder";
  if (product.stockStatus === "out-of-stock" || stock <= 0) return "out-of-stock";
  if (product.stockStatus === "low-stock" || stock <= Number(product.lowStockThreshold || 10)) return "low-stock";
  return "in-stock";
}

function isProductAvailable(product, quantity = 1) {
  const status = getStockStatus(product);
  if (status === "inactive" || status === "out-of-stock") return false;
  if (status === "preorder") return true;
  return Number(product.stock ?? 0) >= quantity;
}

function getStockLabel(product) {
  const status = getStockStatus(product);
  const stock = Number(product?.stock ?? 0);
  if (status === "preorder") return "Pre-order";
  if (status === "low-stock") return `${stock} left`;
  if (status === "out-of-stock") return "Out of stock";
  if (status === "inactive") return "Hidden";
  return "In stock";
}

function getCartStockIssue() {
  const issue = [...state.cart.entries()].find(([id, quantity]) => {
    const product = catalog.find((item) => item.id === id);
    return !isProductAvailable(product, quantity);
  });
  if (!issue) return "";
  const [id] = issue;
  const product = catalog.find((item) => item.id === id);
  return `${product?.name || "A product"} is not available in the requested quantity.`;
}

function hasProductImage(product) {
  return Boolean(product?.image?.trim() || product?.id || product?.category);
}

function renderProductVisual(product) {
  if (hasProductImage(product)) {
    return `<img src="${escapeHtml(productImage(product))}" alt="${escapeHtml(product.name)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${escapeHtml(fallbackProductImage(product))}';" style="--position: ${imagePosition(product)}; --fit: ${imageFit(product)}; --scale: ${imageScale(product)}" />`;
  }

  return `
    <div class="product-photo-placeholder">
      <span>${escapeHtml(product.category)}</span>
      <strong>${escapeHtml(product.name)}</strong>
      <small>Real packet photo pending</small>
    </div>
  `;
}

function optimizeImageLoading() {
  const heroImage = document.querySelector(".page-hero img, .hero-panel img, .landing-hero img");
  if (heroImage) {
    heroImage.loading = "eager";
    heroImage.decoding = "async";
    heroImage.fetchPriority = "high";
  }

  document.querySelectorAll("img").forEach((image) => {
    if (image === heroImage || image.loading === "eager") return;
    image.loading = "lazy";
    image.decoding = "async";
  });
}

function productUrl(product) {
  return `./product.html?id=${encodeURIComponent(product.id)}`;
}

function imagePosition(product) {
  return product.position || "center";
}

function imageFit(product) {
  return product.fit || "cover";
}

function imageScale(product) {
  return product.scale || "1.06";
}

function productFilterMatch(product, filter) {
  if (filter === "all") return true;
  if (filter === "nonveg-masala") return NON_VEG_MASALA_IDS.has(product.id);
  if (filter === "bulk") return BULK_PACK_IDS.has(product.id);
  return product.category === filter;
}

function productSearchText(product) {
  const group = NON_VEG_MASALA_IDS.has(product.id) ? "non veg non-veg seafood meat chicken mutton" : "";
  const pack = BULK_PACK_IDS.has(product.id) ? "bulk wholesale refill large pack" : "";
  return `${product.name} ${product.category} ${product.description} ${group} ${pack} ${(product.details.ingredients || []).join(" ")}`.toLowerCase();
}

function sortFeaturedProducts(products) {
  return products.toSorted((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    const aAvailable = isProductAvailable(a) ? 1 : 0;
    const bAvailable = isProductAvailable(b) ? 1 : 0;
    if (aAvailable !== bAvailable) return bAvailable - aAvailable;
    if (Number(a.rating || 0) !== Number(b.rating || 0)) return Number(b.rating || 0) - Number(a.rating || 0);
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

function getFilteredProducts() {
  const search = state.search.trim().toLowerCase();
  let visible = catalog.filter((product) => {
    return productFilterMatch(product, state.filter) && (!search || productSearchText(product).includes(search));
  });

  if (state.sort === "featured") visible = sortFeaturedProducts(visible);
  if (state.sort === "low") visible = visible.toSorted((a, b) => a.price - b.price);
  if (state.sort === "high") visible = visible.toSorted((a, b) => b.price - a.price);
  if (state.sort === "rating") visible = visible.toSorted((a, b) => b.rating - a.rating);

  return visible;
}

function renderProductCard(product) {
  const available = isProductAvailable(product);
  return `
    <article class="product-card">
      <div class="product-media">
        ${renderProductVisual(product)}
        <span class="product-badge">${product.badge}</span>
      </div>
      <div class="product-body">
        <div class="product-meta">
          <span>${product.category}</span>
          <span class="rating">${product.rating}/5</span>
        </div>
        <h3>${product.name}</h3>
        <p>${product.description}</p>
        <div class="clean-label-line">
          <i data-lucide="leaf"></i>
          No artificial colors or synthetic flavor shortcuts
        </div>
        <span class="stock-pill is-${getStockStatus(product)}">${escapeHtml(getStockLabel(product))}</span>
        ${renderProductPricing(product)}
        <div class="card-actions">
          <a class="detail-button" href="${productUrl(product)}">View details</a>
          <button type="button" data-add="${product.id}" ${available ? "" : "disabled"}>
            <i data-lucide="plus"></i>
            ${available ? "Add to cart" : "Unavailable"}
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderCategoryCard(product) {
  const available = isProductAvailable(product);
  return `
    <article class="category-card">
      <div class="category-thumb">
        ${renderProductVisual(product)}
      </div>
      <div class="category-info">
        <span>${product.badge}</span>
        <h3>${product.name}</h3>
        ${renderProductPricing(product, "category")}
        <small class="clean-label-line">
          <i data-lucide="leaf"></i>
          Pure pantry direction
        </small>
        <span class="stock-pill is-${getStockStatus(product)}">${escapeHtml(getStockLabel(product))}</span>
        <div class="category-actions">
          <a class="detail-button" href="${productUrl(product)}">Details</a>
          <button type="button" data-add="${product.id}" ${available ? "" : "disabled"}>
            <i data-lucide="plus"></i>
            ${available ? "Add" : "Unavailable"}
          </button>
        </div>
      </div>
    </article>
  `;
}

function bindAddButtons() {
  // Cart actions use one delegated listener so newly rendered product cards stay interactive.
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

function getHomeRangeProducts(range) {
  if (range === "nonveg-masala") return sortFeaturedProducts(catalog.filter((product) => NON_VEG_MASALA_IDS.has(product.id)));
  if (range === "bulk") return sortFeaturedProducts(catalog.filter((product) => BULK_PACK_IDS.has(product.id)));
  if (range === "masala") {
    return sortFeaturedProducts(catalog.filter((product) => product.category === "masala" && !NON_VEG_MASALA_IDS.has(product.id)));
  }
  return sortFeaturedProducts(catalog.filter((product) => product.category === range));
}

function renderHomeRange(range = state.homeRange) {
  if (!homeRangePanel) return;
  const selectedRange = HOME_RANGE_CONFIG[range] ? range : "makhana";
  const config = HOME_RANGE_CONFIG[selectedRange];
  const products = getHomeRangeProducts(selectedRange).slice(0, 4);

  state.homeRange = selectedRange;
  homeRangePanel.setAttribute("role", "tabpanel");
  homeRangeTabs.forEach((button) => {
    const active = button.dataset.homeRangeTab === selectedRange;
    button.classList.toggle("is-active", active);
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(active));
  });

  homeRangePanel.innerHTML = `
    <div class="home-range-copy">
      <p class="eyebrow">${escapeHtml(config.eyebrow)}</p>
      <h3>${escapeHtml(config.title)}</h3>
      <p>${escapeHtml(config.copy)}</p>
      <div class="home-range-points">
        ${config.points.map((point) => `<span><i data-lucide="check-circle-2"></i>${escapeHtml(point)}</span>`).join("")}
      </div>
      <a class="primary-link" href="${escapeHtml(config.href)}">${escapeHtml(config.cta)}</a>
    </div>
    <div class="home-range-products" aria-label="${escapeHtml(config.eyebrow)} preview products">
      ${
        products.length
          ? products.map(renderCategoryCard).join("")
          : `<article class="admin-empty">Products coming soon in this range.</article>`
      }
    </div>
  `;

  bindAddButtons(homeRangePanel);
  refreshIcons();
}

function renderCategoryProducts() {
  const categorySections = [
    { grid: makhanaProductGrid, products: catalog.filter((product) => product.category === "makhana") },
    { grid: masalaProductGrid, products: catalog.filter((product) => product.category === "masala" && !NON_VEG_MASALA_IDS.has(product.id)) },
    { grid: nonVegMasalaProductGrid, products: catalog.filter((product) => NON_VEG_MASALA_IDS.has(product.id)) },
    { grid: pohaProductGrid, products: catalog.filter((product) => product.category === "poha") },
    { grid: comboProductGrid, products: catalog.filter((product) => product.category === "combo") },
    { grid: bulkProductGrid, products: catalog.filter((product) => BULK_PACK_IDS.has(product.id)) }
  ];

  categorySections.forEach(({ grid, products }) => {
    if (!grid) return;
    grid.innerHTML = products.length
      ? products.map(renderCategoryCard).join("")
      : `<article class="admin-empty">Products coming soon.</article>`;
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

function renderProductTrust(details, product) {
  const trustItems = details.trust?.length
    ? details.trust
    : ["No artificial color direction", "Pure pantry positioning", "Batch and pack-date ready", "Wholesale enquiry support"];
  const checklist = [
    ["Allergen note", details.allergen || STORE_CONFIG.defaultAllergenNotice],
    ["Manufacturer / packer", businessValue("manufacturer")],
    ["FSSAI", businessValue("fssai")],
    ["GST", businessValue("gst")]
  ];

  return `
    <div class="product-trust-panel" aria-label="Product trust highlights">
      <div>
        <span>Trust promise</span>
        <strong>${escapeHtml(product?.name || STORE_CONFIG.shopName)} is presented with clear label and buyer proof areas.</strong>
      </div>
      <div>
        <ul>${trustItems.map((item) => `<li><i data-lucide="shield-check"></i>${escapeHtml(item)}</li>`).join("")}</ul>
        <div class="product-proof-grid">
          ${checklist
            .map(
              ([label, value]) => `
                <span>
                  <strong>${escapeHtml(label)}</strong>
                  <small>${escapeHtml(value)}</small>
                </span>
              `
            )
            .join("")}
        </div>
        <p>${escapeHtml(STORE_CONFIG.claimDisclaimer)}</p>
      </div>
    </div>
  `;
}

function renderExportBuyerCta(product) {
  const params = new URLSearchParams({ product: product.name, range: product.category });
  return `
    <aside class="product-export-cta" aria-label="Export buyer enquiry">
      <div>
        <span>For distributors and importers</span>
        <strong>Request an export quote for ${escapeHtml(product.name)}.</strong>
        <p>Share your market, pack format, volume, label requirement, and preferred quote basis. Final MOQ, price, freight, and documents are confirmed in writing.</p>
      </div>
      <a href="./wholesale.html?${params.toString()}">
        <i data-lucide="send"></i>
        Request export quote
      </a>
    </aside>
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
  const available = isProductAvailable(product);
  document.title = `${product.name} | BandEvi Gourmet`;

  singleProductPage.innerHTML = `
    <section class="single-product-hero" aria-labelledby="single-product-title">
      <div class="single-product-media">
        ${renderProductVisual(product)}
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
        ${renderProductPricing(product, "single")}
        <p class="single-product-price-note">${escapeHtml(getStockLabel(product))} / cart booking and WhatsApp support available</p>
        <div class="single-product-actions">
          <button type="button" data-add="${product.id}" ${available ? "" : "disabled"}>
            <i data-lucide="plus"></i>
            ${available ? "Add to cart" : "Unavailable"}
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
      ${renderProductTrust(details, product)}
      ${renderExportBuyerCta(product)}
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
  const available = isProductAvailable(product);
  closeCart();
  productDetailContent.innerHTML = `
    <div class="detail-hero">
      ${renderProductVisual(product)}
      <div>
        <span class="product-badge">${product.badge}</span>
        <h3>${product.name}</h3>
        <p>${product.description}</p>
        ${renderProductPricing(product, "detail")}
        <div class="detail-price">
          <span>${product.rating}/5 rating</span>
          <span>${escapeHtml(getStockLabel(product))}</span>
        </div>
        <button type="button" data-add="${product.id}" ${available ? "" : "disabled"}>
          <i data-lucide="plus"></i>
          ${available ? "Add to cart" : "Unavailable"}
        </button>
      </div>
    </div>

    ${renderProductFacts(details)}
    ${renderUsagePanel(details)}
    ${renderProductTrust(details, product)}
    ${renderExportBuyerCta(product)}

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
  const product = catalog.find((item) => item.id === id);
  const nextQuantity = (state.cart.get(id) || 0) + 1;
  if (!isProductAvailable(product, nextQuantity)) {
    showToast(`${product?.name || "This product"} is not available in that quantity`);
    return;
  }

  state.cart.set(id, nextQuantity);
  state.checkoutStep = "cart";
  saveCart();
  renderCart();
  showToast("Added to cart");
  openCart();
}

function setQuantity(id, quantity) {
  if (quantity <= 0) {
    state.cart.delete(id);
  } else {
    const product = catalog.find((item) => item.id === id);
    if (!isProductAvailable(product, quantity)) {
      showToast(`${product?.name || "This product"} is not available in that quantity`);
      return;
    }
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
  const couponValue = calculateCouponDiscount(state.activeCoupon, subtotal);
  const discount = couponValue.discount;
  const delivery = subtotal === 0 || couponValue.freeDelivery || subtotal - discount >= FREE_DELIVERY_AT ? 0 : DEFAULT_DELIVERY_FEE;
  const total = subtotal - discount + delivery;
  return {
    subtotal,
    discount,
    delivery,
    total,
    couponCode: state.activeCoupon?.code || "",
    freeDeliveryCoupon: couponValue.freeDelivery
  };
}

function getCartCategorySummary(lines) {
  return lines.reduce((summary, item) => {
    summary[item.category] = (summary[item.category] || 0) + item.quantity;
    return summary;
  }, {});
}

function renderCartProgress(totals) {
  const qualifiedAmount = Math.max(0, totals.subtotal - totals.discount);
  const remaining = Math.max(0, FREE_DELIVERY_AT - qualifiedAmount);
  const progress = Math.min(100, Math.round((qualifiedAmount / FREE_DELIVERY_AT) * 100));

  return `
    <div class="cart-progress" aria-label="Free delivery progress">
      <div>
        <strong>${remaining ? `${money(remaining)} away from free delivery` : "Free delivery unlocked"}</strong>
        <span>${remaining ? "Add more pantry products to save the delivery charge." : "This cart qualifies for free delivery across serviceable India pin codes."}</span>
      </div>
      <div class="cart-progress-track">
        <span style="width: ${progress}%"></span>
      </div>
    </div>
  `;
}

function renderCartHighlights(lines, totals) {
  const count = lines.reduce((sum, item) => sum + item.quantity, 0);
  const categorySummary = getCartCategorySummary(lines);
  const categoryText = Object.entries(categorySummary)
    .map(([category, quantity]) => `${quantity} ${category}`)
    .join(" / ");

  return `
    <div class="cart-hero-panel">
      <div>
        <p class="eyebrow">Checkout cart</p>
        <h3>${count} item${count === 1 ? "" : "s"} ready for booking</h3>
        <span>${categoryText || "Add makhana, masala, poha, or combo packs."}</span>
      </div>
      <div class="cart-hero-total">
        <small>Payable total</small>
        <strong>${money(totals.total)}</strong>
        <span>${totals.delivery ? `${money(totals.delivery)} delivery` : "Free delivery"}</span>
      </div>
    </div>
    ${renderCartProgress(totals)}
  `;
}

function renderCartJourney() {
  return `
    <div class="cart-journey" aria-label="Order journey">
      <article>
        <i data-lucide="shopping-bag"></i>
        <strong>Book cart</strong>
        <span>Create a booking ID from checkout.</span>
      </article>
      <article>
        <i data-lucide="package-check"></i>
        <strong>Pack order</strong>
        <span>Seller confirms stock, pack size, and dispatch.</span>
      </article>
      <article>
        <i data-lucide="truck"></i>
        <strong>Track status</strong>
        <span>Use phone and booking ID on the tracking page.</span>
      </article>
    </div>
  `;
}

function getRecommendedProducts() {
  const preferredIds = ["classic-makhana", "garam-masala", "poha-1kg-pouch"];
  return preferredIds.map((id) => catalog.find((product) => product.id === id)).filter(Boolean);
}

function renderEmptyCartRecommendations() {
  const suggestions = getRecommendedProducts();
  if (!suggestions.length) return "";

  return `
    <div class="empty-cart-recommendations" aria-label="Recommended products">
      ${suggestions
        .map(
          (product) => `
            <article>
              <a href="${productUrl(product)}" aria-label="Open ${escapeHtml(product.name)} details">
                ${renderProductVisual(product)}
              </a>
              <div>
                <strong>${escapeHtml(product.name)}</strong>
                ${renderCompactPricing(product)}
              </div>
              <button type="button" data-add="${product.id}">
                <i data-lucide="plus"></i>
                Add
              </button>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function getCartAddOnProducts(lines) {
  const selectedIds = new Set(lines.map((item) => item.id));
  const selectedCategories = new Set(lines.map((item) => item.category));
  const preferredIds = [
    "garam-masala",
    "sabji-masala",
    "paneer-masala",
    "classic-makhana",
    "peri-peri-makhana",
    "poha-1kg-pouch",
    "snack-combo"
  ];
  const preferred = preferredIds.map((id) => catalog.find((product) => product.id === id)).filter(Boolean);
  const categoryBoost = catalog.filter(
    (product) => !selectedIds.has(product.id) && !selectedCategories.has(product.category) && product.active !== false
  );
  const merged = [...preferred, ...categoryBoost]
    .filter((product) => product && !selectedIds.has(product.id) && isProductAvailable(product, 1))
    .filter((product, index, all) => all.findIndex((item) => item.id === product.id) === index);

  return merged.slice(0, 4);
}

function renderCartCouponCard(totals) {
  const coupon = getDisplayCoupon();
  const couponApplied = Boolean(state.activeCoupon);
  const discountText = couponApplied
    ? totals.freeDeliveryCoupon
      ? `Free delivery with ${coupon.code}`
      : `${money(totals.discount)} saved with ${coupon.code}`
    : `Use ${coupon.code} for ${couponValueText(coupon)}`;
  const helperText = couponApplied
    ? "Offer is already applied to this booking."
    : `${coupon.label || "Apply this offer"} before entering delivery details.`;

  return `
    <div class="cart-coupon-card">
      <div>
        <strong>${escapeHtml(discountText)}</strong>
        <span>${escapeHtml(helperText)}</span>
      </div>
      <button type="button" data-apply-cart-coupon="${escapeHtml(coupon.code)}" ${couponApplied ? "disabled" : ""}>
        ${couponApplied ? "Applied" : "Apply"}
      </button>
    </div>
  `;
}

function renderCartAddOns(lines) {
  const suggestions = getCartAddOnProducts(lines);
  if (!suggestions.length) return "";

  return `
    <section class="cart-add-on-panel" aria-label="Complete your cart">
      <div class="cart-add-on-head">
        <span class="eyebrow">Complete your cart</span>
        <strong>Add trusted pantry picks</strong>
      </div>
      <div class="cart-add-on-grid">
        ${suggestions
          .map(
            (product) => `
              <article class="cart-add-on-card">
                <a href="${productUrl(product)}" aria-label="Open ${escapeHtml(product.name)} details">
                  ${renderProductVisual(product)}
                </a>
                <div>
                  <strong>${escapeHtml(product.name)}</strong>
                  ${renderCompactPricing(product)}
                </div>
                <button type="button" data-add="${product.id}">
                  <i data-lucide="plus"></i>
                  Add
                </button>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function getCheckoutFormData() {
  return checkoutForm ? new FormData(checkoutForm) : new FormData();
}

function isBusinessOrderType(orderType) {
  const type = String(orderType || "").toLowerCase();
  return type.includes("wholesale") || type.includes("export");
}

function updateCheckoutExtraFields() {
  if (!checkoutExtraFields || !orderTypeSelect) return;
  const type = String(orderTypeSelect.value || "").toLowerCase();
  const isGift = type.includes("gift");
  const isBusiness = isBusinessOrderType(type);

  checkoutExtraFields.querySelectorAll(".gift-field").forEach((field) => {
    field.classList.toggle("is-hidden", !isGift);
  });
  checkoutExtraFields.querySelectorAll(".business-field").forEach((field) => {
    field.classList.toggle("is-hidden", !isBusiness);
  });
}

function getCheckoutAdminNote(data) {
  const notes = [];
  const giftNote = String(data.get("giftNote") || "").trim();
  const businessName = String(data.get("businessName") || "").trim();
  const gstNumber = String(data.get("gstNumber") || "").trim();
  const buyerVolume = String(data.get("buyerVolume") || "").trim();

  if (giftNote) notes.push(`Gift note: ${giftNote}`);
  if (businessName) notes.push(`Business/store: ${businessName}`);
  if (gstNumber) notes.push(`GST/tax ID: ${gstNumber}`);
  if (buyerVolume) notes.push(`Expected volume: ${buyerVolume}`);

  return notes.join(" | ");
}

function formatCartCategory(category) {
  const labels = {
    makhana: "Makhana",
    masala: "Masala",
    poha: "Poha",
    combo: "Combo"
  };
  return labels[category] || String(category || "Product");
}

function getCartPackCount(lines) {
  return lines.reduce((sum, item) => sum + item.quantity, 0);
}

function getCartRangeText(lines) {
  const ranges = [...new Set(lines.map((item) => formatCartCategory(item.category)))];
  return ranges.length ? ranges.join(" + ") : "Makhana + Masala + Poha";
}

function getFreeDeliverySummary(totals) {
  const qualifiedAmount = Math.max(0, totals.subtotal - totals.discount);
  const remaining = Math.max(0, FREE_DELIVERY_AT - qualifiedAmount);
  return remaining ? `${money(remaining)} more for free delivery` : "Free delivery unlocked";
}

function renderCheckoutFlowCards(activeStep = state.checkoutStep) {
  const flow = [
    { id: "cart", icon: "shopping-bag", title: "Cart", text: "Pack sizes and quantity checked" },
    { id: "details", icon: "package-check", title: "Details", text: "Delivery and payment choice" },
    { id: "review", icon: "badge-check", title: "Review", text: "Confirm COD or pay online" }
  ];
  const activeIndex = Math.max(0, flow.findIndex((item) => item.id === activeStep));

  return `
    <div class="checkout-flow-cards" aria-label="Checkout flow">
      ${flow
        .map((item, index) => {
          const statusClass = [
            index < activeIndex ? "is-done" : "",
            index === activeIndex ? "is-active" : ""
          ]
            .filter(Boolean)
            .join(" ");
          return `
            <article class="${statusClass}">
              <i data-lucide="${item.icon}"></i>
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.text)}</span>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderCartAssuranceCards(lines, totals) {
  const packCount = getCartPackCount(lines);
  const rangeText = getCartRangeText(lines);
  const deliveryText = getFreeDeliverySummary(totals);

  return `
    <div class="cart-assurance-grid" aria-label="Buyer assurance">
      <span>
        <i data-lucide="leaf"></i>
        <strong>Pure pantry focus</strong>
        <small>No artificial color direction, clean ingredient-led products.</small>
      </span>
      <span>
        <i data-lucide="package-check"></i>
        <strong>${packCount || "No"} pack${packCount === 1 ? "" : "s"}</strong>
        <small>${escapeHtml(rangeText)} selected for this booking.</small>
      </span>
      <span>
        <i data-lucide="truck"></i>
        <strong>${escapeHtml(deliveryText)}</strong>
        <small>Delivery is calculated before booking confirmation.</small>
      </span>
      <span>
        <i data-lucide="shield-check"></i>
        <strong>Status tracking</strong>
        <small>Booking ID, packing status, courier, and delivery note ready.</small>
      </span>
    </div>
  `;
}

function renderCartDeliveryPlan(lines) {
  const hasItems = lines.length > 0;

  return `
    <div class="cart-delivery-plan">
      <div>
        <strong>${hasItems ? "Next step: add delivery details" : "Build a booking-ready cart"}</strong>
        <span>${hasItems ? "Customer phone, address, and payment mode unlock the final review screen." : "Add products first, then the checkout will collect delivery and tracking details."}</span>
      </div>
      <div>
        <span><b>1</b>Review products</span>
        <span><b>2</b>Add delivery details</span>
        <span><b>3</b>Review, then confirm COD or pay online</span>
      </div>
    </div>
  `;
}

function renderCartStepPanel(lines, totals) {
  return `
    <div class="cart-side-panel">
      <p class="eyebrow">Cart check</p>
      <h3>${lines.length ? "Your products are ready." : "Start with a trusted pantry cart."}</h3>
      <p>${lines.length ? "Review quantity, apply coupon if available, then continue to one clean checkout page." : "Choose from popular BandEvi Gourmet products and build a booking-ready cart."}</p>
      ${renderCheckoutFlowCards("cart")}
      <div class="cart-side-totals">
        <span><strong>${money(totals.subtotal)}</strong><small>Subtotal</small></span>
        <span><strong>${totals.delivery ? money(totals.delivery) : "Free"}</strong><small>Delivery</small></span>
        <span><strong>${money(totals.total)}</strong><small>Total</small></span>
      </div>
      ${renderCartAssuranceCards(lines, totals)}
      ${renderCartDeliveryPlan(lines)}
      <button class="checkout-button" type="button" data-cart-goto="details" ${lines.length ? "" : "disabled"}>
        Continue to checkout
      </button>
      <a class="secondary-checkout-link" href="./products.html">Browse more products</a>
    </div>
  `;
}

function renderReviewItems(lines) {
  if (!lines.length) return `<p class="portal-empty">No cart items to review.</p>`;

  return lines
    .map(
      (item) => `
        <div class="review-line is-product">
          <span>
            <b>${escapeHtml(item.name)}</b>
            <small>${escapeHtml(formatCartCategory(item.category))} / ${escapeHtml(item.size)} / Qty ${item.quantity}</small>
          </span>
          <strong>${money(item.lineTotal)}</strong>
        </div>
      `
    )
    .join("");
}

function renderReviewChecklist(payment, totals) {
  return `
    <div class="review-checklist" aria-label="Booking readiness checklist">
      <span><i data-lucide="badge-check"></i><strong>Booking ID</strong><small>Created immediately after confirmation.</small></span>
      <span><i data-lucide="user-check"></i><strong>Customer access</strong><small>Phone number and booking ID open the tracking page.</small></span>
      <span><i data-lucide="credit-card"></i><strong>${escapeHtml(payment)}</strong><small>${escapeHtml(getPaymentNote(payment, totals.total))}</small></span>
      <span><i data-lucide="message-circle"></i><strong>Seller alerts</strong><small>Admin can update packing, courier, and delivery status.</small></span>
    </div>
  `;
}

function renderReviewPaymentChoices(payment, totals) {
  const choices = [
    {
      value: "Razorpay online",
      icon: "credit-card",
      title: "Pay online",
      detail: `Pay ${money(totals.total)} by UPI, card, netbanking, or wallet through Razorpay.`
    },
    {
      value: "Cash on delivery",
      icon: "badge-check",
      title: "Cash on delivery",
      detail: "Pay cash when the order is delivered."
    }
  ];

  return `
    <div class="review-payment-options" role="radiogroup" aria-label="Choose payment method">
      <strong>Choose payment method</strong>
      <div>
        ${choices
          .map(
            (choice) => `
              <button class="review-payment-option ${payment === choice.value ? "is-selected" : ""}" type="button" data-review-payment="${choice.value}" role="radio" aria-checked="${String(payment === choice.value)}">
                <i data-lucide="${choice.icon}"></i>
                <span><b>${choice.title}</b><small>${choice.detail}</small></span>
                <i class="review-payment-check" data-lucide="${payment === choice.value ? "check-circle-2" : "circle"}"></i>
              </button>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderOrderReview() {
  const lines = getCartLines();
  const totals = getTotals();
  const data = getCheckoutFormData();
  const payment = String(data.get("payment") || "Cash on delivery");
  const orderType = String(data.get("orderType") || "Retail home order");
  const adminNote = getCheckoutAdminNote(data);

  return `
    <div class="cart-review-card">
      <p class="eyebrow">Review booking</p>
      <h3>Confirm everything before creating the booking ID.</h3>
      ${renderCheckoutFlowCards("review")}
      <div class="review-support-card">
        <span><strong>${getCartPackCount(lines)}</strong><small>Total packs</small></span>
        <span><strong>${escapeHtml(getCartRangeText(lines))}</strong><small>Product range</small></span>
        <span><strong>${escapeHtml(getFreeDeliverySummary(totals))}</strong><small>Delivery status</small></span>
      </div>
      <div class="review-block">
        <strong>Items</strong>
        ${renderReviewItems(lines)}
      </div>
      <div class="review-block review-customer">
        <strong>Customer and delivery</strong>
        <span>${escapeHtml(String(data.get("name") || "Name pending"))}</span>
        <span>${escapeHtml(String(data.get("phone") || "Phone pending"))}</span>
        <span>${escapeHtml(String(data.get("countryCity") || "Location pending"))}</span>
        <span>${escapeHtml(String(data.get("address") || "Address pending"))}</span>
        ${adminNote ? `<span>${escapeHtml(adminNote)}</span>` : ""}
      </div>
      <div class="review-block">
        <strong>Booking terms</strong>
        <div class="review-line"><span>Order type</span><strong>${escapeHtml(orderType)}</strong></div>
      </div>
      ${renderReviewPaymentChoices(payment, totals)}
      ${renderReviewChecklist(payment, totals)}
      <div class="review-total-card">
        <div><span>Subtotal</span><span>${money(totals.subtotal)}</span></div>
        <div><span>Coupon discount</span><span>${totals.discount ? `-${money(totals.discount)}` : money(0)}</span></div>
        <div><span>Delivery estimate</span><span>${totals.delivery ? money(totals.delivery) : "Free"}</span></div>
        <div><strong>Total</strong><strong>${money(totals.total)}</strong></div>
      </div>
      <div class="review-actions">
        <button class="secondary-checkout-button" type="button" data-cart-goto="details">Edit details</button>
        <button class="whatsapp-button" type="button" data-whatsapp-review>
          <i data-lucide="message-circle"></i>
          WhatsApp order
        </button>
        <button class="checkout-button" type="button" data-place-order>
          <i data-lucide="${payment === "Razorpay online" ? "credit-card" : "badge-check"}"></i>
          ${payment === "Razorpay online" ? "Pay securely with Razorpay" : "Confirm cash on delivery order"}
        </button>
      </div>
    </div>
  `;
}

function setCheckoutStep(step, options = {}) {
  const nextStep = ["cart", "details", "review"].includes(step) ? step : "cart";
  if (nextStep === "details" && !state.cart.size) {
    showToast("Add at least one product first");
    return;
  }
  if (nextStep === "review" && options.validate) {
    if (!state.cart.size) {
      showToast("Add at least one product first");
      return;
    }
    const stockIssue = getCartStockIssue();
    if (stockIssue) {
      showToast(stockIssue);
      return;
    }
    if (!checkoutForm?.reportValidity()) return;
  }

  state.checkoutStep = nextStep;
  renderCheckoutStep();
}

function bindCheckoutReviewActions() {
  cartReviewPanel?.querySelectorAll("[data-cart-goto]").forEach((button) => {
    button.addEventListener("click", () => setCheckoutStep(button.dataset.cartGoto));
  });
  cartReviewPanel?.querySelector("[data-place-order]")?.addEventListener("click", () => {
    state.checkoutStep = "review";
    checkoutForm?.requestSubmit();
  });
  cartReviewPanel?.querySelector("[data-whatsapp-review]")?.addEventListener("click", () => {
    state.checkoutStep = "review";
    submitWhatsAppOrder();
  });
  cartReviewPanel?.querySelectorAll("[data-review-payment]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!checkoutForm?.elements.payment) return;
      checkoutForm.elements.payment.value = button.dataset.reviewPayment;
      renderPaymentDetails();
      renderCheckoutStep();
    });
  });
}

function renderCheckoutStep() {
  if (!cartDrawer) return;
  const lines = getCartLines();
  const totals = getTotals();
  if (!lines.length) state.checkoutStep = "cart";

  cartDrawer.dataset.step = state.checkoutStep;
  cartStepper?.querySelectorAll("[data-cart-step]").forEach((button) => {
    const active = button.dataset.cartStep === state.checkoutStep;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });

  if (checkoutForm) checkoutForm.hidden = state.checkoutStep !== "details";
  if (cartReviewPanel) {
    cartReviewPanel.hidden = state.checkoutStep === "details";
    cartReviewPanel.innerHTML = state.checkoutStep === "review" ? renderOrderReview() : renderCartStepPanel(lines, totals);
    cartReviewPanel.scrollTop = 0;
    bindCheckoutReviewActions();
  }

  const checkoutButton = checkoutForm?.querySelector(".checkout-button");
  if (checkoutButton) {
    checkoutButton.innerHTML = `<i data-lucide="badge-check"></i> Review order`;
  }

  updateCheckoutExtraFields();
  refreshIcons();
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
  if (payment === "Razorpay online") {
    return `Pay ${money(total)} securely by UPI, card, netbanking, or wallet through Razorpay.`;
  }

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
  const adminNote = getCheckoutAdminNote(data);
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
    state.activeCoupon ? `Coupon: ${state.activeCoupon.code} (${state.activeCoupon.label})` : "",
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
    `Payment Note: ${getPaymentNote(payment, totals.total)}`,
    adminNote ? `Buyer Note: ${adminNote}` : ""
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
  const isCashOnDelivery = payment === "Cash on delivery";

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
    paymentState: isCashOnDelivery ? "Cash on delivery" : "Payment pending",
    paymentNote: getPaymentNote(payment, totals.total),
    courier: "",
    trackingCode: "",
    trackingUrl: "",
    dispatchDate: "",
    eta: "",
    adminNote: getCheckoutAdminNote(data),
    coupon: state.activeCoupon
      ? {
          code: state.activeCoupon.code,
          label: state.activeCoupon.label,
          type: state.activeCoupon.type,
          value: state.activeCoupon.value,
          discount: totals.discount,
          freeDelivery: totals.freeDeliveryCoupon
        }
      : null,
    totals,
    items: lines.map((item) => ({
      id: item.id,
      name: item.name,
      size: item.size,
      quantity: item.quantity,
      price: item.price,
      offerPrice: item.offerPrice || item.price,
      mrp: item.mrp || item.price,
      discountPrice: item.discountPrice || 0,
      discountPercent: item.discountPercent || 0,
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
    const params = getCustomerAuthParams(cleanPhone);
    const payload = await apiRequest(`/api/customer/dashboard?${params.toString()}`);
    if (payload.customer) {
      state.customer = { ...(state.customer || {}), ...payload.customer };
      writeJson(STORAGE_KEYS.customer, state.customer);
    }
    state.customerSummary = payload.summary || null;
    state.customerEnquiries = payload.enquiries || [];
    state.customerSupportRequests = payload.supportRequests || [];
    state.customerSyncStatus = "synced";
    if (payload.orders?.length) upsertOrderRecords(payload.orders);
    else renderCustomerPortal();
    return payload.orders || [];
  } catch (error) {
    if (/pin/i.test(error.message || "")) {
      state.customerSyncStatus = "locked";
      renderCustomerPortal();
      return [];
    }

    try {
      const params = getCustomerAuthParams(cleanPhone);
      const payload = await apiRequest(`/api/orders/customer?${params.toString()}`);
      state.customerSyncStatus = "synced";
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

function renderConfirmationNextSteps(order, source, trackUrl, supportUrl) {
  const isLive = source === "live";
  const steps = [
    {
      title: "Booking saved",
      text: isLive
        ? "The live order desk has received this booking and can update its status."
        : "The booking is saved on this device and will stay available for tracking."
    },
    {
      title: "Order desk review",
      text: "Products, delivery area, payment note, and customer phone are checked before confirmation."
    },
    {
      title: "Packing update",
      text: "Once products are packed, courier, tracking code, dispatch date, and ETA can be added by admin."
    },
    {
      title: "Customer support",
      text: "Use the booking ID for support, cancellation, refund, or delivery conversations."
    }
  ];

  return `
    <section class="confirmation-next-panel" aria-labelledby="confirmation-next-title">
      <div class="section-head compact">
        <div>
          <p class="eyebrow">What happens next</p>
          <h2 id="confirmation-next-title">Your order is ready for tracking.</h2>
        </div>
        <a href="${trackUrl}">Open tracking</a>
      </div>
      <div class="confirmation-next-grid">
        ${steps
          .map(
            (step, index) => `
              <article>
                <span>${index + 1}</span>
                <strong>${escapeHtml(step.title)}</strong>
                <p>${escapeHtml(step.text)}</p>
              </article>
            `
          )
          .join("")}
      </div>
      <div class="confirmation-support-panel">
        <span>
          <strong>Booking ID</strong>
          ${escapeHtml(order.id)}
        </span>
        <span>
          <strong>Payment</strong>
          ${escapeHtml(order.paymentState || order.payment || "Payment pending")}
        </span>
        <span>
          <strong>Delivery ETA</strong>
          ${escapeHtml(order.eta || "Shared after dispatch")}
        </span>
        <a href="${supportUrl}" target="_blank" rel="noopener noreferrer">Contact support</a>
      </div>
    </section>
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

      ${renderConfirmationNextSteps(order, source, trackUrl, supportUrl)}

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
  if (!state.customer) return;

  if (customerLoginForm) {
    if (customerLoginForm.elements.customerName) customerLoginForm.elements.customerName.value = state.customer.name || "";
    if (customerLoginForm.elements.customerPhone) customerLoginForm.elements.customerPhone.value = state.customer.phone || "";
    if (customerLoginForm.elements.customerEmail) customerLoginForm.elements.customerEmail.value = state.customer.email || "";
    if (customerLoginForm.elements.customerLocation) customerLoginForm.elements.customerLocation.value = state.customer.location || "";
  }
  if (customerSignupForm) {
    if (customerSignupForm.elements.customerName) customerSignupForm.elements.customerName.value = state.customer.name || "";
    if (customerSignupForm.elements.customerPhone) customerSignupForm.elements.customerPhone.value = state.customer.phone || "";
    if (customerSignupForm.elements.customerEmail) customerSignupForm.elements.customerEmail.value = state.customer.email || "";
    if (customerSignupForm.elements.customerLocation) customerSignupForm.elements.customerLocation.value = state.customer.location || "";
  }
}

function setAuthMode(mode = "signin") {
  const nextMode = ["signin", "signup", "forgot"].includes(mode) ? mode : "signin";
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.authMode === nextMode);
    button.setAttribute("aria-pressed", String(button.dataset.authMode === nextMode));
  });
  document.querySelectorAll("[data-auth-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.authPanel === nextMode);
  });
  if (nextMode === "signin") setLoginStep(customerLoginForm?.dataset.loginStep || "identity");
}

function setLoginStep(step = "identity", options = {}) {
  if (!customerLoginForm) return;
  const nextStep = step === "secure" ? "secure" : "identity";
  customerLoginForm.dataset.loginStep = nextStep;
  customerLoginForm.querySelectorAll(".account-login-step").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.step === nextStep);
  });
  const markers = customerLoginForm.querySelectorAll(".auth-step-line span");
  markers.forEach((marker, index) => marker.classList.toggle("is-active", index === 0 || nextStep === "secure"));
  if (options.focus) {
    if (nextStep === "secure") {
      customerLoginForm.elements.customerPin?.focus();
    } else {
      customerLoginForm.elements.customerPhone?.focus();
    }
  }
}

function openCustomerDashboard(customer, message = "Opening dashboard...") {
  if (!customer) return;
  saveCustomer(customer);
  prefillCheckoutFromCustomer();
  prefillCustomerSupportForm();
  renderCustomerPortal();
  setCustomerLoginStatus(message);
  customerDashboard?.scrollIntoView({ block: "start" });
  if (window.location.hash !== "#customer-dashboard") {
    window.history.replaceState(null, "", `${window.location.pathname}#customer-dashboard`);
  }
}

function setCustomerSignupStatus(message = "") {
  if (customerSignupStatus) customerSignupStatus.textContent = message;
}

function setCustomerForgotStatus(message = "") {
  if (customerForgotStatus) customerForgotStatus.textContent = message;
}

function getGoogleClientId() {
  return document.querySelector('meta[name="google-client-id"]')?.content || window.BANDEVI_GOOGLE_CLIENT_ID || "";
}

function setGoogleAuthStatus(message) {
  setCustomerLoginStatus(message);
  setCustomerSignupStatus(message);
}

function loadExternalScript(src, id) {
  const existing = document.getElementById(id);
  if (existing) {
    return existing.dataset.loaded === "true"
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          existing.addEventListener("load", resolve, { once: true });
          existing.addEventListener("error", reject, { once: true });
        });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true }
    );
    script.addEventListener("error", reject, { once: true });
    document.head.appendChild(script);
  });
}

async function loadGoogleAuthConfig() {
  if (googleAuth.clientId !== null) return googleAuth.clientId;

  try {
    const config = await apiRequest("/api/auth/config");
    googleAuth.clientId = String(config.googleClientId || getGoogleClientId() || "").trim();
  } catch {
    googleAuth.clientId = String(getGoogleClientId() || "").trim();
  }

  document.querySelectorAll("[data-google-login]").forEach((button) => {
    const configured = Boolean(googleAuth.clientId);
    button.dataset.configured = configured ? "true" : "false";
    button.disabled = !configured;
    button.title = configured ? "Continue with Google" : "Google sign-in needs GOOGLE_CLIENT_ID setup in Render.";
    button.innerHTML = configured ? "<span>G</span>Continue with Google" : "<span>G</span>Google sign-in setup pending";
  });
  return googleAuth.clientId;
}

function prefillGoogleProfile(profile = {}) {
  const name = String(profile.name || "").trim();
  const email = String(profile.email || "").trim();
  const phone = normalizePhone(customerSignupForm?.elements.customerPhone?.value || customerLoginForm?.elements.customerPhone?.value || "");

  [customerLoginForm, customerSignupForm, checkoutForm].forEach((form) => {
    if (!form) return;
    if (name && form.elements.customerName && !form.elements.customerName.value) form.elements.customerName.value = name;
    if (name && form.elements.name && !form.elements.name.value) form.elements.name.value = name;
    if (email && form.elements.customerEmail && !form.elements.customerEmail.value) form.elements.customerEmail.value = email;
    if (email && form.elements.email && !form.elements.email.value) form.elements.email.value = email;
    if (phone && form.elements.customerPhone && !form.elements.customerPhone.value) form.elements.customerPhone.value = phone;
    if (phone && form.elements.phone && !form.elements.phone.value) form.elements.phone.value = phone;
  });

  setAuthMode("signup");
  setGoogleAuthStatus("Google account verified. Add phone and PIN to finish the customer account.");
  showToast("Google profile added");
}

async function handleGoogleCredentialResponse(response = {}) {
  const credential = response.credential || "";
  if (!credential) {
    setGoogleAuthStatus("Google login did not return an account. Try again or use phone and PIN.");
    return;
  }

  setGoogleAuthStatus("Verifying Google account...");
  try {
    const result = await apiRequest("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential })
    });
    prefillGoogleProfile(result.profile || {});
  } catch (error) {
    setGoogleAuthStatus(error.message || "Google login could not be verified. Use phone and PIN for now.");
    showToast("Google login could not verify");
  }
}

async function ensureGoogleIdentityReady() {
  const clientId = await loadGoogleAuthConfig();
  if (!clientId) {
    setGoogleAuthStatus("Google login is ready. Add GOOGLE_CLIENT_ID in Render to activate it.");
    showToast("Google login needs Client ID");
    return false;
  }

  if (!googleAuth.loading) {
    googleAuth.loading = loadExternalScript("https://accounts.google.com/gsi/client", "google-identity-services");
  }
  await googleAuth.loading;

  if (!window.google?.accounts?.id) {
    throw new Error("Google login script did not load. Please try again.");
  }

  if (!googleAuth.initialized) {
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleGoogleCredentialResponse,
      cancel_on_tap_outside: false
    });
    googleAuth.initialized = true;
  }

  return true;
}

function prefillCustomerSupportForm(order = state.trackedOrder) {
  if (!customerSupportForm) return;

  const orderIdInput = customerSupportForm.elements.supportOrderId;
  const phoneInput = customerSupportForm.elements.supportPhone;
  if (orderIdInput && order?.id && !orderIdInput.value) orderIdInput.value = order.id;
  if (phoneInput && !phoneInput.value) {
    phoneInput.value = normalizePhone(order?.customer?.phone || state.customer?.phone || "");
  }
}

function renderPortalInsightCards(summary, latestOrder, openSupportRequests) {
  const nextAction = summary.nextAction || (latestOrder ? getOrderNextAction(latestOrder) : "Place a booking to start order tracking.");

  return `
    <div class="portal-insight-grid" aria-label="Account readiness">
      <span>
        <strong>${escapeHtml(latestOrder?.id || summary.latestOrderId || "No booking yet")}</strong>
        <small>Latest booking</small>
      </span>
      <span>
        <strong>${escapeHtml(nextAction)}</strong>
        <small>Next customer action</small>
      </span>
      <span>
        <strong>${openSupportRequests}</strong>
        <small>Open support requests</small>
      </span>
    </div>
  `;
}

function renderPortalCommandCenter(customer, summary, latestOrder, openSupportRequests, portalMode) {
  const phone = normalizePhone(customer?.phone || latestOrder?.customer?.phone || "");
  const trackUrl = latestOrder
    ? `./track.html?id=${encodeURIComponent(latestOrder.id)}&phone=${encodeURIComponent(phone)}`
    : "./track.html";
  const supportUrl = getWhatsAppUrl(
    latestOrder
      ? `Support request for ${STORE_CONFIG.shopName} booking ${latestOrder.id}`
      : `Support request for ${STORE_CONFIG.shopName} customer account`
  );
  const syncLabel =
    state.customerSyncStatus === "synced"
      ? "Live order desk synced"
      : state.customerSyncStatus === "locked"
        ? "PIN needed for full history"
        : "Saved on this device";

  return `
    <section class="portal-command-center" aria-label="Customer command center">
      <article>
        <span>Latest booking</span>
        <strong>${escapeHtml(latestOrder?.id || summary.latestOrderId || "No booking yet")}</strong>
        <small>${escapeHtml(latestOrder ? getStatusLabel(latestOrder.status) : "Place an order to create tracking")}</small>
      </article>
      <article>
        <span>Customer access</span>
        <strong>${escapeHtml(phone || "Phone needed")}</strong>
        <small>${escapeHtml(syncLabel)}</small>
      </article>
      <article>
        <span>Support desk</span>
        <strong>${Number(openSupportRequests || 0)} open</strong>
        <small>${escapeHtml(summary.supportRequests ? `${summary.supportRequests} total requests` : "Support by booking ID")}</small>
      </article>
      <div class="portal-command-actions">
        <a href="${trackUrl}">
          <i data-lucide="search"></i>
          ${portalMode === "track" ? "Refresh tracking" : "Track latest"}
        </a>
        <a href="${supportUrl}" target="_blank" rel="noopener noreferrer">
          <i data-lucide="message-circle"></i>
          WhatsApp support
        </a>
      </div>
    </section>
  `;
}

function renderCustomerPortal() {
  if (!customerDashboard) return;

  const portalMode = customerDashboard.dataset.mode || "account";
  const customer = state.customer;
  document.body.classList.toggle("customer-authed", Boolean(customer));
  customerDashboard.hidden = !customer && portalMode === "account" && !state.trackedOrder;
  if (customerDashboard.hidden) {
    customerDashboard.innerHTML = "";
    return;
  }
  const ordersForCustomer = customer
    ? state.orders.filter((order) => normalizePhone(order.customer?.phone) === normalizePhone(customer.phone))
    : state.orders;
  const visibleOrders = state.trackedOrder ? [state.trackedOrder] : ordersForCustomer.slice(0, portalMode === "track" ? 1 : 10);
  const activeOrders = ordersForCustomer.filter((order) => !isClosedOrder(order)).length;
  const latestOrder = ordersForCustomer[0];
  const localSpend = ordersForCustomer.reduce((sum, order) => sum + Number(order.totals?.total || 0), 0);
  const supportRequests = state.customerSupportRequests || [];
  const openSupportRequests = supportRequests.filter((item) => !["resolved", "closed"].includes(item.status || "")).length;
  const syncLabel =
    state.customerSyncStatus === "synced"
      ? "Backend synced"
      : state.customerSyncStatus === "locked"
        ? "PIN required"
        : "Saved on this device";
  const summary = state.customerSummary || {
    totalOrders: ordersForCustomer.length,
    activeOrders,
    totalSpend: localSpend,
    latestStatus: latestOrder?.status || "",
    openSupportRequests,
    nextAction: latestOrder ? getOrderNextAction(latestOrder) : ""
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
            ${customer.hasAccountPin ? `<span>PIN protected</span>` : ""}
            <span>${syncLabel}</span>
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
            <span><strong>${summary.openSupportRequests ?? openSupportRequests}</strong><small>Open support</small></span>
          </div>`
        : ""
    }
    ${customer || latestOrder ? renderPortalInsightCards(summary, latestOrder, summary.openSupportRequests ?? openSupportRequests) : ""}
    ${
      customer || latestOrder
        ? renderPortalCommandCenter(customer, summary, latestOrder, summary.openSupportRequests ?? openSupportRequests, portalMode)
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
    ${
      supportRequests.length
        ? `<h4 class="portal-subtitle">Support requests</h4>
          <div class="customer-support-list">
            ${supportRequests.map(renderCustomerSupportRequest).join("")}
          </div>`
        : ""
    }
  `;

  bindPortalActions();
  prefillCustomerSupportForm(latestOrder);
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

function renderCustomerSupportRequest(request) {
  return `
    <article class="customer-support-card">
      <header>
        <div>
          <strong>${escapeHtml(request.id)}</strong>
          <p>${escapeHtml(request.topic || "Support request")} ${request.orderId ? `- ${escapeHtml(request.orderId)}` : ""}</p>
        </div>
        <span>${escapeHtml(request.status || "new")}</span>
      </header>
      <p>${escapeHtml(request.message || "No message added")}</p>
      ${request.resolutionNote ? `<p><strong>Support note:</strong> ${escapeHtml(request.resolutionNote)}</p>` : ""}
      <small>Updated ${formatOrderDate(request.updatedAt || request.createdAt)}</small>
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

function setCustomerSupportStatus(message) {
  if (customerSupportStatus) customerSupportStatus.textContent = message || "";
}

async function refreshCustomerAccount() {
  if (!state.customer?.phone) {
    showToast("Open your account with phone number first");
    return;
  }

  setCustomerLoginStatus("Refreshing account...");
  await loadCustomerOrdersFromBackend(state.customer.phone);
  setCustomerLoginStatus(
    state.customerSyncStatus === "synced"
      ? "Account synced with live orders."
      : state.customerSyncStatus === "locked"
        ? "Enter your account PIN and open account again to refresh history."
        : "Showing saved account details."
  );
  showToast("Account refreshed");
}

function logoutCustomer() {
  state.customer = null;
  state.customerSummary = null;
  state.customerEnquiries = [];
  state.customerSupportRequests = [];
  state.trackedOrder = null;
  window.localStorage.removeItem(STORAGE_KEYS.customer);
  saveCustomerPin("");
  if (customerLoginForm) customerLoginForm.reset();
  if (customerSignupForm) customerSignupForm.reset();
  if (customerForgotForm) customerForgotForm.reset();
  setLoginStep("identity");
  setAuthMode("signin");
  setCustomerLoginStatus("Logged out on this device.");
  setCustomerSignupStatus("");
  setCustomerForgotStatus("");
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
    `Target Market: ${data.get("targetMarket") || "Not specified"}`,
    `Buyer Type: ${data.get("buyerType") || "Not specified"}`,
    `Monthly Volume: ${data.get("volume")}`,
    `Pack Format: ${data.get("packFormat") || "Not specified"}`,
    `Product Range: ${data.get("productRange") || "Not specified"}`,
    `Pack Request: ${data.get("packRequest") || "Not specified"}`,
    `Destination Port / City: ${data.get("destinationPort") || "Not specified"}`,
    `Timeline: ${data.get("timeline") || "Not specified"}`,
    `Document Need: ${data.get("documentNeed") || "Not specified"}`,
    `Label Requirement: ${data.get("labelRequirement") || "Not specified"}`,
    `Quote Basis: ${data.get("quoteBasis") || "Not specified"}`,
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
    targetMarket: data.get("targetMarket"),
    buyerType: data.get("buyerType"),
    volume: data.get("volume"),
    packFormat: data.get("packFormat"),
    productRange: data.get("productRange"),
    packRequest: data.get("packRequest"),
    destinationPort: data.get("destinationPort"),
    timeline: data.get("timeline"),
    documentNeed: data.get("documentNeed"),
    labelRequirement: data.get("labelRequirement"),
    quoteBasis: data.get("quoteBasis"),
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

  if (payment === "Razorpay online") {
    paymentDetails.innerHTML = `<p>Secure online payment is processed by Razorpay. Your order is confirmed only after payment verification.</p>`;
    return;
  }

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
  const totals = getTotals();
  document.querySelectorAll("[data-cart-count]").forEach((item) => {
    item.textContent = count;
  });

  cartItems.innerHTML = lines.length
    ? `
        ${renderCartHighlights(lines, totals)}
        <div class="cart-line-list" aria-label="Cart products">
          ${lines
            .map(
              (item) => `
              <div class="cart-line">
                <a class="cart-line-media" href="${productUrl(item)}" aria-label="Open ${escapeHtml(item.name)} details">
                  ${renderProductVisual(item)}
                </a>
                <div class="cart-line-copy">
                  <span>${escapeHtml(item.category)} / ${escapeHtml(item.size)}</span>
                  <h3>${escapeHtml(item.name)}</h3>
                  <p>${escapeHtml(item.description)}</p>
                  <span class="stock-pill is-${getStockStatus(item)}">${escapeHtml(getStockLabel(item))}</span>
                  <div class="cart-line-unit-price">
                    <span>Unit price</span>
                    ${renderCompactPricing(item)}
                  </div>
                </div>
                <div class="cart-line-actions">
                  <span class="cart-line-total">
                    <small>Line total</small>
                    <strong>${money(item.lineTotal)}</strong>
                  </span>
                  <div class="quantity" aria-label="${escapeHtml(item.name)} quantity">
                    <button type="button" data-minus="${item.id}" aria-label="Decrease ${escapeHtml(item.name)}">-</button>
                    <span>${item.quantity}</span>
                    <button type="button" data-plus="${item.id}" aria-label="Increase ${escapeHtml(item.name)}" ${isProductAvailable(item, item.quantity + 1) ? "" : "disabled"}>+</button>
                  </div>
                  <button class="remove-line" type="button" data-remove="${item.id}">Remove</button>
                </div>
              </div>
            `
            )
            .join("")}
            </div>
        ${renderCartCouponCard(totals)}
        ${renderCartAddOns(lines)}
        ${renderCartJourney()}
      `
    : `<div class="empty-cart">
        <i data-lucide="shopping-bag"></i>
        <strong>Your cart is empty.</strong>
        <span>Add makhana, masala, poha, or combo packs to start a booking.</span>
        <a href="./products.html">Browse products</a>
        ${renderEmptyCartRecommendations()}
      </div>`;

  cartItems.querySelectorAll("[data-minus]").forEach((button) => {
    button.addEventListener("click", () => setQuantity(button.dataset.minus, (state.cart.get(button.dataset.minus) || 0) - 1));
  });
  cartItems.querySelectorAll("[data-plus]").forEach((button) => {
    button.addEventListener("click", () => setQuantity(button.dataset.plus, (state.cart.get(button.dataset.plus) || 0) + 1));
  });
  cartItems.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => setQuantity(button.dataset.remove, 0));
  });
  cartItems.querySelector("[data-apply-cart-coupon]")?.addEventListener("click", (event) => {
    applyCouponCode(event.currentTarget.dataset.applyCartCoupon || getDisplayCoupon().code);
  });
  bindAddButtons(cartItems);

  cartTotals.innerHTML = `
    <div><span>Subtotal</span><span>${money(totals.subtotal)}</span></div>
    <div><span>Coupon discount</span><span>${totals.discount ? `-${money(totals.discount)}` : money(0)}</span></div>
    <div><span>Delivery estimate</span><span>${totals.delivery ? money(totals.delivery) : "Free"}</span></div>
    <div class="grand-total"><strong>Total</strong><strong>${money(totals.total)}</strong></div>
  `;
  renderPaymentDetails();
  renderCheckoutStep();
  refreshIcons();
}

function openCart() {
  closeProductDetail();
  prefillCheckoutFromCustomer();
  if (!cartDrawer || !overlay) return;
  cartDrawer.classList.add("is-open");
  overlay.classList.add("is-open");
  document.body.classList.add("cart-open");
  cartDrawer.setAttribute("aria-hidden", "false");
}

function closeCart() {
  if (!cartDrawer || !overlay) return;
  cartDrawer.classList.remove("is-open");
  overlay.classList.remove("is-open");
  document.body.classList.remove("cart-open");
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
      Circle,
      ChevronDown,
      ChevronLeft,
      ChevronRight,
      CheckCircle2,
      Clipboard,
      CreditCard,
      FileText,
      Factory,
      FlaskConical,
      Globe2,
      Handshake,
      Leaf,
      LogOut,
      MapPinCheck,
      MessageCircle,
      MessageSquare,
      PackageCheck,
      PackageOpen,
      Printer,
      Plus,
      RotateCw,
      Search,
      Send,
      ShoppingBag,
      Store,
      Sparkles,
      ShieldCheck,
      Truck,
      UserRound,
      Wheat,
      X
    }
  });
}

function setPromoSlide(nextIndex) {
  if (!promoSlides.length) return;
  promoIndex = (nextIndex + promoSlides.length) % promoSlides.length;
  promoSlides.forEach((slide, index) => {
    const active = index === promoIndex;
    slide.classList.toggle("is-active", active);
    slide.setAttribute("aria-hidden", String(!active));
  });
  promoDots.forEach((dot, index) => {
    dot.classList.toggle("is-active", index === promoIndex);
  });
}

function rotatePromo(direction = 1) {
  setPromoSlide(promoIndex + direction);
}

function startPromoTimer() {
  if (!promoSlides.length || promoSlides.length < 2) return;
  window.clearInterval(promoTimer);
  promoTimer = window.setInterval(() => rotatePromo(1), 5200);
}

function stopPromoTimer() {
  window.clearInterval(promoTimer);
}

function initPromoSlider() {
  if (!promoSlider || !promoSlides.length) return;
  promoSlider.querySelector("[data-promo-prev]")?.addEventListener("click", () => {
    rotatePromo(-1);
    startPromoTimer();
  });
  promoSlider.querySelector("[data-promo-next]")?.addEventListener("click", () => {
    rotatePromo(1);
    startPromoTimer();
  });
  promoDots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      setPromoSlide(index);
      startPromoTimer();
    });
  });
  promoSlider.addEventListener("mouseenter", stopPromoTimer);
  promoSlider.addEventListener("mouseleave", startPromoTimer);
  setPromoSlide(0);
  startPromoTimer();
}

function initBrandSlider() {
  const slider = document.querySelector("[data-brand-slider]");
  if (!slider) return;

  const track = slider.querySelector("[data-brand-track]");
  const slides = [...slider.querySelectorAll("[data-brand-slide]")];
  const dotsWrap = slider.querySelector("[data-brand-dots]");
  if (!track || !slides.length || !dotsWrap) return;

  let index = 0;
  let timer = null;
  const panel = document.querySelector("[data-home-slide-panel]");
  const panelEyebrow = panel?.querySelector("[data-home-slide-eyebrow]");
  const panelTitle = panel?.querySelector("[data-home-slide-title]");
  const panelCopy = panel?.querySelector("[data-home-slide-copy]");
  const panelPrimary = panel?.querySelector("[data-home-slide-primary]");
  const panelSecondary = panel?.querySelector("[data-home-slide-secondary]");

  dotsWrap.innerHTML = slides
    .map((_, slideIndex) => `<button class="brand-slider-dot" type="button" aria-label="Go to slide ${slideIndex + 1}"></button>`)
    .join("");
  const dots = [...dotsWrap.querySelectorAll(".brand-slider-dot")];

  function updateHomeSlidePanel(slide) {
    if (!panel || !slide) return;
    if (panelEyebrow && slide.dataset.brandEyebrow) panelEyebrow.textContent = slide.dataset.brandEyebrow;
    if (panelTitle && slide.dataset.brandTitle) panelTitle.textContent = slide.dataset.brandTitle;
    if (panelCopy && slide.dataset.brandCopy) panelCopy.textContent = slide.dataset.brandCopy;

    if (panelPrimary) {
      panelPrimary.href = slide.dataset.brandPrimaryUrl || "./products.html";
      const label = panelPrimary.querySelector("span");
      if (label) label.textContent = slide.dataset.brandPrimaryLabel || "Shop products";
    }

    if (panelSecondary) {
      panelSecondary.href = slide.dataset.brandSecondaryUrl || "./wholesale.html";
      const label = panelSecondary.querySelector("span");
      if (label) label.textContent = slide.dataset.brandSecondaryLabel || "Wholesale";
    }
  }

  function go(nextIndex, manual = false) {
    index = (nextIndex + slides.length) % slides.length;
    track.style.transform = `translateX(-${index * 100}%)`;
    slides.forEach((slide, slideIndex) => {
      slide.setAttribute("aria-hidden", String(slideIndex !== index));
    });
    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle("is-active", dotIndex === index);
    });
    updateHomeSlidePanel(slides[index]);
    if (manual) restart();
  }

  function stop() {
    window.clearInterval(timer);
  }

  function start() {
    if (slides.length < 2) return;
    stop();
    timer = window.setInterval(() => go(index + 1), 4500);
  }

  function restart() {
    stop();
    start();
  }

  slider.querySelector("[data-brand-prev]")?.addEventListener("click", () => go(index - 1, true));
  slider.querySelector("[data-brand-next]")?.addEventListener("click", () => go(index + 1, true));
  dots.forEach((dot, dotIndex) => dot.addEventListener("click", () => go(dotIndex, true)));
  slider.addEventListener("mouseenter", stop);
  slider.addEventListener("mouseleave", start);
  slider.addEventListener("focusin", stop);
  slider.addEventListener("focusout", start);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  go(0);
  start();
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    setProductFilter(button.dataset.filter);
  });
});

homeRangeTabs.forEach((button) => {
  button.addEventListener("click", () => {
    renderHomeRange(button.dataset.homeRangeTab);
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
orderTypeSelect?.addEventListener("change", () => {
  updateCheckoutExtraFields();
  renderCheckoutStep();
});

document.querySelectorAll(".cart-trigger").forEach((button) => {
  button.addEventListener("click", openCart);
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (!button || button.disabled) return;
  event.preventDefault();
  addToCart(button.dataset.add);
});
cartStepper?.querySelectorAll("[data-cart-step]").forEach((button) => {
  button.addEventListener("click", () => setCheckoutStep(button.dataset.cartStep));
});
document.querySelector(".close-cart")?.addEventListener("click", closeCart);
document.querySelector(".close-detail")?.addEventListener("click", closeProductDetail);
overlay?.addEventListener("click", () => {
  closeCart();
  closeProductDetail();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeCart();
  closeProductDetail();
});

document.querySelector("#applyCoupon")?.addEventListener("click", () => {
  applyCouponCode(couponInput?.value || getDisplayCoupon().code);
});

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-razorpay-checkout]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("Razorpay checkout could not be loaded.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.dataset.razorpayCheckout = "true";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Razorpay checkout could not be loaded."));
    document.head.appendChild(script);
  });
}

function resetAfterPaidOrder(form, order) {
  const shouldSaveDetails = saveDetailsInput?.checked ?? true;
  if (shouldSaveDetails) {
    saveCustomer(order.customer);
    syncCustomerProfile(order.customer);
  }
  upsertOrderRecords(order, order);
  state.cart.clear();
  saveCart();
  state.couponApplied = false;
  state.activeCoupon = null;
  if (couponInput) couponInput.value = "";
  if (couponMessage) couponMessage.textContent = "";
  form.reset();
  if (saveDetailsInput) saveDetailsInput.checked = true;
  state.checkoutStep = "cart";
  renderCart();
  closeCart();
  showToast(`Payment received for order ${order.id}`);
  redirectToConfirmation(order);
}

async function startRazorpayCheckout(form, submitButton, originalButtonHtml) {
  const localOrder = createOrderRecord(form, createOrderId(), "Razorpay Checkout");
  const payload = await apiRequest("/api/payments/razorpay/create-order", {
    method: "POST",
    body: JSON.stringify({ order: localOrder })
  });
  await loadRazorpayCheckout();
  if (!window.Razorpay) throw new Error("Razorpay checkout is unavailable.");

  const checkout = new window.Razorpay({
    key: payload.keyId,
    amount: payload.paymentOrder.amount,
    currency: payload.paymentOrder.currency,
    name: STORE_CONFIG.shopName,
    description: `Order ${payload.order.id}`,
    order_id: payload.paymentOrder.id,
    prefill: {
      name: payload.order.customer.name,
      email: payload.order.customer.email,
      contact: payload.order.customer.phone
    },
    theme: { color: "#0f5c48" },
    handler: async (response) => {
      try {
        const verified = await apiRequest("/api/payments/razorpay/verify", {
          method: "POST",
          body: JSON.stringify(response)
        });
        resetAfterPaidOrder(form, verified.order);
      } catch (error) {
        showToast(error.message || "Payment needs support verification. Please keep your payment ID.");
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.innerHTML = originalButtonHtml;
          refreshIcons();
        }
      }
    },
    modal: {
      ondismiss: () => {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.innerHTML = originalButtonHtml;
          refreshIcons();
        }
      }
    }
  });
  checkout.open();
}

function submitWhatsAppOrder() {
  if (!state.cart.size) {
    showToast("Add at least one product first");
    return;
  }

  if (state.checkoutStep !== "review") {
    setCheckoutStep("review", { validate: true });
    showToast("Review delivery and payment details before WhatsApp");
    return;
  }
  if (!checkoutForm.reportValidity()) return;

  const orderId = createOrderId();
  const order = createOrderRecord(checkoutForm, orderId, "WhatsApp order request");
  const message = buildWhatsAppMessage(checkoutForm, orderId);
  saveOrderRecord(order);
  window.open(getWhatsAppUrl(message), "_blank", "noopener,noreferrer");
  showToast(`Order ${orderId} ready in WhatsApp`);
}

document.querySelector("#whatsappOrder")?.addEventListener("click", submitWhatsAppOrder);

checkoutForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector(".checkout-button");
  if (!state.cart.size) {
    showToast("Add at least one product first");
    return;
  }
  if (!["details", "review"].includes(state.checkoutStep)) {
    setCheckoutStep("details");
    showToast("Add delivery details before placing order");
    return;
  }
  const stockIssue = getCartStockIssue();
  if (stockIssue) {
    showToast(stockIssue);
    return;
  }

  if (state.checkoutStep === "details") {
    setCheckoutStep("review", { validate: true });
    return;
  }

  const originalButtonHtml = submitButton?.innerHTML || "";
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.innerHTML = `<i data-lucide="package-check"></i> Creating booking ID...`;
    refreshIcons();
  }

  try {
    if (form.elements.payment?.value === "Razorpay online") {
      await startRazorpayCheckout(form, submitButton, originalButtonHtml);
      return;
    }
    const orderId = createOrderId();
    const order = createOrderRecord(form, orderId, "Website cart booking");
    const shouldSaveDetails = saveDetailsInput?.checked ?? true;
    const customerSync = shouldSaveDetails ? syncCustomerProfile(order.customer) : Promise.resolve();
    if (shouldSaveDetails) saveCustomer(order.customer);
    saveOrderRecord(order, { sync: false });
    const syncedOrder = await syncOrderRecord(order);
    await customerSync;
    state.cart.clear();
    saveCart();
    state.couponApplied = false;
    state.activeCoupon = null;
    if (couponInput) couponInput.value = "";
    if (couponMessage) couponMessage.textContent = "";
    form.reset();
    if (saveDetailsInput) saveDetailsInput.checked = true;
    state.checkoutStep = "cart";
    renderCart();
    closeCart();
    showToast(`Order ${orderId} placed successfully`);
    redirectToConfirmation(syncedOrder || order);
  } catch (error) {
    showToast(error.message || "Order could not be placed");
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = originalButtonHtml;
      refreshIcons();
    }
  }
});

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
});

customerLoginForm?.querySelector("[data-login-next]")?.addEventListener("click", () => {
  const phone = normalizePhone(customerLoginForm.elements.customerPhone?.value);
  if (!phone) {
    setCustomerLoginStatus("Enter your phone number first.");
    showToast("Enter your phone number first");
    return;
  }
  setLoginStep("secure", { focus: true });
});

customerLoginForm?.querySelector("[data-login-back]")?.addEventListener("click", () => {
  setLoginStep("identity", { focus: true });
});

document.querySelectorAll("[data-google-login]").forEach((button) => {
  button.addEventListener("click", async () => {
    setGoogleAuthStatus("Opening Google sign in...");
    try {
      const ready = await ensureGoogleIdentityReady();
      if (!ready) return;
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
          setGoogleAuthStatus("Google sign in is active. If no Google prompt opens, use phone and PIN or try again.");
        }
      });
    } catch (error) {
      setGoogleAuthStatus(error.message || "Google login could not start. Use phone and PIN for now.");
      showToast("Google login could not start");
    }
  });
});

customerLoginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const accountId = normalizePhone(data.get("customerPhone"));
  const accountPin = normalizeAccessPin(data.get("customerPin"));

  if (!accountId) {
    setCustomerLoginStatus("Enter your customer ID or mobile number.");
    showToast("Enter your customer ID or mobile number");
    return;
  }

  if (accountPin.length < 4) {
    setCustomerLoginStatus("Enter your 4 to 6 digit password/PIN.");
    showToast("Enter your password/PIN");
    return;
  }

  saveCustomerPin(accountPin);
  state.customer = null;
  state.customerSummary = null;
  state.customerEnquiries = [];
  state.customerSupportRequests = [];
  state.trackedOrder = null;
  setCustomerLoginStatus("Checking account...");

  try {
    const params = getCustomerAuthParams(accountId);
    const payload = await apiRequest(`/api/customer/dashboard?${params.toString()}`);
    const orders = payload.orders || [];
    const backendCustomer = payload.customer || orders[0]?.customer;

    if (!backendCustomer && !orders.length) {
      throw new Error("No account found for this ID. Please create account first.");
    }

    const customer = cleanCustomerForStorage({
      name: backendCustomer?.name || "Customer",
      phone: backendCustomer?.phone || accountId,
      email: backendCustomer?.email || "",
      location: backendCustomer?.location || orders[0]?.countryCity || "",
      hasAccountPin: true
    });

    saveCustomer(customer);
    state.customerSummary = payload.summary || null;
    state.customerEnquiries = payload.enquiries || [];
    state.customerSupportRequests = payload.supportRequests || [];
    state.customerSyncStatus = "synced";
    if (orders.length) upsertOrderRecords(orders);
    else renderCustomerPortal();
    prefillCheckoutFromCustomer();
    prefillCustomerSupportForm(orders[0]);
    setCustomerLoginStatus("Account opened.");
    customerDashboard?.scrollIntoView({ block: "start" });
    if (window.location.hash !== "#customer-dashboard") {
      window.history.replaceState(null, "", `${window.location.pathname}#customer-dashboard`);
    }
    showToast("Account opened");
  } catch (error) {
    state.customerSyncStatus = /pin|password/i.test(error.message || "") ? "locked" : "local";
    setCustomerLoginStatus(error.message || "Login failed. Please check ID and password.");
    showToast(error.message || "Login failed");
  }
});

customerSignupForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const accountPin = normalizeAccessPin(data.get("customerPin"));
  if (accountPin.length < 4) {
    setCustomerSignupStatus("Create a 4 to 6 digit account PIN.");
    showToast("Create a 4 to 6 digit account PIN");
    return;
  }

  const customer = {
    name: String(data.get("customerName") || "").trim() || "Customer",
    phone: String(data.get("customerPhone") || "").trim(),
    email: String(data.get("customerEmail") || "").trim(),
    location: String(data.get("customerLocation") || "").trim(),
    hasAccountPin: true
  };
  saveCustomerPin(accountPin);
  state.customerSummary = null;
  state.customerEnquiries = [];
  state.trackedOrder = null;
  openCustomerDashboard(customer, "Account created. Syncing live orders...");
  setCustomerSignupStatus("Account created.");
  showToast("Account created");

  try {
    await syncCustomerProfile({ ...customer, accountPin });
    await loadCustomerOrdersFromBackend(customer.phone);
    setCustomerSignupStatus(
      state.customerSyncStatus === "synced"
        ? "Account synced with live orders."
        : state.customerSyncStatus === "locked"
          ? "This number is already PIN protected. Use the correct PIN or request reset."
          : "Account saved on this device. Live sync will retry when backend is available."
    );
  } catch (error) {
    setCustomerSignupStatus(error.message || "Account saved on this device.");
  }
});

customerForgotForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const phone = normalizePhone(data.get("forgotPhone"));
  const message = String(data.get("forgotMessage") || "I need help resetting my BandEvi Gourmet account PIN.").trim();
  if (!phone) {
    setCustomerForgotStatus("Enter the phone number connected with your account.");
    showToast("Enter your phone number");
    return;
  }

  setCustomerForgotStatus("Sending PIN reset request...");
  try {
    const result = await apiRequest("/api/customer/support", {
      method: "POST",
      body: JSON.stringify({
        phone,
        topic: "Account PIN reset",
        message,
        name: state.customer?.name || "Customer",
        email: state.customer?.email || ""
      })
    });
    setCustomerForgotStatus(`PIN reset request ${result.supportRequest.id} created. Support will contact you.`);
    showToast("PIN reset request sent");
    form.reset();
  } catch (error) {
    setCustomerForgotStatus(error.message || "PIN reset request could not be sent.");
    showToast(error.message || "Request failed");
  }
});

customerSupportForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const phone = normalizePhone(data.get("supportPhone") || state.customer?.phone || state.trackedOrder?.customer?.phone);
  const message = String(data.get("supportMessage") || "").trim();
  if (!phone || !message) {
    setCustomerSupportStatus("Phone and message are required.");
    showToast("Phone and message are required");
    return;
  }

  const payload = {
    orderId: String(data.get("supportOrderId") || "").trim().toUpperCase(),
    phone,
    topic: String(data.get("supportTopic") || "Order support").trim(),
    message,
    name: state.customer?.name || state.trackedOrder?.customer?.name || "",
    email: state.customer?.email || state.trackedOrder?.customer?.email || ""
  };

  setCustomerSupportStatus("Sending support request...");
  try {
    const result = await apiRequest("/api/customer/support", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    state.customerSupportRequests = [result.supportRequest, ...(state.customerSupportRequests || [])].filter(Boolean);
    if (result.supportRequest?.phone) {
      saveCustomer({
        ...(state.customer || {}),
        phone: result.supportRequest.phone,
        name: result.supportRequest.name || state.customer?.name || "",
        email: result.supportRequest.email || state.customer?.email || ""
      });
    }
    form.elements.supportMessage.value = "";
    setCustomerSupportStatus(`Support request ${result.supportRequest.id} created.`);
    renderCustomerPortal();
    prefillCustomerSupportForm();
    showToast("Support request sent");
  } catch (error) {
    setCustomerSupportStatus(error.message || "Support request could not be sent.");
    showToast(error.message || "Support request failed");
  }
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
    prefillCustomerSupportForm(payload.order);
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
  prefillCustomerSupportForm(order);
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

function prefillWholesaleProductFromUrl() {
  if (!wholesaleForm) return;
  const params = new URLSearchParams(window.location.search);
  const product = params.get("product");
  if (!product) return;

  const productRange = params.get("range");
  const messageField = wholesaleForm.elements.message;
  const rangeField = wholesaleForm.elements.productRange;
  if (messageField && !messageField.value) messageField.value = `Interested in: ${product}. Please share export pack options and quote details.`;
  if (rangeField && productRange) {
    const rangeLabels = {
      makhana: "Makhana / fox nuts",
      masala: "Indian masala blends",
      poha: "Poha / breakfast range",
      combo: "Mixed product range"
    };
    rangeField.value = rangeLabels[productRange] || "Mixed product range";
  }
}

prefillWholesaleProductFromUrl();
wholesaleForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = buildWholesaleMessage(event.currentTarget);
  syncWholesaleEnquiry(event.currentTarget);
  window.open(getWhatsAppUrl(message), "_blank", "noopener,noreferrer");
  showToast("Enquiry opened in WhatsApp. You can also email bandevigourment@gmail.com");
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
renderHomeRange();
renderSingleProductPage();
renderCart();
syncCatalogFromBackend();
syncCouponsFromBackend();
prefillCustomerLoginForm();
loadGoogleAuthConfig();
if (window.location.hash === "#signup") setAuthMode("signup");
else if (window.location.hash === "#forgot") setAuthMode("forgot");
else setAuthMode("signin");
renderCustomerPortal();
initPromoSlider();
initBrandSlider();
if (state.customer?.phone) {
  loadCustomerOrdersFromBackend(state.customer.phone);
}
hydrateTrackingFromUrl();
hydrateConfirmationPage();
refreshIcons();
