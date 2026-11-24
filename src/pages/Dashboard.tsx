import React, { useEffect, useState } from 'react';
import {
  DollarSign,
  CheckCircle,
  Clock,
  AlertCircle,
  Plus,
  Sparkles,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  CreditCard,
  Building,
} from 'lucide-react';
import { api } from '../api';
import { DashboardStats, Invoice, ActivityLog, IntegrationStatus } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { formatMoney } from '../utils/money';

interface DashboardProps {
  onSelectInvoice: (id: string) => void;
  onNavigateCreate: () => void;
  onNavigateAI: (prefillPrompt?: string) => void;
  onNavigateSettings: () => void;
  integrationStatus?: IntegrationStatus | null;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onSelectInvoice,
  onNavigateCreate,
  onNavigateAI,
  onNavigateSettings,
  integrationStatus,
}) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [s, invs, acts] = await Promise.all([
        api.getStats(),
        api.getInvoices({ limit: 5 }),
        api.getActivity(5),
      ]);
      setStats(s);
      setRecentInvoices(invs);
      setRecentActivity(acts);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const paypalConfigured = integrationStatus?.paypal.configured;
  const dbConnected = integrationStatus?.database.connected;

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Configuration Advisory Banner if PayPal or DB needs attention */}
      {(!paypalConfigured || !dbConnected) && (
        <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs sm:text-sm">
              <span className="font-semibold">Setup Advisory: </span>
              {!paypalConfigured && (
                <span>PayPal Sandbox credentials (PAYPAL_CLIENT_ID & PAYPAL_CLIENT_SECRET) are pending. </span>
              )}
              {!dbConnected && (
                <span>Database is using demo session storage until DATABASE_URL is added.</span>
              )}
            </div>
          </div>
          <button
            onClick={onNavigateSettings}
            className="text-xs font-semibold px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shrink-0 w-fit"
          >
            Configure in Settings
          </button>
        </div>
      )}

      {/* Hero / Quick Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Welcome to PayPilot</h2>
          <p className="text-xs sm:text-sm text-slate-500">
            AI-driven invoice extraction, PayPal Sandbox automated checkout, and verified payment tracking.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            title="Refresh metrics"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => onNavigateAI('Create an invoice for Rahul Sharma for 150 US dollars for website development, due seven days from today.')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-xs transition-all"
          >
            <Sparkles className="w-4 h-4" />
            <span>AI Draft Invoice</span>
          </button>
          <button
            onClick={onNavigateCreate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Invoice</span>
          </button>
        </div>
      </div>

      {/* 4 Core Financial Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Invoiced */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Invoiced
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {loading ? '...' : formatMoney(stats?.totalInvoiced)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Active & issued invoices (excl. drafts)
            </p>
          </div>
        </div>

        {/* Verified Received */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">
              Verified Received
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-emerald-700 tracking-tight">
              {loading ? '...' : formatMoney(stats?.totalReceived)}
            </div>
            <p className="text-xs text-emerald-600 mt-1">
              Completed PayPal settlements
            </p>
          </div>
        </div>

        {/* Outstanding Balance */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Outstanding Balance
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {loading ? '...' : formatMoney(stats?.outstandingBalance)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Awaiting client payment
            </p>
          </div>
        </div>

        {/* Overdue Count */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
              Overdue Invoices
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-amber-800 tracking-tight">
              {loading ? '...' : stats?.overdueCount || 0}
            </div>
            <p className="text-xs text-amber-600 mt-1">
              Past specified due dates
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: Recent Invoices (2/3) + Activity Feed (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Invoices Table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 shadow-xs flex flex-col">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">Recent Invoices</h3>
              <p className="text-xs text-slate-500">Latest issued drafts and verified payment records</p>
            </div>
            <button
              onClick={onNavigateCreate}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No invoices found. Click "Create Invoice" to generate one.
                    </td>
                  </tr>
                ) : (
                  recentInvoices.map((inv) => (
                    <tr
                      key={inv.id}
                      onClick={() => onSelectInvoice(inv.id)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-900">
                        {inv.invoice_number}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-700">
                        {inv.customer?.name || 'Customer'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">
                        {inv.due_date}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {formatMoney(inv.total_amount, inv.currency)}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={inv.status} />
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1">
                          Details
                          <ArrowRight className="w-3 h-3" />
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Payment & System Activity */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs flex flex-col">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">Recent Activity</h3>
              <p className="text-xs text-slate-500">Verified payment events & logs</p>
            </div>
            <span className="text-xs font-medium text-slate-400">Live</span>
          </div>

          <div className="p-4 flex-1 space-y-3">
            {recentActivity.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-6">
                No recent activity recorded.
              </div>
            ) : (
              recentActivity.map((log) => (
                <div key={log.id} className="flex gap-3 text-xs border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                  <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                    {log.event_type.includes('PAYMENT') ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    ) : log.event_type.includes('AI') ? (
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    ) : (
                      <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-800 leading-snug">
                      {log.description}
                    </p>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
