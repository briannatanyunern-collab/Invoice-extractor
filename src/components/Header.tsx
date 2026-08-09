import React, { useState } from 'react';
import { FileText, Database, ShieldCheck, FileSpreadsheet, FileEdit, Settings, ChevronDown, LogOut } from 'lucide-react';
import { UserAccount } from '../types';

interface HeaderProps {
  activeTab: 'intake' | 'database' | 'manage-ledger';
  setActiveTab: (tab: 'intake' | 'database' | 'manage-ledger') => void;
  savedCount: number;
  googleSheetsConnected: boolean;
  onConnectSheetsClick?: () => void;
  accounts: UserAccount[];
  activeAccountId: string | null;
  onSwitchAccount: (id: string) => void;
  onManageAccounts: () => void;
  onSignOut: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  savedCount,
  googleSheetsConnected,
  onConnectSheetsClick,
  accounts,
  activeAccountId,
  onSwitchAccount,
  onManageAccounts,
  onSignOut
}) => {
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const activeAccount = accounts.find(a => a.id === activeAccountId) || null;

  return (
    <header className="bg-white border-b border-sand-200 shadow-2xs sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Header Bar */}
        <div className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-sand-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sage-600 flex items-center justify-center text-white font-bold text-lg shadow-xs">
              BH
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-charcoal-900 tracking-tight">
                  Boon Huat Invoice Intake
                </h1>
                <span className="bg-sage-100 text-sage-800 text-xs font-semibold px-2.5 py-0.5 rounded-md border border-sage-200">
                  Accounts Payable
                </span>
              </div>
              <p className="text-xs text-charcoal-500 font-medium">
                Hardware SME AI Assistant &bull; Boon Huat Hardware Pte Ltd
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            {/* User Profile Switcher */}
            <div className="relative">
              <button 
                onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                className="flex items-center gap-2 bg-cream-100 px-3 py-1.5 rounded-lg border border-sand-200 hover:bg-sand-100 transition-colors cursor-pointer"
              >
                <div className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center border ${
                  activeAccount ? 'bg-sand-200 text-charcoal-900 border-sand-300' : 'bg-amber-100 text-amber-800 border-amber-300'
                }`}>
                  {activeAccount ? activeAccount.initials : '?'}
                </div>
                <div className="text-left">
                  <p className="text-xs font-semibold text-charcoal-900 leading-tight">
                    {activeAccount ? activeAccount.name : 'Not signed in'}
                  </p>
                  <p className="text-[10px] text-charcoal-500">
                    {activeAccount ? activeAccount.role : 'Select Account'}
                  </p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-charcoal-500 ml-1" />
              </button>

              {showAccountDropdown && (
                <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-sand-200 rounded-xl shadow-lg z-50 py-1">
                  <div className="px-3 py-2 border-b border-sand-100 mb-1">
                    <p className="text-xs font-bold text-charcoal-500 uppercase tracking-wider">Switch Account</p>
                  </div>
                  {accounts.map(acc => (
                    <button
                      key={acc.id}
                      onClick={() => { onSwitchAccount(acc.id); setShowAccountDropdown(false); }}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${acc.id === activeAccountId ? 'bg-sage-50 text-sage-800' : 'hover:bg-sand-50 text-charcoal-700'}`}
                    >
                      <div className="w-6 h-6 rounded-full bg-sand-200 text-charcoal-900 font-bold text-[10px] flex items-center justify-center border border-sand-300 shrink-0">
                        {acc.initials}
                      </div>
                      <span className="truncate">{acc.name}</span>
                    </button>
                  ))}
                  <div className="border-t border-sand-100 mt-1 pt-1 space-y-0.5">
                    <button 
                      onClick={() => { onManageAccounts(); setShowAccountDropdown(false); }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-charcoal-600 hover:bg-sand-50 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5" /> Manage Accounts
                    </button>
                    {activeAccount && (
                      <button 
                        onClick={() => { onSignOut(); setShowAccountDropdown(false); }}
                        className="w-full text-left px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 flex items-center gap-1.5 cursor-pointer border-t border-sand-100"
                      >
                        <LogOut className="w-3.5 h-3.5 text-rose-600" /> Sign Out
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Google Sheets Target Badge */}
            <div
              onClick={onConnectSheetsClick}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                googleSheetsConnected
                  ? 'bg-sage-50 border-sage-200 text-sage-800 hover:bg-sage-100'
                  : 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
              }`}
            >
              <FileSpreadsheet className={`w-4 h-4 ${googleSheetsConnected ? 'text-sage-600' : 'text-amber-600'}`} />
              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-charcoal-900">Boon Huat AP Master Data</span>
                  <span className={`w-2 h-2 rounded-full ${googleSheetsConnected ? 'bg-sage-500 animate-pulse' : 'bg-amber-500'}`}></span>
                </div>
                <p className="text-[10px] text-charcoal-600 font-medium">
                  Tab: <span className="underline decoration-sage-400 font-bold">Invoice Ledger</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* View Switching Tabs */}
        <div className="flex items-center justify-between pt-2 pb-0">
          <nav className="flex space-x-1 overflow-x-auto" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('intake')}
              className={`flex items-center gap-2 px-4 py-2.5 font-semibold text-sm rounded-t-lg border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'intake'
                  ? 'border-sage-600 text-sage-700 bg-sage-50/80'
                  : 'border-transparent text-charcoal-500 hover:text-charcoal-900 hover:bg-sand-100/50'
              }`}
            >
              <FileText className="w-4 h-4 text-sage-600" />
              <span>1. Invoice Upload &amp; Verification</span>
            </button>

            <button
              onClick={() => setActiveTab('database')}
              className={`flex items-center gap-2 px-4 py-2.5 font-semibold text-sm rounded-t-lg border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'database'
                  ? 'border-sage-600 text-sage-700 bg-sage-50/80'
                  : 'border-transparent text-charcoal-500 hover:text-charcoal-900 hover:bg-sand-100/50'
              }`}
            >
              <Database className="w-4 h-4 text-charcoal-500" />
              <span>2. AP Database Sheet ({savedCount})</span>
              {savedCount > 0 && (
                <span className="ml-1 bg-sage-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {savedCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('manage-ledger')}
              className={`flex items-center gap-2 px-4 py-2.5 font-semibold text-sm rounded-t-lg border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'manage-ledger'
                  ? 'border-sage-600 text-sage-700 bg-sage-50/80'
                  : 'border-transparent text-charcoal-500 hover:text-charcoal-900 hover:bg-sand-100/50'
              }`}
            >
              <FileEdit className="w-4 h-4 text-amber-600" />
              <span>3. Manage Ledger</span>
            </button>
          </nav>

          <div className="hidden lg:flex items-center gap-2 text-xs text-charcoal-500 pb-2">
            <ShieldCheck className="w-4 h-4 text-sage-600" />
            <span>AI Multimodal Vision Active &bull; Gemini 3.6 Flash</span>
          </div>
        </div>
      </div>
    </header>
  );
};
