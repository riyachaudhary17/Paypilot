import { InvoiceRecord } from './db.js';
import { parseMonetaryAmount } from './money.js';

export class PayPalApiError extends Error {
  status: number;
  body: string;
  isPermissionError: boolean;

  constructor(status: number, body: string, message: string) {
    super(message);
    this.name = 'PayPalApiError';
    this.status = status;
    this.body = body;
    this.isPermissionError =
      status === 403 ||
      body.includes('NOT_AUTHORIZED') ||
      body.includes('insufficient permissions');
  }
}

interface PayPalTokenCache {
  token: string;
  expiresAt: number; // timestamp in ms
  scopes: string[];
}

let cachedToken: PayPalTokenCache | null = null;

export const sanitizeCredential = (val?: string): string => {
  if (!val) return '';
  return val.trim().replace(/^["']|["']$/g, '').trim();
};

export const getPayPalBaseUrl = (): string => {
  const url = (process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com').trim();
  return url.replace(/\/+$/, '');
};

export function isPayPalConfigured(): boolean {
  const clientId = sanitizeCredential(process.env.PAYPAL_CLIENT_ID);
  const clientSecret = sanitizeCredential(process.env.PAYPAL_CLIENT_SECRET);
  return Boolean(clientId && clientSecret && clientId !== 'MY_PAYPAL_CLIENT_ID');
}

export function hasPayPalInvoicingScope(): boolean {
  if (!cachedToken) return false;
  return cachedToken.scopes.some(s => s.toLowerCase().includes('invoicing'));
}

export function getPayPalStatusSummary() {
  const configured = isPayPalConfigured();
  return {
    configured,
    environment: 'sandbox',
    baseUrl: getPayPalBaseUrl(),
    clientIdSet: Boolean(sanitizeCredential(process.env.PAYPAL_CLIENT_ID) && sanitizeCredential(process.env.PAYPAL_CLIENT_ID) !== 'MY_PAYPAL_CLIENT_ID'),
    clientSecretSet: Boolean(sanitizeCredential(process.env.PAYPAL_CLIENT_SECRET) && sanitizeCredential(process.env.PAYPAL_CLIENT_SECRET) !== 'MY_PAYPAL_CLIENT_SECRET'),
    merchantEmail: sanitizeCredential(process.env.PAYPAL_MERCHANT_EMAIL) || null,
    ordersSupported: true,
    invoicingScopeActive: cachedToken ? cachedToken.scopes.some(s => s.toLowerCase().includes('invoicing')) : false,
  };
}

/**
 * Obtains an OAuth 2.0 access token using client credentials flow.
 * Caches token until near expiry.
 */
export async function getPayPalAccessToken(): Promise<string> {
  if (!isPayPalConfigured()) {
    throw new Error('PayPal Sandbox is not configured. Please supply PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in the Secrets panel.');
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60000) {
    return cachedToken.token;
  }

  const clientId = sanitizeCredential(process.env.PAYPAL_CLIENT_ID);
  const clientSecret = sanitizeCredential(process.env.PAYPAL_CLIENT_SECRET);
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const tokenUrl = `${getPayPalBaseUrl()}/v1/oauth2/token`;
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'Accept-Language': 'en_US',
      'User-Agent': 'PayPilot/1.0 (Node.js)',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[PayPal API] Failed to obtain access token:', response.status, errorText);

    let diagnosticMessage = `PayPal authentication failed (${response.status})`;
    if (response.status === 401 || response.status === 403) {
      if (errorText.includes('<html') || errorText.includes('Forbidden')) {
        diagnosticMessage += ': Gateway rejected request. Verify PAYPAL_BASE_URL (no trailing slashes) and Sandbox client credentials.';
      } else {
        try {
          const parsed = JSON.parse(errorText);
          diagnosticMessage += `: ${parsed.error_description || parsed.error || parsed.message || 'Check Sandbox client ID and secret.'}`;
        } catch {
          diagnosticMessage += ': Check Sandbox client ID and secret in Secrets.';
        }
      }
    } else {
      diagnosticMessage += `: ${errorText.slice(0, 150)}`;
    }

    throw new PayPalApiError(response.status, errorText, diagnosticMessage);
  }

  const data = await response.json();
  const expiresInMs = (data.expires_in || 3600) * 1000;
  const scopes = typeof data.scope === 'string' ? data.scope.split(' ') : [];

  cachedToken = {
    token: data.access_token,
    expiresAt: now + expiresInMs,
    scopes,
  };

  return data.access_token;
}

export function extractPayPalLink(
  links?: Array<{ rel: string; href: string }>,
  rels: string[] = ['approve', 'payer-action']
): string | null {
  if (!Array.isArray(links)) return null;
  for (const rel of rels) {
    const found = links.find(l => l.rel?.toLowerCase() === rel.toLowerCase());
    if (found?.href) return found.href;
  }
  return null;
}

/**
 * Creates a PayPal Order for the given invoice using Orders v2 API.
 * Uses intent: "CAPTURE", properly formatted two-decimal amounts, exact breakdown,
 * dynamic currency handling, optional payee routing, and official approval URL.
 */
export async function createPayPalOrder(invoice: InvoiceRecord, appBaseUrl: string) {
  const token = await getPayPalAccessToken();
  const url = `${getPayPalBaseUrl()}/v2/checkout/orders`;

  const safeAppUrl = (appBaseUrl || process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const currency = (invoice.currency || 'USD').toUpperCase().trim();
  const totalFormatted = Number(invoice.total_amount).toFixed(2);

  // Compute item totals to verify breakdown precision
  const rawItems = (invoice.items && invoice.items.length > 0) ? invoice.items : [];
  let computedItemsSum = 0;
  const itemsList = rawItems.map(it => {
    const qty = Math.max(1, Math.round(Number(it.quantity) || 1));
    const unitPriceFormatted = Number(it.unit_price || 0).toFixed(2);
    const lineTotal = Number((Number(unitPriceFormatted) * qty).toFixed(2));
    computedItemsSum = Number((computedItemsSum + lineTotal).toFixed(2));
    return {
      name: (it.description || 'Invoice Item').trim().slice(0, 120),
      quantity: String(qty),
      unit_amount: {
        currency_code: currency,
        value: unitPriceFormatted,
      },
      category: 'DIGITAL_GOODS' as const,
    };
  });

  // Verify that item_total sum strictly matches the invoice total_amount
  const isSumEqual = itemsList.length > 0 && Math.abs(computedItemsSum - Number(totalFormatted)) < 0.009;

  const finalItems = isSumEqual
    ? itemsList
    : [
        {
          name: (invoice.description || `Invoice ${invoice.invoice_number}`).trim().slice(0, 120),
          quantity: '1',
          unit_amount: {
            currency_code: currency,
            value: totalFormatted,
          },
          category: 'DIGITAL_GOODS' as const,
        },
      ];

  const merchantEmail = process.env.PAYPAL_MERCHANT_EMAIL?.trim();
  const merchantId = process.env.PAYPAL_MERCHANT_ID?.trim();
  const payeeConfig = (merchantEmail || merchantId)
    ? {
        ...(merchantEmail ? { email_address: merchantEmail } : {}),
        ...(merchantId ? { merchant_id: merchantId } : {}),
      }
    : undefined;

  const payload = {
    intent: 'CAPTURE' as const,
    purchase_units: [
      {
        reference_id: invoice.invoice_number,
        description: (invoice.description || `Invoice ${invoice.invoice_number}`).trim().slice(0, 127),
        custom_id: invoice.id,
        invoice_id: invoice.invoice_number,
        ...(payeeConfig ? { payee: payeeConfig } : {}),
        amount: {
          currency_code: currency,
          value: totalFormatted,
          breakdown: {
            item_total: {
              currency_code: currency,
              value: totalFormatted,
            },
          },
        },
        items: finalItems,
      },
    ],
    application_context: {
      brand_name: 'PayPilot Invoicing',
      shipping_preference: 'NO_SHIPPING',
      landing_page: 'LOGIN',
      user_action: 'PAY_NOW',
      return_url: `${safeAppUrl}/invoices/${invoice.id}?paypal_order_status=success`,
      cancel_url: `${safeAppUrl}/invoices/${invoice.id}?paypal_order_status=cancelled`,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Prefer': 'return=representation',
      'User-Agent': 'PayPilot/1.0 (Node.js)',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[PayPal API] Order creation error:', response.status, errorBody);
    let detailMessage = errorBody;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.message) {
        detailMessage = parsed.message;
        if (Array.isArray(parsed.details) && parsed.details.length > 0) {
          const detailStrings = parsed.details
            .map((d: { issue?: string; description?: string }) => `${d.issue || ''}: ${d.description || ''}`)
            .filter(Boolean)
            .join('; ');
          if (detailStrings) detailMessage += ` (${detailStrings})`;
        }
      }
    } catch {
      // Keep raw body
    }
    throw new PayPalApiError(response.status, errorBody, `PayPal order creation failed (${response.status}): ${detailMessage}`);
  }

  const orderData = await response.json();
  const approveLink = extractPayPalLink(orderData.links, ['approve', 'payer-action']);

  if (!approveLink) {
    throw new Error(`PayPal order was created (${orderData.id}) but PayPal did not return an approval or payer-action link.`);
  }

  if (!orderData.id) {
    throw new Error('PayPal order was created but PayPal did not return an order ID.');
  }

  return {
    orderId: orderData.id,
    status: orderData.status,
    approvalUrl: approveLink,
    payee: orderData.purchase_units?.[0]?.payee,
    amount: orderData.purchase_units?.[0]?.amount,
    links: orderData.links,
  };
}

/**
 * Fetches the current state of an order from PayPal.
 */
export async function getPayPalOrder(orderId: string) {
  const token = await getPayPalAccessToken();
  const url = `${getPayPalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'PayPilot/1.0 (Node.js)',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to fetch PayPal order ${orderId} (${response.status}): ${errorBody}`);
  }

  return response.json();
}

