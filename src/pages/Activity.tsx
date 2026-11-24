import React, { useEffect, useState } from 'react';
import {
  History,
  CheckCircle,
  Sparkles,
  CreditCard,
  FileText,
  AlertCircle,
  RefreshCw,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { api } from '../api';
import { ActivityLog } from '../types';

interface ActivityProps {
  onSelectInvoice?: (id: string) => void;
}

export const Activity: React.FC<ActivityProps> = ({ onSelectInvoice }) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  const fetchLogs = async () => {
    try {
      const data = await api.getActivity(100);
      setLogs(data);
    } catch (err) {
      console.error('Failed to load activity logs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchLogs();
  };

  const getEventIcon = (eventType: string) => {
    if (eventType.includes('PAYMENT_VERIFIED') || eventType.includes('PAYMENT_CAPTURED')) {
      return <CheckCircle className="w-4 h-4 text-emerald-600" />;
    }
    if (eventType.includes('AI')) {
      return <Sparkles className="w-4 h-4 text-purple-600" />;
    }
    if (eventType.includes('PAYPAL')) {
      return <CreditCard className="w-4 h-4 text-blue-600" />;
    }
    if (eventType.includes('INVOICE')) {
      return <FileText className="w-4 h-4 text-slate-700" />;
    }
    return <Clock className="w-4 h-4 text-slate-400" />;
  };

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Audit & Activity Log</h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Chronological audit trail of all invoices, PayPal Sandbox transactions, and AI events
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
          title="Refresh activity logs"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Main Activity Timeline Container */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs divide-y divide-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
            Loading activity log...
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <History className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            No activity logged yet.
          </div>
        ) : (
          logs.map((log) => {
            const isSelected = selectedLog?.id === log.id;
            return (
              <div
                key={log.id}
                className="p-4 hover:bg-slate-50 transition-colors flex items-start gap-3.5"
              >
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5 border border-slate-200/60">
                  {getEventIcon(log.event_type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="font-bold text-xs uppercase tracking-wider text-slate-600">
                      {log.event_type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-800 font-medium mt-1">
                    {log.description}
                  </p>

                  {/* Metadata pill/button */}
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <div className="mt-2">
                      <button
                        onClick={() => setSelectedLog(isSelected ? null : log)}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                      >
                        {isSelected ? 'Hide metadata' : 'View event metadata'}
                      </button>

                      {isSelected && (
                        <pre className="mt-2 p-2.5 bg-slate-900 text-slate-200 rounded-lg text-[11px] font-mono overflow-x-auto">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>

                {log.invoice_id && onSelectInvoice && (
                  <button
                    onClick={() => onSelectInvoice(log.invoice_id!)}
                    className="p-1.5 text-slate-400 hover:text-blue-600 rounded-md hover:bg-slate-100 shrink-0"
                    title="View related invoice"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
