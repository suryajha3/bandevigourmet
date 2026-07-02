# Makhana & Masala Online Store

A standalone storefront project for selling roasted makhana, Indian masala powders, whole spices, and combo packs.

## Run Locally

```bash
npm install
npm run dev
```

The local site opens at:

```text
http://127.0.0.1:4173/
```

For a production-style local preview:

```bash
npm run build
npm run preview
```

## Store Features

- Product grid with category tabs, search, and sorting
- Separate makhana and masala product sections
- Easy product editing from `products.json`
- Product detail data from `product-details.json`
- Separate product photos for every catalog item
- International brand story and quality sections
- About Us, Trust Center, certificate placeholders, and FAQ sections
- Add-to-cart drawer with quantity controls
- Coupon support using `SPICE10`
- WhatsApp order button with full cart and customer details
- Wholesale enquiry form
- Checkout form with order confirmation
- Responsive layout for desktop and mobile

## Product Setup

Edit products in `products.json`. Each product has:

```json
{
  "id": "classic-makhana",
  "name": "Classic Roasted Makhana",
  "category": "makhana",
  "price": 249,
  "size": "100 g",
  "badge": "Best seller",
  "rating": 4.9,
  "description": "Short product description.",
  "image": "/assets/product-classic-makhana.png",
  "position": "32% 70%"
}
```

Use `category` values `makhana`, `masala`, or `combo` so the filter buttons keep working. Put production product photos in `public/assets/`, then update the `image` path with `/assets/your-file.png`.

## Product Detail Setup

Edit `product-details.json` to update ingredients, nutrition display values, shelf life, storage, origin notes, flavor notes, and usage ideas.

Nutrition values are currently approximate display values. Replace them with lab-verified packaging values before final commercial launch.

The current catalog uses separate product images named:

```text
public/assets/product-classic-makhana.png
public/assets/product-peri-peri-makhana.png
public/assets/product-pudina-makhana.png
public/assets/product-jaggery-makhana.png
public/assets/product-garam-masala.png
public/assets/product-kitchen-king.png
public/assets/product-chaat-masala.png
public/assets/product-turmeric-powder.png
public/assets/product-red-chilli.png
public/assets/product-whole-spice-combo.png
public/assets/product-snack-combo.png
public/assets/product-masala-refill.png
```

## WhatsApp Setup

The WhatsApp button works immediately as a share message. To send every order directly to your shop WhatsApp number, open `store-config.js` and set:

```js
whatsappNumber: "919999999999"
```

Use country code plus number, without `+`, spaces, or dashes.

## Trust Content

The site includes buyer-facing trust sections for about us, ingredient selection, packing, batch quality, compliance placeholders, and FAQs.

Only add certificate numbers or compliance claims when they are real and verified. The current FSSAI, GST, lab report, and export document blocks are placeholders.

## UPI Setup

To accept prepaid UPI orders, open `store-config.js` and set:

```js
upiId: "yourupiid@bank",
upiPayeeName: "Your Shop Name"
```
