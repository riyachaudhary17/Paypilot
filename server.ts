import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { z } from 'zod';

import {
  initDatabase,
  checkDbHealth,
  getDashboardStats,
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  getCustomers,
  getCustomerById,
  findOrCreateCustomer,
  recordPayment,
  logActivity,
  getActivityLogs,
} from './server/db.js';

import {
  parseMonetaryAmount,
  parseQuantity,
  formatCurrency,
} from './server/money.js';

import {
  isPayPalConfigured,
  getPayPalStatusSummary,
  createPayPalOrder,
  createPayPalInvoiceV2,
  verifyPayPalPayment,
  capturePayPalOrder,
  getPayPalOrder,
  extractPayPalLink,
  PayPalApiError,
  hasPayPalInvoicingScope,
} from './server/paypal.js';

import {
  isGeminiConfigured,
  checkGeminiHealth,
  extractInvoiceFromPrompt,
  askInvoiceAssistant,
  generateInvoiceReminder,
} from './server/gemini.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger for safe API telemetry
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[API] ${req.method} ${req.path}`);
  }
  next();
});

// -------------------------------------------------------------
// API Routes
// -------------------------------------------------------------

// 1. Health & Integration Status
app.get('/api/health', async (_req, res) => {
  const dbHealth = await checkDbHealth();
  const paypalStatus = getPayPalStatusSummary();
  const geminiConfigured = isGeminiConfigured();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealth,
      paypal: paypalStatus,
      gemini: {
        configured: geminiConfigured,
        model: 'gemini-3.8-flash',
      },
    },
  });
});

app.get('/api/integrations/status', async (_req, res) => {
  const dbHealth = await checkDbHealth();
  const paypalStatus = getPayPalStatusSummary();
  const geminiHealth = await checkGeminiHealth();

  res.json({
    database: {
      provider: 'Supabase PostgreSQL',
      ...dbHealth,
      envKey: 'DATABASE_URL',
      instructions: 'Add your Supabase PostgreSQL connection string in the Secrets panel as DATABASE_URL.',
    },
    paypal: {
      provider: 'PayPal REST APIs',
      ...paypalStatus,
      envKeys: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'],
      instructions: 'Obtain Sandbox REST API client credentials from PayPal Developer Dashboard and save them in Secrets.',
    },
    gemini: {
      provider: 'Google Gemini API',
      ...geminiHealth,
      envKey: 'GEMINI_API_KEY',
      instructions: 'Gemini API key is automatically injected by AI Studio into Secrets.',
    },
  });
});

app.post('/api/integrations/test-db', async (_req, res) => {
  const connected = await initDatabase();
  const health = await checkDbHealth();
  res.json({ success: connected, ...health });
});

// 2. Dashboard Statistics
app.get('/api/dashboard/stats', async (_req, res) => {
  try {
    const stats = await getDashboardStats();
    res.json(stats);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// 3. Invoices API
app.get('/api/invoices', async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const customerId = req.query.customerId as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const invoices = await getInvoices({ status, search, customerId, limit, offset });
    res.json(invoices);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

const CreateInvoiceSchema = z.object({
  customerName: z.string().min(1, 'Customer name is required'),
  customerEmail: z.string().email('Valid customer email is required'),
  description: z.string().min(1, 'Description is required'),
  currency: z.string().default('USD'),
  issueDate: z.string(),
  dueDate: z.string(),
  notes: z.string().optional(),
  status: z.enum(['DRAFT', 'CREATED', 'SENT', 'PENDING', 'PAID', 'OVERDUE', 'CANCELLED', 'FAILED']).default('DRAFT'),
  items: z.array(z.object({
    description: z.string().min(1),
    quantity: z.preprocess((val) => parseQuantity(val, 'quantity'), z.number().positive()),
    unitPrice: z.preprocess((val) => parseMonetaryAmount(val, 'unitPrice'), z.number().nonnegative()),
  })).min(1, 'At least one line item is required'),
});

app.post('/api/invoices', async (req, res) => {
  try {
    const parsed = CreateInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.issues.map(i => i.message),
      });
    }

    const data = parsed.data;
    // Find or create customer by email
    const customer = await findOrCreateCustomer(data.customerName, data.customerEmail);

    const invoice = await createInvoice({
      customerId: customer.id,
      description: data.description,
      currency: data.currency,
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      notes: data.notes,
      status: data.status,
      items: data.items,
    });

    res.status(201).json(invoice);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

app.get('/api/invoices/:id', async (req, res) => {
  try {
    const invoice = await getInvoiceById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    res.json(invoice);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

app.patch('/api/invoices/:id', async (req, res) => {
  try {
    const updated = await updateInvoice(req.params.id, req.body);
    await logActivity('INVOICE_UPDATED', `Updated invoice ${updated.invoice_number}`, updated.id, { changes: Object.keys(req.body) });
    res.json(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

// 4. PayPal Integration Endpoints
// Create PayPal Order / Payment Link for invoice
app.post('/api/invoices/:id/paypal', async (req, res) => {
  try {
    const invoice = await getInvoiceById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status === 'PAID') {
      return res.status(400).json({ error: 'Invoice is already marked as PAID.' });
    }

    if (!isPayPalConfigured()) {
      return res.status(400).json({
        error: 'PayPal Sandbox is not configured.',
        code: 'PAYPAL_NOT_CONFIGURED',
        instructions: 'Please configure PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in Settings > Secrets.',
      });
    }

    const flowType = req.body.flow || 'order'; // 'order' (Checkout) or 'invoicing' (PayPal Invoice)
    const appUrl = (req.headers.origin as string) || (process.env.APP_URL as string) || 'http://localhost:3000';

    // If invoice already has an order, check if it's already approved or has an active checkout link
    if (flowType === 'order' && invoice.paypal_order_id) {
      try {
        const existingOrder = await getPayPalOrder(invoice.paypal_order_id);
        if (existingOrder.status === 'APPROVED' || existingOrder.status === 'COMPLETED') {
          const verification = await verifyPayPalPayment(invoice);
          if (verification.verified) {
            const payment = await recordPayment({
              invoiceId: invoice.id,
              paypalOrderId: invoice.paypal_order_id,
              paypalCaptureId: verification.captureId,
              amount: verification.amount ?? invoice.total_amount,
              currency: verification.currency || invoice.currency,
              status: 'COMPLETED',
            });
            const refreshed = await getInvoiceById(invoice.id);
            return res.json({
              success: true,
              invoice: refreshed,
              paymentUrl: invoice.payment_url,
              paypalOrderId: invoice.paypal_order_id,
              notice: verification.message || 'Payment verified successfully. This invoice is now marked as Paid.',
            });
          }
        } else if (existingOrder.status === 'CREATED' || existingOrder.status === 'PAYER_ACTION_REQUIRED') {
          const activeLink = extractPayPalLink(existingOrder.links, ['approve', 'payer-action']);
          if (activeLink) {
            return res.json({
              success: true,
              invoice,
              paymentUrl: activeLink,
              paypalOrderId: invoice.paypal_order_id,
              notice: existingOrder.status === 'PAYER_ACTION_REQUIRED'
                ? 'PayPal requires you to complete an additional payment step. Continue to PayPal to finish your payment.'
                : 'The PayPal payment has not been approved yet. Please complete checkout.',
            });
          }
        }
      } catch (checkErr) {
        console.warn(`[PayPal API] Could not inspect existing order ${invoice.paypal_order_id}:`, checkErr);
      }
    }

    if (flowType === 'invoicing') {
      try {
        // Attempt PayPal Invoicing API V2
        const result = await createPayPalInvoiceV2(invoice);
        const updated = await updateInvoice(invoice.id, {
          paypalInvoiceId: result.paypalInvoiceId,
          paymentUrl: result.paymentUrl,
          status: 'SENT',
        });

        await logActivity(
          'PAYPAL_INVOICE_CREATED',
          `Created PayPal Invoice ${result.paypalInvoiceId} for ${invoice.invoice_number}`,
          invoice.id,
          { paypalInvoiceId: result.paypalInvoiceId, paymentUrl: result.paymentUrl }
        );

        return res.json({
          success: true,
          invoice: updated,
          paymentUrl: result.paymentUrl,
          paypalInvoiceId: result.paypalInvoiceId,
        });
      } catch (invoicingErr: unknown) {
        const isPermissionIssue =
          (invoicingErr instanceof PayPalApiError && invoicingErr.isPermissionError) ||
          (invoicingErr instanceof Error && (
            invoicingErr.message.includes('403') ||
            invoicingErr.message.includes('NOT_AUTHORIZED') ||
            invoicingErr.message.includes('insufficient permissions')
          ));

        if (isPermissionIssue) {
          console.warn('[PayPal API] Invoicing v2 lacks permission in Sandbox App (403 NOT_AUTHORIZED). Falling back automatically to PayPal Orders API checkout.');

          // Seamless fallback to PayPal Orders API checkout
          const result = await createPayPalOrder(invoice, appUrl);
          const updated = await updateInvoice(invoice.id, {
            paypalOrderId: result.orderId,
            paymentUrl: result.approvalUrl,
            status: invoice.status === 'DRAFT' ? 'SENT' : invoice.status,
          });

          await logActivity(
            'PAYPAL_ORDER_CREATED',
            `Generated PayPal Sandbox checkout order ${result.orderId} for ${invoice.invoice_number} (fallback from Invoicing v2 due to Sandbox App permissions)`,
            invoice.id,
            {
              orderId: result.orderId,
              approvalUrl: result.approvalUrl,
              payee: result.payee,
              amount: result.amount,
              fallbackReason: 'Invoicing v2 requires Invoicing permission in PayPal Developer Dashboard',
            }
          );

          return res.json({
            success: true,
            fallback: true,
            invoice: updated,
            paymentUrl: result.approvalUrl,
            paypalOrderId: result.orderId,
            notice: 'PayPal Invoicing v2 requires the Invoicing permission in your Sandbox App settings. We automatically generated a live PayPal Checkout payment link via Orders API so you can proceed without delay.',
          });
        }

        throw invoicingErr;
      }
    } else {
      // Use PayPal Orders API Checkout
      const result = await createPayPalOrder(invoice, appUrl);
      const updated = await updateInvoice(invoice.id, {
        paypalOrderId: result.orderId,
        paymentUrl: result.approvalUrl,
        status: invoice.status === 'DRAFT' ? 'SENT' : invoice.status,
      });

      await logActivity(
        'PAYPAL_ORDER_CREATED',
        `Generated PayPal Sandbox checkout order ${result.orderId} for ${invoice.invoice_number}`,
        invoice.id,
        {
          orderId: result.orderId,
          approvalUrl: result.approvalUrl,
          payee: result.payee,
          amount: result.amount,
        }
      );

      return res.json({
        success: true,
        invoice: updated,
        paymentUrl: result.approvalUrl,
        paypalOrderId: result.orderId,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PayPal API Route Error]', msg);
    const status = (err instanceof PayPalApiError && err.status >= 400 && err.status < 500) ? err.status : 500;
    const code = (err instanceof PayPalApiError && (err.status === 403 || err.status === 401))
      ? 'PAYPAL_AUTH_FAILED'
      : 'PAYPAL_ERROR';
    res.status(status).json({ error: msg, code });
  }
});

// Authoritative server-side payment verification
app.post('/api/invoices/:id/verify-payment', async (req, res) => {
  try {
    const invoice = await getInvoiceById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (!isPayPalConfigured()) {
      return res.status(400).json({
        error: 'PayPal Sandbox is not configured. Add credentials in Settings > Secrets.',
        code: 'PAYPAL_NOT_CONFIGURED',
      });
    }

    const verification = await verifyPayPalPayment(invoice);

    if (verification.verified && (verification.status === 'COMPLETED' || verification.status === 'ALREADY_PAID')) {
      if (verification.status === 'ALREADY_PAID') {
        const refreshed = await getInvoiceById(invoice.id);
        return res.json({
          verified: true,
          status: 'PAID',
          message: verification.message || 'This invoice has already been paid.',
          invoice: refreshed,
        });
      }

      const verifiedAmount = parseMonetaryAmount(verification.amount ?? invoice.total_amount, 'verification.amount');

      // Record payment transaction in DB
      const payment = await recordPayment({
        invoiceId: invoice.id,
        paypalOrderId: verification.paypalOrderId || invoice.paypal_order_id,
        paypalCaptureId: verification.captureId,
        amount: verifiedAmount,
        currency: verification.currency || invoice.currency,
        status: 'COMPLETED',
      });

      await logActivity(
        'PAYMENT_VERIFIED',
        `Verified PayPal Sandbox payment of ${formatCurrency(payment.amount, payment.currency)} for ${invoice.invoice_number}`,
        invoice.id,
        {
          captureId: payment.paypal_capture_id,
          orderId: payment.paypal_order_id,
          amount: payment.amount,
        }
      );

      const refreshed = await getInvoiceById(invoice.id);
      return res.json({
        verified: true,
        status: 'PAID',
        message: verification.message || 'Payment verified successfully. This invoice is now marked as Paid.',
        payment,
        invoice: refreshed,
      });
    } else {
      await logActivity(
        'PAYMENT_VERIFY_CHECK',
        `Payment verification check for ${invoice.invoice_number}: Status is ${verification.status}`,
        invoice.id,
        { verification }
      );

      return res.json({
        verified: false,
        status: verification.status,
        actionRequired: verification.actionRequired,
        actionUrl: verification.actionUrl,
        message: verification.message,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// Capture PayPal Order if payer approved
app.post('/api/invoices/:id/capture-order', async (req, res) => {
  try {
    const invoice = await getInvoiceById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!invoice.paypal_order_id) return res.status(400).json({ error: 'Invoice has no associated PayPal order ID' });

    const captureResult = await capturePayPalOrder(invoice.paypal_order_id);
    const capture = captureResult.purchase_units?.[0]?.payments?.captures?.[0];

    if (capture && (capture.status === 'COMPLETED' || captureResult.status === 'COMPLETED')) {
      const verifiedAmount = parseMonetaryAmount(capture.amount?.value ?? invoice.total_amount, 'capture.amount');
      const payment = await recordPayment({
        invoiceId: invoice.id,
        paypalOrderId: invoice.paypal_order_id,
        paypalCaptureId: capture.id,
        amount: verifiedAmount,
        currency: capture.amount?.currency_code || invoice.currency,
        status: 'COMPLETED',
      });

      await logActivity(
        'PAYMENT_CAPTURED',
        `Captured PayPal payment ${capture.id} of ${formatCurrency(payment.amount, payment.currency)} for ${invoice.invoice_number}`,
        invoice.id,
        { captureId: capture.id, amount: payment.amount }
      );

      const refreshed = await getInvoiceById(invoice.id);
      return res.json({ success: true, payment, invoice: refreshed });
    }

    res.json({ success: false, captureResult });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// 5. Customers API
app.get('/api/customers', async (req, res) => {
  try {
    const search = req.query.search as string | undefined;
    const customers = await getCustomers(search);
    res.json(customers);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required.' });
    }
    const customer = await findOrCreateCustomer(name, email);
    await logActivity('CUSTOMER_CREATED', `Added customer ${customer.name} (${customer.email})`, null, { customerId: customer.id });
    res.status(201).json(customer);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

app.get('/api/customers/:id', async (req, res) => {
  try {
    const customer = await getCustomerById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    const customerInvoices = await getInvoices({ customerId: customer.id });
    res.json({ ...customer, invoices: customerInvoices });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// 6. Gemini AI Endpoints
// Natural language invoice extraction
app.post('/api/ai/invoice-draft', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'Prompt text is required.' });
    }

    if (!isGeminiConfigured()) {
      return res.status(400).json({
        error: 'Gemini API is not configured. GEMINI_API_KEY is missing.',
        code: 'GEMINI_NOT_CONFIGURED',
      });
    }

    const draft = await extractInvoiceFromPrompt(prompt.trim());
    await logActivity('AI_INVOICE_EXTRACTED', `AI generated draft invoice for ${draft.customer_name}`, null, {
      prompt: prompt.slice(0, 100),
      itemsCount: draft.items.length,
    });

    res.json(draft);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Gemini Draft Error]', msg);
    res.status(500).json({ error: msg });
  }
});

// Conversational assistant grounded in real database records
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required.' });
    }

    if (!isGeminiConfigured()) {
      return res.status(400).json({
        error: 'Gemini API is not configured.',
        code: 'GEMINI_NOT_CONFIGURED',
      });
    }

    const reply = await askInvoiceAssistant(message.trim(), history || []);
    res.json({ reply });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Gemini Chat Error]', msg);
    res.status(500).json({ error: msg });
  }
});

// Reminder email generator
app.post('/api/ai/reminder', async (req, res) => {
  try {
    const { invoiceId, tone } = req.body;
    if (!invoiceId) {
      return res.status(400).json({ error: 'invoiceId is required.' });
    }

    const invoice = await getInvoiceById(invoiceId);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }

    if (!isGeminiConfigured()) {
      return res.status(400).json({
        error: 'Gemini API is not configured.',
        code: 'GEMINI_NOT_CONFIGURED',
      });
    }

    const reminder = await generateInvoiceReminder(invoice, tone || 'polite');
    res.json(reminder);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// 7. Activity Logs API
app.get('/api/activity', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const invoiceId = req.query.invoiceId as string | undefined;
    const logs = await getActivityLogs(limit, invoiceId);
    res.json(logs);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// Error handling middleware
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Unhandled Server Error]', err);
  const msg = err instanceof Error ? err.message : 'Internal Server Error';
  res.status(500).json({ error: msg });
});

// -------------------------------------------------------------
// Vite Middleware / Static Serving
// -------------------------------------------------------------
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    // Dynamic import vite for middleware mode
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PayPilot Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[PayPilot Server] Startup failure:', err);
});
