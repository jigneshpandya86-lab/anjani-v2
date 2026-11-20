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
4. **Android Share Target & Map Link Interception (`src/utils/shareTargetUtils.js`, `src/App.jsx`):**
   - **Additive Routing (Leads vs. Orders):**
     - Sharing phone numbers / contact call logs without map links continues opening the **Leads** tab (`setActiveTab('leads')`) and launching `ImportCallLogModal` (100% intact).
     - Sharing or opening Google Maps URLs (`maps.app.goo.gl`, `maps.google.com`, `goo.gl/maps`, `geo:` scheme, or decimal lat/lng) routes directly to the **Orders** tab (`setActiveTab('orders')`) and launches `OrderModal` with `mapLink`, `locationLat`, `locationLng`, and address pre-filled.
     - If a phone number is included alongside the map link in WhatsApp text, Anjani automatically scans `clients` and preselects the matched client.
   - **PWA Configuration (`vite.config.js`):**
     - Web App Manifest registers `share_target` (GET) and `protocol_handlers: [{ protocol: "geo", url: "/?mapLink=%s" }]`.
   - **Native Android APK (`.github/workflows/android-apk.yml`):**
     - Injects `<intent-filter>` for `maps.google.com`, `maps.app.goo.gl`, and `geo:` into `AndroidManifest.xml` so Anjani appears in the system "Open with" chooser alongside Google Maps and Porter.
     - `App.jsx` listens to Capacitor's `appUrlOpen` event to intercept native launches.

---

## Orders Dashboard & Fulfillment Workflow (`src/components/OrdersDashboard.jsx`)
1. **Primary & Default View (`Open / Confirm`):**
   - Default filter initializes to `OpenConfirm` (`useState('OpenConfirm')`).
   - The primary tab is **Open / Confirm** (with real-time pending count badge), followed by **Open**, **Confirmed**, **Delivered**, and **All**.
   - Filters only active unfulfilled orders (`status === 'Pending' || status === 'Confirmed'`), hiding completed past delivered orders by default to keep the dispatch view focused.
2. **Chronological Sorting (Older Date First):**
   - Active orders are strictly sorted by delivery date **older first** (`aDate - bDate`, then `aTime - bTime`, then `aPrio - bPrio`).
   - Allows delivery staff (Nilesh) and owner (Jignesh) to view dispatch sequence starting from yesterday's overdue/unfulfilled orders &rarr; today's scheduled deliveries &rarr; tomorrow's advance bookings.
   - For historical `Delivered` tab, orders are sorted newest first (Recent to Past).
   - In `All` tab, active orders appear on top (older first) followed by completed delivered orders below.
3. **Relative Date Indicators:**
   - Order cards render prominent relative date pills (`Yesterday`, `Today`, `Tomorrow`, `Xd Overdue`, `In Xd`) for instant visual distinction.
4. **Dispatch Plan / WhatsApp Roster (`shareDispatchPlan`):**
   - Automatically orders pending dispatches chronologically (older first) when generating the daily WhatsApp team roster.

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
- `askAnjaniAi`: OnCall callable function in region `asia-south1`. Uses Gemini 2.5 (`gemini-2.5-flash-lite` primary with `gemini-2.5-flash` fallback) with structured JSON Tool Calling / Operational Intent Classification.
  - Strict Token & Budget Guards: 300 requests/day per user ceiling (< ₹4/day maximum cost) and strict `maxOutputTokens: 500`.
  - Structured Intent Actions: `orders_query`, `order_create`, `staff_reminder`, `accounts_query`, `stock_query`, `dues_query`, `tasks_query`, `location_update`, `update_date`, `update_time`, `update_price`, `update_qty`, `chat_reply`.
  - Multimodal Vision: High-precision vendor bill OCR, payment receipt verification, and customer onboarding card scanning.
- Deploy command: `firebase deploy --only functions:askAnjaniAi` or `firebase deploy --only functions`.

---

## AI Assistant Architecture (`src/components/AiAssistantDrawer.jsx`)
1. **CRITICAL ARCHITECTURAL RULE: NEVER USE REGEX FOR NATURAL LANGUAGE UNDERSTANDING.**
   - All conversational text typed by the user (English, Gujarati, Hindi, Hinglish) flows DIRECTLY to `askAnjaniAi` (Gemini Tool Calling Agent).
   - NEVER add natural language regex patterns, regex keyword interceptors, or manual grammar parsers in client-side code.
   - When new natural language features or commands are added:
     1. Add the tool/intent schema in `functions/index.js` (`operationalAgentPrompt`).
     2. Add the structured intent handler in `src/components/AiAssistantDrawer.jsx` (`resData.type === 'your_new_intent'`).
