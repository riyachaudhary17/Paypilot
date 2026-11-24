# PayPilot — AI-Powered Invoice & PayPal Settlement Hub

PayPilot is an end-to-end intelligent billing and payment management SaaS application designed for freelancers, independent developers, consultants, and small agencies. Built for the **PayPal AI Hackathon**, PayPilot combines Google Gemini 3.8 Flash intelligence with authentic PayPal REST API Sandbox transactions and persistent Supabase PostgreSQL accounting.

---

## 1. Problem & Product Vision

### The Problem
Freelancers and small businesses lose hours manually converting client agreements, scope descriptions, and Slack/email requests into line-item invoices. Once invoices are sent, following up on unpaid invoices feels uncomfortable, and checking payment gateways to verify whether funds have cleared across disjointed systems causes administrative drag.

### The Solution: PayPilot
PayPilot automates the entire invoice lifecycle through a single streamlined workflow:

```
Natural-Language Instruction ➔ Structured AI Draft ➔ User Review & Edit ➔ PostgreSQL Persistence ➔ Authentic PayPal Sandbox Checkout/Invoice ➔ Verified Settlement Verification ➔ Real-Time Financial Analytics
```

- **Natural-Language Invoice Extraction**: Users type or dictate requests like *"Create an invoice for Rahul Sharma for 150 US dollars for website development, due seven days from today."* Google Gemini extracts structured line items, calculates exact relative dates using server time, enforces monetary precision, and presents an editable draft.
- **Direct PayPal Sandbox Integration**: PayPilot creates authentic PayPal Orders API checkout links and PayPal Invoicing V2 requests directly against PayPal's REST endpoints (`https://api-m.sandbox.paypal.com`).
- **Authoritative Server-Side Settlement Verification**: Payments are never marked `PAID` merely based on a browser redirect or simulated response. PayPilot queries PayPal's REST APIs server-side to verify captured transactions, record immutable payment logs, and update balances.
- **Grounded Financial Assistant**: An interactive AI chat assistant answers questions about overdue accounts, receivables, and client histories grounded exclusively in real database records without hallucinating numbers.
- **AI Payment Reminder Generation**: Generates contextual, respectful reminder notices tailored to overdue or pending invoices with configurable tones (polite, firm, urgent final notice).

---

## 2. Architecture & Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Browser (React 19)                │
│  Tailwind CSS 4, Lucide Icons, Responsive Financial SaaS UI │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / JSON
┌──────────────────────────────▼──────────────────────────────┐
│             Node.js / Express Server (server.ts)            │
│  - Vite Middlewares (Dev Mode) / Static Production Serving  │
│  - Strict Zod Schema Validation & Idempotent Transactions   │
│  - Centralized Error Handling & Rate-Safe Telemetry         │
├──────────────────────────────┼──────────────────────────────┤
│                              │                              │
│  ┌────────────────────────┐  │  ┌────────────────────────┐  │
│  │    Google Gemini API   │  │  │   PayPal REST Sandbox  │  │
│  │    @google/genai SDK   │  │  │   Orders API (v2)      │  │
│  │    gemini-3.8-flash    │  │  │   Invoicing API (v2)   │  │
│  │    Strict JSON Schema  │  │  │   Server-Side Capture  │  │
│  └────────────────────────┘  │  └────────────────────────┘  │
│                              │                              │
└──────────────────────────────┬──────────────────────────────┘
                               │ pg Pool (SSL)
┌──────────────────────────────▼──────────────────────────────┐
│               Supabase PostgreSQL (schema.sql)              │
│  Tables: customers, invoices, invoice_items,                │
│          payments, activity_logs                            │
└─────────────────────────────────────────────────────────────┘
```

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS 4, Lucide Icons.
- **Backend**: Server-side Node.js / Express running within Google AI Studio Build mode.
- **Database**: PostgreSQL hosted on Supabase (`pg` connection pool with SSL), equipped with automated table initialization and in-memory demo fallback for immediate review.
- **AI Engine**: Google Gemini API (`@google/genai` TypeScript SDK, `gemini-3.8-flash` model), executed exclusively server-side.
- **Payment Gateway**: PayPal REST API (Sandbox environment, OAuth 2.0 client-credentials token caching, Orders API v2, Invoicing API v2, and authoritative server-side capture verification).
- **Validation**: Zod schema validation for strict decimal currency values, dates, and email constraints.
- **Testing**: Node.js native test runner (`node:test`) verifying decimal arithmetic, draft validation, and idempotent capture handling.

---

## 3. Environment Variables & Credentials Setup

PayPilot requires server-side environment variables configured via the **Settings > Secrets** panel in Google AI Studio:

| Variable Name | Required | Description |
| :--- | :---: | :--- |
| `GEMINI_API_KEY` | Yes | Google Gemini API key (automatically injected by AI Studio). |
| `APP_URL` | Yes | Public URL of the Cloud Run applet (automatically injected by AI Studio). |
| `DATABASE_URL` | Recommended | Supabase PostgreSQL URI (e.g. `postgresql://postgres:[PWD]@db.[REF].supabase.co:5432/postgres`). |
| `PAYPAL_CLIENT_ID` | Yes (for Sandbox) | Client ID from your PayPal Developer Sandbox application. |
| `PAYPAL_CLIENT_SECRET` | Yes (for Sandbox) | Client Secret from your PayPal Developer Sandbox application. |
| `PAYPAL_BASE_URL` | Optional | Defaults to `https://api-m.sandbox.paypal.com`. |