/**
 * Captures an authorized/approved PayPal order.
 */
export async function capturePayPalOrder(orderId: string, requestId?: string) {
  const token = await getPayPalAccessToken();
  const url = `${getPayPalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`;

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Prefer': 'return=representation',
    'User-Agent': 'PayPilot/1.0 (Node.js)',
  };

  if (requestId) {
    headers['PayPal-Request-Id'] = requestId;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error(`[PayPal API] Capture error for order ${orderId} (${response.status}):`, errBody);
    let detailMessage = errBody;
    try {
      const parsed = JSON.parse(errBody);
      if (parsed.message) {
        detailMessage = parsed.message;
        if (Array.isArray(parsed.details) && parsed.details.length > 0) {
          const detailStrings = parsed.details
            .map((d: { issue?: string; description?: string }) => `${d.issue || ''}: ${d.description || ''}`)
            .filter(Boolean)
            .join('; ');
          if (detailStrings) detailMessage += ` (${detailStrings})`;
        }
      }
    } catch {
      // Keep raw
    }
    throw new PayPalApiError(response.status, errBody, `PayPal capture error (${response.status}): ${detailMessage}`);
  }

  return response.json();
}

/**
 * Creates and sends a PayPal Invoicing v2 invoice
 */
export async function createPayPalInvoiceV2(invoice: InvoiceRecord) {
  const token = await getPayPalAccessToken();
  const url = `${getPayPalBaseUrl()}/v2/invoicing/invoices`;

  const customerEmail = invoice.customer?.email;
  if (!customerEmail) {
    throw new Error('Customer email is required to create a PayPal Invoice.');
  }

  const items = (invoice.items && invoice.items.length > 0)
    ? invoice.items.map(it => ({
        name: it.description.slice(0, 100),
        quantity: String(Math.max(1, Math.floor(it.quantity))),
        unit_amount: {
          currency_code: invoice.currency,
          value: Number(it.unit_price).toFixed(2),
        },
      }))
    : [{
        name: invoice.description.slice(0, 100),
        quantity: '1',
        unit_amount: {
          currency_code: invoice.currency,
          value: Number(invoice.total_amount).toFixed(2),
        },
      }];

  const draftPayload = {
    detail: {
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.issue_date,
      payment_term: {
        term_type: 'DUE_ON_DATE_SPECIFIED',
        due_date: invoice.due_date,
      },
      currency_code: invoice.currency,
      note: invoice.notes || 'Payment requested via PayPilot.',
    },
    primary_recipients: [
      {
        billing_info: {
          name: {
            given_name: invoice.customer?.name || 'Customer',
          },
          email_address: customerEmail,
        },
      },
    ],
    items,
  };

  const createRes = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Prefer': 'return=representation',
      'User-Agent': 'PayPilot/1.0 (Node.js)',
    },
    body: JSON.stringify(draftPayload),
  });

  if (!createRes.ok) {
    const errBody = await createRes.text();
    console.warn('[PayPal API] Invoicing v2 creation failed:', createRes.status, errBody);
    throw new PayPalApiError(createRes.status, errBody, `PayPal Invoicing API error (${createRes.status}): ${errBody}`);
  }

  const createdInvoice = await createRes.json();
  const paypalInvId = createdInvoice.id;

  // Now send the invoice so a payment link is activated
  const sendUrl = `${getPayPalBaseUrl()}/v2/invoicing/invoices/${encodeURIComponent(paypalInvId)}/send`;
  const sendRes = await fetch(sendUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'PayPilot/1.0 (Node.js)',
    },
    body: JSON.stringify({
      send_to_recipient: true,
    }),
  });

  let payerViewUrl: string | null = null;
  if (sendRes.ok) {
    const sendData = await sendRes.json().catch(() => ({}));
    payerViewUrl = sendData.href || null;
  }

  // Get invoice details to retrieve payer-view link
  const getUrl = `${getPayPalBaseUrl()}/v2/invoicing/invoices/${encodeURIComponent(paypalInvId)}`;
  const getRes = await fetch(getUrl, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'User-Agent': 'PayPilot/1.0 (Node.js)',
    }
  });

  if (getRes.ok) {
    const fullInv = await getRes.json();
    const payerLink = fullInv.links?.find((l: { rel: string; href: string }) => l.rel === 'payer-view');
    if (payerLink) {
      payerViewUrl = payerLink.href;
    }
  }

  return {
    paypalInvoiceId: paypalInvId,
    status: createdInvoice.status,
    paymentUrl: payerViewUrl,
  };
}