2. **Deterministic Client-Side Actions (0ms Latency, 0 Tokens):**
   - **Interactive Chatbot Flows (`src/utils/chatbotFlowEngine.js`):** Multi-step clickable chip questionnaires for `flow_order`, `flow_task`, `flow_payment`, `flow_expense`, `flow_cash`, `flow_staff`.
   - **Main Menu Quick Chips:** 5 categorized domain sections (Orders & Dispatch, Staff Tasks & Operations, Payments & Expenses, Cash & Staff Advances, Reports & Balances). Direct chip clicks execute instant client-side queries without calling the LLM.
   - **Numbered Card Action Selection:** When an order card or draft sheet is open with numbered options (`[1] Confirm [2] Reschedule [3] Cancel`), typing `1`, `2`, or `3` triggers that button directly.
   - **Utility Autocomplete:** Typing `/` opens the SKU rate menu; typing `@` opens the customer picker.
3. **Client-Side Image Downsampler (`src/utils/aiImageHelper.js`):**
   - High-resolution vendor invoice/challan photos are resized via HTML5 Canvas to max 1280px JPEG (~150KB) in the browser before sending.
   - Keeps multimodal vision token consumption fixed at ~258 tokens (~₹0.001 INR per scan).
4. **Strict SKU Mapping & 1-Tap Inward:**
   - Multimodal OCR is constrained to Annapurna's 5 exact warehouse SKUs: `Anjani 200ml`, `Bailey 250ml`, `Bailey 500ml`, `Bailey 1 Liter`, and `Bailey 2 Liter`.
   - Renders an interactive confirmation card with quantity steppers (`+` / `-`).
   - "Confirm & Inward to Stock" invokes `addStockBatch()` to record a batch inward transaction in Firestore `collection('stock')` and update `meta/stockSummary`.
5. **Dynamic Model Upgrades (`SettingsTab.jsx` & Firestore `config/aiSettings`):**
   - Configurable in `SettingsTab` under the "AI & Models" sub-tab.
   - Primary model defaults to `gemini-2.5-flash-lite`, with fallback to `gemini-2.5-flash`.
   - Supports custom model names and token caps without redeploying code.

---

## Cash Handover, Custody Accounts & MacroDroid SMS Automation

1. **Staff Custody Accounts Registry (`src/constants/accounts.js` & `src/constants/staff.js`):**
   - **Custody accounts:** `nilesh` (Delivery Staff Cash Custody, Blue `#2563eb`), `hiteshbhai` (Purple `#7c3aed`), `counter` (Primary Drawer, Emerald `#059669`), `bank` (Bank / UPI, Orange `#ea580c`).
   - **Mobile numbers:** Nilesh (`7990943652`), Hiteshbhai (`7778077617`).
   - Static staff array is defined in `src/constants/staff.js` (re-exported by `src/services/staffSalaryService.js`) to decouple static data from Firebase Auth and enable zero-overhead unit testing.

2. **Khatabook-Style SMS Formatting (`src/utils/calculatorUtils.js` -> `buildCashHandoverSms`):**
   - **GSM 7-Bit ASCII Standard:** Always use `Rs.` instead of the Unicode `₹` (`\u20B9`) symbol. Indian telecom operators and TRAI DLT spam filters drop UCS-2 messages or limit them to 70 chars, and MacroDroid string splitting corrupts Unicode rupee symbols.
   - **Debit Format (Handover from staff to Counter/Bank):**
     `Annapurna Foods: Hi Nilesh, Rs. 2,100 DEBITED from cash custody. Handed over to Bank on 14-Oct. Thank you!`
   - **Credit Format (Cash received into staff custody):**
     `Annapurna Foods: Hi Nilesh, Rs. 2,000 CREDITED to cash custody. Received from Counter Cash on 14-Oct. Thank you!`

