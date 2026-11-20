---
name: anjani-ai-architecture
description: >-
  Enforces the industry-standard Gemini Tool Calling AI architecture for Anjani AI.
  Prohibits client-side regex for natural language interpretation, defines the
  structured intent pipeline between functions/index.js (askAnjaniAi) and
  AiAssistantDrawer.jsx, and outlines deterministic UI chip workflows.
---

# Anjani AI Architecture & Natural Language Rules

## 1. Absolute Rule: Never Use Regex for Natural Language
- **Zero Regex Interceptors:** Never add client-side regular expressions or regex keyword matchers to intercept natural language user prompts in `AiAssistantDrawer.jsx` or client utilities.
- **Why:** Regex rules cause endless keyword collision, hijack intent (e.g. matching "Nilesh" in *"Ask Nilesh to call Bhavesh"* as a cash custody balance check), and cannot handle natural Gujarati/Hindi variations.
- **Sanctioned Architecture:** ALL conversational text typed or dictated by the user MUST flow directly to the backend Cloud Function `askAnjaniAi` (Gemini 2.5 Tool Calling Agent).

---

## 2. Gemini Tool Calling Agent (`functions/index.js` -> `askAnjaniAi`)
- **Location & Region:** Firebase 2nd Gen Cloud Function in `asia-south1`.
- **Model:** Primary `gemini-2.5-flash-lite`, fallback `gemini-2.5-flash`.
- **Budget & Guardrails:**
  - Hard limit of 300 requests/day per user (caps daily costs to < ₹4/day).
  - Strict `maxOutputTokens: 500` for operational responses.
  - Real-time IST timestamps injected dynamically.
- **Intent Schemas Supported:**
  - `orders_query`: Filter orders by date ("today", "tomorrow", "all") or customer.
  - `order_create`: Draft new water dispatches with canonical SKUs and rates.
  - `staff_reminder`: Create staff task drafts for Nilesh or Hiteshbhai with 1-tap WhatsApp and assignment buttons.
  - `accounts_query`: Inquire cash custody balances (Nilesh, Hiteshbhai, Counter, Bank).
  - `stock_query`: Warehouse inventory status across all 5 SKUs.
  - `dues_query`: Pending customer balances and outstanding reports.
  - `tasks_query`: List active pending staff jobs.
  - `location_update`: Extract Google Maps links and link to order/client.
  - `update_date` & `update_time`: Reschedule delivery dates or set dispatch times.
  - `update_price` & `update_qty`: Adjust order pricing or line-item counts.
  - `chat_reply`: General questions and business inquiries under 40 words.

---

## 3. Client-Side Execution Boundaries (`src/components/AiAssistantDrawer.jsx`)
Client-side deterministic logic is strictly reserved for:
1. **Interactive Chatbot Guided Flows (`src/utils/chatbotFlowEngine.js`):**
   - Clickable multi-step chip flows for `flow_order`, `flow_task`, `flow_payment`, `flow_expense`, `flow_cash`, `flow_staff`.
2. **Main Menu Quick Action Chips:**
   - Categorized into 5 domain sections (Orders & Dispatch, Staff Tasks & Operations, Payments & Expenses, Cash & Staff Advances, Reports & Balances).
   - Direct button clicks execute instant 0ms queries from local store (`clientStore`).
3. **Card Action Numeric Select:**
   - When an interactive card sheet has numbered options (`[1] Confirm [2] Reschedule [3] Cancel`), typing `1`, `2`, or `3` triggers that button.
4. **Autocomplete Menus:**
   - Typing `/` triggers the SKU rate helper.
   - Typing `@` triggers customer selection.

---

## 4. How to Add New AI Capabilities
When adding or improving AI behavior:
1. **Update Cloud Function Prompt:** Add the new structured intent in `functions/index.js` under `operationalAgentPrompt` with examples in English, Gujarati, and Hinglish.
2. **Update Client Response Handler:** In `src/components/AiAssistantDrawer.jsx`, add `else if (resData.type === 'your_intent')` to render the interactive UI card or trigger store updates.
3. **Never add a regex in the client to bypass Gemini.**

---

## 5. Strict Date Isolation for Order Queries (`orders_query`)
- **Strict Matching Mandatory:** When user asks for tomorrow's or today's orders (`dateFilter === 'tomorrow'` or `'today'`), both backend and client MUST strictly isolate orders matching that exact target date (`YYYY-MM-DD` in IST).
- **Zero Fallthrough / Leakage:** If no orders exist for tomorrow or today, the system MUST show an empty state (*"No delivery orders scheduled for tomorrow"*). It must NEVER fall through to display all active/open orders across other dates.
- **Backend Normalization:** `functions/index.js` injects IST dates into the system prompt and normalizes `args.targetDate` and `args.dateFilter` so the client receives the exact date.
- **Client Defense-in-Depth:** In `AiAssistantDrawer.jsx`, if `effectiveTargetDate` is set, `od.startsWith(effectiveTargetDate)` is required; if `dateFilter === 'tomorrow' || dateFilter === 'today'`, any order missing that date returns `false` (no fallthrough).
