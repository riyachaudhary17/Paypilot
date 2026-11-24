import {
  Invoice,
  Customer,
  DashboardStats,
  ActivityLog,
  IntegrationStatus,
  AIDraftResponse,
} from './types';

const API_BASE = '/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errorBody.error || errorBody.message || `Request failed with status ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Stats
  getStats: () => request<DashboardStats>('/dashboard/stats'),

  // Invoices
  getInvoices: (params?: { status?: string; search?: string; customerId?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.customerId) query.set('customerId', params.customerId);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const qs = query.toString();
    return request<Invoice[]>(`/invoices${qs ? `?${qs}` : ''}`);
  },

  getInvoice: (id: string) => request<Invoice>(`/invoices/${encodeURIComponent(id)}`),

  createInvoice: (data: {
    customerName: string;
    customerEmail: string;
    description: string;
    currency: string;
    issueDate: string;
    dueDate: string;
    notes?: string;
    status?: string;
    items: Array<{ description: string; quantity: number; unitPrice: number }>;
  }) => request<Invoice>('/invoices', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  updateInvoice: (id: string, updates: Record<string, unknown>) => request<Invoice>(`/invoices/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  }),

  // PayPal
  createPayPalLink: (id: string, flow: 'order' | 'invoicing' = 'order') => request<{
    success: boolean;
    invoice: Invoice;
    paymentUrl: string;
    paypalOrderId?: string;
    paypalInvoiceId?: string;
    notice?: string;
    fallback?: boolean;
  }>(`/invoices/${encodeURIComponent(id)}/paypal`, {
    method: 'POST',
    body: JSON.stringify({ flow }),
  }),

  verifyPayment: (id: string) => request<{
    verified: boolean;
    status: string;
    message?: string;
    actionRequired?: boolean;
    actionUrl?: string;
    payment?: unknown;
    invoice?: Invoice;
  }>(`/invoices/${encodeURIComponent(id)}/verify-payment`, {
    method: 'POST',
  }),

  captureOrder: (id: string) => request<{
    success: boolean;
    payment?: unknown;
    invoice?: Invoice;
  }>(`/invoices/${encodeURIComponent(id)}/capture-order`, {
    method: 'POST',
  }),

  // Customers
  getCustomers: (search?: string) => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    return request<Customer[]>(`/customers${qs}`);
  },

  getCustomer: (id: string) => request<Customer>(`/customers/${encodeURIComponent(id)}`),

  createCustomer: (data: { name: string; email: string }) => request<Customer>('/customers', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Gemini AI
  generateAIDraft: (prompt: string) => request<AIDraftResponse>('/ai/invoice-draft', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  }),

  chatWithAssistant: (message: string, history: Array<{ role: 'user' | 'model'; parts: [{ text: string }] }> = []) => request<{ reply: string }>('/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history }),
  }),

  generateReminder: (invoiceId: string, tone: 'polite' | 'firm' | 'final_notice') => request<{ subject: string; message: string }>('/ai/reminder', {
    method: 'POST',
    body: JSON.stringify({ invoiceId, tone }),
  }),

  // Activity
  getActivity: (limit = 50, invoiceId?: string) => {
    const query = new URLSearchParams();
    query.set('limit', String(limit));
    if (invoiceId) query.set('invoiceId', invoiceId);
    return request<ActivityLog[]>(`/activity?${query.toString()}`);
  },

  // Health & Integrations
  getIntegrationStatus: () => request<IntegrationStatus>('/integrations/status'),
  testDbConnection: () => request<{ success: boolean; connected: boolean; engine: string; error?: string }>('/integrations/test-db', {
    method: 'POST',
  }),
};
