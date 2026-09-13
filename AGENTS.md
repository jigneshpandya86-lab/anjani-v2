# Anjani V2 - Project & Agent Memory

## Business Profile
- **Business Entity:** Annapurna Foods (Shop No. 21, VR One Commercial Business Center, Between Ajwa & Waghodia Chokadi, Opp. L&T Knowledge City, Vadodara, Gujarat 390019).
- **Domain:** Authorized Distributorship for **Anjani Packaged Drinking Water** & **Bailey Packaged Drinking Water** in Vadodara.
- **Owner / Contact:** Jignesh Pandya.

---

## Product Catalog & SKUs (`src/constants/skus.js`)
All water products are defined centrally in `src/constants/skus.js`:
- **`Anjani 200ml`** (Default SKU, Unit: `Box`, Brand: `Anjani`, Color: Blue)
- **`Bailey 250ml`** (Unit: `Case / Box`, Brand: `Bailey`, Color: Emerald)
- **`Bailey 500ml`** (Unit: `Case / Box`, Brand: `Bailey`, Color: Cyan)
- **`Bailey 1 Liter`** (Unit: `Case / Box`, Brand: `Bailey`, Color: Indigo)
- **`Bailey 2 Liter`** (Unit: `Case / Box`, Brand: `Bailey`, Color: Purple)

### Helper Functions:
- `getSkuMeta(skuLabel)`: Case-insensitive lookup returning the SKU configuration object, falling back to `Anjani 200ml` for legacy/unspecified records.
- `DEFAULT_SKU = 'Anjani 200ml'`
- `SKU_LABELS`: Array of SKU names.

---

## Pricing Model & Per-SKU Rates
1. **Client Default Rate:** Stored in `customer.rate` (number).
2. **Client Per-SKU Rates:** Stored in `customer.skuRates = { [skuName]: number }`. Configured in `src/components/AddClient.jsx` under the expandable "SKU-Specific Rates" section.
3. **Multi-SKU Line Items (Zoho Books Pattern):**
   - In `src/components/OrderModal.jsx`, an order can contain multiple line items (`items: [{ sku, qty, rate }]`).
   - Selecting a client and SKU automatically fills the rate from `client.skuRates?.[targetSku] || client.rate`.
   - Lines can be added dynamically with "+ Add Item" and deleted with trash icon.
   - Live subtotal per row, total quantity, and grand total amount are calculated and persisted.
   - Backward compatible: legacy orders without `items` are automatically normalized into a 1-element `items` array with top-level `qty`, `rate`, and `sku` preserved.

---

## Delivery Address & Map Link Architecture
1. **Fallback Resolution Sequence (`getDisplayAddress` in `OrdersDashboard.jsx`):**
   - Direct order address: `order.address || order.deliveryAddress`
   - Linked client address: `client.address || client.deliveryAddress`
   - Linked client location: `client.location || client.locationName || client.googleLocation`
   - Fallback location / area: `order.location || order.area`
2. **Persistence on Order Creation:**
   - When orders are placed via `addOrder()` in `src/store/clientStore.js`, the linked client's `address`, `location`, `mapLink`, `locationLat`, and `locationLng` are saved onto the order document.
3. **WhatsApp Pre-filled Delivery Message:**
   - In `OrdersDashboard.jsx` -> `shareOrder(order)`, clicking the green message/share button generates a prefilled message containing:
     - Order ID, Client Name, Mobile
     - Bulleted list of every item: `• {qty} {unit} — *{sku}*`
     - Total Quantity and Total Amount
     - Delivery Date & Time
     - Full Address
     - Direct Google Maps navigation URL (`*Map Link:* https://maps.google.com/?api=1&query=...`)

---

## Stock Ledger & Dispatches (Multi-SKU & Batch Inward)
- Stock collection: `collection(db, 'stock')`.
- Each stock movement document stores `{ qty, narration, type, sku, createdAt }`.
- **Delivered Order Dispatch:**
  - When an order is marked `Delivered` in `clientStore.js`, stock is debited individually for each SKU in `order.items` (or fallback top-level `order.sku`).
  - Deleting a delivered order reverses each line-item's debit individually.
- **Factory Batch Stock Inward (`AddStockModal.jsx`):**
  - Allows receiving plant shipments across all 5 SKUs in a single entry (`addStockBatch(entries, defaultNarration)`).
  - Also supports single-SKU manual inward (+) and wastage/outward (-) adjustments.
  - Automatically syncs total quantity aggregate in `meta/stockSummary`.
- `StockDashboard.jsx` includes full SKU filtering and integrates `AddStockModal`.

---

## PDF Invoices & Payment QR Settings (`src/App.jsx`, `src/components/SettingsTab.jsx`, `src/utils/qrHelper.js`)
- **Settings Submenu ("Invoice GPay / UPI QR"):**
  - Managed under `SettingsTab.jsx` with dedicated sub-tabs: "Invoice GPay / UPI QR" and "System Schedulers".
  - Allows uploading custom GPay / PhonePe / Paytm / BHIM QR code image directly from the phone/computer gallery.
  - Automatically crops/pads the image on a 300x300 clean white canvas via HTML Canvas and converts to JPEG Data URL.
  - Automatically scans and extracts UPI ID using `jsQR` if readable, and allows editing UPI ID and Payee Name.
  - Stored in Firestore document `config/paymentSettings` via `savePaymentSettings()` in `src/store/clientStore.js`.
- **PDF Invoice Scanner Embedding (`buildSimpleInvoicePdfFile` in `src/App.jsx`):**
  - Generates itemized multi-row PDF invoices matching Zoho Books format.
  - Includes an authentic "SCAN & PAY (GPAY / UPI)" card in the footer alongside Kotak Mahindra Bank transfer details.
  - If a gallery image is uploaded, it is embedded as a PDF XObject `/Img1` using `/Filter [/ASCIIHexDecode /DCTDecode]` to ensure 100% 7-bit ASCII compatibility across all PDF viewers and mobile WebViews.
  - If no custom image is uploaded, it automatically renders a high-precision vector UPI QR code using `buildVectorQrStream()` with dynamic invoice amount and payee details.

---

## Cloud Functions (`functions/index.js`)
- `sendOrderSmsToStaff`: Triggered on `orders/{docId}` changes.
  - `importantFields` includes `sku` and `product`.
  - Notification SMS and push alert format includes `SKU: ${resolved.sku || 'Anjani 200ml'}` and `${sQty} ${sSku} for ${sName}`.
- `sendOrderReminder`: Daily reminder SMS includes SKU.
- Deploy command: `npx firebase deploy --only functions:sendOrderSmsToStaff` or `npx firebase deploy --only functions`.

---

## Commands & Verification Workflow
- **Unit Tests:** `npm test` (`vitest run`)
- **Lint Check:** `npm run lint` (`eslint .`)
- **Vite Build:** `npm run build`
- **Deploy Hosting:** `npx firebase deploy --only hosting`
- **Deploy Functions:** `npx firebase deploy --only functions`
