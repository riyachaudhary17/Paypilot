import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CreditCard,
  CheckCircle,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Copy,
  Check,
  AlertCircle,
  ShieldCheck,
  Calendar,
  Clock,
  Send,
  FileCheck,
} from 'lucide-react';
import { api } from '../api';
import { Invoice, IntegrationStatus } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { formatMoney } from '../utils/money';

interface InvoiceDetailsProps {
  invoiceId: string;
  onBack: () => void;
  integrationStatus?: IntegrationStatus | null;
}

export const InvoiceDetails: React.FC<InvoiceDetailsProps> = ({
  invoiceId,
  onBack,
  integrationStatus,
}) => {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // PayPal actions state
  const [generatingPayPal, setGeneratingPayPal] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState<{
    success: boolean;
    message: string;
    actionRequired?: boolean;
    actionUrl?: string;
    status?: string;
  } | null>(null);

  // AI Reminder state
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderTone, setReminderTone] = useState<'polite' | 'firm' | 'final_notice'>('polite');
  const [generatingReminder, setGeneratingReminder] = useState(false);
  const [reminderContent, setReminderContent] = useState<{ subject: string; message: string } | null>(null);
  const [copiedReminder, setCopiedReminder] = useState(false);

  const fetchInvoice = async () => {
    try {
      const data = await api.getInvoice(invoiceId);
      setInvoice(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoice();
  }, [invoiceId]);

  // Handle return from PayPal checkout or cancellation via URL parameters
  useEffect(() => {
    if (!invoice) return;
    const params = new URLSearchParams(window.location.search);
    const paypalStatus = params.get('paypal_order_status');

    if (paypalStatus === 'success') {
      // Clear query params from browser URL without reloading
      window.history.replaceState(null, '', window.location.pathname);
      if (invoice.status !== 'PAID') {
        handleVerifyPayment();
      }
    } else if (paypalStatus === 'cancelled') {
      window.history.replaceState(null, '', window.location.pathname);
      setVerifyNotice({
        success: false,
        message: 'PayPal checkout was cancelled. You can continue checkout whenever you are ready.',
      });
    }
  }, [invoice?.id]);

  // PayPal Link Generator
  const handleGeneratePayPal = async (flow: 'order' | 'invoicing' = 'order') => {
    if (!invoice) return;
    setGeneratingPayPal(true);
    setVerifyNotice(null);
    setErrorMsg(null);

    try {
      const res = await api.createPayPalLink(invoice.id, flow);
      setInvoice(res.invoice);
      setVerifyNotice({
        success: true,
        message: res.notice || `Generated PayPal Sandbox ${flow === 'order' ? 'Orders checkout link' : 'Invoice'}.`,
        actionUrl: res.paymentUrl,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setGeneratingPayPal(false);
    }
  };

  // Authoritative server-side payment verification
  const handleVerifyPayment = async () => {
    if (!invoice) return;
    setVerifyingPayment(true);
    setVerifyNotice(null);
    setErrorMsg(null);

    try {
      const res = await api.verifyPayment(invoice.id);
      if (res.verified && res.invoice) {
        setInvoice(res.invoice);
        setVerifyNotice({
          success: true,
          status: 'PAID',
          message: res.message || 'Payment verified successfully. This invoice is now marked as Paid.',
        });
      } else {
        setVerifyNotice({
          success: false,
          status: res.status,
          actionRequired: res.actionRequired,
          actionUrl: res.actionUrl,
          message: res.message || `Payment status is '${res.status}'. Awaiting authorization in PayPal Sandbox.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setVerifyingPayment(false);
    }
  };

  // Generate AI Reminder
  const handleGenerateReminder = async () => {
    if (!invoice) return;
    setGeneratingReminder(true);
    setCopiedReminder(false);
    try {
      const res = await api.generateReminder(invoice.id, reminderTone);
      setReminderContent(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setGeneratingReminder(false);
    }
  };

  const handleCopyReminder = () => {
    if (!reminderContent) return;
    navigator.clipboard.writeText(`Subject: ${reminderContent.subject}\n\n${reminderContent.message}`);
    setCopiedReminder(true);
    setTimeout(() => setCopiedReminder(false), 2000);
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
        Loading invoice details...
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        <button onClick={onBack} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-semibold">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Invoices
        </button>
        <div className="bg-red-50 text-red-700 p-4 rounded-xl text-xs">
          {errorMsg || 'Invoice not found.'}
        </div>
      </div>
    );
  }

  const paypalConfigured = integrationStatus?.paypal.configured;

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            title="Back to Invoices"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold font-mono text-slate-900 tracking-tight">
                {invoice.invoice_number}
              </h2>
              <StatusBadge status={invoice.status} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Created on {new Date(invoice.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Quick Toolbar */}
        <div className="flex items-center gap-2">
          {invoice.status !== 'PAID' && (
            <button
              onClick={() => {
                setShowReminderModal(true);
                handleGenerateReminder();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Draft AI Reminder</span>
            </button>
          )}

          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
          >
            Print
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {verifyNotice && (
        <div className={`p-4 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 border ${
          verifyNotice.success 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          <div className="flex items-start gap-2">
            {verifyNotice.success ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            ) : (
              <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            )}
            <p className="font-medium">{verifyNotice.message}</p>
          </div>

          {verifyNotice.actionUrl && (
            <a
              href={verifyNotice.actionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shrink-0 shadow-xs transition-colors"
            >
              <span>Continue Payment on PayPal</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}

      {/* Primary 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols): Invoice Details & Line Items */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main Invoice Card */}
          <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Billed To
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  {invoice.customer?.name || 'Customer'}
                </h3>
                <p className="text-xs text-slate-500">
                  {invoice.customer?.email}
                </p>
              </div>

              <div className="sm:text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Payment Terms
                </span>
                <div className="text-xs font-semibold text-slate-800 mt-0.5">
                  Due: {invoice.due_date}
                </div>
                <div className="text-[11px] text-slate-500">
                  Issued: {invoice.issue_date}
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Project / Service Description
              </span>
              <p className="text-xs sm:text-sm font-medium text-slate-800 mt-1">
                {invoice.description}
              </p>
            </div>

            {/* Line Items Table */}
            <div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-y border-slate-100">
                  <tr>
                    <th className="py-2.5 px-3">Item Description</th>
                    <th className="py-2.5 px-3 text-center">Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Price</th>
                    <th className="py-2.5 px-3 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.items && invoice.items.length > 0 ? (
                    invoice.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-3 px-3 font-medium text-slate-800">
                          {item.description}
                        </td>
                        <td className="py-3 px-3 text-center text-slate-600">
                          {item.quantity}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-600">
                          {formatMoney(item.unit_price, invoice.currency)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900">
                          {formatMoney(item.line_total || item.quantity * item.unit_price, invoice.currency)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-slate-400">
                        Single total invoice item
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Totals Summary */}
              <div className="pt-4 flex justify-end">
                <div className="w-64 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span className="font-mono font-medium">{formatMoney(invoice.subtotal, invoice.currency)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 text-sm border-t border-slate-200 pt-2">
                    <span>Total Amount:</span>
                    <span className="font-mono text-blue-600">{formatMoney(invoice.total_amount, invoice.currency)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="pt-3 border-t border-slate-100 text-xs text-slate-600">
                <span className="font-semibold text-slate-700">Notes / Instructions: </span>
                {invoice.notes}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1 col): PayPal Sandbox Execution & Verified Settlement */}
        <div className="space-y-6">
          {/* PayPal Sandbox Payment Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">PayPal Sandbox Flow</h3>
                <span className="text-[11px] text-blue-600 font-medium">REST API Checkout & Invoicing</span>
              </div>
            </div>

            {invoice.status === 'PAID' ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs sm:text-sm">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Verified Completed Settlement</span>
                </div>
                <div className="text-xs text-emerald-700 space-y-1">
                  <div>
                    <span className="font-semibold">Source: </span>
                    Authoritative PayPal REST API capture
                  </div>
                  {invoice.payments?.[0]?.amount !== undefined && (
                    <div>
                      <span className="font-semibold">Amount Paid: </span>
                      <span className="font-mono font-bold">{formatMoney(invoice.payments[0].amount, invoice.payments[0].currency)}</span>
                    </div>
                  )}
                  {invoice.payments?.[0]?.paypal_capture_id && (
                    <div>
                      <span className="font-semibold">Capture ID: </span>
                      <span className="font-mono">{invoice.payments[0].paypal_capture_id}</span>
                    </div>
                  )}
                  {invoice.payments?.[0]?.verified_at && (
                    <div>
                      <span className="font-semibold">Settled at: </span>
                      {new Date(invoice.payments[0].verified_at).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Generate PayPal Payment Link */}
                {!invoice.payment_url ? (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-600">
                      Generate an authentic PayPal Sandbox checkout or invoice request link for this customer.
                    </p>
                    <div className="space-y-2">
                      <button
                        onClick={() => handleGeneratePayPal('order')}
                        disabled={generatingPayPal}
                        className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 shadow-xs"
                      >
                        {generatingPayPal ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CreditCard className="w-3.5 h-3.5" />
                        )}
                        <span>Create PayPal Checkout (Recommended)</span>
                      </button>

                      <button
                        onClick={() => handleGeneratePayPal('invoicing')}
                        disabled={generatingPayPal}
                        className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors disabled:opacity-50"
                        title="Creates a PayPal Invoice. If Invoicing is not enabled on your Sandbox REST app, automatically falls back to Checkout."
                      >
                        <FileCheck className="w-3.5 h-3.5 text-slate-600" />
                        <span>Create PayPal Invoice (Invoicing v2)</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-700">Sandbox Payment Ready</span>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      </div>
                      {invoice.paypal_order_id && (
                        <div className="text-[11px] text-slate-500">
                          <span className="font-semibold">Order ID: </span>
                          <span className="font-mono text-slate-700">{invoice.paypal_order_id}</span>
                        </div>
                      )}
                      {invoice.paypal_invoice_id && (
                        <div className="text-[11px] text-slate-500">
                          <span className="font-semibold">PayPal Inv ID: </span>
                          <span className="font-mono text-slate-700">{invoice.paypal_invoice_id}</span>
                        </div>
                      )}
                    </div>

                    {/* Button 1: Open PayPal Sandbox Payment Experience */}
                    <a
                      href={invoice.payment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-xs"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Open PayPal Sandbox Payment</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    {/* Button 2: Authoritative Server-side Verification */}
                    <button
                      onClick={handleVerifyPayment}
                      disabled={verifyingPayment}
                      className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors disabled:opacity-50"
                    >
                      {verifyingPayment ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                      <span>Verify Payment with PayPal API</span>
                    </button>

                    {/* Helpful Sandbox Buyer Guidance */}
                    <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-lg text-[11px] text-slate-600 space-y-1.5">
                      <div className="font-semibold text-blue-900 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>Sandbox Testing Note</span>
                      </div>
                      <p className="text-slate-600">
                        Log in with your <strong>Personal Sandbox buyer account</strong>. If PayPal warns <em>"This seller doesn't accept payments in your currency"</em>, update your Sandbox Business Account at <a href="https://www.sandbox.paypal.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">sandbox.paypal.com</a> under <strong>Account Settings &gt; Payment Preferences &gt; Block Payments</strong> to allow payments in currencies you do not hold, or use a US-based Personal Sandbox buyer account.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Identification & System Metadata */}
          <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs space-y-3 text-xs">
            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
              System Metadata
            </h4>
            <div className="space-y-1.5 text-slate-600">
              <div className="flex justify-between">
                <span className="text-slate-400">Database UUID:</span>
                <span className="font-mono text-slate-800">{invoice.id.slice(0, 12)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Currency:</span>
                <span className="font-semibold text-slate-800">{invoice.currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Updated:</span>
                <span className="text-slate-800">{new Date(invoice.updated_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Reminder Modal */}
      {showReminderModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">AI Payment Reminder Draft</h3>
              </div>
              <button
                onClick={() => setShowReminderModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-semibold"
              >
                Close
              </button>
            </div>

            {/* Tone selector */}
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-slate-600">Tone:</span>
              {(['polite', 'firm', 'final_notice'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setReminderTone(t);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold capitalize transition-colors ${
                    reminderTone === t
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {t.replace('_', ' ')}
                </button>
              ))}
              <button
                onClick={handleGenerateReminder}
                disabled={generatingReminder}
                className="ml-auto text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${generatingReminder ? 'animate-spin' : ''}`} />
                Regenerate
              </button>
            </div>

            {generatingReminder ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                Generating reminder with Gemini...
              </div>
            ) : reminderContent ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Subject Line
                  </label>
                  <input
                    type="text"
                    value={reminderContent.subject}
                    onChange={(e) => setReminderContent({ ...reminderContent, subject: e.target.value })}
                    className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-md font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Email Body
                  </label>
                  <textarea
                    rows={6}
                    value={reminderContent.message}
                    onChange={(e) => setReminderContent({ ...reminderContent, message: e.target.value })}
                    className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-md font-sans"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-[11px] text-slate-400">
                    Review and copy before sending to customer.
                  </span>
                  <button
                    onClick={handleCopyReminder}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    {copiedReminder ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Message</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
