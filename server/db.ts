import pg from 'pg';
import crypto from 'crypto';
import { parseMonetaryAmount, parseQuantity } from './money.js';

// Ensure node-postgres deserializes NUMERIC/DECIMAL columns into JavaScript numbers
pg.types.setTypeParser(1700, (val: string) => (val === null ? null : parseFloat(val)));

const { Pool } = pg;

export interface CustomerRecord {
  id: string;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItemRecord {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
}

export interface PaymentRecord {
  id: string;
  invoice_id: string;
  paypal_order_id?: string | null;
  paypal_capture_id?: string | null;
  amount: number;
  currency: string;
  status: 'COMPLETED' | 'PENDING' | 'FAILED' | 'REFUNDED';
  verified_at: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceRecord {
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
  status: 'DRAFT' | 'CREATED' | 'SENT' | 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'FAILED';
  paypal_invoice_id?: string | null;
  paypal_order_id?: string | null;
  payment_url?: string | null;
  created_at: string;
  updated_at: string;
  customer?: CustomerRecord;
  items?: InvoiceItemRecord[];
  payments?: PaymentRecord[];
}

export interface ActivityLogRecord {
  id: string;
  invoice_id?: string | null;
  event_type: string;
  description: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// In-Memory fallback store when DATABASE_URL is not set
interface MemoryStore {
  customers: Map<string, CustomerRecord>;
  invoices: Map<string, InvoiceRecord>;
  invoice_items: Map<string, InvoiceItemRecord>;
  payments: Map<string, PaymentRecord>;
  activity_logs: ActivityLogRecord[];
}

const memoryStore: MemoryStore = {
  customers: new Map(),
  invoices: new Map(),
  invoice_items: new Map(),
  payments: new Map(),
  activity_logs: []
};

// Seed demo data into memory store
function seedMemoryStore() {
  const c1Id = 'c1000000-0000-0000-0000-000000000001';
  const c2Id = 'c1000000-0000-0000-0000-000000000002';
  const c3Id = 'c1000000-0000-0000-0000-000000000003';

  memoryStore.customers.set(c1Id, {
    id: c1Id,
    name: 'Rahul Sharma',
    email: 'rahul.sharma@example.com',
    created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 14 * 86400000).toISOString(),
  });

  memoryStore.customers.set(c2Id, {
    id: c2Id,
    name: 'Acme Software Labs',
    email: 'billing@acmelabs.io',
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  });

  memoryStore.customers.set(c3Id, {
    id: c3Id,
    name: 'Elena Rostova',
    email: 'elena.rostova@designworks.co',
    created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 45 * 86400000).toISOString(),
  });

