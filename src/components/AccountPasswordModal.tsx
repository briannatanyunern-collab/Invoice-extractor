import React, { useState, useEffect } from 'react';
import { UserAccount } from '../types';
import { KeyRound, AlertCircle, X } from 'lucide-react';

interface AccountPasswordModalProps {
  targetAccount: UserAccount | null;
  onConfirm: (account: UserAccount) => void;
  onCancel: () => void;
}

export const AccountPasswordModal: React.FC<AccountPasswordModalProps> = ({
  targetAccount,
  onConfirm,
  onCancel,
}) => {
  const [passwordInput, setPasswordInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setPasswordInput('');
    setErrorMessage(null);
  }, [targetAccount]);

  if (!targetAccount) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (passwordInput === targetAccount.password) {
      onConfirm(targetAccount);
    } else {
      setErrorMessage('Incorrect password');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-charcoal-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-sand-300 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 relative">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-charcoal-400 hover:text-charcoal-700 p-1 rounded-lg transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-sage-100 border border-sage-300 text-sage-800 font-extrabold text-xs flex items-center justify-center shrink-0">
            {targetAccount.initials}
          </div>
          <div>
            <h3 className="text-base font-extrabold text-charcoal-900">
              Switch to {targetAccount.name}?
            </h3>
            <p className="text-xs text-charcoal-500 font-medium">{targetAccount.role}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-charcoal-700 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-sage-600" />
              <span>Enter password:</span>
            </label>
            <input
              type="password"
              autoFocus
              value={passwordInput}
              onChange={(e) => {
                setPasswordInput(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="Enter account password"
              className={`w-full px-3.5 py-2.5 text-sm bg-cream-50 border rounded-xl focus:ring-2 focus:bg-white text-charcoal-900 font-mono transition-all ${
                errorMessage
                  ? 'border-rose-400 focus:ring-rose-400/30'
                  : 'border-sand-300 focus:ring-sage-500/30 focus:border-sage-500'
              }`}
            />
            {errorMessage && (
              <p className="text-xs font-bold text-rose-600 flex items-center gap-1 mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMessage}</span>
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-sand-100">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-sand-100 hover:bg-sand-200 text-charcoal-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-sage-600 hover:bg-sage-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
