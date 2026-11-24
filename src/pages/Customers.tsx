import React, { useEffect, useState } from 'react';
import {
  Users,
  Search,
  Plus,
  ArrowRight,
  Mail,
  FileText,
  DollarSign,
  CheckCircle,
  Clock,
  X,
  RefreshCw,
} from 'lucide-react';
import { api } from '../api';
import { Customer, Invoice } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { formatMoney } from '../utils/money';

interface CustomersProps {
  onSelectInvoice: (id: string) => void;
  onNavigateCreateInvoiceForCustomer?: (customer: Customer) => void;
}

export const Customers: React.FC<CustomersProps> = ({
  onSelectInvoice,
  onNavigateCreateInvoiceForCustomer,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // New customer modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchCustomers = async () => {
    try {
      const data = await api.getCustomers(search.trim() || undefined);
      setCustomers(data);
      if (selectedCustomer) {
        const refreshed = data.find(c => c.id === selectedCustomer.id);
        if (refreshed) {
          const detail = await api.getCustomer(refreshed.id);
          setSelectedCustomer(detail);
        }
      }
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [search]);

  const handleSelectCustomer = async (cust: Customer) => {
    try {
      const fullDetail = await api.getCustomer(cust.id);
      setSelectedCustomer(fullDetail);
    } catch (err) {
      console.error('Failed to load customer detail:', err);
      setSelectedCustomer(cust);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!newName.trim() || !newEmail.trim() || !newEmail.includes('@')) {
      setModalError('Please enter a valid customer name and email.');
      return;
    }

    setAddingCustomer(true);
    try {
      const created = await api.createCustomer({
        name: newName.trim(),
        email: newEmail.trim(),
      });
      setShowAddModal(false);
      setNewName('');
      setNewEmail('');
      await fetchCustomers();
      handleSelectCustomer(created);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setModalError(msg);
    } finally {
      setAddingCustomer(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Customers</h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Client directories, billing history, and payment compliance
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search customers by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      </div>

      {/* 2-Column Split: Customer List (Left) & Customer Detail / Invoices (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Customer Directory List */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 font-bold text-slate-800 text-xs uppercase tracking-wider">
            Client Directory ({customers.length})
          </div>

          <div className="divide-y divide-slate-100 overflow-y-auto max-h-[600px]">
            {loading ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                Loading customers...
              </div>
            ) : customers.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No customers found. Click "Add Customer" to start.
              </div>
            ) : (
              customers.map((c) => {
                const isSelected = selectedCustomer?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelectCustomer(c)}
                    className={`p-4 cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50/70 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-slate-900 text-xs sm:text-sm">
                          {c.name}
                        </h4>
                        <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3 text-slate-400" />
                          {c.email}
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {c.invoice_count || 0} {c.invoice_count === 1 ? 'invoice' : 'invoices'}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] pt-2 border-t border-slate-100/80">
                      <div>
                        <span className="text-slate-400 block">Total Invoiced</span>
                        <span className="font-semibold text-slate-800">{formatMoney(c.total_invoiced)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 block">Outstanding</span>
                        <span className={`font-semibold ${c.outstanding && c.outstanding > 0 ? 'text-amber-700' : 'text-slate-600'}`}>
                          {formatMoney(c.outstanding)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Customer Detail & Invoice History */}
        <div className="lg:col-span-2">
          {selectedCustomer ? (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-6 space-y-6">
              {/* Customer Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{selectedCustomer.name}</h3>
                  <p className="text-xs text-slate-500">{selectedCustomer.email}</p>
                </div>

                {onNavigateCreateInvoiceForCustomer && (
                  <button
                    onClick={() => onNavigateCreateInvoiceForCustomer(selectedCustomer)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Invoice for Customer</span>
                  </button>
                )}
              </div>

              {/* Financial Metrics Row */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/70 text-xs">
                  <span className="text-slate-500 block font-medium">Total Invoiced</span>
                  <span className="text-base font-bold text-slate-900 mt-1 block">
                    {formatMoney(selectedCustomer.total_invoiced)}
                  </span>
                </div>
                <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200/70 text-xs">
                  <span className="text-emerald-700 block font-medium">Verified Paid</span>
                  <span className="text-base font-bold text-emerald-800 mt-1 block">
                    {formatMoney(selectedCustomer.total_paid)}
                  </span>
                </div>
                <div className="bg-purple-50/70 p-3.5 rounded-xl border border-purple-200/70 text-xs">
                  <span className="text-purple-700 block font-medium">Current Balance Due</span>
                  <span className="text-base font-bold text-purple-900 mt-1 block">
                    {formatMoney(selectedCustomer.outstanding)}
                  </span>
                </div>
              </div>

              {/* Invoice History */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Associated Invoices
                </h4>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-y border-slate-100">
                      <tr>
                        <th className="py-2.5 px-3">Invoice #</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3">Due Date</th>
                        <th className="py-2.5 px-3">Amount</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">View</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedCustomer.invoices && selectedCustomer.invoices.length > 0 ? (
                        selectedCustomer.invoices.map((inv) => (
                          <tr
                            key={inv.id}
                            onClick={() => onSelectInvoice(inv.id)}
                            className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                          >
                            <td className="py-3 px-3 font-mono font-medium text-slate-900">
                              {inv.invoice_number}
                            </td>
                            <td className="py-3 px-3 max-w-xs truncate text-slate-700">
                              {inv.description}
                            </td>
                            <td className="py-3 px-3 text-slate-500">
                              {inv.due_date}
                            </td>
                            <td className="py-3 px-3 font-bold text-slate-900">
                              {formatMoney(inv.total_amount)}
                            </td>
                            <td className="py-3 px-3">
                              <StatusBadge status={inv.status} />
                            </td>
                            <td className="py-3 px-3 text-right">
                              <span className="text-blue-600 font-semibold inline-flex items-center gap-1">
                                <ArrowRight className="w-3 h-3" />
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-slate-400">
                            No invoices recorded for this customer yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-12 text-center text-slate-400">
              <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="font-semibold text-slate-700 text-sm">Select a customer</p>
              <p className="text-xs text-slate-400 mt-1">
                Choose a customer on the left to view their detailed invoice records and payment breakdown.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Add New Customer</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="bg-red-50 text-red-700 p-3 rounded-lg text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateCustomer} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Customer / Business Name *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Acme Corporation"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Billing Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="e.g. billing@acme.com"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingCustomer}
                  className="px-4 py-2 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-xs disabled:opacity-50"
                >
                  {addingCustomer ? 'Adding...' : 'Create Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