3. **MacroDroid Webhook Integration (`src/services/leadSmsService.js`):**
   - **Webhook URL:** `https://trigger.macrodroid.com/25efcbac-eb13-4461-ae90-3158ba6c5b90/anjani_sms`
   - **Exact Contract (Matches New Order SMS):**
     `finalUrl = `${baseUrl}?data=${encodeURIComponent(packet)}``
     Where `packet = `${normalizedPhone}@@@${message}`` and `normalizedPhone` is `91` + 10 digits (e.g. `917990943652`).
     Do **NOT** append extra query parameters (`phone`, `mobile`, `number`, `message`, `msg`). MacroDroid's macro is configured to parse and split `data` by `@@@` (`[data_1]` as phone, `[data_2]` as message); extra query parameters interfere with MacroDroid's variable mapping.
   - `sendCashHandoverTransferSms({ transferDoc, staffList })`: Dispatches or re-dispatches Khatabook SMS for any transfer document.

4. **Cash Handover Modal UX (`src/components/CashHandoverModal.jsx`):**
   - When a staff custody account is selected (`nilesh` or `hiteshbhai`), `sendSms` automatically defaults to `true` and the recipient mobile is pre-filled.
   - The MacroDroid menu header displays a live `SMS: Nilesh` badge.
   - The submit button dynamically updates to `Confirm & Send SMS to Nilesh (₹...)`.
   - The expandable menu features a direct "Send Test SMS" button for quick verification.

5. **1-Click Send / Resend SMS for Historical Entries:**
   - Both **Accounts Dashboard** (`src/components/AccountsDashboard.jsx`) and **Account Passbook** (`src/components/AccountPassbookModal.jsx`) display a `MessageSquare` icon button on every transfer row involving staff.
   - Clicking this button immediately dispatches the Khatabook SMS to the staff member with toast confirmation.

---

## AI Natural Language & Tool Calling Architecture (`askAnjaniAi`)

1. **Zero Client-Side Regex for Natural Language:**
   - Never add regex matchers in `AiAssistantDrawer.jsx` or client code to interpret user queries.
   - 100% of natural language queries (English, Gujarati, Hinglish) route directly to the backend Cloud Function `askAnjaniAi` (Gemini 2.5 Tool Calling Agent).

2. **Strict Date Isolation for Order Inquiries (`orders_query`):**
   - When the user asks for tomorrow's or today's orders (*"tomorrow's order"*, *"kale ketla order chhe"*, *"today orders"*), Gemini calls `query_orders({ dateFilter: "tomorrow" | "today", targetDate: "YYYY-MM-DD" })`.
   - Backend normalizes missing `targetDate` using real-time IST timestamps.
   - Frontend `AiAssistantDrawer.jsx` strictly matches `o.deliveryDate || o.date` against `effectiveTargetDate`.
   - **Zero Leakage / Fallthrough Rule:** When `dateFilter` is set to `'tomorrow'` or `'today'`, the filter MUST NOT fall through to return all open orders across other dates. If no orders exist for that day, an empty list with an informative badge is rendered.

3. **Universal Multi-Field Order & Entity Mutator (`edit_order`, `edit_client`):**
   - Follow-up commands such as *"Update location as P G Party Plot Harni"*, *"Change to 50 boxes and 4 PM"*, or *"Change product to Bailey 500ml"* resolve customer and order from recent message context.
   - Client drawer and backend support updating ANY single attribute or MULTIPLE attributes simultaneously via `updates: { qty, rate, date, time, location, sku, paymentMode, notes, status }` or `fieldToUpdate`/`newValue`.
   - Never falls through to ask *"What would you like to update?"* when any field or modification was specified. Persists atomically via `updateOrder` and `updateClient`.

4. **Universal Payment Lifecycle Engine A to Z (`receive_payment`, `edit_payment`, `cancel_payment`):**
   - End-to-end support for recording collections (`receive_payment`), in-memory draft card editing before confirmation (`edit_payment`), recorded payment modification (`edit_payment`), payment cancellation with ledger reversal (`cancel_payment`), 1-tap/typed confirmation (`confirm_latest_payment`), dues inquiries (`query_dues`), and staff route cash balances (`query_accounts`).
   - Unconfirmed drafts in chat are modified seamlessly when users issue follow-up corrections like *"Edit to 2"*, *"Make it 5000"*, or *"Change mode to cash"*.
   - Can be confirmed by tapping **Confirm & Record Payment** or typing *"Confirm"* / *"Confirm payment"*.

---

## Commands & Verification Workflow
- **Unit Tests:** `npm test` (`vitest run`)
- **Lint Check:** `npm run lint` (`eslint .`)
- **Vite Build:** `npm run build`
- **Deploy Hosting:** `npx firebase deploy --only hosting`
- **Deploy Functions:** `npx firebase deploy --only functions`
