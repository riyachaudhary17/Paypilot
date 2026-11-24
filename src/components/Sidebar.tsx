import React from 'react';
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  Users,
  Sparkles,
  History,
  Settings,
  CreditCard,
  ShieldCheck,
  X,
} from 'lucide-react';
import { IntegrationStatus } from '../types';

export type NavTab = 'dashboard' | 'invoices' | 'create-invoice' | 'customers' | 'ai-assistant' | 'activity' | 'settings';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  integrationStatus?: IntegrationStatus | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isOpenMobile,
  onCloseMobile,
  integrationStatus,
}) => {
  const navItems = [
    { id: 'dashboard' as NavTab, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'invoices' as NavTab, label: 'Invoices', icon: FileText },
    { id: 'create-invoice' as NavTab, label: 'Create Invoice', icon: PlusCircle, badge: 'AI' },
    { id: 'customers' as NavTab, label: 'Customers', icon: Users },
    { id: 'ai-assistant' as NavTab, label: 'AI Assistant', icon: Sparkles, highlight: true },
    { id: 'activity' as NavTab, label: 'Activity Log', icon: History },
    { id: 'settings' as NavTab, label: 'Settings & Status', icon: Settings },
  ];

  const dbConnected = integrationStatus?.database.connected;
  const paypalConfigured = integrationStatus?.paypal.configured;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-40 lg:hidden backdrop-blur-xs transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-50 w-64 bg-slate-900 text-slate-100 flex flex-col transition-transform duration-200 ease-in-out ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } border-r border-slate-800`}
      >
        {/* Brand Header */}
        <div className="h-16 px-6 flex items-center justify-between border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/30">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-base tracking-tight text-white flex items-center gap-1.5">
                PayPilot
                <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  AI
                </span>
              </div>
              <div className="text-[11px] text-slate-400">PayPal Invoicing Hub</div>
            </div>
          </div>
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                    {item.badge}
                  </span>
                )}
                {item.highlight && !isActive && (
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                )}
              </button>
            );
          })}
        </nav>

        {/* System & Integration Summary Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/40 text-xs space-y-2">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
            Sandbox & System
          </div>

          <div className="px-2 py-2 rounded-md bg-slate-900/80 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                PayPal Sandbox
              </span>
              <span className={`font-medium ${paypalConfigured ? 'text-emerald-400' : 'text-amber-400'}`}>
                {paypalConfigured ? 'Connected' : 'Setup Required'}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Database Engine</span>
              <span className="font-medium text-slate-300">
                {dbConnected ? 'Supabase PG' : 'Demo Memory'}
              </span>
            </div>
          </div>

          <div className="px-1 text-[11px] text-slate-500 flex items-center justify-between">
            <span>v1.0.0 • Hackathon Edition</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" title="System Operational"></span>
          </div>
        </div>
      </aside>
    </>
  );
};