export interface PayPalVerificationResult {
  verified: boolean;
  status: string;
  message?: string;
  actionRequired?: boolean;
  actionUrl?: string;
  paypalOrderId?: string | null;
  paypalInvoiceId?: string | null;
  captureId?: string | null;
  amount?: number;
  currency?: string;
  rawResponse?: Record<string, unknown>;
}

export function validateCapturedOrder(order: any, invoice: InvoiceRecord): PayPalVerificationResult {
  const pu = order.purchase_units?.[0];
  const captures = pu?.payments?.captures;
  const capture = (captures && captures.length > 0) ? captures[0] : (order.payments?.captures?.[0]);

  const captureStatus = capture?.status || (order.status === 'COMPLETED' ? 'COMPLETED' : undefined);

  if (captureStatus !== 'COMPLETED') {
    return {
      verified: false,
      status: captureStatus || order.status || 'PENDING',
      paypalOrderId: invoice.paypal_order_id,
      message: 'PayPal is still processing your payment. Please check again shortly.',
    };
  }

  const rawAmount = capture?.amount?.value ?? pu?.amount?.value;
  const rawCurrency = capture?.amount?.currency_code ?? pu?.amount?.currency_code;

  if (rawAmount === undefined || rawAmount === null) {
    return {
      verified: false,
      status: 'INVALID_AMOUNT',
      paypalOrderId: invoice.paypal_order_id,
      message: 'PayPal could not complete this payment. Please try checkout again.',
    };
  }

  const capturedAmount = parseMonetaryAmount(rawAmount, 'paypal.capture.amount');
  const expectedAmount = parseMonetaryAmount(invoice.total_amount, 'invoice.total_amount');

  if (Math.abs(capturedAmount - expectedAmount) > 0.01) {
    console.warn(`[PayPal Verify] Captured amount mismatch: expected ${expectedAmount}, received ${capturedAmount}`);
    return {
      verified: false,
      status: 'AMOUNT_MISMATCH',
      paypalOrderId: invoice.paypal_order_id,
      message: 'PayPal could not complete this payment. Please try checkout again.',
    };
  }

  const capturedCurrency = String(rawCurrency || '').toUpperCase().trim();
  const invoiceCurrency = String(invoice.currency || 'USD').toUpperCase().trim();

  if (capturedCurrency && capturedCurrency !== invoiceCurrency) {
    console.warn(`[PayPal Verify] Captured currency mismatch: expected ${invoiceCurrency}, received ${capturedCurrency}`);
    return {
      verified: false,
      status: 'CURRENCY_MISMATCH',
      paypalOrderId: invoice.paypal_order_id,
      message: 'PayPal could not complete this payment. Please try checkout again.',
    };
  }

  const captureId = capture?.id || `CAP-${invoice.paypal_order_id}`;

  return {
    verified: true,
    status: 'COMPLETED',
    paypalOrderId: invoice.paypal_order_id,
    captureId,
    amount: capturedAmount,
    currency: capturedCurrency || invoiceCurrency,
    message: 'Payment verified successfully. This invoice is now marked as Paid.',
    rawResponse: { orderStatus: order.status, captureId },
  };
}

