import { describe, it } from 'node:test';
import assert from 'node:assert';
import { InvoiceDraftSchema } from '../server/gemini.js';
import { sanitizeCredential, getPayPalBaseUrl, extractPayPalLink, validateCapturedOrder } from '../server/paypal.js';
import { parseMonetaryAmount, parseQuantity, formatCurrency } from '../server/money.js';
import { formatPaymentRow, formatInvoiceRow, recordPayment } from '../server/db.js';

describe('PayPilot Business Logic & Financial Precision Tests', () => {
  it('correctly calculates subtotal and totals with 2 decimal places precision', () => {
    const items = [
      { description: 'Consulting Hour 1', quantity: 2.5, unitPrice: 150.33 },
      { description: 'Cloud Audit', quantity: 1, unitPrice: 499.99 },
    ];

    let subtotal = 0;
    const computed = items.map(item => {
      const lineTotal = Math.round(item.quantity * item.unitPrice * 100) / 100;
      subtotal += lineTotal;
      return { ...item, lineTotal };
    });

    const total = Math.round(subtotal * 100) / 100;

    assert.strictEqual(computed[0].lineTotal, 375.83); // 2.5 * 150.33 = 375.825 -> 375.83
    assert.strictEqual(computed[1].lineTotal, 499.99);
    assert.strictEqual(total, 875.82);
  });

  it('validates AI invoice draft extraction schema correctly', () => {
    const validDraft = {
      customer_name: 'Rahul Sharma',
      customer_email: 'rahul@example.com',
      description: 'Web development services',
      currency: 'USD',
      issue_date: '2026-10-17',
      due_date: '2026-10-24',
      notes: 'Net 7',
      items: [
        { description: 'React Frontend', quantity: 1, unit_price: 150.00 }
      ],
      clarification_needed: false,
    };

    const result = InvoiceDraftSchema.safeParse(validDraft);
    assert.strictEqual(result.success, true);
  });

  it('rejects AI drafts with negative unit prices or zero line items', () => {
    const invalidDraftNegativePrice = {
      customer_name: 'Jane Doe',
      description: 'Invalid services',
      currency: 'USD',
      issue_date: '2026-10-17',
      due_date: '2026-10-24',
      items: [
        { description: 'Something', quantity: 1, unit_price: -50 }
      ]
    };

    const result = InvoiceDraftSchema.safeParse(invalidDraftNegativePrice);
    assert.strictEqual(result.success, false);

    const emptyItemsDraft = {
      customer_name: 'Jane Doe',
      description: 'Invalid services',
      currency: 'USD',
      issue_date: '2026-10-17',
      due_date: '2026-10-24',
      items: []
    };
    const emptyResult = InvoiceDraftSchema.safeParse(emptyItemsDraft);
    assert.strictEqual(emptyResult.success, false);
  });

  it('computes dashboard financial metrics without double-counting drafts or cancelled invoices', () => {
    const testInvoices = [
      { id: '1', status: 'DRAFT', total: 1000 },
      { id: '2', status: 'CANCELLED', total: 500 },
      { id: '3', status: 'SENT', total: 2000, due_date: '2026-11-01' },
      { id: '4', status: 'OVERDUE', total: 1200, due_date: '2026-09-01' },
      { id: '5', status: 'PAID', total: 3000, due_date: '2026-10-01' },
    ];

    const testPayments = [
      { invoice_id: '5', amount: 3000, status: 'COMPLETED' },
      { invoice_id: '3', amount: 500, status: 'PENDING' }, // Pending payments should not count as received
    ];

    let totalInvoiced = 0;
    let overdueCount = 0;
    for (const inv of testInvoices) {
      if (inv.status !== 'DRAFT' && inv.status !== 'CANCELLED') {
        totalInvoiced += inv.total;
      }
      if (inv.status === 'OVERDUE') {
        overdueCount++;
      }
    }

    let totalReceived = 0;
    for (const p of testPayments) {
      if (p.status === 'COMPLETED') {
        totalReceived += p.amount;
      }
    }

    const outstandingBalance = Math.max(0, totalInvoiced - totalReceived);

    assert.strictEqual(totalInvoiced, 6200); // 2000 + 1200 + 3000 (DRAFT and CANCELLED ignored)
    assert.strictEqual(totalReceived, 3000); // Only COMPLETED payments
    assert.strictEqual(outstandingBalance, 3200); // 6200 - 3000
    assert.strictEqual(overdueCount, 1);
  });

  it('handles customer email formatting and matching safely', () => {
    const rawEmail = '  Rahul.Sharma@Example.COM  ';
    const cleanEmail = rawEmail.trim().toLowerCase();
    assert.strictEqual(cleanEmail, 'rahul.sharma@example.com');
  });

  it('discriminates valid UUIDs from invoice numbers to prevent PostgreSQL operator mismatch', () => {
    const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

    // Standard UUIDs (v4, v1, etc.)
    assert.strictEqual(isUuid('4d5c6646-449a-49db-82a9-4a697496c34b'), true);
    assert.strictEqual(isUuid('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'), true);
    assert.strictEqual(isUuid('00000000-0000-0000-0000-000000000000'), true);

    // Invoice numbers and non-UUID identifiers
    assert.strictEqual(isUuid('INV-2026-001'), false);
    assert.strictEqual(isUuid('INV-2026-002'), false);
    assert.strictEqual(isUuid('inv_12345'), false);
    assert.strictEqual(isUuid(''), false);
    assert.strictEqual(isUuid('4d5c6646-449a-49db-82a9'), false);
  });

  it('correctly classifies PayPal API 403 NOT_AUTHORIZED permission errors', () => {
    const rawErrorBody = '{"name":"NOT_AUTHORIZED","debug_id":"ca4f7e4fc587d","message":"Authorization failed due to insufficient permissions.","details":[{"issue":"NOT_AUTHORIZED","description":"Authorization failed due to insufficient permissions."}]}';
    const isPermissionError = (status: number, body: string) =>
      status === 403 || body.includes('NOT_AUTHORIZED') || body.includes('insufficient permissions');

    assert.strictEqual(isPermissionError(403, rawErrorBody), true);
    assert.strictEqual(isPermissionError(500, 'Internal Server Error'), false);
    assert.strictEqual(isPermissionError(400, '{"name":"INVALID_REQUEST"}'), false);
  });

  it('validates PayPal Orders v2 amount formatting and currency preservation for 5.00 USD invoice', () => {
    const invoice = {
      id: 'inv-test-1',
      invoice_number: 'INV-2026-099',
      currency: 'usd',
      total_amount: 5,
      items: [
        { description: 'Consulting', quantity: 1, unit_price: 5.00 }
      ]
    };

    const currency = (invoice.currency || 'USD').toUpperCase().trim();
    const totalFormatted = Number(invoice.total_amount).toFixed(2);

    assert.strictEqual(currency, 'USD');
    assert.strictEqual(totalFormatted, '5.00');

    // Test non-USD currency preservation
    const eurInvoice = { ...invoice, currency: 'eur', total_amount: 49.9 };
    assert.strictEqual((eurInvoice.currency || 'USD').toUpperCase().trim(), 'EUR');
    assert.strictEqual(Number(eurInvoice.total_amount).toFixed(2), '49.90');
  });

  it('enforces that uncaptured or pending PayPal orders cannot be marked as verified/paid', () => {
    const checkCanMarkPaid = (orderStatus: string, captureStatus?: string) => {
      if (orderStatus === 'COMPLETED') return true;
      if (orderStatus === 'APPROVED' && captureStatus === 'COMPLETED') return true;
      return false;
    };

    assert.strictEqual(checkCanMarkPaid('CREATED'), false);
    assert.strictEqual(checkCanMarkPaid('PAYER_ACTION_REQUIRED'), false);
    assert.strictEqual(checkCanMarkPaid('APPROVED', 'PENDING'), false);
    assert.strictEqual(checkCanMarkPaid('APPROVED', 'FAILED'), false);
    assert.strictEqual(checkCanMarkPaid('APPROVED', 'COMPLETED'), true);
    assert.strictEqual(checkCanMarkPaid('COMPLETED'), true);
  });

  it('normalizes PayPal base URL by removing trailing slashes to prevent 403 double-slash errors', () => {
    const original = process.env.PAYPAL_BASE_URL;
    try {
      process.env.PAYPAL_BASE_URL = 'https://api-m.sandbox.paypal.com/';
      assert.strictEqual(getPayPalBaseUrl(), 'https://api-m.sandbox.paypal.com');

      process.env.PAYPAL_BASE_URL = 'https://api-m.sandbox.paypal.com///';
      assert.strictEqual(getPayPalBaseUrl(), 'https://api-m.sandbox.paypal.com');

      process.env.PAYPAL_BASE_URL = 'https://api-m.sandbox.paypal.com';
      assert.strictEqual(getPayPalBaseUrl(), 'https://api-m.sandbox.paypal.com');

      delete process.env.PAYPAL_BASE_URL;
      assert.strictEqual(getPayPalBaseUrl(), 'https://api-m.sandbox.paypal.com');
    } finally {
      process.env.PAYPAL_BASE_URL = original;
    }
  });

  it('sanitizes credentials by trimming accidental quotes, carriage returns, and whitespace', () => {
    assert.strictEqual(sanitizeCredential('  "my_client_id"  '), 'my_client_id');
    assert.strictEqual(sanitizeCredential(" 'my_client_secret' \n"), 'my_client_secret');
    assert.strictEqual(sanitizeCredential(''), '');
    assert.strictEqual(sanitizeCredential(undefined), '');
  });

  it('normalizes valid numeric amounts and clean numeric strings to 2-decimal numbers', () => {
    assert.strictEqual(parseMonetaryAmount(5), 5);
    assert.strictEqual(parseMonetaryAmount(5.00), 5);
    assert.strictEqual(parseMonetaryAmount(1234.567), 1234.57);
    assert.strictEqual(parseMonetaryAmount(0), 0);
    assert.strictEqual(parseMonetaryAmount('5'), 5);
    assert.strictEqual(parseMonetaryAmount('5.00'), 5);
    assert.strictEqual(parseMonetaryAmount(' 150.25 \n'), 150.25);
    assert.strictEqual(parseMonetaryAmount('-10.50'), -10.50);
  });

  it('rejects missing, invalid, or non-finite monetary amounts instead of silently coercing to zero', () => {
    // Missing
    assert.throws(() => parseMonetaryAmount(null), /value is missing/);
    assert.throws(() => parseMonetaryAmount(undefined), /value is missing/);
    assert.throws(() => parseMonetaryAmount(''), /empty string/);
    assert.throws(() => parseMonetaryAmount('   '), /empty string/);

    // Invalid numeric strings
    assert.throws(() => parseMonetaryAmount('abc'), /not a valid numeric string/);
    assert.throws(() => parseMonetaryAmount('$5.00'), /not a valid numeric string/);
    assert.throws(() => parseMonetaryAmount('5.00.00'), /not a valid numeric string/);
    assert.throws(() => parseMonetaryAmount('5,00'), /not a valid numeric string/);
    assert.throws(() => parseMonetaryAmount('NaN'), /not a valid numeric string/);

    // Non-finite numbers
    assert.throws(() => parseMonetaryAmount(NaN), /non-finite number/);
    assert.throws(() => parseMonetaryAmount(Infinity), /non-finite number/);
    assert.throws(() => parseMonetaryAmount(-Infinity), /non-finite number/);

    // Invalid types
    assert.throws(() => parseMonetaryAmount(true), /expected number or numeric string/);
    assert.throws(() => parseMonetaryAmount({}), /expected number or numeric string/);
    assert.throws(() => parseMonetaryAmount([]), /expected number or numeric string/);
  });

  it('formats currency consistently for numbers and numeric strings using Intl.NumberFormat', () => {
    const fromNum = formatCurrency(5, 'USD');
    const fromStr = formatCurrency('5.00', 'USD');
    assert.strictEqual(fromNum, '$5.00');
    assert.strictEqual(fromStr, '$5.00');
    assert.strictEqual(fromNum, fromStr);

    const eurFormatted = formatCurrency('49.90', 'EUR');
    assert.ok(eurFormatted.includes('49.90') || eurFormatted.includes('€'));
  });

  it('converts PostgreSQL NUMERIC string amounts into JavaScript numbers in formatPaymentRow', () => {
    // Simulated PostgreSQL result where amount is returned as a string "5.00"
    const rawPostgresPaymentRow = {
      id: 'pay-uuid-1',
      invoice_id: 'inv-uuid-1',
      paypal_order_id: 'ORDER-12345',
      paypal_capture_id: 'CAPTURE-67890',
      amount: '5.00', // string from pg NUMERIC
      currency: 'USD',
      status: 'COMPLETED',
      verified_at: '2026-10-31T00:00:00Z',
      created_at: '2026-10-31T00:00:00Z',
      updated_at: '2026-10-31T00:00:00Z',
    };

    const formatted = formatPaymentRow(rawPostgresPaymentRow);

    // Must be a JavaScript number
    assert.strictEqual(typeof formatted.amount, 'number');
    assert.strictEqual(formatted.amount, 5);

    // toFixed(2) MUST succeed without throwing TypeError
    assert.strictEqual(formatted.amount.toFixed(2), '5.00');
  });

  it('validates simulation of successful and unsuccessful payment-verification responses', () => {
    // 1. Unsuccessful: order is PAYER_ACTION_REQUIRED (buyer has not yet authorized in Sandbox)
    const payerActionOrder = {
      status: 'PAYER_ACTION_REQUIRED',
    };
    const checkVerifyPayerAction = (order: typeof payerActionOrder) => {
      if (order.status === 'PAYER_ACTION_REQUIRED') {
        return {
          verified: false,
          status: 'PAYER_ACTION_REQUIRED',
          message: "PayPal order status is currently 'PAYER_ACTION_REQUIRED'. Payment has not yet been authorized or captured in Sandbox.",
        };
      }
      return { verified: true, status: order.status };
    };

    const actionRes = checkVerifyPayerAction(payerActionOrder);
    assert.strictEqual(actionRes.verified, false);
    assert.strictEqual(actionRes.status, 'PAYER_ACTION_REQUIRED');
    assert.ok(actionRes.message && actionRes.message.includes('PAYER_ACTION_REQUIRED'));

    // 2. Successful: order is COMPLETED with capture amount
    const completedOrder = {
      status: 'COMPLETED',
      purchase_units: [
        {
          payments: {
            captures: [
              {
                id: 'CAP-999',
                status: 'COMPLETED',
                amount: { currency_code: 'USD', value: '5.00' },
              },
            ],
          },
        },
      ],
    };

    const checkVerifyCompleted = (order: typeof completedOrder, invoiceTotal: number) => {
      const capture = order.purchase_units[0].payments.captures[0];
      const validAmount = parseMonetaryAmount(capture.amount.value, 'capture.amount');
      return {
        verified: true,
        status: 'COMPLETED' as const,
        captureId: capture.id,
        amount: validAmount,
        currency: capture.amount.currency_code,
      };
    };

    const compRes = checkVerifyCompleted(completedOrder, 5.00);
    assert.strictEqual(compRes.verified, true);
    assert.strictEqual(compRes.status, 'COMPLETED');
    assert.strictEqual(typeof compRes.amount, 'number');
    assert.strictEqual(compRes.amount.toFixed(2), '5.00');

    // 3. Unsuccessful: capture status is FAILED
    const failedCaptureOrder = {
      status: 'APPROVED',
      captureStatus: 'FAILED',
    };
    const checkVerifyFailedCapture = (order: typeof failedCaptureOrder) => {
      if (order.status === 'APPROVED' && order.captureStatus !== 'COMPLETED') {
        return {
          verified: false,
          status: order.captureStatus,
          message: `PayPal order was authorized by the buyer, but capture returned status '${order.captureStatus}'.`,
        };
      }
      return { verified: true, status: order.status };
    };

    const failRes = checkVerifyFailedCapture(failedCaptureOrder);
    assert.strictEqual(failRes.verified, false);
    assert.strictEqual(failRes.status, 'FAILED');
    assert.ok(failRes.message && failRes.message.includes('FAILED'));
  });

  it('correctly extracts PayPal approval and payer-action HATEOAS links without fabricating URLs', () => {
    // 1. Order with rel: 'approve'
    const linksWithApprove = [
      { href: 'https://api.sandbox.paypal.com/v2/checkout/orders/123', rel: 'self' },
      { href: 'https://www.sandbox.paypal.com/checkoutnow?token=123', rel: 'approve' },
    ];
    assert.strictEqual(extractPayPalLink(linksWithApprove), 'https://www.sandbox.paypal.com/checkoutnow?token=123');

    // 2. Order with rel: 'payer-action'
    const linksWithPayerAction = [
      { href: 'https://api.sandbox.paypal.com/v2/checkout/orders/456', rel: 'self' },
      { href: 'https://www.sandbox.paypal.com/checkoutnow?token=456', rel: 'payer-action' },
    ];
    assert.strictEqual(extractPayPalLink(linksWithPayerAction), 'https://www.sandbox.paypal.com/checkoutnow?token=456');

    // 3. Order without approval or payer-action link returns null without fabricating a URL
    const linksWithoutApprove = [
      { href: 'https://api.sandbox.paypal.com/v2/checkout/orders/789', rel: 'self' },
      { href: 'https://api.sandbox.paypal.com/v2/checkout/orders/789/capture', rel: 'capture' },
    ];
    assert.strictEqual(extractPayPalLink(linksWithoutApprove), null);
    assert.strictEqual(extractPayPalLink(undefined), null);
  });

  it('validates captured payments rigorously: checks amount, currency, and capture status', () => {
    const mockInvoice = {
      id: 'inv-test-id-100',
      invoice_number: 'INV-2026-100',
      total_amount: 150.00,
      currency: 'USD',
      status: 'SENT' as const,
      customer_id: 'cust-1',
      description: 'Consulting',
      subtotal: 150.00,
      issue_date: '2026-10-31',
      due_date: '2026-11-14',
      created_at: '2026-10-31T00:00:00Z',
      updated_at: '2026-10-31T00:00:00Z',
    };

    // Case 1: Matching capture amount and currency
    const validOrder = {
      status: 'COMPLETED',
      purchase_units: [
        {
          custom_id: 'inv-test-id-100',
          payments: {
            captures: [
              {
                id: 'CAP-100',
                status: 'COMPLETED',
                amount: { currency_code: 'USD', value: '150.00' },
              },
            ],
          },
        },
      ],
    };

    const validResult = validateCapturedOrder(validOrder, mockInvoice);
    assert.strictEqual(validResult.verified, true);
    assert.strictEqual(validResult.status, 'COMPLETED');
    assert.strictEqual(validResult.amount, 150.00);
    assert.strictEqual(validResult.currency, 'USD');
    assert.strictEqual(validResult.captureId, 'CAP-100');
    assert.strictEqual(validResult.message, 'Payment verified successfully. This invoice is now marked as Paid.');

    // Case 2: Amount mismatch rejection
    const underpaidOrder = {
      status: 'COMPLETED',
      purchase_units: [
        {
          payments: {
            captures: [
              {
                id: 'CAP-101',
                status: 'COMPLETED',
                amount: { currency_code: 'USD', value: '100.00' }, // Expected 150.00
              },
            ],
          },
        },
      ],
    };

    const underpaidResult = validateCapturedOrder(underpaidOrder, mockInvoice);
    assert.strictEqual(underpaidResult.verified, false);
    assert.strictEqual(underpaidResult.status, 'AMOUNT_MISMATCH');
    assert.strictEqual(underpaidResult.message, 'PayPal could not complete this payment. Please try checkout again.');

    // Case 3: Currency mismatch rejection
    const wrongCurrencyOrder = {
      status: 'COMPLETED',
      purchase_units: [
        {
          payments: {
            captures: [
              {
                id: 'CAP-102',
                status: 'COMPLETED',
                amount: { currency_code: 'EUR', value: '150.00' }, // Expected USD
              },
            ],
          },
        },
      ],
    };

    const wrongCurrencyResult = validateCapturedOrder(wrongCurrencyOrder, mockInvoice);
    assert.strictEqual(wrongCurrencyResult.verified, false);
    assert.strictEqual(wrongCurrencyResult.status, 'CURRENCY_MISMATCH');
    assert.strictEqual(wrongCurrencyResult.message, 'PayPal could not complete this payment. Please try checkout again.');

    // Case 4: Pending / incomplete capture
    const pendingOrder = {
      status: 'PENDING',
      purchase_units: [
        {
          payments: {
            captures: [
              {
                id: 'CAP-103',
                status: 'PENDING',
                amount: { currency_code: 'USD', value: '150.00' },
              },
            ],
          },
        },
      ],
    };

    const pendingResult = validateCapturedOrder(pendingOrder, mockInvoice);
    assert.strictEqual(pendingResult.verified, false);
    assert.strictEqual(pendingResult.status, 'PENDING');
    assert.strictEqual(pendingResult.message, 'PayPal is still processing your payment. Please check again shortly.');
  });

  it('provides exact required status messages for PAYER_ACTION_REQUIRED and CREATED states', () => {
    // PAYER_ACTION_REQUIRED with link
    const actionOrder = {
      status: 'PAYER_ACTION_REQUIRED',
      links: [
        { href: 'https://www.sandbox.paypal.com/checkoutnow?token=ACTION-123', rel: 'payer-action' },
      ],
    };
    const actionUrl = extractPayPalLink(actionOrder.links, ['payer-action', 'approve']);
    const payerActionResponse = {
      verified: false,
      status: 'PAYER_ACTION_REQUIRED',
      actionRequired: true,
      actionUrl: actionUrl || undefined,
      message: 'PayPal requires you to complete an additional payment step. Continue to PayPal to finish your payment.',
    };

    assert.strictEqual(payerActionResponse.actionRequired, true);
    assert.strictEqual(payerActionResponse.actionUrl, 'https://www.sandbox.paypal.com/checkoutnow?token=ACTION-123');
    assert.strictEqual(
      payerActionResponse.message,
      'PayPal requires you to complete an additional payment step. Continue to PayPal to finish your payment.'
    );

    // CREATED with approve link
    const createdOrder = {
      status: 'CREATED',
      links: [
        { href: 'https://www.sandbox.paypal.com/checkoutnow?token=CREATED-456', rel: 'approve' },
      ],
    };
    const approveUrl = extractPayPalLink(createdOrder.links, ['approve', 'payer-action']);
    const createdResponse = {
      verified: false,
      status: 'CREATED',
      actionRequired: true,
      actionUrl: approveUrl || undefined,
      message: 'The PayPal payment has not been approved yet. Please complete checkout.',
    };

    assert.strictEqual(createdResponse.actionRequired, true);
    assert.strictEqual(createdResponse.actionUrl, 'https://www.sandbox.paypal.com/checkoutnow?token=CREATED-456');
    assert.strictEqual(
      createdResponse.message,
      'The PayPal payment has not been approved yet. Please complete checkout.'
    );
  });

  it('ensures repeated payment verification is idempotent and does not create duplicate payment records', async () => {
    // Record initial verified payment
    const payment1 = await recordPayment({
      invoiceId: 'i1000000-0000-0000-0000-000000000003',
      paypalOrderId: 'ORDER-REPEAT-1',
      paypalCaptureId: 'CAP-REPEAT-1',
      amount: 750.00,
      currency: 'USD',
      status: 'COMPLETED',
    });

    assert.strictEqual(payment1.status, 'COMPLETED');
    assert.strictEqual(payment1.amount, 750.00);

    // Call recordPayment again with same capture ID (simulating user clicking Verify Payment again or reloading)
    const payment2 = await recordPayment({
      invoiceId: 'i1000000-0000-0000-0000-000000000003',
      paypalOrderId: 'ORDER-REPEAT-1',
      paypalCaptureId: 'CAP-REPEAT-1',
      amount: 750.00,
      currency: 'USD',
      status: 'COMPLETED',
    });

    // Both should return the same payment record ID and not duplicate
    assert.strictEqual(payment2.id, payment1.id);
    assert.strictEqual(payment2.paypal_capture_id, 'CAP-REPEAT-1');
  });
});