  // Invoice 1: Overdue
  const inv1Id = 'i1000000-0000-0000-0000-000000000001';
  memoryStore.invoices.set(inv1Id, {
    id: inv1Id,
    invoice_number: 'INV-2026-001',
    customer_id: c1Id,
    description: 'Frontend React UI & Dashboard Development',
    currency: 'USD',
    subtotal: 1250.00,
    total_amount: 1250.00,
    issue_date: '2026-09-15',
    due_date: '2026-09-30',
    notes: 'Net 15 terms. Wire transfer or PayPal accepted.',
    status: 'OVERDUE',
    created_at: '2026-09-15T10:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  });
  memoryStore.invoice_items.set('item-1', {
    id: 'item-1',
    invoice_id: inv1Id,
    description: 'Component architecture and state management',
    quantity: 25,
    unit_price: 50.00,
    line_total: 1250.00,
    created_at: '2026-09-15T10:00:00Z',
  });

  // Invoice 2: Paid
  const inv2Id = 'i1000000-0000-0000-0000-000000000002';
  memoryStore.invoices.set(inv2Id, {
    id: inv2Id,
    invoice_number: 'INV-2026-002',
    customer_id: c2Id,
    description: 'Cloud Infrastructure Audit & Security Optimization',
    currency: 'USD',
    subtotal: 2400.00,
    total_amount: 2400.00,
    issue_date: '2026-10-01',
    due_date: '2026-10-15',
    notes: 'PayPal Sandbox Verified Payment',
    status: 'PAID',
    paypal_order_id: '8XX92019AA120934B',
    created_at: '2026-10-01T14:30:00Z',
    updated_at: '2026-10-12T16:20:00Z',
  });
  memoryStore.invoice_items.set('item-2', {
    id: 'item-2',
    invoice_id: inv2Id,
    description: 'Security & Database Architecture Audit',
    quantity: 1,
    unit_price: 2400.00,
    line_total: 2400.00,
    created_at: '2026-10-01T14:30:00Z',
  });
  memoryStore.payments.set('pay-1', {
    id: 'pay-1',
    invoice_id: inv2Id,
    paypal_order_id: '8XX92019AA120934B',
    paypal_capture_id: 'CAP-9988220011',
    amount: 2400.00,
    currency: 'USD',
    status: 'COMPLETED',
    verified_at: '2026-10-12T16:20:00Z',
    created_at: '2026-10-12T16:20:00Z',
    updated_at: '2026-10-12T16:20:00Z',
  });

  // Invoice 3: Sent / Pending
  const inv3Id = 'i1000000-0000-0000-0000-000000000003';
  memoryStore.invoices.set(inv3Id, {
    id: inv3Id,
    invoice_number: 'INV-2026-003',
    customer_id: c3Id,
    description: 'Design System Guidelines & Iconography',
    currency: 'USD',
    subtotal: 750.00,
    total_amount: 750.00,
    issue_date: '2026-10-10',
    due_date: '2026-10-24',
    notes: 'Thank you for your business.',
    status: 'SENT',
    created_at: '2026-10-10T09:15:00Z',
    updated_at: '2026-10-10T09:15:00Z',
  });
  memoryStore.invoice_items.set('item-3', {
    id: 'item-3',
    invoice_id: inv3Id,
    description: 'Design Tokens & Component Library',
    quantity: 1,
    unit_price: 750.00,
    line_total: 750.00,
    created_at: '2026-10-10T09:15:00Z',
  });

  // Activity logs
  memoryStore.activity_logs.push(
    {
      id: crypto.randomUUID(),
      invoice_id: inv2Id,
      event_type: 'PAYMENT_VERIFIED',
      description: 'PayPal Sandbox verified capture of $2,400.00 for INV-2026-002',
      metadata: { orderId: '8XX92019AA120934B', captureId: 'CAP-9988220011', amount: 2400.00 },
      created_at: '2026-10-12T16:20:00Z',
    },
    {
      id: crypto.randomUUID(),
      invoice_id: inv3Id,
      event_type: 'INVOICE_SENT',
      description: 'Invoice INV-2026-003 sent to Elena Rostova (elena.rostova@designworks.co)',
      metadata: { total: 750.00 },
      created_at: '2026-10-10T09:15:00Z',
    },
    {
      id: crypto.randomUUID(),
      invoice_id: inv1Id,
      event_type: 'STATUS_CHANGED',
      description: 'Invoice INV-2026-001 flagged as OVERDUE (past due date 2026-09-30)',
      metadata: { previousStatus: 'SENT', newStatus: 'OVERDUE' },
      created_at: '2026-10-01T00:00:00Z',
    }
  );
}

// Initialize memory seed once
seedMemoryStore();

// PostgreSQL connection pool
let pool: pg.Pool | null = null;
let isPostgresConnected = false;
let dbInitAttempted = false;
let dbLastError: string | null = null;

const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL;

export async function initDatabase(): Promise<boolean> {
  if (dbInitAttempted && isPostgresConnected) return true;
  dbInitAttempted = true;

  if (!dbUrl) {
    dbLastError = 'DATABASE_URL environment variable is not defined.';
    console.log('[PayPilot DB] No DATABASE_URL provided. Operating in in-memory mode with initial demo records.');
    return false;
  }

  try {
    pool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });

    const client = await pool.connect();
    try {
      // Create tables if not exist
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

        CREATE TABLE IF NOT EXISTS customers (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS invoices (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            invoice_number VARCHAR(50) NOT NULL UNIQUE,
            customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
            description TEXT NOT NULL,
            currency VARCHAR(10) NOT NULL DEFAULT 'USD',
            subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
            total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
            issue_date DATE NOT NULL,
            due_date DATE NOT NULL,
            notes TEXT,
            status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
            paypal_invoice_id VARCHAR(100) UNIQUE,
            paypal_order_id VARCHAR(100) UNIQUE,
            payment_url TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS invoice_items (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
            description TEXT NOT NULL,
            quantity NUMERIC(10, 2) NOT NULL DEFAULT 1.00,
            unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
            line_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS payments (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
            paypal_order_id VARCHAR(100),
            paypal_capture_id VARCHAR(100) UNIQUE,
            amount NUMERIC(12, 2) NOT NULL,
            currency VARCHAR(10) NOT NULL DEFAULT 'USD',
            status VARCHAR(30) NOT NULL DEFAULT 'COMPLETED',
            verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS activity_logs (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
            event_type VARCHAR(50) NOT NULL,
            description TEXT NOT NULL,
            metadata JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
        CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
        CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
        CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);
        CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
      `);

      // Check if customers table is empty, if so, seed initial records
      const { rows } = await client.query('SELECT count(*) FROM customers');
      if (parseInt(rows[0].count, 10) === 0) {
        console.log('[PayPilot DB] Seeding initial customer and invoice records into Supabase PostgreSQL...');
        const custRes = await client.query(`
          INSERT INTO customers (name, email)
          VALUES 
            ('Rahul Sharma', 'rahul.sharma@example.com'),
            ('Acme Software Labs', 'billing@acmelabs.io'),
            ('Elena Rostova', 'elena.rostova@designworks.co')
          RETURNING id, name;
        `);
        const cMap = new Map(custRes.rows.map((r: { id: string; name: string }) => [r.name, r.id]));

        const rahulId = cMap.get('Rahul Sharma');
        const acmeId = cMap.get('Acme Software Labs');
        const elenaId = cMap.get('Elena Rostova');

        if (rahulId && acmeId && elenaId) {
          const inv1 = await client.query(`
            INSERT INTO invoices (invoice_number, customer_id, description, currency, subtotal, total_amount, issue_date, due_date, status, notes)
            VALUES ('INV-2026-001', $1, 'Frontend React UI & Dashboard Development', 'USD', 1250.00, 1250.00, '2026-09-15', '2026-09-30', 'OVERDUE', 'Net 15 terms.')
            RETURNING id;
          `, [rahulId]);
          await client.query(`
            INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, line_total)
            VALUES ($1, 'Component architecture and state management', 25, 50.00, 1250.00);
          `, [inv1.rows[0].id]);

          const inv2 = await client.query(`
            INSERT INTO invoices (invoice_number, customer_id, description, currency, subtotal, total_amount, issue_date, due_date, status, paypal_order_id, notes)
            VALUES ('INV-2026-002', $1, 'Cloud Infrastructure Audit & Security Optimization', 'USD', 2400.00, 2400.00, '2026-10-01', '2026-10-15', 'PAID', '8XX92019AA120934B', 'PayPal Sandbox Verified')
            RETURNING id;
          `, [acmeId]);
          await client.query(`
            INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, line_total)
            VALUES ($1, 'Security & Database Architecture Audit', 1, 2400.00, 2400.00);
          `, [inv2.rows[0].id]);
          await client.query(`
            INSERT INTO payments (invoice_id, paypal_order_id, paypal_capture_id, amount, currency, status, verified_at)
            VALUES ($1, '8XX92019AA120934B', 'CAP-9988220011', 2400.00, 'USD', 'COMPLETED', NOW());
          `, [inv2.rows[0].id]);

          const inv3 = await client.query(`
            INSERT INTO invoices (invoice_number, customer_id, description, currency, subtotal, total_amount, issue_date, due_date, status, notes)
            VALUES ('INV-2026-003', $1, 'Design System Guidelines & Iconography', 'USD', 750.00, 750.00, '2026-10-10', '2026-10-24', 'SENT', 'Thank you for your business.')
            RETURNING id;
          `, [elenaId]);
          await client.query(`
            INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, line_total)
            VALUES ($1, 'Design Tokens & Component Library', 1, 750.00, 750.00);
          `, [inv3.rows[0].id]);

          await client.query(`
            INSERT INTO activity_logs (invoice_id, event_type, description, metadata)
            VALUES 
              ($1, 'PAYMENT_VERIFIED', 'PayPal Sandbox verified capture of $2,400.00 for INV-2026-002', '{"orderId":"8XX92019AA120934B"}'::jsonb),
              ($2, 'INVOICE_SENT', 'Invoice INV-2026-003 sent to Elena Rostova', '{"total":750.00}'::jsonb);
          `, [inv2.rows[0].id, inv3.rows[0].id]);
        }
      }

      isPostgresConnected = true;
      dbLastError = null;
      console.log('[PayPilot DB] Connected successfully to Supabase PostgreSQL and migrations applied.');
      return true;
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    dbLastError = errorMsg;
    isPostgresConnected = false;
    console.error('[PayPilot DB] Failed to connect to PostgreSQL:', errorMsg);
    console.log('[PayPilot DB] Falling back to in-memory store for session.');
    return false;
  }
}

// Automatically start connection check asynchronously on import
initDatabase().catch(err => {
  console.warn('[PayPilot DB] Initial connection check warning:', err);
});

export async function checkDbHealth() {
  const configured = Boolean(dbUrl);
  return {
    configured,
    connected: isPostgresConnected,
    engine: isPostgresConnected ? 'supabase_postgres' : 'in_memory_demo',
    error: dbLastError,
    connectionStringConfigured: configured,
  };
}

// Statistics calculation: Total Invoiced, Verified Received, Outstanding Balance, Overdue Count
export async function getDashboardStats() {
  if (isPostgresConnected && pool) {
    const client = await pool.connect();
    try {
      // Overdue status refresh: update past due invoices from CREATED/SENT to OVERDUE
      await client.query(`
        UPDATE invoices 
        SET status = 'OVERDUE' 
        WHERE due_date < CURRENT_DATE 
          AND status IN ('CREATED', 'SENT', 'PENDING');
      `);

      // Invoiced total: ONLY issued/sent/paid/overdue/pending invoices (excludes DRAFT and CANCELLED)
      const invoicedRes = await client.query(`
        SELECT COALESCE(SUM(total_amount), 0) as total_invoiced,
               COUNT(*) FILTER (WHERE status = 'OVERDUE') as overdue_count
        FROM invoices
        WHERE status NOT IN ('DRAFT', 'CANCELLED', 'FAILED');
      `);

      // Verified payments total: from payments table with status COMPLETED
      const paymentsRes = await client.query(`
        SELECT COALESCE(SUM(amount), 0) as total_received
        FROM payments
        WHERE status = 'COMPLETED';
      `);

      const totalInvoiced = parseMonetaryAmount(invoicedRes.rows[0].total_invoiced ?? 0, 'dashboard.totalInvoiced');
      const totalReceived = parseMonetaryAmount(paymentsRes.rows[0].total_received ?? 0, 'dashboard.totalReceived');
      const overdueCount = parseInt(String(invoicedRes.rows[0].overdue_count || 0), 10);
      const outstandingBalance = Math.round(Math.max(0, totalInvoiced - totalReceived) * 100) / 100;

      return {
        totalInvoiced,
        totalReceived,
        outstandingBalance,
        overdueCount,
      };
    } finally {
      client.release();
    }
  }

  // Memory fallback
  const today = new Date().toISOString().split('T')[0];
  let totalInvoiced = 0;
  let overdueCount = 0;

  for (const inv of memoryStore.invoices.values()) {
    if (inv.status === 'CREATED' || inv.status === 'SENT' || inv.status === 'PENDING') {
      if (inv.due_date < today) {
        inv.status = 'OVERDUE';
      }
    }
    if (inv.status !== 'DRAFT' && inv.status !== 'CANCELLED' && inv.status !== 'FAILED') {
      totalInvoiced += parseMonetaryAmount(inv.total_amount, 'inv.total_amount');
    }
    if (inv.status === 'OVERDUE') {
      overdueCount++;
    }
  }

  let totalReceived = 0;
  for (const pay of memoryStore.payments.values()) {
    if (pay.status === 'COMPLETED') {
      totalReceived += parseMonetaryAmount(pay.amount, 'pay.amount');
    }
  }

  const roundedInvoiced = parseMonetaryAmount(totalInvoiced, 'dashboard.totalInvoiced');
  const roundedReceived = parseMonetaryAmount(totalReceived, 'dashboard.totalReceived');
  const outstandingBalance = Math.round(Math.max(0, roundedInvoiced - roundedReceived) * 100) / 100;
  return {
    totalInvoiced: roundedInvoiced,
    totalReceived: roundedReceived,
    outstandingBalance,
    overdueCount,
  };
}

// Invoices CRUD & queries
export async function getInvoices(filters?: { status?: string; search?: string; customerId?: string; limit?: number; offset?: number }) {
  if (isPostgresConnected && pool) {
    const client = await pool.connect();
    try {
      const conditions: string[] = [];
      const values: (string | number)[] = [];
      let idx = 1;

      if (filters?.status && filters.status !== 'ALL') {
        conditions.push(`i.status = $${idx++}`);
        values.push(filters.status);
      }
      if (filters?.customerId) {
        const custId = filters.customerId.trim();
        const isCustUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(custId);
        if (isCustUuid) {
          conditions.push(`i.customer_id = $${idx++}::uuid`);
          values.push(custId);
        } else {
          conditions.push(`i.customer_id::text = $${idx++}`);
          values.push(custId);
        }
      }
      if (filters?.search) {
        conditions.push(`(i.invoice_number ILIKE $${idx} OR c.name ILIKE $${idx} OR c.email ILIKE $${idx} OR i.description ILIKE $${idx})`);
        values.push(`%${filters.search}%`);
        idx++;
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = filters?.limit || 50;
      const offset = filters?.offset || 0;

      const query = `
        SELECT 
          i.*,
          json_build_object('id', c.id, 'name', c.name, 'email', c.email) as customer,
          COALESCE(
            (SELECT json_agg(items.*) FROM invoice_items items WHERE items.invoice_id = i.id),
            '[]'::json
          ) as items,
          COALESCE(
            (SELECT json_agg(p.*) FROM payments p WHERE p.invoice_id = i.id),
            '[]'::json
          ) as payments
        FROM invoices i
        JOIN customers c ON i.customer_id = c.id
        ${whereClause}
        ORDER BY i.created_at DESC
        LIMIT $${idx++} OFFSET $${idx++};
      `;
      values.push(limit, offset);

      const res = await client.query(query, values);
      return res.rows.map(formatInvoiceRow);
    } finally {
      client.release();
    }
  }

  // Memory fallback
  let list = Array.from(memoryStore.invoices.values()).map(inv => {
    const customer = memoryStore.customers.get(inv.customer_id);
    const items = Array.from(memoryStore.invoice_items.values()).filter(it => it.invoice_id === inv.id);
    const payments = Array.from(memoryStore.payments.values()).filter(p => p.invoice_id === inv.id);
    return {
      ...inv,
      customer,
      items,
      payments,
    };
  });

  if (filters?.status && filters.status !== 'ALL') {
    list = list.filter(i => i.status === filters.status);
  }
  if (filters?.customerId) {
    list = list.filter(i => i.customer_id === filters.customerId);
  }
  if (filters?.search) {
    const s = filters.search.toLowerCase();
    list = list.filter(i =>
      i.invoice_number.toLowerCase().includes(s) ||
      i.description.toLowerCase().includes(s) ||
      (i.customer?.name && i.customer.name.toLowerCase().includes(s)) ||
      (i.customer?.email && i.customer.email.toLowerCase().includes(s))
    );
  }

  list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const offset = filters?.offset || 0;
  const limit = filters?.limit || 50;
  return list.slice(offset, offset + limit);
}

export async function getInvoiceById(id: string): Promise<InvoiceRecord | null> {
  if (isPostgresConnected && pool) {
    const client = await pool.connect();
    try {
      const trimmed = id.trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
      const whereCondition = isUuid
        ? `(i.id = $1::uuid OR i.invoice_number = $1::text)`
        : `i.invoice_number = $1::varchar`;

      const query = `
        SELECT 
          i.*,
          json_build_object('id', c.id, 'name', c.name, 'email', c.email) as customer,
          COALESCE(
            (SELECT json_agg(items.*) FROM invoice_items items WHERE items.invoice_id = i.id),
            '[]'::json
          ) as items,
          COALESCE(
            (SELECT json_agg(p.*) FROM payments p WHERE p.invoice_id = i.id),
            '[]'::json
          ) as payments
        FROM invoices i
        JOIN customers c ON i.customer_id = c.id
        WHERE ${whereCondition}
        LIMIT 1;
      `;
      const res = await client.query(query, [trimmed]);
      if (res.rows.length === 0) return null;
      return formatInvoiceRow(res.rows[0]);
    } finally {
      client.release();
    }
  }

  const trimmed = id.trim();
  const inv = Array.from(memoryStore.invoices.values()).find(i => i.id === trimmed || i.invoice_number === trimmed);
  if (!inv) return null;
  const customer = memoryStore.customers.get(inv.customer_id);
  const items = Array.from(memoryStore.invoice_items.values()).filter(it => it.invoice_id === inv.id);
  const payments = Array.from(memoryStore.payments.values()).filter(p => p.invoice_id === inv.id);
  return {
    ...inv,
    customer,
    items,
    payments,
  };
}

export async function createInvoice(data: {
  invoiceNumber?: string;
  customerId: string;
  description: string;
  currency?: string;
  issueDate: string;
  dueDate: string;
  notes?: string;
  status?: InvoiceRecord['status'];
  items: Array<{ description: string; quantity: number; unitPrice: number }>;
}): Promise<InvoiceRecord> {
  const currency = data.currency || 'USD';
  const status = data.status || 'DRAFT';
  let subtotal = 0;
  const computedItems = data.items.map(item => {
    const qty = Number(item.quantity) || 1;
    const price = Number(item.unitPrice) || 0;
    const lineTotal = Math.round(qty * price * 100) / 100;
    subtotal += lineTotal;
    return {
      id: crypto.randomUUID(),
      description: item.description,
      quantity: qty,
      unit_price: price,
      line_total: lineTotal,
    };
  });
  const totalAmount = Math.round(subtotal * 100) / 100;
  const invoiceNumber = data.invoiceNumber || await generateNextInvoiceNumber();

  if (isPostgresConnected && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const invRes = await client.query(`
        INSERT INTO invoices (
          invoice_number, customer_id, description, currency, subtotal, total_amount, issue_date, due_date, notes, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *;
      `, [invoiceNumber, data.customerId, data.description, currency, subtotal, totalAmount, data.issueDate, data.dueDate, data.notes || null, status]);

      const newInv = invRes.rows[0];

      for (const item of computedItems) {
        await client.query(`
          INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, line_total)
          VALUES ($1, $2, $3, $4, $5);
        `, [newInv.id, item.description, item.quantity, item.unit_price, item.line_total]);
      }

      await client.query(`
        INSERT INTO activity_logs (invoice_id, event_type, description, metadata)
        VALUES ($1, 'INVOICE_CREATED', $2, $3);
      `, [
        newInv.id,
        `Created ${status === 'DRAFT' ? 'draft' : 'invoice'} ${invoiceNumber} for ${currency} ${totalAmount.toFixed(2)}`,
        JSON.stringify({ status, totalAmount, currency })
      ]);

      await client.query('COMMIT');
      return (await getInvoiceById(newInv.id))!;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // Memory fallback
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const newInvoice: InvoiceRecord = {
    id,
    invoice_number: invoiceNumber,
    customer_id: data.customerId,
    description: data.description,
    currency,
    subtotal,
    total_amount: totalAmount,
    issue_date: data.issueDate,
    due_date: data.dueDate,
    notes: data.notes || null,
    status,
    created_at: now,
    updated_at: now,
  };
  memoryStore.invoices.set(id, newInvoice);

  for (const item of computedItems) {
    memoryStore.invoice_items.set(item.id, {
      ...item,
      invoice_id: id,
      created_at: now,
    });
  }

  await logActivity(
    'INVOICE_CREATED',
    `Created ${status === 'DRAFT' ? 'draft' : 'invoice'} ${invoiceNumber} for ${currency} ${totalAmount.toFixed(2)}`,
    id,
    { status, totalAmount, currency }
  );

  return (await getInvoiceById(id))!;
}

export async function updateInvoice(id: string, updates: Partial<{
  description: string;
  notes: string | null;
  status: InvoiceRecord['status'];
  dueDate: string;
  issueDate: string;
  paymentUrl: string | null;
  paypalOrderId: string | null;
  paypalInvoiceId: string | null;
  items: Array<{ description: string; quantity: number; unitPrice: number }>;
}>): Promise<InvoiceRecord> {
  const existing = await getInvoiceById(id);
  if (!existing) throw new Error(`Invoice not found: ${id}`);

  // Prevent silent modification of amount/customer on issued/paid invoice
  if (existing.status === 'PAID' && updates.items) {
    throw new Error('Cannot modify line items on an already paid invoice.');
  }

  if (isPostgresConnected && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let subtotal = existing.subtotal;
      let totalAmount = existing.total_amount;

      if (updates.items) {
        await client.query('DELETE FROM invoice_items WHERE invoice_id = $1;', [existing.id]);
        subtotal = 0;
        for (const it of updates.items) {
          const qty = Number(it.quantity) || 1;
          const price = Number(it.unitPrice) || 0;
          const lineTotal = Math.round(qty * price * 100) / 100;
          subtotal += lineTotal;
          await client.query(`
            INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, line_total)
            VALUES ($1, $2, $3, $4, $5);
          `, [existing.id, it.description, qty, price, lineTotal]);
        }
        totalAmount = Math.round(subtotal * 100) / 100;
      }

      const updateFields: string[] = ['updated_at = NOW()'];
      const vals: (string | number | null)[] = [];
      let idx = 1;

      if (updates.description !== undefined) {
        updateFields.push(`description = $${idx++}`);
        vals.push(updates.description);
      }
      if (updates.notes !== undefined) {
        updateFields.push(`notes = $${idx++}`);
        vals.push(updates.notes);
      }
      if (updates.status !== undefined) {
        updateFields.push(`status = $${idx++}`);
        vals.push(updates.status);
      }
      if (updates.dueDate !== undefined) {
        updateFields.push(`due_date = $${idx++}`);
        vals.push(updates.dueDate);
      }
      if (updates.issueDate !== undefined) {
        updateFields.push(`issue_date = $${idx++}`);
        vals.push(updates.issueDate);
      }
      if (updates.paymentUrl !== undefined) {
        updateFields.push(`payment_url = $${idx++}`);
        vals.push(updates.paymentUrl);
      }
      if (updates.paypalOrderId !== undefined) {
        updateFields.push(`paypal_order_id = $${idx++}`);
        vals.push(updates.paypalOrderId);
      }
      if (updates.paypalInvoiceId !== undefined) {
        updateFields.push(`paypal_invoice_id = $${idx++}`);
        vals.push(updates.paypalInvoiceId);
      }
      if (updates.items) {
        updateFields.push(`subtotal = $${idx++}`, `total_amount = $${idx++}`);
        vals.push(subtotal, totalAmount);
      }

      vals.push(existing.id);
      await client.query(`
        UPDATE invoices
        SET ${updateFields.join(', ')}
        WHERE id = $${idx}::uuid;
      `, vals);

      await client.query('COMMIT');
      return (await getInvoiceById(existing.id))!;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // Memory fallback
  const now = new Date().toISOString();
  if (updates.items) {
    // Delete old items
    for (const [k, it] of memoryStore.invoice_items.entries()) {
      if (it.invoice_id === existing.id) {
        memoryStore.invoice_items.delete(k);
      }
    }
    let subtotal = 0;
    for (const it of updates.items) {
      const qty = Number(it.quantity) || 1;
      const price = Number(it.unitPrice) || 0;
      const lineTotal = Math.round(qty * price * 100) / 100;
      subtotal += lineTotal;
      const itId = crypto.randomUUID();
      memoryStore.invoice_items.set(itId, {
        id: itId,
        invoice_id: existing.id,
        description: it.description,
        quantity: qty,
        unit_price: price,
        line_total: lineTotal,
        created_at: now,
      });
    }
    existing.subtotal = subtotal;
    existing.total_amount = Math.round(subtotal * 100) / 100;
  }

  if (updates.description !== undefined) existing.description = updates.description;
  if (updates.notes !== undefined) existing.notes = updates.notes;
  if (updates.status !== undefined) existing.status = updates.status;
  if (updates.dueDate !== undefined) existing.due_date = updates.dueDate;
  if (updates.issueDate !== undefined) existing.issue_date = updates.issueDate;
  if (updates.paymentUrl !== undefined) existing.payment_url = updates.paymentUrl;
  if (updates.paypalOrderId !== undefined) existing.paypal_order_id = updates.paypalOrderId;
  if (updates.paypalInvoiceId !== undefined) existing.paypal_invoice_id = updates.paypalInvoiceId;
  existing.updated_at = now;

  memoryStore.invoices.set(existing.id, existing);
  return (await getInvoiceById(existing.id))!;
}

// Customers CRUD
export async function getCustomers(search?: string) {
  if (isPostgresConnected && pool) {
    const client = await pool.connect();
    try {
      const values: string[] = [];
      let whereClause = '';
      if (search) {
        whereClause = ` WHERE c.name ILIKE $1 OR c.email ILIKE $1`;
        values.push(`%${search}%`);
      }

      const query = `
        SELECT 
          c.*,
          COALESCE(inv_agg.invoice_count, 0)::int as invoice_count,
          COALESCE(inv_agg.total_invoiced, 0)::numeric as total_invoiced,
          COALESCE(pay_agg.total_paid, 0)::numeric as total_paid
        FROM customers c
        LEFT JOIN (
          SELECT 
            customer_id,
            COUNT(id) as invoice_count,
            SUM(total_amount) FILTER (WHERE status NOT IN ('DRAFT', 'CANCELLED', 'FAILED')) as total_invoiced
          FROM invoices
          GROUP BY customer_id
        ) inv_agg ON inv_agg.customer_id = c.id
        LEFT JOIN (
          SELECT 
            i.customer_id,
            SUM(p.amount) as total_paid
          FROM payments p
          JOIN invoices i ON i.id = p.invoice_id
          WHERE p.status = 'COMPLETED'
          GROUP BY i.customer_id
        ) pay_agg ON pay_agg.customer_id = c.id
        ${whereClause}
        ORDER BY c.created_at DESC;
      `;

      const res = await client.query(query, values);
      return res.rows.map(r => {
        const invoiced = parseMonetaryAmount(r.total_invoiced ?? 0, 'customer.total_invoiced');
        const paid = parseMonetaryAmount(r.total_paid ?? 0, 'customer.total_paid');
        return {
          id: r.id,
          name: r.name,
          email: r.email,
          created_at: r.created_at,
          updated_at: r.updated_at,
          invoice_count: Number(r.invoice_count || 0),
          total_invoiced: invoiced,
          total_paid: paid,
          outstanding: Math.round(Math.max(0, invoiced - paid) * 100) / 100,
        };
      });
    } finally {
      client.release();
    }
  }

  // Memory fallback
  const list = Array.from(memoryStore.customers.values()).map(c => {
    const customerInvoices = Array.from(memoryStore.invoices.values()).filter(i => i.customer_id === c.id);
    let totalInvoiced = 0;
    let totalPaid = 0;

    for (const inv of customerInvoices) {
      if (inv.status !== 'DRAFT' && inv.status !== 'CANCELLED') {
        totalInvoiced += parseMonetaryAmount(inv.total_amount, 'inv.total_amount');
      }
      const invPayments = Array.from(memoryStore.payments.values()).filter(p => p.invoice_id === inv.id);
      for (const p of invPayments) {
        if (p.status === 'COMPLETED') totalPaid += parseMonetaryAmount(p.amount, 'pay.amount');
      }
    }

    const roundedInvoiced = parseMonetaryAmount(totalInvoiced, 'customer.total_invoiced');
    const roundedPaid = parseMonetaryAmount(totalPaid, 'customer.total_paid');
    return {
      ...c,
      invoice_count: customerInvoices.length,
      total_invoiced: roundedInvoiced,
      total_paid: roundedPaid,
      outstanding: Math.round(Math.max(0, roundedInvoiced - roundedPaid) * 100) / 100,
    };
  });

  if (search) {
    const s = search.toLowerCase();
    return list.filter(c => c.name.toLowerCase().includes(s) || c.email.toLowerCase().includes(s));
  }
  return list;
}

export async function getCustomerById(id: string) {
  if (isPostgresConnected && pool) {
    const client = await pool.connect();
    try {
      const trimmed = id.trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
      const query = `
        SELECT 
          c.*,
          COALESCE(inv_agg.invoice_count, 0)::int as invoice_count,
          COALESCE(inv_agg.total_invoiced, 0)::numeric as total_invoiced,
          COALESCE(pay_agg.total_paid, 0)::numeric as total_paid
        FROM customers c
        LEFT JOIN (
          SELECT 
            customer_id,
            COUNT(id) as invoice_count,
            SUM(total_amount) FILTER (WHERE status NOT IN ('DRAFT', 'CANCELLED', 'FAILED')) as total_invoiced
          FROM invoices
          GROUP BY customer_id
        ) inv_agg ON inv_agg.customer_id = c.id
        LEFT JOIN (
          SELECT 
            i.customer_id,
            SUM(p.amount) as total_paid
          FROM payments p
          JOIN invoices i ON i.id = p.invoice_id
          WHERE p.status = 'COMPLETED'
          GROUP BY i.customer_id
        ) pay_agg ON pay_agg.customer_id = c.id
        WHERE ${isUuid ? 'c.id = $1::uuid' : 'c.id::text = $1'}
        LIMIT 1;
      `;
      const res = await client.query(query, [trimmed]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      const invoiced = parseMonetaryAmount(r.total_invoiced ?? 0, 'customer.total_invoiced');
      const paid = parseMonetaryAmount(r.total_paid ?? 0, 'customer.total_paid');
      return {
        id: r.id,
        name: r.name,
        email: r.email,
        created_at: r.created_at,
        updated_at: r.updated_at,
        invoice_count: Number(r.invoice_count || 0),
        total_invoiced: invoiced,
        total_paid: paid,
        outstanding: Math.round(Math.max(0, invoiced - paid) * 100) / 100,
      };
    } finally {
      client.release();
    }
  }

  const customers = await getCustomers();
  return customers.find(c => c.id === id) || null;
}

export async function findOrCreateCustomer(name: string, email: string): Promise<CustomerRecord> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim();

  if (isPostgresConnected && pool) {
    const client = await pool.connect();
    try {
      const existing = await client.query('SELECT * FROM customers WHERE LOWER(email) = $1 LIMIT 1;', [cleanEmail]);
      if (existing.rows.length > 0) {
        return existing.rows[0];
      }

      const res = await client.query(`
        INSERT INTO customers (name, email)
        VALUES ($1, $2)
        RETURNING *;
      `, [cleanName, cleanEmail]);

      return res.rows[0];
    } finally {
      client.release();
    }
  }

  for (const c of memoryStore.customers.values()) {
    if (c.email.toLowerCase() === cleanEmail) {
      return c;
    }
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const newCust: CustomerRecord = {
    id,
    name: cleanName,
    email: cleanEmail,
    created_at: now,
    updated_at: now,
  };
  memoryStore.customers.set(id, newCust);
  return newCust;
}

// Payment Recording
export async function recordPayment(data: {
  invoiceId: string;
  paypalOrderId?: string | null;
  paypalCaptureId?: string | null;
  amount: number;
  currency: string;
  status: 'COMPLETED' | 'PENDING' | 'FAILED' | 'REFUNDED';
}): Promise<PaymentRecord> {
  const verifiedAt = new Date().toISOString();

  let targetInvoiceId = data.invoiceId.trim();
  const isInvoiceUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetInvoiceId);
  if (!isInvoiceUuid) {
    const inv = await getInvoiceById(targetInvoiceId);
    if (inv) {
      targetInvoiceId = inv.id;
    }
  }

  const validAmount = parseMonetaryAmount(data.amount, 'recordPayment.amount');

  if (isPostgresConnected && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check for duplicate capture id or order id to guarantee idempotency
      if (data.paypalCaptureId || data.paypalOrderId) {
        const existingCapture = await client.query(
          `SELECT * FROM payments 
           WHERE ($1::text IS NOT NULL AND paypal_capture_id = $1)
              OR ($2::text IS NOT NULL AND paypal_order_id = $2)
           LIMIT 1;`,
          [data.paypalCaptureId || null, data.paypalOrderId || null]
        );
        if (existingCapture.rows.length > 0) {
          if (data.status === 'COMPLETED') {
            await client.query(`
              UPDATE invoices 
              SET status = 'PAID', updated_at = NOW() 
              WHERE id = $1::uuid;
            `, [targetInvoiceId]);
          }
          await client.query('COMMIT');
          return formatPaymentRow(existingCapture.rows[0]);
        }
      }

      const payRes = await client.query(`
        INSERT INTO payments (
          invoice_id, paypal_order_id, paypal_capture_id, amount, currency, status, verified_at
        )
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `, [
        targetInvoiceId,
        data.paypalOrderId || null,
        data.paypalCaptureId || null,
        validAmount,
        data.currency.toUpperCase().trim(),
        data.status,
        verifiedAt,
      ]);

      if (data.status === 'COMPLETED') {
        await client.query(`
          UPDATE invoices 
          SET status = 'PAID', updated_at = NOW() 
          WHERE id = $1::uuid;
        `, [targetInvoiceId]);
      }

      await client.query('COMMIT');
      return formatPaymentRow(payRes.rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // Memory fallback
  if (data.paypalCaptureId || data.paypalOrderId) {
    for (const p of memoryStore.payments.values()) {
      if (
        (data.paypalCaptureId && p.paypal_capture_id === data.paypalCaptureId) ||
        (data.paypalOrderId && p.paypal_order_id === data.paypalOrderId)
      ) {
        if (data.status === 'COMPLETED') {
          const inv = memoryStore.invoices.get(targetInvoiceId);
          if (inv) {
            inv.status = 'PAID';
            inv.updated_at = verifiedAt;
          }
        }
        return formatPaymentRow(p as unknown as Record<string, unknown>);
      }
    }
  }

  const id = crypto.randomUUID();
  const payment: PaymentRecord = {
    id,
    invoice_id: targetInvoiceId,
    paypal_order_id: data.paypalOrderId || null,
    paypal_capture_id: data.paypalCaptureId || null,
    amount: validAmount,
    currency: data.currency.toUpperCase().trim(),
    status: data.status,
    verified_at: verifiedAt,
    created_at: verifiedAt,
    updated_at: verifiedAt,
  };
  memoryStore.payments.set(id, payment);

  if (data.status === 'COMPLETED') {
    const inv = memoryStore.invoices.get(targetInvoiceId);
    if (inv) {
      inv.status = 'PAID';
      inv.updated_at = verifiedAt;
    }
  }

  return formatPaymentRow(payment as unknown as Record<string, unknown>);
}

// Activity Logging
export async function logActivity(
  eventType: string,
  description: string,
  invoiceId?: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  const safeMeta = metadata || {};

  let validInvoiceUuid: string | null = null;
  if (invoiceId) {
    const trimmed = invoiceId.trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      validInvoiceUuid = trimmed;
    } else {
      const inv = await getInvoiceById(trimmed);
      if (inv) {
        validInvoiceUuid = inv.id;
      }
    }
  }

  if (isPostgresConnected && pool) {
    try {
      await pool.query(`
        INSERT INTO activity_logs (invoice_id, event_type, description, metadata)
        VALUES ($1::uuid, $2, $3, $4);
      `, [validInvoiceUuid, eventType, description, JSON.stringify(safeMeta)]);
      return;
    } catch (e) {
      console.error('[PayPilot DB] Failed to persist activity log to postgres:', e);
    }
  }

  memoryStore.activity_logs.unshift({
    id: crypto.randomUUID(),
    invoice_id: validInvoiceUuid || invoiceId || null,
    event_type: eventType,
    description,
    metadata: safeMeta,
    created_at: new Date().toISOString(),
  });

  if (memoryStore.activity_logs.length > 200) {
    memoryStore.activity_logs.pop();
  }
}

export async function getActivityLogs(limit = 50, invoiceId?: string): Promise<ActivityLogRecord[]> {
  if (isPostgresConnected && pool) {
    const client = await pool.connect();
    try {
      let query = `SELECT * FROM activity_logs`;
      const values: (string | number)[] = [];
      if (invoiceId) {
        const trimmed = invoiceId.trim();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
        if (isUuid) {
          query += ` WHERE invoice_id = $1::uuid`;
          values.push(trimmed);
        } else {
          query += ` WHERE invoice_id IN (SELECT id FROM invoices WHERE invoice_number = $1)`;
          values.push(trimmed);
        }
      }
      query += ` ORDER BY created_at DESC LIMIT $${values.length + 1};`;
      values.push(limit);

      const res = await client.query(query, values);
      return res.rows;
    } finally {
      client.release();
    }
  }

  let list = memoryStore.activity_logs;
  if (invoiceId) {
    const trimmed = invoiceId.trim();
    list = list.filter(l => l.invoice_id === trimmed);
  }
  return list.slice(0, limit);
}

async function generateNextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear().toString();
  if (isPostgresConnected && pool) {
    const client = await pool.connect();
    try {
      const res = await client.query(`
        SELECT COALESCE(MAX(SUBSTRING(invoice_number FROM '^INV-[0-9]+-([0-9]+)$')::int), 0) + 1 AS next_seq
        FROM invoices
        WHERE invoice_number LIKE 'INV-' || $1 || '-%';
      `, [year]);
      const nextSeq = parseInt(res.rows[0]?.next_seq || '1', 10);
      const seq = String(nextSeq).padStart(3, '0');
      return `INV-${year}-${seq}`;
    } finally {
      client.release();
    }
  }

  let maxSeq = 0;
  const prefix = `INV-${year}-`;
  for (const inv of memoryStore.invoices.values()) {
    if (inv.invoice_number.startsWith(prefix)) {
      const numPart = parseInt(inv.invoice_number.slice(prefix.length), 10);
      if (!isNaN(numPart) && numPart > maxSeq) {
        maxSeq = numPart;
      }
    }
  }
  const seq = String(maxSeq + 1).padStart(3, '0');
  return `INV-${year}-${seq}`;
}

export function formatPaymentRow(row: Record<string, unknown>): PaymentRecord {
  if (!row) {
    throw new TypeError('Payment row data is missing');
  }
  return {
    id: String(row.id),
    invoice_id: String(row.invoice_id),
    paypal_order_id: row.paypal_order_id ? String(row.paypal_order_id) : null,
    paypal_capture_id: row.paypal_capture_id ? String(row.paypal_capture_id) : null,
    amount: parseMonetaryAmount(row.amount, 'payment.amount'),
    currency: String(row.currency || 'USD').toUpperCase().trim(),
    status: (row.status as PaymentRecord['status']) || 'COMPLETED',
    verified_at: typeof row.verified_at === 'string' ? row.verified_at : (row.verified_at as Date)?.toISOString?.() || '',
    created_at: typeof row.created_at === 'string' ? row.created_at : (row.created_at as Date)?.toISOString?.() || '',
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : (row.updated_at as Date)?.toISOString?.() || '',
  };
}

export function formatInvoiceRow(row: Record<string, unknown>): InvoiceRecord {
  const items = Array.isArray(row.items) ? row.items : [];
  const payments = Array.isArray(row.payments) ? row.payments : [];

  return {
    id: String(row.id),
    invoice_number: String(row.invoice_number),
    customer_id: String(row.customer_id),
    description: String(row.description),
    currency: String(row.currency || 'USD').toUpperCase().trim(),
    subtotal: parseMonetaryAmount(row.subtotal, 'invoice.subtotal'),
    total_amount: parseMonetaryAmount(row.total_amount, 'invoice.total_amount'),
    issue_date: typeof row.issue_date === 'string' ? row.issue_date.split('T')[0] : (row.issue_date as Date)?.toISOString?.().split('T')[0] || String(row.issue_date),
    due_date: typeof row.due_date === 'string' ? row.due_date.split('T')[0] : (row.due_date as Date)?.toISOString?.().split('T')[0] || String(row.due_date),
    notes: row.notes ? String(row.notes) : null,
    status: row.status as InvoiceRecord['status'],
    paypal_invoice_id: row.paypal_invoice_id ? String(row.paypal_invoice_id) : null,
    paypal_order_id: row.paypal_order_id ? String(row.paypal_order_id) : null,
    payment_url: row.payment_url ? String(row.payment_url) : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : (row.created_at as Date)?.toISOString?.() || String(row.created_at),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : (row.updated_at as Date)?.toISOString?.() || String(row.updated_at),
    customer: row.customer as CustomerRecord | undefined,
    items: items.map((it: Record<string, unknown>) => {
      const qty = parseQuantity(it.quantity, 'item.quantity');
      const unitPrice = parseMonetaryAmount(it.unit_price, 'item.unit_price');
      const lineTotal = it.line_total !== undefined && it.line_total !== null
        ? parseMonetaryAmount(it.line_total, 'item.line_total')
        : Math.round(qty * unitPrice * 100) / 100;
      return {
        id: String(it.id || ''),
        invoice_id: String(it.invoice_id || row.id),
        description: String(it.description || ''),
        quantity: qty,
        unit_price: unitPrice,
        line_total: lineTotal,
        created_at: typeof it.created_at === 'string' ? it.created_at : (it.created_at as Date)?.toISOString?.() || '',
      };
    }),
    payments: payments.map((p: Record<string, unknown>) => formatPaymentRow(p)),
  };
}
