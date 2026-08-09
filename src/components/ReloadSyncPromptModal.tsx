import React from 'react';
import { RefreshCw, AlertTriangle, FileSpreadsheet } from 'lucide-react';

interface ReloadSyncPromptModalProps {
  isOpen: boolean;
  onSyncNow: () => void;
  onSkip: () => void;
  isSyncing: boolean;
  errorMessage?: string | null;
}

export const ReloadSyncPromptModal: React.FC<ReloadSyncPromptModalProps> = ({
  isOpen,
  onSyncNow,
  onSkip,
  isSyncing,
  errorMessage,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-charcoal-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-sand-300 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-sage-100 border border-sage-200 text-sage-700 flex items-center justify-center shrink-0">
            <RefreshCw className={`w-6 h-6 ${isSyncing ? 'animate-spin' : ''}`} />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-extrabold text-charcoal-900 flex items-center gap-2">
              🔄 Sync with Google Sheets?
            </h3>
            <p className="text-xs text-charcoal-600 font-medium leading-relaxed">
              Reconnecting ensures you're working with the latest data from{' '}
              <strong className="text-charcoal-900 font-bold">Boon Huat AP Master Data</strong> — other apps or teammates may have made changes since your last session.
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="bg-rose-50 border border-rose-300 rounded-xl p-3 flex items-start gap-3 text-rose-900 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Google Sheets Sync Failed</p>
              <p className="text-rose-700 mt-0.5">{errorMessage}</p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2 border-t border-sand-100">
          <button
            type="button"
            onClick={onSkip}
            disabled={isSyncing}
            className="w-full sm:w-auto px-4 py-2.5 bg-sand-100 hover:bg-sand-200 text-charcoal-700 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={onSyncNow}
            disabled={isSyncing}
            className="w-full sm:w-auto px-5 py-2.5 bg-sage-600 hover:bg-sage-700 active:bg-sage-800 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing Data...' : errorMessage ? 'Re-authenticate & Sync' : 'Sync Now'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
