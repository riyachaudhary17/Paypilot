import React, { useState, useEffect } from 'react';
import { Sidebar, NavTab } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './pages/Dashboard';
import { Invoices } from './pages/Invoices';
import { CreateInvoice } from './pages/CreateInvoice';
import { InvoiceDetails } from './pages/InvoiceDetails';
import { Customers } from './pages/Customers';
import { AIAssistant } from './pages/AIAssistant';
import { Activity } from './pages/Activity';
import { SettingsPage } from './pages/Settings';
import { api } from './api';
import { IntegrationStatus, Invoice, Customer } from './types';

export default function App() {
  const getInitialInvoiceId = (): string | null => {
    if (typeof window === 'undefined') return null;
    const match = window.location.pathname.match(/^\/invoices\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  };

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(getInitialInvoiceId);
  const [currentTab, setCurrentTab] = useState<NavTab>(() => (getInitialInvoiceId() ? 'invoices' : 'dashboard'));
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  const [createInvoiceInitialPrompt, setCreateInvoiceInitialPrompt] = useState<string | undefined>(undefined);

  const loadIntegrationStatus = async () => {
    try {
      const status = await api.getIntegrationStatus();
      setIntegrationStatus(status);
    } catch (err) {
      console.warn('Could not fetch integration status:', err);
    }
  };

  useEffect(() => {
    loadIntegrationStatus();
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const id = getInitialInvoiceId();
      if (id) {
        setSelectedInvoiceId(id);
        setCurrentTab('invoices');
      } else {
        setSelectedInvoiceId(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Navigation handlers
  const handleSelectInvoice = (id: string) => {
    setSelectedInvoiceId(id);
    if (window.location.pathname !== `/invoices/${id}`) {
      window.history.pushState(null, '', `/invoices/${id}`);
    }
  };

  const handleBackToInvoices = () => {
    setSelectedInvoiceId(null);
    setCurrentTab('invoices');
    if (window.location.pathname !== '/') {
      window.history.pushState(null, '', '/');
    }
  };

  const handleNavigateCreate = (prefillPrompt?: string) => {
    setSelectedInvoiceId(null);
    setCreateInvoiceInitialPrompt(prefillPrompt);
    setCurrentTab('create-invoice');
    if (window.location.pathname !== '/') {
      window.history.pushState(null, '', '/');
    }
  };

  const handleInvoiceCreated = (newInv: Invoice) => {
    setSelectedInvoiceId(newInv.id);
    window.history.pushState(null, '', `/invoices/${newInv.id}`);
  };

  const handleNavigateAI = (prefillPrompt?: string) => {
    if (prefillPrompt) {
      handleNavigateCreate(prefillPrompt);
    } else {
      setSelectedInvoiceId(null);
      setCurrentTab('ai-assistant');
      if (window.location.pathname !== '/') {
        window.history.pushState(null, '', '/');
      }
    }
  };

  const handleNavigateCreateForCustomer = (customer: Customer) => {
    handleNavigateCreate(`Create an invoice for ${customer.name} (${customer.email}) for 500 US dollars for consulting services, due in 14 days.`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Persistent Sidebar (desktop) & Drawer (mobile) */}
      <Sidebar
        currentTab={selectedInvoiceId ? 'invoices' : currentTab}
        onSelectTab={(tab) => {
          setSelectedInvoiceId(null);
          setCreateInvoiceInitialPrompt(undefined);
          setCurrentTab(tab);
        }}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        integrationStatus={integrationStatus}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          currentTab={currentTab}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onNavigateCreate={() => handleNavigateCreate()}
          onNavigateAI={() => handleNavigateAI()}
          integrationStatus={integrationStatus}
        />

        <main className="flex-1 overflow-y-auto pb-12">
          {/* If an invoice detail is active, render it */}
          {selectedInvoiceId ? (
            <InvoiceDetails
              invoiceId={selectedInvoiceId}
              onBack={handleBackToInvoices}
              integrationStatus={integrationStatus}
            />
          ) : (
            <>
              {currentTab === 'dashboard' && (
                <Dashboard
                  onSelectInvoice={handleSelectInvoice}
                  onNavigateCreate={() => handleNavigateCreate()}
                  onNavigateAI={handleNavigateAI}
                  onNavigateSettings={() => setCurrentTab('settings')}
                  integrationStatus={integrationStatus}
                />
              )}

              {currentTab === 'invoices' && (
                <Invoices
                  onSelectInvoice={handleSelectInvoice}
                  onNavigateCreate={() => handleNavigateCreate()}
                  onEditDraft={(inv) => handleSelectInvoice(inv.id)}
                />
              )}

              {currentTab === 'create-invoice' && (
                <CreateInvoice
                  initialPrompt={createInvoiceInitialPrompt}
                  onInvoiceCreated={handleInvoiceCreated}
                  onCancel={() => setCurrentTab('invoices')}
                />
              )}

              {currentTab === 'customers' && (
                <Customers
                  onSelectInvoice={handleSelectInvoice}
                  onNavigateCreateInvoiceForCustomer={handleNavigateCreateForCustomer}
                />
              )}

              {currentTab === 'ai-assistant' && (
                <AIAssistant
                  onSelectInvoice={handleSelectInvoice}
                  integrationStatus={integrationStatus}
                />
              )}

              {currentTab === 'activity' && (
                <Activity onSelectInvoice={handleSelectInvoice} />
              )}

              {currentTab === 'settings' && (
                <SettingsPage
                  integrationStatus={integrationStatus}
                  onRefreshStatus={loadIntegrationStatus}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
