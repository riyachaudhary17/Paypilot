import React, { useEffect, useState } from 'react';
import {
  Settings,
  Database,
  CreditCard,
  Sparkles,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Key,
  Copy,
  Check,
} from 'lucide-react';
import { api } from '../api';
import { IntegrationStatus } from '../types';

interface SettingsProps {
  integrationStatus: IntegrationStatus | null;
  onRefreshStatus: () => void;
}

export const SettingsPage: React.FC<SettingsProps> = ({
  integrationStatus,
  onRefreshStatus,
}) => {
  const [testingDb, setTestingDb] = useState(false);
  const [dbTestResult, setDbTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleTestDb = async () => {
    setTestingDb(true);
    setDbTestResult(null);
    try {
      const res = await api.testDbConnection();
      if (res.connected) {
        setDbTestResult({
          success: true,
          message: 'Successfully established connection with Supabase PostgreSQL and applied database schemas.',
        });
      } else {
        setDbTestResult({
          success: false,
          message: res.error || 'DATABASE_URL is not configured or connection failed. Using in-memory fallback.',
        });
      }
      onRefreshStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDbTestResult({
        success: false,
        message: `Database check error: ${msg}`,
      });
    } finally {
      setTestingDb(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const db = integrationStatus?.database;
  const paypal = integrationStatus?.paypal;
  const gemini = integrationStatus?.gemini;

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Settings & Integration Status
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Verify connectivity, environment configurations, and security status for PayPilot services
          </p>
        </div>

        <button
          onClick={onRefreshStatus}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Status</span>
        </button>
      </div>

      {/* 3 Core Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 1. Supabase PostgreSQL */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Database className="w-4 h-4" />
              </div>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                  db?.connected
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                {db?.connected ? 'PostgreSQL Active' : 'Demo Fallback'}
              </span>
            </div>

            <div>
              <h3 className="font-bold text-slate-900 text-sm">Supabase PostgreSQL</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Primary persistent store for invoices, items, customers, and payments.
              </p>
            </div>

            <div className="text-xs space-y-1.5 pt-2 border-t border-slate-100 text-slate-600">
              <div className="flex justify-between">
                <span className="text-slate-400">Status:</span>
                <span className="font-medium">
                  {db?.connected ? 'Connected to Cloud DB' : 'Using Demo In-Memory'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Secret:</span>
                <span className="font-mono text-slate-700">DATABASE_URL</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 mt-4">
            <button
              onClick={handleTestDb}
              disabled={testingDb}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingDb ? 'animate-spin' : ''}`} />
              <span>Test DB Connection</span>
            </button>
          </div>
        </div>

        {/* 2. PayPal Sandbox REST APIs */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <CreditCard className="w-4 h-4" />
              </div>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                  paypal?.configured
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                {paypal?.configured ? 'Sandbox Configured' : 'Credentials Needed'}
              </span>
            </div>

            <div>
              <h3 className="font-bold text-slate-900 text-sm">PayPal Sandbox</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Authentic PayPal Orders API checkout & Invoicing v2 with server verification.
              </p>
            </div>

            <div className="text-xs space-y-1.5 pt-2 border-t border-slate-100 text-slate-600">
              <div className="flex justify-between">
                <span className="text-slate-400">Environment:</span>
                <span className="font-semibold text-blue-600">Sandbox</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Client ID:</span>
                <span className="font-medium">{paypal?.clientIdSet ? 'Set in Secrets' : 'Missing'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Client Secret:</span>
                <span className="font-medium">{paypal?.clientSecretSet ? 'Set in Secrets' : 'Missing'}</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 mt-4">
            <a
              href="https://developer.paypal.com/dashboard/applications/sandbox"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors border border-blue-200"
            >
              <span>PayPal Dev Portal</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* 3. Google Gemini API */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                  gemini?.configured
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                {gemini?.configured ? 'Gemini Active' : 'Key Pending'}
              </span>
            </div>

            <div>
              <h3 className="font-bold text-slate-900 text-sm">Google Gemini AI</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Server-side extraction, grounded financial assistant, and smart payment reminders.
              </p>
            </div>

            <div className="text-xs space-y-1.5 pt-2 border-t border-slate-100 text-slate-600">
              <div className="flex justify-between">
                <span className="text-slate-400">Model:</span>
                <span className="font-mono font-medium text-slate-800">gemini-3.8-flash</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Execution:</span>
                <span className="text-emerald-700 font-semibold">Server-Side Only</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 mt-4">
            <div className="text-[11px] text-slate-500 text-center">
              Auto-injected via AI Studio Secrets
            </div>
          </div>
        </div>
      </div>

      {dbTestResult && (
        <div
          className={`p-4 rounded-xl text-xs flex items-start gap-2 border ${
            dbTestResult.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          {dbTestResult.success ? (
            <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          )}
          <span>{dbTestResult.message}</span>
        </div>
      )}

      {/* Setup & Instructions Guide */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-6 space-y-6">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Developer Setup & Credentials Reference
          </h3>
          <p className="text-xs text-slate-500">
            How to configure your live PostgreSQL and PayPal Sandbox credentials in AI Studio
          </p>
        </div>

        {/* Supabase Guide */}
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-emerald-600" />
            1. Supabase PostgreSQL Configuration
          </h4>
          <ol className="text-xs text-slate-600 space-y-1.5 list-decimal pl-4">
            <li>Create a project on <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">supabase.com</a>.</li>
            <li>Go to <strong>Project Settings &gt; Database</strong> and copy your <strong>Connection string (URI)</strong>.</li>
            <li>In AI Studio, open <strong>Settings &gt; Secrets</strong> and add:
              <div className="mt-1 flex items-center gap-2 bg-slate-50 p-2 rounded-md font-mono text-slate-800">
                <span>DATABASE_URL = "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"</span>
                <button
                  onClick={() => copyToClipboard('DATABASE_URL', 'db')}
                  className="p-1 hover:text-blue-600"
                  title="Copy variable name"
                >
                  {copiedKey === 'db' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </li>
            <li>PayPilot automatically executes <code className="bg-slate-100 px-1 py-0.5 rounded">schema.sql</code> table migrations on connection!</li>
          </ol>
        </div>

        {/* PayPal Guide */}
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-blue-600" />
            2. PayPal Developer Sandbox Configuration
          </h4>
          <ol className="text-xs text-slate-600 space-y-1.5 list-decimal pl-4">
            <li>Log into the <a href="https://developer.paypal.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">PayPal Developer Dashboard</a>.</li>
            <li>Navigate to <strong>Apps &amp; Credentials</strong> and ensure <strong>Sandbox</strong> toggle is active.</li>
            <li>Click <strong>Create App</strong>, choose <strong>Merchant</strong>, and obtain your <strong>Client ID</strong> and <strong>Secret</strong>.</li>
            <li>In AI Studio, open <strong>Settings &gt; Secrets</strong> and add:
              <div className="mt-1 space-y-1">
                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-md font-mono text-slate-800">
                  <span>PAYPAL_CLIENT_ID = "your_sandbox_client_id"</span>
                </div>
                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-md font-mono text-slate-800">
                  <span>PAYPAL_CLIENT_SECRET = "your_sandbox_client_secret"</span>
                </div>
              </div>
            </li>
            <li>For end-to-end testing, use the auto-generated Sandbox Personal Buyer Account created under <strong>Testing Tools &gt; Sandbox Accounts</strong>. Always keep your Personal buyer account distinct from your Business seller account.</li>
            <li className="text-[11px] text-slate-500 pt-1">
              <strong>Avoiding Currency Rejection in Sandbox:</strong> If checkout warns <em>"This seller doesn't accept payments in your currency"</em>, your Sandbox Business Account may have payment blocks enabled. Log into <a href="https://www.sandbox.paypal.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">sandbox.paypal.com</a> with your Business seller credentials, go to <strong>Account Settings &gt; Payment Preferences &gt; Block Payments</strong>, and set <em>"Allow payments sent to me in a currency I do not hold"</em> to <strong>Yes, accept and convert to primary currency</strong>. You can also explicitly specify a specific Business Sandbox seller email in AI Studio Secrets via <code>PAYPAL_MERCHANT_EMAIL</code>.
            </li>
            <li className="text-[11px] text-slate-500 pt-1">
              <strong>Orders API &amp; Invoicing:</strong> PayPal Orders API Checkout is active by default for all REST sandbox apps. To also use PayPal Invoicing v2 directly, enable <em>Invoicing</em> in your app settings in the PayPal Developer Dashboard. If Invoicing permissions are not enabled, PayPilot automatically creates a PayPal Orders API checkout link so customer payments proceed seamlessly.
            </li>
          </ol>
        </div>

        {/* Security Declaration */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs space-y-1 text-slate-600">
          <div className="flex items-center gap-1.5 font-bold text-slate-800">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>Strict Security Architecture:</span>
          </div>
          <p>
            All Gemini API keys, PayPal secrets, and PostgreSQL connection credentials reside exclusively on the server side. No private API keys or database URLs are ever bundled or transmitted to the client browser.
          </p>
        </div>
      </div>
    </div>
  );
};
