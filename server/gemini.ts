import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { getDashboardStats, getInvoices, getCustomers, InvoiceRecord } from './db.js';
import { formatCurrency } from './money.js';

let aiInstance: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the environment.');
  }

  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiInstance;
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
}

export async function checkGeminiHealth() {
  const configured = isGeminiConfigured();
  if (!configured) {
    return {
      configured: false,
      model: 'gemini-3.8-flash',
      error: 'GEMINI_API_KEY is not defined in environment secrets.',
    };
  }

  try {
    const ai = getAIClient();
    const testRes = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: 'Ping check for PayPilot service. Respond with "PONG".',
    });
    return {
      configured: true,
      available: true,
      model: 'gemini-3.8-flash',
      testResponse: testRes.text?.trim() || 'PONG',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      configured: true,
      available: false,
      model: 'gemini-3.8-flash',
      error: msg,
    };
  }
}

// Zod schema for validated invoice draft
export const InvoiceDraftSchema = z.object({
  customer_name: z.string().min(1, 'Customer name is required'),
  customer_email: z.string().email().nullable().optional(),
  description: z.string().min(1, 'Description is required'),
  currency: z.string().default('USD'),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Issue date must be YYYY-MM-DD'),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be YYYY-MM-DD'),
  notes: z.string().nullable().optional(),
  items: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().positive(),
    unit_price: z.number().nonnegative(),
  })).min(1, 'At least one line item is required'),
  clarification_needed: z.boolean().default(false),
  clarification_prompt: z.string().nullable().optional(),
});

export type InvoiceDraft = z.infer<typeof InvoiceDraftSchema>;

/**
 * Extracts a structured invoice draft from natural language input.
 * Strict rules:
 * - Never hallucinates email addresses.
 * - Accurate date calculations using the server's current date.
 * - Strict schema validation with Zod.
 */
export async function extractInvoiceFromPrompt(userPrompt: string): Promise<InvoiceDraft> {
  const ai = getAIClient();
  const today = new Date().toISOString().split('T')[0];
  const dayOfWeek = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());

  const systemInstruction = `You are PayPilot's invoice parsing engine.
Your task is to parse the user's natural language request into a clean, structured invoice draft.
Today's date on the server is ${today} (${dayOfWeek}).

CRITICAL INSTRUCTIONS:
1. CUSTOMER EMAIL: Do NOT invent or hallucinate customer email addresses. If the user did not explicitly provide an email (e.g. rahul@example.com), set "customer_email": null.
2. DATES: Calculate relative dates accurately starting from today's date (${today}). For example:
   - "due seven days from today" = calculate exact date 7 days after ${today}.
   - "due next month" or "net 30" = calculate 30 days from ${today}.
   - The issue_date defaults to today (${today}) unless the user specifies otherwise.
3. CURRENCY: Default to "USD" if unspecified, or extract ISO 3-letter currency code (e.g. USD, EUR, GBP, CAD).
4. LINE ITEMS: Extract individual line items with quantities and unit prices. If only a single total amount is mentioned (e.g., "$150 for website development"), produce one line item with description="Website development", quantity=1, unit_price=150.
5. AMBIGUITY / MISSING DETAILS: If the user's prompt is completely ambiguous or lacks essential financial details (e.g., "send an invoice to Rahul" with no amount or service), set "clarification_needed": true and explain what is missing in "clarification_prompt".
`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: userPrompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          customer_name: { type: Type.STRING, description: 'Customer or business name' },
          customer_email: { type: Type.STRING, nullable: true, description: 'Explicitly provided customer email or null' },
          description: { type: Type.STRING, description: 'Overall invoice summary or project title' },
          currency: { type: Type.STRING, description: '3-letter currency code e.g. USD' },
          issue_date: { type: Type.STRING, description: 'YYYY-MM-DD format' },
          due_date: { type: Type.STRING, description: 'YYYY-MM-DD format' },
          notes: { type: Type.STRING, nullable: true, description: 'Optional payment notes or payment terms' },
          clarification_needed: { type: Type.BOOLEAN, description: 'True if critical information is missing or ambiguous' },
          clarification_prompt: { type: Type.STRING, nullable: true, description: 'Polite clarification question if clarification_needed is true' },
          items: {
            type: Type.ARRAY,
            description: 'List of line items',
            items: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                quantity: { type: Type.NUMBER },
                unit_price: { type: Type.NUMBER },
              },
              required: ['description', 'quantity', 'unit_price'],
            },
          },
        },
        required: ['customer_name', 'description', 'currency', 'issue_date', 'due_date', 'items'],
      },
    },
  });

  const rawJson = response.text?.trim();
  if (!rawJson) {
    throw new Error('Gemini API returned an empty response.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Failed to parse Gemini output as JSON.');
  }

  // Validate with Zod schema
  const validationResult = InvoiceDraftSchema.safeParse(parsed);
  if (!validationResult.success) {
    console.error('[Gemini Invoice Parse Error]', validationResult.error.format());
    throw new Error(`Invalid invoice structure extracted: ${validationResult.error.issues.map(i => i.message).join(', ')}`);
  }

  return validationResult.data;
}

