export type InvoiceStatus = 'DRAFT' | 'CREATED' | 'SENT' | 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'FAILED';

export interface Customer {
  id: string;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
  invoice_count?: number;
  total_invoiced?: number;
  total_paid?: number;
  outstanding?: number;
  invoices?: Invoice[];
}

export interface InvoiceItem {
  id?: string;
  invoice_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total?: number;
}

export interface Payment {
  id: string;
  invoice_id: string;
  paypal_order_id?: string | null;
  paypal_capture_id?: string | null;
  amount: number;
  currency: string;
  status: 'COMPLETED' | 'PENDING' | 'FAILED' | 'REFUNDED';
  verified_at: string;
  created_at: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  description: string;
  currency: string;
  subtotal: number;
  total_amount: number;
  issue_date: string;
  due_date: string;
  notes?: string | null;
  status: InvoiceStatus;
  paypal_invoice_id?: string | null;
  paypal_order_id?: string | null;
  payment_url?: string | null;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  items?: InvoiceItem[];
  payments?: Payment[];
}

export interface DashboardStats {
  totalInvoiced: number;
  totalReceived: number;
  outstandingBalance: number;
  overdueCount: number;
}

export interface ActivityLog {
  id: string;
  invoice_id?: string | null;
  event_type: string;
  description: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface IntegrationStatus {
  database: {
    provider: string;
    configured: boolean;
    connected: boolean;
    engine: 'supabase_postgres' | 'in_memory_demo';
    error?: string | null;
    instructions: string;
  };
  paypal: {
    provider: string;
    configured: boolean;
    environment: string;
    baseUrl: string;
    clientIdSet: boolean;
    clientSecretSet: boolean;
    instructions: string;
  };
  gemini: {
    provider: string;
    configured: boolean;
    available?: boolean;
    model: string;
    error?: string | null;
    instructions: string;
  };
}

export interface AIDraftResponse {
  customer_name: string;
  customer_email?: string | null;
  description: string;
  currency: string;
  issue_date: string;
  due_date: string;
  notes?: string | null;
  items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
  }>;
  clarification_needed?: boolean;
  clarification_prompt?: string | null;
}