> **Note on Fallback Mode**: If `DATABASE_URL` is omitted, PayPilot runs in transactional in-memory demo mode with pre-seeded records, allowing immediate interaction without crashing. Once `DATABASE_URL` is configured, it automatically executes `schema.sql` and switches to live Supabase PostgreSQL.

---

## 4. Step-by-Step Setup Guides

### A. Supabase PostgreSQL Setup
1. Log in to [Supabase](https://supabase.com) and click **New Project**.
2. Go to **Project Settings** > **Database**.
3. Under **Connection parameters**, copy the **URI** connection string.
4. Replace `[YOUR-PASSWORD]` with your database password.
5. In AI Studio, open **Settings > Secrets** and add `DATABASE_URL`.
6. PayPilot will automatically execute table migrations on server start. Alternatively, paste the contents of `schema.sql` into the Supabase SQL Editor.

### B. PayPal Sandbox Developer Account Setup
1. Log in to the [PayPal Developer Portal](https://developer.paypal.com).
2. Go to **Apps & Credentials** and ensure the **Sandbox** toggle is selected.
3. Click **Create App**, select **Merchant** application type, and name it `PayPilot-Sandbox`.
4. Copy the generated **Client ID** and **Secret Key**.
5. In AI Studio, open **Settings > Secrets** and add:
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
6. Under **Testing Tools > Sandbox Accounts**, note the pre-created Personal Buyer Account email and password to use during test checkout.

---

## 5. PayPal Sandbox Testing Guide (For Judges)

1. Open PayPilot and navigate to **Invoices** or click **Create Invoice**.
2. Select **AI Smart Draft** and submit:
   ```
   Create an invoice for Rahul Sharma (rahul.sharma@example.com) for 150 US dollars for website development, due seven days from today.
   ```
3. Review the extracted line items and click **Save & Issue Invoice**.
4. In the invoice detail screen, click **Create PayPal Checkout (Orders API)**.
5. PayPilot contacts PayPal's Sandbox endpoint and returns a direct approval link. Click **Open PayPal Sandbox Payment**.
6. Log in with your Sandbox Personal Buyer Account credentials and authorize the test payment.
7. Return to PayPilot and click **Verify Payment with PayPal API**.
8. PayPilot's server contacts PayPal, executes server-side order capture, verifies the settlement amount, records the immutable payment transaction, and transitions the invoice to **PAID**.
9. Visit the **Dashboard** to see the **Verified Received** revenue and updated metrics.

---

## 6. Running & Testing Locally

```bash
# Install dependencies
npm install

# Run business logic, financial arithmetic, and schema validation tests
npm test

# Run the full-stack development server on port 3000
npm run dev

# Build the production bundle
npm run build
```

---

## 7. AI Tool Disclosure

In compliance with Hackathon rules:
- **Google Gemini 3.8 Flash** is utilized at runtime exclusively on the server side via the `@google/genai` TypeScript SDK.
- Gemini is employed for three specific capabilities:
  1. **Natural-language invoice extraction**: Parsing user text into structured line items, ISO dates, and decimal totals.
  2. **Grounded conversational assistant**: Explaining invoice statuses, overdue receivables, and client history using deterministic database records.
  3. **Payment reminder generation**: Drafting context-aware reminder messages.
- Gemini is never trusted for financial math, database mutations, or payment authorization. All calculations are executed deterministically in TypeScript and verified against PayPal REST APIs.

---

## 8. Devpost Submission Summary

**Elevator Pitch:**
PayPilot is an AI-powered financial management web app for freelancers and small businesses that turns plain-English invoice requests into structured line items, generates real PayPal Sandbox payment links, and authoritatively verifies settlements against PayPal REST APIs.

**Key Accomplishments:**
- Complete end-to-end integration of Google Gemini 3.8 Flash, PayPal REST API Sandbox, and Supabase PostgreSQL.
- Server-side settlement verification preventing spoofed payments or unearned receipts.
- Interactive AI financial assistant grounded in real database records.

---

## 9. 3-Minute Video Demonstration Outline

- **0:00 - 0:30 (Problem & Overview)**: Introduce PayPilot, the friction freelancers face with invoicing and payment follow-ups, and the solution architecture.
- **0:30 - 1:15 (AI Invoice Creation)**: Demonstrate natural language prompt input ("Create an invoice for Rahul Sharma..."), showing Gemini parsing line items, dates, and pricing into an editable draft.
- **1:15 - 2:00 (PayPal Sandbox Checkout)**: Generate the real PayPal Sandbox checkout link, navigate to PayPal's Sandbox UI, and approve the payment with a test buyer account.
- **2:00 - 2:30 (Authoritative Verification & Settlement)**: Click "Verify Payment with PayPal API", show server-side capture, immutable payment logging, and status updating to PAID.
- **2:30 - 3:00 (Grounded AI Assistant & Dashboard)**: Ask the assistant *"Which invoices are overdue?"* and *"How much revenue have I received?"*, showcase the real-time financial metrics, and conclude.

---

## 10. License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
