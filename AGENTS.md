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
3. **Order Creation / Autofill:** In `src/components/OrderModal.jsx`, switching SKUs automatically autofills the rate using `client.skuRates?.[targetSku]`, falling back to `client.rate` if no custom rate is set.

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
     - Item / SKU name and Quantity (Boxes/Cases)
     - Delivery Date & Time
     - Full Address
     - Direct Google Maps navigation URL (`*Map Link:* https://maps.google.com/?api=1&query=...`)

---

## Stock Ledger & Dispatches
- Stock collection: `collection(db, 'stock')`.
- Each stock movement document stores `{ qty, narration, type, sku, createdAt }`.
- When an order is marked `Delivered` in `clientStore.js`, stock is debited using the exact `order.sku || 'Anjani 200ml'`.
- `StockDashboard.jsx` and `AddStockModal.jsx` provide SKU filtering and SKU selection for incoming stock additions.

---

## PDF Invoices (`src/App.jsx`)
- PDF invoice generator `buildSimpleInvoicePdfFile()` generates the invoice title and row description dynamically based on `order.sku` (e.g. `Bailey 1 Liter Supply - 10 Cases`).

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