/**
 * Performs authoritative server-side payment verification against PayPal APIs.
 * Never trusts frontend flags or URL parameters alone.
 */
export async function verifyPayPalPayment(invoice: InvoiceRecord): Promise<PayPalVerificationResult> {
  if (invoice.status === 'PAID') {
    return {
      verified: true,
      status: 'ALREADY_PAID',
      paypalOrderId: invoice.paypal_order_id,
      paypalInvoiceId: invoice.paypal_invoice_id,
      message: 'This invoice has already been paid.',
    };
  }

  if (!isPayPalConfigured()) {
    throw new Error('Cannot verify payment: PayPal Sandbox is not configured.');
  }

  // Verification Strategy 1: Check Order ID
  if (invoice.paypal_order_id) {
    const order = await getPayPalOrder(invoice.paypal_order_id);
    const orderStatus = order.status;

    // Check purchase unit association
    const pu = order.purchase_units?.[0];
    const orderMatchesInvoice =
      !pu ||
      !pu.custom_id ||
      pu.custom_id === invoice.id ||
      pu.reference_id === invoice.invoice_number ||
      pu.invoice_id === invoice.invoice_number;

    if (!orderMatchesInvoice) {
      console.warn(`[PayPal Verify] Order ${invoice.paypal_order_id} does not match invoice ${invoice.id}`);
      return {
        verified: false,
        status: 'MISMATCH',
        paypalOrderId: invoice.paypal_order_id,
        message: 'PayPal could not complete this payment. Please try checkout again.',
      };
    }

    // 1. If order was APPROVED by customer in PayPal Sandbox, capture it now!
    if (orderStatus === 'APPROVED') {
      let captureResult: any;
      try {
        captureResult = await capturePayPalOrder(
          invoice.paypal_order_id,
          `capture-${invoice.id}-${invoice.paypal_order_id}`
        );
      } catch (err: unknown) {
        if (err instanceof PayPalApiError && (err.status === 422 || err.body.includes('ORDER_ALREADY_CAPTURED'))) {
          console.log(`[PayPal Verify] Order ${invoice.paypal_order_id} was already captured in PayPal. Reconciling...`);
          const reloadedOrder = await getPayPalOrder(invoice.paypal_order_id);
          return validateCapturedOrder(reloadedOrder, invoice);
        }
        throw err;
      }
      return validateCapturedOrder(captureResult, invoice);
    }

    // 2. If order is already COMPLETED
    if (orderStatus === 'COMPLETED') {
      return validateCapturedOrder(order, invoice);
    }

    // 3. If PAYER_ACTION_REQUIRED
    if (orderStatus === 'PAYER_ACTION_REQUIRED') {
      const actionUrl = extractPayPalLink(order.links, ['payer-action', 'approve']);
      return {
        verified: false,
        status: 'PAYER_ACTION_REQUIRED',
        actionRequired: true,
        actionUrl: actionUrl || undefined,
        paypalOrderId: invoice.paypal_order_id,
        message: 'PayPal requires you to complete an additional payment step. Continue to PayPal to finish your payment.',
      };
    }

    // 4. If CREATED
    if (orderStatus === 'CREATED') {
      const approveUrl = extractPayPalLink(order.links, ['approve', 'payer-action']);
      return {
        verified: false,
        status: 'CREATED',
        actionRequired: true,
        actionUrl: approveUrl || undefined,
        paypalOrderId: invoice.paypal_order_id,
        message: 'The PayPal payment has not been approved yet. Please complete checkout.',
      };
    }

    // 5. If PENDING
    if (orderStatus === 'PENDING') {
      return {
        verified: false,
        status: 'PENDING',
        paypalOrderId: invoice.paypal_order_id,
        message: 'PayPal is still processing your payment. Please check again shortly.',
      };
    }

    // 6. If VOIDED, DENIED, or FAILED
    return {
      verified: false,
      status: orderStatus,
      paypalOrderId: invoice.paypal_order_id,
      message: 'PayPal could not complete this payment. Please try checkout again.',
    };
  }

  // Verification Strategy 2: Check PayPal Invoicing API v2
  if (invoice.paypal_invoice_id) {
    const token = await getPayPalAccessToken();
    const url = `${getPayPalBaseUrl()}/v2/invoicing/invoices/${encodeURIComponent(invoice.paypal_invoice_id)}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'User-Agent': 'PayPilot/1.0 (Node.js)',
      }
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to check PayPal invoice (${response.status}): ${err}`);
    }

    const invData = await response.json();
    const status = invData.status;

    if (status === 'PAID' || status === 'MARKED_AS_PAID') {
      const paidAmount = invData.payments?.paid_amount?.value ?? invoice.total_amount;
      const validAmount = parseMonetaryAmount(paidAmount, 'paypal.invoicing.amount');
      const expectedAmount = parseMonetaryAmount(invoice.total_amount, 'invoice.total_amount');

      if (Math.abs(validAmount - expectedAmount) > 0.01) {
        return {
          verified: false,
          status: 'AMOUNT_MISMATCH',
          paypalInvoiceId: invoice.paypal_invoice_id,
          message: 'PayPal could not complete this payment. Please try checkout again.',
        };
      }

      return {
        verified: true,
        status: 'COMPLETED',
        paypalInvoiceId: invoice.paypal_invoice_id,
        captureId: invData.payments?.transactions?.[0]?.payment_id || `INV-PAY-${invoice.paypal_invoice_id}`,
        amount: validAmount,
        currency: (invData.payments?.paid_amount?.currency_code || invoice.currency).toUpperCase().trim(),
        message: 'Payment verified successfully. This invoice is now marked as Paid.',
        rawResponse: { invoiceStatus: status },
      };
    }

    if (status === 'SENT' || status === 'SCHEDULED' || status === 'DRAFT') {
      const payerLink = invData.links?.find((l: { rel: string; href: string }) => l.rel === 'payer-view');
      return {
        verified: false,
        status,
        actionRequired: true,
        actionUrl: payerLink?.href || invoice.payment_url || undefined,
        paypalInvoiceId: invoice.paypal_invoice_id,
        message: 'The PayPal payment has not been approved yet. Please complete checkout.',
      };
    }

    return {
      verified: false,
      status,
      paypalInvoiceId: invoice.paypal_invoice_id,
      message: 'PayPal could not complete this payment. Please try checkout again.',
    };
  }

  throw new Error('Invoice has no associated PayPal Order or Invoice ID to verify.');
}
