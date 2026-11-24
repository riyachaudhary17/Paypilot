import React, { useState } from 'react';
import {
  Sparkles,
  FileText,
  Plus,
  Trash2,
  Calendar,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { api } from '../api';
import { Invoice } from '../types';
import { formatMoney } from '../utils/money';

interface CreateInvoiceProps {
  initialPrompt?: string;
  onInvoiceCreated: (invoice: Invoice) => void;
  onCancel: () => void;
}

interface LineItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

export const CreateInvoice: React.FC<CreateInvoiceProps> = ({
  initialPrompt,
  onInvoiceCreated,
  onCancel,
}) => {
  const [mode, setMode] = useState<'ai' | 'standard'>(initialPrompt ? 'ai' : 'standard');

  // AI mode state
  const [aiPrompt, setAiPrompt] = useState(
    initialPrompt || 'Create an invoice for Rahul Sharma for 150 US dollars for website development, due seven days from today.'
  );
  const [extracting, setExtracting] = useState(false);
  const [aiClarification, setAiClarification] = useState<string | null>(null);

  // Form Fields
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState('Payment requested via PayPilot PayPal Sandbox.');
  const [items, setItems] = useState<LineItemInput[]>([
    { description: 'Software Development Services', quantity: 1, unitPrice: 150.00 },
  ]);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Line item helpers
  const addItem = () => {
    setItems([...items, { description: '', quantity: 1, unitPrice: 0 }]);
  };

  const removeItem = (idx: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== idx));
    }
  };

  const updateItem = (idx: number, field: keyof LineItemInput, val: string | number) => {
    const updated = [...items];
    if (field === 'quantity') {
      updated[idx].quantity = Math.max(0.01, Number(val) || 0);
    } else if (field === 'unitPrice') {
      updated[idx].unitPrice = Math.max(0, Number(val) || 0);
    } else {
      updated[idx].description = String(val);
    }
    setItems(updated);
  };

  // Calculations
  const subtotal = items.reduce((sum, item) => {
    const line = Math.round(item.quantity * item.unitPrice * 100) / 100;
    return sum + line;
  }, 0);
  const totalAmount = Math.round(subtotal * 100) / 100;

  // AI Extraction Handler
  const handleExtractWithAI = async () => {
    if (!aiPrompt.trim()) return;
    setExtracting(true);
    setErrorMsg(null);
    setAiClarification(null);

    try {
      const draft = await api.generateAIDraft(aiPrompt.trim());

      setCustomerName(draft.customer_name || '');
      setCustomerEmail(draft.customer_email || '');
      setDescription(draft.description || '');
      setCurrency(draft.currency || 'USD');
      if (draft.issue_date) setIssueDate(draft.issue_date);
      if (draft.due_date) setDueDate(draft.due_date);
      if (draft.notes) setNotes(draft.notes);

      if (draft.items && draft.items.length > 0) {
        setItems(draft.items.map(it => ({
          description: it.description,
          quantity: Number(it.quantity) || 1,
          unitPrice: Number(it.unit_price) || 0,
        })));
      }

      if (draft.clarification_needed && draft.clarification_prompt) {
        setAiClarification(draft.clarification_prompt);
      }

      // Switch to standard mode so user can review and edit before saving
      setMode('standard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setExtracting(false);
    }
  };

  // Submission handler
  const handleSave = async (status: 'DRAFT' | 'SENT') => {
    setErrorMsg(null);

    if (!customerName.trim()) {
      setErrorMsg('Please specify a customer name.');
      return;
    }
    if (!customerEmail.trim() || !customerEmail.includes('@')) {
      setErrorMsg('Please provide a valid customer email for PayPal invoicing.');
      return;
    }
    if (!description.trim()) {
      setErrorMsg('Please enter an invoice description or title.');
      return;
    }
    if (items.some(i => !i.description.trim() || i.quantity <= 0 || i.unitPrice < 0)) {
      setErrorMsg('Please ensure all line items have descriptions and valid positive amounts.');
      return;
    }

    setSaving(true);
    try {
      const newInvoice = await api.createInvoice({
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        description: description.trim(),
        currency,
        issueDate,
        dueDate,
        notes: notes.trim() || undefined,
        status,
        items,
      });

      onInvoiceCreated(newInvoice);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
      {/* Top Title & Mode Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Create Invoice</h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Generate an invoice with Gemini AI or enter details manually
          </p>
        </div>

        {/* Tab switch */}
        <div className="bg-slate-200/80 p-1 rounded-lg flex items-center gap-1 w-fit">
          <button
            onClick={() => setMode('ai')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors ${
              mode === 'ai' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>AI Smart Draft</span>
          </button>
          <button
            onClick={() => setMode('standard')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors ${
              mode === 'standard' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-slate-600" />
            <span>Standard Form</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-xs sm:text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* AI Extraction Mode */}
      {mode === 'ai' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Natural Language Invoice Generator</h3>
              <p className="text-xs text-slate-500">
                Describe the invoice in natural language. Gemini will extract structured line items and dates.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Invoice Description Prompt
            </label>
            <textarea
              rows={4}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g. Create an invoice for Rahul Sharma (rahul@example.com) for 150 US dollars for website development, due seven days from today."
              className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-sans"
            />
          </div>

          {/* Quick Prompt Suggestions */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Example Prompts
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                'Create an invoice for Rahul Sharma for 150 US dollars for website development, due seven days from today.',
                'Bill Acme Software Labs $2,400 for 40 hours of cloud infrastructure consulting at $60/hr, due on November 15.',
                'Invoice Elena Rostova for $750 for brand identity and design tokens, due in two weeks.',
              ].map((example, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setAiPrompt(example)}
                  className="text-left text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-md transition-colors"
                >
                  "{example.slice(0, 70)}..."
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExtractWithAI}
              disabled={extracting || !aiPrompt.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 shadow-xs"
            >
              {extracting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Parsing with Gemini...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Structured Draft</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Standard Form / Editable Review Screen */}
      {mode === 'standard' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs space-y-6">
          {aiClarification && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3.5 rounded-lg text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">AI Clarification: </span>
                {aiClarification}
              </div>
            </div>
          )}

          {/* Section 1: Customer Details */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              1. Customer Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Customer Email (for PayPal checkout) *
                </label>
                <input
                  type="email"
                  required
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="e.g. rahul.sharma@example.com"
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Invoice Metadata */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              2. Invoice Details & Terms
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Invoice Summary / Project Title *
                </label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Frontend React UI & Payment Integration"
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="CAD">CAD ($)</option>
                  <option value="AUD">AUD ($)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Issue Date
                </label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Due Date *
                </label>
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Line Items */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                3. Line Items
              </h3>
              <button
                type="button"
                onClick={addItem}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200/70">
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="Item description or service..."
                      value={item.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      className="w-full p-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div className="w-20">
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                      className="w-full p-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-center"
                    />
                  </div>
                  <div className="w-28">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Price"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)}
                      className="w-full p-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-right font-mono"
                    />
                  </div>
                  <div className="w-24 text-right text-xs font-semibold font-mono text-slate-800">
                    {formatMoney(Math.round(item.quantity * item.unitPrice * 100) / 100, currency)}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    disabled={items.length <= 1}
                    className="p-1 text-slate-400 hover:text-red-500 disabled:opacity-30"
                    title="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Total calculation panel */}
            <div className="flex justify-end pt-2">
              <div className="w-64 bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-mono font-medium">{formatMoney(subtotal, currency)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 text-sm border-t border-slate-200 pt-1.5">
                  <span>Total Amount:</span>
                  <span className="font-mono text-blue-600">{formatMoney(totalAmount, currency)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Notes */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="block text-xs font-medium text-slate-700">
              Payment Terms & Client Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleSave('DRAFT')}
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Save as Draft
              </button>
              <button
                type="button"
                onClick={() => handleSave('SENT')}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-xs disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Save & Issue Invoice</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