/**
 * Conversational invoice assistant grounded in actual database records.
 * Queries deterministic statistics and real invoice/customer records,
 * and supplies them as factual grounding to Gemini.
 */
export async function askInvoiceAssistant(
  question: string,
  history: Array<{ role: 'user' | 'model'; parts: [{ text: string }] }> = []
): Promise<string> {
  const ai = getAIClient();

  // Retrieve factual database state
  const stats = await getDashboardStats();
  const allInvoices = await getInvoices({ limit: 100 });
  const allCustomers = await getCustomers();

  const factualContext = {
    today: new Date().toISOString().split('T')[0],
    financialSummary: {
      totalInvoiced: stats.totalInvoiced,
      totalReceivedFromVerifiedPayments: stats.totalReceived,
      outstandingBalance: stats.outstandingBalance,
      overdueInvoicesCount: stats.overdueCount,
    },
    invoices: allInvoices.map((inv: InvoiceRecord) => ({
      invoiceNumber: inv.invoice_number,
      customerName: inv.customer?.name || 'Unknown',
      customerEmail: inv.customer?.email,
      totalAmount: inv.total_amount,
      currency: inv.currency,
      status: inv.status,
      issueDate: inv.issue_date,
      dueDate: inv.due_date,
      hasPayPalPaymentLink: Boolean(inv.payment_url || inv.paypal_order_id),
      payments: inv.payments?.map(p => ({
        amount: p.amount,
        status: p.status,
        verifiedAt: p.verified_at,
      })),
    })),
    customers: allCustomers.map(c => ({
      name: c.name,
      email: c.email,
      totalInvoiced: c.total_invoiced,
      totalPaid: c.total_paid,
      outstanding: c.outstanding,
    })),
  };

  const systemInstruction = `You are PayPilot's intelligent financial assistant for freelancers and businesses.
You answer user questions about their invoices, payments, cash flow, overdue balances, and customers.

GROUNDING RULES:
1. STRICT TRUTH: Answer strictly based on the real verified database records provided below in JSON.
2. NO FABRICATIONS: If the records do not contain a requested customer, invoice, or payment, explicitly say that no matching record was found. NEVER fabricate invoices, transaction IDs, or customers.
3. CITATIONS: When mentioning invoices, always mention the invoice number (e.g. INV-2026-001), the customer name, the amount with currency, and the status.
4. ACTIONABLE: Offer concise next steps where appropriate (e.g., "Would you like me to draft a reminder for this overdue invoice?").

VERIFIED DATABASE RECORDS:
${JSON.stringify(factualContext, null, 2)}
`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: [
      ...history,
      { role: 'user', parts: [{ text: question }] },
    ],
    config: {
      systemInstruction,
    },
  });

  return response.text?.trim() || 'I could not generate an answer based on your invoice records.';
}

/**
 * Generates a contextual payment reminder message for an invoice.
 */
export async function generateInvoiceReminder(
  invoice: InvoiceRecord,
  tone: 'polite' | 'firm' | 'final_notice' = 'polite'
): Promise<{ subject: string; message: string }> {
  const ai = getAIClient();

  const formattedTotal = formatCurrency(invoice.total_amount, invoice.currency);

  const prompt = `Generate a payment reminder email for the following verified invoice:
- Invoice Number: ${invoice.invoice_number}
- Customer Name: ${invoice.customer?.name || 'Valued Customer'}
- Total Amount: ${formattedTotal}
- Due Date: ${invoice.due_date}
- Status: ${invoice.status}
- Payment Link: ${invoice.payment_url || 'Available via PayPal Sandbox in your PayPilot portal'}
- Requested Tone: ${tone} (Options: polite reminder, firm follow-up, or urgent final notice)

Respond in JSON with:
{
  "subject": "Email subject line",
  "message": "Full email body message"
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.STRING },
          message: { type: Type.STRING },
        },
        required: ['subject', 'message'],
      },
    },
  });

  try {
    const parsed = JSON.parse(response.text?.trim() || '{}');
    return {
      subject: parsed.subject || `Payment Reminder: Invoice ${invoice.invoice_number}`,
      message: parsed.message || `Dear ${invoice.customer?.name || 'Customer'},\n\nThis is a friendly reminder that invoice ${invoice.invoice_number} for ${formattedTotal} was due on ${invoice.due_date}.`,
    };
  } catch {
    return {
      subject: `Payment Reminder: Invoice ${invoice.invoice_number}`,
      message: `Dear ${invoice.customer?.name || 'Customer'},\n\nThis is a friendly reminder regarding invoice ${invoice.invoice_number} for ${formattedTotal}, due on ${invoice.due_date}. Please let us know if you have any questions.`,
    };
  }
}
