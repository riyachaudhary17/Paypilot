import React from 'react';
import { Menu, Plus, Sparkles, Shield, AlertCircle } from 'lucide-react';
import { NavTab } from './Sidebar';
import { IntegrationStatus } from '../types';

interface HeaderProps {
  currentTab: NavTab;
  onOpenMobileMenu: () => void;
  onNavigateCreate: () => void;
  onNavigateAI: () => void;
  integrationStatus?: IntegrationStatus | null;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onOpenMobileMenu,
  onNavigateCreate,
  onNavigateAI,
  integrationStatus,
}) => {
  const titles: Record<NavTab, { title: string; subtitle: string }> = {
    dashboard: {
      title: 'Financial Overview',
      subtitle: 'Real-time billing analytics, verified PayPal settlements, and cash flow',
    },
    invoices: {
      title: 'Invoices & Billing',
      subtitle: 'Manage client invoices, checkout links, and payment verification',
    },
    'create-invoice': {
      title: 'New Invoice',
      subtitle: 'Create structured invoices via natural-language AI or manual form',
    },
    customers: {
      title: 'Customer Directory',
      subtitle: 'Client payment histories, outstanding balances, and contact records',
    },
    'ai-assistant': {
      title: 'PayPilot AI Financial Assistant',
      subtitle: 'Ask grounded questions about overdue balances, revenue, and clients',
    },
    activity: {
      title: 'Audit & Activity Log',
      subtitle: 'Chronological timeline of invoice updates, PayPal captures, and AI events',
    },
    settings: {
      title: 'Integrations & System Status',
      subtitle: 'Configure Supabase PostgreSQL, PayPal Sandbox, and Gemini API secrets',
    },
  };

  const currentInfo = titles[currentTab] || { title: 'PayPilot', subtitle: '' };
  const paypalConfigured = integrationStatus?.paypal.configured;

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      {/* Left side: Hamburger button + Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100"
          aria-label="Open Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
            {currentInfo.title}
          </h1>
          <p className="hidden sm:block text-xs text-slate-500">
            {currentInfo.subtitle}
          </p>
        </div>
      </div>

      {/* Right side: Environment Pill & Quick Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Sandbox Badge */}
        <div className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
          paypalConfigured 
            ? 'bg-blue-50 text-blue-700 border-blue-200' 
            : 'bg-amber-50 text-amber-800 border-amber-200'
        }`}>
          {paypalConfigured ? (
            <Shield className="w-3.5 h-3.5 text-blue-600" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
          )}
          <span>PayPal Sandbox Mode</span>
        </div>

        {/* AI Quick Button */}
        <button
          onClick={onNavigateAI}
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors border border-slate-200"
          title="Open AI Financial Assistant"
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>Ask AI</span>
        </button>

        {/* Primary Action: Create Invoice */}
        {currentTab !== 'create-invoice' && (
          <button
            onClick={onNavigateCreate}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Create Invoice</span>
          </button>
        )}
      </div>
    </header>
  );
};
