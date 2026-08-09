import React from 'react';
import { Database, CheckCircle2, FileSpreadsheet, AlertTriangle, RefreshCw } from 'lucide-react';

interface GoogleSheetsConnectProps {
  recordCount: number;
  onViewDatabaseClick: () => void;
  isConnected?: boolean;
  onConnectClick?: () => void;
  isConnecting?: boolean;
  hasSyncedThisSession?: boolean;
  onSyncNowClick?: () => void;
  lastSyncedTime?: string | null;
}

export const GoogleSheetsConnect: React.FC<GoogleSheetsConnectProps> = ({
  recordCount,
  onViewDatabaseClick,
  isConnected = true,
  onConnectClick,
  isConnecting = false,
  hasSyncedThisSession = true,
  onSyncNowClick,
  lastSyncedTime,
}) => {
  if (!isConnected) {
    return (
      <div className="bg-rose-50 border-2 border-rose-500 rounded-2xl p-4 text-rose-900 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <AlertTriangle className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-black text-rose-900 tracking-tight">
              Google Sheets connection lost. Please reconnect to Google Sheets.
            </h3>
            <p className="text-xs text-rose-700 font-medium mt-0.5">
              Cannot sync to <strong className="underline font-bold">Boon Huat AP Master Data → Invoice Ledger</strong> until re-authenticated.
            </p>
          </div>
        </div>

        {onConnectClick && (
          <button
            type="button"
            onClick={onConnectClick}
            disabled={isConnecting}
            className="w-full sm:w-auto px-5 py-2.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
          >
            <Database className="w-4 h-4" />
            <span>{isConnecting ? 'Connecting...' : 'Reconnect Google Sheets'}</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-sand-100 border border-sand-200 rounded-2xl p-4 text-charcoal-900 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-sage-600 text-white flex items-center justify-center shrink-0 shadow-xs">
          <FileSpreadsheet className="w-5 h-5" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-charcoal-900">AP Master Data Destination</h3>
            <span className="bg-sage-100 text-sage-800 border border-sage-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-sage-600" />
              Connected
            </span>
            {!hasSyncedThisSession ? (
              <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                ⚠ Not synced this session
              </span>
            ) : (
              lastSyncedTime && (
                <span className="text-[10px] text-charcoal-500 font-medium">
                  Synced: {lastSyncedTime}
                </span>
              )
            )}
          </div>
          <p className="text-xs text-charcoal-600 font-medium mt-0.5">
            Connected to: <strong className="text-charcoal-900 font-bold">Boon Huat AP Master Data</strong> &rarr; <strong className="text-sage-800 font-bold underline">Invoice Ledger</strong>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
        {(onSyncNowClick || onConnectClick) && (
          <button
            type="button"
            onClick={onSyncNowClick || onConnectClick}
            disabled={isConnecting}
            className={`px-3.5 py-2 font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
              !hasSyncedThisSession
                ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                : 'bg-white hover:bg-sand-50 text-charcoal-800 border border-sand-300 shadow-2xs'
            }`}
            title="Perform fresh sync or reconnect to Google Sheets"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin' : ''}`} />
            <span>{!hasSyncedThisSession ? 'Sync Now' : 'Sync / Reconnect'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onViewDatabaseClick}
          className="px-3.5 py-2 bg-sage-600 hover:bg-sage-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
        >
          <Database className="w-4 h-4" />
          <span>View Invoice Ledger ({recordCount})</span>
        </button>
      </div>
    </div>
  );
};



